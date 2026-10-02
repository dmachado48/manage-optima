"use client";

import Link from "next/link";
import type { BillingAlert } from "@/lib/billing";

const CATEGORY_LABEL: Record<BillingAlert["category"], string> = {
  billable: "Para faturar",
  attained: "Atingiu",
  deadline: "Deadline",
};

export function BillingAlertsBanner({
  alerts,
  pending,
  onMarkProject,
  onMarkContract,
}: {
  alerts: BillingAlert[];
  pending?: boolean;
  onMarkProject?: (id: string) => void;
  onMarkContract?: (id: string) => void;
}) {
  if (alerts.length === 0) return null;

  return (
    <section className="rounded-xl border border-amber-300 bg-amber-50 p-4">
      <h2 className="mb-2 text-sm font-medium text-amber-950">
        Alertas ({alerts.length})
      </h2>
      <ul className="flex flex-col gap-2">
        {alerts.map((a) => {
          const entityId = a.id.includes(":") ? a.id.split(":")[1]! : a.id;
          return (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-2 text-sm text-amber-950"
            >
              <div>
                <span className="mr-1.5 rounded-sm bg-amber-200/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-950">
                  {CATEGORY_LABEL[a.category]}
                </span>
                <span className="font-medium">{a.label}</span>
                <span className="text-amber-900/80">
                  {" "}
                  · {a.clientName} · {a.detail}
                </span>
              </div>
              <div className="flex gap-1">
                <Link
                  href={a.href}
                  className="rounded-md border border-amber-300 bg-white/70 px-2 py-1 text-xs hover:bg-white"
                >
                  Abrir
                </Link>
                {a.kind === "project" && onMarkProject ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onMarkProject(entityId)}
                    className="rounded-md border border-amber-300 bg-white/70 px-2 py-1 text-xs hover:bg-white disabled:opacity-50"
                  >
                    Marcar faturado
                  </button>
                ) : null}
                {a.kind === "pack" && onMarkContract ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onMarkContract(entityId)}
                    className="rounded-md border border-amber-300 bg-white/70 px-2 py-1 text-xs hover:bg-white disabled:opacity-50"
                  >
                    Marcar faturado
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
