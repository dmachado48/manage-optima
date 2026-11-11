"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@heroui/react";
import { logoutAction } from "@/app/actions/auth";
import { DeskChromeProvider } from "@/components/desk-chrome-context";
import { IdleNudge, type IdleNudgeSettings } from "@/components/idle-nudge";
import { QuickLogModal } from "@/components/quick-log-modal";

const MODULES = [
  { href: "/", label: "Pipeline", short: "Pipe." },
  { href: "/inbox", label: "Inbox", short: "Inbox" },
  { href: "/clients", label: "Clientes", short: "Clientes" },
  { href: "/finance", label: "Financeiro", short: "Fin." },
  { href: "/maintenance", label: "Manutenção", short: "Manut." },
  { href: "/commercial", label: "Comercial", short: "Comerc." },
  { href: "/projects", label: "Projetos", short: "Proj." },
] as const;

type ClientOption = { id: string; name: string };
type RequestOption = { id: string; title: string; clientId: string };

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DeskShell({
  children,
  clients,
  openRequests,
  idleNudge,
}: {
  children: React.ReactNode;
  clients: ClientOption[];
  openRequests: RequestOption[];
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
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-[color-mix(in_oklab,var(--surface)_88%,var(--blue-900))] px-3 backdrop-blur sm:px-4">
          <Link href="/" className="min-w-0 shrink-0">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--blue-300)]">
              Webiton
            </p>
            <p className="truncate text-sm font-semibold tracking-tight text-[var(--blue-100)]">
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
              href="/maintenance"
              className="tech-btn border border-border bg-surface text-foreground hover:bg-default"
            >
              Pedido
            </Link>
            <Link
              href="/projects"
              className="tech-btn hidden border border-border bg-surface text-foreground hover:bg-default sm:inline-flex"
            >
              Projeto
            </Link>
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
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-52 shrink-0 flex-col border-r border-border bg-surface/70 px-3 py-4 md:flex">
            <nav className="flex flex-1 flex-col gap-1">
              {MODULES.map((m) => {
                const active = isActive(pathname, m.href);
                return (
                  <Link
                    key={m.href}
                    href={m.href}
                    className={
                      active
                        ? "rounded-lg bg-[color-mix(in_oklab,var(--blue-600)_28%,transparent)] px-3 py-2 text-sm font-medium text-[var(--blue-100)]"
                        : "rounded-lg px-3 py-2 text-sm text-muted hover:bg-[color-mix(in_oklab,var(--blue-900)_40%,transparent)] hover:text-[var(--blue-200)]"
                    }
                  >
                    {m.label}
                  </Link>
                );
              })}
            </nav>
            <form action={logoutAction} className="md:hidden">
              <button
                type="submit"
                className="w-full px-2 py-1 text-left text-xs text-muted hover:underline"
              >
                Sair
              </button>
            </form>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
            {children}
          </div>
        </div>

        <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-border bg-surface/95 px-1 py-2 backdrop-blur md:hidden">
          {MODULES.map((m) => {
            const active = isActive(pathname, m.href);
            return (
              <Link
                key={m.href}
                href={m.href}
                className={
                  active
                    ? "rounded-md px-1.5 py-1 text-[11px] font-semibold"
                    : "rounded-md px-1.5 py-1 text-[11px] text-muted"
                }
              >
                {m.short}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => openLog("voice")}
            className="rounded-md bg-accent px-2 py-1 text-[11px] font-medium text-white"
          >
            Voz
          </button>
        </nav>
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
