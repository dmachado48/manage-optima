import { ClientsPanel } from "@/components/clients/clients-panel";
import { loadClientRelations } from "@/lib/clients-db";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const [clients, openRequestGroups, doneRequestGroups] = await Promise.all([
    prisma.client.findMany({
      include: {
        contracts: { orderBy: { createdAt: "desc" } },
        _count: {
          select: {
            interventions: true,
            requests: true,
            projects: true,
          },
        },
      },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    prisma.request.groupBy({
      by: ["clientId"],
      where: { status: { not: "done" } },
      _count: { _all: true },
    }),
    prisma.request.groupBy({
      by: ["clientId"],
      where: { status: "done" },
      _count: { _all: true },
    }),
  ]);

  const openByClient = new Map(
    openRequestGroups.map((g) => [g.clientId, g._count._all]),
  );
  const doneByClient = new Map(
    doneRequestGroups.map((g) => [g.clientId, g._count._all]),
  );
  const relations = await loadClientRelations(clients.map((c) => c.id));

  return (
    <ClientsPanel
      clients={clients.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        domain: c.domain,
        contactName: c.contactName,
        phone: c.phone,
        active: c.active,
        relation: relations.get(c.id) ?? "end_client",
        createdAt: c.createdAt.toISOString(),
        counts: {
          interventions: c._count.interventions,
          requests: c._count.requests,
          requestsOpen: openByClient.get(c.id) ?? 0,
          requestsDone: doneByClient.get(c.id) ?? 0,
          projects: c._count.projects,
        },
        contracts: c.contracts.map((x) => ({
          id: x.id,
          type: x.type,
          hoursTotal: Number(x.hoursTotal),
          hoursUsed: Number(x.hoursUsed),
          active: x.active,
          billedAt: x.billedAt?.toISOString() ?? null,
        })),
      }))}
    />
  );
}
