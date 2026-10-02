"use client";

import { Button, Card, Checkbox } from "@heroui/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addManualPlanItem,
  saveDayResume,
  togglePlanItem,
} from "@/app/actions/daily";
import {
  markContractBilled,
  markProjectBilled,
} from "@/app/actions/commercial";
import { BillingAlertsBanner } from "@/components/billing-alerts-banner";
import type { DailyJob } from "@/lib/daily";
import type { BillingAlert } from "@/lib/billing";
import { formatMinutes } from "@/lib/dates";
import { QuickLogForm } from "@/components/quick-log-form";

type ClientOption = { id: string; name: string };
type RequestOption = { id: string; title: string; clientId: string };

type ResumeData = {
  interventions: {
    id: string;
    clientName: string;
    minutes: number;
    note: string | null;
    requestTitle: string;
  }[];
  totalMinutes: number;
  body: string;
};

export function DailyDesk({
  jobs,
  resume,
  clients,
  openRequests,
  billingAlerts = [],
}: {
  jobs: DailyJob[];
  resume: ResumeData;
  clients: ClientOption[];
  openRequests: RequestOption[];
  billingAlerts?: BillingAlert[];
}) {
  const router = useRouter();
  const [resumeOpen, setResumeOpen] = useState(false);
  const [mobileLog, setMobileLog] = useState(false);
  const [resumeBody, setResumeBody] = useState(resume.body);
  const [pending, startTransition] = useTransition();
  const remaining = jobs.filter((j) => !j.done).length;

  function refresh() {
    router.refresh();
  }

  function run(action: () => Promise<void>) {
    startTransition(async () => {
      await action();
      refresh();
    });
  }

  function onToggle(job: DailyJob) {
    startTransition(async () => {
      if (job.planItemId) {
        await togglePlanItem(job.planItemId, !job.done);
      } else if (job.requestId && !job.done) {
        window.alert(
          "Para concluir o pedido, abre-o no pipeline e regista tempo ou valor acordado (€).",
        );
      }
      refresh();
    });
  }

  function onSaveResume() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("body", resumeBody);
      fd.set("totalMinutes", String(resume.totalMinutes));
      await saveDayResume(fd);
      refresh();
    });
  }

  return (
    <div className="flex min-h-0 flex-1">
      <main className="desk-page flex min-w-0 flex-1 flex-col gap-6 py-8">
        <BillingAlertsBanner
          alerts={billingAlerts}
          pending={pending}
          onMarkProject={(id) => run(() => markProjectBilled(id))}
          onMarkContract={(id) => run(() => markContractBilled(id))}
        />        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Hoje</h1>
            <p className="text-muted">
              Lista do dia · {remaining} pendente{remaining === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              className="lg:hidden"
              onPress={() => setMobileLog(true)}
            >
              Registar trabalho
            </Button>
            <Button variant="secondary" onPress={() => setResumeOpen(true)}>
              Resumo do dia
            </Button>
            <Link href="/pipeline" className="tech-btn border border-border">
              Pipeline
            </Link>
          </div>
        </header>

        <Card className="p-4">
          <h2 className="mb-3 text-lg font-medium">Lista de trabalhos de hoje</h2>
          <form
            className="mb-4 flex gap-2"
            action={(fd) => {
              startTransition(async () => {
                await addManualPlanItem(fd);
                refresh();
              });
            }}
          >
            <input
              name="title"
              required
              placeholder="Item manual para hoje"
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
            <Button type="submit" variant="secondary" isDisabled={pending}>
              Adicionar
            </Button>
          </form>
          {jobs.length === 0 ? (
            <p className="text-sm text-muted">
              Nada na lista. Adiciona um item manual ou trabalha o{" "}
              <Link href="/pipeline" className="underline">
                Pipeline
              </Link>
              .
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {jobs.map((job) => (
                <li
                  key={job.id}
                  className="flex items-start gap-3 rounded-lg border border-separator bg-surface/60 p-3"
                >
                  <Checkbox
                    isSelected={job.done}
                    onChange={() => onToggle(job)}
                    aria-label={job.title}
                    isDisabled={pending}
                  >
                    <span className="sr-only">{job.title}</span>
                  </Checkbox>
                  <div className="min-w-0 flex-1">
                    {job.href && !job.done ? (
                      <Link
                        href={job.href}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {job.title}
                      </Link>
                    ) : (
                      <p
                        className={
                          job.done ? "text-muted line-through" : "font-medium"
                        }
                      >
                        {job.title}
                      </p>
                    )}
                    <p className="text-xs text-muted">{job.area}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {resumeOpen ? (
          <Card className="border border-border p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-lg font-medium">Resumo do dia</h2>
              <Button variant="ghost" onPress={() => setResumeOpen(false)}>
                Fechar
              </Button>
            </div>
            <ul className="mb-3 list-disc space-y-1 pl-5 text-sm">
              <li>
                {resume.interventions.length} intervenç
                {resume.interventions.length === 1 ? "ão" : "ões"} registadas hoje
              </li>
              <li>{formatMinutes(resume.totalMinutes)} no total</li>
            </ul>
            {resume.interventions.length > 0 ? (
              <ul className="mb-3 space-y-1 text-sm text-foreground/80">
                {resume.interventions.map((i) => (
                  <li key={i.id}>
                    {i.clientName} · {formatMinutes(i.minutes)} · {i.requestTitle}
                    {i.note ? ` — ${i.note}` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
            <textarea
              className="mb-3 min-h-32 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              value={resumeBody}
              onChange={(e) => setResumeBody(e.target.value)}
            />
            <Button
              variant="primary"
              onPress={onSaveResume}
              isDisabled={pending}
            >
              Guardar resumo
            </Button>
          </Card>
        ) : null}
      </main>

      <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 flex-col border-l border-border bg-surface/50 p-4 lg:flex">
        <h2 className="mb-3 text-sm font-medium">Registar trabalho</h2>
        <p className="mb-4 text-xs text-muted">
          Sempre à mão — intervenções em blocos de 30 min.
        </p>
        <QuickLogForm
          clients={clients}
          openRequests={openRequests}
          compact
        />
      </aside>

      {mobileLog ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 lg:hidden">
          <div className="max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl bg-surface p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium">Registar trabalho</h2>
              <button
                type="button"
                className="text-sm text-muted"
                onClick={() => setMobileLog(false)}
              >
                Fechar
              </button>
            </div>
            <QuickLogForm
              clients={clients}
              openRequests={openRequests}
              compact
              onSuccess={() => setMobileLog(false)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
