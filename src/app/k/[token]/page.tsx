import { notFound } from "next/navigation";
import { ClientPortal } from "@/components/portal/client-portal";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SharedClientBoardPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const client = await prisma.client.findUnique({
    where: { kanbanShareToken: token },
    include: {
      contracts: { where: { active: true }, take: 1 },
    },
  });
  if (!client) notFound();

  const [requests, reports] = await Promise.all([
    prisma.request.findMany({
      where: { clientId: client.id },
      include: {
        client: { select: { id: true, name: true } },
        _count: { select: { messages: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.report.findMany({
      where: { clientId: client.id, published: true },
      orderBy: { periodStart: "desc" },
      take: 12,
    }),
  ]);

  const active = client.contracts[0] ?? null;

  return (
    <ClientPortal
      token={token}
      clientName={client.name}
      clientId={client.id}
      hoursTotal={active ? Number(active.hoursTotal) : null}
      hoursUsed={active ? Number(active.hoursUsed) : null}
      contractType={active?.type ?? null}
      requests={requests.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        status: r.status,
        source: r.source,
        updatedAt: r.updatedAt.toISOString(),
        client: r.client,
        messageCount: r._count.messages,
      }))}
      reports={reports.map((r) => ({
        id: r.id,
        body: r.body,
        periodStart: r.periodStart.toISOString(),
        periodEnd: r.periodEnd.toISOString(),
      }))}
    />
  );
}
