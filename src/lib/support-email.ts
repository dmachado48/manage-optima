import "server-only";

import nodemailer from "nodemailer";

type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

type SendSupportEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  inReplyTo?: string | null;
  references?: string[];
  attachments?: EmailAttachment[];
};

function booleanValue(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return !["0", "false", "no", "off"].includes(value.trim().toLowerCase());
}

function smtpConfig() {
  const host = process.env.SMTP_HOST?.trim() || process.env.IMAP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim() || process.env.IMAP_USER?.trim();
  const password = process.env.SMTP_PASSWORD || process.env.IMAP_PASSWORD;
  const port = Number.parseInt(process.env.SMTP_PORT || "465", 10);

  if (!host || !user || !password) {
    throw new Error("Configuração SMTP em falta");
  }

  return {
    host,
    port: Number.isSafeInteger(port) && port > 0 ? port : 465,
    secure: booleanValue(process.env.SMTP_SECURE, port === 465),
    user,
    password,
    fromName: process.env.SMTP_FROM_NAME?.trim() || "Webiton Suporte",
  };
}

export async function sendSupportEmail(
  input: SendSupportEmailInput,
): Promise<{ messageId: string }> {
  const config = smtpConfig();
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.password,
    },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 60_000,
  });

  const result = await transport.sendMail({
    from: {
      name: config.fromName,
      address: config.user,
    },
    replyTo: config.user,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    inReplyTo: input.inReplyTo || undefined,
    references:
      input.references && input.references.length > 0
        ? input.references
        : undefined,
    attachments: input.attachments,
  });

  return { messageId: result.messageId };
}
