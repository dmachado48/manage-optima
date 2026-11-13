import { Suspense } from "react";
import { DeskShell } from "@/components/desk-shell";
import { getBillingAlerts } from "@/lib/billing-alerts";
import { getPlatformConfig } from "@/lib/platform-config";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DeskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [clients, openRequests, platform, billingAlerts] = await Promise.all([
    prisma.client.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        contracts: {
          where: { active: true },
          select: { type: true },
          take: 1,
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.request.findMany({
      where: { status: { not: "done" } },
      select: { id: true, title: true, clientId: true },
      orderBy: { updatedAt: "desc" },
    }),
    getPlatformConfig(),
    getBillingAlerts(),
  ]);

  return (
    <Suspense fallback={<div className="min-h-full flex-1 bg-[var(--background)]" />}>
      <DeskShell
        clients={clients.map((client) => ({
          id: client.id,
          name: client.name,
          contractType: client.contracts[0]?.type ?? null,
        }))}
        openRequests={openRequests}
        billingAlerts={billingAlerts}
        idleNudge={{
          enabled: platform.alertRegisterEnabled,
          soundEnabled: platform.alertRegisterSoundEnabled,
          minMinutes: platform.alertRegisterMinMinutes,
          maxMinutes: platform.alertRegisterMaxMinutes,
        }}
      >
        {children}
      </DeskShell>
    </Suspense>
  );
}
