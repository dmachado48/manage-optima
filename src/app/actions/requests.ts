"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { RequestStatus, RequestSource } from "@prisma/client";

export async function createRequest(formData: FormData) {
  await requireAdmin();
  const clientId = String(formData.get("clientId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const source = (String(formData.get("source") ?? "manual") ||
    "manual") as RequestSource;

  if (!clientId || !title) throw new Error("Cliente e título obrigatórios");

  await prisma.request.create({
    data: {
      clientId,
      title,
      description,
      source,
      status: "requested",
    },
  });

  revalidatePath("/maintenance");
  revalidatePath("/pipeline");
  revalidatePath("/clients");
  revalidatePath("/");
}

export async function updateRequestStatus(
  requestId: string,
  status: RequestStatus,
) {
  await requireAdmin();
  const updated = await prisma.request.update({
    where: { id: requestId },
    data: { status },
  });
  revalidatePath("/maintenance");
  revalidatePath("/pipeline");
  revalidatePath(`/clients/${updated.clientId}`);
  revalidatePath(`/clients/${updated.clientId}/trabalhos`);
  revalidatePath("/clients");
  revalidatePath("/");
}

export async function moveRequest(requestId: string, formData: FormData) {
  const status = String(formData.get("status") ?? "") as RequestStatus;
  if (
    !["requested", "in_progress", "waiting_on_client", "done"].includes(status)
  ) {
    throw new Error("Estado inválido");
  }
  await updateRequestStatus(requestId, status);
}
