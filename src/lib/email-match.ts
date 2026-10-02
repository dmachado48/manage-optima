import { prisma } from "@/lib/prisma";

export type MatchResult = {
  clientId: string | null;
  reason: string | null;
};

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase().replace(/^<|>$/g, "");
}

function domainOf(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  return email.slice(at + 1);
}

const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "hotmail.pt",
  "outlook.com",
  "outlook.pt",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "yahoo.com",
  "yahoo.fr",
  "yahoo.pt",
  "sapo.pt",
  "mail.pt",
  "proton.me",
  "protonmail.com",
]);

/**
 * Extract routing token from:
 * - requests+TOKEN@webiton.pt (plus-addressing)
 * - inbox-TOKEN@… (alias)
 */
export function extractRoutingToken(
  toAddress: string | null | undefined,
): string | null {
  if (!toAddress) return null;
  const to = normalizeEmail(toAddress);
  const local = to.split("@")[0] ?? "";
  const plus = local.match(/^requests\+([a-z0-9_-]+)$/i);
  if (plus?.[1]) return plus[1];
  const inbox = local.match(/^inbox[-+]([a-z0-9_-]+)$/i);
  if (inbox?.[1]) return inbox[1];
  return null;
}

/**
 * Persist sender → client so the next inbound email matches automatically.
 */
export async function rememberSenderAlias(
  clientId: string,
  fromAddress: string,
) {
  const email = normalizeEmail(fromAddress);
  if (!email || !email.includes("@")) return;

  await prisma.clientEmailAlias.upsert({
    where: { email },
    update: { clientId },
    create: { clientId, email },
  });
}

/**
 * Match order:
 * 1. To token → Client.kanbanShareToken
 * 2. Learned sender alias
 * 3. Exact Client.email
 * 4. Prior inbound from same sender already matched/assigned
 * 5. From domain → Client.domain or Client.email domain (non-public)
 * 6. Linked User.email for that client
 */
export async function matchClientForInbound(input: {
  fromAddress: string;
  toAddress?: string | null;
}): Promise<MatchResult> {
  const from = normalizeEmail(input.fromAddress);
  const token = extractRoutingToken(input.toAddress);

  if (token) {
    const exact = await prisma.client.findUnique({
      where: { kanbanShareToken: token },
      select: { id: true },
    });
    if (exact) {
      return { clientId: exact.id, reason: "to_token" };
    }
  }

  const byAlias = await prisma.clientEmailAlias.findUnique({
    where: { email: from },
    select: { clientId: true },
  });
  if (byAlias) {
    return { clientId: byAlias.clientId, reason: "learned_sender" };
  }

  const byEmail = await prisma.client.findFirst({
    where: { email: from, active: true },
    select: { id: true },
  });
  if (byEmail) {
    return { clientId: byEmail.id, reason: "from_email" };
  }

  const priorInbound = await prisma.inboundEmail.findFirst({
    where: {
      fromAddress: from,
      matchedClientId: { not: null },
      status: { in: ["matched", "assigned"] },
    },
    orderBy: { receivedAt: "desc" },
    select: { matchedClientId: true },
  });
  if (priorInbound?.matchedClientId) {
    return {
      clientId: priorInbound.matchedClientId,
      reason: "prior_inbound_sender",
    };
  }

  const byUser = await prisma.user.findFirst({
    where: {
      email: from,
      clientId: { not: null },
      client: { active: true },
    },
    select: { clientId: true },
  });
  if (byUser?.clientId) {
    return { clientId: byUser.clientId, reason: "user_email" };
  }

  const domain = domainOf(from);
  if (domain && !PUBLIC_EMAIL_DOMAINS.has(domain)) {
    const byExactDomain = await prisma.client.findFirst({
      where: { active: true, domain },
      select: { id: true },
      orderBy: { updatedAt: "desc" },
    });
    if (byExactDomain) {
      return { clientId: byExactDomain.id, reason: "from_domain" };
    }

    const byEmailDomain = await prisma.client.findFirst({
      where: {
        active: true,
        email: { endsWith: `@${domain}` },
      },
      select: { id: true },
      orderBy: { updatedAt: "desc" },
    });
    if (byEmailDomain) {
      return {
        clientId: byEmailDomain.id,
        reason: "from_domain_or_client_email",
      };
    }
  }

  return { clientId: null, reason: null };
}

export function titleFromSubject(subject: string): string {
  const s = subject.replace(/^(re|fw|fwd):\s*/gi, "").trim();
  return s.slice(0, 180) || "Pedido por email";
}

export function clientInboundAlias(shareToken: string): string {
  return `requests+${shareToken}@webiton.pt`;
}
