import { formatDatePt, formatMinutes } from "./dates";

export type ResumeIntervention = {
  clientName: string;
  minutes: number;
  agreedAmountEur?: number | null;
  note: string | null;
  performedAt: Date;
  requestTitle: string;
};

export function draftDayResumePt(
  interventions: ResumeIntervention[],
  totalMinutes: number,
): string {
  if (interventions.length === 0) {
    return "Hoje ainda não há intervenções registadas. Usa o Registar trabalho para capturar o que fizeste.";
  }

  const byClient = new Map<string, number>();
  for (const i of interventions) {
    byClient.set(i.clientName, (byClient.get(i.clientName) ?? 0) + i.minutes);
  }
  const clientBits = [...byClient.entries()]
    .map(([name, mins]) => `${name} (${formatMinutes(mins)})`)
    .join(", ");

  const lines = interventions
    .slice(0, 5)
    .map(
      (i) =>
        `• ${i.clientName}: ${i.requestTitle} — ${formatMinutes(i.minutes)}${i.note ? ` (${i.note})` : ""}`,
    );

  return [
    `Resumo de ${formatDatePt(new Date())}.`,
    `Registei ${interventions.length} intervenção${interventions.length === 1 ? "" : "ões"} totalizando ${formatMinutes(totalMinutes)}.`,
    `Clientes: ${clientBits}.`,
    lines.join("\n"),
  ].join("\n\n");
}

export function draftMonthlyReportPt(input: {
  clientName: string;
  year: number;
  month: number;
  interventions: ResumeIntervention[];
  hoursUsed?: number | null;
  hoursRemaining?: number | null;
}): string {
  const monthLabel = new Intl.DateTimeFormat("pt-PT", {
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(input.year, input.month - 1, 1)));

  const total = input.interventions.reduce((s, i) => s + i.minutes, 0);
  const list =
    input.interventions.length === 0
      ? "Sem intervenções neste período."
      : input.interventions
          .map(
            (i) =>
              `- ${formatDatePt(i.performedAt)} · ${formatMinutes(i.minutes)} · ${i.requestTitle}${i.note ? ` — ${i.note}` : ""}`,
          )
          .join("\n");

  const contractLine =
    input.hoursUsed != null && input.hoursRemaining != null
      ? `\nHoras do pacote/retainer: ${input.hoursUsed.toFixed(1)}h usadas · ${input.hoursRemaining.toFixed(1)}h restantes.`
      : "";

  return [
    `Relatório de intervenções — ${input.clientName}`,
    `Período: ${monthLabel}`,
    `Total: ${formatMinutes(total)} (${input.interventions.length} registo${input.interventions.length === 1 ? "" : "s"}).${contractLine}`,
    "",
    "Intervenções:",
    list,
  ].join("\n");
}

/** Report from an explicit selection (billing batch). */
export function draftSelectionReportPt(input: {
  clientName: string;
  interventions: ResumeIntervention[];
  markBilled: boolean;
  batchCode: string;
}): string {
  const sorted = [...input.interventions].sort(
    (a, b) => a.performedAt.getTime() - b.performedAt.getTime(),
  );
  const total = sorted.reduce((s, i) => s + i.minutes, 0);
  const from = sorted[0]?.performedAt;
  const to = sorted[sorted.length - 1]?.performedAt;
  const period =
    from && to
      ? from.toDateString() === to.toDateString()
        ? formatDatePt(from)
        : `${formatDatePt(from)} — ${formatDatePt(to)}`
      : "—";

  const list = sorted
    .map((i) => {
      const amount =
        i.agreedAmountEur != null && i.agreedAmountEur > 0
          ? ` · ${i.agreedAmountEur.toFixed(2)} €`
          : "";
      return `- ${formatDatePt(i.performedAt)} · ${formatMinutes(i.minutes)}${amount} · ${i.requestTitle}${i.note ? ` — ${i.note}` : ""}`;
    })
    .join("\n");

  const totalAgreed = sorted.reduce(
    (s, i) => s + (i.agreedAmountEur != null && i.agreedAmountEur > 0 ? i.agreedAmountEur : 0),
    0,
  );

  return [
    `Relatório de intervenções — ${input.clientName}`,
    `Ref. lote: ${input.batchCode}`,
    `Período: ${period}`,
    `Total: ${formatMinutes(total)} (${sorted.length} registo${sorted.length === 1 ? "" : "s"})${totalAgreed > 0 ? ` · ${totalAgreed.toFixed(2)} € acordados` : ""}.`,
    input.markBilled ? "Estado: marcado como faturado neste relatório." : "",
    "",
    "Intervenções:",
    list || "Sem intervenções.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

