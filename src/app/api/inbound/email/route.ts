import { NextResponse } from "next/server";
import { ingestInboundEmail } from "@/lib/email-ingest";
import { revalidatePath } from "next/cache";

/**
 * Webhook for inbound email (forwarder / Mailgun / cPanel pipe).
 * Auth: Authorization: Bearer $INBOUND_EMAIL_SECRET
 *
 * Body JSON:
 * {
 *   messageId, fromAddress, fromName?, toAddress?, subject, bodyText, receivedAt?
 * }
 */
export async function POST(request: Request) {
  const secret = process.env.INBOUND_EMAIL_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "INBOUND_EMAIL_SECRET not configured" },
      { status: 503 },
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const messageId = String(body.messageId ?? "").trim();
  const fromAddress = String(body.fromAddress ?? body.from ?? "").trim();
  const subject = String(body.subject ?? "").trim();
  const bodyText = String(body.bodyText ?? body.text ?? "").trim();
  const toAddress = String(body.toAddress ?? body.to ?? "").trim() || null;
  const fromName = String(body.fromName ?? "").trim() || null;

  if (!messageId || !fromAddress || !subject) {
    return NextResponse.json(
      { error: "messageId, fromAddress and subject required" },
      { status: 400 },
    );
  }

  const result = await ingestInboundEmail({
    messageId,
    fromAddress,
    fromName,
    toAddress,
    subject,
    bodyText: bodyText || subject,
    receivedAt: body.receivedAt ? new Date(String(body.receivedAt)) : undefined,
  });

  revalidatePath("/inbox");
  revalidatePath("/pipeline");
  if (result.clientId) revalidatePath(`/clients/${result.clientId}`);
  revalidatePath("/");

  return NextResponse.json(result);
}
