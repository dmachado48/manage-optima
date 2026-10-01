"use client";

import { Button } from "@heroui/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  createProject,
  createProposalDraft,
  deleteProject,
  deleteProposal,
  markContractBilled,
  markProjectBilled,
  setProjectStatusForm,
  setProposalStatusForm,
  updateProposalDraft,
} from "@/app/actions/commercial";
import { BillingAlertsBanner } from "@/components/billing-alerts-banner";
import { formatDatePt } from "@/lib/dates";
import type { BillingAlert } from "@/lib/billing";
import {
  parseProposalItems,
  sumProposalItems,
  type ProposalLineItem,
} from "@/lib/proposal-template";

type ClientOption = { id: string; name: string };

type ProposalRow = {
  id: string;
  title: string;
  amountEur: number;
  status: string;
  bodyHtml: string;
  scopeBody: string;
  proposalDate: string;
  createdAt: string;
  updatedAt: string;
  project: { id: string; title: string; client: { name: string } };
};

type ProjectRow = {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  billedAt: string | null;
  client: { id: string; name: string };
  proposalCount: number;
};

const PROPOSAL_STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  sent: "Enviada",
  approved: "Aprovada",
  rejected: "Rejeitada",
  revised: "Em revisão",
};

const PROJECT_STATUS_LABELS: Record<string, string> = {
  intake: "Intake",
  scoping: "Âmbito",
  proposal_sent: "Proposta enviada",
  approved: "Aprovado",
  in_build: "Em construção",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

type Tab = "proposals" | "projects";

function emptyItem(): ProposalLineItem {
  return { description: "", amountEur: 0 };
}

function ProposalItemsEditor({
  items,
  onChange,
  vatLabel = "s/ IVA",
}: {
  items: ProposalLineItem[];
  onChange: (items: ProposalLineItem[]) => void;
  vatLabel?: string;
}) {
  const total = sumProposalItems(items);

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          Itens ({vatLabel})
        </p>
        <button
          type="button"
          className="text-xs text-muted underline-offset-2 hover:underline"
          onClick={() => onChange([...items, emptyItem()])}
        >
          + Adicionar item
        </button>
      </div>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex gap-2">
            <input
              value={item.description}
              onChange={(e) => {
                const next = [...items];
                next[index] = { ...item, description: e.target.value };
                onChange(next);
              }}
              placeholder="Descrição do item"
              className="min-w-0 flex-1 rounded-lg border border-border px-3 py-2 text-sm"
            />
            <input
              type="number"
              step="0.01"
              min="0"
              value={item.amountEur || ""}
              onChange={(e) => {
                const next = [...items];
                next[index] = {
                  ...item,
                  amountEur: Number(e.target.value) || 0,
                };
                onChange(next);
              }}
              placeholder="€"
              className="w-24 rounded-lg border border-border px-2 py-2 text-sm tabular-nums"
            />
            <button
              type="button"
              disabled={items.length <= 1}
              onClick={() => onChange(items.filter((_, i) => i !== index))}
              className="px-2 text-xs text-muted hover:text-foreground disabled:opacity-30"
              aria-label="Remover item"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <p className="text-right text-sm font-medium tabular-nums">
        Total: {total.toFixed(2)} €{" "}
        <span className="font-normal text-muted">{vatLabel}</span>
      </p>
    </div>
  );
}

