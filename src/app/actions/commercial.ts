"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma, type ProposalStatus, type ProjectStatus } from "@prisma/client";
import {
  WEBITON_PROPOSAL_TEMPLATE_HTML,
  extractScopeLines,
  fillProposalTemplate,
  scopeLinesToHtml,
  serializeProposalItems,
  splitLegacyProposalBody,
  sumProposalItems,
} from "@/lib/proposal-template";

type Tx = Prisma.TransactionClient;

function parseProposalDate(raw: string): Date {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(`${s}T12:00:00.000Z`);
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d;
  return new Date();
}

function formatProposalDatePt(date: Date): string {
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function revalidateCommercial() {
  revalidatePath("/commercial");
  revalidatePath("/projects");
  revalidatePath("/clients");
  revalidatePath("/");
}

async function resolveTemplateHtml(templateId: string | null) {
  let resolvedTemplateId = templateId;
  let templateHtml: string | null = null;

  if (templateId) {
    const t = await prisma.proposalTemplate.findUnique({
      where: { id: templateId },
    });
    templateHtml = t?.htmlLayout ?? null;
  } else {
    const fallback = await prisma.proposalTemplate.findFirst({
      where: { active: true },
      orderBy: { createdAt: "asc" },
    });
    if (fallback) {
      resolvedTemplateId = fallback.id;
      templateHtml = fallback.htmlLayout;
    }
  }

  return {
    resolvedTemplateId,
    templateHtml: templateHtml ?? WEBITON_PROPOSAL_TEMPLATE_HTML,
  };
}

async function upsertLatestScope(
  projectId: string,
  scopeBody: string,
  tx: Tx,
) {
  const latest = await tx.scopeDocument.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
  });
  if (latest) {
    await tx.scopeDocument.update({
      where: { id: latest.id },
      data: { body: scopeBody },
    });
    return latest.id;
  }
  const created = await tx.scopeDocument.create({
    data: { projectId, body: scopeBody, version: 1 },
  });
  return created.id;
}

export async function createProject(formData: FormData) {
  await requireAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const emailBody = String(formData.get("emailBody") ?? "").trim() || null;
  const clientMode = String(formData.get("clientMode") ?? "existing");
  if (!title) throw new Error("Título obrigatório");

  let clientId = String(formData.get("clientId") ?? "").trim();

  if (clientMode === "new") {
    const name = String(formData.get("newClientName") ?? "").trim();
    if (!name) throw new Error("Nome do cliente obrigatório");
    const client = await prisma.client.create({
      data: {
        name,
        email: String(formData.get("newClientEmail") ?? "").trim() || null,
      },
    });
    clientId = client.id;
  }

  if (!clientId) throw new Error("Cliente e título obrigatórios");

  const { getPlatformConfig } = await import("@/lib/platform-config");
  const platform = await getPlatformConfig();

  const project = await prisma.project.create({
    data: {
      clientId,
      title,
      status: "intake",
      costRateEur: platform.defaultCostRateEur ?? undefined,
      intakes: emailBody
        ? { create: { source: "email", emailBody } }
        : undefined,
    },
  });

  revalidateCommercial();
  return project.id;
}

