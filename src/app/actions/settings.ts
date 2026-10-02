"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  DEFAULT_PLATFORM_CONFIG,
  getPlatformConfig,
  type PlatformConfigData,
} from "@/lib/platform-config";
import { prisma } from "@/lib/prisma";

function optionalNumber(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) throw new Error("Valor numérico inválido");
  return n;
}

function optionalInt(raw: string, fallback: number): number {
  const t = raw.trim();
  if (t === "") return fallback;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) throw new Error("Valor inteiro inválido");
  return Math.round(n);
}

type PlatformSection =
  | "vat"
  | "company"
  | "rates"
  | "proposals"
  | "time"
  | "locale"
  | "full";

function parseSection(raw: string): PlatformSection {
  if (
    raw === "vat" ||
    raw === "company" ||
    raw === "rates" ||
    raw === "proposals" ||
    raw === "time" ||
    raw === "locale" ||
    raw === "full"
  ) {
    return raw;
  }
  return "full";
}

function toDbRow(config: PlatformConfigData) {
  return {
    pricesIncludeVat: config.pricesIncludeVat,
    showQuarterWithVat: config.showQuarterWithVat,
    vatRatePercent: config.vatRatePercent,
    defaultCostRateEur: config.defaultCostRateEur,
    defaultBillingRateEur: config.defaultBillingRateEur,
    companyName: config.companyName || null,
    companyNif: config.companyNif || null,
    companyAddress: config.companyAddress || null,
    companyEmail: config.companyEmail || null,
    companyPhone: config.companyPhone || null,
    companyIban: config.companyIban || null,
    companyWebsite: config.companyWebsite || null,
    proposalFooter: config.proposalFooter || null,
    timeRoundingMinutes: config.timeRoundingMinutes,
    timeMinimumMinutes: config.timeMinimumMinutes,
    currency: config.currency,
    locale: config.locale,
    fiscalYearStartMonth: config.fiscalYearStartMonth,
  };
}

