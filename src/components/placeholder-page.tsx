import { Card } from "@heroui/react";

export default function PlaceholderPage({
  title,
  blurb,
}: {
  title: string;
  blurb: string;
}) {
  return (
    <main className="desk-page flex flex-1 flex-col gap-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <Card className="p-4 text-sm text-muted">{blurb}</Card>
    </main>
  );
}
