#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";

config({ quiet: true });

const prisma = new PrismaClient();

try {
  const inbound = await prisma.inboundEmail.findMany({
    where: { requestId: { not: null } },
    orderBy: { receivedAt: "asc" },
  });
  let created = 0;
  let aliases = 0;

  for (const email of inbound) {
    if (email.matchedClientId) {
      await prisma.clientEmailAlias.upsert({
        where: { email: email.fromAddress.toLowerCase() },
        update: { clientId: email.matchedClientId },
        create: {
          clientId: email.matchedClientId,
          email: email.fromAddress.toLowerCase(),
        },
      });
      aliases += 1;
    }

    const existing = await prisma.requestMessage.findUnique({
      where: { emailMessageId: email.messageId },
      select: { id: true },
    });
    if (existing || !email.requestId) continue;

    await prisma.requestMessage.create({
      data: {
        requestId: email.requestId,
        author: "client",
        body: email.bodyText,
        bodyHtml: email.bodyHtml,
        emailMessageId: email.messageId,
        createdAt: email.receivedAt,
      },
    });
    created += 1;
  }

  console.log(`Email threads: ${created} mensagem(ns) recuperada(s)`);
  console.log(`Remetentes aprendidos: ${aliases}`);
} finally {
  await prisma.$disconnect();
}
