import { ProjectsList } from "@/components/projects/projects-list";
import { computeProjectFinance } from "@/lib/project-finance";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const [projects, clients] = await Promise.all([
    prisma.project.findMany({
      where: { status: { not: "cancelled" } },
      include: {
        client: { select: { id: true, name: true } },
        tasks: {
          select: {
            id: true,
            status: true,
            estimatedMinutes: true,
            spentMinutes: true,
          },
        },
        proposals: {
          where: { status: "approved" },
          select: { amountEur: true },
        },
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    }),
    prisma.client.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <ProjectsList
      clients={clients}
      projects={projects.map((p) => {
        const proposalApprovedEur = p.proposals.reduce(
          (s, x) => s + Number(x.amountEur),
          0,
        );
        const estimatedMinutes = p.tasks.reduce(
          (s, t) => s + (t.estimatedMinutes ?? 0),
          0,
        );
        const spentMinutes = p.tasks.reduce((s, t) => s + t.spentMinutes, 0);
        const finance = computeProjectFinance({
          budgetEur: p.budgetEur != null ? Number(p.budgetEur) : null,
          costRateEur: p.costRateEur != null ? Number(p.costRateEur) : null,
          proposalApprovedEur,
          estimatedMinutes,
          spentMinutes,
        });
        const done = p.tasks.filter((t) => t.status === "done").length;
        return {
          id: p.id,
          title: p.title,
          status: p.status,
          deadline: p.deadline?.toISOString() ?? null,
          billedAt: p.billedAt?.toISOString() ?? null,
          createdAt: p.createdAt.toISOString(),
          client: p.client,
          taskTotal: p.tasks.length,
          taskDone: done,
          finance,
        };
      })}
    />
  );
}
