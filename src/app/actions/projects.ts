"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { BuildTaskStatus, ProjectStatus } from "@prisma/client";

function revalidateProject(projectId?: string) {
  revalidatePath("/projects");
  revalidatePath("/commercial");
  revalidatePath("/");
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

export async function createBuildTask(formData: FormData) {
  await requireAdmin();
  const projectId = String(formData.get("projectId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const estimatedHours = Number(formData.get("estimatedHours") ?? 0);
  if (!projectId || !title) throw new Error("Projeto e título obrigatórios");

  const count = await prisma.buildTask.count({ where: { projectId } });
  await prisma.buildTask.create({
    data: {
      projectId,
      title,
      sortOrder: count,
      estimatedMinutes:
        estimatedHours > 0 ? Math.round(estimatedHours * 60) : null,
    },
  });
  revalidateProject(projectId);
}

export async function updateBuildTaskStatus(
  taskId: string,
  status: BuildTaskStatus,
) {
  await requireAdmin();
  const task = await prisma.buildTask.update({
    where: { id: taskId },
    data: { status },
  });
  revalidateProject(task.projectId);
}

export async function updateBuildTaskStatusForm(
  taskId: string,
  formData: FormData,
) {
  const status = String(formData.get("status") ?? "") as BuildTaskStatus;
  if (
    !["todo", "in_progress", "waiting_on_client", "done"].includes(status)
  ) {
    throw new Error("Estado inválido");
  }
  await updateBuildTaskStatus(taskId, status);
}

export async function updateBuildTaskHours(formData: FormData) {
  await requireAdmin();
  const taskId = String(formData.get("taskId") ?? "");
  const estimatedHours = Number(formData.get("estimatedHours") ?? 0);
  const spentHours = Number(formData.get("spentHours") ?? 0);
  if (!taskId) throw new Error("Tarefa inválida");

  const task = await prisma.buildTask.update({
    where: { id: taskId },
    data: {
      estimatedMinutes:
        estimatedHours > 0 ? Math.round(estimatedHours * 60) : null,
      spentMinutes: Math.max(0, Math.round(spentHours * 60)),
    },
  });
  revalidateProject(task.projectId);
}

export async function updateProjectDetails(formData: FormData) {
  await requireAdmin();
  const projectId = String(formData.get("projectId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "").trim();
  if (!projectId || !title) throw new Error("Dados incompletos");
  if (!clientId) throw new Error("Cliente obrigatório");

  const deadlineRaw = String(formData.get("deadline") ?? "").trim();
  const budgetRaw = String(formData.get("budgetEur") ?? "").trim();
  const rateRaw = String(formData.get("costRateEur") ?? "").trim();

  const existing = await prisma.project.findUnique({
    where: { id: projectId },
    select: { clientId: true },
  });
  if (!existing) throw new Error("Projeto não encontrado");

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, active: true },
  });
  if (!client) throw new Error("Cliente inválido");
  if (!client.active && client.id !== existing.clientId) {
    throw new Error("Cliente inativo");
  }

  await prisma.project.update({
    where: { id: projectId },
    data: {
      title,
      clientId,
      deadline: deadlineRaw
        ? new Date(`${deadlineRaw}T12:00:00.000Z`)
        : null,
      budgetEur: budgetRaw ? Number(budgetRaw) : null,
      costRateEur: rateRaw ? Number(rateRaw) : null,
    },
  });

  revalidateProject(projectId);
  revalidatePath(`/clients/${clientId}`);
  if (existing.clientId !== clientId) {
    revalidatePath(`/clients/${existing.clientId}`);
  }
}

export async function setProjectStatusFromProjects(
  projectId: string,
  formData: FormData,
) {
  await requireAdmin();
  const status = String(formData.get("status") ?? "") as ProjectStatus;
  if (
    ![
      "intake",
      "scoping",
      "proposal_sent",
      "approved",
      "in_build",
      "delivered",
      "cancelled",
    ].includes(status)
  ) {
    throw new Error("Estado inválido");
  }

  await prisma.project.update({
    where: { id: projectId },
    data: {
      status,
      ...(status === "delivered" ? {} : { billedAt: null }),
    },
  });
  revalidateProject(projectId);
}

export async function markProjectDelivered(projectId: string) {
  await requireAdmin();
  await prisma.project.update({
    where: { id: projectId },
    data: { status: "delivered" },
  });
  revalidateProject(projectId);
}

export async function markProjectBilledFromProjects(projectId: string) {
  await requireAdmin();
  await prisma.project.update({
    where: { id: projectId },
    data: { billedAt: new Date(), status: "delivered" },
  });
  revalidateProject(projectId);
}
