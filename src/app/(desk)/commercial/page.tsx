import { CommercialDesk } from "@/components/commercial/commercial-desk";
import { getBillingAlerts } from "@/lib/billing-alerts";
import { getPlatformConfig } from "@/lib/platform-config";
import { prisma } from "@/lib/prisma";
import { splitLegacyProposalBody } from "@/lib/proposal-template";

export const dynamic = "force-dynamic";

export default async function CommercialPage() {
  const [
    clients,
    projects,
    proposals,
    templates,
    scopes,
    billingAlerts,
    platformConfig,
  ] = await Promise.all([
    prisma.client.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.project.findMany({
      include: {
        client: { select: { id: true, name: true } },
        _count: { select: { proposals: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.proposal.findMany({
      include: {
        project: {
          select: {
            id: true,
            title: true,
            client: { select: { name: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.proposalTemplate.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.scopeDocument.findMany({
      orderBy: [{ projectId: "asc" }, { version: "desc" }],
    }),
    getBillingAlerts(),
    getPlatformConfig(),
  ]);

  const scopeByProject = new Map<string, string>();
  for (const s of scopes) {
    if (!scopeByProject.has(s.projectId)) {
      scopeByProject.set(s.projectId, s.body);
    }
  }

  const priceVatLabel = platformConfig.pricesIncludeVat ? "c/ IVA" : "s/ IVA";

  return (
    <CommercialDesk
      clients={clients}
      templates={templates}
      billingAlerts={billingAlerts}
      priceVatLabel={priceVatLabel}
      projects={projects.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        billedAt: p.billedAt?.toISOString() ?? null,
        client: p.client,
        proposalCount: p._count.proposals,
      }))}
      proposals={proposals.map((p) => {
        const legacy = splitLegacyProposalBody(p.body);
        const scopeBody = scopeByProject.get(p.projectId) ?? legacy.scopeText;
        const htmlBody = legacy.html || p.body;
        return {
          id: p.id,
          title: p.title,
          amountEur: Number(p.amountEur),
          status: p.status,
          bodyHtml: htmlBody,
          scopeBody,
          proposalDate: (p.proposalDate ?? p.createdAt).toISOString(),
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
          project: p.project,
        };
      })}
    />
  );
}
