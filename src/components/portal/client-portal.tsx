"use client";

import { Button } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createPortalRequest } from "@/app/actions/portal";
import { ClientWorkBoard, type KanbanRequest } from "@/components/clients/work-board";
import { remainingHours } from "@/lib/billing";

type ReportRow = {
  id: string;
  body: string;
  periodStart: string;
  periodEnd: string;
};

export function ClientPortal({
  token,
  clientName,
  clientId,
  hoursTotal,
  hoursUsed,
  contractType,
  requests,
  reports,
}: {
  token: string;
  clientName: string;
  clientId: string;
  hoursTotal: number | null;
  hoursUsed: number | null;
  contractType: string | null;
  requests: KanbanRequest[];
  reports: ReportRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const remaining =
    hoursTotal != null && hoursUsed != null
      ? remainingHours(hoursTotal, hoursUsed)
      : null;

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--background)]">
      <div className="desk-page flex flex-1 flex-col gap-6 py-6">
        <header className="border-b border-border pb-4">
          <p className="text-xs text-muted">Webiton · Optima Desk</p>
          <h1 className="text-2xl font-semibold tracking-tight">{clientName}</h1>
          <p className="text-sm text-muted">
            Portal do cliente — podes criar pedidos; o estado é atualizado pela
            Webiton.
          </p>
          {remaining != null ? (
            <p className="mt-2 text-sm">
              Contrato {contractType}:{" "}
              <span className="font-medium">
                {remaining}h restantes
              </span>{" "}
              de {hoursTotal}h
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted">Sem pack/retainer ativo</p>
          )}
        </header>

        <section className="rounded-lg border border-border bg-[var(--field-background)] p-4">
          <h2 className="mb-2 text-sm font-medium">Novo pedido</h2>
          <form
            className="flex flex-col gap-2"
            action={(fd) => {
              setError(null);
              setOk(false);
              startTransition(async () => {
                try {
                  await createPortalRequest(fd);
                  setOk(true);
                  router.refresh();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Erro ao criar");
                }
              });
            }}
          >
            <input type="hidden" name="token" value={token} />
            <input
              name="title"
              required
              placeholder="O que precisas?"
              className="rounded border border-border bg-transparent px-3 py-2 text-sm"
            />
            <textarea
              name="description"
              rows={3}
              placeholder="Detalhes (opcional)"
              className="rounded border border-border bg-transparent px-3 py-2 text-sm"
            />
            {error ? <p className="text-xs text-red-500">{error}</p> : null}
            {ok ? (
              <p className="text-xs text-green-600">
                Pedido enviado — aparece na coluna Pedidos.
              </p>
            ) : null}
            <Button type="submit" variant="primary" isDisabled={pending}>
              {pending ? "A enviar…" : "Enviar pedido"}
            </Button>
          </form>
        </section>

        <section className="flex min-h-0 flex-1 flex-col">
          <ClientWorkBoard
            readOnly
            lockedClientId={clientId}
            clients={[{ id: clientId, name: clientName }]}
            title="Pipeline dos teus pedidos"
            requests={requests}
            portalToken={token}
          />
        </section>

        {reports.length > 0 ? (
          <section className="border-t border-border pt-4">
            <h2 className="mb-3 text-sm font-medium">Relatórios publicados</h2>
            <ul className="flex flex-col gap-3">
              {reports.map((r) => (
                <li
                  key={r.id}
                  className="rounded-lg border border-border p-3"
                >
                  <p className="mb-2 text-xs text-muted">
                    {new Date(r.periodStart).toLocaleDateString("pt-PT")} —{" "}
                    {new Date(r.periodEnd).toLocaleDateString("pt-PT")}
                  </p>
                  <pre className="whitespace-pre-wrap text-sm">{r.body}</pre>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
