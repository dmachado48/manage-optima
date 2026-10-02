import { prisma } from "@/lib/prisma";

export type PlatformConfigData = {
  pricesIncludeVat: boolean;
  showQuarterWithVat: boolean;
  vatRatePercent: number;
  defaultCostRateEur: number | null;
  defaultBillingRateEur: number | null;
  companyName: string;
  companyNif: string;
  companyAddress: string;
  companyEmail: string;
  companyPhone: string;
  companyIban: string;
  companyWebsite: string;
  proposalFooter: string;
  timeRoundingMinutes: number;
  timeMinimumMinutes: number;
  currency: string;
  locale: string;
  fiscalYearStartMonth: number;
  alertBillableEnabled: boolean;
  alertRegisterEnabled: boolean;
  alertAttainedEnabled: boolean;
  alertDeadlineEnabled: boolean;
  alertRegisterSoundEnabled: boolean;
  alertRegisterMinMinutes: number;
  alertRegisterMaxMinutes: number;
};

export const DEFAULT_PLATFORM_CONFIG: PlatformConfigData = {
  pricesIncludeVat: false,
  showQuarterWithVat: false,
  vatRatePercent: 23,
  defaultCostRateEur: null,
  defaultBillingRateEur: null,
  companyName: "Webiton",
  companyNif: "",
  companyAddress: "",
  companyEmail: "",
  companyPhone: "",
  companyIban: "",
  companyWebsite: "webiton.pt",
  proposalFooter:
    "Webiton · webiton.pt · propostas sem IVA · Optima Desk",
  timeRoundingMinutes: 30,
  timeMinimumMinutes: 30,
  currency: "EUR",
  locale: "pt-PT",
  fiscalYearStartMonth: 1,
  alertBillableEnabled: true,
  alertRegisterEnabled: true,
  alertAttainedEnabled: true,
  alertDeadlineEnabled: true,
  alertRegisterSoundEnabled: true,
  alertRegisterMinMinutes: 60,
  alertRegisterMaxMinutes: 90,
};

type PlatformConfigRow = {
  pricesIncludeVat: boolean | number;
  showQuarterWithVat: boolean | number;
  vatRatePercent: unknown;
  defaultCostRateEur: unknown;
  defaultBillingRateEur?: unknown;
  companyName?: string | null;
  companyNif?: string | null;
  companyAddress?: string | null;
  companyEmail?: string | null;
  companyPhone?: string | null;
  companyIban?: string | null;
  companyWebsite?: string | null;
  proposalFooter?: string | null;
  timeRoundingMinutes?: number | null;
  timeMinimumMinutes?: number | null;
  currency?: string | null;
  locale?: string | null;
  fiscalYearStartMonth?: number | null;
  alertBillableEnabled?: boolean | number | null;
  alertRegisterEnabled?: boolean | number | null;
  alertAttainedEnabled?: boolean | number | null;
  alertDeadlineEnabled?: boolean | number | null;
  alertRegisterSoundEnabled?: boolean | number | null;
  alertRegisterMinMinutes?: number | null;
  alertRegisterMaxMinutes?: number | null;
};

function toBool(v: boolean | number | undefined): boolean {
  return v === true || v === 1;
}

function str(v: string | null | undefined, fallback = ""): string {
  return v?.trim() ? v.trim() : fallback;
}

