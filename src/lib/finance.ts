import { prisma } from "@/lib/prisma";

export type FinanceClientActual = {
  id: string;
  name: string;
  /** Billed interventions (€) */
  maintenance: number;
  /** Retainer / avença fees (€) */
  retainers: number;
  projects: number;
  total: number;
};

export type PulsePipelineSlice = {
  /** Projects still open / in delivery path */
  pipeline: number;
  /** Approved proposals (count) */
  approved: number;
  /** Rejected proposals (count) */
  rejected: number;
  /** Approved proposal amount EUR */
  approvedEur: number;
  /** Rejected proposal amount EUR */
  rejectedEur: number;
  /** Open/sent proposals awaiting decision (count) */
  sent: number;
  /** Open/sent proposals amount EUR */
  sentEur: number;
  /** Retainer contracts active in the period (count) */
  retainers: number;
  /** Retainer fees accrued in the period EUR */
  retainersEur: number;
};

export type FinanceActuals = {
  byQuarter: number[];
  byQuarterMaintenance: number[];
  byQuarterRetainers: number[];
  byQuarterProjects: number[];
  total: number;
  maintenance: number;
  retainers: number;
  projects: number;
  topClients: FinanceClientActual[];
  /** Top clients per quarter (index 0 = Q1 … 3 = Q4) */
  topClientsByQuarter: FinanceClientActual[][];
  /** Year-wide commercial pipeline / proposal outcomes */
  pipeline: PulsePipelineSlice;
  /** Same metrics scoped per quarter */
  pipelineByQuarter: PulsePipelineSlice[];
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function emptyPipeline(): PulsePipelineSlice {
  return {
    pipeline: 0,
    approved: 0,
    rejected: 0,
    approvedEur: 0,
    rejectedEur: 0,
    sent: 0,
    sentEur: 0,
    retainers: 0,
    retainersEur: 0,
  };
}

function toTopClients(
  byClient: Map<
    string,
    { maintenance: number; retainers: number; projects: number }
  >,
  nameByClient: Map<string, string>,
  limit = 5,
): FinanceClientActual[] {
  return [...byClient.entries()]
    .map(([id, row]) => ({
      id,
      name: nameByClient.get(id) ?? "Cliente",
      maintenance: round2(row.maintenance),
      retainers: round2(row.retainers),
      projects: round2(row.projects),
      total: round2(row.maintenance + row.retainers + row.projects),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

const PIPELINE_PROJECT_STATUSES = [
  "intake",
  "scoping",
  "proposal_sent",
  "approved",
  "in_build",
] as const;

/**
 * Calendar months (0–11) within `year` that overlap [contractStart, contractEnd].
 * Open-ended contracts (no endsAt) run through year-end (or today if year is current).
 */
export function retainerMonthsInYear(
  year: number,
  contractStart: Date,
  contractEnd: Date | null,
  now = new Date(),
): number[] {
  const yearStart = Date.UTC(year, 0, 1);
  const yearEndExclusive = Date.UTC(year + 1, 0, 1);
  const openEnd =
    year === now.getUTCFullYear()
      ? Math.min(now.getTime(), yearEndExclusive - 1)
      : yearEndExclusive - 1;

  const startMs = Math.max(contractStart.getTime(), yearStart);
  const endMs = Math.min(
    contractEnd ? contractEnd.getTime() : openEnd,
    openEnd,
  );
  if (endMs < startMs) return [];

  const months: number[] = [];
  let cursor = new Date(Date.UTC(
    new Date(startMs).getUTCFullYear(),
    new Date(startMs).getUTCMonth(),
    1,
  ));
  const last = new Date(Date.UTC(
    new Date(endMs).getUTCFullYear(),
    new Date(endMs).getUTCMonth(),
    1,
  ));

  while (cursor <= last) {
    if (cursor.getUTCFullYear() === year) {
      months.push(cursor.getUTCMonth());
    }
    cursor = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1),
    );
  }
  return months;
}

export async function getFinanceActuals(year: number): Promise<FinanceActuals> {
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

  const [
    approvedRevenue,
    interventions,
    rateContracts,
    retainerContracts,
    clients,
    decidedProposals,
    openProposals,
    openProjects,
  ] = await Promise.all([
    prisma.proposal.findMany({
      where: {
        status: "approved",
        decidedAt: { gte: start, lte: end },
      },
      select: {
        amountEur: true,
        decidedAt: true,
        project: { select: { clientId: true } },
      },
    }),
    prisma.intervention.findMany({
      where: {
        billingStatus: "billed",
        OR: [
          { billedAt: { gte: start, lte: end } },
          {
            billedAt: null,
            performedAt: { gte: start, lte: end },
          },
        ],
      },
      select: {
        minutes: true,
        agreedAmountEur: true,
        performedAt: true,
        billedAt: true,
        clientId: true,
      },
    }),
    prisma.contract.findMany({
      where: { hourlyRate: { not: null } },
      select: { clientId: true, hourlyRate: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.contract.findMany({
      where: { type: "retainer" },
      select: {
        id: true,
        clientId: true,
        startsAt: true,
        endsAt: true,
        createdAt: true,
        monthlyFeeEur: true,
        active: true,
      },
    }),
    prisma.client.findMany({
      select: { id: true, name: true },
    }),
    prisma.proposal.findMany({
      where: {
        status: { in: ["approved", "rejected"] },
        OR: [
          { decidedAt: { gte: start, lte: end } },
          {
            decidedAt: null,
            updatedAt: { gte: start, lte: end },
          },
        ],
      },
      select: {
        status: true,
        amountEur: true,
        decidedAt: true,
        updatedAt: true,
      },
    }),
    prisma.proposal.findMany({
      where: {
        status: { in: ["sent", "revised"] },
      },
      select: {
        amountEur: true,
        sentAt: true,
        proposalDate: true,
        updatedAt: true,
        createdAt: true,
      },
    }),
    prisma.project.findMany({
      where: {
        status: { in: [...PIPELINE_PROJECT_STATUSES] },
      },
      select: {
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  // monthlyFeeEur may be missing on stale DMMF — fall back to raw
  let retainerRows = retainerContracts.map((c) => ({
    id: c.id,
    clientId: c.clientId,
    startsAt: c.startsAt ?? c.createdAt,
    endsAt: c.endsAt,
    monthlyFeeEur:
      c.monthlyFeeEur != null ? Number(c.monthlyFeeEur) : (null as number | null),
  }));

  if (retainerRows.some((r) => r.monthlyFeeEur == null)) {
    try {
      const fees = await prisma.$queryRaw<
        Array<{ id: string; monthlyFeeEur: unknown }>
      >`
        SELECT \`id\`, \`monthlyFeeEur\` FROM \`Contract\` WHERE \`type\` = 'retainer'
      `;
      const feeById = new Map(
        fees.map((f) => [
          f.id,
          f.monthlyFeeEur == null ? null : Number(f.monthlyFeeEur),
        ]),
      );
      retainerRows = retainerRows.map((r) => ({
        ...r,
        monthlyFeeEur: r.monthlyFeeEur ?? feeById.get(r.id) ?? null,
      }));
    } catch {
      // keep what we have
    }
  }

  const rateByClient = new Map<string, number>();
  for (const c of rateContracts) {
    if (!rateByClient.has(c.clientId) && c.hourlyRate != null) {
      rateByClient.set(c.clientId, Number(c.hourlyRate));
    }
  }

  const nameByClient = new Map(clients.map((c) => [c.id, c.name]));

  const byQuarterMaintenance = [0, 0, 0, 0];
  const byQuarterRetainers = [0, 0, 0, 0];
  const byQuarterProjects = [0, 0, 0, 0];
  const byClient = new Map<
    string,
    { maintenance: number; retainers: number; projects: number }
  >();
  const byClientByQuarter = [0, 1, 2, 3].map(
    () =>
      new Map<
        string,
        { maintenance: number; retainers: number; projects: number }
      >(),
  );

  function bump(
    clientId: string,
    quarter: number,
    kind: "maintenance" | "retainers" | "projects",
    amount: number,
  ) {
    const yearRow = byClient.get(clientId) ?? {
      maintenance: 0,
      retainers: 0,
      projects: 0,
    };
    yearRow[kind] += amount;
    byClient.set(clientId, yearRow);

    const qMap = byClientByQuarter[quarter]!;
    const qRow = qMap.get(clientId) ?? {
      maintenance: 0,
      retainers: 0,
      projects: 0,
    };
    qRow[kind] += amount;
    qMap.set(clientId, qRow);
  }

  for (const p of approvedRevenue) {
    if (!p.decidedAt) continue;
    const q = Math.floor(p.decidedAt.getUTCMonth() / 3);
    const amount = Number(p.amountEur);
    byQuarterProjects[q] += amount;
    bump(p.project.clientId, q, "projects", amount);
  }

  for (const i of interventions) {
    const when = i.billedAt ?? i.performedAt;
    const q = Math.floor(when.getUTCMonth() / 3);
    const agreed =
      i.agreedAmountEur != null ? Number(i.agreedAmountEur) : null;
    const rate = rateByClient.get(i.clientId);
    const amount =
      agreed != null && agreed > 0
        ? agreed
        : rate
          ? (i.minutes / 60) * rate
          : 0;
    if (amount <= 0) continue;
    byQuarterMaintenance[q] += amount;
    bump(i.clientId, q, "maintenance", amount);
  }

  const pipelineYear = emptyPipeline();
  const pipelineByQuarter = [0, 1, 2, 3].map(() => emptyPipeline());
  const retainersCountedInQuarter = [0, 1, 2, 3].map(() => new Set<string>());
  const retainersCountedYear = new Set<string>();

  for (const c of retainerRows) {
    const fee = c.monthlyFeeEur;
    if (fee == null || fee <= 0) continue;
    const months = retainerMonthsInYear(year, c.startsAt, c.endsAt);
    if (months.length === 0) continue;

    retainersCountedYear.add(c.id);
    for (const month of months) {
      const q = Math.floor(month / 3);
      byQuarterRetainers[q] += fee;
      bump(c.clientId, q, "retainers", fee);
      pipelineByQuarter[q]!.retainersEur = round2(
        pipelineByQuarter[q]!.retainersEur + fee,
      );
      retainersCountedInQuarter[q]!.add(c.id);
    }
    pipelineYear.retainersEur = round2(
      pipelineYear.retainersEur + fee * months.length,
    );
  }

  pipelineYear.retainers = retainersCountedYear.size;
  for (let q = 0; q < 4; q++) {
    pipelineByQuarter[q]!.retainers = retainersCountedInQuarter[q]!.size;
  }

  const byQuarter = [0, 1, 2, 3].map((q) =>
    round2(
      byQuarterMaintenance[q] + byQuarterRetainers[q] + byQuarterProjects[q],
    ),
  );
  const maintenance = round2(byQuarterMaintenance.reduce((a, b) => a + b, 0));
  const retainers = round2(byQuarterRetainers.reduce((a, b) => a + b, 0));
  const projectsTotal = round2(byQuarterProjects.reduce((a, b) => a + b, 0));

  for (const proj of openProjects) {
    pipelineYear.pipeline += 1;
    const when =
      proj.updatedAt >= start && proj.updatedAt <= end
        ? proj.updatedAt
        : proj.createdAt >= start && proj.createdAt <= end
          ? proj.createdAt
          : null;
    if (when) {
      const q = Math.floor(when.getUTCMonth() / 3);
      pipelineByQuarter[q]!.pipeline += 1;
    }
  }

  for (const p of decidedProposals) {
    const when = p.decidedAt ?? p.updatedAt;
    if (when < start || when > end) continue;
    const q = Math.floor(when.getUTCMonth() / 3);
    const amount = Number(p.amountEur);
    if (p.status === "approved") {
      pipelineYear.approved += 1;
      pipelineYear.approvedEur = round2(pipelineYear.approvedEur + amount);
      pipelineByQuarter[q]!.approved += 1;
      pipelineByQuarter[q]!.approvedEur = round2(
        pipelineByQuarter[q]!.approvedEur + amount,
      );
    } else if (p.status === "rejected") {
      pipelineYear.rejected += 1;
      pipelineYear.rejectedEur = round2(pipelineYear.rejectedEur + amount);
      pipelineByQuarter[q]!.rejected += 1;
      pipelineByQuarter[q]!.rejectedEur = round2(
        pipelineByQuarter[q]!.rejectedEur + amount,
      );
    }
  }

  // Open (sent / revised) proposals are pipeline-only — never in total /
  // byQuarter / projects. Only approved proposal amounts count as projects.
  for (const p of openProposals) {
    const amount = Number(p.amountEur);
    pipelineYear.sent += 1;
    pipelineYear.sentEur = round2(pipelineYear.sentEur + amount);
    const when =
      p.sentAt ?? p.proposalDate ?? p.updatedAt ?? p.createdAt;
    if (when >= start && when <= end) {
      const q = Math.floor(when.getUTCMonth() / 3);
      pipelineByQuarter[q]!.sent += 1;
      pipelineByQuarter[q]!.sentEur = round2(
        pipelineByQuarter[q]!.sentEur + amount,
      );
    }
  }

  return {
    byQuarter,
    byQuarterMaintenance: byQuarterMaintenance.map(round2),
    byQuarterRetainers: byQuarterRetainers.map(round2),
    byQuarterProjects: byQuarterProjects.map(round2),
    // Realizado only: maintenance + retainers + approved proposals
    total: round2(maintenance + retainers + projectsTotal),
    maintenance,
    retainers,
    projects: projectsTotal,
    topClients: toTopClients(byClient, nameByClient),
    topClientsByQuarter: byClientByQuarter.map((m) =>
      toTopClients(m, nameByClient),
    ),
    pipeline: pipelineYear,
    pipelineByQuarter,
  };
}
