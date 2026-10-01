import { prisma } from "@/lib/prisma";
import {
  matchClientForInbound,
  titleFromSubject,
} from "@/lib/email-match";

export type IngestEmailInput = {
  messageId: string;
  fromAddress: string;
  fromName?: string | null;
  toAddress?: string | null;
  subject: string;
  bodyText: string;
  receivedAt?: Date;
};

export type IngestEmailResult = {
  inboundId: string;
  status: "matched" | "pending" | "duplicate";
  requestId: string | null;
  clientId: string | null;
  matchReason: string | null;
};

export async function ingestInboundEmail(
  input: IngestEmailInput,
): Promise<IngestEmailResult> {
  const messageId = input.messageId.trim();
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

  const match = await matchClientForInbound({
    fromAddress: input.fromAddress,
    toAddress: input.toAddress,
  });

  if (match.clientId) {
    const request = await prisma.request.create({
      data: {
        clientId: match.clientId,
        title: titleFromSubject(input.subject),
        description: [
          `De: ${input.fromName ? `${input.fromName} <${input.fromAddress}>` : input.fromAddress}`,
          input.toAddress ? `Para: ${input.toAddress}` : null,
          "",
          input.bodyText,
        ]
          .filter((l) => l !== null)
          .join("\n"),
        source: "email",
        status: "requested",
        emailMessageId: messageId,
      },
    });

    const inbound = await prisma.inboundEmail.create({
      data: {
        messageId,
        fromAddress: input.fromAddress.trim().toLowerCase(),
        fromName: input.fromName ?? null,
        toAddress: input.toAddress ?? null,
        subject: input.subject,
        bodyText: input.bodyText,
        receivedAt: input.receivedAt ?? new Date(),
        status: "matched",
        matchedClientId: match.clientId,
        requestId: request.id,
        matchReason: match.reason,
      },
    });

    return {
      inboundId: inbound.id,
      status: "matched",
      requestId: request.id,
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
      receivedAt: input.receivedAt ?? new Date(),
      status: "pending",
    },
  });

  return {
    inboundId: inbound.id,
    status: "pending",
    requestId: null,
    clientId: null,
    matchReason: null,
  };
}
