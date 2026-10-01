"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { parseClientRelation } from "@/lib/clients";
import { setClientRelation } from "@/lib/clients-db";
import { prisma } from "@/lib/prisma";
import type { ContractType } from "@prisma/client";

function parseClientFields(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Nome obrigatório");

  return {
    name,
    email: String(formData.get("email") ?? "").trim() || null,
    domain: String(formData.get("domain") ?? "").trim() || null,
    contactName: String(formData.get("contactName") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
    relation: parseClientRelation(formData.get("relation")),
  };
}

function revalidateClient(clientId?: string) {
  revalidatePath("/maintenance");
  revalidatePath("/clients");
  revalidatePath("/");
  revalidatePath("/pipeline");
  if (clientId) {
    revalidatePath(`/clients/${clientId}`);
    revalidatePath(`/clients/${clientId}/trabalhos`);
  }
}

export async function createClient(formData: FormData) {
  await requireAdmin();
  const { relation, ...data } = parseClientFields(formData);

  const created = await prisma.client.create({ data });
  await setClientRelation(created.id, relation);

  revalidateClient();
}

export async function updateClient(clientId: string, formData: FormData) {
  await requireAdmin();
  const { relation, ...data } = parseClientFields(formData);

  await prisma.client.update({
    where: { id: clientId },
    data,
  });
  await setClientRelation(clientId, relation);

  revalidateClient(clientId);
}

export async function setClientActive(clientId: string, active: boolean) {
  await requireAdmin();

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new Error("Cliente não encontrado");

  await prisma.client.update({
    where: { id: clientId },
    data: { active },
  });

  revalidateClient(clientId);
}

export async function deleteClient(clientId: string) {
  await requireAdmin();

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          interventions: true,
          requests: true,
          projects: true,
          contracts: true,
        },
      },
    },
  });
  if (!client) throw new Error("Cliente não encontrado");

  await prisma.client.delete({ where: { id: clientId } });

  revalidateClient();
}

export async function createContract(formData: FormData) {
  await requireAdmin();
  const clientId = String(formData.get("clientId") ?? "");
  const type = String(formData.get("type") ?? "") as ContractType;
  const hoursTotal = Number(formData.get("hoursTotal") ?? 0);
  const hourlyRateRaw = String(formData.get("hourlyRate") ?? "").trim();
  const monthlyFeeRaw = String(formData.get("monthlyFeeEur") ?? "").trim();
  const jobDescription =
    String(formData.get("jobDescription") ?? "").trim() || null;
  const startsRaw = String(formData.get("startsAt") ?? "").trim();
  const endsRaw = String(formData.get("endsAt") ?? "").trim();

  if (!clientId || !["retainer", "pack", "hourly"].includes(type)) {
    throw new Error("Dados do contrato inválidos");
  }

  const startsAt = startsRaw
    ? new Date(`${startsRaw}T12:00:00.000Z`)
    : new Date();
  const endsAt = endsRaw ? new Date(`${endsRaw}T12:00:00.000Z`) : null;
  if (endsAt && endsAt < startsAt) {
    throw new Error("Data de fim anterior ao início");
  }

  // Deactivate other active contracts for this client (one active at a time)
  await prisma.contract.updateMany({
    where: { clientId, active: true },
    data: { active: false, endsAt: new Date() },
  });

  const { currentPeriodKey, DEFAULT_AVENCA_JOB_MD } = await import(
    "@/lib/billing"
  );

  // Create with fields every Prisma Client generation knows, then patch avença columns via SQL
  // (Turbopack can keep a stale DMMF that rejects monthlyFeeEur / jobDescription / periodKey).
  const created = await prisma.contract.create({
    data: {
      clientId,
      type,
      hoursTotal,
      hoursUsed: 0,
      hourlyRate: hourlyRateRaw ? hourlyRateRaw : null,
      active: true,
      startsAt,
      endsAt,
    },
  });

  if (type === "retainer") {
    const fee = monthlyFeeRaw ? Number(monthlyFeeRaw) : null;
    const job = jobDescription || DEFAULT_AVENCA_JOB_MD;
    const period = currentPeriodKey();
    await prisma.$executeRaw`
      UPDATE \`Contract\`
      SET
        \`monthlyFeeEur\` = ${fee},
        \`jobDescription\` = ${job},
        \`periodKey\` = ${period}
      WHERE \`id\` = ${created.id}
    `;
  }

  revalidateClient(clientId);
  revalidatePath("/settings");
}

