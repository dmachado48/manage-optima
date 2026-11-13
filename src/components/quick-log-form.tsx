"use client";

import { Button, Chip } from "@heroui/react";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { logIntervention } from "@/app/actions/interventions";
import { formatMinutes } from "@/lib/dates";

type ContractKind = "pack" | "retainer" | "hourly" | null;
type BillingChoice = "included" | "billable" | "billed" | "non_billable";
type ClientOption = {
  id: string;
  name: string;
  contractType?: ContractKind;
};
type RequestOption = { id: string; title: string; clientId: string };

const MINUTE_OPTIONS = [30, 60, 90, 120];

function billingForContract(type: ContractKind | undefined): BillingChoice {
  return type === "pack" || type === "retainer" ? "included" : "billable";
}

function billingHint(type: ContractKind | undefined): string {
  if (type === "pack") return "Este cliente tem pack — as horas entram no pack.";
  if (type === "retainer") {
    return "Este cliente tem avença — as horas entram na avença.";
  }
  if (type === "hourly") return "Este cliente é à hora — fica por faturar.";
  return "Este cliente não tem pack nem avença — fica por faturar.";
}

function hoursToMinutes(raw: string): number | null {
  const n = Number(raw.trim().replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 60);
}

export function QuickLogForm({
  clients,
  openRequests,
  onSuccess,
  compact = false,
}: {
  clients: ClientOption[];
  openRequests: RequestOption[];
  onSuccess?: () => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [requestId, setRequestId] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [customHours, setCustomHours] = useState("");
  const [note, setNote] = useState("");
  const [billingStatus, setBillingStatus] = useState<BillingChoice>(() =>
    billingForContract(clients[0]?.contractType),
  );
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (clients[0] && !clients.some((c) => c.id === clientId)) {
      setClientId(clients[0].id);
      setBillingStatus(billingForContract(clients[0].contractType));
    }
  }, [clients, clientId]);

  const filteredRequests = openRequests.filter((r) => r.clientId === clientId);

  const selectedClient = clients.find((c) => c.id === clientId);

  function selectClient(id: string) {
    setClientId(id);
    setRequestId("");
    const next = clients.find((c) => c.id === id);
    setBillingStatus(billingForContract(next?.contractType));
  }

  function selectPreset(nextMinutes: number) {
    setMinutes(nextMinutes);
    setCustomHours("");
  }

  function submit() {
    setError(null);
    setOk(false);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      setError("Indica a duração.");
      return;
    }
    startTransition(async () => {
      try {
        await logIntervention({
          clientId,
          requestId: requestId || null,
          minutes,
          note: note || null,
          billingStatus,
        });
        setNote("");
        setRequestId("");
        setMinutes(30);
        setCustomHours("");
        setBillingStatus(billingForContract(selectedClient?.contractType));
        setOk(true);
        router.refresh();
        onSuccess?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao registar");
      }
    });
  }

  return (
    <div className={compact ? "flex flex-col gap-2" : "flex flex-col gap-3"}>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-muted">Cliente</span>
        <select
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
          value={clientId}
          onChange={(e) => selectClient(e.target.value)}
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-muted">Associar a um pedido</span>
        <select
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
          value={requestId}
          onChange={(e) => setRequestId(e.target.value)}
        >
          <option value="">Nenhum — só registar as horas</option>
          {filteredRequests.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </select>
        <span className="text-[11px] text-muted">
          Opcional. Se escolheres um pedido em aberto, estas horas ficam nesse
          trabalho. Se deixares em branco, fica só o registo de horas.
        </span>
      </label>

      <div className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-muted">Duração</span>
        <div className="flex flex-wrap gap-1.5">
          {MINUTE_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => selectPreset(m)}
              className={
                customHours === "" && minutes === m
                  ? "rounded-sm bg-accent px-2.5 py-1 text-white"
                  : "rounded-sm bg-default px-2.5 py-1"
              }
            >
              {m} min
            </button>
          ))}
        </div>
        <label className="mt-1 flex flex-col gap-1">
          <span className="text-xs text-muted">Outro tempo (horas)</span>
          <input
            type="number"
            min={0.5}
            step={0.5}
            inputMode="decimal"
            value={customHours}
            onChange={(e) => {
              const raw = e.target.value;
              setCustomHours(raw);
              const next = hoursToMinutes(raw);
              if (next != null) setMinutes(next);
              if (raw.trim() === "") {
                setMinutes(30);
              }
            }}
            placeholder="ex. 3"
            className="w-28 rounded-md border border-border bg-surface px-2 py-1.5 text-sm normal-case"
          />
        </label>
        {customHours.trim() !== "" && minutes > 0 ? (
          <span className="text-[11px] text-muted">
            Vai registar {formatMinutes(minutes)}.
          </span>
        ) : null}
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-muted">Nota</span>
        <textarea
          className={
            compact
              ? "min-h-16 resize-none rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
              : "min-h-20 rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
          }
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="O que fizeste?"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-muted">Faturação</span>
        <select
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
          value={billingStatus}
          onChange={(e) => setBillingStatus(e.target.value as BillingChoice)}
        >
          <option value="included">Incluída no pack ou avença</option>
          <option value="billable">Por faturar</option>
          <option value="non_billable">Não faturável</option>
          <option value="billed">Já faturada</option>
        </select>
        <span className="text-[11px] text-muted">
          {billingHint(selectedClient?.contractType)} Podes mudar antes de
          guardar.
        </span>
      </label>

      {error ? (
        <Chip className="bg-danger-soft text-danger" aria-live="polite">
          {error}
        </Chip>
      ) : null}
      {ok ? (
        <p className="text-xs text-green-700" aria-live="polite">
          Intervenção guardada.
        </p>
      ) : null}

      <Button
        variant="primary"
        isDisabled={pending || !clientId}
        onPress={submit}
      >
        {pending ? "A guardar…" : "Guardar intervenção"}
      </Button>
    </div>
  );
}
