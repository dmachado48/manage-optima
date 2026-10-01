import type {
  DailyPlanItem,
  Proposal,
  Request,
  BuildTask,
} from "@prisma/client";

export type DailyJob = {
  id: string;
  title: string;
  area: "Manutenção" | "Projeto" | "Comercial" | "Manual";
  done: boolean;
  source: "request" | "task" | "proposal" | "manual";
  requestId?: string;
  clientId?: string;
  taskId?: string;
  proposalId?: string;
  planItemId?: string;
  href?: string;
};

export function assembleDailyJobs(input: {
  requests: Pick<Request, "id" | "title" | "status" | "clientId">[];
  tasks: Pick<BuildTask, "id" | "title" | "status" | "projectId">[];
  proposals: Pick<Proposal, "id" | "title" | "status">[];
  planItems: DailyPlanItem[];
}): DailyJob[] {
  const jobs: DailyJob[] = [];

  for (const r of input.requests) {
    if (r.status === "in_progress" || r.status === "waiting_on_client") {
      jobs.push({
        id: `req-${r.id}`,
        title: r.title,
        area: "Manutenção",
        done: false,
        source: "request",
        requestId: r.id,
        clientId: r.clientId,
        href: `/pipeline?client=${r.clientId}`,
      });
    }
  }

  for (const t of input.tasks) {
    if (t.status === "todo" || t.status === "in_progress") {
      jobs.push({
        id: `task-${t.id}`,
        title: t.title,
        area: "Projeto",
        done: false,
        source: "task",
        taskId: t.id,
        href: `/projects/${t.projectId}`,
      });
    }
  }

  for (const p of input.proposals) {
    if (p.status === "sent") {
      jobs.push({
        id: `prop-${p.id}`,
        title: `Seguir: ${p.title}`,
        area: "Comercial",
        done: false,
        source: "proposal",
        proposalId: p.id,
        href: "/commercial",
      });
    }
  }

  for (const item of input.planItems) {
    jobs.push({
      id: `plan-${item.id}`,
      title: item.title,
      area: "Manual",
      done: item.done,
      source: "manual",
      planItemId: item.id,
      requestId: item.requestId ?? undefined,
      taskId: item.taskId ?? undefined,
      proposalId: item.proposalId ?? undefined,
    });
  }

  return jobs;
}
