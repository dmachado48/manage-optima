"use client";

import { Button, Chip } from "@heroui/react";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { logIntervention } from "@/app/actions/interventions";

type ClientOption = { id: string; name: string };
type RequestOption = { id: string; title: string; clientId: string };

const MINUTE_OPTIONS = [30, 60, 90, 120];

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
  const [note, setNote] = useState("");
  const [billingStatus, setBillingStatus] = useState<
    "" | "included" | "billable" | "billed" | "non_billable"
  >("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (clients[0] && !clients.some((c) => c.id === clientId)) {
      setClientId(clients[0].id);
    }
  }, [clients, clientId]);

  const filteredRequests = openRequests.filter((r) => r.clientId === clientId);

  function submit() {
    setError(null);
    setOk(false);
    startTransition(async () => {
      try {
        await logIntervention({
          clientId,
          requestId: requestId || null,
          minutes,
          note: note || null,
          billingStatus: billingStatus || null,
        });
        setNote("");
        setRequestId("");
        setMinutes(30);
        setBillingStatus("");
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
          onChange={(e) => {
            setClientId(e.target.value);
            setRequestId("");
          }}
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-muted">Pedido (opcional)</span>
        <select
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
          value={requestId}
          onChange={(e) => setRequestId(e.target.value)}
        >
          <option value="">Criar pedido avulso</option>
          {filteredRequests.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-muted">Duração</span>
        <div className="flex flex-wrap gap-1.5">
          {MINUTE_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMinutes(m)}
              className={
                minutes === m
                  ? "rounded-sm bg-accent px-2.5 py-1 text-white"
                  : "rounded-sm bg-default px-2.5 py-1"
              }
            >
              {m} min
            </button>
          ))}
        </div>
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
          onChange={(e) =>
            setBillingStatus(
              e.target.value as
                | ""
                | "included"
                | "billable"
                | "billed"
                | "non_billable",
            )
          }
        >
          <option value="">Automático (pack / horário)</option>
          <option value="included">Incluída no pack</option>
          <option value="billable">Por faturar</option>
          <option value="non_billable">Não faturável</option>
          <option value="billed">Já faturada</option>
        </select>
      </label>

      {error ? (
        <Chip className="bg-danger-soft text-danger">{error}</Chip>
      ) : null}
      {ok ? (
        <p className="text-xs text-green-700">Intervenção guardada.</p>
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
