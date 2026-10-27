"use client";

import { Button, Card } from "@heroui/react";
import { useEffect, useRef, useState } from "react";
import { playRegisterChime, primeAlertAudio } from "@/lib/alert-sound";

export type IdleNudgeSettings = {
  enabled: boolean;
  soundEnabled: boolean;
  minMinutes: number;
  maxMinutes: number;
};

function nextDelayMs(minMinutes: number, maxMinutes: number) {
  const min = Math.max(1, minMinutes) * 60 * 1000;
  const max = Math.max(min, maxMinutes * 60 * 1000);
  return min + Math.random() * (max - min);
}

export function IdleNudge({
  onLog,
  settings,
}: {
  onLog: () => void;
  settings: IdleNudgeSettings;
}) {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soundedForShow = useRef(false);

  // Unlock audio after the first user gesture (required by browsers).
  useEffect(() => {
    function unlock() {
      void primeAlertAudio();
    }
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    if (!settings.enabled) {
      setVisible(false);
      if (timer.current) clearTimeout(timer.current);
      return;
    }

    function schedule() {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setVisible(true);
      }, nextDelayMs(settings.minMinutes, settings.maxMinutes));
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
  }, [
    visible,
    settings.enabled,
    settings.minMinutes,
    settings.maxMinutes,
  ]);

  useEffect(() => {
    if (!visible) {
      soundedForShow.current = false;
      return;
    }
    if (soundedForShow.current) return;
    soundedForShow.current = true;
    if (settings.soundEnabled) void playRegisterChime();
  }, [visible, settings.soundEnabled]);

  if (!settings.enabled || !visible) return null;

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
