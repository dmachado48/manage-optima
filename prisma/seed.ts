import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { WEBITON_PROPOSAL_TEMPLATE_HTML } from "../src/lib/proposal-template";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "admin@webiton.pt").toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "optima";
  const passwordHash = await hash(password, 10);

  const admin = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: "admin", name: "Webiton Admin" },
    create: {
      email,
      name: "Webiton Admin",
      role: "admin",
      passwordHash,
    },
  });

  const client = await prisma.client.upsert({
    where: { id: "seed-client-exemplo" },
    update: {},
    create: {
      id: "seed-client-exemplo",
      name: "Cliente Exemplo",
      email: "contacto@cliente-exemplo.pt",
      domain: "cliente-exemplo.pt",
      notes: "Cliente de demonstração da Phase 1",
    },
  });

  const existingContract = await prisma.contract.findFirst({
    where: { clientId: client.id, active: true },
  });
  if (!existingContract) {
    await prisma.contract.create({
      data: {
        clientId: client.id,
        type: "pack",
        hoursTotal: 10,
        hoursUsed: 0,
        active: true,
        startsAt: new Date(),
      },
    });
  }

  const requestCount = await prisma.request.count({
    where: { clientId: client.id },
  });
  if (requestCount === 0) {
    await prisma.request.createMany({
      data: [
        {
          clientId: client.id,
          title: "Responder pedido em espera — cliente exemplo",
          status: "waiting_on_client",
          source: "manual",
        },
        {
          clientId: client.id,
          title: "Corrigir formulário de contacto",
          status: "in_progress",
          source: "email",
        },
        {
          clientId: client.id,
          title: "Atualizar texto da homepage",
          status: "requested",
          source: "portal",
        },
      ],
    });
  }

  await prisma.dailyPlanItem.deleteMany({
    where: { title: "Registar intervenções da manhã" },
  });
  await prisma.dailyPlanItem.create({
    data: {
      date: new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z"),
      title: "Registar intervenções da manhã",
      done: false,
    },
  });

  const existingTemplate = await prisma.proposalTemplate.findFirst({
    where: { name: "Webiton Classic" },
  });
  if (!existingTemplate) {
    await prisma.proposalTemplate.create({
      data: {
        name: "Webiton Classic",
        description: "Layout HTML branded Webiton para propostas",
        htmlLayout: WEBITON_PROPOSAL_TEMPLATE_HTML,
        active: true,
      },
    });
  } else {
    await prisma.proposalTemplate.update({
      where: { id: existingTemplate.id },
      data: { htmlLayout: WEBITON_PROPOSAL_TEMPLATE_HTML, active: true },
    });
  }

  console.log("Seed OK:", { admin: admin.email, client: client.name });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
