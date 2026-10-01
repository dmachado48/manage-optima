import { getDailyJobs, getDayResumeData } from "@/app/actions/daily";
import { DailyDesk } from "@/components/daily-desk";
import { getBillingAlerts } from "@/lib/billing-alerts";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [jobs, resume, clients, openRequests, billingAlerts] =
    await Promise.all([
      getDailyJobs(),
      getDayResumeData(),
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
      getBillingAlerts(),
    ]);

  return (
    <DailyDesk
      jobs={jobs}
      resume={resume}
      clients={clients}
      openRequests={openRequests}
      billingAlerts={billingAlerts}
    />
  );
}
