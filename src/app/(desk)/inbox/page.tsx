import { InboxDesk } from "@/components/inbox/inbox-desk";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const [clients, pending, recent] = await Promise.all([
    prisma.client.findMany({
      where: { active: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.inboundEmail.findMany({
      where: { status: "pending" },
      include: { matchedClient: { select: { id: true, name: true } } },
      orderBy: { receivedAt: "desc" },
    }),
    prisma.inboundEmail.findMany({
      where: { status: { not: "pending" } },
      include: { matchedClient: { select: { id: true, name: true } } },
      orderBy: { receivedAt: "desc" },
      take: 20,
    }),
  ]);

  const mapRow = (r: (typeof pending)[number]) => ({
    id: r.id,
    fromAddress: r.fromAddress,
    fromName: r.fromName,
    toAddress: r.toAddress,
    subject: r.subject,
    bodyText: r.bodyText,
    receivedAt: r.receivedAt.toISOString(),
    status: r.status,
    matchReason: r.matchReason,
    matchedClient: r.matchedClient,
    requestId: r.requestId,
  });

  return (
    <InboxDesk
      clients={clients}
      pending={pending.map(mapRow)}
      recent={recent.map(mapRow)}
    />
  );
}
