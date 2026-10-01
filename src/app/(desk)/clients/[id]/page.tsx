import { notFound } from "next/navigation";
import { ClientSheet } from "@/components/clients/client-sheet";
import { getClientDetail } from "@/lib/client-detail";
import { clientInboundAlias } from "@/lib/email-match";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getClientDetail(id);
  if (!detail) notFound();

  const base =
    process.env.AUTH_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  const shareUrl = `${base}/k/${detail.client.kanbanShareToken}`;
  const inboundEmail = clientInboundAlias(detail.client.kanbanShareToken);

  return (
    <ClientSheet
      shareUrl={shareUrl}
      inboundEmail={inboundEmail}
      client={detail.client}
      contracts={detail.contracts}
      backlog={detail.backlog}
      history={detail.history}
      requests={detail.requests}
      statusCounts={detail.statusCounts}
      months={detail.months}
      revenue={detail.revenue}
      totalMinutes={detail.totalMinutes}
      interventions={detail.interventions}
    />
  );
}
