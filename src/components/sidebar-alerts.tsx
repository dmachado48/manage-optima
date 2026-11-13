"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { BillingAlert } from "@/lib/billing";

const CATEGORY_LABEL: Record<BillingAlert["category"], string> = {
  billable: "Faturar",
  attained: "Limite",
  deadline: "Prazo",
};

export function SidebarAlerts({ alerts }: { alerts: BillingAlert[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((value) => !value)}
        className={
          alerts.length > 0
            ? "rounded-lg px-2.5 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-500/15"
            : "rounded-lg px-2.5 py-1.5 text-sm text-muted hover:bg-[color-mix(in_oklab,var(--blue-600)_8%,white)] hover:text-[var(--blue-900)]"
        }
      >
        Alertas
        {alerts.length > 0 ? (
          <span className="ml-1.5 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold">
            {alerts.length}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-40 mt-1 w-72 rounded-lg border border-border bg-surface p-2 shadow-lg">
          {alerts.length === 0 ? (
            <p className="px-1 py-2 text-xs text-muted">Sem alertas</p>
          ) : (
            <ul className="flex max-h-80 flex-col gap-1.5 overflow-y-auto">
              {alerts.slice(0, 12).map((alert) => (
                <li key={alert.id}>
                  <Link
                    href={alert.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 hover:bg-amber-500/15"
                  >
                    <span className="text-[9px] font-semibold uppercase tracking-wide text-amber-800">
                      {CATEGORY_LABEL[alert.category]}
                    </span>
                    <p className="mt-0.5 line-clamp-2 text-[11px] font-medium leading-snug text-foreground">
                      {alert.label}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-muted">
                      {alert.clientName}
                      {alert.detail ? ` · ${alert.detail}` : ""}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {alerts.length > 12 ? (
            <Link
              href="/finance"
              onClick={() => setOpen(false)}
              className="mt-2 block px-1 text-[10px] text-muted underline-offset-2 hover:underline"
            >
              Ver todos ({alerts.length})
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
