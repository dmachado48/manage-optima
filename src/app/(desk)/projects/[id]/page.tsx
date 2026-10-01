import { notFound } from "next/navigation";
import { ProjectDesk } from "@/components/projects/project-desk";
import { computeProjectFinance } from "@/lib/project-finance";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [project, clients] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true } },
        tasks: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        proposals: {
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            title: true,
            amountEur: true,
            status: true,
            proposalDate: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.client.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  if (!project) notFound();

  const proposalApprovedEur = project.proposals
    .filter((p) => p.status === "approved")
    .reduce((s, p) => s + Number(p.amountEur), 0);
  const estimatedMinutes = project.tasks.reduce(
    (s, t) => s + (t.estimatedMinutes ?? 0),
    0,
  );
  const spentMinutes = project.tasks.reduce((s, t) => s + t.spentMinutes, 0);
  const finance = computeProjectFinance({
    budgetEur: project.budgetEur != null ? Number(project.budgetEur) : null,
    costRateEur:
      project.costRateEur != null ? Number(project.costRateEur) : null,
    proposalApprovedEur,
    estimatedMinutes,
    spentMinutes,
  });

  return (
    <ProjectDesk
      clients={clients}
      project={{
        id: project.id,
        title: project.title,
        status: project.status,
        deadline: project.deadline?.toISOString() ?? null,
        budgetEur:
          project.budgetEur != null ? Number(project.budgetEur) : null,
        costRateEur:
          project.costRateEur != null ? Number(project.costRateEur) : null,
        billedAt: project.billedAt?.toISOString() ?? null,
        createdAt: project.createdAt.toISOString(),
        client: project.client,
      }}
      tasks={project.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        estimatedMinutes: t.estimatedMinutes,
        spentMinutes: t.spentMinutes,
      }))}
      proposals={project.proposals.map((p) => ({
        id: p.id,
        title: p.title,
        amountEur: Number(p.amountEur),
        status: p.status,
        proposalDate: (p.proposalDate ?? p.createdAt).toISOString(),
      }))}
      finance={finance}
    />
  );
}
