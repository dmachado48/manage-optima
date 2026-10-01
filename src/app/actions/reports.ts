"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { remainingHours } from "@/lib/billing";
import { monthBounds } from "@/lib/dates";
import { draftMonthlyReportPt } from "@/lib/resume";
import { prisma } from "@/lib/prisma";

export async function generateMonthlyReport(formData: FormData) {
  await requireAdmin();
  const clientId = String(formData.get("clientId") ?? "");
  const year = Number(formData.get("year") ?? new Date().getFullYear());
  const month = Number(formData.get("month") ?? new Date().getMonth() + 1);

  if (!clientId) throw new Error("Cliente obrigatório");

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new Error("Cliente não encontrado");

  const { start, end } = monthBounds(year, month);

  const interventions = await prisma.intervention.findMany({
    where: {
      clientId,
      performedAt: { gte: start, lte: end },
    },
    include: {
      client: { select: { name: true } },
      request: { select: { title: true } },
    },
    orderBy: { performedAt: "asc" },
  });

  const contract = await prisma.contract.findFirst({
    where: { clientId, active: true },
  });

  const mapped = interventions.map((i) => ({
    clientName: i.client.name,
    minutes: i.minutes,
    note: i.note,
    performedAt: i.performedAt,
    requestTitle: i.request.title,
  }));

  const body = draftMonthlyReportPt({
    clientName: client.name,
    year,
    month,
    interventions: mapped,
    hoursUsed: contract ? Number(contract.hoursUsed) : null,
    hoursRemaining: contract
      ? remainingHours(Number(contract.hoursTotal), Number(contract.hoursUsed))
      : null,
  });

  const batchCode = `MES-${year}${String(month).padStart(2, "0")}-${clientId.slice(-4).toUpperCase()}-${Date.now().toString(36).slice(-4).toUpperCase()}`;

  const report = await prisma.report.create({
    data: {
      clientId,
      batchCode,
      periodStart: start,
      periodEnd: end,
      body,
      published: false,
    },
  });

  revalidatePath("/maintenance");
  revalidatePath("/maintenance/reports");
  return { id: report.id, batchCode: report.batchCode, body };
}

export async function publishReport(reportId: string) {
  await requireAdmin();
  const report = await prisma.report.update({
    where: { id: reportId },
    data: { published: true },
    include: { client: { select: { kanbanShareToken: true } } },
  });
  revalidatePath("/maintenance");
  revalidatePath(`/k/${report.client.kanbanShareToken}`);
}
