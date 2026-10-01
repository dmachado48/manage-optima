import { notFound } from "next/navigation";
import Link from "next/link";
import { ClientWorkBoard } from "@/components/clients/work-board";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ClientTrabalhosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) notFound();

  const requests = await prisma.request.findMany({
    where: { clientId: id },
    include: {
      client: { select: { id: true, name: true } },
      _count: { select: { messages: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="desk-page flex min-h-full flex-1 flex-col py-6">
      <div className="border-b border-border pb-3">
        <Link
          href={`/clients/${id}`}
          className="text-sm text-muted underline-offset-2 hover:underline"
        >
          ← {client.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Pipeline — {client.name}
        </h1>
        <p className="text-sm text-muted">
          Pedidos deste cliente (a tua vista de trabalho)
        </p>
      </div>
      <ClientWorkBoard
        lockedClientId={client.id}
        clients={[{ id: client.id, name: client.name }]}
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
      />
    </div>
  );
}
