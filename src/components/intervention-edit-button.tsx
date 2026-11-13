"use client";

import { Button } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateIntervention } from "@/app/actions/interventions";

type EditableIntervention = {
  id: string;
  minutes: number;
  agreedAmountEur: number | null;
  note: string | null;
  performedAt: string;
  requestTitle: string;
};

function toDatetimeLocal(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function InterventionEditButton({
  intervention,
  disabled,
}: {
  intervention: EditableIntervention;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        className="rounded-md border border-border px-2 py-1 text-xs hover:bg-default disabled:opacity-50"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Editar
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <form
        className="flex w-full max-w-md flex-col gap-2 rounded-xl bg-surface p-4 shadow-xl"
        action={(fd) => {
          setError(null);
          startTransition(async () => {
            try {
              await updateIntervention(fd);
              setOpen(false);
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Erro ao guardar");
            }
          });
        }}
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <h2 className="font-medium">Editar intervenção</h2>
          <button
            type="button"
            className="text-sm text-muted"
            onClick={() => setOpen(false)}
          >
            Fechar
          </button>
        </div>
        <p className="text-sm text-muted">{intervention.requestTitle}</p>
        <input type="hidden" name="id" value={intervention.id} />
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted">Minutos</span>
          <input
            name="minutes"
            type="number"
            min="0"
            step="30"
            required
            defaultValue={intervention.minutes}
            className="rounded-lg border border-border px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted">Valor acordado (€), se não houver tempo</span>
          <input
            name="agreedAmountEur"
            type="number"
            min="0"
            step="0.01"
            defaultValue={intervention.agreedAmountEur ?? ""}
            className="rounded-lg border border-border px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted">Data</span>
          <input
            name="performedAt"
            type="datetime-local"
            required
            defaultValue={toDatetimeLocal(intervention.performedAt)}
            className="rounded-lg border border-border px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted">Nota</span>
          <textarea
            name="note"
            rows={3}
            defaultValue={intervention.note ?? ""}
            className="rounded-lg border border-border px-3 py-2 text-sm"
          />
        </label>
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        <div className="mt-1 flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onPress={() => setOpen(false)}
          >
            Cancelar
          </Button>
          <Button type="submit" variant="primary" isDisabled={pending}>
            {pending ? "A guardar…" : "Guardar"}
          </Button>
        </div>
      </form>
    </div>
  );
}
