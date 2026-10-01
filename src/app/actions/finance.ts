"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function upsertFinanceYear(formData: FormData) {
  await requireAdmin();
  const year = Number(formData.get("year") ?? new Date().getFullYear());
  const annualGoal = Number(formData.get("annualGoal") ?? 0);
  const q1 = Number(formData.get("q1") ?? 0);
  const q2 = Number(formData.get("q2") ?? 0);
  const q3 = Number(formData.get("q3") ?? 0);
  const q4 = Number(formData.get("q4") ?? 0);

  await prisma.$transaction(async (tx) => {
    const fy = await tx.financeYear.upsert({
      where: { year },
      create: { year, annualGoal },
      update: { annualGoal },
    });
    for (const [quarter, target] of [
      [1, q1],
      [2, q2],
      [3, q3],
      [4, q4],
    ] as const) {
      await tx.financeQuarter.upsert({
        where: { yearId_quarter: { yearId: fy.id, quarter } },
        create: { yearId: fy.id, quarter, target },
        update: { target },
      });
    }
  });

  revalidatePath("/settings");
}