export async function updatePlatformConfig(formData: FormData) {
  await requireAdmin();

  const section = parseSection(String(formData.get("_section") ?? "full"));
  const current = await getPlatformConfig();
  const next: PlatformConfigData = { ...current };

  if (section === "vat" || section === "full") {
    // Checkboxes: absent means false when this section is being saved.
    next.pricesIncludeVat = formData.get("pricesIncludeVat") === "on";
    next.showQuarterWithVat = formData.get("showQuarterWithVat") === "on";
    if (formData.has("vatRatePercent")) {
      const vatRatePercent = Number(formData.get("vatRatePercent") ?? 23);
      if (
        !Number.isFinite(vatRatePercent) ||
        vatRatePercent < 0 ||
        vatRatePercent > 100
      ) {
        throw new Error("Taxa de IVA inválida");
      }
      next.vatRatePercent = vatRatePercent;
    }
    if (formData.has("defaultCostRateEur")) {
      next.defaultCostRateEur = optionalNumber(
        String(formData.get("defaultCostRateEur") ?? ""),
      );
    }
  }

  if (section === "company" || section === "full") {
    if (formData.has("companyName")) {
      next.companyName =
        String(formData.get("companyName") ?? "").trim() ||
        DEFAULT_PLATFORM_CONFIG.companyName;
    }
    if (formData.has("companyNif")) {
      next.companyNif = String(formData.get("companyNif") ?? "").trim();
    }
    if (formData.has("companyAddress")) {
      next.companyAddress = String(formData.get("companyAddress") ?? "").trim();
    }
    if (formData.has("companyEmail")) {
      next.companyEmail = String(formData.get("companyEmail") ?? "").trim();
    }
    if (formData.has("companyPhone")) {
      next.companyPhone = String(formData.get("companyPhone") ?? "").trim();
    }
    if (formData.has("companyIban")) {
      next.companyIban = String(formData.get("companyIban") ?? "").trim();
    }
    if (formData.has("companyWebsite")) {
      next.companyWebsite =
        String(formData.get("companyWebsite") ?? "").trim() ||
        DEFAULT_PLATFORM_CONFIG.companyWebsite;
    }
  }

  if (section === "rates" || section === "full") {
    if (formData.has("defaultCostRateEur")) {
      next.defaultCostRateEur = optionalNumber(
        String(formData.get("defaultCostRateEur") ?? ""),
      );
    }
    if (formData.has("defaultBillingRateEur")) {
      next.defaultBillingRateEur = optionalNumber(
        String(formData.get("defaultBillingRateEur") ?? ""),
      );
    }
  }

  if (section === "proposals" || section === "full") {
    if (formData.has("proposalFooter")) {
      next.proposalFooter =
        String(formData.get("proposalFooter") ?? "").trim() ||
        DEFAULT_PLATFORM_CONFIG.proposalFooter;
    }
  }

  if (section === "time" || section === "full") {
    if (formData.has("timeRoundingMinutes")) {
      next.timeRoundingMinutes = optionalInt(
        String(formData.get("timeRoundingMinutes") ?? "30"),
        30,
      );
    }
    if (formData.has("timeMinimumMinutes")) {
      next.timeMinimumMinutes = optionalInt(
        String(formData.get("timeMinimumMinutes") ?? "30"),
        30,
      );
    }
  }

  if (section === "locale" || section === "full") {
    if (formData.has("currency")) {
      const currency =
        String(formData.get("currency") ?? "EUR").trim().toUpperCase() || "EUR";
      if (currency.length !== 3) throw new Error("Moeda inválida (ex. EUR)");
      next.currency = currency;
    }
    if (formData.has("locale")) {
      next.locale =
        String(formData.get("locale") ?? "pt-PT").trim() || "pt-PT";
    }
    if (formData.has("fiscalYearStartMonth")) {
      next.fiscalYearStartMonth = Math.min(
        12,
        Math.max(
          1,
          optionalInt(String(formData.get("fiscalYearStartMonth") ?? "1"), 1),
        ),
      );
    }
  }

  const data = toDbRow(next);

  const delegate = (
    prisma as {
      platformConfig?: {
        upsert: (args: unknown) => Promise<unknown>;
      };
    }
  ).platformConfig;

  if (delegate?.upsert) {
    await delegate.upsert({
      where: { id: "default" },
      create: { id: "default", ...data },
      update: data,
    });
  } else {
    await prisma.$executeRaw`
      INSERT INTO \`PlatformConfig\` (
        \`id\`, \`pricesIncludeVat\`, \`showQuarterWithVat\`, \`vatRatePercent\`,
        \`defaultCostRateEur\`, \`defaultBillingRateEur\`,
        \`companyName\`, \`companyNif\`, \`companyAddress\`, \`companyEmail\`,
        \`companyPhone\`, \`companyIban\`, \`companyWebsite\`, \`proposalFooter\`,
        \`timeRoundingMinutes\`, \`timeMinimumMinutes\`,
        \`currency\`, \`locale\`, \`fiscalYearStartMonth\`,
        \`createdAt\`, \`updatedAt\`
      ) VALUES (
        'default', ${data.pricesIncludeVat}, ${data.showQuarterWithVat}, ${data.vatRatePercent},
        ${data.defaultCostRateEur}, ${data.defaultBillingRateEur},
        ${data.companyName}, ${data.companyNif}, ${data.companyAddress}, ${data.companyEmail},
        ${data.companyPhone}, ${data.companyIban}, ${data.companyWebsite}, ${data.proposalFooter},
        ${data.timeRoundingMinutes}, ${data.timeMinimumMinutes},
        ${data.currency}, ${data.locale}, ${data.fiscalYearStartMonth},
        NOW(3), NOW(3)
      )
      ON DUPLICATE KEY UPDATE
        \`pricesIncludeVat\` = VALUES(\`pricesIncludeVat\`),
        \`showQuarterWithVat\` = VALUES(\`showQuarterWithVat\`),
        \`vatRatePercent\` = VALUES(\`vatRatePercent\`),
        \`defaultCostRateEur\` = VALUES(\`defaultCostRateEur\`),
        \`defaultBillingRateEur\` = VALUES(\`defaultBillingRateEur\`),
        \`companyName\` = VALUES(\`companyName\`),
        \`companyNif\` = VALUES(\`companyNif\`),
        \`companyAddress\` = VALUES(\`companyAddress\`),
        \`companyEmail\` = VALUES(\`companyEmail\`),
        \`companyPhone\` = VALUES(\`companyPhone\`),
        \`companyIban\` = VALUES(\`companyIban\`),
        \`companyWebsite\` = VALUES(\`companyWebsite\`),
        \`proposalFooter\` = VALUES(\`proposalFooter\`),
        \`timeRoundingMinutes\` = VALUES(\`timeRoundingMinutes\`),
        \`timeMinimumMinutes\` = VALUES(\`timeMinimumMinutes\`),
        \`currency\` = VALUES(\`currency\`),
        \`locale\` = VALUES(\`locale\`),
        \`fiscalYearStartMonth\` = VALUES(\`fiscalYearStartMonth\`),
        \`updatedAt\` = NOW(3)
    `;
  }

  revalidatePath("/settings");
  revalidatePath("/commercial");
  revalidatePath("/projects");
  revalidatePath("/");
}

