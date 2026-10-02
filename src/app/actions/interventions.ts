"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  assertCloseableBilling,
  currentPeriodKey,
  hoursFromMinutes,
  shouldDeduct,
} from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import type { InterventionBillingStatus, Prisma } from "@prisma/client";

export type QuickLogInput = {
  clientId: string;
  requestId?: string | null;
  minutes?: number | null;
  /** Fixed price agreed with the client (EUR). */
  agreedAmountEur?: number | null;
  note?: string | null;
  createAdHocTitle?: string;
  billingStatus?: InterventionBillingStatus | null;
};

type Tx = Prisma.TransactionClient;

async function ensureRetainerPeriod(
  tx: Tx,
  contract: {
    id: string;
    type: "retainer" | "pack" | "hourly";
    periodKey?: string | null;
    hoursUsed: { toString(): string } | number;
  },
) {
  if (contract.type !== "retainer") return contract;
  const key = currentPeriodKey();
  // Raw SQL — avoids stale Prisma DMMF rejecting `periodKey`
  await tx.$executeRaw`
    UPDATE \`Contract\`
    SET
      \`hoursUsed\` = CASE
        WHEN \`periodKey\` IS NULL OR \`periodKey\` <> ${key} THEN 0
        ELSE \`hoursUsed\`
      END,
      \`billedAt\` = CASE
        WHEN \`periodKey\` IS NULL OR \`periodKey\` <> ${key} THEN NULL
        ELSE \`billedAt\`
      END,
      \`periodKey\` = ${key}
    WHERE \`id\` = ${contract.id}
  `;
  const refreshed = await tx.contract.findUnique({
    where: { id: contract.id },
  });
  return refreshed ?? contract;
}