export function CommercialDesk({
  clients,
  projects,
  proposals,
  templates,
  billingAlerts,
  priceVatLabel = "s/ IVA",
}: {
  clients: ClientOption[];
  projects: ProjectRow[];
  proposals: ProposalRow[];
  templates: { id: string; name: string }[];
  billingAlerts: BillingAlert[];
  priceVatLabel?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<Tab>("proposals");
  const [showProject, setShowProject] = useState(false);
  const [showProposal, setShowProposal] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clientMode, setClientMode] = useState<"existing" | "new">("existing");
  const [proposalClientMode, setProposalClientMode] = useState<
    "existing" | "new"
  >("existing");
  const [newItems, setNewItems] = useState<ProposalLineItem[]>([emptyItem()]);
  const [editItems, setEditItems] = useState<ProposalLineItem[]>([emptyItem()]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [query, setQuery] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{
    kind: "proposal" | "project";
    id: string;
    title: string;
  } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const selected = proposals.find((p) => p.id === selectedId) ?? null;
  const canEdit =
    selected?.status === "draft" || selected?.status === "revised";

  function openProposal(id: string) {
    const p = proposals.find((x) => x.id === id);
    setSelectedId(id);
    setFormError(null);
    const parsed = p ? parseProposalItems(p.scopeBody) : [];
    if (parsed.length > 0) {
      setEditItems(parsed);
    } else if (p) {
      setEditItems([
        { description: p.scopeBody || p.title, amountEur: p.amountEur },
      ]);
    } else {
      setEditItems([emptyItem()]);
    }
  }

  function run(action: () => Promise<void>) {
    startTransition(async () => {
      try {
        setFormError(null);
        await action();
        router.refresh();
      } catch (e) {
        setFormError(e instanceof Error ? e.message : "Erro ao guardar");
      }
    });
  }

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

  const filteredProposals = useMemo(() => {
    const q = query.trim().toLowerCase();
    return proposals.filter((p) => {
      if (!inDateRange(p.proposalDate || p.createdAt)) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.project.title.toLowerCase().includes(q) ||
        p.project.client.name.toLowerCase().includes(q) ||
        (PROPOSAL_STATUS_LABELS[p.status] ?? p.status)
          .toLowerCase()
          .includes(q)
      );
    });
  }, [proposals, query, dateFrom, dateTo]);

  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (!inDateRange(p.createdAt)) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.client.name.toLowerCase().includes(q) ||
        (PROJECT_STATUS_LABELS[p.status] ?? p.status).toLowerCase().includes(q)
      );
    });
  }, [projects, query, dateFrom, dateTo]);

  return (
    <main className="desk-page flex flex-1 flex-col gap-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Comercial</h1>
          <p className="text-sm text-muted">
            Propostas e projetos · valores {priceVatLabel}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="primary"
            onPress={() => {
              setNewItems([emptyItem()]);
              setProposalClientMode("existing");
              setFormError(null);
              setShowProposal(true);
            }}
          >
            Nova proposta
          </Button>
          <Button variant="secondary" onPress={() => setShowProject(true)}>
            Novo projeto
          </Button>
        </div>
      </header>

      {billingAlerts.length > 0 ? (
        <BillingAlertsBanner
          alerts={billingAlerts}
          pending={pending}
          onMarkProject={(id) => run(() => markProjectBilled(id))}
          onMarkContract={(id) => run(() => markContractBilled(id))}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg bg-default p-0.5 text-xs">
          {(
            [
              ["proposals", `Propostas (${proposals.length})`],
              ["projects", `Projetos (${projects.length})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
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
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pesquisar…"
          className="min-w-[12rem] flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
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

      {tab === "proposals" ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead className="border-b border-border text-xs text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Proposta</th>
                <th className="px-3 py-2 font-medium">Cliente</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium">Valor {priceVatLabel}</th>
                <th className="px-3 py-2 font-medium">Data</th>
                <th className="px-3 py-2 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredProposals.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center text-sm text-muted"
                  >
                    Nenhuma proposta neste filtro.
                  </td>
                </tr>
              ) : (
                filteredProposals.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-separator last:border-0"
                  >
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        className="font-medium underline-offset-2 hover:underline"
                        onClick={() => openProposal(p.id)}
                      >
                        {p.title}
                      </button>
                      <span className="mt-0.5 block text-xs text-muted">
                        {p.project.title}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-muted">
                      {p.project.client.name}
                    </td>
                    <td className="px-3 py-2.5">
                      <form
                        className="inline"
                        action={(fd) => {
                          run(() => setProposalStatusForm(p.id, fd));
                        }}
                      >
                        <select
                          name="status"
                          defaultValue={p.status}
                          onChange={(e) =>
                            e.currentTarget.form?.requestSubmit()
                          }
                          className="rounded-md border border-border px-2 py-1 text-xs"
                          disabled={pending}
                        >
                          {Object.entries(PROPOSAL_STATUS_LABELS).map(
                            ([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ),
                          )}
                        </select>
                      </form>
                    </td>
                    <td className="px-3 py-2.5 text-muted">
                      {p.amountEur.toFixed(2)} €
                    </td>
                    <td className="px-3 py-2.5 text-muted">
                      {formatDatePt(new Date(p.proposalDate || p.createdAt))}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openProposal(p.id)}
                          className="rounded-md border border-border px-2 py-1 text-xs hover:bg-default"
                        >
                          Abrir
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            setConfirmDelete({
                              kind: "proposal",
                              id: p.id,
                              title: p.title,
                            })
                          }
                          className="rounded-md border border-border px-2 py-1 text-xs text-red-700 hover:bg-default disabled:opacity-50"
                        >
                          Apagar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead className="border-b border-border text-xs text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Projeto</th>
                <th className="px-3 py-2 font-medium">Cliente</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium">Propostas</th>
                <th className="px-3 py-2 font-medium">Criado</th>
                <th className="px-3 py-2 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredProjects.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center text-sm text-muted"
                  >
                    Nenhum projeto neste filtro.
                  </td>
                </tr>
              ) : (
                filteredProjects.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-separator last:border-0"
                  >
                    <td className="px-3 py-2.5">
                      <span className="font-medium">{p.title}</span>
                      {p.status === "delivered" && !p.billedAt ? (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-900">
                          A faturar
                        </span>
                      ) : null}
                      {p.billedAt ? (
                        <span className="ml-2 rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                          Faturado
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
                    <td className="px-3 py-2.5">
                      <form
                        className="inline"
                        action={(fd) => {
                          run(() => setProjectStatusForm(p.id, fd));
                        }}
                      >
                        <select
                          name="status"
                          defaultValue={p.status}
                          onChange={(e) =>
                            e.currentTarget.form?.requestSubmit()
                          }
                          className="rounded-md border border-border px-2 py-1 text-xs"
                          disabled={pending}
                        >
                          {Object.entries(PROJECT_STATUS_LABELS).map(
                            ([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ),
                          )}
                        </select>
                      </form>
                    </td>
                    <td className="px-3 py-2.5 text-muted">
                      {p.proposalCount}
                    </td>
                    <td className="px-3 py-2.5 text-muted">
                      {formatDatePt(new Date(p.createdAt))}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Link
                          href={`/projects/${p.id}`}
                          className="rounded-md border border-border px-2 py-1 text-xs hover:bg-default"
                        >
                          Abrir
                        </Link>
                        {p.status === "delivered" && !p.billedAt ? (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => run(() => markProjectBilled(p.id))}
                            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-default disabled:opacity-50"
                          >
                            Marcar faturado
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            setConfirmDelete({
                              kind: "project",
                              id: p.id,
                              title: p.title,
                            })
                          }
                          className="rounded-md border border-border px-2 py-1 text-xs text-red-700 hover:bg-default disabled:opacity-50"
                        >
                          Apagar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showProject ? (
        <Modal title="Novo projeto" onClose={() => setShowProject(false)}>
          <form
            className="flex flex-col gap-2"
            action={(fd) => {
              startTransition(async () => {
                await createProject(fd);
                setShowProject(false);
                setClientMode("existing");
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
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
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

      {showProposal ? (
        <Modal
          title="Nova proposta"
          wide
          onClose={() => setShowProposal(false)}
        >
          <form
            className="flex flex-col gap-2"
            action={(fd) => {
              const cleaned = newItems.filter((i) => i.description.trim());
              if (cleaned.length === 0) {
                setFormError("Adiciona pelo menos um item");
                return;
              }
              fd.set("itemsJson", JSON.stringify(cleaned));
              fd.set("clientMode", proposalClientMode);
              run(async () => {
                await createProposalDraft(fd);
                setShowProposal(false);
                setNewItems([emptyItem()]);
              });
            }}
          >
            <input type="hidden" name="clientMode" value={proposalClientMode} />
            <div className="flex gap-2 text-sm">
              <button
                type="button"
                className={
                  proposalClientMode === "existing"
                    ? "font-medium text-foreground"
                    : "text-muted"
                }
                onClick={() => setProposalClientMode("existing")}
              >
                Cliente existente
              </button>
              <span className="text-muted">·</span>
              <button
                type="button"
                className={
                  proposalClientMode === "new"
                    ? "font-medium text-foreground"
                    : "text-muted"
                }
                onClick={() => setProposalClientMode("new")}
              >
                Cliente novo
              </button>
            </div>
            {proposalClientMode === "existing" ? (
              <select
                name="clientId"
                required
                className="rounded-lg border border-border px-3 py-2 text-sm"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
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
            {templates.length > 0 ? (
              <select
                name="templateId"
                className="rounded-lg border border-border px-3 py-2 text-sm"
                defaultValue={templates[0]?.id}
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    Template: {t.name}
                  </option>
                ))}
              </select>
            ) : null}
            <input
              name="title"
              required
              placeholder="Título da proposta"
              className="rounded-lg border border-border px-3 py-2 text-sm"
            />
            <label className="flex flex-col gap-1 text-xs text-muted">
              Data da proposta
              <input
                name="proposalDate"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
                className="rounded-lg border border-border px-3 py-2 text-sm text-foreground"
              />
            </label>
            <ProposalItemsEditor
              items={newItems}
              onChange={setNewItems}
              vatLabel={priceVatLabel}
            />
            {formError ? (
              <p className="text-sm text-red-600">{formError}</p>
            ) : null}
            <Button type="submit" variant="primary" isDisabled={pending}>
              Guardar rascunho
            </Button>
          </form>
        </Modal>
      ) : null}

      {selected ? (
        <Modal title={selected.title} wide onClose={() => setSelectedId(null)}>
          <p className="mb-3 text-xs text-muted">
            {selected.project.client.name} · {selected.project.title} ·{" "}
            {PROPOSAL_STATUS_LABELS[selected.status] ?? selected.status} ·{" "}
            {formatDatePt(new Date(selected.proposalDate || selected.createdAt))}{" "}
            · {selected.amountEur.toFixed(2)} € {priceVatLabel}
          </p>
          {canEdit ? (
            <form
              className="mb-4 flex flex-col gap-2"
              action={(fd) => {
                const cleaned = editItems.filter((i) => i.description.trim());
                if (cleaned.length === 0) {
                  setFormError("Adiciona pelo menos um item");
                  return;
                }
                fd.set("itemsJson", JSON.stringify(cleaned));
                run(async () => {
                  await updateProposalDraft(selected.id, fd);
                });
              }}
            >
              <input
                name="title"
                required
                defaultValue={selected.title}
                className="rounded-lg border border-border px-3 py-2 text-sm"
              />
              <label className="flex flex-col gap-1 text-xs text-muted">
                Data da proposta
                <input
                  name="proposalDate"
                  type="date"
                  required
                  defaultValue={(
                    selected.proposalDate || selected.createdAt
                  ).slice(0, 10)}
                  className="rounded-lg border border-border px-3 py-2 text-sm text-foreground"
                />
              </label>
              <ProposalItemsEditor
                items={editItems}
                onChange={setEditItems}
                vatLabel={priceVatLabel}
              />
              {formError ? (
                <p className="text-sm text-red-600">{formError}</p>
              ) : null}
              <Button type="submit" variant="primary" isDisabled={pending}>
                Guardar e regenerar HTML
              </Button>
            </form>
          ) : null}
          <div className="overflow-hidden rounded-lg border border-border bg-white">
            <iframe
              title={`Preview ${selected.title}`}
              srcDoc={selected.bodyHtml}
              className="h-[420px] w-full border-0"
              sandbox=""
            />
          </div>
        </Modal>
      ) : null}

      {confirmDelete ? (
        <Modal
          title="Confirmar apagar"
          onClose={() => setConfirmDelete(null)}
        >
          <p className="mb-4 text-sm text-muted">
            Apagar «{confirmDelete.title}»? Esta ação não se pode desfazer.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onPress={() => setConfirmDelete(null)}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              isDisabled={pending}
              onPress={() => {
                const target = confirmDelete;
                setConfirmDelete(null);
                run(async () => {
                  if (target.kind === "proposal") {
                    await deleteProposal(target.id);
                  } else {
                    await deleteProject(target.id);
                  }
                });
              }}
            >
              Apagar
            </Button>
          </div>
        </Modal>
      ) : null}
    </main>
  );
}

function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        className={`w-full rounded-xl bg-surface p-4 shadow-xl ${wide ? "max-w-3xl" : "max-w-md"}`}
      >
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