export async function updateAlertSettings(formData: FormData) {
  await requireAdmin();

  const alertBillableEnabled = formData.get("alertBillableEnabled") === "on";
  const alertRegisterEnabled = formData.get("alertRegisterEnabled") === "on";
  const alertAttainedEnabled = formData.get("alertAttainedEnabled") === "on";
  const alertDeadlineEnabled = formData.get("alertDeadlineEnabled") === "on";
  const alertRegisterSoundEnabled =
    formData.get("alertRegisterSoundEnabled") === "on";
  let alertRegisterMinMinutes = optionalInt(
    String(formData.get("alertRegisterMinMinutes") ?? "60"),
    60,
  );
  let alertRegisterMaxMinutes = optionalInt(
    String(formData.get("alertRegisterMaxMinutes") ?? "90"),
    90,
  );

  alertRegisterMinMinutes = Math.min(240, Math.max(15, alertRegisterMinMinutes));
  alertRegisterMaxMinutes = Math.min(
    360,
    Math.max(alertRegisterMinMinutes, alertRegisterMaxMinutes),
  );

  const data = {
    alertBillableEnabled,
    alertRegisterEnabled,
    alertAttainedEnabled,
    alertDeadlineEnabled,
    alertRegisterSoundEnabled,
    alertRegisterMinMinutes,
    alertRegisterMaxMinutes,
  };

  const delegate = (
    prisma as {
      platformConfig?: {
        upsert: (args: unknown) => Promise<unknown>;
      };
    }
  ).platformConfig;

  if (delegate?.upsert) {
    await delegate.upsert({
      where: { id: "default" },
      create: { id: "default", ...data },
      update: data,
    });
  } else {
    await prisma.$executeRaw`
      INSERT INTO \`PlatformConfig\` (
        \`id\`,
        \`alertBillableEnabled\`, \`alertRegisterEnabled\`,
        \`alertAttainedEnabled\`, \`alertDeadlineEnabled\`,
        \`alertRegisterSoundEnabled\`,
        \`alertRegisterMinMinutes\`, \`alertRegisterMaxMinutes\`,
        \`createdAt\`, \`updatedAt\`
      ) VALUES (
        'default',
        ${alertBillableEnabled}, ${alertRegisterEnabled},
        ${alertAttainedEnabled}, ${alertDeadlineEnabled},
        ${alertRegisterSoundEnabled},
        ${alertRegisterMinMinutes}, ${alertRegisterMaxMinutes},
        NOW(3), NOW(3)
      )
      ON DUPLICATE KEY UPDATE
        \`alertBillableEnabled\` = VALUES(\`alertBillableEnabled\`),
        \`alertRegisterEnabled\` = VALUES(\`alertRegisterEnabled\`),
        \`alertAttainedEnabled\` = VALUES(\`alertAttainedEnabled\`),
        \`alertDeadlineEnabled\` = VALUES(\`alertDeadlineEnabled\`),
        \`alertRegisterSoundEnabled\` = VALUES(\`alertRegisterSoundEnabled\`),
        \`alertRegisterMinMinutes\` = VALUES(\`alertRegisterMinMinutes\`),
        \`alertRegisterMaxMinutes\` = VALUES(\`alertRegisterMaxMinutes\`),
        \`updatedAt\` = NOW(3)
    `;
  }

  revalidatePath("/settings");
  revalidatePath("/");
}
