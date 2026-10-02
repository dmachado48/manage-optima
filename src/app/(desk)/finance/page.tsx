import { FinanceDesk } from "@/components/finance/finance-desk";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const [clients, interventions, rateContracts] = await Promise.all([
    prisma.client.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.intervention.findMany({
      where: {
        billingStatus: { in: ["billable", "billed"] },
      },
      include: {
        client: { select: { id: true, name: true } },
        request: { select: { id: true, title: true } },
        report: { select: { batchCode: true } },
      },
      orderBy: { performedAt: "desc" },
      take: 500,
    }),
    prisma.contract.findMany({
      where: { hourlyRate: { not: null } },
      select: { clientId: true, hourlyRate: true, active: true },
      orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
    }),
  ]);

  const rateByClient = new Map<string, number>();
  for (const c of rateContracts) {
    if (rateByClient.has(c.clientId) || c.hourlyRate == null) continue;
    rateByClient.set(c.clientId, Number(c.hourlyRate));
  }

  return (
    <FinanceDesk
      clients={clients}
      interventions={interventions.map((i) => ({
        id: i.id,
        minutes: i.minutes,
        agreedAmountEur:
          i.agreedAmountEur != null ? Number(i.agreedAmountEur) : null,
        note: i.note,
        billingStatus: i.billingStatus,
        performedAt: i.performedAt.toISOString(),
        client: i.client,
        requestTitle: i.request.title,
        requestId: i.request.id,
        batchCode: i.report?.batchCode ?? null,
        hourlyRate: rateByClient.get(i.clientId) ?? null,
      }))}
    />
  );
}
