"use client";

import { Button } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  assignInboundToClient,
  ignoreInbound,
  pasteInboundEmail,
} from "@/app/actions/inbox";

type ClientOption = { id: string; name: string; email: string | null };

type InboundRow = {
  id: string;
  fromAddress: string;
  fromName: string | null;
  toAddress: string | null;
  subject: string;
  bodyText: string;
  receivedAt: string;
  status: string;
  matchReason: string | null;
  matchedClient: { id: string; name: string } | null;
  requestId: string | null;
};

export function InboxDesk({
  clients,
  pending,
  recent,
}: {
  clients: ClientOption[];
  pending: InboundRow[];
  recent: InboundRow[];
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [showPaste, setShowPaste] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  return (
    <main className="desk-page flex flex-1 flex-col gap-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
          <p className="text-sm text-muted">
            Emails em{" "}
            <code className="text-xs">requests@webiton.pt</code> — matching
            automático ou triagem manual
          </p>
        </div>
        <Button variant="primary" onPress={() => setShowPaste(true)}>
          Colar email
        </Button>
      </header>

      {result ? (
        <p className="rounded border border-border px-3 py-2 text-sm">{result}</p>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-medium">
          Triagem ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-muted">Nada por atribuir.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pending.map((item) => (
              <li
                key={item.id}
                className="rounded-xl border border-border bg-surface p-4"
              >
                <p className="font-medium">{item.subject}</p>
                <p className="text-xs text-muted">
                  De {item.fromName ? `${item.fromName} · ` : ""}
                  {item.fromAddress}
                  {item.toAddress ? ` → ${item.toAddress}` : ""} ·{" "}
                  {new Date(item.receivedAt).toLocaleString("pt-PT")}
                </p>
                <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap text-xs text-muted">
                  {item.bodyText.slice(0, 800)}
                </pre>
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <form
                    className="flex flex-wrap items-end gap-2"
                    action={(fd) => {
                      startTransition(async () => {
                        await assignInboundToClient(item.id, fd);
                        router.refresh();
                      });
                    }}
                  >
                    <label className="flex flex-col gap-1 text-xs">
                      <span className="text-muted">Atribuir a</span>
                      <select
                        name="clientId"
                        required
                        className="rounded border border-border px-2 py-1.5 text-sm"
                      >
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                            {c.email ? ` (${c.email})` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button type="submit" variant="primary" isDisabled={busy}>
                      Criar pedido
                    </Button>
                  </form>
                  <Button
                    variant="ghost"
                    isDisabled={busy}
                    onPress={() => {
                      startTransition(async () => {
                        await ignoreInbound(item.id);
                        router.refresh();
                      });
                    }}
                  >
                    Ignorar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium">Recentes</h2>
        <ul className="flex flex-col gap-2">
          {recent.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-border px-3 py-2 text-sm"
            >
              <span className="font-medium">{item.subject}</span>
              <span className="text-muted">
                {" "}
                · {item.status}
                {item.matchedClient ? ` · ${item.matchedClient.name}` : ""}
                {item.matchReason ? ` · ${item.matchReason}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {showPaste ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-xl bg-surface p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-medium">Simular / colar email</h2>
              <button
                type="button"
                className="text-sm text-muted"
                onClick={() => setShowPaste(false)}
              >
                Fechar
              </button>
            </div>
            <form
              className="flex flex-col gap-2"
              action={(fd) => {
                startTransition(async () => {
                  const r = await pasteInboundEmail(fd);
                  setResult(
                    r.status === "matched"
                      ? `Matched → pedido criado (${r.matchReason})`
                      : r.status === "pending"
                        ? "Sem match — foi para triagem"
                        : "Duplicado (mesmo messageId)",
                  );
                  setShowPaste(false);
                  router.refresh();
                });
              }}
            >
              <input
                name="fromAddress"
                required
                placeholder="From (email)"
                defaultValue="contacto@cliente-exemplo.pt"
                className="rounded border border-border px-3 py-2 text-sm"
              />
              <input
                name="toAddress"
                placeholder="To (opcional: requests+TOKEN@webiton.pt)"
                defaultValue="requests@webiton.pt"
                className="rounded border border-border px-3 py-2 text-sm"
              />
              <input
                name="subject"
                required
                placeholder="Assunto"
                className="rounded border border-border px-3 py-2 text-sm"
              />
              <textarea
                name="bodyText"
                required
                rows={6}
                placeholder="Corpo do email"
                className="rounded border border-border px-3 py-2 text-sm"
              />
              <Button type="submit" variant="primary" isDisabled={busy}>
                Ingerir
              </Button>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
