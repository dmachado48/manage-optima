"use server";

import { revalidatePath } from "next/cache";
import type {
  InterventionBillingStatus,
  RequestCloseKind,
  RequestStatus,
  RequestSource,
} from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { assertCloseableBilling } from "@/lib/billing";
import { logIntervention } from "@/app/actions/interventions";
import { prisma } from "@/lib/prisma";

function revalidateRequest(clientId: string, projectId?: string | null) {
  revalidatePath("/maintenance");
  revalidatePath("/pipeline");
  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  revalidatePath(`/clients/${clientId}/trabalhos`);
  revalidatePath("/");
  if (projectId) {
    revalidatePath("/projects");
    revalidatePath(`/projects/${projectId}`);
  }
}

export async function createRequest(formData: FormData) {
  await requireAdmin();
  const clientId = String(formData.get("clientId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const source = (String(formData.get("source") ?? "manual") ||
    "manual") as RequestSource;

  if (!clientId || !title) throw new Error("Cliente e título obrigatórios");

  await prisma.request.create({
    data: {
      clientId,
      title,
      description,
      source,
      status: "requested",
    },
  });

  revalidateRequest(clientId);
}

export async function updateRequestStatus(
  requestId: string,
  status: RequestStatus,
) {
  await requireAdmin();

  if (status === "done") {
    // Soft conclude — stays in «Concluído» until finalized with time/€.
    const updated = await prisma.request.update({
      where: { id: requestId },
      data: {
        status: "done",
        closedAt: null,
      },
    });
    revalidateRequest(updated.clientId);
    return;
  }

  const updated = await prisma.request.update({
    where: { id: requestId },
    data: {
      status,
      // Reopening clears finalize stamp
      closedAt: null,
      closeKind: null,
    },
  });
  revalidateRequest(updated.clientId);
}

function parseCompletionDate(raw?: string | null): Date {
  if (!raw || !String(raw).trim()) return new Date();
  const s = String(raw).trim();
  // date input YYYY-MM-DD → noon Lisbon-ish UTC to avoid day shift
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s)
    ? new Date(`${s}T12:00:00.000Z`)
    : new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error("Data de conclusão inválida");
  return d;
}

export async function moveRequest(requestId: string, formData: FormData) {
  const status = String(formData.get("status") ?? "") as RequestStatus;
  if (
    !["requested", "in_progress", "waiting_on_client", "done"].includes(status)
  ) {
    throw new Error("Estado inválido");
  }
  await updateRequestStatus(requestId, status);
}

export type RequestCloseOptions = {
  requestId: string;
  clientId: string;
  title: string;
  status: RequestStatus;
  closeKind: RequestCloseKind | null;
  buildTask: {
    id: string;
    title: string;
    projectId: string;
    projectTitle: string;
  } | null;
  projects: {
    id: string;
    title: string;
    status: string;
    tasks: { id: string; title: string; status: string }[];
  }[];
};

