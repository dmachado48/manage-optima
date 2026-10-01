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
 * Match order:
 * 1. To token → Client.kanbanShareToken (área do cliente)
 * 2. From email → Client.email
 * 3. From domain → Client.domain
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

  const byEmail = await prisma.client.findFirst({
    where: { email: from },
    select: { id: true },
  });
  if (byEmail) {
    return { clientId: byEmail.id, reason: "from_email" };
  }

  const domain = domainOf(from);
  if (domain) {
    const byDomain = await prisma.client.findFirst({
      where: { domain },
      select: { id: true },
    });
    if (byDomain) {
      return { clientId: byDomain.id, reason: "from_domain" };
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
