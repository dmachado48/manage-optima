"use client";

import { Button, Card } from "@heroui/react";
import { QuickLogForm } from "@/components/quick-log-form";

type ClientOption = { id: string; name: string };
type RequestOption = { id: string; title: string; clientId: string };

export function QuickLogModal({
  clients,
  openRequests,
  open,
  onOpenChange,
}: {
  clients: ClientOption[];
  openRequests: RequestOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <Card className="w-full max-w-md p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-medium">Registar trabalho</h2>
          <Button variant="ghost" onPress={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
        <QuickLogForm
          clients={clients}
          openRequests={openRequests}
          onSuccess={() => onOpenChange(false)}
        />
      </Card>
    </div>
  );
}