export async function updateContract(contractId: string, formData: FormData) {
  await requireAdmin();
  const type = String(formData.get("type") ?? "") as ContractType;
  const hoursTotal = Number(formData.get("hoursTotal") ?? 0);
  const hoursUsed = Number(formData.get("hoursUsed") ?? 0);
  const hourlyRateRaw = String(formData.get("hourlyRate") ?? "").trim();
  const monthlyFeeRaw = String(formData.get("monthlyFeeEur") ?? "").trim();
  const jobDescriptionRaw = formData.get("jobDescription");
  const jobDescription =
    jobDescriptionRaw != null
      ? String(jobDescriptionRaw).trim() || null
      : undefined;
  const active = String(formData.get("active") ?? "true") === "true";
  const startsRaw = String(formData.get("startsAt") ?? "").trim();
  const endsRaw = String(formData.get("endsAt") ?? "").trim();

  if (!["retainer", "pack", "hourly"].includes(type)) {
    throw new Error("Tipo de contrato inválido");
  }

  const existing = await prisma.contract.findUnique({
    where: { id: contractId },
  });
  if (!existing) throw new Error("Contrato não encontrado");

  if (active && !existing.active) {
    await prisma.contract.updateMany({
      where: { clientId: existing.clientId, active: true },
      data: { active: false, endsAt: new Date() },
    });
  }

  const { currentPeriodKey } = await import("@/lib/billing");
  const startsAt = startsRaw
    ? new Date(`${startsRaw}T12:00:00.000Z`)
    : (existing.startsAt ?? new Date());
  let endsAt = endsRaw ? new Date(`${endsRaw}T12:00:00.000Z`) : null;
  if (!active && !endsAt) {
    endsAt = existing.endsAt ?? new Date();
  }
  if (endsAt && endsAt < startsAt) {
    throw new Error("Data de fim anterior ao início");
  }
  const hourlyRate = hourlyRateRaw ? Number(hourlyRateRaw) : null;

  await prisma.contract.update({
    where: { id: contractId },
    data: {
      type,
      hoursTotal,
      hoursUsed,
      hourlyRate,
      active,
      endsAt,
      startsAt,
    },
  });

  const fee =
    type === "retainer" && monthlyFeeRaw ? Number(monthlyFeeRaw) : null;
  const job =
    type === "retainer"
      ? (jobDescription !== undefined ? jobDescription : null)
      : null;
  const period = type === "retainer" ? currentPeriodKey() : null;

  await prisma.$executeRaw`
    UPDATE \`Contract\`
    SET
      \`monthlyFeeEur\` = ${fee},
      \`jobDescription\` = ${job},
      \`periodKey\` = ${period}
    WHERE \`id\` = ${contractId}
  `;

  revalidateClient(existing.clientId);
  revalidatePath("/settings");
}

export async function deactivateContract(contractId: string) {
  await requireAdmin();
  const existing = await prisma.contract.findUnique({
    where: { id: contractId },
  });
  if (!existing) throw new Error("Contrato não encontrado");

  await prisma.contract.update({
    where: { id: contractId },
    data: { active: false, endsAt: new Date() },
  });

  revalidateClient(existing.clientId);
  revalidatePath("/settings");
}

/** Reset avença hours when calendar month changed (non-rollover). */
export async function syncRetainerPeriods() {
  await requireAdmin();
  const { syncRetainerPeriodsInDb } = await import("@/lib/billing");
  await syncRetainerPeriodsInDb();
}
