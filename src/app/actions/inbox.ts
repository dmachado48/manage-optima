"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { ingestInboundEmail } from "@/lib/email-ingest";
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
  });
  if (!inbound) throw new Error("Email não encontrado");
  if (inbound.requestId) throw new Error("Já está ligado a um pedido");

  const request = await prisma.request.create({
    data: {
      clientId,
      title: titleFromSubject(inbound.subject),
      description: [
        `De: ${inbound.fromName ? `${inbound.fromName} <${inbound.fromAddress}>` : inbound.fromAddress}`,
        inbound.toAddress ? `Para: ${inbound.toAddress}` : null,
        "",
        inbound.bodyText,
      ]
        .filter((l) => l !== null)
        .join("\n"),
      source: "email",
      status: "requested",
      emailMessageId: inbound.messageId,
    },
  });

  await prisma.inboundEmail.update({
    where: { id: inboundId },
    data: {
      status: "assigned",
      matchedClientId: clientId,
      requestId: request.id,
      matchReason: "manual_assign",
    },
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
