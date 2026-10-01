"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function createPortalRequest(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!token || !title) throw new Error("Título obrigatório");

  const client = await prisma.client.findUnique({
    where: { kanbanShareToken: token },
  });
  if (!client) throw new Error("Link inválido ou expirado");

  await prisma.request.create({
    data: {
      clientId: client.id,
      title,
      description,
      source: "portal",
      status: "requested",
    },
  });

  revalidatePath(`/k/${token}`);
  revalidatePath("/pipeline");
  revalidatePath(`/clients/${client.id}`);
  revalidatePath(`/clients/${client.id}/trabalhos`);
  revalidatePath("/");
}
