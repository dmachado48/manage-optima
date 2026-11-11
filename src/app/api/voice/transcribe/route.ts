import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB

export async function POST(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: process.env.NODE_ENV === "production",
  });
  if (!token || token.role !== "admin") {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Transcrição Whisper não configurada. Define OPENAI_API_KEY no servidor, ou usa o reconhecimento de voz do browser.",
      },
      { status: 503 },
    );
  }

  const form = await request.formData();
  const file = form.get("audio");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Áudio em falta" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Áudio demasiado grande (máx. 12 MB)" },
      { status: 400 },
    );
  }

  const upstream = new FormData();
  upstream.set(
    "file",
    new File([await file.arrayBuffer()], file.name || "voice.webm", {
      type: file.type || "audio/webm",
    }),
  );
  upstream.set("model", "whisper-1");
  upstream.set("language", "pt");
  upstream.set(
    "prompt",
    "Registo de trabalho: cliente, minutos e o que foi feito.",
  );

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: upstream,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return NextResponse.json(
      {
        error: `Falha na transcrição (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
      },
      { status: 502 },
    );
  }

  const data = (await res.json()) as { text?: string };
  const text = String(data.text ?? "").trim();
  if (!text) {
    return NextResponse.json(
      { error: "Não foi possível perceber o áudio" },
      { status: 422 },
    );
  }

  return NextResponse.json({ text });
}
