import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { pollImapInbox } from "@/lib/imap-poll";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

function validBearerToken(request: Request, secret: string): boolean {
  const auth = request.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const actual = Buffer.from(provided);
  const expected = Buffer.from(secret);

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 503 },
    );
  }
  if (!validBearerToken(request, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await pollImapInbox();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error(
      "[imap] Polling falhou:",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json(
      { ok: false, error: "Falha ao consultar a caixa de email" },
      { status: 502 },
    );
  }
}
