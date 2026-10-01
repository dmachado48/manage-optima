"use client";

import { Button } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { generateMonthlyReport, publishReport } from "@/app/actions/reports";

type ClientOption = { id: string; name: string };

type ReportRow = {
  id: string;
  body: string;
  published: boolean;
  periodStart: string;
  client: { name: string };
};

export function ReportsPanel({
  clients,
  reports,
}: {
  clients: ClientOption[];
  reports: ReportRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<string | null>(null);
  const now = new Date();

  return (
    <div className="flex flex-1 flex-col gap-4 py-4">
      <form
        className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface p-3"
        action={(fd) => {
          startTransition(async () => {
            const result = await generateMonthlyReport(fd);
            setPreview(result.body);
            router.refresh();
          });
        }}
      >
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted">Cliente</span>
          <select
            name="clientId"
            required
            className="rounded-md border border-border px-2 py-1.5 text-sm"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted">Mês</span>
          <input
            name="month"
            type="number"
            min={1}
            max={12}
            defaultValue={now.getMonth() + 1}
            className="w-20 rounded-md border border-border px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted">Ano</span>
          <input
            name="year"
            type="number"
            defaultValue={now.getFullYear()}
            className="w-24 rounded-md border border-border px-2 py-1.5 text-sm"
          />
        </label>
        <Button type="submit" variant="primary" isDisabled={pending}>
          Gerar
        </Button>
      </form>

      {preview ? (
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">Pré-visualização</h2>
            <Button
              variant="secondary"
              onPress={async () => {
                await navigator.clipboard.writeText(preview);
              }}
            >
              Copiar
            </Button>
          </div>
          <pre className="whitespace-pre-wrap text-sm text-foreground/80">
            {preview}
          </pre>
        </div>
      ) : null}

      <div>
        <h2 className="mb-2 text-sm font-medium">Histórico</h2>
        <ul className="flex flex-col gap-2">
          {reports.map((r) => (
            <li
              key={r.id}
              className="rounded-xl border border-border bg-surface p-3"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {r.client.name} ·{" "}
                  {new Date(r.periodStart).toLocaleDateString("pt-PT")}
                  {r.published ? " · publicado" : ""}
                </p>
                {!r.published ? (
                  <Button
                    variant="secondary"
                    isDisabled={pending}
                    onPress={() => {
                      startTransition(async () => {
                        await publishReport(r.id);
                        router.refresh();
                      });
                    }}
                  >
                    Publicar no portal
                  </Button>
                ) : null}
              </div>
              <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-xs text-muted">
                {r.body}
              </pre>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
