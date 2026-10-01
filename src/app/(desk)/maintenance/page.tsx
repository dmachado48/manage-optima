import { ReportsPanel } from "@/components/maintenance/reports-panel";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function MaintenancePage() {
  const [clients, reports] = await Promise.all([
    prisma.client.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.report.findMany({
      include: { client: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div className="desk-page flex min-h-full flex-1 flex-col py-6">
      <div className="border-b border-border pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Manutenção</h1>
        <p className="text-sm text-muted">
          Relatórios mensais de intervenções. O teu quadro de trabalho está em
          Pipeline; clientes em Clientes.
        </p>
      </div>
      <ReportsPanel
        clients={clients}
        reports={reports.map((r) => ({
          id: r.id,
          body: r.body,
          published: r.published,
          periodStart: r.periodStart.toISOString(),
          client: r.client,
        }))}
      />
    </div>
  );
}