export async function createProposalDraft(formData: FormData) {
  await requireAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const templateId = String(formData.get("templateId") ?? "").trim() || null;
  const itemsJson = String(formData.get("itemsJson") ?? "").trim();
  let projectId = String(formData.get("projectId") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "").trim();
  const clientMode = String(formData.get("clientMode") ?? "existing");

  let scopeBody = String(formData.get("body") ?? "").trim();
  let amountEur = Number(formData.get("amountEur") ?? 0);
  const proposalDate = parseProposalDate(
    String(formData.get("proposalDate") ?? ""),
  );

  if (itemsJson) {
    let items: { description: string; amountEur: number }[] = [];
    try {
      items = JSON.parse(itemsJson) as {
        description: string;
        amountEur: number;
      }[];
    } catch {
      throw new Error("Itens inválidos");
    }
    items = items
      .map((i) => ({
        description: String(i.description ?? "").trim(),
        amountEur: Number(i.amountEur) || 0,
      }))
      .filter((i) => i.description.length > 0);
    if (items.length === 0) throw new Error("Adiciona pelo menos um item");
    scopeBody = serializeProposalItems(items);
    amountEur = sumProposalItems(items);
  }

  if (!title || !scopeBody) throw new Error("Dados incompletos");

  // Create or resolve project from client when projectId is missing
  if (!projectId) {
    let resolvedClientId = clientId;
    if (clientMode === "new") {
      const name = String(formData.get("newClientName") ?? "").trim();
      if (!name) throw new Error("Nome do cliente obrigatório");
      const client = await prisma.client.create({
        data: {
          name,
          email: String(formData.get("newClientEmail") ?? "").trim() || null,
        },
      });
      resolvedClientId = client.id;
    }
    if (!resolvedClientId) throw new Error("Seleciona um cliente");

    const project = await prisma.project.create({
      data: {
        clientId: resolvedClientId,
        title,
        status: "scoping",
      },
    });
    projectId = project.id;
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { client: { select: { name: true } } },
  });
  if (!project) throw new Error("Projeto não encontrado");

  const { resolvedTemplateId, templateHtml } =
    await resolveTemplateHtml(templateId);

  const htmlBody = fillProposalTemplate(templateHtml, {
    title,
    clientName: project.client.name,
    scopeHtml: scopeLinesToHtml(scopeBody),
    amountEur: amountEur.toFixed(2),
    proposalDate: formatProposalDatePt(proposalDate),
  });

  await prisma.$transaction(async (tx) => {
    await upsertLatestScope(projectId, scopeBody, tx);
    await tx.proposal.create({
      data: {
        projectId,
        templateId: resolvedTemplateId,
        title,
        body: htmlBody,
        amountEur,
        proposalDate,
        status: "draft",
      },
    });
    await tx.project.update({
      where: { id: projectId },
      data: { status: "scoping" },
    });
  });

  revalidateCommercial();
}

export async function updateProposalDraft(
  proposalId: string,
  formData: FormData,
) {
  await requireAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const itemsJson = String(formData.get("itemsJson") ?? "").trim();
  let scopeBody = String(formData.get("body") ?? "").trim();
  let amountEur = Number(formData.get("amountEur") ?? 0);
  const proposalDate = parseProposalDate(
    String(formData.get("proposalDate") ?? ""),
  );

  if (itemsJson) {
    let items: { description: string; amountEur: number }[] = [];
    try {
      items = JSON.parse(itemsJson) as {
        description: string;
        amountEur: number;
      }[];
    } catch {
      throw new Error("Itens inválidos");
    }
    items = items
      .map((i) => ({
        description: String(i.description ?? "").trim(),
        amountEur: Number(i.amountEur) || 0,
      }))
      .filter((i) => i.description.length > 0);
    if (items.length === 0) throw new Error("Adiciona pelo menos um item");
    scopeBody = serializeProposalItems(items);
    amountEur = sumProposalItems(items);
  }

  if (!title || !scopeBody) throw new Error("Dados incompletos");

  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: {
      project: { include: { client: { select: { name: true } } } },
      template: { select: { htmlLayout: true } },
    },
  });
  if (!proposal) throw new Error("Proposta não encontrada");
  if (proposal.status !== "draft" && proposal.status !== "revised") {
    throw new Error("Só é possível editar drafts ou revisões");
  }

  const templateHtml =
    proposal.template?.htmlLayout ?? WEBITON_PROPOSAL_TEMPLATE_HTML;
  const htmlBody = fillProposalTemplate(templateHtml, {
    title,
    clientName: proposal.project.client.name,
    scopeHtml: scopeLinesToHtml(scopeBody),
    amountEur: amountEur.toFixed(2),
    proposalDate: formatProposalDatePt(proposalDate),
  });

  await prisma.$transaction(async (tx) => {
    await upsertLatestScope(proposal.projectId, scopeBody, tx);
    await tx.proposal.update({
      where: { id: proposalId },
      data: {
        title,
        body: htmlBody,
        amountEur,
        proposalDate,
      },
    });
  });

  revalidateCommercial();
}

