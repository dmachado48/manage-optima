"use client";

import { Button } from "@heroui/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  createContract,
  deactivateContract,
  updateContract,
} from "@/app/actions/clients";
import { upsertFinanceYear } from "@/app/actions/finance";
import { updateAlertSettings, updatePlatformConfig } from "@/app/actions/settings";
import {
  billSelectedInterventions,
  setInterventionBillingStatusForm,
  setInterventionsBillingStatus,
} from "@/app/actions/interventions";
import { markContractBilled } from "@/app/actions/commercial";
import { PlatformPanels } from "@/components/settings/platform-panels";
import {
  INTERVENTION_BILLING_LABELS,
  CONTRACT_TYPE_LABELS,
  DEFAULT_AVENCA_JOB_MD,
  remainingHours,
} from "@/lib/billing";
import { formatDatePt, formatMinutes } from "@/lib/dates";
import type { FinanceActuals } from "@/lib/finance";
import {
  amountsWithAndWithoutVat,
  mapActualsForDisplay,
  vatLabel,
  type PlatformConfigData,
} from "@/lib/platform-config";
import type { InterventionBillingStatus } from "@prisma/client";

type Tab = "contracts" | "goals" | "interventions" | "platform";

type ClientOption = { id: string; name: string };

type ContractRow = {
  id: string;
  type: "retainer" | "pack" | "hourly";
  hoursTotal: number;
  hoursUsed: number;
  hourlyRate: number | null;
  monthlyFeeEur: number | null;
  jobDescription: string | null;
  periodKey: string | null;
  active: boolean;
  billedAt: string | null;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  client: { id: string; name: string };
};

type InterventionRow = {
  id: string;
  minutes: number;
  agreedAmountEur: number | null;
  note: string | null;
  billingStatus: keyof typeof INTERVENTION_BILLING_LABELS;
  performedAt: string;
  client: { id: string; name: string };
  requestTitle: string;
  batchCode: string | null;
};

type BillingReportPreview = {
  batchCode: string;
  body: string;
  clientName: string;
  count: number;
  totalMinutes: number;
};

type Quarter = { quarter: number; target: number };

const TYPE_LABEL = CONTRACT_TYPE_LABELS;

function eur(n: number) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

function currentQuarterIndex(now = new Date()) {
  return Math.floor(now.getMonth() / 3); // 0..3
}

