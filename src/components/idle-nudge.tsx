"use client";

import { Button, Card } from "@heroui/react";
import { useEffect, useRef, useState } from "react";

const MIN_MS = 60 * 60 * 1000;
const MAX_MS = 90 * 60 * 1000;

function nextDelay() {
  return MIN_MS + Math.random() * (MAX_MS - MIN_MS);
}

export function IdleNudge({ onLog }: { onLog: () => void }) {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function schedule() {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setVisible(true), nextDelay());
    }

    function bump() {
      if (!visible) schedule();
    }

    schedule();
    window.addEventListener("pointerdown", bump);
    window.addEventListener("keydown", bump);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener("pointerdown", bump);
      window.removeEventListener("keydown", bump);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-xs">
      <Card className="border border-border p-3 shadow-lg">
        <p className="mb-2 text-sm font-medium">Algo para registar?</p>
        <p className="mb-3 text-xs text-muted">
          Passou algum tempo. Abre o Quick Log se fizeste trabalho de manutenção.
        </p>
        <div className="flex gap-2">
          <Button
            variant="primary"
            onPress={() => {
              setVisible(false);
              onLog();
            }}
          >
            Registar
          </Button>
          <Button variant="ghost" onPress={() => setVisible(false)}>
            Mais tarde
          </Button>
        </div>
      </Card>
    </div>
  );
}
