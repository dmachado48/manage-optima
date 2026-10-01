"use client";

import { Button } from "@heroui/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  createContract,
  deleteClient,
  setClientActive,
  updateClient,
} from "@/app/actions/clients";
import { setInterventionBillingStatusForm } from "@/app/actions/interventions";
import {
  CONTRACT_TYPE_LABELS,
  DEFAULT_AVENCA_JOB_MD,
  INTERVENTION_BILLING_LABELS,
  remainingHours,
} from "@/lib/billing";
import { formatDatePt, formatMinutes } from "@/lib/dates";
import {
  CLIENT_RELATION_LABELS,
  CLIENT_RELATION_OPTIONS,
} from "@/lib/clients";
import type {
  ClientContractRow,
  ClientRequestRow,
  ClientRevenue,
  MonthBucket,
  StatusCount,
} from "@/lib/client-detail";

function inRange(iso: string, from: string, to: string): boolean {
  const day = iso.slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

const STATUS_LABEL: Record<ClientRequestRow["status"], string> = {
  requested: "Pedido",
  in_progress: "Em curso",
  waiting_on_client: "À espera",
  done: "Concluído",
};

const STATUS_COLOR: Record<ClientRequestRow["status"], string> = {
  requested: "#94a3b8",
  in_progress: "#60a5fa",
  waiting_on_client: "#f59e0b",
  done: "#4ade80",
};

const TYPE_LABEL = CONTRACT_TYPE_LABELS;

const SOURCE_LABEL: Record<string, string> = {
  email: "Email",
  manual: "Manual",
  portal: "Portal",
  ad_hoc: "Ad hoc",
};

function eur(n: number) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

function BarChart({
  data,
  valueKey,
  color,
  unit,
}: {
  data: MonthBucket[];
  valueKey: "hours" | "revenue";
  color: string;
  unit: string;
}) {
  const max = Math.max(...data.map((d) => d[valueKey]), 0.01);
  const w = 320;
  const h = 120;
  const pad = { t: 8, r: 8, b: 28, l: 8 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const gap = 8;
  const barW = (innerW - gap * (data.length - 1)) / data.length;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-28 w-full" role="img">
      {data.map((d, i) => {
        const v = d[valueKey];
        const barH = (v / max) * innerH;
        const x = pad.l + i * (barW + gap);
        const y = pad.t + innerH - barH;
        return (
          <g key={d.key}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={Math.max(barH, v > 0 ? 2 : 0)}
              rx={3}
              fill={color}
              opacity={v > 0 ? 1 : 0.15}
            />
            <text
              x={x + barW / 2}
              y={h - 10}
              textAnchor="middle"
              className="fill-muted"
              fontSize="9"
            >
              {d.label}
            </text>
            {v > 0 ? (
              <text
                x={x + barW / 2}
                y={y - 3}
                textAnchor="middle"
                className="fill-foreground"
                fontSize="9"
              >
                {valueKey === "revenue" ? `${Math.round(v)}` : v}
                {unit}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

function StatusDonut({ counts }: { counts: StatusCount[] }) {
  const total = counts.reduce((s, c) => s + c.count, 0) || 1;
  const size = 120;
  const r = 42;
  const cx = size / 2;
  const cy = size / 2;
  const stroke = 16;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-4">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-28 w-28 shrink-0">
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="var(--separator)"
          strokeWidth={stroke}
        />
        {counts.map((c) => {
          const len = (c.count / total) * circ;
          const el = (
            <circle
              key={c.status}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={STATUS_COLOR[c.status]}
              strokeWidth={stroke}
              strokeDasharray={`${len} ${circ - len}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          );
          offset += len;
          return el;
        })}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          className="fill-foreground"
          fontSize="18"
          fontWeight="600"
        >
          {counts.reduce((s, c) => s + c.count, 0)}
        </text>
        <text
          x={cx}
          y={cy + 12}
          textAnchor="middle"
          className="fill-muted"
          fontSize="9"
        >
          pedidos
        </text>
      </svg>
      <ul className="flex flex-col gap-1.5 text-xs">
        {counts.map((c) => (
          <li key={c.status} className="flex items-center gap-2">
            <span
              className="inline-block size-2.5 rounded-full"
              style={{ background: STATUS_COLOR[c.status] }}
            />
            <span className="text-muted">{STATUS_LABEL[c.status]}</span>
            <span className="ml-auto font-medium tabular-nums">{c.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RequestTable({
  rows,
  empty,
}: {
  rows: ClientRequestRow[];
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="px-1 py-4 text-sm text-muted">{empty}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead className="border-b border-border text-xs text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Pedido</th>
            <th className="px-3 py-2 font-medium">Estado</th>
            <th className="px-3 py-2 font-medium">Origem</th>
            <th className="px-3 py-2 font-medium">Horas</th>
            <th className="px-3 py-2 font-medium">Atualizado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-separator last:border-0">
              <td className="px-3 py-2.5">
                <p className="font-medium leading-snug">{r.title}</p>
                {r.description ? (
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted">
                    {r.description}
                  </p>
                ) : null}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className="inline-flex items-center gap-1.5 text-xs"
                  style={{ color: STATUS_COLOR[r.status] }}
                >
                  <span
                    className="size-1.5 rounded-full"
                    style={{ background: STATUS_COLOR[r.status] }}
                  />
                  {STATUS_LABEL[r.status]}
                </span>
              </td>
              <td className="px-3 py-2.5 text-muted">
                {SOURCE_LABEL[r.source] ?? r.source}
              </td>
              <td className="px-3 py-2.5 tabular-nums text-muted">
                {r.minutesTotal > 0
                  ? formatMinutes(r.minutesTotal)
                  : "—"}
              </td>
              <td className="px-3 py-2.5 text-muted">
                {formatDatePt(new Date(r.updatedAt))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ClientSheet({
  client,
  contracts,
  backlog,
  history,
  requests,
  statusCounts,
  months,
  revenue,
  totalMinutes,
  interventions,
  shareUrl,
  inboundEmail,
}: {
  client: {
    id: string;
    name: string;
    email: string | null;
    domain: string | null;
    contactName: string | null;
    phone: string | null;
    notes: string | null;
    relation: "end_client" | "partner";
    active: boolean;
    createdAt: string;
  };
  contracts: ClientContractRow[];
  backlog: ClientRequestRow[];
  history: ClientRequestRow[];
  requests: ClientRequestRow[];
  statusCounts: StatusCount[];
  months: MonthBucket[];
  revenue: ClientRevenue;
  totalMinutes: number;
  interventions: {
    id: string;
    minutes: number;
    note: string | null;
    performedAt: string;
    billingStatus: keyof typeof INTERVENTION_BILLING_LABELS;
    requestTitle: string;
  }[];
  shareUrl: string;
  inboundEmail: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState<"link" | "email" | null>(null);
  const [tab, setTab] = useState<"backlog" | "history" | "all">("backlog");
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteName, setDeleteName] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showPackModal, setShowPackModal] = useState(false);
  const [packType, setPackType] = useState<"pack" | "retainer" | "hourly">(
    "pack",
  );
  const [packHours, setPackHours] = useState(10);
  const active = (contracts ?? []).find((c) => c.active);

  const tableRows = useMemo(() => {
    const base =
      tab === "backlog" ? backlog : tab === "history" ? history : requests;
    if (!dateFrom && !dateTo) return base;
    return base.filter((r) => inRange(r.updatedAt, dateFrom, dateTo));
  }, [tab, backlog, history, requests, dateFrom, dateTo]);

  const filteredInterventions = useMemo(() => {
    if (!dateFrom && !dateTo) return interventions;
    return interventions.filter((i) =>
      inRange(i.performedAt, dateFrom, dateTo),
    );
  }, [interventions, dateFrom, dateTo]);

  const filteredMinutes = useMemo(
    () => filteredInterventions.reduce((s, i) => s + i.minutes, 0),
    [filteredInterventions],
  );

  function run(action: () => Promise<void>) {
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

  async function copyShare() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied("link");
    setTimeout(() => setCopied(null), 2000);
  }

  async function copyInboundEmail() {
    await navigator.clipboard.writeText(inboundEmail);
    setCopied("email");
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="desk-page flex flex-1 flex-col gap-4 py-6 lg:flex-row lg:items-start lg:gap-6">
      {/* Main: history + backlog + charts */}
      <main className="min-w-0 flex-1 space-y-5">
        <div>
          <Link
            href="/clients"
            className="text-sm text-muted underline-offset-2 hover:underline"
          >
            ← Clientes
          </Link>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">
                  {client.name}
                </h1>
                <span
                  className={
                    client.relation === "partner"
                      ? "rounded bg-[color-mix(in_oklab,var(--blue-600)_22%,transparent)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--blue-200)]"
                      : "rounded bg-foreground/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted"
                  }
                >
                  {CLIENT_RELATION_LABELS[client.relation]}
                </span>
                {!client.active ? (
                  <span className="rounded bg-foreground/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                    Desativado
                  </span>
                ) : null}
              </div>
              <p className="text-sm text-muted">
                {client.contactName
                  ? `${client.contactName}${client.phone ? ` · ${client.phone}` : ""} · `
                  : null}
                {active
                  ? `${TYPE_LABEL[active.type]} · ${remainingHours(active.hoursTotal, active.hoursUsed)}h restantes`
                  : "Sem contrato ativo"}
                {" · "}
                {formatMinutes(
                  dateFrom || dateTo ? filteredMinutes : totalMinutes,
                )}{" "}
                registadas
                {dateFrom || dateTo ? " no período" : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/clients/${client.id}/trabalhos`}
                className="tech-btn bg-accent text-white"
              >
                Abrir pipeline
              </Link>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(() => setClientActive(client.id, !client.active))
                }
                className="tech-btn border border-border hover:bg-default disabled:opacity-50"
              >
                {client.active ? "Desativar" : "Ativar"}
              </button>
            </div>
          </div>
        </div>

        <section className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-3">
          <div>
            <label className="mb-1 block text-xs text-muted">De</label>
            <input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-border px-2.5 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Até</label>
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-border px-2.5 py-1.5 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-1.5 pb-0.5">
            <button
              type="button"
              className="rounded-md border border-border px-2 py-1.5 text-xs hover:bg-default"
              onClick={() => {
                const now = new Date();
                const start = new Date(
                  Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
                );
                setDateFrom(start.toISOString().slice(0, 10));
                setDateTo(now.toISOString().slice(0, 10));
              }}
            >
              Este mês
            </button>
            <button
              type="button"
              className="rounded-md border border-border px-2 py-1.5 text-xs hover:bg-default"
              onClick={() => {
                const now = new Date();
                const start = new Date(
                  Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1),
                );
                setDateFrom(start.toISOString().slice(0, 10));
                setDateTo(now.toISOString().slice(0, 10));
              }}
            >
              Últimos 3 meses
            </button>
            {dateFrom || dateTo ? (
              <button
                type="button"
                className="rounded-md border border-border px-2 py-1.5 text-xs text-muted hover:bg-default"
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                }}
              >
                Limpar
              </button>
            ) : null}
          </div>
          <p className="ml-auto text-xs text-muted">
            {filteredInterventions.length} interv. ·{" "}
            {formatMinutes(filteredMinutes)}
          </p>
        </section>

        {/* Revenue + charts */}
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-surface p-4 sm:col-span-1">
            <p className="text-xs text-muted">Revenue cliente</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">
              {eur(revenue.total)}
            </p>
            <p className="mt-2 text-xs text-muted">
              Manutenção {eur(revenue.maintenance)}
              <br />
              Avenças {eur(revenue.retainers)}
              <br />
              Propostas {eur(revenue.proposals)}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4 sm:col-span-2">
            <p className="mb-2 text-xs font-medium text-muted">
              Horas por mês
            </p>
            <BarChart data={months} valueKey="hours" color="#60a5fa" unit="h" />
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="mb-2 text-xs font-medium text-muted">
              Distribuição de pedidos
            </p>
            <StatusDonut counts={statusCounts} />
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="mb-2 text-xs font-medium text-muted">
              Revenue por mês (€)
            </p>
            <BarChart
              data={months}
              valueKey="revenue"
              color="#2dd4bf"
              unit=""
            />
          </div>
        </section>

        {/* Backlog / history tables */}
        <section className="rounded-xl border border-border bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h2 className="text-sm font-medium">Pedidos</h2>
            <div className="flex gap-1 rounded-lg bg-default p-0.5 text-xs">
              {(
                [
                  ["backlog", `Backlog (${backlog.length})`],
                  ["history", `Histórico (${history.length})`],
                  ["all", `Todos (${requests.length})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={
                    tab === key
                      ? "rounded-sm bg-foreground/10 px-2 py-1 font-medium text-foreground"
                      : "rounded-sm px-2 py-1 text-muted hover:text-foreground"
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <RequestTable
            rows={tableRows}
            empty={
              dateFrom || dateTo
                ? "Sem pedidos neste período."
                : tab === "backlog"
                  ? "Sem pedidos em aberto."
                  : tab === "history"
                    ? "Ainda sem pedidos concluídos."
                    : "Sem pedidos para este cliente."
            }
          />
        </section>

        {/* Interventions history */}
        <section className="rounded-xl border border-border bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h2 className="text-sm font-medium">
              Histórico de intervenções
              {dateFrom || dateTo ? " no período" : ""}
            </h2>
            <Link
              href="/settings?tab=interventions"
              className="text-xs text-muted underline-offset-2 hover:underline"
            >
              Ver todas em Definições
            </Link>
          </div>
          {filteredInterventions.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted">
              Sem intervenções
              {dateFrom || dateTo ? " neste período" : " registadas"}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="border-b border-border text-xs text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Pedido</th>
                    <th className="px-3 py-2 font-medium">Tempo</th>
                    <th className="px-3 py-2 font-medium">Data</th>
                    <th className="px-3 py-2 font-medium">Faturação</th>
                  </tr>
                </thead>
                <tbody>
                  {(dateFrom || dateTo
                    ? filteredInterventions
                    : filteredInterventions.slice(0, 20)
                  ).map((i) => (
                    <tr
                      key={i.id}
                      className="border-b border-separator last:border-0"
                    >
                      <td className="px-3 py-2.5">
                        <p className="font-medium leading-snug">
                          {i.requestTitle}
                        </p>
                        {i.note ? (
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted">
                            {i.note}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-xs tabular-nums text-muted">
                        {formatMinutes(i.minutes)}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted">
                        {formatDatePt(new Date(i.performedAt))}
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {/* Right sidebar: secondary info */}
      <aside className="w-full shrink-0 space-y-4 lg:sticky lg:top-4 lg:w-80">
        <section className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted">
              Ficha
            </h2>
            <button
              type="button"
              className="text-xs text-muted underline-offset-2 hover:underline"
              onClick={() => setEditing((v) => !v)}
            >
              {editing ? "Cancelar" : "Editar"}
            </button>
          </div>

          {editing ? (
            <form
              className="flex flex-col gap-2"
              action={(fd) => {
                run(async () => {
                  await updateClient(client.id, fd);
                  setEditing(false);
                });
              }}
            >
              <input
                name="name"
                required
                defaultValue={client.name}
                placeholder="Nome"
                className="rounded-lg border border-border px-3 py-2 text-sm"
              />
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted">Tipo de relação</span>
                <select
                  name="relation"
                  defaultValue={client.relation}
                  className="rounded-lg border border-border px-3 py-2 text-sm text-foreground"
                >
                  {CLIENT_RELATION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <input
                name="contactName"
                defaultValue={client.contactName ?? ""}
                placeholder="Contacto responsável"
                className="rounded-lg border border-border px-3 py-2 text-sm"
              />
              <input
                name="phone"
                defaultValue={client.phone ?? ""}
                placeholder="Telefone"
                className="rounded-lg border border-border px-3 py-2 text-sm"
              />
              <input
                name="email"
                type="email"
                defaultValue={client.email ?? ""}
                placeholder="Email"
                className="rounded-lg border border-border px-3 py-2 text-sm"
              />
              <input
                name="domain"
                defaultValue={client.domain ?? ""}
                placeholder="Domínio"
                className="rounded-lg border border-border px-3 py-2 text-sm"
              />
              <textarea
                name="notes"
                defaultValue={client.notes ?? ""}
                placeholder="Notas"
                className="min-h-20 rounded-lg border border-border px-3 py-2 text-sm"
              />
              <Button type="submit" variant="primary" isDisabled={pending}>
                Guardar
              </Button>
            </form>
          ) : (
            <>
              <dl className="space-y-2.5 text-sm">
                <div>
                  <dt className="text-xs text-muted">Tipo de relação</dt>
                  <dd>{CLIENT_RELATION_LABELS[client.relation]}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Responsável</dt>
                  <dd>{client.contactName ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Telefone</dt>
                  <dd>{client.phone ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Email</dt>
                  <dd>{client.email ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Domínio</dt>
                  <dd>{client.domain ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Cliente desde</dt>
                  <dd>{formatDatePt(new Date(client.createdAt))}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Estado</dt>
                  <dd>{client.active ? "Ativo" : "Desativado"}</dd>
                </div>
              </dl>
              {client.notes ? (
                <div className="mt-3 border-t border-border pt-3">
                  <p className="text-xs text-muted">Notas</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/80">
                    {client.notes}
                  </p>
                </div>
              ) : null}
            </>
          )}
        </section>

        <section className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted">
              Pack / contrato
            </h2>
            <button
              type="button"
              className="rounded-md border border-border px-2 py-1 text-[11px] uppercase tracking-wide hover:bg-default"
              onClick={() => setShowPackModal(true)}
            >
              {active ? "Novo pack" : "Adicionar pack"}
            </button>
          </div>
          {active ? (
            <div className="space-y-1 text-sm">
              <p className="font-medium">{TYPE_LABEL[active.type]}</p>
              <p className="text-muted">
                {active.type === "hourly"
                  ? "Faturação à hora"
                  : `${remainingHours(active.hoursTotal, active.hoursUsed)}h / ${active.hoursTotal}h`}
                {active.type === "retainer" ? " este mês" : ""}
              </p>
              {active.type === "retainer" && active.monthlyFeeEur != null ? (
                <p className="text-muted">
                  {active.monthlyFeeEur.toFixed(0)} €/mês
                </p>
              ) : null}
              {active.type === "retainer" && active.periodKey ? (
                <p className="text-xs text-muted">
                  Período {active.periodKey} · horas não transitam
                </p>
              ) : null}
              {active.hourlyRate != null && active.type !== "retainer" ? (
                <p className="text-muted">
                  {active.hourlyRate.toFixed(0)} €/h
                </p>
              ) : null}
              {active.startsAt ? (
                <p className="text-xs text-muted">
                  Desde {formatDatePt(new Date(active.startsAt))}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted">
                Este cliente ainda não tem pack, avença ou horário ativo.
              </p>
              <Button variant="primary" onPress={() => setShowPackModal(true)}>
                Adicionar contrato
              </Button>
            </div>
          )}

          {active?.type === "retainer" && active.jobDescription ? (
            <div className="mt-4 border-t border-border pt-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                Job description
              </p>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-default/50 p-3 font-mono text-[11px] leading-relaxed text-foreground/90">
                {active.jobDescription}
              </pre>
            </div>
          ) : null}

          {contracts.length > 1 || (contracts.length === 1 && !active) ? (
            <div className="mt-4 border-t border-border pt-3">
              <p className="mb-2 text-xs text-muted">
                Histórico de mudanças
              </p>
              <ol className="space-y-2">
                {contracts.map((c) => (
                  <li key={c.id} className="text-xs leading-snug">
                    <span
                      className={
                        c.active
                          ? "font-medium text-foreground"
                          : "text-muted"
                      }
                    >
                      {TYPE_LABEL[c.type]}
                      {c.active ? " · ativo" : ""}
                    </span>
                    <span className="block text-muted">
                      {c.type === "hourly" ? "horário" : `${c.hoursTotal}h`}
                      {c.hourlyRate != null
                        ? ` · ${c.hourlyRate.toFixed(0)} €/h`
                        : ""}
                      {" · "}
                      {formatDatePt(new Date(c.startsAt ?? c.createdAt))}
                      {c.endsAt
                        ? ` → ${formatDatePt(new Date(c.endsAt))}`
                        : c.active
                          ? ""
                          : " → inativo"}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : contracts.length === 1 && active ? (
            <p className="mt-3 text-xs text-muted">
              Sem mudanças anteriores
            </p>
          ) : null}
        </section>

        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">
            Acesso
          </h2>
          <div className="flex flex-col gap-2">
            <Link
              href={`/clients/${client.id}/trabalhos`}
              className="tech-btn border border-border hover:bg-default"
            >
              Pipeline do cliente
            </Link>
            <Link
              href={`/pipeline?client=${client.id}`}
              className="tech-btn border border-border hover:bg-default"
            >
              Ver no Pipeline geral
            </Link>
            <Button variant="secondary" onPress={copyShare}>
              {copied === "link" ? "Link copiado" : "Copiar link de partilha"}
            </Button>
            <Button variant="secondary" onPress={copyInboundEmail}>
              {copied === "email" ? "Email copiado" : "Copiar email da área"}
            </Button>
          </div>
          <p className="mt-2 break-all font-mono text-[10px] leading-relaxed text-muted">
            Portal: {shareUrl}
          </p>
          <p className="mt-1 break-all font-mono text-[10px] leading-relaxed text-muted">
            Email: {inboundEmail}
          </p>
        </section>

        <section className="rounded-xl border border-red-500/20 bg-surface p-4">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-red-600">
            Zona de risco
          </h2>
          {!confirmDelete ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setConfirmDelete(true);
                setDeleteName("");
              }}
              className="text-sm text-red-600 underline-offset-2 hover:underline disabled:opacity-50"
            >
              Apagar cliente e histórico…
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted">
                Remove pedidos, intervenções, contratos e projetos. Escreve{" "}
                <strong className="text-foreground">{client.name}</strong> para
                confirmar.
              </p>
              <input
                value={deleteName}
                onChange={(e) => setDeleteName(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onPress={() => setConfirmDelete(false)}
                  isDisabled={pending}
                >
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  isDisabled={pending || deleteName !== client.name}
                  onPress={() => {
                    run(async () => {
                      await deleteClient(client.id);
                      router.push("/clients");
                    });
                  }}
                >
                  Apagar
                </Button>
              </div>
            </div>
          )}
        </section>
      </aside>

      {showPackModal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-xl bg-surface p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-medium">
                {active ? "Novo pack / contrato" : "Adicionar pack"}
              </h2>
              <button
                type="button"
                className="text-sm text-muted"
                onClick={() => setShowPackModal(false)}
              >
                Fechar
              </button>
            </div>
            {active ? (
              <p className="mb-3 text-xs text-muted">
                O pack atual ({TYPE_LABEL[active.type]}) fica inativo e este
                passa a ser o ativo.
              </p>
            ) : null}
            <form
              className="flex flex-col gap-3"
              action={(fd) => {
                run(async () => {
                  await createContract(fd);
                  setShowPackModal(false);
                });
              }}
            >
              <input type="hidden" name="clientId" value={client.id} />
              <div>
                <label className="mb-1 block text-xs text-muted">Tipo</label>
                <select
                  name="type"
                  required
                  value={packType}
                  onChange={(e) =>
                    setPackType(
                      e.target.value as "pack" | "retainer" | "hourly",
                    )
                  }
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <option value="pack">Pack (horas pré-pagas)</option>
                  <option value="retainer">Avença (mensal, sem rollover)</option>
                  <option value="hourly">Horário (à hora)</option>
                </select>
              </div>
              {packType !== "hourly" ? (
                <div>
                  <label className="mb-1 block text-xs text-muted">
                    {packType === "retainer" ? "Horas / mês" : "Horas do pack"}
                  </label>
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {[5, 10, 20, 40].map((h) => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => setPackHours(h)}
                        className={
                          packHours === h
                            ? "rounded-md bg-foreground/10 px-2.5 py-1 text-xs font-medium"
                            : "rounded-md border border-border px-2.5 py-1 text-xs text-muted hover:text-foreground"
                        }
                      >
                        {h}h
                      </button>
                    ))}
                  </div>
                  <input
                    name="hoursTotal"
                    type="number"
                    step="0.5"
                    min="0"
                    required
                    value={packHours}
                    onChange={(e) => setPackHours(Number(e.target.value) || 0)}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                  />
                </div>
              ) : (
                <input type="hidden" name="hoursTotal" value={0} />
              )}
              {packType === "retainer" ? (
                <>
                  <div>
                    <label className="mb-1 block text-xs text-muted">
                      Valor mensal EUR
                    </label>
                    <input
                      name="monthlyFeeEur"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="ex. 800"
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted">
                      Job description (markdown)
                    </label>
                    <textarea
                      name="jobDescription"
                      rows={10}
                      defaultValue={DEFAULT_AVENCA_JOB_MD}
                      className="w-full rounded-lg border border-border px-3 py-2 font-mono text-xs leading-relaxed"
                    />
                    <p className="mt-1 text-[11px] text-muted">
                      Horas mensais não transitam para o mês seguinte.
                    </p>
                  </div>
                </>
              ) : (
                <div>
                  <label className="mb-1 block text-xs text-muted">
                    Tarifa €/h (opcional)
                  </label>
                  <input
                    name="hourlyRate"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="ex. 75"
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs text-muted">Início</label>
                  <input
                    name="startsAt"
                    type="date"
                    required
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted">Fim</label>
                  <input
                    name="endsAt"
                    type="date"
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground"
                  />
                </div>
              </div>
              <Button type="submit" variant="primary" isDisabled={pending}>
                {active ? "Ativar novo contrato" : "Adicionar contrato"}
              </Button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