export function SettingsDesk({
  initialTab,
  clients,
  contracts,
  interventions,
  year,
  annualGoal: initialAnnualGoal,
  quarters,
  actuals: rawActuals,
  platformConfig,
}: {
  initialTab: Tab;
  clients: ClientOption[];
  contracts: ContractRow[];
  interventions: InterventionRow[];
  year: number;
  annualGoal: number;
  quarters: Quarter[];
  actuals: FinanceActuals;
  platformConfig: PlatformConfigData;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [showContract, setShowContract] = useState(false);
  const [editContract, setEditContract] = useState<ContractRow | null>(null);
  const [billingFilter, setBillingFilter] = useState<
    "all" | "billable" | "billed" | "included" | "non_billable"
  >("billable");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [query, setQuery] = useState("");
  const [clientId, setClientId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] =
    useState<InterventionBillingStatus>("billed");
  const [reportPreview, setReportPreview] =
    useState<BillingReportPreview | null>(null);
  const [copied, setCopied] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [platformSaved, setPlatformSaved] = useState(false);

  const displayActuals = useMemo(
    () => mapActualsForDisplay(rawActuals, platformConfig),
    [rawActuals, platformConfig],
  );
  const displayVat = vatLabel(platformConfig);

  const defaultAnnual = initialAnnualGoal || 48000;
  const [goalAnnual, setGoalAnnual] = useState(defaultAnnual);
  const [goalQuarters, setGoalQuarters] = useState<number[]>(() => {
    const qMap = Object.fromEntries(quarters.map((q) => [q.quarter, q.target]));
    return [1, 2, 3, 4].map((q) => qMap[q] ?? defaultAnnual / 4);
  });
  /** null = year (geral); 0–3 = quarter filter */
  const [selectedQuarter, setSelectedQuarter] = useState<number | null>(null);
  const [effortHint, setEffortHint] = useState<string | null>(null);

  const cq = currentQuarterIndex();
  const pace =
    goalAnnual > 0
      ? Math.round((rawActuals.total / goalAnnual) * 100)
      : 0;
  const annualGap = Math.round((goalAnnual - rawActuals.total) * 100) / 100;
  const quartersSum = goalQuarters.reduce((a, b) => a + b, 0);
  const quartersDiff = Math.round((goalAnnual - quartersSum) * 100) / 100;

  const pulseScope =
    selectedQuarter == null
      ? rawActuals.pipeline
      : (rawActuals.pipelineByQuarter[selectedQuarter] ?? rawActuals.pipeline);
  const pulseScopeDisplay =
    selectedQuarter == null
      ? displayActuals.pipeline
      : (displayActuals.pipelineByQuarter[selectedQuarter] ??
        displayActuals.pipeline);
  const pulseMax = Math.max(
    pulseScope.pipeline,
    pulseScope.approved,
    pulseScope.rejected,
    pulseScope.retainers,
    pulseScope.sent,
    1,
  );
  const openSentMaxEur = Math.max(
    ...displayActuals.pipelineByQuarter.map((q) => q.sentEur),
    displayActuals.pipeline.sentEur,
    1,
  );
  const totalVatBases = amountsWithAndWithoutVat(
    rawActuals.total,
    platformConfig,
  );
  const goalVatBases = amountsWithAndWithoutVat(goalAnnual, platformConfig);

  const sideMaintenance =
    selectedQuarter == null
      ? displayActuals.maintenance
      : (displayActuals.byQuarterMaintenance[selectedQuarter] ?? 0);
  const sideRetainers =
    selectedQuarter == null
      ? displayActuals.retainers
      : (displayActuals.byQuarterRetainers[selectedQuarter] ?? 0);
  const sideProjects =
    selectedQuarter == null
      ? displayActuals.projects
      : (displayActuals.byQuarterProjects[selectedQuarter] ?? 0);
  const sideTotal =
    selectedQuarter == null
      ? displayActuals.total
      : (displayActuals.byQuarter[selectedQuarter] ?? 0);
  const sideTop =
    selectedQuarter == null
      ? displayActuals.topClients
      : (displayActuals.topClientsByQuarter[selectedQuarter] ??
        displayActuals.topClients);
  const sideTarget =
    selectedQuarter == null
      ? goalAnnual
      : (goalQuarters[selectedQuarter] ?? 0);
  const sidePace =
    sideTarget > 0
      ? Math.round(
          ((selectedQuarter == null
            ? rawActuals.total
            : (rawActuals.byQuarter[selectedQuarter] ?? 0)) /
            sideTarget) *
            100,
        )
      : (selectedQuarter == null
            ? rawActuals.total
            : (rawActuals.byQuarter[selectedQuarter] ?? 0)) > 0
        ? 100
        : 0;
  const sideGap =
    Math.round(
      (sideTarget -
        (selectedQuarter == null
          ? rawActuals.total
          : (rawActuals.byQuarter[selectedQuarter] ?? 0))) *
        100,
    ) / 100;

  function redistributeEffort() {
    // Past quarters: lock target to actual billed (honest baseline)
    // Remaining goal spread evenly across current + future quarters
    const next = [...goalQuarters];
    let locked = 0;
    for (let i = 0; i < cq; i++) {
      next[i] = Math.round(rawActuals.byQuarter[i] ?? 0);
      locked += next[i];
    }
    const remainingGoal = Math.max(0, goalAnnual - locked);
    const open = 4 - cq;
    if (open <= 0) {
      // Already in/after Q4 — only lock past and set Q4 to remainder
      next[3] = remainingGoal;
    } else {
      const each = Math.round(remainingGoal / open);
      let assigned = 0;
      for (let i = cq; i < 4; i++) {
        if (i === 3) {
          next[i] = Math.max(0, remainingGoal - assigned);
        } else {
          next[i] = each;
          assigned += each;
        }
      }
    }
    setGoalQuarters(next);
    setEffortHint(
      cq === 0
        ? "Targets redistribuídos pelos 4 quarters — guarda para aplicar."
        : `Q1–Q${cq} fixos no faturado · resto em Q${cq + 1}–Q4 — guarda para aplicar.`,
    );
  }

  function setQuarterTarget(index: number, value: number) {
    setGoalQuarters((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function run(action: () => Promise<void>) {
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

  function switchTab(next: Tab) {
    setTab(next);
    router.replace(`/settings?tab=${next}`);
  }

  const filteredInterventions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return interventions.filter((i) => {
      if (clientId && i.client.id !== clientId) return false;
      if (billingFilter !== "all" && i.billingStatus !== billingFilter) {
        return false;
      }
      if (dateFrom) {
        if (new Date(i.performedAt) < new Date(`${dateFrom}T00:00:00`)) {
          return false;
        }
      }
      if (dateTo) {
        if (new Date(i.performedAt) > new Date(`${dateTo}T23:59:59.999`)) {
          return false;
        }
      }
      if (!q) return true;
      return (
        i.client.name.toLowerCase().includes(q) ||
        i.requestTitle.toLowerCase().includes(q) ||
        (i.note?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [interventions, billingFilter, dateFrom, dateTo, query, clientId]);

  const selectedVisible = useMemo(
    () => filteredInterventions.filter((i) => selectedIds.includes(i.id)),
    [filteredInterventions, selectedIds],
  );
  const selectedMinutes = selectedVisible.reduce((s, i) => s + i.minutes, 0);

  const visibleIds = useMemo(
    () => filteredInterventions.map((i) => i.id),
    [filteredInterventions],
  );
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.includes(id));

  function toggleSelectAllVisible() {
    if (allVisibleSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
      return;
    }
    setSelectedIds((prev) => [...new Set([...prev, ...visibleIds])]);
  }

  function toggleSelectOne(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function applyBulkStatus() {
    const ids = selectedVisible.map((i) => i.id);
    if (ids.length === 0) return;
    setBulkError(null);

    if (bulkStatus === "billed") {
      startTransition(async () => {
        try {
          const result = await billSelectedInterventions({
            interventionIds: ids,
            markBilled: true,
          });
          setSelectedIds([]);
          setReportPreview({
            batchCode: result.batchCode ?? result.reportId,
            body: result.body,
            clientName: result.clientName,
            count: result.count,
            totalMinutes: result.totalMinutes,
          });
          router.refresh();
        } catch (e) {
          setBulkError(e instanceof Error ? e.message : "Erro ao faturar");
        }
      });
      return;
    }

    run(async () => {
      await setInterventionsBillingStatus(ids, bulkStatus);
      setSelectedIds([]);
    });
  }

  const filteredContracts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contracts.filter((c) => {
      if (clientId && c.client.id !== clientId) return false;
      if (!q) return true;
      return (
        c.client.name.toLowerCase().includes(q) ||
        TYPE_LABEL[c.type].toLowerCase().includes(q)
      );
    });
  }, [contracts, query, clientId]);

  return (
    <main className="desk-page flex flex-1 flex-col gap-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Definições</h1>
          <p className="text-sm text-muted">
            Contratos, objetivos, intervenções e configurações da plataforma
          </p>
        </div>
        {tab === "contracts" ? (
          <Button variant="primary" onPress={() => setShowContract(true)}>
            Adicionar pack
          </Button>
        ) : null}
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg bg-default p-0.5 text-xs">
          {(
            [
              ["contracts", "Contratos / packs"],
              ["goals", "Pulse"],
              ["interventions", "Intervenções"],
              ["platform", "Plataforma"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => switchTab(key)}
              className={
                tab === key
                  ? "rounded-sm bg-foreground/10 px-2.5 py-1.5 font-medium text-foreground"
                  : "rounded-sm px-2.5 py-1.5 text-muted hover:text-foreground"
              }
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "contracts" || tab === "interventions" ? (
          <>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              aria-label="Filtrar por cliente"
            >
              <option value="">Todos os clientes</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pesquisar…"
              className="min-w-[12rem] flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
          </>
        ) : null}
      </div>

      {tab === "contracts" ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="border-b border-border text-xs text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Cliente</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Horas</th>
                <th className="px-3 py-2 font-medium">Tarifa</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium">Início</th>
                <th className="px-3 py-2 font-medium">Fim</th>
                <th className="px-3 py-2 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredContracts.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-8 text-center text-sm text-muted"
                  >
                    <p className="mb-3">
                      {clientId || query
                        ? "Nenhum pack/contrato com estes filtros."
                        : "Ainda não há packs nem contratos."}
                    </p>
                    {!clientId && !query ? (
                      <Button
                        variant="primary"
                        onPress={() => setShowContract(true)}
                      >
                        Adicionar pack
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ) : (
                filteredContracts.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-separator last:border-0"
                  >
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/clients/${c.client.id}`}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {c.client.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-muted">
                      {TYPE_LABEL[c.type]}
                    </td>
                    <td className="px-3 py-2.5 text-muted">
                      {c.type === "hourly"
                        ? "—"
                        : `${remainingHours(c.hoursTotal, c.hoursUsed)}h / ${c.hoursTotal}h`}
                      {c.type === "retainer" && c.periodKey ? (
                        <span className="mt-0.5 block text-[10px] text-muted">
                          Mês {c.periodKey} · sem rollover
                        </span>
                      ) : null}
                      {c.type === "retainer" && c.monthlyFeeEur != null ? (
                        <span className="mt-0.5 block text-[10px] text-muted">
                          {c.monthlyFeeEur.toFixed(0)} €/mês
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-muted">
                      {c.hourlyRate != null ? `${c.hourlyRate} €/h` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-muted">
                      {c.active ? "Ativo" : "Inativo"}
                      {c.billedAt ? " · faturado" : null}
                    </td>
                    <td className="px-3 py-2.5 text-muted">
                      {c.startsAt
                        ? formatDatePt(new Date(c.startsAt))
                        : formatDatePt(new Date(c.createdAt))}
                    </td>
                    <td className="px-3 py-2.5 text-muted">
                      {c.endsAt ? formatDatePt(new Date(c.endsAt)) : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap justify-end gap-1">
                        <button
                          type="button"
                          className="rounded-md border border-border px-2 py-1 text-xs hover:bg-default"
                          onClick={() => setEditContract(c)}
                        >
                          Editar
                        </button>
                        {c.active ? (
                          <button
                            type="button"
                            disabled={pending}
                            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-default disabled:opacity-50"
                            onClick={() =>
                              run(() => deactivateContract(c.id))
                            }
                          >
                            Desativar
                          </button>
                        ) : null}
                        {!c.billedAt &&
                        c.type !== "hourly" &&
                        c.hoursUsed >= c.hoursTotal &&
                        c.hoursTotal > 0 ? (
                          <button
                            type="button"
                            disabled={pending}
                            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-default disabled:opacity-50"
                            onClick={() => run(() => markContractBilled(c.id))}
                          >
                            Marcar faturado
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "goals" ? (
        <div className="flex flex-col gap-4">
          <section className="rounded-xl border border-[color-mix(in_oklab,var(--blue-500)_28%,transparent)] bg-[color-mix(in_oklab,var(--blue-950)_55%,var(--surface))] p-4">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-sm font-medium text-[var(--blue-200)]">
                  Pulse {year} · {displayVat}
                </h2>
                <p className="text-sm text-muted">
                  Realizado vs target — só aprovado / faturado
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-semibold tabular-nums">
                  {eur(displayActuals.total)}{" "}
                  <span className="text-base font-normal text-muted">
                    / {eur(goalAnnual)}
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] tabular-nums text-[var(--blue-300)]">
                  s/ IVA {eur(totalVatBases.withoutVat)} · c/ IVA{" "}
                  {eur(totalVatBases.withVat)}
                </p>
                <p className="text-[10px] tabular-nums text-muted">
                  target s/ IVA {eur(goalVatBases.withoutVat)} · c/ IVA{" "}
                  {eur(goalVatBases.withVat)}
                </p>
              </div>
            </div>
            <div className="pulse-bar-track mb-3 h-2.5">
              <div
                className="pulse-bar-fill bg-[var(--blue-500)]"
                style={{ width: `${Math.min(100, pace)}%` }}
              />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
              <span className="text-[var(--blue-300)]">{pace}% do target</span>
              <span>
                Gap {annualGap >= 0 ? eur(annualGap) : `+${eur(-annualGap)}`}
              </span>
              <span>Intervenções {eur(displayActuals.maintenance)}</span>
              <span>Avenças {eur(displayActuals.retainers)}</span>
              <span>Aprovadas {eur(displayActuals.projects)}</span>
              <span className="text-[var(--blue-400)]">
                Em aberto {eur(displayActuals.pipeline?.sentEur ?? 0)}{" "}
                <span className="text-[10px] uppercase tracking-wide opacity-80">
                  · não conta
                </span>
              </span>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-surface p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-medium">Status bars</h2>
                <p className="text-xs text-muted">
                  {selectedQuarter == null
                    ? "Vista geral do ano"
                    : `Filtrado · Q${selectedQuarter + 1}`}
                  {" · "}clica num quarter para filtrar, ou em Ano para o
                  geral
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedQuarter(null)}
                  className={
                    selectedQuarter == null
                      ? "pulse-chip bg-[var(--blue-600)] text-white"
                      : "pulse-chip bg-[var(--pulse-track)] text-[var(--blue-200)]"
                  }
                >
                  Ano
                </button>
                {[0, 1, 2, 3].map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedQuarter(i)}
                    className={
                      selectedQuarter === i
                        ? "pulse-chip bg-[var(--blue-600)] text-white"
                        : "pulse-chip bg-[var(--pulse-track)] text-[var(--blue-200)]"
                    }
                  >
                    Q{i + 1}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {(
                [
                  [
                    "Pipeline → entregue",
                    pulseScope.pipeline,
                    null as number | null,
                    "var(--pulse-pipeline)",
                    "Projetos abertos (intake → build)",
                  ],
                  [
                    "Propostas enviadas",
                    pulseScope.sent,
                    pulseScopeDisplay.sentEur,
                    "var(--blue-300)",
                    "Em aberto — potencial, fora do total",
                  ],
                  [
                    "Avenças ativas",
                    pulseScope.retainers,
                    pulseScopeDisplay.retainersEur,
                    "var(--blue-500)",
                    "Meses cobertos pelas datas do contrato",
                  ],
                  [
                    "Propostas aprovadas",
                    pulseScope.approved,
                    pulseScopeDisplay.approvedEur,
                    "var(--pulse-approved)",
                    "Conta no total Pulse",
                  ],
                  [
                    "Propostas rejeitadas",
                    pulseScope.rejected,
                    pulseScopeDisplay.rejectedEur,
                    "var(--pulse-rejected)",
                    "Decisões negativas",
                  ],
                ] as const
              ).map(([label, count, amount, color, hint]) => (
                <div
                  key={label}
                  className="rounded-lg border border-[color-mix(in_oklab,var(--blue-500)_20%,transparent)] bg-[color-mix(in_oklab,var(--blue-950)_40%,transparent)] p-3"
                >
                  <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--blue-300)]">
                    {label}
                  </p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {count}
                  </p>
                  {amount != null ? (
                    <p className="text-xs tabular-nums text-muted">
                      {eur(amount)}
                      {label === "Propostas enviadas" ? (
                        <span className="ml-1 text-[10px] uppercase tracking-wide opacity-70">
                          potencial
                        </span>
                      ) : null}
                    </p>
                  ) : (
                    <p className="text-xs text-muted">{hint}</p>
                  )}
                  {hint && amount != null ? (
                    <p className="mt-0.5 text-[10px] text-muted">{hint}</p>
                  ) : null}
                  <div className="pulse-bar-track mt-3">
                    <div
                      className="pulse-bar-fill"
                      style={{
                        width: `${Math.round((count / pulseMax) * 100)}%`,
                        background: color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <section className="rounded-xl border border-border bg-surface p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-medium">Quarters</h2>
                <button
                  type="button"
                  onClick={redistributeEffort}
                  className="rounded-md border border-[var(--blue-600)] bg-[color-mix(in_oklab,var(--blue-600)_20%,transparent)] px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--blue-100)] hover:bg-[color-mix(in_oklab,var(--blue-600)_35%,transparent)]"
                >
                  Ajustar esforço
                </button>
              </div>
              <p className="mb-4 text-xs text-muted">
                “Ajustar esforço” fixa os quarters passados no faturado real e
                redistribui o resto do target anual. Totais em {displayVat}.
                {effortHint ? (
                  <span className="mt-1 block text-[var(--blue-300)]">
                    {effortHint}
                  </span>
                ) : null}
              </p>
              <ul className="grid gap-3 sm:grid-cols-2">
                {[0, 1, 2, 3].map((i) => {
                  const billedRaw = rawActuals.byQuarter[i] ?? 0;
                  const billed = displayActuals.byQuarter[i] ?? 0;
                  const target = goalQuarters[i] ?? 0;
                  const pct =
                    target > 0
                      ? Math.min(100, Math.round((billedRaw / target) * 100))
                      : billedRaw > 0
                        ? 100
                        : 0;
                  const gap = Math.round((target - billedRaw) * 100) / 100;
                  const isCurrent = i === cq;
                  const isPast = i < cq;
                  const isSelected = selectedQuarter === i;
                  const qPipe = rawActuals.pipelineByQuarter[i];
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedQuarter((prev) => (prev === i ? null : i))
                        }
                        className={
                          isSelected
                            ? "w-full rounded-lg border border-[var(--blue-500)] bg-[color-mix(in_oklab,var(--blue-600)_18%,transparent)] p-3 text-left ring-1 ring-[var(--blue-500)]/40"
                            : "w-full rounded-lg border border-border p-3 text-left hover:border-[var(--blue-700)] hover:bg-[color-mix(in_oklab,var(--blue-900)_35%,transparent)]"
                        }
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-xs font-medium uppercase tracking-wide text-[var(--blue-300)]">
                            Q{i + 1}
                            {isCurrent
                              ? " · atual"
                              : isPast
                                ? " · passado"
                                : ""}
                            {isSelected ? " · filtro" : ""}
                          </p>
                          <p className="text-xs text-muted tabular-nums">
                            {pct}%
                          </p>
                        </div>
                        <div className="pulse-bar-track mb-2">
                          <div
                            className="pulse-bar-fill bg-[var(--blue-500)]"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="mb-2 text-sm tabular-nums">
                          {eur(billed)}{" "}
                          <span className="text-muted">
                            / target {eur(target)}
                          </span>
                        </p>
                        <p className="mb-2 text-xs text-muted">
                          Interv.{" "}
                          {eur(displayActuals.byQuarterMaintenance[i] ?? 0)} ·
                          Avenças{" "}
                          {eur(displayActuals.byQuarterRetainers[i] ?? 0)} ·
                          Aprov.{" "}
                          {eur(displayActuals.byQuarterProjects[i] ?? 0)}
                          {gap !== 0
                            ? ` · gap ${gap > 0 ? eur(gap) : `+${eur(-gap)}`}`
                            : ""}
                        </p>
                        <div className="mb-2">
                          <div className="mb-1 flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-[var(--blue-300)]">
                            <span>Em aberto (não no total)</span>
                            <span className="tabular-nums">
                              {qPipe?.sent ?? 0} ·{" "}
                              {eur(
                                displayActuals.pipelineByQuarter[i]?.sentEur ??
                                  0,
                              )}
                            </span>
                          </div>
                          <div className="pulse-bar-track h-1.5">
                            <div
                              className="pulse-bar-fill bg-[var(--blue-300)]"
                              style={{
                                width: `${Math.round(
                                  ((displayActuals.pipelineByQuarter[i]
                                    ?.sentEur ?? 0) /
                                    openSentMaxEur) *
                                    100,
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          <span className="pulse-chip bg-[color-mix(in_oklab,var(--pulse-pipeline)_25%,transparent)] text-[var(--blue-200)]">
                            Pipe {qPipe?.pipeline ?? 0}
                          </span>
                          <span className="pulse-chip bg-[color-mix(in_oklab,var(--blue-300)_30%,transparent)] text-[var(--blue-100)]">
                            Sent {qPipe?.sent ?? 0}
                          </span>
                          <span className="pulse-chip bg-[color-mix(in_oklab,var(--blue-500)_28%,transparent)] text-[var(--blue-100)]">
                            Av. {qPipe?.retainers ?? 0}
                          </span>
                          <span className="pulse-chip bg-[color-mix(in_oklab,var(--pulse-approved)_30%,transparent)] text-[var(--blue-100)]">
                            OK {qPipe?.approved ?? 0}
                          </span>
                          <span className="pulse-chip bg-[color-mix(in_oklab,var(--pulse-rejected)_35%,transparent)] text-[var(--blue-200)]">
                            No {qPipe?.rejected ?? 0}
                          </span>
                        </div>
                      </button>
                      <label className="mt-2 flex flex-col gap-1 text-xs">
                        <span className="text-muted">Target Q{i + 1} (EUR)</span>
                        <input
                          type="number"
                          step="100"
                          min="0"
                          value={Math.round(target)}
                          onFocus={() => setSelectedQuarter(i)}
                          onChange={(e) =>
                            setQuarterTarget(i, Number(e.target.value) || 0)
                          }
                          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                        />
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="rounded-xl border border-border bg-surface p-4">
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-medium">
                  Top 5 ·{" "}
                  {selectedQuarter == null
                    ? "Ano"
                    : `Q${selectedQuarter + 1}`}
                </h2>
                <span className="text-xs text-muted tabular-nums">
                  {eur(sideTotal)} / {eur(sideTarget)} · {sidePace}%
                </span>
              </div>
              {sideTop.length === 0 ? (
                <p className="text-sm text-muted">
                  Sem faturação neste período.
                </p>
              ) : (
                <ol className="space-y-3">
                  {sideTop.map((c, idx) => {
                    const share =
                      sideTotal > 0
                        ? Math.round((c.total / sideTotal) * 100)
                        : 0;
                    return (
                      <li key={c.id}>
                        <div className="mb-1 flex items-baseline justify-between gap-2">
                          <Link
                            href={`/clients/${c.id}`}
                            className="text-sm font-medium underline-offset-2 hover:underline"
                          >
                            {idx + 1}. {c.name}
                          </Link>
                          <span className="text-sm tabular-nums">
                            {eur(c.total)}
                          </span>
                        </div>
                        <div className="pulse-bar-track mb-1 h-1">
                          <div
                            className="pulse-bar-fill bg-[var(--blue-400)]"
                            style={{ width: `${share}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted">
                          Interv. {eur(c.maintenance)} · Avenças{" "}
                          {eur(c.retainers)} · Aprovadas {eur(c.projects)} ·{" "}
                          {share}%
                        </p>
                      </li>
                    );
                  })}
                </ol>
              )}
              <div className="mt-4 border-t border-border pt-3 text-sm">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--blue-300)]">
                  Mix ·{" "}
                  {selectedQuarter == null
                    ? "Ano"
                    : `Q${selectedQuarter + 1}`}
                </p>
                <p>
                  Intervenções{" "}
                  <span className="font-medium tabular-nums">
                    {eur(sideMaintenance)}
                  </span>
                </p>
                <p>
                  Avenças{" "}
                  <span className="font-medium tabular-nums">
                    {eur(sideRetainers)}
                  </span>
                </p>
                <p>
                  Projetos / aprovadas{" "}
                  <span className="font-medium tabular-nums">
                    {eur(sideProjects)}
                  </span>
                </p>
                <p className="mt-1 text-xs text-muted">
                  Gap{" "}
                  {sideGap >= 0 ? eur(sideGap) : `+${eur(-sideGap)}`} vs
                  target
                </p>
              </div>
            </section>
          </div>

          <section className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-medium">Guardar targets</h2>
            <form
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
              action={(fd) => {
                startTransition(async () => {
                  await upsertFinanceYear(fd);
                  router.refresh();
                });
              }}
            >
              <input type="hidden" name="year" value={year} />
              <input type="hidden" name="q1" value={goalQuarters[0]} />
              <input type="hidden" name="q2" value={goalQuarters[1]} />
              <input type="hidden" name="q3" value={goalQuarters[2]} />
              <input type="hidden" name="q4" value={goalQuarters[3]} />
              <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs">
                <span>Target anual (EUR)</span>
                <input
                  name="annualGoal"
                  type="number"
                  step="100"
                  min="0"
                  value={Math.round(goalAnnual)}
                  onChange={(e) =>
                    setGoalAnnual(Number(e.target.value) || 0)
                  }
                  className="rounded-lg border border-border px-3 py-2 text-sm"
                />
              </label>
              <div className="flex flex-1 flex-col gap-1 text-xs text-muted sm:pb-2">
                <span>
                  Soma dos quarters:{" "}
                  <span className="tabular-nums text-foreground">
                    {eur(quartersSum)}
                  </span>
                  {quartersDiff !== 0 ? (
                    <span>
                      {" "}
                      · diferença vs anual{" "}
                      <span className="tabular-nums text-foreground">
                        {quartersDiff > 0
                          ? eur(quartersDiff)
                          : `−${eur(-quartersDiff)}`}
                      </span>
                    </span>
                  ) : (
                    " · alinhada"
                  )}
                </span>
              </div>
              <Button type="submit" variant="primary" isDisabled={pending}>
                Guardar targets
              </Button>
            </form>
          </section>
        </div>
      ) : null}

      {tab === "interventions" ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1 rounded-lg bg-default p-0.5 text-xs">
              {(
                [
                  ["billable", "Por faturar"],
                  ["billed", "Faturadas"],
                  ["included", "Pack"],
                  ["non_billable", "Não faturável"],
                  ["all", "Todas"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setBillingFilter(key);
                    setSelectedIds([]);
                  }}
                  className={
                    billingFilter === key
                      ? "rounded-sm bg-foreground/10 px-2.5 py-1.5 font-medium"
                      : "rounded-sm px-2.5 py-1.5 text-muted hover:text-foreground"
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1 text-xs text-muted">
              De
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setSelectedIds([]);
                }}
                className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
              />
            </label>
            <label className="flex items-center gap-1 text-xs text-muted">
              Até
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setSelectedIds([]);
                }}
                className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
              />
            </label>
          </div>

          {selectedIds.length > 0 ? (
            <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">
                  {selectedVisible.length} selecionada(s)
                </span>
                <span className="rounded-md bg-default px-2 py-1 text-sm tabular-nums">
                  {formatMinutes(selectedMinutes)}
                  <span className="text-muted">
                    {" "}
                    · {(selectedMinutes / 60).toFixed(1)}h
                  </span>
                </span>
                <select
                  value={bulkStatus}
                  onChange={(e) =>
                    setBulkStatus(e.target.value as InterventionBillingStatus)
                  }
                  className="rounded-md border border-border px-2 py-1.5 text-sm"
                >
                  {Object.entries(INTERVENTION_BILLING_LABELS).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
                <Button
                  variant="primary"
                  isDisabled={pending}
                  onPress={applyBulkStatus}
                >
                  {bulkStatus === "billed"
                    ? "Faturar e gerar relatório"
                    : "Aplicar a selecionadas"}
                </Button>
                <button
                  type="button"
                  className="text-xs text-muted underline-offset-2 hover:underline"
                  onClick={() => {
                    setSelectedIds([]);
                    setBulkError(null);
                  }}
                >
                  Limpar seleção
                </button>
              </div>
              {bulkStatus === "billed" ? (
                <p className="text-xs text-muted">
                  Gera um relatório com ID de lote, marca as intervenções como
                  faturadas e associa-as a esse lote (um cliente de cada vez).
                </p>
              ) : null}
              {bulkError ? (
                <p className="text-xs text-red-700">{bulkError}</p>
              ) : null}
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="border-b border-border text-xs text-muted">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      ref={(el) => {
                        if (el) {
                          el.indeterminate =
                            someVisibleSelected && !allVisibleSelected;
                        }
                      }}
                      onChange={toggleSelectAllVisible}
                      aria-label="Selecionar todas"
                      className="size-3.5 accent-foreground"
                    />
                  </th>
                  <th className="px-3 py-2 font-medium">Data</th>
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 font-medium">Pedido</th>
                  <th className="px-3 py-2 font-medium">Tempo</th>
                  <th className="px-3 py-2 font-medium">Valor</th>
                  <th className="px-3 py-2 font-medium">Faturação</th>
                  <th className="px-3 py-2 font-medium">Lote</th>
                  <th className="px-3 py-2 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredInterventions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-3 py-8 text-center text-sm text-muted"
                    >
                      Sem intervenções neste filtro.
                    </td>
                  </tr>
                ) : (
                  filteredInterventions.map((i) => (
                    <tr
                      key={i.id}
                      className={
                        selectedIds.includes(i.id)
                          ? "border-b border-separator bg-default/40 last:border-0"
                          : "border-b border-separator last:border-0"
                      }
                    >
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(i.id)}
                          onChange={() => toggleSelectOne(i.id)}
                          aria-label={`Selecionar ${i.requestTitle}`}
                          className="size-3.5 accent-foreground"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-muted">
                        {formatDatePt(new Date(i.performedAt))}
                      </td>
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/clients/${i.client.id}`}
                          className="font-medium underline-offset-2 hover:underline"
                        >
                          {i.client.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        <p>{i.requestTitle}</p>
                        {i.note ? (
                          <p className="text-xs text-muted line-clamp-1">
                            {i.note}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-muted tabular-nums">
                        {formatMinutes(i.minutes)}
                      </td>
                      <td className="px-3 py-2.5 text-muted tabular-nums">
                        {i.agreedAmountEur != null && i.agreedAmountEur > 0
                          ? `${i.agreedAmountEur.toFixed(2)} €`
                          : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <form
                          action={(fd) => {
                            run(() =>
                              setInterventionBillingStatusForm(i.id, fd),
                            );
                          }}
                        >
                          <select
                            name="billingStatus"
                            defaultValue={i.billingStatus}
                            disabled={pending}
                            onChange={(e) =>
                              e.currentTarget.form?.requestSubmit()
                            }
                            className="rounded-md border border-border px-2 py-1 text-xs"
                          >
                            {Object.entries(INTERVENTION_BILLING_LABELS).map(
                              ([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ),
                            )}
                          </select>
                        </form>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-muted">
                        {i.batchCode ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {i.billingStatus === "billable" ? (
                          <button
                            type="button"
                            disabled={pending}
                            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-default disabled:opacity-50"
                            onClick={() => {
                              setSelectedIds([i.id]);
                              setBulkStatus("billed");
                              setBulkError(null);
                              startTransition(async () => {
                                try {
                                  const result =
                                    await billSelectedInterventions({
                                      interventionIds: [i.id],
                                      markBilled: true,
                                    });
                                  setSelectedIds([]);
                                  setReportPreview({
                                    batchCode: result.batchCode ?? result.reportId,
                                    body: result.body,
                                    clientName: result.clientName,
                                    count: result.count,
                                    totalMinutes: result.totalMinutes,
                                  });
                                  router.refresh();
                                } catch (e) {
                                  setBulkError(
                                    e instanceof Error
                                      ? e.message
                                      : "Erro ao faturar",
                                  );
                                }
                              });
                            }}
                          >
                            Faturar
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {reportPreview ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="flex max-h-[90dvh] w-full max-w-2xl flex-col rounded-xl bg-surface p-4 shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-medium">Relatório para enviar</h2>
                <p className="text-sm text-muted">
                  {reportPreview.clientName} · {reportPreview.count}{" "}
                  intervenção(ões) ·{" "}
                  {formatMinutes(reportPreview.totalMinutes)}
                </p>
                <p className="mt-1 font-mono text-sm">
                  Lote {reportPreview.batchCode}
                </p>
              </div>
              <button
                type="button"
                className="text-sm text-muted"
                onClick={() => setReportPreview(null)}
              >
                Fechar
              </button>
            </div>
            <textarea
              readOnly
              value={reportPreview.body}
              className="min-h-0 flex-1 rounded-lg border border-border bg-default/40 px-3 py-2 font-mono text-xs leading-relaxed"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="primary"
                onPress={async () => {
                  await navigator.clipboard.writeText(reportPreview.body);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? "Copiado" : "Copiar relatório"}
              </Button>
              <Button
                variant="secondary"
                onPress={async () => {
                  await navigator.clipboard.writeText(reportPreview.batchCode);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                Copiar ID do lote
              </Button>
              <Button variant="secondary" onPress={() => setReportPreview(null)}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "platform" ? (
        <div className="flex flex-col gap-4">
          <section className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-1 text-sm font-medium">IVA e preços</h2>
            <p className="mb-4 text-xs text-muted">
              Define se os valores introduzidos (propostas, budgets, tarifas)
              incluem IVA e como os quarters / Pulse os apresentam.
            </p>
            <form
              className="flex flex-col gap-4"
              action={(fd) => {
                startTransition(async () => {
                  fd.set("_section", "vat");
                  await updatePlatformConfig(fd);
                  setPlatformSaved(true);
                  setTimeout(() => setPlatformSaved(false), 2500);
                  router.refresh();
                });
              }}
            >
              <input type="hidden" name="_section" value="vat" />
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  name="pricesIncludeVat"
                  defaultChecked={platformConfig.pricesIncludeVat}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">Preços introduzidos com IVA</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    Se ativo, propostas e budgets já incluem IVA. Se desligado,
                    os valores são sem IVA (padrão atual).
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  name="showQuarterWithVat"
                  defaultChecked={platformConfig.showQuarterWithVat}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">
                    Mostrar quarters com IVA
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    Em Pulse, converte os totais para a base
                    escolhida (c/ ou s/ IVA).
                  </span>
                </span>
              </label>
              <label className="flex max-w-xs flex-col gap-1 text-sm">
                <span className="text-xs text-muted">Taxa de IVA (%)</span>
                <input
                  name="vatRatePercent"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  defaultValue={platformConfig.vatRatePercent}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                />
              </label>
              <label className="flex max-w-xs flex-col gap-1 text-sm">
                <span className="text-xs text-muted">
                  Taxa de custo interna padrão (€/h)
                </span>
                <input
                  name="defaultCostRateEur"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={platformConfig.defaultCostRateEur ?? ""}
                  placeholder="Opcional — aplicada a novos projetos"
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                />
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" variant="primary" isDisabled={pending}>
                  Guardar configurações
                </Button>
                {platformSaved ? (
                  <span className="text-xs text-muted">Guardado</span>
                ) : null}
              </div>
            </form>
          </section>

          <section className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-1 text-sm font-medium">Alertas</h2>
            <p className="mb-4 text-xs text-muted">
              Tipos ativos na mesa. Só o lembrete «Para registar» pode tocar
              som.
            </p>
            <form
              className="flex flex-col gap-4"
              action={(fd) => {
                startTransition(async () => {
                  await updateAlertSettings(fd);
                  setPlatformSaved(true);
                  setTimeout(() => setPlatformSaved(false), 2500);
                  router.refresh();
                });
              }}
            >
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  name="alertBillableEnabled"
                  defaultChecked={platformConfig.alertBillableEnabled}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">Para faturar</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    Intervenções por faturar e projetos entregues.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  name="alertRegisterEnabled"
                  defaultChecked={platformConfig.alertRegisterEnabled}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">Para registar</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    Lembrete «Algo para registar?» após inatividade.
                  </span>
                </span>
              </label>
              <label className="ml-7 flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  name="alertRegisterSoundEnabled"
                  defaultChecked={platformConfig.alertRegisterSoundEnabled}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">Som no lembrete de registar</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    Único alerta sonoro. Os outros tipos ficam silenciosos.
                  </span>
                </span>
              </label>
              <div className="ml-7 flex flex-wrap gap-3">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-muted">Mín. minutos</span>
                  <input
                    type="number"
                    name="alertRegisterMinMinutes"
                    min={15}
                    max={240}
                    step={5}
                    defaultValue={platformConfig.alertRegisterMinMinutes}
                    className="w-24 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-muted">Máx. minutos</span>
                  <input
                    type="number"
                    name="alertRegisterMaxMinutes"
                    min={15}
                    max={360}
                    step={5}
                    defaultValue={platformConfig.alertRegisterMaxMinutes}
                    className="w-24 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
                  />
                </label>
              </div>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  name="alertAttainedEnabled"
                  defaultChecked={platformConfig.alertAttainedEnabled}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">Atingiu</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    Pack ou avença no limite de horas.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  name="alertDeadlineEnabled"
                  defaultChecked={platformConfig.alertDeadlineEnabled}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">Deadline</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    Projetos com prazo ultrapassado.
                  </span>
                </span>
              </label>
              <div className="flex items-center gap-3">
                <Button type="submit" variant="primary" isDisabled={pending}>
                  Guardar alertas
                </Button>
                {platformSaved ? (
                  <span className="text-xs text-muted">Guardado.</span>
                ) : null}
              </div>
            </form>
            <div className="mt-4 rounded-lg border border-dashed border-border bg-default/30 px-3 py-3 text-xs text-muted">
              <p className="font-medium text-foreground">Em produção</p>
              <ol className="mt-2 list-decimal space-y-1 pl-4">
                <li>
                  Fazer deploy (`npm run deploy`) para aplicar schema + código
                  dos alertas.
                </li>
                <li>
                  No servidor: garantir `npx prisma db push` (o script de deploy
                  já o faz) e restart Passenger.
                </li>
                <li>
                  Ligar aqui os tipos desejados (Para registar + som).
                </li>
                <li>
                  Abrir a mesa autenticado — o lembrete sonoro corre no browser
                  (precisa de interação prévia na página para o áudio).
                </li>
                <li>
                  Banners «Para faturar / Atingiu / Deadline» aparecem em Hoje e
                  Comercial quando há dados.
                </li>
              </ol>
            </div>
          </section>

          {(
            ["company", "rates", "proposals", "time", "locale"] as const
          ).map((section) => (
            <PlatformPanels
              key={section}
              section={section}
              platformConfig={platformConfig}
            />
          ))}
        </div>
      ) : null}

      {showContract || editContract ? (
        <ContractModal
          clients={clients}
          editing={editContract}
          defaultClientId={clientId || undefined}
          defaultBillingRateEur={platformConfig.defaultBillingRateEur}
          pending={pending}
          onClose={() => {
            setShowContract(false);
            setEditContract(null);
          }}
          onSubmit={(fd) => {
            startTransition(async () => {
              if (editContract) {
                await updateContract(editContract.id, fd);
              } else {
                await createContract(fd);
              }
              setShowContract(false);
              setEditContract(null);
              router.refresh();
            });
          }}
        />
      ) : null}
    </main>
  );
}

function ContractModal({
  clients,
  editing,
  defaultClientId,
  defaultBillingRateEur,
  pending,
  onClose,
  onSubmit,
}: {
  clients: ClientOption[];
  editing: ContractRow | null;
  defaultClientId?: string;
  defaultBillingRateEur?: number | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (fd: FormData) => void;
}) {
  const [type, setType] = useState<ContractRow["type"]>(
    editing?.type ?? "pack",
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-xl bg-surface p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium">
            {editing ? "Editar contrato" : "Novo contrato"}
          </h2>
          <button type="button" className="text-sm text-muted" onClick={onClose}>
            Fechar
          </button>
        </div>
        <form className="flex flex-col gap-2" action={(fd) => onSubmit(fd)}>
          {editing ? null : (
            <select
              name="clientId"
              required
              className="rounded-lg border border-border px-3 py-2 text-sm"
              defaultValue={defaultClientId || clients[0]?.id}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <select
            name="type"
            required
            value={type}
            onChange={(e) => setType(e.target.value as ContractRow["type"])}
            className="rounded-lg border border-border px-3 py-2 text-sm"
          >
            <option value="pack">Pack (bolsa até esgotar)</option>
            <option value="retainer">Avença (mensal, sem rollover)</option>
            <option value="hourly">Horário</option>
          </select>
          <input
            name="hoursTotal"
            type="number"
            step="0.5"
            min="0"
            defaultValue={editing?.hoursTotal ?? 10}
            placeholder={
              type === "retainer" ? "Horas / mês" : "Horas totais"
            }
            className="rounded-lg border border-border px-3 py-2 text-sm"
          />
          {editing ? (
            <input
              name="hoursUsed"
              type="number"
              step="0.5"
              min="0"
              defaultValue={editing.hoursUsed}
              placeholder="Horas usadas (este mês se avença)"
              className="rounded-lg border border-border px-3 py-2 text-sm"
            />
          ) : null}
          {type === "retainer" ? (
            <>
              <input
                name="monthlyFeeEur"
                type="number"
                step="0.01"
                min="0"
                defaultValue={editing?.monthlyFeeEur ?? ""}
                placeholder="Valor mensal EUR"
                className="rounded-lg border border-border px-3 py-2 text-sm"
              />
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted">
                  Job description (markdown) — âmbito da avença
                </span>
                <textarea
                  name="jobDescription"
                  rows={12}
                  defaultValue={
                    editing?.jobDescription ?? DEFAULT_AVENCA_JOB_MD
                  }
                  className="rounded-lg border border-border px-3 py-2 font-mono text-xs leading-relaxed"
                />
              </label>
              <p className="text-xs text-muted">
                Horas mensais não transitam. No virar do mês o consumo
                reinicia a 0.
              </p>
            </>
          ) : (
            <input
              name="hourlyRate"
              type="number"
              step="0.01"
              min="0"
              defaultValue={
                editing?.hourlyRate ?? defaultBillingRateEur ?? ""
              }
              placeholder="Tarifa €/h (opcional)"
              className="rounded-lg border border-border px-3 py-2 text-sm"
            />
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted">Início</span>
              <input
                name="startsAt"
                type="date"
                required
                defaultValue={
                  editing?.startsAt
                    ? editing.startsAt.slice(0, 10)
                    : new Date().toISOString().slice(0, 10)
                }
                className="rounded-lg border border-border px-3 py-2 text-sm text-foreground"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted">Fim</span>
              <input
                name="endsAt"
                type="date"
                defaultValue={
                  editing?.endsAt ? editing.endsAt.slice(0, 10) : ""
                }
                className="rounded-lg border border-border px-3 py-2 text-sm text-foreground"
              />
            </label>
          </div>
          {editing ? (
            <select
              name="active"
              defaultValue={editing.active ? "true" : "false"}
              className="rounded-lg border border-border px-3 py-2 text-sm"
            >
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </select>
          ) : null}
          <Button type="submit" variant="primary" isDisabled={pending}>
            Guardar
          </Button>
        </form>
      </div>
    </div>
  );
}
