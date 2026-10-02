"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { assembleDailyJobs, type DailyJob } from "@/lib/daily";
import { endOfDay, startOfDay } from "@/lib/dates";
import { draftDayResumePt } from "@/lib/resume";
import { prisma } from "@/lib/prisma";

export async function getDailyJobs(date = new Date()): Promise<DailyJob[]> {
  await requireAdmin();
  const day = startOfDay(date);

  const [requests, tasks, proposals, planItems] = await Promise.all([
    prisma.request.findMany({
      where: {
        status: { in: ["in_progress", "waiting_on_client"] },
      },
      select: { id: true, title: true, status: true, clientId: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.buildTask.findMany({
      where: {
        status: { in: ["todo", "in_progress"] },
        project: { status: { in: ["approved", "in_build"] } },
      },
      select: { id: true, title: true, status: true, projectId: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      take: 20,
    }),
    prisma.proposal.findMany({
      where: { status: "sent" },
      select: { id: true, title: true, status: true },
      orderBy: { sentAt: "asc" },
    }),
    prisma.dailyPlanItem.findMany({
      where: { date: day },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return assembleDailyJobs({ requests, tasks, proposals, planItems });
}

export async function addManualPlanItem(formData: FormData) {
  await requireAdmin();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error("Título obrigatório");

  await prisma.dailyPlanItem.create({
    data: {
      date: startOfDay(),
      title,
    },
  });

  revalidatePath("/");
}

export async function togglePlanItem(planItemId: string, done: boolean) {
  await requireAdmin();
  await prisma.dailyPlanItem.update({
    where: { id: planItemId },
    data: { done },
  });
  revalidatePath("/");
}

export async function completeLinkedRequest(requestId: string) {
  await requireAdmin();
  throw new Error(
    "Para concluir, abre o pedido e regista tempo ou valor acordado (€).",
  );
}

export async function getDayResumeData(date = new Date()) {
  await requireAdmin();
  const from = startOfDay(date);
  const to = endOfDay(date);

  const interventions = await prisma.intervention.findMany({
    where: { performedAt: { gte: from, lte: to } },
    include: {
      client: { select: { name: true } },
      request: { select: { title: true } },
    },
    orderBy: { performedAt: "asc" },
  });

  const totalMinutes = interventions.reduce((s, i) => s + i.minutes, 0);
  const mapped = interventions.map((i) => ({
    id: i.id,
    clientName: i.client.name,
    minutes: i.minutes,
    note: i.note,
    performedAt: i.performedAt,
    requestTitle: i.request.title,
  }));

  const existing = await prisma.dailyResume.findUnique({
    where: { date: from },
  });

  const body = existing?.body ?? draftDayResumePt(mapped, totalMinutes);

  return { interventions: mapped, totalMinutes, body, saved: Boolean(existing) };
}

export async function saveDayResume(formData: FormData) {
  await requireAdmin();
  const body = String(formData.get("body") ?? "");
  const totalMinutes = Number(formData.get("totalMinutes") ?? 0);
  const date = startOfDay();

  await prisma.dailyResume.upsert({
    where: { date },
    create: { date, body, totalMinutes },
    update: { body, totalMinutes },
  });

  revalidatePath("/");
}
