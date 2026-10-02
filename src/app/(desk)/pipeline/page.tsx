import { Suspense } from "react";
import { PipelineBoard } from "@/components/pipeline/pipeline-board";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const [clients, requests] = await Promise.all([
    prisma.client.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.request.findMany({
      include: {
        client: { select: { id: true, name: true } },
        _count: { select: { messages: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return (
    <div className="desk-page flex min-h-full flex-1 flex-col py-6">
      <div className="border-b border-border pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
        <p className="text-sm text-muted">
          A tua lista de trabalho — abre um pedido para falar com o cliente
        </p>
      </div>
      <Suspense
        fallback={
          <div className="py-6 text-sm text-muted">A carregar…</div>
        }
      >
        <PipelineBoard
          clients={clients}
          requests={requests.map((r) => ({
            id: r.id,
            title: r.title,
            description: r.description,
            status: r.status,
            source: r.source,
            updatedAt: r.updatedAt.toISOString(),
            closedAt: r.closedAt?.toISOString() ?? null,
            client: r.client,
            messageCount: r._count.messages,
          }))}
        />
      </Suspense>
    </div>
  );
}
