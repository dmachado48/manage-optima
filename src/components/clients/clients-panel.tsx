"use client";

import { Button } from "@heroui/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  createClient,
  createContract,
  deleteClient,
  setClientActive,
} from "@/app/actions/clients";
import { CONTRACT_TYPE_LABELS, remainingHours, isPackAtLimit } from "@/lib/billing";
import { formatMinutes } from "@/lib/dates";
import { MultiSelect } from "@/components/multi-select";
import {
  CLIENT_RELATION_LABELS,
  CLIENT_RELATION_OPTIONS,
} from "@/lib/clients";

type ClientRow = {
  id: string;
  name: string;
  email: string | null;
  domain: string | null;
  contactName: string | null;
  phone: string | null;
  relation: "end_client" | "partner";
  active: boolean;
  createdAt: string;
  counts: {
    interventions: number;
    requests: number;
    requestsOpen: number;
    requestsDone: number;
    projects: number;
  };
  toBill: {
    interventions: number;
    minutes: number;
    amountEur: number;
    projects: number;
    packDue: boolean;
  };
  contracts: {
    id: string;
    type: "retainer" | "pack" | "hourly";
    hoursTotal: number;
    hoursUsed: number;
    active: boolean;
    billedAt: string | null;
  }[];
};

type SortKey = "open" | "name" | "interventions" | "toBill";

function hasToBill(client: ClientRow) {
  return (
    client.toBill.interventions > 0 ||
    client.toBill.projects > 0 ||
    client.toBill.packDue
  );
}

function eur(n: number) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(n);
}
type SortDir = "asc" | "desc";

