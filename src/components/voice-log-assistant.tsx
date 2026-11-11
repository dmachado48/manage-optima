"use client";

import { Button, Chip } from "@heroui/react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { logIntervention } from "@/app/actions/interventions";
import {
  matchClientId,
  parseVoiceLog,
} from "@/lib/voice-log-parse";

type ClientOption = { id: string; name: string };
type RequestOption = { id: string; title: string; clientId: string };

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

function getSpeechRecognition():
  | (new () => SpeechRecognitionLike)
  | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const MINUTE_OPTIONS = [30, 60, 90, 120];

export function VoiceLogAssistant({
  clients,
  openRequests,
  onDone,
}: {
  clients: ClientOption[];
  openRequests: RequestOption[];
  onDone?: () => void;
}) {
  const router = useRouter();
  const [listening, setListening] = useState(false);
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState("");
  const [transcript, setTranscript] = useState("");
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [requestId, setRequestId] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const filteredRequests = openRequests.filter((r) => r.clientId === clientId);
  const speechAvailable = Boolean(getSpeechRecognition());

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      stopMedia();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup only
  }, []);

  function applyTranscript(text: string) {
    setTranscript(text);
    const parsed = parseVoiceLog(
      text,
      clients.map((c) => c.name),
    );
    if (parsed.minutes) setMinutes(parsed.minutes);
    if (parsed.note) setNote(parsed.note);
    const matched = matchClientId(parsed.clientHint, clients);
    if (matched) {
      setClientId(matched);
      setRequestId("");
    }
    setStatus("Revisa e confirma o registo.");
  }

  function stopMedia() {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setRecording(false);
  }

  function startBrowserSpeech() {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setError("Este browser não tem reconhecimento de voz. Usa gravar + Whisper.");
      return;
    }
    setError(null);
    setStatus("A ouvir… fala agora.");
    setInterim("");
    const recognition = new Ctor();
    recognition.lang = "pt-PT";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let finalChunk = "";
      let live = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const piece = event.results[i]![0]!.transcript;
        if (event.results[i]!.isFinal) finalChunk += piece;
        else live += piece;
      }
      if (finalChunk) {
        setTranscript((prev) => {
          const next = `${prev} ${finalChunk}`.trim();
          Promise.resolve().then(() => applyTranscript(next));
          return next;
        });
      }
      setInterim(live);
    };
    recognition.onerror = (ev) => {
      setListening(false);
      if (ev.error === "not-allowed") {
        setError("Microfone bloqueado — permite o acesso nas definições do browser.");
      } else if (ev.error !== "aborted") {
        setError(`Erro de voz: ${ev.error}`);
      }
    };
    recognition.onend = () => {
      setListening(false);
      setInterim("");
    };
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  function stopBrowserSpeech() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
    setInterim("");
  }

  async function startRecording() {
    setError(null);
    setStatus("A gravar… toca outra vez para parar e transcrever.");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const recorder = new MediaRecorder(
        stream,
        mime ? { mimeType: mime } : undefined,
      );
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        void transcribeRecording(
          new Blob(chunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          }),
        );
      };
      recorder.start();
      setRecording(true);
    } catch {
      setError("Não foi possível aceder ao microfone.");
      setStatus(null);
    }
  }

  async function transcribeRecording(blob: Blob) {
    setStatus("A transcrever…");
    try {
      const fd = new FormData();
      fd.set(
        "audio",
        new File([blob], "voice.webm", { type: blob.type || "audio/webm" }),
      );
      const res = await fetch("/api/voice/transcribe", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Falha na transcrição");
      applyTranscript(data.text ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao transcrever");
      setStatus(null);
    } finally {
      stopMedia();
    }
  }

  function toggleListen() {
    if (listening) stopBrowserSpeech();
    else startBrowserSpeech();
  }

  function toggleRecord() {
    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
      setStatus("A finalizar gravação…");
    } else {
      void startRecording();
    }
  }

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await logIntervention({
          clientId,
          requestId: requestId || null,
          minutes,
          note: note || transcript || null,
          createAdHocTitle: note || transcript || undefined,
          billingStatus: null,
        });
        setStatus("Guardado.");
        setTranscript("");
        setNote("");
        setRequestId("");
        setMinutes(30);
        router.refresh();
        onDone?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao guardar");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-border bg-default/40 px-3 py-2">
        <p className="text-sm font-medium">Assistente de voz</p>
        <p className="mt-0.5 text-[11px] text-muted">
          Ex.: «No Global Compact meia hora a corrigir o login»
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {speechAvailable ? (
          <Button
            variant={listening ? "primary" : "secondary"}
            onPress={toggleListen}
            isDisabled={recording || pending}
          >
            {listening ? "Parar de ouvir" : "Falar agora"}
          </Button>
        ) : null}
        <Button
          variant={recording ? "primary" : "secondary"}
          onPress={toggleRecord}
          isDisabled={listening || pending}
        >
          {recording ? "Parar e transcrever" : "Gravar áudio"}
        </Button>
      </div>

      {status ? <p className="text-xs text-muted">{status}</p> : null}
      {interim ? (
        <p className="text-sm italic text-muted">{interim}</p>
      ) : null}
      {transcript ? (
        <p className="rounded-md bg-default px-2 py-1.5 text-sm">{transcript}</p>
      ) : null}

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-muted">Cliente</span>
        <select
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
          value={clientId}
          onChange={(e) => {
            setClientId(e.target.value);
            setRequestId("");
          }}
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-muted">Pedido (opcional)</span>
        <select
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
          value={requestId}
          onChange={(e) => setRequestId(e.target.value)}
        >
          <option value="">Criar pedido avulso</option>
          {filteredRequests.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-muted">Duração</span>
        <div className="flex flex-wrap gap-1.5">
          {MINUTE_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMinutes(m)}
              className={
                minutes === m
                  ? "rounded-sm bg-accent px-2.5 py-1 text-white"
                  : "rounded-sm bg-default px-2.5 py-1"
              }
            >
              {m} min
            </button>
          ))}
        </div>
        <input
          type="number"
          min={0}
          step={15}
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value) || 0)}
          className="mt-1 w-28 rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
        />
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-muted">Nota</span>
        <textarea
          className="min-h-20 rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="O que fizeste?"
        />
      </label>

      {error ? (
        <Chip className="bg-danger-soft text-danger">{error}</Chip>
      ) : null}

      <Button
        variant="primary"
        isDisabled={pending || !clientId || (!note.trim() && !transcript.trim())}
        onPress={save}
      >
        {pending ? "A guardar…" : "Guardar intervenção"}
      </Button>

      <p className="text-[10px] leading-relaxed text-muted">
        No iPhone/Mac podes criar um Atalho da Siri «Registar Optima» que abre{" "}
        <code className="text-[10px]">manage.webiton.pt/?voice=1</code> e diz
        «Hey Siri, registar Optima».
      </p>
    </div>
  );
}
