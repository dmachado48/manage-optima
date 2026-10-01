"use client";

import { Button, Chip } from "@heroui/react";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  getPortalRequestThread,
  getRequestThread,
  postPortalRequestMessage,
  postRequestMessage,
  type RequestThread,
} from "@/app/actions/messages";
import { updateRequestStatus } from "@/app/actions/requests";

const STATUS_LABEL: Record<RequestThread["status"], string> = {
  requested: "Pedidos",
  in_progress: "Em curso",
  waiting_on_client: "À espera",
  done: "Concluído",
};

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("pt-PT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RequestDetailModal({
  requestId,
  mode,
  portalToken,
  onClose,
  onChanged,
}: {
  requestId: string;
  mode: "admin" | "portal";
  portalToken?: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [thread, setThread] = useState<RequestThread | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  function refresh() {
    startTransition(async () => {
      try {
        setLoadError(null);
        const data =
          mode === "admin"
            ? await getRequestThread(requestId)
            : await getPortalRequestThread(portalToken!, requestId);
        setThread(data);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Erro ao carregar");
      }
    });
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per requestId
  }, [requestId, mode, portalToken]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages.length]);

  function attachmentHref(id: string) {
    if (mode === "portal" && portalToken) {
      return `/api/attachments/${id}?token=${encodeURIComponent(portalToken)}`;
    }
    return `/api/attachments/${id}`;
  }

  function send() {
    setSendError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("requestId", requestId);
        fd.set("body", body);
        if (mode === "admin" && editorRef.current) {
          fd.set("bodyHtml", editorRef.current.innerHTML);
        }
        if (mode === "portal" && portalToken) fd.set("token", portalToken);
        if (files) {
          Array.from(files).forEach((f) => fd.append("files", f));
        }
        const next =
          mode === "admin"
            ? await postRequestMessage(fd)
            : await postPortalRequestMessage(fd);
        setThread(next);
        setBody("");
        if (editorRef.current) editorRef.current.innerHTML = "";
        setFiles(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        onChanged?.();
      } catch (e) {
        setSendError(e instanceof Error ? e.message : "Erro ao enviar");
      }
    });
  }

  function setStatus(status: RequestThread["status"]) {
    if (mode !== "admin") return;
    startTransition(async () => {
      await updateRequestStatus(requestId, status);
      refresh();
      onChanged?.();
    });
  }

  function format(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    if (editorRef.current) {
      setBody(editorRef.current.innerText.trim());
    }
  }

  function addLink() {
    const url = window.prompt("Endereço do link");
    if (url?.trim()) format("createLink", url.trim());
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-surface shadow-xl sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="request-modal-title"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs text-muted">
              {thread?.client.name ?? "…"}
              {thread ? ` · ${STATUS_LABEL[thread.status]}` : ""}
            </p>
            <h2
              id="request-modal-title"
              className="truncate text-lg font-medium"
            >
              {thread?.title ?? "A carregar…"}
            </h2>
          </div>
          <Button variant="ghost" onPress={onClose}>
            Fechar
          </Button>
        </header>

        {loadError ? (
          <p className="p-4 text-sm text-danger">{loadError}</p>
        ) : !thread ? (
          <p className="p-4 text-sm text-muted">A carregar conversa…</p>
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
              {thread.description &&
              (thread.source !== "email" || thread.messages.length === 0) ? (
                <p className="rounded-lg bg-default px-3 py-2 text-sm text-foreground/90">
                  {thread.description}
                </p>
              ) : null}

              {mode === "admin" ? (
                <div className="flex flex-wrap gap-1">
                  {(
                    Object.keys(STATUS_LABEL) as RequestThread["status"][]
                  ).map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={pending || thread.status === s}
                      onClick={() => setStatus(s)}
                      className={
                        thread.status === s
                          ? "rounded-sm bg-accent px-2 py-1 text-[10px] text-white"
                          : "rounded-sm border border-border px-2 py-1 text-[10px] text-muted"
                      }
                    >
                      {STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
              ) : (
                <Chip className="bg-default text-xs">
                  {STATUS_LABEL[thread.status]}
                </Chip>
              )}

              {thread.looseAttachments.length > 0 ? (
                <div>
                  <p className="mb-1 text-xs font-medium text-muted">Anexos</p>
                  <ul className="flex flex-col gap-1">
                    {thread.looseAttachments.map((a) => (
                      <li key={a.id}>
                        <a
                          href={attachmentHref(a.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm underline-offset-2 hover:underline"
                        >
                          {a.fileName}{" "}
                          <span className="text-xs text-muted">
                            ({formatBytes(a.sizeBytes)})
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="flex flex-col gap-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  Conversa
                </p>
                {thread.messages.length === 0 ? (
                  <p className="text-sm text-muted">
                    Ainda sem mensagens. Escreve a primeira.
                  </p>
                ) : (
                  thread.messages.map((m) => {
                    const mine =
                      (mode === "admin" && m.author === "admin") ||
                      (mode === "portal" && m.author === "client");
                    return (
                      <div
                        key={m.id}
                        className={
                          mine
                            ? "ml-8 rounded-lg bg-accent/15 px-3 py-2"
                            : "mr-8 rounded-lg bg-default px-3 py-2"
                        }
                      >
                        <div className="mb-1 flex items-baseline justify-between gap-2">
                          <span className="text-[11px] font-medium text-muted">
                            {m.author === "admin" ? "Webiton" : "Cliente"}
                          </span>
                          <span className="text-[10px] text-muted">
                            {formatWhen(m.createdAt)}
                          </span>
                        </div>
                        {m.bodyHtml ? (
                          <div
                            className="email-content text-sm [&_a]:text-accent [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5"
                            dangerouslySetInnerHTML={{ __html: m.bodyHtml }}
                          />
                        ) : (
                          <p className="whitespace-pre-wrap text-sm">{m.body}</p>
                        )}
                        {m.attachments.length > 0 ? (
                          <ul className="mt-2 space-y-1">
                            {m.attachments.map((a) => (
                              <li key={a.id}>
                                <a
                                  href={attachmentHref(a.id)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs underline"
                                >
                                  {a.fileName} ({formatBytes(a.sizeBytes)})
                                </a>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>
            </div>

            <footer className="shrink-0 border-t border-border px-4 py-3">
              <div className="flex flex-col gap-2">
                {mode === "admin" ? (
                  <>
                    {thread.emailRecipient ? (
                      <p className="text-[11px] text-muted">
                        Responder por email a {thread.emailRecipient}
                      </p>
                    ) : null}
                    <div className="flex items-center gap-1 rounded-t-md border border-b-0 border-border bg-default px-2 py-1">
                      {[
                        ["B", "bold"],
                        ["I", "italic"],
                        ["U", "underline"],
                        ["• Lista", "insertUnorderedList"],
                        ["1. Lista", "insertOrderedList"],
                      ].map(([label, command]) => (
                        <button
                          key={command}
                          type="button"
                          className="rounded px-2 py-1 text-xs hover:bg-surface"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => format(command)}
                          disabled={pending}
                        >
                          {label}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="rounded px-2 py-1 text-xs hover:bg-surface"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={addLink}
                        disabled={pending}
                      >
                        Link
                      </button>
                    </div>
                    <div
                      ref={editorRef}
                      contentEditable={!pending}
                      role="textbox"
                      aria-multiline="true"
                      data-placeholder="Mensagem para o cliente…"
                      className="min-h-24 w-full overflow-y-auto rounded-b-md border border-border bg-[var(--field-background)] px-3 py-2 text-sm outline-none empty:before:pointer-events-none empty:before:text-muted empty:before:content-[attr(data-placeholder)] focus:border-accent"
                      onInput={(event) =>
                        setBody(event.currentTarget.innerText.trim())
                      }
                    />
                  </>
                ) : (
                  <textarea
                    className="min-h-20 w-full rounded-md border border-border bg-[var(--field-background)] px-3 py-2 text-sm"
                    placeholder="Mensagem para a Webiton…"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    disabled={pending}
                  />
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="max-w-full text-xs text-muted"
                    onChange={(e) => setFiles(e.target.files)}
                    disabled={pending}
                  />
                  <Button
                    variant="primary"
                    className="ml-auto"
                    isDisabled={pending || (!body.trim() && !files?.length)}
                    onPress={send}
                  >
                    {pending
                      ? "A enviar…"
                      : mode === "admin" && thread.source === "email"
                        ? "Enviar email"
                        : "Enviar"}
                  </Button>
                </div>
                {sendError ? (
                  <p className="text-xs text-danger">{sendError}</p>
                ) : null}
              </div>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