function mapRow(row: PlatformConfigRow): PlatformConfigData {
  return {
    pricesIncludeVat: toBool(row.pricesIncludeVat),
    showQuarterWithVat: toBool(row.showQuarterWithVat),
    vatRatePercent: Number(row.vatRatePercent),
    defaultCostRateEur:
      row.defaultCostRateEur != null ? Number(row.defaultCostRateEur) : null,
    defaultBillingRateEur:
      row.defaultBillingRateEur != null
        ? Number(row.defaultBillingRateEur)
        : null,
    companyName: str(row.companyName, DEFAULT_PLATFORM_CONFIG.companyName),
    companyNif: str(row.companyNif),
    companyAddress: str(row.companyAddress),
    companyEmail: str(row.companyEmail),
    companyPhone: str(row.companyPhone),
    companyIban: str(row.companyIban),
    companyWebsite: str(
      row.companyWebsite,
      DEFAULT_PLATFORM_CONFIG.companyWebsite,
    ),
    proposalFooter: str(
      row.proposalFooter,
      DEFAULT_PLATFORM_CONFIG.proposalFooter,
    ),
    timeRoundingMinutes:
      row.timeRoundingMinutes != null
        ? Number(row.timeRoundingMinutes)
        : DEFAULT_PLATFORM_CONFIG.timeRoundingMinutes,
    timeMinimumMinutes:
      row.timeMinimumMinutes != null
        ? Number(row.timeMinimumMinutes)
        : DEFAULT_PLATFORM_CONFIG.timeMinimumMinutes,
    currency: str(row.currency, DEFAULT_PLATFORM_CONFIG.currency),
    locale: str(row.locale, DEFAULT_PLATFORM_CONFIG.locale),
    fiscalYearStartMonth: Math.min(
      12,
      Math.max(
        1,
        Number(
          row.fiscalYearStartMonth ??
            DEFAULT_PLATFORM_CONFIG.fiscalYearStartMonth,
        ),
      ),
    ),
    alertBillableEnabled:
      row.alertBillableEnabled == null
        ? DEFAULT_PLATFORM_CONFIG.alertBillableEnabled
        : toBool(row.alertBillableEnabled),
    alertRegisterEnabled:
      row.alertRegisterEnabled == null
        ? DEFAULT_PLATFORM_CONFIG.alertRegisterEnabled
        : toBool(row.alertRegisterEnabled),
    alertAttainedEnabled:
      row.alertAttainedEnabled == null
        ? DEFAULT_PLATFORM_CONFIG.alertAttainedEnabled
        : toBool(row.alertAttainedEnabled),
    alertDeadlineEnabled:
      row.alertDeadlineEnabled == null
        ? DEFAULT_PLATFORM_CONFIG.alertDeadlineEnabled
        : toBool(row.alertDeadlineEnabled),
    alertRegisterSoundEnabled:
      row.alertRegisterSoundEnabled == null
        ? DEFAULT_PLATFORM_CONFIG.alertRegisterSoundEnabled
        : toBool(row.alertRegisterSoundEnabled),
    alertRegisterMinMinutes:
      row.alertRegisterMinMinutes != null
        ? Number(row.alertRegisterMinMinutes)
        : DEFAULT_PLATFORM_CONFIG.alertRegisterMinMinutes,
    alertRegisterMaxMinutes:
      row.alertRegisterMaxMinutes != null
        ? Number(row.alertRegisterMaxMinutes)
        : DEFAULT_PLATFORM_CONFIG.alertRegisterMaxMinutes,
  };
}

