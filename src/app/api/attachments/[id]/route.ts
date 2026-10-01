import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { absoluteUploadPath } from "@/lib/uploads";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  const attachment = await prisma.requestAttachment.findUnique({
    where: { id },
    include: {
      request: {
        select: {
          clientId: true,
          client: { select: { kanbanShareToken: true } },
        },
      },
    },
  });
  if (!attachment) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  const session = await auth();
  const isAdmin = session?.user?.role === "admin";
  const isPortal =
    !!token && token === attachment.request.client.kanbanShareToken;

  if (!isAdmin && !isPortal) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const filePath = absoluteUploadPath(attachment.storageKey);
    const data = await readFile(filePath);
    return new NextResponse(data, {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Length": String(attachment.sizeBytes),
        "Content-Disposition": `inline; filename="${encodeURIComponent(attachment.fileName)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Ficheiro em falta" }, { status: 404 });
  }
}
