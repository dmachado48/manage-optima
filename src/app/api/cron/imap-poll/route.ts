import { NextResponse } from "next/server";

/**
 * Placeholder cron endpoint for IMAP poll of requests@webiton.pt.
 * Wire with cPanel cron: curl -H "Authorization: Bearer $CRON_SECRET" ...
 *
 * When IMAP_* env vars are set, install `imapflow` and implement fetch here.
 * Until then returns status of config only.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 503 },
    );
  }
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const configured = Boolean(
    process.env.IMAP_HOST &&
      process.env.IMAP_USER &&
      process.env.IMAP_PASSWORD,
  );

  if (!configured) {
    return NextResponse.json({
      ok: true,
      polled: 0,
      message:
        "IMAP not configured. Use POST /api/inbound/email or paste in /inbox. Set IMAP_HOST, IMAP_USER, IMAP_PASSWORD to enable polling.",
    });
  }

  // Intentionally not bundling imapflow yet — keep deps light until credentials exist.
  return NextResponse.json({
    ok: true,
    polled: 0,
    message:
      "IMAP credentials present. Next step: add imapflow fetch of UNSEEN in requests@ mailbox and call ingestInboundEmail per message.",
  });
}
