"use client";

import Link from "next/link";
import type { BillingAlert } from "@/lib/billing";

const CATEGORY_LABEL: Record<BillingAlert["category"], string> = {
  billable: "Faturar",
  attained: "Limite",
  deadline: "Prazo",
};

export function SidebarAlerts({ alerts }: { alerts: BillingAlert[] }) {
  if (alerts.length === 0) {
    return (
      <div className="mt-4 border-t border-border pt-3">
        <p className="px-1 text-[10px] font-medium uppercase tracking-wide text-muted">
          Alertas
        </p>
        <p className="mt-1 px-1 text-[11px] text-muted">Sem alertas</p>
      </div>
    );
  }

  return (
    <div className="mt-4 flex min-h-0 flex-1 flex-col border-t border-border pt-3">
      <p className="mb-2 px-1 text-[10px] font-medium uppercase tracking-wide text-muted">
        Alertas · {alerts.length}
      </p>
      <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-0.5">
        {alerts.slice(0, 12).map((a) => (
          <li key={a.id}>
            <Link
              href={a.href}
              className="block rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 hover:bg-amber-500/15"
            >
              <span className="text-[9px] font-semibold uppercase tracking-wide text-amber-200/90">
                {CATEGORY_LABEL[a.category]}
              </span>
              <p className="mt-0.5 line-clamp-2 text-[11px] font-medium leading-snug text-foreground">
                {a.label}
              </p>
              <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-muted">
                {a.clientName}
                {a.detail ? ` · ${a.detail}` : ""}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      {alerts.length > 12 ? (
        <Link
          href="/finance"
          className="mt-2 px-1 text-[10px] text-muted underline-offset-2 hover:underline"
        >
          Ver todos ({alerts.length})
        </Link>
      ) : null}
    </div>
  );
}
