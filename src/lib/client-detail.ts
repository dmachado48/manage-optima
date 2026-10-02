import { parseClientRelation } from "@/lib/clients";
import { loadClientRelation } from "@/lib/clients-db";
import { prisma } from "@/lib/prisma";

export type ClientRequestRow = {
  id: string;
  title: string;
  description: string | null;
  status: "requested" | "in_progress" | "waiting_on_client" | "done";
  source: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  minutesTotal: number;
};

export type ClientContractRow = {
  id: string;
  type: "retainer" | "pack" | "hourly";
  hoursTotal: number;
  hoursUsed: number;
  hourlyRate: number | null;
  monthlyFeeEur: number | null;
  jobDescription: string | null;
  periodKey: string | null;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
};

export type MonthBucket = {
  key: string;
  label: string;
  hours: number;
  revenue: number;
};

export type StatusCount = {
  status: ClientRequestRow["status"];
  count: number;
};

export type ClientRevenue = {
  maintenance: number;
  retainers: number;
  proposals: number;
  total: number;
};

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-PT", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

function lastNMonthKeys(n: number, from = new Date()): string[] {
  const keys: string[] = [];
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    keys.push(monthKey(x));
  }
  return keys;
}

/** Inclusive calendar month keys from start through end (UTC). */
function monthKeysBetween(start: Date, end: Date): string[] {
  const keys: string[] = [];
  let cursor = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1),
  );
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  if (last < cursor) return keys;
  while (cursor <= last) {
    keys.push(monthKey(cursor));
    cursor = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1),
    );
  }
  return keys;
}

