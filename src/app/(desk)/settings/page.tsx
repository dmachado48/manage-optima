import { SettingsDesk } from "@/components/settings/settings-desk";
import {
  loadAvencaContractExtras,
  syncRetainerPeriodsInDb,
} from "@/lib/billing";
import { getFinanceActuals } from "@/lib/finance";
import { getPlatformConfig } from "@/lib/platform-config";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const year = new Date().getFullYear();

  await syncRetainerPeriodsInDb();

  const [
    clients,
    contracts,
    interventions,
    fy,
    actuals,
    avencaExtras,
    platformConfig,
  ] = await Promise.all([
    prisma.client.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.contract.findMany({
      include: { client: { select: { id: true, name: true } } },
      orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
    }),
    prisma.intervention.findMany({
      include: {
        client: { select: { id: true, name: true } },
        request: { select: { title: true } },
      },
      orderBy: { performedAt: "desc" },
      take: 200,
    }),
    prisma.financeYear.findUnique({
      where: { year },
      include: { quarters: { orderBy: { quarter: "asc" } } },
    }),
    getFinanceActuals(year),
    loadAvencaContractExtras(),
    getPlatformConfig(),
  ]);

  const reportIds = [
    ...new Set(
      interventions
        .map((i) =>
          "reportId" in i
            ? ((i as { reportId?: string | null }).reportId ?? null)
            : null,
        )
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const reports =
    reportIds.length > 0
      ? await prisma.report.findMany({
          where: { id: { in: reportIds } },
          select: { id: true, batchCode: true },
        })
      : [];

  const batchByReportId = new Map(
    reports.map((r) => [r.id, r.batchCode ?? null] as const),
  );

  const initialTab =
    tab === "goals" ||
    tab === "interventions" ||
    tab === "contracts" ||
    tab === "platform"
      ? tab
      : "contracts";

  return (
    <SettingsDesk
      initialTab={initialTab}
      clients={clients}
      year={year}
      annualGoal={fy ? Number(fy.annualGoal) : 0}
      quarters={
        fy?.quarters.map((q) => ({
          quarter: q.quarter,
          target: Number(q.target),
        })) ?? []
      }
      actuals={actuals}
      platformConfig={platformConfig}
      contracts={contracts.map((c) => {
        const extra = avencaExtras.get(c.id);
        return {
          id: c.id,
          type: c.type,
          hoursTotal: Number(c.hoursTotal),
          hoursUsed: Number(c.hoursUsed),
          hourlyRate: c.hourlyRate != null ? Number(c.hourlyRate) : null,
          monthlyFeeEur: extra?.monthlyFeeEur ?? null,
          jobDescription: extra?.jobDescription ?? null,
          periodKey: extra?.periodKey ?? null,
          active: c.active,
          billedAt: c.billedAt?.toISOString() ?? null,
          startsAt: c.startsAt?.toISOString() ?? null,
          endsAt: c.endsAt?.toISOString() ?? null,
          createdAt: c.createdAt.toISOString(),
          client: c.client,
        };
      })}
      interventions={interventions.map((i) => {
        const reportId =
          "reportId" in i
            ? ((i as { reportId?: string | null }).reportId ?? null)
            : null;
        return {
          id: i.id,
          minutes: i.minutes,
          agreedAmountEur:
            i.agreedAmountEur != null ? Number(i.agreedAmountEur) : null,
          note: i.note,
          billingStatus: i.billingStatus,
          performedAt: i.performedAt.toISOString(),
          client: i.client,
          requestTitle: i.request.title,
          batchCode: reportId ? (batchByReportId.get(reportId) ?? null) : null,
        };
      })}
    />
  );
}
