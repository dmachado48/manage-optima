"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@heroui/react";
import { logoutAction } from "@/app/actions/auth";
import { DeskChromeProvider } from "@/components/desk-chrome-context";
import { IdleNudge, type IdleNudgeSettings } from "@/components/idle-nudge";
import { QuickLogModal } from "@/components/quick-log-modal";
import { SidebarAlerts } from "@/components/sidebar-alerts";
import type { BillingAlert } from "@/lib/billing";

const MODULES = [
  { href: "/", label: "Pipeline" },
  { href: "/inbox", label: "Inbox" },
  { href: "/clients", label: "Clientes" },
  { href: "/finance", label: "Financeiro" },
  { href: "/maintenance", label: "Manutenção" },
  { href: "/commercial", label: "Comercial" },
  { href: "/projects", label: "Projetos" },
] as const;

type ClientOption = {
  id: string;
  name: string;
  contractType?: "pack" | "retainer" | "hourly" | null;
};
type RequestOption = { id: string; title: string; clientId: string };

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DeskShell({
  children,
  clients,
  openRequests,
  billingAlerts = [],
  idleNudge,
}: {
  children: React.ReactNode;
  clients: ClientOption[];
  openRequests: RequestOption[];
  billingAlerts?: BillingAlert[];
  idleNudge: IdleNudgeSettings;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [logOpen, setLogOpen] = useState(false);
  const [logMode, setLogMode] = useState<"form" | "voice">("form");
  const chrome = useMemo(
    () => ({
      openQuickLog: () => {
        setLogMode("form");
        setLogOpen(true);
      },
    }),
    [],
  );
  const settingsActive = pathname === "/settings" || pathname.startsWith("/settings/");

  useEffect(() => {
    const voice = searchParams.get("voice");
    const log = searchParams.get("log");
    if (voice === "1" || log === "1") {
      setLogMode(voice === "1" ? "voice" : "form");
      setLogOpen(true);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("voice");
      params.delete("log");
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname);
    }
  }, [searchParams, pathname, router]);

  function openLog(mode: "form" | "voice" = "form") {
    setLogMode(mode);
    setLogOpen(true);
  }

  return (
    <DeskChromeProvider value={chrome}>
      <div className="flex min-h-full flex-1 flex-col bg-[var(--background)]">
        <header className="sticky top-0 z-30 shrink-0 border-b border-border bg-surface backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-3 sm:px-4">
            <Link href="/" className="min-w-0 shrink-0">
              <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--blue-700)]">
                Webiton
              </p>
              <p className="truncate text-sm font-semibold tracking-tight text-[var(--blue-950)]">
                Optima Desk
              </p>
            </Link>

            <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
              <Button
                variant="secondary"
                onPress={() => openLog("voice")}
                className="hidden sm:inline-flex"
              >
                Voz
              </Button>
              <Button
                variant="primary"
                onPress={() => openLog("form")}
                className="hidden sm:inline-flex"
              >
                Registar horas
              </Button>
              <Button
                variant="primary"
                onPress={() => openLog("voice")}
                className="sm:hidden"
              >
                Voz
              </Button>
              <Link
                href="/settings"
                className={
                  settingsActive
                    ? "tech-btn bg-default font-semibold text-foreground"
                    : "tech-btn border border-border bg-surface text-muted hover:bg-default hover:text-foreground"
                }
                aria-label="Definições"
                title="Definições"
              >
                Definições
              </Link>
              <form action={logoutAction} className="hidden md:block">
                <button
                  type="submit"
                  className="px-2 py-1 text-xs text-muted hover:underline"
                >
                  Sair
                </button>
              </form>
            </div>
          </div>

          <div className="flex items-center gap-1 px-2 pb-2 sm:px-3">
            <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
              {MODULES.map((m) => {
                const active = isActive(pathname, m.href);
                return (
                  <Link
                    key={m.href}
                    href={m.href}
                    aria-current={active ? "page" : undefined}
                    className={
                      active
                        ? "shrink-0 rounded-lg bg-[color-mix(in_oklab,var(--blue-600)_12%,white)] px-2.5 py-1.5 text-sm font-medium text-[var(--blue-950)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue-700)]"
                        : "shrink-0 rounded-lg px-2.5 py-1.5 text-sm text-muted hover:bg-[color-mix(in_oklab,var(--blue-600)_8%,white)] hover:text-[var(--blue-900)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue-700)]"
                    }
                  >
                    {m.label}
                  </Link>
                );
              })}
            </nav>
            <SidebarAlerts alerts={billingAlerts} />
          </div>
        </header>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
      </div>

      <QuickLogModal
        key={logMode}
        clients={clients}
        openRequests={openRequests}
        open={logOpen}
        onOpenChange={setLogOpen}
        initialMode={logMode}
      />
      <IdleNudge onLog={() => openLog("form")} settings={idleNudge} />
    </DeskChromeProvider>
  );
}
