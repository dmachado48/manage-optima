"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  ingestInboundEmail,
  requestDescription,
} from "@/lib/email-ingest";
import { titleFromSubject } from "@/lib/email-match";
import { prisma } from "@/lib/prisma";

export async function assignInboundToClient(
  inboundId: string,
  formData: FormData,
) {
  await requireAdmin();
  const clientId = String(formData.get("clientId") ?? "");
  if (!clientId) throw new Error("Cliente obrigatório");

  const inbound = await prisma.inboundEmail.findUnique({
    where: { id: inboundId },
    include: { attachments: true },
  });
  if (!inbound) throw new Error("Email não encontrado");
  if (inbound.requestId) throw new Error("Já está ligado a um pedido");

  await prisma.$transaction(async (tx) => {
    const createdRequest = await tx.request.create({
      data: {
        clientId,
        title: titleFromSubject(inbound.subject),
        description: requestDescription({
          messageId: inbound.messageId,
          fromAddress: inbound.fromAddress,
          fromName: inbound.fromName,
          toAddress: inbound.toAddress,
          subject: inbound.subject,
          bodyText: inbound.bodyText,
        }),
        source: "email",
        status: "requested",
        emailMessageId: inbound.messageId,
      },
    });
    const message = await tx.requestMessage.create({
      data: {
        requestId: createdRequest.id,
        author: "client",
        body: inbound.bodyText,
        bodyHtml: inbound.bodyHtml,
        emailMessageId: inbound.messageId,
        createdAt: inbound.receivedAt,
      },
    });

    if (inbound.attachments.length > 0) {
      await tx.requestAttachment.createMany({
        data: inbound.attachments.map((attachment) => ({
          requestId: createdRequest.id,
          messageId: message.id,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          storageKey: attachment.storageKey,
          uploadedBy: "client",
        })),
      });
      await tx.inboundEmailAttachment.deleteMany({
        where: { inboundEmailId: inbound.id },
      });
    }

    await tx.clientEmailAlias.upsert({
      where: { email: inbound.fromAddress.trim().toLowerCase() },
      update: { clientId },
      create: {
        clientId,
        email: inbound.fromAddress.trim().toLowerCase(),
      },
    });

    await tx.inboundEmail.update({
      where: { id: inboundId },
      data: {
        status: "assigned",
        matchedClientId: clientId,
        requestId: createdRequest.id,
        matchReason: "manual_assign",
      },
    });

    return createdRequest;
  });

  revalidatePath("/inbox");
  revalidatePath("/pipeline");
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/");
}

export async function ignoreInbound(inboundId: string) {
  await requireAdmin();
  await prisma.inboundEmail.update({
    where: { id: inboundId },
    data: { status: "ignored" },
  });
  revalidatePath("/inbox");
}

/** Manual paste for testing / when IMAP not wired yet */
export async function pasteInboundEmail(formData: FormData) {
  await requireAdmin();
  const fromAddress = String(formData.get("fromAddress") ?? "").trim();
  const toAddress = String(formData.get("toAddress") ?? "").trim() || null;
  const subject = String(formData.get("subject") ?? "").trim();
  const bodyText = String(formData.get("bodyText") ?? "").trim();
  if (!fromAddress || !subject || !bodyText) {
    throw new Error("From, subject e corpo são obrigatórios");
  }

  const messageId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const result = await ingestInboundEmail({
    messageId,
    fromAddress,
    toAddress,
    subject,
    bodyText,
  });

  revalidatePath("/inbox");
  revalidatePath("/pipeline");
  if (result.clientId) {
    revalidatePath(`/clients/${result.clientId}`);
  }
  revalidatePath("/");
  return result;
}
