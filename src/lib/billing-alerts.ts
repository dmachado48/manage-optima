import "server-only";

import { isPackAtLimit, type BillingAlert } from "@/lib/billing";
import { prisma } from "@/lib/prisma";

export async function getBillingAlerts(): Promise<BillingAlert[]> {
  const [contracts, projects, billableGroups] = await Promise.all([
    prisma.contract.findMany({
      where: {
        active: true,
        billedAt: null,
        type: { in: ["pack", "retainer"] },
      },
      include: { client: { select: { id: true, name: true } } },
    }),
    prisma.project.findMany({
      where: { status: "delivered", billedAt: null },
      include: { client: { select: { id: true, name: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.intervention.groupBy({
      by: ["clientId"],
      where: { billingStatus: "billable" },
      _count: { _all: true },
      _sum: { minutes: true },
    }),
  ]);

  const alerts: BillingAlert[] = [];

  for (const c of contracts) {
    const total = Number(c.hoursTotal);
    const used = Number(c.hoursUsed);
    if (!isPackAtLimit(total, used)) continue;
    alerts.push({
      id: `contract:${c.id}`,
      kind: "pack",
      clientId: c.client.id,
      clientName: c.client.name,
      label: c.type === "pack" ? "Pack esgotado" : "Avença no limite",
      detail:
        c.type === "retainer"
          ? `${used.toFixed(1)}h / ${total.toFixed(1)}h este mês — horas não transitam`
          : `${used.toFixed(1)}h / ${total.toFixed(1)}h — faturar ou renovar`,
      href: `/clients/${c.client.id}`,
    });
  }

  for (const p of projects) {
    alerts.push({
      id: `project:${p.id}`,
      kind: "project",
      clientId: p.client.id,
      clientName: p.client.name,
      label: "Projeto entregue",
      detail: `${p.title} — pronto a faturar`,
      href: `/projects/${p.id}`,
    });
  }

  if (billableGroups.length > 0) {
    const totalMinutes = billableGroups.reduce(
      (s, g) => s + (g._sum.minutes ?? 0),
      0,
    );
    const totalRows = billableGroups.reduce((s, g) => s + g._count._all, 0);
    alerts.push({
      id: "interventions:billable",
      kind: "interventions",
      clientId: "",
      clientName: `${billableGroups.length} cliente(s)`,
      label: "Intervenções por faturar",
      detail: `${totalRows} registos · ${(totalMinutes / 60).toFixed(1)}h`,
      href: "/settings?tab=interventions",
    });
  }

  return alerts;
}
