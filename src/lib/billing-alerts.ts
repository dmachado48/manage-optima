import "server-only";

import { isPackAtLimit, type BillingAlert } from "@/lib/billing";
import { getPlatformConfig } from "@/lib/platform-config";
import { prisma } from "@/lib/prisma";

export async function getBillingAlerts(): Promise<BillingAlert[]> {
  const config = await getPlatformConfig();

  const [contracts, projects, billableGroups, overdueProjects] =
    await Promise.all([
      config.alertAttainedEnabled
        ? prisma.contract.findMany({
            where: {
              active: true,
              billedAt: null,
              type: { in: ["pack", "retainer"] },
            },
            include: { client: { select: { id: true, name: true } } },
          })
        : Promise.resolve([]),
      config.alertBillableEnabled
        ? prisma.project.findMany({
            where: { status: "delivered", billedAt: null },
            include: { client: { select: { id: true, name: true } } },
            orderBy: { updatedAt: "desc" },
          })
        : Promise.resolve([]),
      config.alertBillableEnabled
        ? prisma.intervention.groupBy({
            by: ["clientId"],
            where: { billingStatus: "billable" },
            _count: { _all: true },
            _sum: { minutes: true },
          })
        : Promise.resolve([]),
      config.alertDeadlineEnabled
        ? prisma.project.findMany({
            where: {
              deadline: { lt: new Date() },
              status: { notIn: ["delivered", "cancelled"] },
              billedAt: null,
            },
            include: { client: { select: { id: true, name: true } } },
            orderBy: { deadline: "asc" },
            take: 20,
          })
        : Promise.resolve([]),
    ]);

  const alerts: BillingAlert[] = [];

  for (const c of contracts) {
    const total = Number(c.hoursTotal);
    const used = Number(c.hoursUsed);
    if (!isPackAtLimit(total, used)) continue;
    alerts.push({
      id: `contract:${c.id}`,
      kind: "pack",
      category: "attained",
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
      category: "billable",
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
      category: "billable",
      clientId: "",
      clientName: `${billableGroups.length} cliente(s)`,
      label: "Intervenções por faturar",
      detail: `${totalRows} registos · ${(totalMinutes / 60).toFixed(1)}h`,
      href: "/finance",
    });
  }

  for (const p of overdueProjects) {
    alerts.push({
      id: `deadline:${p.id}`,
      kind: "deadline",
      category: "deadline",
      clientId: p.client.id,
      clientName: p.client.name,
      label: "Deadline ultrapassado",
      detail: `${p.title}${p.deadline ? ` · ${p.deadline.toLocaleDateString("pt-PT")}` : ""}`,
      href: `/projects/${p.id}`,
    });
  }

  return alerts;
}
