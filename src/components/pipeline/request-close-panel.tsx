"use client";

import { Button } from "@heroui/react";
import { useEffect, useState, useTransition } from "react";
import {
  closeRequestAsHours,
  closeRequestAsProjectTask,
  getRequestCloseOptions,
  getRequestRegistration,
  reopenRequest,
  updateRequestRegistration,
  updateRequestStatus,
  type RequestCloseOptions,
  type RequestRegistration,
} from "@/app/actions/requests";
import { INTERVENTION_BILLING_LABELS } from "@/lib/billing";

const MINUTE_OPTIONS = [30, 60, 90, 120];

type Mode = "idle" | "hours" | "project" | "edit";

function todayInputValue() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toDateInput(iso: string | null) {
  if (!iso) return todayInputValue();
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return todayInputValue();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function RequestClosePanel({
  requestId,
  requestTitle,
  status,
  closedAt,
  closeKind,
  buildTask,
  onClosed,
}: {
  requestId: string;
  requestTitle: string;
  status: "requested" | "in_progress" | "waiting_on_client" | "done";
  closedAt: string | null;
  closeKind: "hours" | "project_task" | null;
  buildTask: {
    id: string;
    title: string;
    projectId: string;
    projectTitle: string;
  } | null;
  onClosed: () => void;
}) {
  const finalized = Boolean(closedAt);
  const softDone = status === "done" && !finalized;

  const [mode, setMode] = useState<Mode>("idle");
  const [options, setOptions] = useState<RequestCloseOptions | null>(null);
  const [registration, setRegistration] = useState<RequestRegistration | null>(
    null,
  );
  const [minutes, setMinutes] = useState(30);
  const [agreedAmountEur, setAgreedAmountEur] = useState("");
  const [completedAt, setCompletedAt] = useState(todayInputValue);
  const [note, setNote] = useState("");
  const [billingStatus, setBillingStatus] = useState<
    "" | "included" | "billable" | "non_billable"
  >("");
  const [projectId, setProjectId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [markTaskDone, setMarkTaskDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!finalized) {
      setRegistration(null);
      return;
    }
    startTransition(async () => {
      try {
        const data = await getRequestRegistration(requestId);
        setRegistration(data);
      } catch {
        setRegistration(null);
      }
    });
  }, [finalized, requestId, closedAt]);

  useEffect(() => {
    if (mode !== "hours" && mode !== "project") return;
    startTransition(async () => {
      try {
        setError(null);
        const data = await getRequestCloseOptions(requestId);
        setOptions(data);
        setProjectId(data.projects[0]?.id ?? "");
        setNewTaskTitle(requestTitle);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao carregar opções");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load when mode opens
  }, [mode, requestId]);

  const selectedProject = options?.projects.find((p) => p.id === projectId);
  const tasks = selectedProject?.tasks ?? [];
  const amountNum = Number(agreedAmountEur.replace(",", "."));
  const hasAmount = agreedAmountEur.trim() !== "" && amountNum > 0;
  const hasTime = minutes > 0;
  const canSubmit = hasTime || hasAmount;

  function fillFromRegistration(reg: RequestRegistration) {
    setMinutes(reg.minutes);
    setAgreedAmountEur(
      reg.agreedAmountEur != null ? String(reg.agreedAmountEur) : "",
    );
    setNote(reg.note ?? "");
    setCompletedAt(toDateInput(reg.performedAt));
    setBillingStatus(
      reg.billingStatus === "included" ||
        reg.billingStatus === "billable" ||
        reg.billingStatus === "non_billable"
        ? reg.billingStatus
        : "billable",
    );
  }

  function startEdit() {
    if (!registration?.editable) return;
    fillFromRegistration(registration);
    setError(null);
    setMode("edit");
  }

  function markSoftDone() {
    setError(null);
    startTransition(async () => {
      try {
        await updateRequestStatus(requestId, "done");
        onClosed();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao concluir");
      }
    });
  }

  function submitHours() {
    setError(null);
    startTransition(async () => {
      try {
        await closeRequestAsHours({
          requestId,
          minutes: hasTime ? minutes : 0,
          agreedAmountEur: hasAmount ? amountNum : null,
          note: note || null,
          billingStatus: billingStatus || null,
          completedAt,
        });
        setMode("idle");
        onClosed();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao fechar");
      }
    });
  }

  function submitProject() {
    setError(null);
    startTransition(async () => {
      try {
        if (!projectId) throw new Error("Escolhe um projeto");
        if (!taskId && !newTaskTitle.trim()) {
          throw new Error("Escolhe ou cria uma tarefa");
        }
        if (!canSubmit) {
          throw new Error("Indica tempo ou valor acordado (€)");
        }
        await closeRequestAsProjectTask({
          requestId,
          projectId,
          taskId: taskId || null,
          newTaskTitle: taskId ? null : newTaskTitle,
          minutes: hasTime ? minutes : 0,
          agreedAmountEur: hasAmount ? amountNum : null,
          markTaskDone,
          note: note || null,
          billingStatus: billingStatus || null,
          completedAt,
        });
        setMode("idle");
        onClosed();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao associar");
      }
    });
  }

  function submitEdit() {
    setError(null);
    startTransition(async () => {
      try {
        if (!canSubmit) {
          throw new Error("Indica tempo ou valor acordado (€)");
        }
        await updateRequestRegistration({
          requestId,
          minutes: hasTime ? minutes : 0,
          agreedAmountEur: hasAmount ? amountNum : null,
          note: note || null,
          billingStatus: billingStatus || null,
          completedAt,
        });
        setMode("idle");
        onClosed();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao guardar");
      }
    });
  }

  function doReopen() {
    setError(null);
    startTransition(async () => {
      try {
        await reopenRequest(requestId);
        setMode("idle");
        onClosed();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao reabrir");
      }
    });
  }

  if (finalized && mode === "edit") {
    return (
      <div className="rounded-lg border border-border px-3 py-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-medium">Editar registo</p>
          <button
            type="button"
            className="text-[11px] text-muted"
            onClick={() => {
              setMode("idle");
              setError(null);
            }}
          >
            Cancelar
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {billingFields({
            completedAt,
            setCompletedAt,
            minutes,
            setMinutes,
            agreedAmountEur,
            setAgreedAmountEur,
            note,
            setNote,
            billingStatus,
            setBillingStatus,
          })}
          <Button
            variant="primary"
            isDisabled={pending || !canSubmit}
            onPress={submitEdit}
          >
            {pending ? "A guardar…" : "Guardar alterações"}
          </Button>
        </div>
        {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
      </div>
    );
  }

  if (finalized) {
    const when = closedAt
      ? new Date(closedAt).toLocaleDateString("pt-PT")
      : "";
    const summary =
      closeKind === "hours"
        ? `Fechado e registado${when ? ` em ${when}` : ""}. Saiu do pipeline.`
        : closeKind === "project_task" && buildTask
          ? `Fechado${when ? ` em ${when}` : ""} · «${buildTask.projectTitle}» · «${buildTask.title}». Saiu do pipeline.`
          : `Fechado${when ? ` em ${when}` : ""}.`;

    const canEdit = Boolean(registration?.editable);
    const regLabel = registration
      ? [
          registration.minutes > 0 ? `${registration.minutes} min` : null,
          registration.agreedAmountEur != null &&
          registration.agreedAmountEur > 0
            ? `${registration.agreedAmountEur} €`
            : null,
          INTERVENTION_BILLING_LABELS[registration.billingStatus],
        ]
          .filter(Boolean)
          .join(" · ")
      : null;

    return (
      <div className="rounded-lg border border-border bg-default/40 px-3 py-2 text-xs">
        <p className="text-muted">{summary}</p>
        {regLabel ? (
          <p className="mt-1 font-medium text-foreground">{regLabel}</p>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-2">
          {canEdit ? (
            <Button
              size="sm"
              variant="primary"
              isDisabled={pending}
              onPress={startEdit}
            >
              Editar registo
            </Button>
          ) : registration ? (
            <span className="text-[11px] text-muted">Já faturado — só leitura</span>
          ) : null}
          {canEdit || !registration ? (
            <Button
              size="sm"
              variant="secondary"
              isDisabled={pending}
              onPress={doReopen}
            >
              Reabrir no pipeline
            </Button>
          ) : null}
        </div>
        {error ? <p className="mt-2 text-danger">{error}</p> : null}
      </div>
    );
  }

  if (mode === "idle") {
    return (
      <div className="rounded-lg border border-border px-3 py-2">
        {softDone ? (
          <>
            <p className="mb-1 text-xs font-medium">Concluído — falta fechar</p>
            <p className="mb-2 text-[11px] text-muted">
              Regista o tempo ou valor acordado e a data. Depois sai da lista
              Concluído e fica no histórico do cliente.
            </p>
          </>
        ) : (
          <>
            <p className="mb-1 text-xs font-medium text-muted">Concluir / fechar</p>
            <p className="mb-2 text-[11px] text-muted">
              Podes marcar como concluído agora e fechar depois com tempo/€, ou
              fechar já e sair da lista.
            </p>
          </>
        )}
        <div className="flex flex-wrap gap-2">
          {!softDone ? (
            <Button
              size="sm"
              variant="secondary"
              isDisabled={pending}
              onPress={markSoftDone}
            >
              Marcar concluído
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="primary"
            isDisabled={pending}
            onPress={() => setMode("hours")}
          >
            Fechar e registar
          </Button>
          <Button
            size="sm"
            variant="secondary"
            isDisabled={pending}
            onPress={() => setMode("project")}
          >
            Fechar · projeto
          </Button>
        </div>
        {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium">
          {mode === "hours"
            ? "Fechar · registo no histórico"
            : "Fechar · projeto + histórico"}
        </p>
        <button
          type="button"
          className="text-[11px] text-muted"
          onClick={() => {
            setMode("idle");
            setError(null);
          }}
        >
          Cancelar
        </button>
      </div>

      {mode === "hours" ? (
        <div className="flex flex-col gap-2">
          {billingFields({
            completedAt,
            setCompletedAt,
            minutes,
            setMinutes,
            agreedAmountEur,
            setAgreedAmountEur,
            note,
            setNote,
            billingStatus,
            setBillingStatus,
          })}
          <Button
            variant="primary"
            isDisabled={pending || !canSubmit}
            onPress={submitHours}
          >
            {pending ? "A guardar…" : "Fechar, registar e sair da lista"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {!options ? (
            <p className="text-xs text-muted">A carregar projetos…</p>
          ) : options.projects.length === 0 ? (
            <p className="text-xs text-muted">
              Este cliente não tem projetos ativos. Cria um projeto primeiro.
            </p>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted">Projeto</span>
                <select
                  value={projectId}
                  onChange={(e) => {
                    setProjectId(e.target.value);
                    setTaskId("");
                  }}
                  className="rounded border border-border bg-[var(--field-background)] px-2 py-1.5 text-sm"
                >
                  {options.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted">Tarefa existente</span>
                <select
                  value={taskId}
                  onChange={(e) => setTaskId(e.target.value)}
                  className="rounded border border-border bg-[var(--field-background)] px-2 py-1.5 text-sm"
                >
                  <option value="">Criar nova tarefa</option>
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </label>
              {!taskId ? (
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-muted">Título da nova tarefa</span>
                  <input
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    className="rounded border border-border bg-[var(--field-background)] px-2 py-1.5 text-sm"
                  />
                </label>
              ) : null}
              {billingFields({
                completedAt,
                setCompletedAt,
                minutes,
                setMinutes,
                agreedAmountEur,
                setAgreedAmountEur,
                note,
                setNote,
                billingStatus,
                setBillingStatus,
              })}
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={markTaskDone}
                  onChange={(e) => setMarkTaskDone(e.target.checked)}
                />
                Marcar tarefa como concluída
              </label>
              <Button
                variant="primary"
                isDisabled={pending || !canSubmit}
                onPress={submitProject}
              >
                {pending ? "A guardar…" : "Fechar, registar e sair da lista"}
              </Button>
            </>
          )}
        </div>
      )}

      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
    </div>
  );
}

function billingFields({
  completedAt,
  setCompletedAt,
  minutes,
  setMinutes,
  agreedAmountEur,
  setAgreedAmountEur,
  note,
  setNote,
  billingStatus,
  setBillingStatus,
}: {
  completedAt: string;
  setCompletedAt: (v: string) => void;
  minutes: number;
  setMinutes: (v: number) => void;
  agreedAmountEur: string;
  setAgreedAmountEur: (v: string) => void;
  note: string;
  setNote: (v: string) => void;
  billingStatus: "" | "included" | "billable" | "non_billable";
  setBillingStatus: (
    v: "" | "included" | "billable" | "non_billable",
  ) => void;
}) {
  return (
    <>
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted">Data de conclusão</span>
        <input
          type="date"
          value={completedAt}
          onChange={(e) => setCompletedAt(e.target.value)}
          className="w-40 rounded border border-border bg-[var(--field-background)] px-2 py-1.5 text-sm"
        />
      </label>
      <div className="flex flex-col gap-1">
        <span className="text-[11px] text-muted">Tempo (múltiplos de 30 min)</span>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setMinutes(0)}
            className={
              minutes === 0
                ? "rounded-sm bg-accent px-2 py-1 text-[11px] text-white"
                : "rounded-sm border border-border px-2 py-1 text-[11px] text-muted"
            }
          >
            Só €
          </button>
          {MINUTE_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMinutes(m)}
              className={
                minutes === m
                  ? "rounded-sm bg-accent px-2 py-1 text-[11px] text-white"
                  : "rounded-sm border border-border px-2 py-1 text-[11px] text-muted"
              }
            >
              {m} min
            </button>
          ))}
        </div>
        <input
          type="number"
          min={0}
          step={30}
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value) || 0)}
          className="w-28 rounded border border-border bg-[var(--field-background)] px-2 py-1.5 text-sm"
        />
      </div>
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted">Valor acordado (€)</span>
        <input
          type="number"
          min={0}
          step={0.01}
          placeholder="ex. 150"
          value={agreedAmountEur}
          onChange={(e) => setAgreedAmountEur(e.target.value)}
          className="w-36 rounded border border-border bg-[var(--field-background)] px-2 py-1.5 text-sm"
        />
      </label>
      <textarea
        rows={2}
        placeholder="Nota / o que foi feito (opcional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="rounded border border-border bg-[var(--field-background)] px-2 py-1.5 text-sm"
      />
      <select
        value={billingStatus}
        onChange={(e) =>
          setBillingStatus(
            e.target.value as "" | "included" | "billable" | "non_billable",
          )
        }
        className="rounded border border-border bg-[var(--field-background)] px-2 py-1.5 text-sm"
      >
        <option value="">Faturação automática</option>
        <option value="included">Incluído (avença/pack)</option>
        <option value="billable">Por faturar</option>
        <option value="non_billable">Não faturável</option>
      </select>
    </>
  );
}
