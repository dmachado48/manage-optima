import "server-only";

import { createHash } from "node:crypto";

import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";

import { ingestInboundEmail } from "@/lib/email-ingest";

const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_MAX_MESSAGE_BYTES = 20 * 1024 * 1024;

type ImapConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  batchSize: number;
  maxMessageBytes: number;
};

export type ImapPollResult = {
  found: number;
  processed: number;
  matched: number;
  pending: number;
  duplicates: number;
  failed: number;
  remaining: number;
  errors: Array<{ uid: number; message: string }>;
};

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function booleanValue(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return !["0", "false", "no", "off"].includes(value.trim().toLowerCase());
}

function imapConfig(): ImapConfig {
  const required = ["IMAP_HOST", "IMAP_USER", "IMAP_PASSWORD"] as const;
  const missing = required.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Configuração IMAP em falta: ${missing.join(", ")}`);
  }

  return {
    host: process.env.IMAP_HOST!.trim(),
    port: positiveInteger(process.env.IMAP_PORT, 993),
    secure: booleanValue(process.env.IMAP_SECURE, true),
    user: process.env.IMAP_USER!.trim(),
    password: process.env.IMAP_PASSWORD!,
    batchSize: Math.min(
      positiveInteger(process.env.IMAP_BATCH_SIZE, DEFAULT_BATCH_SIZE),
      100,
    ),
    maxMessageBytes: Math.min(
      positiveInteger(
        process.env.IMAP_MAX_MESSAGE_BYTES,
        DEFAULT_MAX_MESSAGE_BYTES,
      ),
      50 * 1024 * 1024,
    ),
  };
}

function firstAddress(value: AddressObject | AddressObject[] | undefined) {
  const groups = value ? (Array.isArray(value) ? value : [value]) : [];
  for (const group of groups) {
    const address = group.value.find((entry) => entry.address?.trim());
    if (address?.address) {
      return {
        address: address.address.trim().toLowerCase(),
        name: address.name?.trim() || null,
      };
    }
  }
  return null;
}

function validDate(value: Date | string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function stableMessageId(
  parsed: ParsedMail,
  envelopeMessageId: string | undefined,
  fallback: string,
): string {
  const candidate = parsed.messageId?.trim() || envelopeMessageId?.trim();
  if (!candidate) return fallback;
  if (candidate.length <= 180) return candidate;

  return `sha256:${createHash("sha256").update(candidate).digest("hex")}`;
}

function safeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Erro desconhecido";
  const responseText =
    "responseText" in error && typeof error.responseText === "string"
      ? error.responseText
      : "";
  return (responseText || error.message).replace(/\s+/g, " ").slice(0, 240);
}

let runningPoll: Promise<ImapPollResult> | null = null;

export function pollImapInbox(): Promise<ImapPollResult> {
  if (runningPoll) return runningPoll;

  runningPoll = runImapPoll().finally(() => {
    runningPoll = null;
  });
  return runningPoll;
}

async function runImapPoll(): Promise<ImapPollResult> {
  const config = imapConfig();
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.password,
    },
    logger: false,
    disableAutoIdle: true,
    clientInfo: {
      name: "Optima Desk",
      version: process.env.npm_package_version ?? "unknown",
    },
  });

  client.on("error", (error) => {
    console.error("[imap] Erro de ligação:", safeErrorMessage(error));
  });

  let lock: Awaited<ReturnType<ImapFlow["getMailboxLock"]>> | null = null;

  try {
    await client.connect();
    lock = await client.getMailboxLock("INBOX");

    const searchResult = await client.search({ seen: false }, { uid: true });
    const unseenUids = Array.isArray(searchResult) ? searchResult : [];
    const selectedUids = unseenUids
      .slice()
      .sort((a, b) => a - b)
      .slice(0, config.batchSize);

    const result: ImapPollResult = {
      found: unseenUids.length,
      processed: 0,
      matched: 0,
      pending: 0,
      duplicates: 0,
      failed: 0,
      remaining: unseenUids.length,
      errors: [],
    };

    for (const uid of selectedUids) {
      try {
        const message = await client.fetchOne(
          String(uid),
          {
            uid: true,
            envelope: true,
            internalDate: true,
            size: true,
            source: { maxLength: config.maxMessageBytes },
          },
          { uid: true },
        );

        if (!message || !message.source) {
          throw new Error("O servidor IMAP não devolveu o conteúdo da mensagem");
        }

        const parsed = await simpleParser(message.source, {
          skipImageLinks: true,
          skipTextToHtml: true,
        });
        const from =
          firstAddress(parsed.from) ??
          (message.envelope?.from?.[0]?.address
            ? {
                address: message.envelope.from[0].address.toLowerCase(),
                name: message.envelope.from[0].name?.trim() || null,
              }
            : {
                address: "unknown@invalid.local",
                name: "Remetente desconhecido",
              });
        const to =
          firstAddress(parsed.to) ??
          (message.envelope?.to?.[0]?.address
            ? {
                address: message.envelope.to[0].address.toLowerCase(),
                name: message.envelope.to[0].name?.trim() || null,
              }
            : { address: config.user.toLowerCase(), name: null });
        const wasTruncated =
          typeof message.size === "number" &&
          message.size > config.maxMessageBytes;
        const body = [
          parsed.text?.trim() || "(Mensagem sem conteúdo de texto.)",
          wasTruncated
            ? "\n[Mensagem truncada durante a importação devido ao tamanho.]"
            : null,
        ]
          .filter((part): part is string => Boolean(part))
          .join("\n");
        const fallbackId = `imap:${createHash("sha256")
          .update(
            `${config.host}:${config.user}:${
              client.mailbox ? client.mailbox.uidValidity : "unknown"
            }:${uid}`,
          )
          .digest("hex")}`;

        const ingested = await ingestInboundEmail({
          messageId: stableMessageId(
            parsed,
            message.envelope?.messageId,
            fallbackId,
          ),
          fromAddress: from.address,
          fromName: from.name,
          toAddress: to.address,
          subject:
            parsed.subject?.trim() ||
            message.envelope?.subject?.trim() ||
            "(Sem assunto)",
          bodyText: body,
          receivedAt:
            validDate(parsed.date) ??
            validDate(message.envelope?.date) ??
            validDate(message.internalDate),
        });

        result.processed += 1;
        if (ingested.status === "duplicate") {
          result.duplicates += 1;
        } else {
          result[ingested.status] += 1;
        }

        const markedSeen = await client.messageFlagsAdd(
          String(uid),
          ["\\Seen"],
          { uid: true },
        );
        if (!markedSeen) {
          throw new Error("Mensagem importada, mas não foi possível marcá-la como lida");
        }
        result.remaining -= 1;
      } catch (error) {
        result.failed += 1;
        result.errors.push({ uid, message: safeErrorMessage(error) });
        console.error(
          `[imap] Falha ao processar UID ${uid}:`,
          safeErrorMessage(error),
        );
      }
    }

    return result;
  } finally {
    lock?.release();
    if (client.usable) {
      await client.logout().catch(() => client.close());
    } else {
      client.close();
    }
  }
}