export function ClientsPanel({ clients }: { clients: ClientRow[] }) {
  const router = useRouter();
  const [modal, setModal] = useState<"client" | "contract" | null>(null);
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [statuses, setStatuses] = useState<string[]>(["active"]);
  const [onlyToBill, setOnlyToBill] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("open");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [confirmDelete, setConfirmDelete] = useState<ClientRow | null>(null);
  const [deleteName, setDeleteName] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = clients.filter((c) => {
      if (
        statuses.length > 0 &&
        !statuses.includes(c.active ? "active" : "inactive")
      ) {
        return false;
      }
      if (onlyToBill && !hasToBill(c)) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.email?.toLowerCase().includes(q) ?? false) ||
        (c.domain?.toLowerCase().includes(q) ?? false) ||
        (c.contactName?.toLowerCase().includes(q) ?? false) ||
        (c.phone?.toLowerCase().includes(q) ?? false)
      );
    });

    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      if (sortKey === "open") {
        const d = (a.counts.requestsOpen - b.counts.requestsOpen) * dir;
        if (d !== 0) return d;
        return a.name.localeCompare(b.name, "pt");
      }
      if (sortKey === "interventions") {
        const d = (a.counts.interventions - b.counts.interventions) * dir;
        if (d !== 0) return d;
        return a.name.localeCompare(b.name, "pt");
      }
      if (sortKey === "toBill") {
        const d = (a.toBill.amountEur - b.toBill.amountEur) * dir;
        if (d !== 0) return d;
        const minutes = (a.toBill.minutes - b.toBill.minutes) * dir;
        if (minutes !== 0) return minutes;
        return a.name.localeCompare(b.name, "pt");
      }
      return a.name.localeCompare(b.name, "pt") * dir;
    });
    return rows;
  }, [clients, query, statuses, onlyToBill, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "name" ? "asc" : "desc");
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return null;
    return (
      <span className="ml-1 text-[10px] opacity-80" aria-hidden>
        {sortDir === "asc" ? "↑" : "↓"}
      </span>
    );
  }

  const activeCount = clients.filter((c) => c.active).length;
  const inactiveCount = clients.length - activeCount;
  const statusScoped = clients.filter((c) => {
    if (statuses.length === 0) return true;
    return statuses.includes(c.active ? "active" : "inactive");
  });
  const toBillClients = statusScoped.filter(hasToBill);
  const toBillInterventions = toBillClients.reduce(
    (sum, c) => sum + c.toBill.interventions,
    0,
  );
  const toBillMinutes = toBillClients.reduce((sum, c) => sum + c.toBill.minutes, 0);
  const toBillProjects = toBillClients.reduce((sum, c) => sum + c.toBill.projects, 0);
  const toBillAmount = toBillClients.reduce((sum, c) => sum + c.toBill.amountEur, 0);

  function run(action: () => Promise<void>) {
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

  return (
    <div className="desk-page flex flex-1 flex-col gap-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-sm text-muted">
            {activeCount} ativos
            {inactiveCount > 0 ? ` · ${inactiveCount} desativados` : ""}
          </p>
          <p className="mt-1 text-sm">
            {toBillClients.length === 0 ? (
              <span className="text-muted">Nada por faturar neste estado.</span>
            ) : (
              <>
                <span className="font-medium">
                  {toBillAmount > 0 ? `${eur(toBillAmount)} por faturar` : "Por faturar"}
                </span>
                <span className="text-muted">
                  {" "}
                  · {toBillClients.length}{" "}
                  {toBillClients.length === 1 ? "cliente" : "clientes"}
                  {toBillInterventions > 0
                    ? ` · ${toBillInterventions} interv. · ${formatMinutes(toBillMinutes)}`
                    : ""}
                  {toBillProjects > 0
                    ? ` · ${toBillProjects} ${toBillProjects === 1 ? "projeto" : "projetos"}`
                    : ""}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onPress={() => setModal("client")}>
            Novo cliente
          </Button>
          <Button variant="secondary" onPress={() => setModal("contract")}>
            Adicionar pack
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pesquisar nome, contacto, domínio…"
          className="min-w-[16rem] flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
        />
        <MultiSelect
          label="Estado"
          emptyLabel="Todos"
          options={[
            { value: "active", label: "Ativos", count: activeCount },
            { value: "inactive", label: "Desativados", count: inactiveCount },
          ]}
          selected={statuses}
          onChange={setStatuses}
        />
        <button
          type="button"
          onClick={() => {
            setOnlyToBill((on) => {
              const next = !on;
              if (next) {
                setSortKey("toBill");
                setSortDir("desc");
              }
              return next;
            });
          }}
          className={
            onlyToBill
              ? "rounded-lg bg-amber-500/15 px-2.5 py-1.5 text-xs font-medium text-amber-900"
              : "rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted hover:text-foreground"
          }
        >
          Por faturar ({toBillClients.length})
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="border-b border-border text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">
                <button
                  type="button"
                  onClick={() => toggleSort("name")}
                  className="inline-flex items-center hover:text-foreground"
                >
                  Cliente
                  {sortIndicator("name")}
                </button>
              </th>
              <th className="px-3 py-2 font-medium text-right">
                <button
                  type="button"
                  onClick={() => toggleSort("open")}
                  className="inline-flex items-center justify-end text-amber-700 hover:text-amber-900"
                  title="Ordenar por pedidos em aberto"
                >
                  Em aberto
                  {sortIndicator("open")}
                </button>
              </th>
              <th className="px-3 py-2 font-medium text-right text-emerald-700">
                Feitos
              </th>
              <th className="px-3 py-2 font-medium text-right">
                <button
                  type="button"
                  onClick={() => toggleSort("interventions")}
                  className="inline-flex items-center justify-end hover:text-foreground"
                >
                  Intervenções
                  {sortIndicator("interventions")}
                </button>
              </th>
              <th className="px-3 py-2 font-medium text-right">
                <button
                  type="button"
                  onClick={() => toggleSort("toBill")}
                  className="inline-flex items-center justify-end text-amber-800 hover:text-amber-950"
                  title="Ordenar pelo valor por faturar"
                >
                  Por faturar
                  {sortIndicator("toBill")}
                </button>
              </th>
              <th className="px-3 py-2 font-medium">Contrato</th>
              <th className="px-3 py-2 font-medium">Horas</th>
              <th className="px-3 py-2 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-8 text-center text-sm text-muted"
                >
                  {onlyToBill
                    ? "Nenhum cliente com trabalho por faturar."
                    : "Nenhum cliente neste filtro."}
                </td>
              </tr>
            ) : (
              filtered.map((c) => {
                const activeContract = c.contracts.find((x) => x.active);
                const open = c.counts.requestsOpen;
                const done = c.counts.requestsDone;
                return (
                  <tr
                    key={c.id}
                    className={
                      c.active
                        ? "border-b border-separator last:border-0"
                        : "border-b border-separator bg-default/40 last:border-0 opacity-80"
                    }
                  >
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/clients/${c.id}`}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {c.name}
                      </Link>
                      {!c.active ? (
                        <span className="ml-2 rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                          Desativado
                        </span>
                      ) : null}
                      <span
                        className={
                          c.relation === "partner"
                            ? "ml-2 rounded bg-[color-mix(in_oklab,var(--blue-600)_22%,transparent)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--blue-800)]"
                            : "ml-2 rounded bg-foreground/8 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted"
                        }
                      >
                        {CLIENT_RELATION_LABELS[c.relation]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span
                        className={
                          open > 0
                            ? "inline-flex min-w-[1.75rem] justify-end rounded-md bg-amber-500/15 px-1.5 py-0.5 tabular-nums font-medium text-amber-800"
                            : "tabular-nums text-muted"
                        }
                      >
                        {open}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span
                        className={
                          done > 0
                            ? "inline-flex min-w-[1.75rem] justify-end rounded-md bg-emerald-500/15 px-1.5 py-0.5 tabular-nums font-medium text-emerald-800"
                            : "tabular-nums text-muted"
                        }
                      >
                        {done}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                      {c.counts.interventions}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {hasToBill(c) ? (
                        <Link
                          href={`/clients/${c.id}`}
                          className="inline-flex flex-col items-end gap-0.5 rounded-md bg-amber-500/15 px-2 py-1 text-amber-950 hover:bg-amber-500/25"
                        >
                          {c.toBill.amountEur > 0 ? (
                            <span className="text-sm font-medium tabular-nums">
                              {eur(c.toBill.amountEur)}
                            </span>
                          ) : null}
                          {c.toBill.interventions > 0 ? (
                            <span className="text-[11px] tabular-nums">
                              {c.toBill.interventions} interv. ·{" "}
                              {formatMinutes(c.toBill.minutes)}
                            </span>
                          ) : null}
                          {c.toBill.projects > 0 ? (
                            <span className="text-[11px]">
                              {c.toBill.projects}{" "}
                              {c.toBill.projects === 1 ? "projeto" : "projetos"}
                            </span>
                          ) : null}
                          {c.toBill.packDue && c.toBill.interventions === 0 ? (
                            <span className="text-[10px] font-medium uppercase tracking-wide">
                              Pack esgotado
                            </span>
                          ) : null}
                        </Link>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-muted">
                      {activeContract
                        ? CONTRACT_TYPE_LABELS[activeContract.type]
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-muted">
                      {activeContract ? (
                        <>
                          {`${remainingHours(activeContract.hoursTotal, activeContract.hoursUsed)}h / ${activeContract.hoursTotal}h`}
                          {isPackAtLimit(
                            activeContract.hoursTotal,
                            activeContract.hoursUsed,
                          ) && !activeContract.billedAt ? (
                            <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wide text-amber-800">
                              A faturar
                            </span>
                          ) : null}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Link
                          href={`/clients/${c.id}`}
                          className="rounded-md border border-border px-2 py-1 text-xs hover:bg-default"
                        >
                          Ficha
                        </Link>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            run(() => setClientActive(c.id, !c.active))
                          }
                          className="rounded-md border border-border px-2 py-1 text-xs hover:bg-default disabled:opacity-50"
                        >
                          {c.active ? "Desativar" : "Ativar"}
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            setConfirmDelete(c);
                            setDeleteName("");
                          }}
                          className="rounded-md border border-red-500/30 px-2 py-1 text-xs text-red-600 hover:bg-red-500/10 disabled:opacity-50"
                        >
                          Apagar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {modal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-xl bg-surface p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-medium">
                {modal === "client" ? "Novo cliente" : "Adicionar pack / contrato"}
              </h2>
              <button
                type="button"
                className="text-sm text-muted"
                onClick={() => setModal(null)}
              >
                Fechar
              </button>
            </div>
            {modal === "client" ? (
              <form
                className="flex flex-col gap-2"
                action={(fd) => {
                  run(async () => {
                    await createClient(fd);
                    setModal(null);
                  });
                }}
              >
                <input
                  name="name"
                  required
                  placeholder="Nome da empresa / cliente"
                  className="rounded-lg border border-border px-3 py-2 text-sm"
                />
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-muted">Tipo de relação</span>
                  <select
                    name="relation"
                    defaultValue="end_client"
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
                  placeholder="Contacto responsável"
                  className="rounded-lg border border-border px-3 py-2 text-sm"
                />
                <input
                  name="phone"
                  placeholder="Telefone"
                  className="rounded-lg border border-border px-3 py-2 text-sm"
                />
                <input
                  name="email"
                  type="email"
                  placeholder="Email"
                  className="rounded-lg border border-border px-3 py-2 text-sm"
                />
                <input
                  name="domain"
                  placeholder="Domínio"
                  className="rounded-lg border border-border px-3 py-2 text-sm"
                />
                <textarea
                  name="notes"
                  placeholder="Notas"
                  className="min-h-16 rounded-lg border border-border px-3 py-2 text-sm"
                />
                <Button type="submit" variant="primary" isDisabled={pending}>
                  Criar
                </Button>
              </form>
            ) : (
              <form
                className="flex flex-col gap-2"
                action={(fd) => {
                  run(async () => {
                    await createContract(fd);
                    setModal(null);
                  });
                }}
              >
                <select
                  name="clientId"
                  required
                  className="rounded-lg border border-border px-3 py-2 text-sm"
                >
                  {clients
                    .filter((c) => c.active)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
                <select
                  name="type"
                  required
                  className="rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <option value="pack">Pack</option>
                  <option value="retainer">Avença (mensal)</option>
                  <option value="hourly">À hora</option>
                </select>
                <input
                  name="hoursTotal"
                  type="number"
                  step="0.5"
                  min="0"
                  defaultValue={10}
                  className="rounded-lg border border-border px-3 py-2 text-sm"
                />
                <input
                  name="hourlyRate"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Taxa horária EUR (opcional)"
                  className="rounded-lg border border-border px-3 py-2 text-sm"
                />
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-muted">Início</span>
                    <input
                      name="startsAt"
                      type="date"
                      required
                      defaultValue={new Date().toISOString().slice(0, 10)}
                      className="rounded-lg border border-border px-3 py-2 text-sm text-foreground"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-muted">Fim</span>
                    <input
                      name="endsAt"
                      type="date"
                      className="rounded-lg border border-border px-3 py-2 text-sm text-foreground"
                    />
                  </label>
                </div>
                <Button type="submit" variant="primary" isDisabled={pending}>
                  Ativar
                </Button>
              </form>
            )}
          </div>
        </div>
      ) : null}

      {confirmDelete ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-xl bg-surface p-4 shadow-xl">
            <h2 className="font-medium text-red-600">Apagar cliente</h2>
            <p className="mt-2 text-sm text-muted">
              Isto remove permanentemente{" "}
              <strong className="text-foreground">{confirmDelete.name}</strong>,
              incluindo {confirmDelete.counts.requests} pedidos,{" "}
              {confirmDelete.counts.interventions} intervenções e{" "}
              {confirmDelete.counts.projects} projetos. Não dá para reverter.
            </p>
            <p className="mt-3 text-sm text-muted">
              Escreve o nome do cliente para confirmar:
            </p>
            <input
              value={deleteName}
              onChange={(e) => setDeleteName(e.target.value)}
              placeholder={confirmDelete.name}
              className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="secondary"
                onPress={() => setConfirmDelete(null)}
                isDisabled={pending}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                isDisabled={pending || deleteName !== confirmDelete.name}
                onPress={() => {
                  const id = confirmDelete.id;
                  run(async () => {
                    await deleteClient(id);
                    setConfirmDelete(null);
                    setDeleteName("");
                  });
                }}
              >
                Apagar definitivamente
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
