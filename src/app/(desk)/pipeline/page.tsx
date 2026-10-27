import { redirect } from "next/navigation";

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.client ? `?client=${encodeURIComponent(sp.client)}` : "";
  redirect(`/${q}`);
}
