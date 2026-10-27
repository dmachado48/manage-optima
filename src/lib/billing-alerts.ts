import "server-only";

import { isPackAtLimit, type BillingAlert } from "@/lib/billing";
import { getPlatformConfig } from "@/lib/platform-config";
import { prisma } from "@/lib/prisma";

/** Default threshold when the client has no pack/avença agreement. */
const DEFAULT_HOURS_THRESHOLD = 10;

export async function getBillingAlerts(): Promise<BillingAlert[]> {
  const config = await getPlatformConfig();

  const [contracts, projects, billableGroups, overdueProjects, monthHours] =
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
      // Hours registered this calendar month (any billing status except non_billable)
      config.alertAttainedEnabled
        ? prisma.intervention.groupBy({
            by: ["clientId"],
            where: {
              billingStatus: { in: ["included", "billable", "billed"] },
              performedAt: {
                gte: new Date(
                  Date.UTC(
                    new Date().getUTCFullYear(),
                    new Date().getUTCMonth(),
                    1,
                  ),
                ),
              },
            },
            _sum: { minutes: true },
          })
        : Promise.resolve([]),
    ]);

  const alerts: BillingAlert[] = [];
  const attainedClientIds = new Set<string>();

  for (const c of contracts) {
    const total = Number(c.hoursTotal);
    const used = Number(c.hoursUsed);
    if (!isPackAtLimit(total, used)) continue;
    attainedClientIds.add(c.client.id);
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

  // Per-client: 10h default, or agreement hoursTotal when pack/avença exists
  if (config.alertAttainedEnabled && monthHours.length > 0) {
    const clientIds = monthHours.map((g) => g.clientId);
    const [clients, activeContracts] = await Promise.all([
      prisma.client.findMany({
        where: { id: { in: clientIds } },
        select: { id: true, name: true },
      }),
      prisma.contract.findMany({
        where: {
          clientId: { in: clientIds },
          active: true,
          type: { in: ["pack", "retainer"] },
        },
        select: {
          clientId: true,
          hoursTotal: true,
          type: true,
        },
      }),
    ]);
    const nameById = new Map(clients.map((c) => [c.id, c.name]));
    const contractByClient = new Map(
      activeContracts.map((c) => [c.clientId, c]),
    );

    for (const g of monthHours) {
      if (attainedClientIds.has(g.clientId)) continue;
      const hours = (g._sum.minutes ?? 0) / 60;
      const contract = contractByClient.get(g.clientId);
      const threshold = contract
        ? Number(contract.hoursTotal)
        : DEFAULT_HOURS_THRESHOLD;
      if (threshold <= 0 || hours < threshold) continue;

      const name = nameById.get(g.clientId) ?? "Cliente";
      alerts.push({
        id: `hours:${g.clientId}`,
        kind: "pack",
        category: "attained",
        clientId: g.clientId,
        clientName: name,
        label: contract
          ? contract.type === "pack"
            ? "Pack atingido"
            : "Avença atingida"
          : `${DEFAULT_HOURS_THRESHOLD}h registadas`,
        detail: contract
          ? `${hours.toFixed(1)}h / ${threshold.toFixed(1)}h (acordo)`
          : `${hours.toFixed(1)}h este mês — rever faturação`,
        href: `/clients/${g.clientId}`,
      });
    }
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
