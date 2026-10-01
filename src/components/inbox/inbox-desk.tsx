"use client";

import { Button } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  assignInboundToClient,
  ignoreInbound,
} from "@/app/actions/inbox";
import { RequestDetailModal } from "@/components/pipeline/request-detail-modal";

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
  attachments: {
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }[];
};

const STATUS_LABEL: Record<string, string> = {
  matched: "Atribuído automaticamente",
  assigned: "Atribuído manualmente",
  ignored: "Ignorado",
};

const MATCH_LABEL: Record<string, string> = {
  to_token: "Endereço do cliente",
  learned_sender: "Remetente reconhecido",
  from_email: "Email do cliente",
  from_domain: "Domínio do cliente",
  from_domain_or_client_email: "Domínio do cliente",
  thread_reply: "Resposta ao pedido",
  manual_assign: "Atribuição manual",
};

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("pt-PT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

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
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null,
  );

  return (
    <main className="desk-page flex flex-1 flex-col gap-5 py-6">
      <header className="border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
          <p className="text-sm text-muted">
            Suporte recebido em{" "}
            <code className="text-xs">suporte@webiton.pt</code>
          </p>
        </div>
      </header>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium">Por atribuir</h2>
          <span className="rounded-full bg-default px-2 py-0.5 text-xs text-muted">
            {pending.length}
          </span>
        </div>
        {pending.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted">
            Tudo atribuído.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-lg border border-border bg-surface">
            {pending.map((item) => (
              <li key={item.id} className="border-b border-border last:border-0">
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5 hover:bg-default/60">
                    <div className="min-w-0 w-32 shrink-0 sm:w-44">
                      <p className="truncate text-xs font-medium">
                        {item.fromName || item.fromAddress}
                      </p>
                      <p className="truncate text-[11px] text-muted">
                        {item.fromAddress}
                      </p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {item.subject}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {item.bodyText.replace(/\s+/g, " ").slice(0, 150)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-start gap-2 text-[11px] text-muted">
                      {item.attachments.length > 0 ? (
                        <span>📎 {item.attachments.length}</span>
                      ) : null}
                      <time>{formatWhen(item.receivedAt)}</time>
                    </div>
                  </summary>
                  <div className="border-t border-border bg-default/30 px-3 py-3">
                    <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm">
                      {item.bodyText}
                    </p>
                    {item.attachments.length > 0 ? (
                      <ul className="mt-3 flex flex-wrap gap-2">
                        {item.attachments.map((attachment) => (
                          <li key={attachment.id}>
                            <a
                              href={`/api/inbound-attachments/${attachment.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded border border-border bg-surface px-2 py-1 text-xs hover:border-accent"
                            >
                              {attachment.fileName} ·{" "}
                              {formatBytes(attachment.sizeBytes)}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                  <form
                          className="flex min-w-0 flex-1 items-center gap-2"
                    action={(fd) => {
                      startTransition(async () => {
                        await assignInboundToClient(item.id, fd);
                        router.refresh();
                      });
                    }}
                  >
                      <select
                        name="clientId"
                        required
                            defaultValue=""
                            className="min-w-0 flex-1 rounded border border-border bg-surface px-2 py-1.5 text-sm"
                      >
                            <option value="" disabled>
                              Escolher cliente…
                            </option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    <Button type="submit" variant="primary" isDisabled={busy}>
                            Atribuir
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
                </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium">Atividade recente</h2>
        <ul className="overflow-hidden rounded-lg border border-border bg-surface">
          {recent.map((item) => (
            <li key={item.id} className="border-b border-border last:border-0">
              <button
                type="button"
                disabled={!item.requestId}
                onClick={() =>
                  item.requestId && setSelectedRequestId(item.requestId)
                }
                className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-2.5 text-left hover:bg-default/60 disabled:cursor-default sm:grid-cols-[12rem_minmax(0,1fr)_11rem_auto]"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">
                    {item.fromName || item.fromAddress}
                  </p>
                  <p className="truncate text-[11px] text-muted">
                    {item.fromAddress}
                  </p>
                </div>
                <div className="min-w-0 max-sm:col-span-2 max-sm:row-start-2">
                  <p className="truncate text-sm font-medium">{item.subject}</p>
                  <p className="truncate text-xs text-muted">
                    {item.matchedClient?.name || "Sem cliente"}
                  </p>
                </div>
                <div className="hidden min-w-0 sm:block">
                  <p className="truncate text-xs">
                    {STATUS_LABEL[item.status] || item.status}
                  </p>
                  <p className="truncate text-[11px] text-muted">
                    {item.matchReason
                      ? MATCH_LABEL[item.matchReason] || item.matchReason
                      : "—"}
                  </p>
                </div>
                <time className="text-[11px] text-muted">
                  {formatWhen(item.receivedAt)}
                </time>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {selectedRequestId ? (
        <RequestDetailModal
          requestId={selectedRequestId}
          mode="admin"
          onClose={() => setSelectedRequestId(null)}
          onChanged={() => router.refresh()}
        />
      ) : null}
    </main>
  );
}
