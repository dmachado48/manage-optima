import { createHash } from "node:crypto";

import { cleanEmailHtml } from "@/lib/email-html";
import { prisma } from "@/lib/prisma";
import { storeBuffer } from "@/lib/uploads";
import {
  matchClientForInbound,
  rememberSenderAlias,
  titleFromSubject,
} from "@/lib/email-match";

export type InboundAttachmentInput = {
  fileName: string;
  mimeType: string;
  content: Buffer;
};

export type IngestEmailInput = {
  messageId: string;
  inReplyTo?: string | null;
  references?: string[];
  fromAddress: string;
  fromName?: string | null;
  toAddress?: string | null;
  subject: string;
  bodyText: string;
  bodyHtml?: string | null;
  attachments?: InboundAttachmentInput[];
  receivedAt?: Date;
};

export type IngestEmailResult = {
  inboundId: string;
  status: "matched" | "pending" | "duplicate";
  requestId: string | null;
  clientId: string | null;
  matchReason: string | null;
};

export function requestDescription(
  input: IngestEmailInput,
  maxBytes = 60_000,
): string {
  const description = [
    `De: ${input.fromName ? `${input.fromName} <${input.fromAddress}>` : input.fromAddress}`,
    input.toAddress ? `Para: ${input.toAddress}` : null,
    "",
    input.bodyText,
  ]
    .filter((line) => line !== null)
    .join("\n");

  if (Buffer.byteLength(description, "utf8") <= maxBytes) return description;

  const suffix = "\n\n[Conteúdo truncado; o email completo está disponível no Inbox.]";
  const targetBytes = maxBytes - Buffer.byteLength(suffix, "utf8");
  let bytes = 0;
  let truncated = "";

  for (const character of description) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (bytes + characterBytes > targetBytes) break;
    truncated += character;
    bytes += characterBytes;
  }

  return truncated + suffix;
}

export function boundedMessageId(value: string): string {
  const messageId = value.trim();
  if (messageId.length <= 180) return messageId;
  return `sha256:${createHash("sha256").update(messageId).digest("hex")}`;
}

async function findThreadRequest(input: IngestEmailInput) {
  const replyIds = [input.inReplyTo, ...(input.references ?? [])]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(boundedMessageId);
  if (replyIds.length === 0) return null;

  const message = await prisma.requestMessage.findFirst({
    where: { emailMessageId: { in: replyIds } },
    select: {
      request: {
        select: { id: true, clientId: true },
      },
    },
  });
  if (message) return message.request;

  return prisma.request.findFirst({
    where: { emailMessageId: { in: replyIds } },
    select: { id: true, clientId: true },
  });
}

async function saveAttachments(input: {
  attachments: InboundAttachmentInput[];
  inboundId: string;
  requestId: string | null;
  requestMessageId: string | null;
}) {
  for (const attachment of input.attachments) {
    try {
      const scope = input.requestId
        ? input.requestId
        : `inbound/${input.inboundId}`;
      const stored = await storeBuffer(scope, {
        content: attachment.content,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
      });

      if (input.requestId) {
        await prisma.requestAttachment.create({
          data: {
            requestId: input.requestId,
            messageId: input.requestMessageId,
            uploadedBy: "client",
            ...stored,
          },
        });
      } else {
        await prisma.inboundEmailAttachment.create({
          data: {
            inboundEmailId: input.inboundId,
            ...stored,
          },
        });
      }
    } catch (error) {
      console.error(
        `[email] Não foi possível guardar o anexo ${attachment.fileName}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
}

export async function ingestInboundEmail(
  input: IngestEmailInput,
): Promise<IngestEmailResult> {
  const messageId = boundedMessageId(input.messageId);
  if (!messageId) throw new Error("messageId obrigatório");

  const existing = await prisma.inboundEmail.findUnique({
    where: { messageId },
  });
  if (existing) {
    return {
      inboundId: existing.id,
      status: "duplicate",
      requestId: existing.requestId,
      clientId: existing.matchedClientId,
      matchReason: existing.matchReason,
    };
  }

  const bodyHtml = cleanEmailHtml(input.bodyHtml);
  const threadRequest = await findThreadRequest(input);
  const match = threadRequest
    ? { clientId: threadRequest.clientId, reason: "thread_reply" }
    : await matchClientForInbound({
        fromAddress: input.fromAddress,
        toAddress: input.toAddress,
      });

  if (match.clientId) {
    const created = await prisma.$transaction(async (tx) => {
      const request = threadRequest
        ? await tx.request.update({
            where: { id: threadRequest.id },
            data: {
              status: "requested",
              updatedAt: input.receivedAt ?? new Date(),
            },
            select: { id: true },
          })
        : await tx.request.create({
            data: {
              clientId: match.clientId!,
              title: titleFromSubject(input.subject),
              description: requestDescription(input),
              source: "email",
              status: "requested",
              emailMessageId: messageId,
            },
            select: { id: true },
          });
      const requestMessage = await tx.requestMessage.create({
        data: {
          requestId: request.id,
          author: "client",
          body: input.bodyText,
          bodyHtml,
          emailMessageId: messageId,
          createdAt: input.receivedAt ?? new Date(),
        },
        select: { id: true },
      });
      const inbound = await tx.inboundEmail.create({
        data: {
          messageId,
          fromAddress: input.fromAddress.trim().toLowerCase(),
          fromName: input.fromName ?? null,
          toAddress: input.toAddress ?? null,
          subject: input.subject,
          bodyText: input.bodyText,
          bodyHtml,
          receivedAt: input.receivedAt ?? new Date(),
          status: "matched",
          matchedClientId: match.clientId,
          requestId: request.id,
          matchReason: match.reason,
        },
        select: { id: true },
      });

      return { request, requestMessage, inbound };
    });

    await saveAttachments({
      attachments: input.attachments ?? [],
      inboundId: created.inbound.id,
      requestId: created.request.id,
      requestMessageId: created.requestMessage.id,
    });

    await rememberSenderAlias(match.clientId, input.fromAddress);

    return {
      inboundId: created.inbound.id,
      status: "matched",
      requestId: created.request.id,
      clientId: match.clientId,
      matchReason: match.reason,
    };
  }

  const inbound = await prisma.inboundEmail.create({
    data: {
      messageId,
      fromAddress: input.fromAddress.trim().toLowerCase(),
      fromName: input.fromName ?? null,
      toAddress: input.toAddress ?? null,
      subject: input.subject,
      bodyText: input.bodyText,
      bodyHtml,
      receivedAt: input.receivedAt ?? new Date(),
      status: "pending",
    },
  });

  await saveAttachments({
    attachments: input.attachments ?? [],
    inboundId: inbound.id,
    requestId: null,
    requestMessageId: null,
  });

  return {
    inboundId: inbound.id,
    status: "pending",
    requestId: null,
    clientId: null,
    matchReason: null,
  };
}
