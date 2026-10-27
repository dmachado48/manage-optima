"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  interventionBillableAmount,
} from "@/lib/billing";
import { formatMinutes, monthBounds } from "@/lib/dates";
import { getFinanceActuals } from "@/lib/finance";
import { getPlatformConfig } from "@/lib/platform-config";
import { prisma } from "@/lib/prisma";
import { sendSupportEmail } from "@/lib/support-email";

export async function upsertFinanceYear(formData: FormData) {
  await requireAdmin();
  const year = Number(formData.get("year") ?? new Date().getFullYear());
  const annualGoal = Number(formData.get("annualGoal") ?? 0);
  const q1 = Number(formData.get("q1") ?? 0);
  const q2 = Number(formData.get("q2") ?? 0);
  const q3 = Number(formData.get("q3") ?? 0);
  const q4 = Number(formData.get("q4") ?? 0);

  await prisma.$transaction(async (tx) => {
    const fy = await tx.financeYear.upsert({
      where: { year },
      create: { year, annualGoal },
      update: { annualGoal },
    });
    for (const [quarter, target] of [
      [1, q1],
      [2, q2],
      [3, q3],
      [4, q4],
    ] as const) {
      await tx.financeQuarter.upsert({
        where: { yearId_quarter: { yearId: fy.id, quarter } },
        create: { yearId: fy.id, quarter, target },
        update: { target },
      });
    }
  });

  revalidatePath("/settings");
}

function eur(n: number) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n);
}

/**
 * Email current-month billing snapshot + annual/quarter goals
 * to the company email in platform settings.
 */
export async function sendMonthlyFinanceReportEmail() {
  await requireAdmin();
  const platform = await getPlatformConfig();
  const to = platform.companyEmail.trim();
  if (!to) {
    throw new Error(
      "Define o email da empresa em Definições → Plataforma para receber o relatório.",
    );
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const quarter = Math.ceil(month / 3) as 1 | 2 | 3 | 4;
  const { start, end } = monthBounds(year, month);
  const monthLabel = new Intl.DateTimeFormat("pt-PT", {
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 1)));

  const [interventions, fy, actuals, rateContracts] = await Promise.all([
    prisma.intervention.findMany({
      where: {
        performedAt: { gte: start, lte: end },
        billingStatus: { in: ["billable", "billed", "included"] },
      },
      include: {
        client: { select: { id: true, name: true } },
        request: { select: { title: true } },
      },
      orderBy: { performedAt: "asc" },
    }),
    prisma.financeYear.findUnique({
      where: { year },
      include: { quarters: true },
    }),
    getFinanceActuals(year),
    prisma.contract.findMany({
      where: { hourlyRate: { not: null } },
      select: { clientId: true, hourlyRate: true, active: true },
      orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
    }),
  ]);

  const rateByClient = new Map<string, number>();
  for (const c of rateContracts) {
    if (rateByClient.has(c.clientId) || c.hourlyRate == null) continue;
    rateByClient.set(c.clientId, Number(c.hourlyRate));
  }

  let billableEur = 0;
  let billedEur = 0;
  let includedMinutes = 0;
  let billableMinutes = 0;
  let billedMinutes = 0;
  const byClient = new Map<
    string,
    { name: string; minutes: number; amount: number }
  >();

  for (const i of interventions) {
    const amount =
      interventionBillableAmount(
        i.minutes,
        i.agreedAmountEur != null ? Number(i.agreedAmountEur) : null,
        rateByClient.get(i.clientId) ?? null,
      ) ?? 0;
    if (i.billingStatus === "billable") {
      billableEur += amount;
      billableMinutes += i.minutes;
    } else if (i.billingStatus === "billed") {
      billedEur += amount;
      billedMinutes += i.minutes;
    } else {
      includedMinutes += i.minutes;
    }
    const row = byClient.get(i.clientId) ?? {
      name: i.client.name,
      minutes: 0,
      amount: 0,
    };
    row.minutes += i.minutes;
    row.amount += amount;
    byClient.set(i.clientId, row);
  }

  const annualGoal = fy ? Number(fy.annualGoal) : 0;
  const quarterGoal = fy
    ? Number(fy.quarters.find((q) => q.quarter === quarter)?.target ?? 0)
    : 0;
  const ytd = actuals.total;
  const quarterActual = actuals.byQuarter[quarter - 1] ?? 0;

  const clientLines = [...byClient.values()]
    .sort((a, b) => b.amount - a.amount || b.minutes - a.minutes)
    .map(
      (c) =>
        `• ${c.name}: ${formatMinutes(c.minutes)}${c.amount > 0 ? ` · ${eur(c.amount)}` : ""}`,
    )
    .join("\n");

  const text = [
    `Relatório financeiro — ${monthLabel}`,
    platform.companyName ? `Empresa: ${platform.companyName}` : "",
    "",
    "— Mês atual —",
    `Por faturar: ${eur(billableEur)} · ${formatMinutes(billableMinutes)}`,
    `Já faturado: ${eur(billedEur)} · ${formatMinutes(billedMinutes)}`,
    `Incluído (pack/avença): ${formatMinutes(includedMinutes)}`,
    `Total mês (faturável+faturado): ${eur(billableEur + billedEur)}`,
    "",
    "— Objetivos —",
    `Objetivo anual ${year}: ${eur(annualGoal)} · YTD: ${eur(ytd)} (${annualGoal > 0 ? Math.round((ytd / annualGoal) * 100) : 0}%)`,
    `Objetivo Q${quarter}: ${eur(quarterGoal)} · Realizado: ${eur(quarterActual)} (${quarterGoal > 0 ? Math.round((quarterActual / quarterGoal) * 100) : 0}%)`,
    "",
    "— Por cliente (mês) —",
    clientLines || "Sem registos este mês.",
    "",
    "Gerado automaticamente pelo Optima Desk.",
  ]
    .filter((line) => line !== "")
    .join("\n");

  const html = `<pre style="font-family:ui-monospace,monospace;font-size:13px;line-height:1.45;white-space:pre-wrap">${text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")}</pre>`;

  await sendSupportEmail({
    to,
    subject: `Optima · Faturação ${monthLabel}`,
    text,
    html,
  });

  return { ok: true as const, to, monthLabel };
}