/** Load config even when Prisma Client DMMF/delegate is stale (Turbopack HMR). */
export async function getPlatformConfig(): Promise<PlatformConfigData> {
  const delegate = (
    prisma as {
      platformConfig?: {
        findUnique: (args: unknown) => Promise<PlatformConfigRow | null>;
      };
    }
  ).platformConfig;

  if (delegate?.findUnique) {
    try {
      const row = await delegate.findUnique({ where: { id: "default" } });
      if (!row) return { ...DEFAULT_PLATFORM_CONFIG };
      return mapRow(row);
    } catch {
      // fall through to raw
    }
  }

  try {
    const rows = await prisma.$queryRaw<PlatformConfigRow[]>`
      SELECT *
      FROM \`PlatformConfig\`
      WHERE \`id\` = 'default'
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return { ...DEFAULT_PLATFORM_CONFIG };
    return mapRow(row);
  } catch {
    return { ...DEFAULT_PLATFORM_CONFIG };
  }
}

/** Convert a stored amount to the display basis used in quarters/finance. */
export function amountForDisplay(
  storedEur: number,
  config: Pick<
    PlatformConfigData,
    "pricesIncludeVat" | "showQuarterWithVat" | "vatRatePercent"
  >,
): number {
  const rate = config.vatRatePercent / 100;
  if (rate <= 0) return storedEur;
  if (config.pricesIncludeVat === config.showQuarterWithVat) return storedEur;
  if (config.showQuarterWithVat) {
    return Math.round(storedEur * (1 + rate) * 100) / 100;
  }
  return Math.round((storedEur / (1 + rate)) * 100) / 100;
}

/** Both VAT bases from a stored amount (depends on how prices were entered). */
export function amountsWithAndWithoutVat(
  storedEur: number,
  config: Pick<PlatformConfigData, "pricesIncludeVat" | "vatRatePercent">,
): { withVat: number; withoutVat: number } {
  const rate = config.vatRatePercent / 100;
  if (rate <= 0) {
    return { withVat: storedEur, withoutVat: storedEur };
  }
  if (config.pricesIncludeVat) {
    return {
      withVat: round2(storedEur),
      withoutVat: round2(storedEur / (1 + rate)),
    };
  }
  return {
    withoutVat: round2(storedEur),
    withVat: round2(storedEur * (1 + rate)),
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function vatLabel(
  config: Pick<PlatformConfigData, "showQuarterWithVat">,
): string {
  return config.showQuarterWithVat ? "c/ IVA" : "s/ IVA";
}

export function priceVatLabel(
  config: Pick<PlatformConfigData, "pricesIncludeVat">,
): string {
  return config.pricesIncludeVat ? "c/ IVA" : "s/ IVA";
}

/** Hourly rate from project total and estimated hours. */
export function calcHourlyRate(totalEur: number, hours: number): number | null {
  if (!Number.isFinite(totalEur) || !Number.isFinite(hours) || hours <= 0) {
    return null;
  }
  return Math.round((totalEur / hours) * 100) / 100;
}

/** Round minutes up to block size, enforcing a minimum. */
export function roundLoggedMinutes(
  minutes: number,
  config: Pick<
    PlatformConfigData,
    "timeRoundingMinutes" | "timeMinimumMinutes"
  >,
): number {
  const raw = Math.max(0, Math.round(minutes));
  const block = config.timeRoundingMinutes;
  const min = config.timeMinimumMinutes;
  if (!block || block <= 0) {
    return Math.max(raw, min > 0 ? min : 0) || raw;
  }
  const rounded = Math.ceil(raw / block) * block;
  return Math.max(rounded, min > 0 ? min : 0);
}

/** Fiscal year label for a date given start month (1–12). */
export function getFiscalYear(
  date = new Date(),
  startMonth = 1,
): number {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  if (startMonth <= 1) return year;
  return month >= startMonth ? year : year - 1;
}

export function formatMoney(
  n: number,
  config: Pick<PlatformConfigData, "currency" | "locale">,
  opts?: { maximumFractionDigits?: number },
): string {
  return new Intl.NumberFormat(config.locale || "pt-PT", {
    style: "currency",
    currency: config.currency || "EUR",
    maximumFractionDigits: opts?.maximumFractionDigits ?? 0,
  }).format(n);
}

/** Map finance actuals into the display VAT basis. */
export function mapActualsForDisplay<
  T extends {
    byQuarter: number[];
    byQuarterMaintenance: number[];
    byQuarterRetainers?: number[];
    byQuarterProjects: number[];
    total: number;
    maintenance: number;
    retainers?: number;
    projects: number;
    topClients: {
      id: string;
      name: string;
      maintenance: number;
      retainers?: number;
      projects: number;
      total: number;
    }[];
    topClientsByQuarter: {
      id: string;
      name: string;
      maintenance: number;
      retainers?: number;
      projects: number;
      total: number;
    }[][];
    pipeline?: {
      pipeline: number;
      approved: number;
      rejected: number;
      approvedEur: number;
      rejectedEur: number;
      sent?: number;
      sentEur?: number;
      retainers?: number;
      retainersEur?: number;
    };
    pipelineByQuarter?: {
      pipeline: number;
      approved: number;
      rejected: number;
      approvedEur: number;
      rejectedEur: number;
      sent?: number;
      sentEur?: number;
      retainers?: number;
      retainersEur?: number;
    }[];
  },
>(
  actuals: T,
  config: Pick<
    PlatformConfigData,
    "pricesIncludeVat" | "showQuarterWithVat" | "vatRatePercent"
  >,
): T {
  const map = (n: number) => amountForDisplay(n, config);
  const mapClient = (c: (typeof actuals.topClients)[number]) => ({
    ...c,
    maintenance: map(c.maintenance),
    retainers: map(c.retainers ?? 0),
    projects: map(c.projects),
    total: map(c.total),
  });
  const mapPipe = (
    p: NonNullable<T["pipeline"]>,
  ): NonNullable<T["pipeline"]> => ({
    ...p,
    approvedEur: map(p.approvedEur),
    rejectedEur: map(p.rejectedEur),
    sentEur: map(p.sentEur ?? 0),
    retainersEur: map(p.retainersEur ?? 0),
  });
  return {
    ...actuals,
    byQuarter: actuals.byQuarter.map(map),
    byQuarterMaintenance: actuals.byQuarterMaintenance.map(map),
    byQuarterRetainers: (actuals.byQuarterRetainers ?? [0, 0, 0, 0]).map(map),
    byQuarterProjects: actuals.byQuarterProjects.map(map),
    total: map(actuals.total),
    maintenance: map(actuals.maintenance),
    retainers: map(actuals.retainers ?? 0),
    projects: map(actuals.projects),
    topClients: actuals.topClients.map(mapClient),
    topClientsByQuarter: actuals.topClientsByQuarter.map((q) =>
      q.map(mapClient),
    ),
    ...(actuals.pipeline ? { pipeline: mapPipe(actuals.pipeline) } : {}),
    ...(actuals.pipelineByQuarter
      ? { pipelineByQuarter: actuals.pipelineByQuarter.map(mapPipe) }
      : {}),
  };
}
