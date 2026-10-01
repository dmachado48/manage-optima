import { readFile } from "node:fs/promises";

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { absoluteUploadPath } from "@/lib/uploads";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const attachment = await prisma.inboundEmailAttachment.findUnique({
    where: { id },
  });
  if (!attachment) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  try {
    const data = await readFile(absoluteUploadPath(attachment.storageKey));
    const canRenderInline =
      attachment.mimeType.startsWith("image/") ||
      attachment.mimeType === "application/pdf" ||
      attachment.mimeType === "text/plain";

    return new NextResponse(data, {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Length": String(attachment.sizeBytes),
        "Content-Disposition": `${canRenderInline ? "inline" : "attachment"}; filename="${encodeURIComponent(attachment.fileName)}"`,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Ficheiro em falta" }, { status: 404 });
  }
}
