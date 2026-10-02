"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
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

export async function updatePlatformConfig(formData: FormData) {
  await requireAdmin();

  const pricesIncludeVat = formData.get("pricesIncludeVat") === "on";
  const showQuarterWithVat = formData.get("showQuarterWithVat") === "on";
  const vatRatePercent = Number(formData.get("vatRatePercent") ?? 23);
  const defaultCostRateEur = optionalNumber(
    String(formData.get("defaultCostRateEur") ?? ""),
  );
  const defaultBillingRateEur = optionalNumber(
    String(formData.get("defaultBillingRateEur") ?? ""),
  );

  const companyName = String(formData.get("companyName") ?? "").trim() || null;
  const companyNif = String(formData.get("companyNif") ?? "").trim() || null;
  const companyAddress =
    String(formData.get("companyAddress") ?? "").trim() || null;
  const companyEmail =
    String(formData.get("companyEmail") ?? "").trim() || null;
  const companyPhone =
    String(formData.get("companyPhone") ?? "").trim() || null;
  const companyIban = String(formData.get("companyIban") ?? "").trim() || null;
  const companyWebsite =
    String(formData.get("companyWebsite") ?? "").trim() || null;
  const proposalFooter =
    String(formData.get("proposalFooter") ?? "").trim() || null;

  const timeRoundingMinutes = optionalInt(
    String(formData.get("timeRoundingMinutes") ?? "30"),
    30,
  );
  const timeMinimumMinutes = optionalInt(
    String(formData.get("timeMinimumMinutes") ?? "30"),
    30,
  );
  const currency =
    String(formData.get("currency") ?? "EUR").trim().toUpperCase() || "EUR";
  const locale = String(formData.get("locale") ?? "pt-PT").trim() || "pt-PT";
  const fiscalYearStartMonth = Math.min(
    12,
    Math.max(
      1,
      optionalInt(String(formData.get("fiscalYearStartMonth") ?? "1"), 1),
    ),
  );

  if (!Number.isFinite(vatRatePercent) || vatRatePercent < 0 || vatRatePercent > 100) {
    throw new Error("Taxa de IVA inválida");
  }
  if (currency.length !== 3) throw new Error("Moeda inválida (ex. EUR)");

  const data = {
    pricesIncludeVat,
    showQuarterWithVat,
    vatRatePercent,
    defaultCostRateEur,
    defaultBillingRateEur,
    companyName,
    companyNif,
    companyAddress,
    companyEmail,
    companyPhone,
    companyIban,
    companyWebsite,
    proposalFooter,
    timeRoundingMinutes,
    timeMinimumMinutes,
    currency,
    locale,
    fiscalYearStartMonth,
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
        \`id\`, \`pricesIncludeVat\`, \`showQuarterWithVat\`, \`vatRatePercent\`,
        \`defaultCostRateEur\`, \`defaultBillingRateEur\`,
        \`companyName\`, \`companyNif\`, \`companyAddress\`, \`companyEmail\`,
        \`companyPhone\`, \`companyIban\`, \`companyWebsite\`, \`proposalFooter\`,
        \`timeRoundingMinutes\`, \`timeMinimumMinutes\`,
        \`currency\`, \`locale\`, \`fiscalYearStartMonth\`,
        \`createdAt\`, \`updatedAt\`
      ) VALUES (
        'default', ${pricesIncludeVat}, ${showQuarterWithVat}, ${vatRatePercent},
        ${defaultCostRateEur}, ${defaultBillingRateEur},
        ${companyName}, ${companyNif}, ${companyAddress}, ${companyEmail},
        ${companyPhone}, ${companyIban}, ${companyWebsite}, ${proposalFooter},
        ${timeRoundingMinutes}, ${timeMinimumMinutes},
        ${currency}, ${locale}, ${fiscalYearStartMonth},
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