export async function getClientDetail(clientId: string) {
  const { syncRetainerPeriodsInDb, loadAvencaContractExtras } = await import(
    "@/lib/billing"
  );
  await syncRetainerPeriodsInDb();
  const avencaExtras = await loadAvencaContractExtras();

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      contracts: { orderBy: { createdAt: "desc" } },
      requests: {
        orderBy: { updatedAt: "desc" },
        include: {
          interventions: { select: { minutes: true, performedAt: true } },
        },
      },
      interventions: {
        orderBy: { performedAt: "desc" },
        select: {
          id: true,
          minutes: true,
          agreedAmountEur: true,
          note: true,
          performedAt: true,
          billingStatus: true,
          billedAt: true,
          request: { select: { id: true, title: true } },
        },
      },
      projects: {
        include: {
          proposals: {
            where: { status: "approved" },
            select: { amountEur: true, decidedAt: true },
          },
        },
      },
    },
  });

  if (!client) return null;

  const rateFromContracts = [...client.contracts]
    .filter((c) => c.hourlyRate != null)
    .sort((a, b) => Number(b.active) - Number(a.active));
  const hourlyRate =
    rateFromContracts.length > 0
      ? Number(rateFromContracts[0].hourlyRate)
      : null;

  const monthKeys = lastNMonthKeys(6);
  const hoursByMonth = new Map(monthKeys.map((k) => [k, 0]));
  const revenueByMonth = new Map(monthKeys.map((k) => [k, 0]));

  let maintenanceRevenue = 0;
  for (const i of client.interventions) {
    const key = monthKey(i.performedAt);
    if (hoursByMonth.has(key)) {
      hoursByMonth.set(key, (hoursByMonth.get(key) ?? 0) + i.minutes / 60);
    }
    if (i.billingStatus === "billed" || i.billingStatus === "billable") {
      const agreed =
        i.agreedAmountEur != null ? Number(i.agreedAmountEur) : null;
      const value =
        agreed != null && agreed > 0
          ? agreed
          : hourlyRate
            ? (i.minutes / 60) * hourlyRate
            : 0;
      if (value <= 0) continue;
      if (i.billingStatus === "billed") {
        maintenanceRevenue += value;
      }
      if (revenueByMonth.has(key) && i.billingStatus === "billed") {
        revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + value);
      }
    }
  }

  let proposalsRevenue = 0;
  for (const project of client.projects) {
    for (const p of project.proposals) {
      const amount = Number(p.amountEur);
      proposalsRevenue += amount;
      if (p.decidedAt) {
        const key = monthKey(p.decidedAt);
        if (revenueByMonth.has(key)) {
          revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + amount);
        }
      }
    }
  }

  let retainersRevenue = 0;
  const now = new Date();
  for (const c of client.contracts) {
    if (c.type !== "retainer") continue;
    const fee = avencaExtras.get(c.id)?.monthlyFeeEur;
    if (fee == null || fee <= 0) continue;
    const start = c.startsAt ?? c.createdAt;
    const end = c.endsAt && c.endsAt < now ? c.endsAt : now;
    for (const key of monthKeysBetween(start, end)) {
      retainersRevenue += fee;
      if (revenueByMonth.has(key)) {
        revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + fee);
      }
    }
  }

  const statusOrder: ClientRequestRow["status"][] = [
    "requested",
    "in_progress",
    "waiting_on_client",
    "done",
  ];
  const statusCounts: StatusCount[] = statusOrder.map((status) => ({
    status,
    count: client.requests.filter((r) => r.status === status).length,
  }));

  const requests: ClientRequestRow[] = client.requests.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    source: r.source,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    closedAt: r.closedAt?.toISOString() ?? null,
    minutesTotal: r.interventions.reduce((sum, i) => sum + i.minutes, 0),
  }));

  const backlog = requests.filter((r) => r.status !== "done");
  const history = requests.filter((r) => r.status === "done");

  const months: MonthBucket[] = monthKeys.map((key) => ({
    key,
    label: monthLabel(key),
    hours: Math.round((hoursByMonth.get(key) ?? 0) * 100) / 100,
    revenue: Math.round((revenueByMonth.get(key) ?? 0) * 100) / 100,
  }));

  const revenue: ClientRevenue = {
    maintenance: Math.round(maintenanceRevenue * 100) / 100,
    retainers: Math.round(retainersRevenue * 100) / 100,
    proposals: Math.round(proposalsRevenue * 100) / 100,
    total:
      Math.round(
        (maintenanceRevenue + retainersRevenue + proposalsRevenue) * 100,
      ) / 100,
  };

  const contracts: ClientContractRow[] = client.contracts.map((c) => {
    const extra = avencaExtras.get(c.id);
    return {
      id: c.id,
      type: c.type,
      hoursTotal: Number(c.hoursTotal),
      hoursUsed: Number(c.hoursUsed),
      hourlyRate: c.hourlyRate != null ? Number(c.hourlyRate) : null,
      monthlyFeeEur: extra?.monthlyFeeEur ?? null,
      jobDescription: extra?.jobDescription ?? null,
      periodKey: extra?.periodKey ?? null,
      active: c.active,
      startsAt: c.startsAt?.toISOString() ?? null,
      endsAt: c.endsAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    };
  });

  const totalMinutes = client.interventions.reduce(
    (sum, i) => sum + i.minutes,
    0,
  );

  return {
    client: {
      id: client.id,
      name: client.name,
      email: client.email,
      domain: client.domain,
      contactName: client.contactName,
      phone: client.phone,
      notes: client.notes,
      active: client.active,
      relation: await loadClientRelation(client.id).catch(() =>
        parseClientRelation((client as { relation?: string }).relation),
      ),
      kanbanShareToken: client.kanbanShareToken,
      createdAt: client.createdAt.toISOString(),
    },
    contracts,
    requests,
    backlog,
    history,
    interventions: client.interventions.map((i) => ({
      id: i.id,
      minutes: i.minutes,
      agreedAmountEur:
        i.agreedAmountEur != null ? Number(i.agreedAmountEur) : null,
      note: i.note,
      performedAt: i.performedAt.toISOString(),
      billingStatus: i.billingStatus,
      billedAt: i.billedAt?.toISOString() ?? null,
      requestTitle: i.request.title,
      requestId: i.request.id,
    })),
    statusCounts,
    months,
    revenue,
    totalMinutes,
    hourlyRate,
  };
}
