"use client";

import { Button } from "@heroui/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createBuildTask,
  markProjectBilledFromProjects,
  markProjectDelivered,
  setProjectStatusFromProjects,
  updateBuildTaskHours,
  updateBuildTaskStatusForm,
  updateProjectDetails,
} from "@/app/actions/projects";
import { formatDatePt, formatMinutes } from "@/lib/dates";
import type { ProjectFinance } from "@/lib/project-finance";

const PROJECT_STATUS_LABELS: Record<string, string> = {
  intake: "Intake",
  scoping: "Âmbito",
  proposal_sent: "Proposta enviada",
  approved: "Aprovado",
  in_build: "Em construção",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

const TASK_STATUSES = [
  { key: "todo", label: "Por fazer" },
  { key: "in_progress", label: "Em curso" },
  { key: "waiting_on_client", label: "À espera" },
  { key: "done", label: "Concluído" },
] as const;

const PROPOSAL_STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  sent: "Enviada",
  approved: "Aprovada",
  rejected: "Rejeitada",
  revised: "Em revisão",
};

function eur(n: number) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

export function ProjectDesk({
  project,
  clients,
  tasks,
  proposals,
  finance,
}: {
  project: {
    id: string;
    title: string;
    status: string;
    deadline: string | null;
    budgetEur: number | null;
    costRateEur: number | null;
    billedAt: string | null;
    createdAt: string;
    client: { id: string; name: string };
  };
  clients: { id: string; name: string }[];
  tasks: {
    id: string;
    title: string;
    status: string;
    estimatedMinutes: number | null;
    spentMinutes: number;
  }[];
  proposals: {
    id: string;
    title: string;
    amountEur: number;
    status: string;
    proposalDate: string;
  }[];
  finance: ProjectFinance;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsSaved, setDetailsSaved] = useState(false);
  const overdue =
    project.deadline &&
    project.status !== "delivered" &&
    new Date(project.deadline).getTime() < Date.now();

  function run(action: () => Promise<void>) {
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

  return (
    <main className="desk-page flex flex-1 flex-col gap-5 py-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1 space-y-5">
        <div>
          <Link
            href="/projects"
            className="text-sm text-muted underline-offset-2 hover:underline"
          >
            ← Projetos
          </Link>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {project.title}
              </h1>
              <p className="text-sm text-muted">
                <Link
                  href={`/clients/${project.client.id}`}
                  className="underline-offset-2 hover:underline"
                >
                  {project.client.name}
                </Link>
                {" · "}
                {PROJECT_STATUS_LABELS[project.status] ?? project.status}
                {project.deadline ? (
                  <>
                    {" · Deadline "}
                    <span className={overdue ? "font-medium text-red-600" : ""}>
                      {formatDatePt(new Date(project.deadline))}
                      {overdue ? " (atrasado)" : ""}
                    </span>
                  </>
                ) : null}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {project.status !== "delivered" &&
              project.status !== "cancelled" ? (
                <Button
                  variant="primary"
                  isDisabled={pending}
                  onPress={() => run(() => markProjectDelivered(project.id))}
                >
                  Fechar / entregar
                </Button>
              ) : null}
              {project.status === "delivered" && !project.billedAt ? (
                <Button
                  variant="primary"
                  isDisabled={pending}
                  onPress={() =>
                    run(() => markProjectBilledFromProjects(project.id))
                  }
                >
                  Passar a faturação
                </Button>
              ) : null}
              {project.billedAt ? (
                <span className="rounded-lg bg-foreground/10 px-3 py-2 text-xs font-medium text-muted">
                  Faturado {formatDatePt(new Date(project.billedAt))}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Finance strip */}
        <section className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-xs text-muted">Budget</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {finance.budgetEur > 0 ? eur(finance.budgetEur) : "—"}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              {finance.budgetSource === "proposals"
                ? "Da proposta aprovada"
                : finance.budgetSource === "project"
                  ? "Definido no projeto"
                  : "Sem budget"}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-xs text-muted">Custo (horas × taxa)</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {finance.costRateEur > 0 ? eur(finance.spentCostEur) : "—"}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              {formatMinutes(finance.spentMinutes)}
              {finance.estimatedMinutes > 0
                ? ` / est. ${formatMinutes(finance.estimatedMinutes)}`
                : ""}
            </p>
          </div>
          <div
            className={`rounded-xl border bg-surface p-4 ${
              finance.profitEur < 0
                ? "border-red-500/40"
                : "border-border"
            }`}
          >
            <p className="text-xs text-muted">Profit</p>
            <p
              className={`mt-1 text-xl font-semibold tabular-nums ${
                finance.profitEur < 0 ? "text-red-600" : ""
              }`}
            >
              {finance.costRateEur > 0 ? eur(finance.profitEur) : "—"}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              {finance.marginPct != null
                ? `Margem ${finance.marginPct}%`
                : "Define taxa interna"}
            </p>
          </div>
          <div
            className={`rounded-xl border bg-surface p-4 ${
              finance.willExceedBudget || finance.hoursOverEstimate
                ? "border-amber-500/50"
                : "border-border"
            }`}
          >
            <p className="text-xs text-muted">Alerta</p>
            <p className="mt-1 text-sm font-medium leading-snug">
              {finance.willExceedBudget
                ? "Risco de exceder o budget"
                : finance.hoursOverEstimate
                  ? "Horas acima da estimativa"
                  : "Dentro do plano"}
            </p>
          </div>
        </section>

        {/* Tasks kanban */}
        <section className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium">Tarefas</h2>
            <form
              className="flex flex-wrap gap-2"
              action={(fd) => {
                run(async () => {
                  await createBuildTask(fd);
                });
              }}
            >
              <input type="hidden" name="projectId" value={project.id} />
              <input
                name="title"
                required
                placeholder="Nova tarefa"
                className="min-w-[12rem] rounded-lg border border-border px-3 py-1.5 text-sm"
              />
              <input
                name="estimatedHours"
                type="number"
                step="0.5"
                min="0"
                placeholder="Est. h"
                className="w-20 rounded-lg border border-border px-2 py-1.5 text-sm"
              />
              <Button type="submit" variant="secondary" isDisabled={pending}>
                Adicionar
              </Button>
            </form>
          </div>

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {TASK_STATUSES.map((col) => {
              const items = tasks.filter((t) => t.status === col.key);
              return (
                <div key={col.key} className="rounded-lg bg-default p-2">
                  <p className="mb-2 text-xs font-medium uppercase text-muted">
                    {col.label} · {items.length}
                  </p>
                  <ul className="flex flex-col gap-2">
                    {items.map((t) => (
                      <li
                        key={t.id}
                        className="rounded-md border border-border bg-surface p-2"
                      >
                        <p className="text-sm font-medium leading-snug">
                          {t.title}
                        </p>
                        <form
                          className="mt-1"
                          action={(fd) => {
                            run(() => updateBuildTaskStatusForm(t.id, fd));
                          }}
                        >
                          <select
                            name="status"
                            defaultValue={t.status}
                            className="w-full rounded border border-border px-1 py-0.5 text-[11px]"
                            onChange={(e) =>
                              e.currentTarget.form?.requestSubmit()
                            }
                            disabled={pending}
                          >
                            {TASK_STATUSES.map((s) => (
                              <option key={s.key} value={s.key}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </form>
                        <form
                          className="mt-1 flex gap-1"
                          action={(fd) => {
                            run(async () => {
                              await updateBuildTaskHours(fd);
                            });
                          }}
                        >
                          <input type="hidden" name="taskId" value={t.id} />
                          <input
                            name="estimatedHours"
                            type="number"
                            step="0.5"
                            min="0"
                            defaultValue={
                              t.estimatedMinutes
                                ? t.estimatedMinutes / 60
                                : ""
                            }
                            title="Estimativa (h)"
                            placeholder="Est"
                            className="w-full rounded border border-border px-1 py-0.5 text-[11px]"
                          />
                          <input
                            name="spentHours"
                            type="number"
                            step="0.5"
                            min="0"
                            defaultValue={
                              t.spentMinutes ? t.spentMinutes / 60 : ""
                            }
                            title="Gasto (h)"
                            placeholder="Gasto"
                            className="w-full rounded border border-border px-1 py-0.5 text-[11px]"
                          />
                          <button
                            type="submit"
                            disabled={pending}
                            className="shrink-0 rounded border border-border px-1 text-[10px] disabled:opacity-50"
                          >
                            OK
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <aside className="w-full shrink-0 space-y-4 lg:sticky lg:top-20 lg:w-80 lg:self-start">
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">
            Informação
          </h2>

          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setDetailsError(null);
              setDetailsSaved(false);
              startTransition(async () => {
                try {
                  await updateProjectDetails(fd);
                  setDetailsSaved(true);
                  router.refresh();
                } catch (err) {
                  setDetailsError(
                    err instanceof Error ? err.message : "Erro ao guardar",
                  );
                }
              });
            }}
          >
            <input type="hidden" name="projectId" value={project.id} />
            <label className="text-xs text-muted">
              Cliente
              <select
                name="clientId"
                required
                key={`client-${project.client.id}`}
                defaultValue={project.client.id}
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              >
                {/* Keep current client even if inactive */}
                {!clients.some((c) => c.id === project.client.id) ? (
                  <option value={project.client.id}>
                    {project.client.name} (inativo)
                  </option>
                ) : null}
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted">
              Título
              <input
                name="title"
                required
                key={`title-${project.title}`}
                defaultValue={project.title}
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              />
            </label>
            <label className="text-xs text-muted">
              Deadline
              <input
                name="deadline"
                type="date"
                key={`deadline-${project.deadline ?? "none"}`}
                defaultValue={toDateInput(project.deadline)}
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              />
            </label>
            <label className="text-xs text-muted">
              Budget EUR (sem IVA)
              <input
                name="budgetEur"
                type="number"
                step="0.01"
                min="0"
                key={`budget-${project.budgetEur ?? "none"}`}
                defaultValue={project.budgetEur ?? ""}
                placeholder="Vazio = proposta aprovada"
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              />
            </label>
            <label className="text-xs text-muted">
              Taxa interna €/h (custo)
              <input
                name="costRateEur"
                type="number"
                step="0.01"
                min="0"
                key={`rate-${project.costRateEur ?? "none"}`}
                defaultValue={project.costRateEur ?? ""}
                placeholder="Para calcular profit"
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              />
            </label>
            {detailsError ? (
              <p className="text-xs text-red-600">{detailsError}</p>
            ) : null}
            {detailsSaved ? (
              <p className="text-xs text-muted">Guardado</p>
            ) : null}
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-accent px-3 py-2 text-xs font-medium uppercase tracking-wide text-white disabled:opacity-50"
            >
              {pending ? "A guardar…" : "Guardar"}
            </button>
            <p className="text-[11px] text-muted">
              Criado {formatDatePt(new Date(project.createdAt))}
            </p>
          </form>
        </section>

        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">
            Status
          </h2>
          <form
            action={(fd) => {
              run(() => setProjectStatusFromProjects(project.id, fd));
            }}
          >
            <select
              name="status"
              defaultValue={project.status}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm"
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              disabled={pending}
            >
              {Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </form>
          {project.status === "delivered" && !project.billedAt ? (
            <Button
              className="mt-3 w-full"
              variant="primary"
              isDisabled={pending}
              onPress={() =>
                run(() => markProjectBilledFromProjects(project.id))
              }
            >
              Passar a faturação
            </Button>
          ) : null}
        </section>

        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">
            Propostas
          </h2>
          {proposals.length === 0 ? (
            <p className="text-sm text-muted">Sem propostas ligadas.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {proposals.map((p) => (
                <li key={p.id}>
                  <p className="font-medium leading-snug">{p.title}</p>
                  <p className="text-xs text-muted">
                    {PROPOSAL_STATUS_LABELS[p.status] ?? p.status} ·{" "}
                    {eur(p.amountEur)} s/ IVA ·{" "}
                    {formatDatePt(new Date(p.proposalDate))}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/commercial"
            className="mt-3 inline-block text-xs text-muted underline-offset-2 hover:underline"
          >
            Abrir Comercial →
          </Link>
        </section>
      </aside>
    </main>
  );
}
