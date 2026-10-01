"use server";

import { revalidatePath } from "next/cache";
import type { MessageAuthor } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { storeUpload } from "@/lib/uploads";

export type RequestThreadMessage = {
  id: string;
  author: MessageAuthor;
  body: string;
  createdAt: string;
  attachments: {
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }[];
};

export type RequestThread = {
  id: string;
  title: string;
  description: string | null;
  status: "requested" | "in_progress" | "waiting_on_client" | "done";
  source: string;
  createdAt: string;
  updatedAt: string;
  client: { id: string; name: string; email: string | null };
  messages: RequestThreadMessage[];
  looseAttachments: {
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    uploadedBy: MessageAuthor;
    createdAt: string;
  }[];
};

function revalidateRequestPaths(clientId: string, token?: string | null) {
  revalidatePath("/pipeline");
  revalidatePath("/maintenance");
  revalidatePath(`/clients/${clientId}`);
  revalidatePath(`/clients/${clientId}/trabalhos`);
  revalidatePath("/");
  if (token) revalidatePath(`/k/${token}`);
}

async function loadThread(requestId: string): Promise<RequestThread> {
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    include: {
      client: { select: { id: true, name: true, email: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          attachments: {
            select: {
              id: true,
              fileName: true,
              mimeType: true,
              sizeBytes: true,
            },
          },
        },
      },
      attachments: {
        where: { messageId: null },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          fileName: true,
          mimeType: true,
          sizeBytes: true,
          uploadedBy: true,
          createdAt: true,
        },
      },
    },
  });
  if (!request) throw new Error("Pedido não encontrado");

  return {
    id: request.id,
    title: request.title,
    description: request.description,
    status: request.status,
    source: request.source,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    client: request.client,
    messages: request.messages.map((m) => ({
      id: m.id,
      author: m.author,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      attachments: m.attachments,
    })),
    looseAttachments: request.attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      uploadedBy: a.uploadedBy,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

export async function getRequestThread(requestId: string): Promise<RequestThread> {
  await requireAdmin();
  return loadThread(requestId);
}

export async function getPortalRequestThread(
  token: string,
  requestId: string,
): Promise<RequestThread> {
  const client = await prisma.client.findUnique({
    where: { kanbanShareToken: token },
    select: { id: true },
  });
  if (!client) throw new Error("Portal inválido");

  const owns = await prisma.request.findFirst({
    where: { id: requestId, clientId: client.id },
    select: { id: true },
  });
  if (!owns) throw new Error("Pedido não encontrado");

  return loadThread(requestId);
}

async function saveFiles(
  requestId: string,
  messageId: string | null,
  uploadedBy: MessageAuthor,
  files: File[],
) {
  for (const file of files) {
    if (!file || file.size <= 0) continue;
    const stored = await storeUpload(requestId, file);
    await prisma.requestAttachment.create({
      data: {
        requestId,
        messageId,
        fileName: stored.fileName,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        storageKey: stored.storageKey,
        uploadedBy,
      },
    });
  }
}

function collectFiles(formData: FormData): File[] {
  const files: File[] = [];
  for (const value of formData.getAll("files")) {
    if (value instanceof File && value.size > 0) files.push(value);
  }
  const single = formData.get("file");
  if (single instanceof File && single.size > 0) files.push(single);
  return files;
}

export async function postRequestMessage(formData: FormData) {
  await requireAdmin();
  const requestId = String(formData.get("requestId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const files = collectFiles(formData);

  if (!requestId) throw new Error("Pedido obrigatório");
  if (!body && files.length === 0) {
    throw new Error("Escreve uma mensagem ou anexa um ficheiro");
  }

  const request = await prisma.request.findUnique({
    where: { id: requestId },
    select: { id: true, clientId: true },
  });
  if (!request) throw new Error("Pedido não encontrado");

  const message = await prisma.requestMessage.create({
    data: {
      requestId,
      author: "admin",
      body: body || "(anexo)",
    },
  });

  await saveFiles(requestId, message.id, "admin", files);
  await prisma.request.update({
    where: { id: requestId },
    data: { updatedAt: new Date() },
  });

  revalidateRequestPaths(request.clientId);
  return loadThread(requestId);
}

export async function postPortalRequestMessage(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const requestId = String(formData.get("requestId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const files = collectFiles(formData);

  if (!token || !requestId) throw new Error("Dados inválidos");
  if (!body && files.length === 0) {
    throw new Error("Escreve uma mensagem ou anexa um ficheiro");
  }

  const client = await prisma.client.findUnique({
    where: { kanbanShareToken: token },
    select: { id: true, kanbanShareToken: true },
  });
  if (!client) throw new Error("Portal inválido");

  const request = await prisma.request.findFirst({
    where: { id: requestId, clientId: client.id },
    select: { id: true, clientId: true },
  });
  if (!request) throw new Error("Pedido não encontrado");

  const message = await prisma.requestMessage.create({
    data: {
      requestId,
      author: "client",
      body: body || "(anexo)",
    },
  });

  await saveFiles(requestId, message.id, "client", files);
  await prisma.request.update({
    where: { id: requestId },
    data: { updatedAt: new Date() },
  });

  revalidateRequestPaths(request.clientId, client.kanbanShareToken);
  return loadThread(requestId);
}

export async function uploadRequestAttachment(formData: FormData) {
  await requireAdmin();
  const requestId = String(formData.get("requestId") ?? "");
  const files = collectFiles(formData);
  if (!requestId || files.length === 0) {
    throw new Error("Pedido e ficheiro obrigatórios");
  }

  const request = await prisma.request.findUnique({
    where: { id: requestId },
    select: { id: true, clientId: true },
  });
  if (!request) throw new Error("Pedido não encontrado");

  await saveFiles(requestId, null, "admin", files);
  revalidateRequestPaths(request.clientId);
  return loadThread(requestId);
}
