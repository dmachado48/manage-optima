import "server-only";

import { getPlatformConfig } from "@/lib/platform-config";
import { prisma } from "@/lib/prisma";

/**
 * Older Quick Log entries created an open `ad_hoc` pipeline card for every
 * hour log. Close those so they only live in finance/history.
 */
export async function finalizeOrphanAdHocHourLogs(): Promise<number> {
  const orphans = await prisma.request.findMany({
    where: {
      source: "ad_hoc",
      closedAt: null,
      archivedAt: null,
      interventions: { some: {} },
    },
    select: {
      id: true,
      interventions: {
        select: { performedAt: true },
        orderBy: { performedAt: "desc" },
        take: 1,
      },
    },
    take: 500,
  });

  let count = 0;
  for (const r of orphans) {
    const closedAt = r.interventions[0]?.performedAt ?? new Date();
    await prisma.request.update({
      where: { id: r.id },
      data: {
        status: "done",
        closeKind: "hours",
        closedAt,
      },
    });
    count += 1;
  }
  return count;
}

/**
 * Archive completed requests whose work is already billed (nothing left
 * billable) and whose last billing date is older than the configured days.
 * Archived requests never appear in the pipeline.
 */
export async function archiveBilledRequests(): Promise<number> {
  await finalizeOrphanAdHocHourLogs();

  const config = await getPlatformConfig();
  const days = Math.min(
    365,
    Math.max(1, Number(config.archiveBilledAfterDays) || 7),
  );
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const candidates = await prisma.request.findMany({
    where: {
      status: "done",
      archivedAt: null,
      interventions: {
        some: { billingStatus: "billed" },
        none: { billingStatus: "billable" },
      },
    },
    select: {
      id: true,
      closedAt: true,
      updatedAt: true,
      interventions: {
        where: { billingStatus: "billed" },
        select: { billedAt: true, performedAt: true },
      },
    },
    take: 500,
  });

  const ids: string[] = [];
  for (const r of candidates) {
    let latest = r.closedAt?.getTime() ?? 0;
    for (const i of r.interventions) {
      const t = (i.billedAt ?? i.performedAt).getTime();
      if (t > latest) latest = t;
    }
    if (latest === 0) latest = r.updatedAt.getTime();
    if (latest <= cutoff.getTime()) ids.push(r.id);
  }

  if (ids.length === 0) return 0;

  await prisma.request.updateMany({
    where: { id: { in: ids } },
    data: { archivedAt: new Date() },
  });

  return ids.length;
}
