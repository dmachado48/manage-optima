"use client";

import { Button } from "@heroui/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  billSelectedInterventions,
  setInterventionBillingStatusForm,
  setInterventionsBillingStatus,
} from "@/app/actions/interventions";
import {
  INTERVENTION_BILLING_LABELS,
  interventionBillableAmount,
} from "@/lib/billing";
import { formatDatePt, formatMinutes } from "@/lib/dates";
import type { InterventionBillingStatus } from "@prisma/client";

export type FinanceIntervention = {
  id: string;
  minutes: number;
  agreedAmountEur: number | null;
  note: string | null;
  billingStatus: keyof typeof INTERVENTION_BILLING_LABELS;
  performedAt: string;
  client: { id: string; name: string };
  requestTitle: string;
  requestId: string;
  batchCode: string | null;
  hourlyRate: number | null;
};

type ClientOption = { id: string; name: string };

type StatusFilter = "billable" | "billed" | "all";

function eur(n: number) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n);
}

function rowAmount(i: FinanceIntervention): number | null {
  return interventionBillableAmount(
    i.minutes,
    i.agreedAmountEur,
    i.hourlyRate,
  );
}

function currentMonthRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return {
    from: start.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  };
}

export function FinanceDesk({
  clients,
  interventions,
}: {
  clients: ClientOption[];
  interventions: FinanceIntervention[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const initial = useMemo(() => currentMonthRange(), []);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("billable");
  const [clientId, setClientId] = useState("");
  const [dateFrom, setDateFrom] = useState(initial.from);
  const [dateTo, setDateTo] = useState(initial.to);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [reportPreview, setReportPreview] = useState<{
    batchCode: string;
    body: string;
    clientName: string;
    count: number;
    totalMinutes: number;
  } | null>(null);

  const filtered = useMemo(() => {
    return interventions.filter((i) => {
      if (statusFilter === "billable" && i.billingStatus !== "billable") {
        return false;
      }
      if (statusFilter === "billed" && i.billingStatus !== "billed") {
        return false;
      }
      if (clientId && i.client.id !== clientId) return false;
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
      return true;
    });
  }, [interventions, statusFilter, clientId, dateFrom, dateTo]);

  const totals = useMemo(() => {
    const minutes = filtered.reduce((s, i) => s + i.minutes, 0);
    const amount = filtered.reduce((s, i) => s + (rowAmount(i) ?? 0), 0);
    return {
      count: filtered.length,
      minutes,
      amount: Math.round(amount * 100) / 100,
    };
  }, [filtered]);

  const selectedVisible = useMemo(
    () => filtered.filter((i) => selectedIds.includes(i.id)),
    [filtered, selectedIds],
  );
  const selectedMinutes = selectedVisible.reduce((s, i) => s + i.minutes, 0);
  const selectedAmount = selectedVisible.reduce(
    (s, i) => s + (rowAmount(i) ?? 0),
    0,
  );

  const visibleIds = filtered.map((i) => i.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
      return;
    }
    setSelectedIds((prev) => [...new Set([...prev, ...visibleIds])]);
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function run(action: () => Promise<void>) {
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

  function billSelection(ids: string[]) {
    setBulkError(null);
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
  }

  return (
    <div className="desk-page flex min-h-0 flex-1 flex-col gap-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Financeiro</h1>
          <p className="text-sm text-muted">
            Controlo do que está por faturar e do já faturado
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <div className="rounded-lg border border-border bg-surface px-3 py-2">
            <p className="text-[11px] text-muted">Registos</p>
            <p className="font-semibold tabular-nums">{totals.count}</p>
          </div>
          <div className="rounded-lg border border-border bg-surface px-3 py-2">
            <p className="text-[11px] text-muted">Tempo</p>
            <p className="font-semibold tabular-nums">
              {formatMinutes(totals.minutes)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface px-3 py-2">
            <p className="text-[11px] text-muted">Valor estimado</p>
            <p className="font-semibold tabular-nums">{eur(totals.amount)}</p>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex gap-1 rounded-lg bg-default p-0.5 text-xs">
          {(
            [
              ["billable", "Por faturar"],
              ["billed", "Faturado"],
              ["all", "Tudo"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setStatusFilter(key);
                setSelectedIds([]);
              }}
              className={
                statusFilter === key
                  ? "rounded-sm bg-foreground/10 px-2.5 py-1.5 font-medium"
                  : "rounded-sm px-2.5 py-1.5 text-muted hover:text-foreground"
              }
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Cliente
          <select
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              setSelectedIds([]);
            }}
            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground"
          >
            <option value="">Todos</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          De
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setSelectedIds([]);
            }}
            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Até
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setSelectedIds([]);
            }}
            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground"
          />
        </label>
        <button
          type="button"
          className="rounded-md border border-border px-2 py-1.5 text-xs hover:bg-default"
          onClick={() => {
            const range = currentMonthRange();
            setDateFrom(range.from);
            setDateTo(range.to);
            setSelectedIds([]);
          }}
        >
          Este mês
        </button>
        <button
          type="button"
          className="rounded-md border border-border px-2 py-1.5 text-xs text-muted hover:bg-default"
          onClick={() => {
            setDateFrom("");
            setDateTo("");
            setSelectedIds([]);
          }}
        >
          Sem datas
        </button>
      </div>

      {selectedIds.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">
              {selectedVisible.length} selecionada(s)
            </span>
            <span className="rounded-md bg-default px-2 py-1 text-sm tabular-nums">
              {formatMinutes(selectedMinutes)} · {eur(selectedAmount)}
            </span>
            <Button
              variant="primary"
              isDisabled={pending}
              onPress={() => billSelection(selectedVisible.map((i) => i.id))}
            >
              Faturar e gerar relatório
            </Button>
            <Button
              variant="secondary"
              isDisabled={pending}
              onPress={() =>
                run(async () => {
                  await setInterventionsBillingStatus(
                    selectedVisible.map((i) => i.id),
                    "billable",
                  );
                  setSelectedIds([]);
                })
              }
            >
              Marcar por faturar
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
          <p className="text-xs text-muted">
            A faturação em lote exige intervenções do mesmo cliente.
          </p>
          {bulkError ? (
            <p className="text-xs text-red-700">{bulkError}</p>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[52rem] text-left text-sm">
          <thead className="border-b border-border text-xs text-muted">
            <tr>
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAll}
                  aria-label="Selecionar todas"
                  className="size-3.5 accent-foreground"
                />
              </th>
              <th className="px-3 py-2 font-medium">Data</th>
              <th className="px-3 py-2 font-medium">Cliente</th>
              <th className="px-3 py-2 font-medium">Pedido</th>
              <th className="px-3 py-2 font-medium">Tempo</th>
              <th className="px-3 py-2 font-medium">Valor</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium">Lote</th>
              <th className="px-3 py-2 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-10 text-center text-sm text-muted"
                >
                  Sem registos neste filtro.
                </td>
              </tr>
            ) : (
              filtered.map((i) => {
                const amount = rowAmount(i);
                return (
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
                        onChange={() => toggleOne(i.id)}
                        aria-label={`Selecionar ${i.requestTitle}`}
                        className="size-3.5 accent-foreground"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted">
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
                        <p className="line-clamp-1 text-xs text-muted">
                          {i.note}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-muted">
                      {formatMinutes(i.minutes)}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-muted">
                      {amount != null && amount > 0 ? eur(amount) : "—"}
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
                          {(
                            [
                              "billable",
                              "billed",
                              "included",
                              "non_billable",
                            ] as InterventionBillingStatus[]
                          ).map((value) => (
                            <option key={value} value={value}>
                              {INTERVENTION_BILLING_LABELS[value]}
                            </option>
                          ))}
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
                          onClick={() => billSelection([i.id])}
                        >
                          Faturar
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {reportPreview ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="flex max-h-[90dvh] w-full max-w-2xl flex-col rounded-xl bg-surface p-4 shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-medium">Relatório gerado</h2>
                <p className="text-xs text-muted">
                  {reportPreview.clientName} · {reportPreview.batchCode} ·{" "}
                  {reportPreview.count} registos ·{" "}
                  {formatMinutes(reportPreview.totalMinutes)}
                </p>
              </div>
              <Button variant="secondary" onPress={() => setReportPreview(null)}>
                Fechar
              </Button>
            </div>
            <pre className="flex-1 overflow-auto whitespace-pre-wrap rounded-lg bg-default/50 p-3 text-xs leading-relaxed">
              {reportPreview.body}
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}
