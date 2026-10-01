"use client";

import { Button } from "@heroui/react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updatePlatformConfig } from "@/app/actions/settings";
import {
  calcHourlyRate,
  type PlatformConfigData,
} from "@/lib/platform-config";
import type { SettingsSection } from "@/components/settings/settings-sections";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}

function inputClass() {
  return "rounded-lg border border-border bg-surface px-3 py-2 text-sm";
}

export function PlatformPanels({
  section,
  platformConfig,
}: {
  section: SettingsSection;
  platformConfig: PlatformConfigData;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [calcTotal, setCalcTotal] = useState("");
  const [calcHours, setCalcHours] = useState("");
  const calcRate = calcHourlyRate(Number(calcTotal), Number(calcHours));

  const hiddenDefaults = useMemo(
    () => (
      <>
        {platformConfig.pricesIncludeVat ? (
          <input type="hidden" name="pricesIncludeVat" value="on" />
        ) : null}
        {platformConfig.showQuarterWithVat ? (
          <input type="hidden" name="showQuarterWithVat" value="on" />
        ) : null}
        <input
          type="hidden"
          name="vatRatePercent"
          value={String(platformConfig.vatRatePercent)}
        />
        <input
          type="hidden"
          name="defaultCostRateEur"
          value={
            platformConfig.defaultCostRateEur != null
              ? String(platformConfig.defaultCostRateEur)
              : ""
          }
        />
        <input
          type="hidden"
          name="defaultBillingRateEur"
          value={
            platformConfig.defaultBillingRateEur != null
              ? String(platformConfig.defaultBillingRateEur)
              : ""
          }
        />
        <input
          type="hidden"
          name="companyName"
          value={platformConfig.companyName}
        />
        <input
          type="hidden"
          name="companyNif"
          value={platformConfig.companyNif}
        />
        <input
          type="hidden"
          name="companyAddress"
          value={platformConfig.companyAddress}
        />
        <input
          type="hidden"
          name="companyEmail"
          value={platformConfig.companyEmail}
        />
        <input
          type="hidden"
          name="companyPhone"
          value={platformConfig.companyPhone}
        />
        <input
          type="hidden"
          name="companyIban"
          value={platformConfig.companyIban}
        />
        <input
          type="hidden"
          name="companyWebsite"
          value={platformConfig.companyWebsite}
        />
        <input
          type="hidden"
          name="proposalFooter"
          value={platformConfig.proposalFooter}
        />
        <input
          type="hidden"
          name="timeRoundingMinutes"
          value={String(platformConfig.timeRoundingMinutes)}
        />
        <input
          type="hidden"
          name="timeMinimumMinutes"
          value={String(platformConfig.timeMinimumMinutes)}
        />
        <input type="hidden" name="currency" value={platformConfig.currency} />
        <input type="hidden" name="locale" value={platformConfig.locale} />
        <input
          type="hidden"
          name="fiscalYearStartMonth"
          value={String(platformConfig.fiscalYearStartMonth)}
        />
      </>
    ),
    [platformConfig],
  );

  function save(fd: FormData) {
    startTransition(async () => {
      await updatePlatformConfig(fd);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      router.refresh();
    });
  }

  function SaveBar() {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" isDisabled={pending}>
          Guardar
        </Button>
        {saved ? <span className="text-xs text-muted">Guardado</span> : null}
      </div>
    );
  }

  if (section === "vat") {
    return (
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-1 text-sm font-medium">IVA e preços</h2>
        <p className="mb-4 text-xs text-muted">
          Define se os valores introduzidos incluem IVA e como os quarters /
          Pulse os apresentam.
        </p>
        <form className="flex flex-col gap-4" action={save}>
          {hiddenDefaults}
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="pricesIncludeVat"
              defaultChecked={platformConfig.pricesIncludeVat}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Preços introduzidos com IVA</span>
              <span className="mt-0.5 block text-xs text-muted">
                Se ativo, propostas e budgets já incluem IVA.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="showQuarterWithVat"
              defaultChecked={platformConfig.showQuarterWithVat}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Mostrar quarters com IVA</span>
              <span className="mt-0.5 block text-xs text-muted">
                Em Pulse, converte os totais para c/ ou s/ IVA.
              </span>
            </span>
          </label>
          <Field label="Taxa de IVA (%)">
            <input
              name="vatRatePercent"
              type="number"
              step="0.01"
              min="0"
              max="100"
              defaultValue={platformConfig.vatRatePercent}
              className={`max-w-xs ${inputClass()}`}
            />
          </Field>
          <SaveBar />
        </form>
      </section>
    );
  }

  if (section === "company") {
    return (
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-1 text-sm font-medium">Dados da empresa</h2>
        <p className="mb-4 text-xs text-muted">
          Usados em propostas e comunicações. NIF e IBAN para faturação.
        </p>
        <form className="grid gap-3 sm:grid-cols-2" action={save}>
          {hiddenDefaults}
          <Field label="Nome">
            <input
              name="companyName"
              defaultValue={platformConfig.companyName}
              className={inputClass()}
            />
          </Field>
          <Field label="NIF">
            <input
              name="companyNif"
              defaultValue={platformConfig.companyNif}
              className={inputClass()}
            />
          </Field>
          <Field label="Email">
            <input
              name="companyEmail"
              type="email"
              defaultValue={platformConfig.companyEmail}
              className={inputClass()}
            />
          </Field>
          <Field label="Telefone">
            <input
              name="companyPhone"
              defaultValue={platformConfig.companyPhone}
              className={inputClass()}
            />
          </Field>
          <Field label="Website">
            <input
              name="companyWebsite"
              defaultValue={platformConfig.companyWebsite}
              className={inputClass()}
            />
          </Field>
          <Field label="IBAN">
            <input
              name="companyIban"
              defaultValue={platformConfig.companyIban}
              className={inputClass()}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Morada">
              <textarea
                name="companyAddress"
                rows={3}
                defaultValue={platformConfig.companyAddress}
                className={inputClass()}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <SaveBar />
          </div>
        </form>
      </section>
    );
  }

  if (section === "rates") {
    return (
      <div className="flex flex-col gap-4">
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-1 text-sm font-medium">Tarifas padrão</h2>
          <p className="mb-4 text-xs text-muted">
            Aplicadas a novos projetos (custo interno) e novos contratos
            (faturação / overage).
          </p>
          <form className="flex flex-col gap-4" action={save}>
            {hiddenDefaults}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Custo interno padrão (€/h)">
                <input
                  name="defaultCostRateEur"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={platformConfig.defaultCostRateEur ?? ""}
                  placeholder="ex. 35"
                  className={inputClass()}
                />
              </Field>
              <Field label="Faturação padrão (€/h)">
                <input
                  name="defaultBillingRateEur"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={platformConfig.defaultBillingRateEur ?? ""}
                  placeholder="ex. 55"
                  className={inputClass()}
                />
              </Field>
            </div>
            <SaveBar />
          </form>
        </section>

        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-1 text-sm font-medium">Calculadora valor/hora</h2>
          <p className="mb-4 text-xs text-muted">
            Total do projeto ÷ horas estimadas.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Total do projeto (€)">
              <input
                type="number"
                step="0.01"
                min="0"
                value={calcTotal}
                onChange={(e) => setCalcTotal(e.target.value)}
                placeholder="ex. 4800"
                className={`w-40 ${inputClass()}`}
              />
            </Field>
            <Field label="Horas estimadas">
              <input
                type="number"
                step="0.5"
                min="0"
                value={calcHours}
                onChange={(e) => setCalcHours(e.target.value)}
                placeholder="ex. 40"
                className={`w-36 ${inputClass()}`}
              />
            </Field>
            <div className="rounded-lg bg-default px-4 py-2">
              <p className="text-xs text-muted">Valor / hora</p>
              <p className="text-lg font-semibold tabular-nums">
                {calcRate != null ? `${calcRate.toFixed(2)} €/h` : "—"}
              </p>
            </div>
            {calcRate != null ? (
              <Button
                variant="secondary"
                isDisabled={pending}
                onPress={() => {
                  const fd = new FormData();
                  // Rebuild from current config + new cost rate
                  const fake = document.createElement("form");
                  void fake;
                  startTransition(async () => {
                    const payload = new FormData();
                    if (platformConfig.pricesIncludeVat) {
                      payload.set("pricesIncludeVat", "on");
                    }
                    if (platformConfig.showQuarterWithVat) {
                      payload.set("showQuarterWithVat", "on");
                    }
                    payload.set(
                      "vatRatePercent",
                      String(platformConfig.vatRatePercent),
                    );
                    payload.set("defaultCostRateEur", String(calcRate));
                    payload.set(
                      "defaultBillingRateEur",
                      platformConfig.defaultBillingRateEur != null
                        ? String(platformConfig.defaultBillingRateEur)
                        : "",
                    );
                    payload.set("companyName", platformConfig.companyName);
                    payload.set("companyNif", platformConfig.companyNif);
                    payload.set(
                      "companyAddress",
                      platformConfig.companyAddress,
                    );
                    payload.set("companyEmail", platformConfig.companyEmail);
                    payload.set("companyPhone", platformConfig.companyPhone);
                    payload.set("companyIban", platformConfig.companyIban);
                    payload.set(
                      "companyWebsite",
                      platformConfig.companyWebsite,
                    );
                    payload.set(
                      "proposalFooter",
                      platformConfig.proposalFooter,
                    );
                    payload.set(
                      "timeRoundingMinutes",
                      String(platformConfig.timeRoundingMinutes),
                    );
                    payload.set(
                      "timeMinimumMinutes",
                      String(platformConfig.timeMinimumMinutes),
                    );
                    payload.set("currency", platformConfig.currency);
                    payload.set("locale", platformConfig.locale);
                    payload.set(
                      "fiscalYearStartMonth",
                      String(platformConfig.fiscalYearStartMonth),
                    );
                    await updatePlatformConfig(payload);
                    setSaved(true);
                    setTimeout(() => setSaved(false), 2500);
                    router.refresh();
                  });
                  void fd;
                }}
              >
                Usar como custo padrão
              </Button>
            ) : null}
          </div>
        </section>
      </div>
    );
  }

  if (section === "proposals") {
    return (
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-1 text-sm font-medium">Rodapé das propostas</h2>
        <p className="mb-4 text-xs text-muted">
          Texto no rodapé do HTML das propostas (legal, validade, contactos).
        </p>
        <form className="flex flex-col gap-4" action={save}>
          {hiddenDefaults}
          <Field label="Rodapé">
            <textarea
              name="proposalFooter"
              rows={5}
              defaultValue={platformConfig.proposalFooter}
              className={inputClass()}
            />
          </Field>
          <SaveBar />
        </form>
      </section>
    );
  }

  if (section === "time") {
    return (
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-1 text-sm font-medium">Arredondamento de tempo</h2>
        <p className="mb-4 text-xs text-muted">
          Ao registar intervenções, os minutos são arredondados para cima ao
          bloco escolhido, com um mínimo faturável.
        </p>
        <form className="flex flex-col gap-4" action={save}>
          {hiddenDefaults}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Bloco de arredondamento (min)">
              <select
                name="timeRoundingMinutes"
                defaultValue={String(platformConfig.timeRoundingMinutes)}
                className={inputClass()}
              >
                <option value="0">Sem arredondamento</option>
                <option value="15">15 minutos</option>
                <option value="30">30 minutos</option>
                <option value="60">60 minutos</option>
              </select>
            </Field>
            <Field label="Mínimo faturável (min)">
              <input
                name="timeMinimumMinutes"
                type="number"
                step="5"
                min="0"
                defaultValue={platformConfig.timeMinimumMinutes}
                className={inputClass()}
              />
            </Field>
          </div>
          <SaveBar />
        </form>
      </section>
    );
  }

  if (section === "locale") {
    const months = [
      "Janeiro",
      "Fevereiro",
      "Março",
      "Abril",
      "Maio",
      "Junho",
      "Julho",
      "Agosto",
      "Setembro",
      "Outubro",
      "Novembro",
      "Dezembro",
    ];
    return (
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-1 text-sm font-medium">Moeda e ano fiscal</h2>
        <p className="mb-4 text-xs text-muted">
          Formatação de valores e início do ano fiscal usado em Pulse.
        </p>
        <form className="flex flex-col gap-4" action={save}>
          {hiddenDefaults}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Moeda (ISO)">
              <input
                name="currency"
                defaultValue={platformConfig.currency}
                maxLength={3}
                className={inputClass()}
              />
            </Field>
            <Field label="Locale">
              <input
                name="locale"
                defaultValue={platformConfig.locale}
                placeholder="pt-PT"
                className={inputClass()}
              />
            </Field>
            <Field label="Início do ano fiscal">
              <select
                name="fiscalYearStartMonth"
                defaultValue={String(platformConfig.fiscalYearStartMonth)}
                className={inputClass()}
              >
                {months.map((label, i) => (
                  <option key={label} value={i + 1}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <SaveBar />
        </form>
      </section>
    );
  }

  return null;
}