export async function getRequestCloseOptions(
  requestId: string,
): Promise<RequestCloseOptions> {
  await requireAdmin();
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      clientId: true,
      title: true,
      status: true,
      closeKind: true,
      buildTask: {
        select: {
          id: true,
          title: true,
          projectId: true,
          project: { select: { title: true } },
        },
      },
    },
  });
  if (!request) throw new Error("Pedido não encontrado");

  const projects = await prisma.project.findMany({
    where: {
      clientId: request.clientId,
      status: { notIn: ["cancelled", "delivered"] },
    },
    select: {
      id: true,
      title: true,
      status: true,
      tasks: {
        where: { status: { not: "done" } },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, title: true, status: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return {
    requestId: request.id,
    clientId: request.clientId,
    title: request.title,
    status: request.status,
    closeKind: request.closeKind,
    buildTask: request.buildTask
      ? {
          id: request.buildTask.id,
          title: request.buildTask.title,
          projectId: request.buildTask.projectId,
          projectTitle: request.buildTask.project.title,
        }
      : null,
    projects,
  };
}

/**
 * Finalize a request: register time/€ with completion date, then leave
 * the pipeline «Concluído» column (`closedAt` set).
 */
export async function closeRequestAsHours(input: {
  requestId: string;
  minutes?: number | null;
  agreedAmountEur?: number | null;
  note?: string | null;
  billingStatus?: InterventionBillingStatus | null;
  /** Completion date (YYYY-MM-DD or ISO). Defaults to today. */
  completedAt?: string | null;
}) {
  await requireAdmin();
  const billing = assertCloseableBilling({
    minutes: input.minutes,
    agreedAmountEur: input.agreedAmountEur,
  });
  const closedAt = parseCompletionDate(input.completedAt);

  const request = await prisma.request.findUnique({
    where: { id: input.requestId },
    select: { id: true, clientId: true, title: true, status: true, closedAt: true },
  });
  if (!request) throw new Error("Pedido não encontrado");
  if (request.closedAt) throw new Error("Pedido já foi fechado e registado");

  const note =
    input.note?.trim() ||
    `Fecho do pedido: ${request.title}`.slice(0, 500);

  await logIntervention({
    clientId: request.clientId,
    requestId: request.id,
    minutes: billing.minutes,
    agreedAmountEur: billing.agreedAmountEur,
    note,
    billingStatus: input.billingStatus ?? null,
    performedAt: closedAt,
  });

  await prisma.request.update({
    where: { id: request.id },
    data: {
      status: "done",
      closeKind: "hours",
      buildTaskId: null,
      closedAt,
    },
  });

  revalidateRequest(request.clientId);
  return { ok: true as const, kind: "hours" as const, closedAt: closedAt.toISOString() };
}

/**
 * Close a support request by linking it to a project task AND registering
 * time or agreed € in the client intervention history for invoicing.
 */
export async function closeRequestAsProjectTask(input: {
  requestId: string;
  projectId: string;
  taskId?: string | null;
  newTaskTitle?: string | null;
  minutes?: number | null;
  agreedAmountEur?: number | null;
  markTaskDone?: boolean;
  note?: string | null;
  billingStatus?: InterventionBillingStatus | null;
  completedAt?: string | null;
}) {
  await requireAdmin();
  const billing = assertCloseableBilling({
    minutes: input.minutes,
    agreedAmountEur: input.agreedAmountEur,
  });
  const closedAt = parseCompletionDate(input.completedAt);

  const request = await prisma.request.findUnique({
    where: { id: input.requestId },
    select: {
      id: true,
      clientId: true,
      title: true,
      description: true,
      closedAt: true,
    },
  });
  if (!request) throw new Error("Pedido não encontrado");
  if (request.closedAt) throw new Error("Pedido já foi fechado e registado");

  const project = await prisma.project.findFirst({
    where: { id: input.projectId, clientId: request.clientId },
    select: { id: true, title: true },
  });
  if (!project) throw new Error("Projeto inválido para este cliente");

  const result = await prisma.$transaction(async (tx) => {
    let taskId = input.taskId?.trim() || null;
    let taskTitle = "";

    if (taskId) {
      const existing = await tx.buildTask.findFirst({
        where: { id: taskId, projectId: project.id },
        select: { id: true, title: true, spentMinutes: true },
      });
      if (!existing) throw new Error("Tarefa inválida para este projeto");
      taskTitle = existing.title;

      await tx.buildTask.update({
        where: { id: existing.id },
        data: {
          ...(billing.minutes > 0
            ? { spentMinutes: existing.spentMinutes + billing.minutes }
            : {}),
          ...(input.markTaskDone ? { status: "done" as const } : {}),
        },
      });
    } else {
      const title =
        input.newTaskTitle?.trim() || request.title.slice(0, 180) || "Tarefa";
      const count = await tx.buildTask.count({ where: { projectId: project.id } });
      const created = await tx.buildTask.create({
        data: {
          projectId: project.id,
          title,
          notes: request.description
            ? `Origem: pedido de suporte\n\n${request.description.slice(0, 4000)}`
            : `Origem: pedido de suporte «${request.title}»`,
          sortOrder: count,
          spentMinutes: billing.minutes,
          status: input.markTaskDone ? "done" : "todo",
        },
        select: { id: true, title: true },
      });
      taskId = created.id;
      taskTitle = created.title;
    }

    await tx.request.update({
      where: { id: request.id },
      data: {
        status: "done",
        closeKind: "project_task",
        buildTaskId: taskId,
        closedAt,
      },
    });

    return { taskId, taskTitle, projectId: project.id };
  });

  const note =
    input.note?.trim() ||
    `Fecho · projeto «${project.title}» · tarefa «${result.taskTitle}»`.slice(
      0,
      500,
    );

  await logIntervention({
    clientId: request.clientId,
    requestId: request.id,
    minutes: billing.minutes,
    agreedAmountEur: billing.agreedAmountEur,
    note,
    billingStatus: input.billingStatus ?? null,
    performedAt: closedAt,
  });

  revalidateRequest(request.clientId, result.projectId);
  return {
    ok: true as const,
    kind: "project_task" as const,
    closedAt: closedAt.toISOString(),
    ...result,
  };
}
