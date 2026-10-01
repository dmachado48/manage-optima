"use client";

import { Button } from "@heroui/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createProject } from "@/app/actions/commercial";
import { formatDatePt, formatMinutes } from "@/lib/dates";
import type { ProjectFinance } from "@/lib/project-finance";

type ClientOption = { id: string; name: string };

type ProjectRow = {
  id: string;
  title: string;
  status: string;
  deadline: string | null;
  billedAt: string | null;
  createdAt: string;
  client: { id: string; name: string };
  taskTotal: number;
  taskDone: number;
  finance: ProjectFinance;
};

const STATUS_LABELS: Record<string, string> = {
  intake: "Intake",
  scoping: "Âmbito",
  proposal_sent: "Proposta enviada",
  approved: "Aprovado",
  in_build: "Em construção",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

type Filter = "active" | "delivered" | "all";

function eur(n: number) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function ProjectsList({
  projects,
  clients,
}: {
  projects: ProjectRow[];
  clients: ClientOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("active");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showProject, setShowProject] = useState(false);
  const [clientMode, setClientMode] = useState<"existing" | "new">("existing");

  function inDateRange(iso: string) {
    const t = new Date(iso).getTime();
    if (dateFrom) {
      const from = new Date(`${dateFrom}T00:00:00`).getTime();
      if (t < from) return false;
    }
    if (dateTo) {
      const to = new Date(`${dateTo}T23:59:59.999`).getTime();
      if (t > to) return false;
    }
    return true;
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (filter === "active" && p.status === "delivered") return false;
      if (filter === "delivered" && p.status !== "delivered") return false;
      if (!inDateRange(p.createdAt)) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.client.name.toLowerCase().includes(q) ||
        (STATUS_LABELS[p.status] ?? p.status).toLowerCase().includes(q)
      );
    });
  }, [projects, query, filter, dateFrom, dateTo]);

  const activeCount = projects.filter((p) => p.status !== "delivered").length;
  const deliveredCount = projects.filter((p) => p.status === "delivered").length;

  return (
    <main className="desk-page flex flex-1 flex-col gap-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projetos</h1>
          <p className="text-sm text-muted">
            Lista de projetos — entra para gerir tarefas, budget e faturação
          </p>
        </div>
        <Button
          variant="primary"
          onPress={() => {
            setClientMode("existing");
            setShowProject(true);
          }}
        >
          Novo projeto
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg bg-default p-0.5 text-xs">
          {(
            [
              ["active", `Ativos (${activeCount})`],
              ["delivered", `Entregues (${deliveredCount})`],
              ["all", `Todos (${projects.length})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={
                filter === key
                  ? "rounded-sm bg-foreground/10 px-2.5 py-1.5 font-medium"
                  : "rounded-sm px-2.5 py-1.5 text-muted hover:text-foreground"
              }
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pesquisar projeto ou cliente…"
          className="min-w-[14rem] flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-1 text-xs text-muted">
          De
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-muted">
          Até
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
          />
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead className="border-b border-border text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Projeto</th>
              <th className="px-3 py-2 font-medium">Cliente</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium">Deadline</th>
              <th className="px-3 py-2 font-medium">Tarefas</th>
              <th className="px-3 py-2 font-medium">Budget</th>
              <th className="px-3 py-2 font-medium">Profit</th>
              <th className="px-3 py-2 font-medium text-right">Ação</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-8 text-center text-sm text-muted"
                >
                  Nenhum projeto neste filtro.{" "}
                  <button
                    type="button"
                    className="underline-offset-2 hover:underline"
                    onClick={() => setShowProject(true)}
                  >
                    Criar projeto
                  </button>
                  {" "}ou aprova propostas em Comercial.
                </td>
              </tr>
            ) : (
              filtered.map((p) => {
                const overdue =
                  p.deadline &&
                  p.status !== "delivered" &&
                  new Date(p.deadline).getTime() < Date.now();
                return (
                  <tr
                    key={p.id}
                    className="border-b border-separator last:border-0"
                  >
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/projects/${p.id}`}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {p.title}
                      </Link>
                      {p.status === "delivered" && !p.billedAt ? (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-900">
                          A faturar
                        </span>
                      ) : null}
                      {p.billedAt ? (
                        <span className="ml-2 rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] uppercase text-muted">
                          Faturado
                        </span>
                      ) : null}
                      {p.finance.willExceedBudget ? (
                        <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-red-800">
                          Excede
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-muted">
                      <Link
                        href={`/clients/${p.client.id}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {p.client.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-muted">
                      {STATUS_LABELS[p.status] ?? p.status}
                    </td>
                    <td
                      className={
                        overdue
                          ? "px-3 py-2.5 font-medium text-red-600"
                          : "px-3 py-2.5 text-muted"
                      }
                    >
                      {p.deadline
                        ? formatDatePt(new Date(p.deadline))
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-muted">
                      {p.taskDone}/{p.taskTotal}
                      {p.finance.spentMinutes > 0 ? (
                        <span className="block text-xs">
                          {formatMinutes(p.finance.spentMinutes)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-muted">
                      {p.finance.budgetEur > 0
                        ? eur(p.finance.budgetEur)
                        : "—"}
                    </td>
                    <td
                      className={
                        p.finance.profitEur < 0
                          ? "px-3 py-2.5 font-medium text-red-600"
                          : "px-3 py-2.5 text-muted"
                      }
                    >
                      {p.finance.costRateEur > 0
                        ? eur(p.finance.profitEur)
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Link
                        href={`/projects/${p.id}`}
                        className="rounded-md border border-border px-2 py-1 text-xs hover:bg-default"
                      >
                        Entrar
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showProject ? (
        <Modal title="Novo projeto" onClose={() => setShowProject(false)}>
          <form
            className="flex flex-col gap-2"
            action={(fd) => {
              startTransition(async () => {
                const id = await createProject(fd);
                setShowProject(false);
                setClientMode("existing");
                router.push(`/projects/${id}`);
                router.refresh();
              });
            }}
          >
            <input type="hidden" name="clientMode" value={clientMode} />
            <div className="flex gap-2 text-sm">
              <button
                type="button"
                className={
                  clientMode === "existing"
                    ? "font-medium text-foreground"
                    : "text-muted"
                }
                onClick={() => setClientMode("existing")}
              >
                Cliente existente
              </button>
              <span className="text-muted">·</span>
              <button
                type="button"
                className={
                  clientMode === "new"
                    ? "font-medium text-foreground"
                    : "text-muted"
                }
                onClick={() => setClientMode("new")}
              >
                Cliente novo
              </button>
            </div>
            {clientMode === "existing" ? (
              <select
                name="clientId"
                required
                className="rounded-lg border border-border px-3 py-2 text-sm"
              >
                {clients.length === 0 ? (
                  <option value="">Sem clientes — cria um novo</option>
                ) : (
                  clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))
                )}
              </select>
            ) : (
              <>
                <input
                  name="newClientName"
                  required
                  placeholder="Nome do cliente"
                  className="rounded-lg border border-border px-3 py-2 text-sm"
                />
                <input
                  name="newClientEmail"
                  type="email"
                  placeholder="Email (opcional)"
                  className="rounded-lg border border-border px-3 py-2 text-sm"
                />
              </>
            )}
            <input
              name="title"
              required
              placeholder="Título do projeto"
              className="rounded-lg border border-border px-3 py-2 text-sm"
            />
            <textarea
              name="emailBody"
              placeholder="Colar email / brief (opcional)"
              className="min-h-24 rounded-lg border border-border px-3 py-2 text-sm"
            />
            <Button type="submit" variant="primary" isDisabled={pending}>
              Criar
            </Button>
          </form>
        </Modal>
      ) : null}
    </main>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-xl bg-surface p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium">{title}</h2>
          <button type="button" className="text-sm text-muted" onClick={onClose}>
            Fechar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
