export function assertValidMinutes(minutes: number): void {
  if (!Number.isInteger(minutes) || minutes <= 0 || minutes % 30 !== 0) {
    throw new Error(
      "As intervenções devem ser múltiplos positivos de 30 minutos.",
    );
  }
}

export function hoursFromMinutes(minutes: number): number {
  return minutes / 60;
}

export function remainingHours(hoursTotal: number, hoursUsed: number): number {
  return Math.round((hoursTotal - hoursUsed) * 100) / 100;
}

export function shouldDeduct(type: "retainer" | "pack" | "hourly"): boolean {
  return type === "pack" || type === "retainer";
}

/** Pack / avença plafond reached or exceeded. */
export function isPackAtLimit(hoursTotal: number, hoursUsed: number): boolean {
  if (hoursTotal <= 0) return false;
  return hoursUsed >= hoursTotal;
}

/** Calendar month key in Europe/Lisbon — used for avença non-rollover hours. */
export function currentPeriodKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
  }).format(date);
}

export const CONTRACT_TYPE_LABELS: Record<
  "retainer" | "pack" | "hourly",
  string
> = {
  retainer: "Avença",
  pack: "Pack",
  hourly: "Horário",
};

export const DEFAULT_AVENCA_JOB_MD = `# Âmbito da avença

## Incluído
- 

## Fora de âmbito
- 

## Canal e prioridades
- 

## Notas
- Horas mensais **não transitam** para o mês seguinte.
`;

export const INTERVENTION_BILLING_LABELS: Record<
  "included" | "billable" | "billed" | "non_billable",
  string
> = {
  included: "Incluída (pack/avença)",
  billable: "Por faturar",
  billed: "Faturada",
  non_billable: "Não faturável",
};

export type BillingAlert = {
  id: string;
  kind: "pack" | "project" | "interventions";
  clientId: string;
  clientName: string;
  label: string;
  detail: string;
  href: string;
};

/** Reset avença hours when calendar month changed (non-rollover). */
export async function syncRetainerPeriodsInDb() {
  const key = currentPeriodKey();
  const { prisma } = await import("@/lib/prisma");
  await prisma.$executeRaw`
    UPDATE \`Contract\`
    SET \`periodKey\` = ${key}, \`hoursUsed\` = 0, \`billedAt\` = NULL
    WHERE \`type\` = 'retainer'
      AND \`active\` = true
      AND (\`periodKey\` IS NULL OR \`periodKey\` <> ${key})
  `;
}

export type AvencaContractExtras = {
  id: string;
  monthlyFeeEur: number | null;
  jobDescription: string | null;
  periodKey: string | null;
};

/** Load avença columns even when Prisma Client DMMF is stale. */
export async function loadAvencaContractExtras(): Promise<
  Map<string, AvencaContractExtras>
> {
  const { prisma } = await import("@/lib/prisma");
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      monthlyFeeEur: unknown;
      jobDescription: string | null;
      periodKey: string | null;
    }>
  >`
    SELECT \`id\`, \`monthlyFeeEur\`, \`jobDescription\`, \`periodKey\`
    FROM \`Contract\`
  `;

  return new Map(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        monthlyFeeEur:
          r.monthlyFeeEur == null ? null : Number(r.monthlyFeeEur),
        jobDescription: r.jobDescription,
        periodKey: r.periodKey,
      },
    ]),
  );
}
