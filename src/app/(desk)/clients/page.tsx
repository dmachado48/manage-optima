import { ClientsPanel } from "@/components/clients/clients-panel";
import { interventionBillableAmount, isPackAtLimit } from "@/lib/billing";
import { loadClientRelations } from "@/lib/clients-db";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const [clients, openRequestGroups, doneRequestGroups, billable, deliveredProjects] =
    await Promise.all([
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
    prisma.intervention.findMany({
      where: { billingStatus: "billable" },
      select: {
        clientId: true,
        minutes: true,
        agreedAmountEur: true,
      },
    }),
    prisma.project.findMany({
      where: { status: "delivered", billedAt: null },
      select: {
        clientId: true,
        budgetEur: true,
        proposals: {
          where: { status: "approved" },
          select: { amountEur: true },
        },
      },
    }),
  ]);

  const openByClient = new Map(
    openRequestGroups.map((g) => [g.clientId, g._count._all]),
  );
  const doneByClient = new Map(
    doneRequestGroups.map((g) => [g.clientId, g._count._all]),
  );
  const relations = await loadClientRelations(clients.map((c) => c.id));

  const billableByClient = new Map<
    string,
    { count: number; minutes: number; rows: typeof billable }
  >();
  for (const row of billable) {
    const current = billableByClient.get(row.clientId) ?? {
      count: 0,
      minutes: 0,
      rows: [],
    };
    current.count += 1;
    current.minutes += row.minutes;
    current.rows.push(row);
    billableByClient.set(row.clientId, current);
  }

  const projectsByClient = new Map<string, { count: number; amountEur: number }>();
  for (const project of deliveredProjects) {
    const approved = project.proposals.reduce(
      (sum, proposal) => sum + Number(proposal.amountEur),
      0,
    );
    const budget = project.budgetEur != null ? Number(project.budgetEur) : 0;
    const amount = budget > 0 ? budget : approved;
    const current = projectsByClient.get(project.clientId) ?? {
      count: 0,
      amountEur: 0,
    };
    current.count += 1;
    current.amountEur += amount;
    projectsByClient.set(project.clientId, current);
  }

  return (
    <ClientsPanel
      clients={clients.map((c) => {
        const contracts = c.contracts.map((x) => ({
          id: x.id,
          type: x.type,
          hoursTotal: Number(x.hoursTotal),
          hoursUsed: Number(x.hoursUsed),
          active: x.active,
          billedAt: x.billedAt?.toISOString() ?? null,
          hourlyRate: x.hourlyRate != null ? Number(x.hourlyRate) : null,
        }));
        const rate =
          contracts.find((x) => x.active && x.hourlyRate != null)?.hourlyRate ??
          contracts.find((x) => x.hourlyRate != null)?.hourlyRate ??
          null;
        const pending = billableByClient.get(c.id);
        const interventionAmount = (pending?.rows ?? []).reduce(
          (sum, row) =>
            sum +
            (interventionBillableAmount(
              row.minutes,
              row.agreedAmountEur != null ? Number(row.agreedAmountEur) : null,
              rate,
            ) ?? 0),
          0,
        );
        const projects = projectsByClient.get(c.id);
        const packDue = contracts.some(
          (x) =>
            x.active &&
            !x.billedAt &&
            (x.type === "pack" || x.type === "retainer") &&
            isPackAtLimit(x.hoursTotal, x.hoursUsed),
        );
        return {
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
        toBill: {
          interventions: pending?.count ?? 0,
          minutes: pending?.minutes ?? 0,
          amountEur:
            Math.round((interventionAmount + (projects?.amountEur ?? 0)) * 100) /
            100,
          projects: projects?.count ?? 0,
          packDue,
        },
        contracts: contracts.map(
          ({ hourlyRate: _hourlyRate, ...contract }) => contract,
        ),
      };
      })}
    />
  );
}
