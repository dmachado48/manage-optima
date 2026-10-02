import { DeskShell } from "@/components/desk-shell";
import { getPlatformConfig } from "@/lib/platform-config";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DeskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [clients, openRequests, platform] = await Promise.all([
    prisma.client.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.request.findMany({
      where: { status: { not: "done" } },
      select: { id: true, title: true, clientId: true },
      orderBy: { updatedAt: "desc" },
    }),
    getPlatformConfig(),
  ]);

  return (
    <DeskShell
      clients={clients}
      openRequests={openRequests}
      idleNudge={{
        enabled: platform.alertRegisterEnabled,
        soundEnabled: platform.alertRegisterSoundEnabled,
        minMinutes: platform.alertRegisterMinMinutes,
        maxMinutes: platform.alertRegisterMaxMinutes,
      }}
    >
      {children}
    </DeskShell>
  );
}