export async function setProposalStatus(
  proposalId: string,
  status: ProposalStatus,
) {
  await requireAdmin();
  const proposal = await prisma.proposal.update({
    where: { id: proposalId },
    data: {
      status,
      sentAt: status === "sent" ? new Date() : undefined,
      decidedAt:
        status === "approved" || status === "rejected"
          ? new Date()
          : undefined,
    },
    include: { project: true },
  });

  let projectStatus: ProjectStatus | null = null;
  if (status === "sent") projectStatus = "proposal_sent";
  if (status === "approved") projectStatus = "approved";
  if (status === "rejected") projectStatus = "cancelled";

  if (projectStatus) {
    await prisma.project.update({
      where: { id: proposal.projectId },
      data: { status: projectStatus },
    });
  }

  if (status === "approved") {
    // Seed project budget from proposal if not set
    if (proposal.project.budgetEur == null) {
      await prisma.project.update({
        where: { id: proposal.projectId },
        data: { budgetEur: proposal.amountEur },
      });
    }

    const existingTasks = await prisma.buildTask.count({
      where: { projectId: proposal.projectId },
    });
    if (existingTasks === 0) {
      const scope = await prisma.scopeDocument.findFirst({
        where: { projectId: proposal.projectId },
        orderBy: { version: "desc" },
      });
      const scopeText =
        scope?.body ?? splitLegacyProposalBody(proposal.body).scopeText;
      const lines = extractScopeLines(scopeText);
      if (lines.length > 0) {
        await prisma.buildTask.createMany({
          data: lines.map((taskTitle, i) => ({
            projectId: proposal.projectId,
            title: taskTitle,
            status: "todo",
            sortOrder: i,
          })),
        });
        await prisma.project.update({
          where: { id: proposal.projectId },
          data: { status: "in_build" },
        });
      }
    } else {
      await prisma.project.update({
        where: { id: proposal.projectId },
        data: { status: "in_build" },
      });
    }
  }

  revalidateCommercial();
}

export async function setProposalStatusForm(
  proposalId: string,
  formData: FormData,
) {
  const status = String(formData.get("status") ?? "") as ProposalStatus;
  if (!["draft", "sent", "approved", "rejected", "revised"].includes(status)) {
    throw new Error("Estado inválido");
  }
  await setProposalStatus(proposalId, status);
}

export async function deleteProposal(proposalId: string) {
  await requireAdmin();
  await prisma.proposal.delete({ where: { id: proposalId } });
  revalidateCommercial();
}

export async function deleteProject(projectId: string) {
  await requireAdmin();
  await prisma.project.delete({ where: { id: projectId } });
  revalidateCommercial();
}

export async function setProjectStatus(
  projectId: string,
  status: ProjectStatus,
) {
  await requireAdmin();
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
  revalidateCommercial();
}

export async function setProjectStatusForm(
  projectId: string,
  formData: FormData,
) {
  const status = String(formData.get("status") ?? "") as ProjectStatus;
  await setProjectStatus(projectId, status);
}

export async function markProjectBilled(projectId: string) {
  await requireAdmin();
  await prisma.project.update({
    where: { id: projectId },
    data: { billedAt: new Date() },
  });
  revalidateCommercial();
}

export async function markContractBilled(contractId: string) {
  await requireAdmin();
  await prisma.contract.update({
    where: { id: contractId },
    data: { billedAt: new Date() },
  });
  revalidatePath("/commercial");
  revalidatePath("/clients");
  revalidatePath("/");
}

/** Wipe all commercial entities (projects cascade intakes/scopes/proposals/tasks). */
export async function wipeCommercialData() {
  await requireAdmin();
  await prisma.project.deleteMany();
  revalidateCommercial();
}