function revalidateInterventionPaths(clientId?: string) {
  revalidatePath("/");
  revalidatePath("/maintenance");
  revalidatePath("/settings");
  revalidatePath("/clients");
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

export async function logIntervention(input: QuickLogInput) {
  const session = await requireAdmin();
  const { minutes, agreedAmountEur } = assertCloseableBilling({
    minutes: input.minutes,
    agreedAmountEur: input.agreedAmountEur,
  });

  const client = await prisma.client.findUnique({
    where: { id: input.clientId },
  });
  if (!client) throw new Error("Cliente não encontrado");

  let requestId = input.requestId ?? null;

  if (!requestId) {
    const title =
      input.createAdHocTitle?.trim() ||
      input.note?.trim() ||
      "Intervenção avulsa";
    const request = await prisma.request.create({
      data: {
        clientId: input.clientId,
        title,
        description: input.note ?? null,
        source: "ad_hoc",
        status: "in_progress",
      },
    });
    requestId = request.id;
  }

  const intervention = await prisma.$transaction(async (tx) => {
    const found = await tx.contract.findFirst({
      where: { clientId: input.clientId, active: true },
    });

    const active = found ? await ensureRetainerPeriod(tx, found) : null;

    let billingStatus: InterventionBillingStatus =
      input.billingStatus ?? "billable";
    if (!input.billingStatus) {
      // Fixed agreed € is always billable (not deducted from pack/avença).
      if (agreedAmountEur != null && minutes <= 0) {
        billingStatus = "billable";
      } else if (active && shouldDeduct(active.type) && minutes > 0) {
        billingStatus = "included";
      } else {
        billingStatus = "billable";
      }
    }

    const created = await tx.intervention.create({
      data: {
        clientId: input.clientId,
        requestId: requestId!,
        minutes,
        agreedAmountEur:
          agreedAmountEur != null ? agreedAmountEur.toFixed(2) : null,
        note: input.note?.trim() || null,
        billingStatus,
        performedAt: new Date(),
        createdById: session.user.id,
      },
    });

    if (
      billingStatus === "included" &&
      active &&
      shouldDeduct(active.type) &&
      minutes > 0
    ) {
      await tx.contract.update({
        where: { id: active.id },
        data: {
          hoursUsed: Number(active.hoursUsed) + hoursFromMinutes(minutes),
        },
      });
    }

    return created;
  });

  revalidateInterventionPaths(input.clientId);
  return { id: intervention.id, requestId };
}

export async function logInterventionForm(formData: FormData) {
  const rawStatus = String(formData.get("billingStatus") ?? "").trim();
  const billingStatus = (
    ["included", "billable", "billed", "non_billable"] as const
  ).includes(rawStatus as InterventionBillingStatus)
    ? (rawStatus as InterventionBillingStatus)
    : null;

  await logIntervention({
    clientId: String(formData.get("clientId") ?? ""),
    requestId: String(formData.get("requestId") ?? "") || null,
    minutes: Number(formData.get("minutes") ?? 0),
    agreedAmountEur: (() => {
      const raw = String(formData.get("agreedAmountEur") ?? "").trim();
      if (!raw) return null;
      return Number(raw);
    })(),
    note: String(formData.get("note") ?? "") || null,
    createAdHocTitle: String(formData.get("adHocTitle") ?? "") || undefined,
    billingStatus,
  });
}

export async function setInterventionBillingStatus(
  interventionId: string,
  status: InterventionBillingStatus,
) {
  await requireAdmin();
  if (
    !["included", "billable", "billed", "non_billable"].includes(status)
  ) {
    throw new Error("Estado de faturação inválido");
  }

  const updated = await prisma.intervention.update({
    where: { id: interventionId },
    data: {
      billingStatus: status,
      billedAt: status === "billed" ? new Date() : null,
    },
  });

  revalidateInterventionPaths(updated.clientId);
}

export async function setInterventionBillingStatusForm(
  interventionId: string,
  formData: FormData,
) {
  const status = String(
    formData.get("billingStatus") ?? "",
  ) as InterventionBillingStatus;
  await setInterventionBillingStatus(interventionId, status);
}

/**
 * Batch: create a client report from selected interventions and optionally
 * mark them as billed in the same step. Assigns a batchCode (lote) to the
 * report and links interventions via reportId.
 */
export async function billSelectedInterventions(input: {
  interventionIds: string[];
  markBilled?: boolean;
}) {
  await requireAdmin();
  const ids = [...new Set(input.interventionIds.filter(Boolean))];
  if (ids.length === 0) throw new Error("Seleciona pelo menos uma intervenção");

  const rows = await prisma.intervention.findMany({
    where: { id: { in: ids } },
    include: {
      client: { select: { id: true, name: true } },
      request: { select: { title: true } },
    },
    orderBy: { performedAt: "asc" },
  });

  if (rows.length === 0) throw new Error("Intervenções não encontradas");

  const clientIds = new Set(rows.map((r) => r.clientId));
  if (clientIds.size > 1) {
    throw new Error(
      "Seleciona intervenções de um único cliente para gerar o relatório.",
    );
  }

  const client = rows[0]!.client;
  const markBilled = input.markBilled !== false;
  const batchCode = await nextBillingBatchCode();

  const { draftSelectionReportPt } = await import("@/lib/resume");
  const body = draftSelectionReportPt({
    clientName: client.name,
    markBilled,
    batchCode,
    interventions: rows.map((i) => ({
      clientName: i.client.name,
      minutes: i.minutes,
      agreedAmountEur:
        i.agreedAmountEur != null ? Number(i.agreedAmountEur) : null,
      note: i.note,
      performedAt: i.performedAt,
      requestTitle: i.request.title,
    })),
  });

  const periodStart = rows[0]!.performedAt;
  const periodEnd = rows[rows.length - 1]!.performedAt;
  const rowIds = rows.map((r) => r.id);
  const totalMinutes = rows.reduce((s, r) => s + r.minutes, 0);
  const totalAgreedEur = rows.reduce(
    (s, r) => s + (r.agreedAmountEur != null ? Number(r.agreedAmountEur) : 0),
    0,
  );

  const report = await prisma.$transaction(async (tx) => {
    const created = await tx.report.create({
      data: {
        clientId: client.id,
        batchCode,
        periodStart,
        periodEnd,
        body,
        published: false,
      },
    });

    await tx.intervention.updateMany({
      where: { id: { in: rowIds } },
      data: {
        reportId: created.id,
        ...(markBilled
          ? { billingStatus: "billed" as const, billedAt: new Date() }
          : {}),
      },
    });

    return created;
  });

  revalidateInterventionPaths(client.id);
  revalidatePath("/maintenance");
  revalidatePath("/settings");
  return {
    reportId: report.id,
    batchCode: report.batchCode ?? report.id,
    body,
    clientId: client.id,
    clientName: client.name,
    count: rows.length,
    totalMinutes,
    totalAgreedEur,
  };
}

async function nextBillingBatchCode(): Promise<string> {
  const stamp = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replaceAll("-", "");
  for (let attempt = 0; attempt < 8; attempt++) {
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    const code = `FAT-${stamp}-${suffix}`;
    const exists = await prisma.report.findUnique({
      where: { batchCode: code },
      select: { id: true },
    });
    if (!exists) return code;
  }
  return `FAT-${stamp}-${Date.now().toString(36).toUpperCase()}`;
}

export async function markInterventionsBilled(interventionIds: string[]) {
  return setInterventionsBillingStatus(interventionIds, "billed");
}

export async function setInterventionsBillingStatus(
  interventionIds: string[],
  status: InterventionBillingStatus,
) {
  await requireAdmin();
  const ids = [...new Set(interventionIds.filter(Boolean))];
  if (ids.length === 0) throw new Error("Seleciona pelo menos uma intervenção");
  if (
    !["included", "billable", "billed", "non_billable"].includes(status)
  ) {
    throw new Error("Estado de faturação inválido");
  }

  const rows = await prisma.intervention.findMany({
    where: { id: { in: ids } },
    select: { id: true, clientId: true },
  });

  await prisma.intervention.updateMany({
    where: { id: { in: rows.map((r) => r.id) } },
    data: {
      billingStatus: status,
      billedAt: status === "billed" ? new Date() : null,
    },
  });

  const clientIds = [...new Set(rows.map((r) => r.clientId))];
  for (const clientId of clientIds) {
    revalidateInterventionPaths(clientId);
  }

  return { count: rows.length };
}
