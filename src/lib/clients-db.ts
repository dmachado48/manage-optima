import { Prisma } from "@prisma/client";
import type { ClientRelation } from "@prisma/client";
import { parseClientRelation } from "@/lib/clients";
import { prisma } from "@/lib/prisma";

/** Raw write — survives Turbopack/HMR holding a stale Prisma Client DMMF. */
export async function setClientRelation(
  clientId: string,
  relation: ClientRelation,
) {
  await prisma.$executeRaw`
    UPDATE \`Client\`
    SET \`relation\` = ${relation}
    WHERE \`id\` = ${clientId}
  `;
}

export async function loadClientRelation(
  clientId: string,
): Promise<ClientRelation> {
  const rows = await prisma.$queryRaw<Array<{ relation: string }>>`
    SELECT \`relation\` FROM \`Client\` WHERE \`id\` = ${clientId} LIMIT 1
  `;
  return parseClientRelation(rows[0]?.relation);
}

export async function loadClientRelations(
  clientIds?: string[],
): Promise<Map<string, ClientRelation>> {
  const rows =
    clientIds && clientIds.length > 0
      ? await prisma.$queryRaw<Array<{ id: string; relation: string }>>`
          SELECT \`id\`, \`relation\` FROM \`Client\`
          WHERE \`id\` IN (${Prisma.join(clientIds)})
        `
      : await prisma.$queryRaw<Array<{ id: string; relation: string }>>`
          SELECT \`id\`, \`relation\` FROM \`Client\`
        `;

  return new Map(
    rows.map((r) => [r.id, parseClientRelation(r.relation)] as const),
  );
}
