"use client";

import { Button } from "@heroui/react";
import { useEffect, useState, useTransition } from "react";
import {
  closeRequestAsHours,
  closeRequestAsProjectTask,
  getRequestCloseOptions,
  type RequestCloseOptions,
} from "@/app/actions/requests";

const MINUTE_OPTIONS = [30, 60, 90, 120];

type Mode = "idle" | "hours" | "project";

export function RequestClosePanel({
  requestId,
  requestTitle,
  alreadyDone,
  closeKind,
  buildTask,
  onClosed,
}: {
  requestId: string;
  requestTitle: string;
  alreadyDone: boolean;
  closeKind: "hours" | "project_task" | null;
  buildTask: {
    id: string;
    title: string;
    projectId: string;
    projectTitle: string;
  } | null;
  onClosed: () => void;
}) {
  const [mode, setMode] = useState<Mode>("idle");
  const [options, setOptions] = useState<RequestCloseOptions | null>(null);
  const [minutes, setMinutes] = useState(30);
  const [agreedAmountEur, setAgreedAmountEur] = useState("");
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
    if (mode === "idle") return;
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
        });
        setMode("idle");
        onClosed();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao associar");
      }
    });
  }

  if (alreadyDone) {
    return (
      <div className="rounded-lg border border-border bg-default/40 px-3 py-2 text-xs text-muted">
        {closeKind === "hours"
          ? "Fechado com registo no histórico (tempo / valor)."
          : closeKind === "project_task" && buildTask
            ? `Associado a «${buildTask.projectTitle}» · «${buildTask.title}» e registado no histórico.`
            : "Pedido concluído."}
      </div>
    );
  }

  if (mode === "idle") {
    return (
      <div className="rounded-lg border border-border px-3 py-2">
        <p className="mb-1 text-xs font-medium text-muted">Concluir pedido</p>
        <p className="mb-2 text-[11px] text-muted">
          Obrigatório tempo ou valor acordado (€) para o histórico e faturação.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="primary"
            isDisabled={pending}
            onPress={() => setMode("hours")}
          >
            Registar no histórico
          </Button>
          <Button
            size="sm"
            variant="secondary"
            isDisabled={pending}
            onPress={() => setMode("project")}
          >
            Associar a projeto
          </Button>
        </div>
      </div>
    );
  }

  const billingFields = (
    <>
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
        placeholder="Nota (opcional)"
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

  return (
    <div className="rounded-lg border border-border px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium">
          {mode === "hours"
            ? "Fechar · histórico / faturação"
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
          {billingFields}
          <Button
            variant="primary"
            isDisabled={pending || !canSubmit}
            onPress={submitHours}
          >
            {pending ? "A guardar…" : "Fechar e registar"}
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
              {billingFields}
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
                {pending ? "A guardar…" : "Fechar, associar e registar"}
              </Button>
            </>
          )}
        </div>
      )}

      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
    </div>
  );
}
