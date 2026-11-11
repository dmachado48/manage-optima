"use client";

import { Button, Card } from "@heroui/react";
import { useState } from "react";
import { QuickLogForm } from "@/components/quick-log-form";
import { VoiceLogAssistant } from "@/components/voice-log-assistant";

type ClientOption = { id: string; name: string };
type RequestOption = { id: string; title: string; clientId: string };

export function QuickLogModal({
  clients,
  openRequests,
  open,
  onOpenChange,
  initialMode = "form",
}: {
  clients: ClientOption[];
  openRequests: RequestOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: "form" | "voice";
}) {
  const [mode, setMode] = useState<"form" | "voice">(initialMode);

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

        <div className="mb-3 flex gap-1 rounded-lg bg-default p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setMode("form")}
            className={
              mode === "form"
                ? "flex-1 rounded-sm bg-foreground/10 px-2 py-1.5 font-medium"
                : "flex-1 rounded-sm px-2 py-1.5 text-muted"
            }
          >
            Manual
          </button>
          <button
            type="button"
            onClick={() => setMode("voice")}
            className={
              mode === "voice"
                ? "flex-1 rounded-sm bg-foreground/10 px-2 py-1.5 font-medium"
                : "flex-1 rounded-sm px-2 py-1.5 text-muted"
            }
          >
            Voz
          </button>
        </div>

        {mode === "voice" ? (
          <VoiceLogAssistant
            clients={clients}
            openRequests={openRequests}
            onDone={() => onOpenChange(false)}
          />
        ) : (
          <QuickLogForm
            clients={clients}
            openRequests={openRequests}
            onSuccess={() => onOpenChange(false)}
          />
        )}
      </Card>
    </div>
  );
}
