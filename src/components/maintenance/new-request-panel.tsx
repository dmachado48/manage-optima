"use client";

import { Button } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createRequest } from "@/app/actions/requests";

type ClientOption = { id: string; name: string };

export function NewRequestPanel({
  clients,
  defaultClientId,
  lockClient = false,
  mobileOpen,
  onMobileOpenChange,
}: {
  clients: ClientOption[];
  defaultClientId?: string;
  lockClient?: boolean;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const lockedId = defaultClientId ?? clients[0]?.id;

  function FormBody({ onDone }: { onDone?: () => void }) {
    return (
      <form
        className="flex flex-col gap-2"
        action={(fd) => {
          setError(null);
          startTransition(async () => {
            try {
              await createRequest(fd);
              onDone?.();
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Erro ao criar");
            }
          });
        }}
      >
        {lockClient ? (
          <input type="hidden" name="clientId" value={lockedId} />
        ) : (
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted">Cliente</span>
            <select
              name="clientId"
              required
              defaultValue={lockedId}
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted">Título</span>
          <input
            name="title"
            required
            className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
            placeholder="Pedido…"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted">Nota</span>
          <textarea
            name="description"
            rows={3}
            className="resize-none rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
            placeholder="Opcional"
          />
        </label>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
        <Button type="submit" variant="primary" isDisabled={pending}>
          {pending ? "A criar…" : "Criar"}
        </Button>
      </form>
    );
  }

  return (
    <>
      <aside className="hidden w-64 shrink-0 flex-col border-l border-border bg-surface/50 p-3 xl:flex">
        <h2 className="mb-3 text-sm font-medium">Novo pedido</h2>
        <FormBody />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 xl:hidden">
          <div className="w-full rounded-t-2xl bg-surface p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium">Novo pedido</h2>
              <button
                type="button"
                className="text-sm text-muted"
                onClick={() => onMobileOpenChange(false)}
              >
                Fechar
              </button>
            </div>
            <FormBody onDone={() => onMobileOpenChange(false)} />
          </div>
        </div>
      ) : null}
    </>
  );
}
