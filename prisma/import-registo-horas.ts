/**
 * One-shot import of historical hours / closed projects from
 * prisma/data/registo-horas.csv into Optima Desk.
 *
 * Rules (confirmed):
 * - Round 15 min → 30 min
 * - Clients + history only (no contracts)
 * - Closed projects without amount → Proposal amountEur = 0
 *
 * Usage:
 *   npx tsx prisma/import-registo-horas.ts --dry-run
 *   npx tsx prisma/import-registo-horas.ts
 */
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { resolve } from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes("--dry-run");
const CSV_PATH = resolve(__dirname, "data/registo-horas.csv");
const IMPORT_TAG = "[import:registo-horas]";
const TITLE_MAX = 180;

function clipTitle(title: string): string {
  const t = title.replace(/\s+/g, " ").trim();
  if (t.length <= TITLE_MAX) return t;
  return `${t.slice(0, TITLE_MAX - 1)}…`;
}

const CLIENT_ALIASES: Record<string, string> = {
  hora: "Hora",
  "farmacia alhandra": "Farmacia Alhandra",
  poupaqui: "Poupaqui",
};

type CsvRow = {
  line: number;
  periodOrStamp: string;
  taskDesc: string;
  agreedValue: string;
  time: string;
  client: string;
  requestedBy: string;
  kind: string;
  projectTitle: string;
  projectDesc: string;
  who: string;
  invoiceDate: string;
  invoice: string;
  status: string;
  stamp: string;
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      // ignore
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function normalizeClientName(raw: string): string {
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (!trimmed) return trimmed;
  const alias = CLIENT_ALIASES[trimmed.toLowerCase()];
  if (alias) return alias;
  // Title-case single-word lowercase brands lightly: keep known casing otherwise
  if (trimmed === trimmed.toLowerCase() && trimmed.includes(" ")) {
    return trimmed
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  if (trimmed === trimmed.toLowerCase() && trimmed.length > 1) {
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  }
  return trimmed;
}

function parseMoney(raw: string): number | null {
  const v = raw.replace(/€/g, "").replace(/\s/g, "").trim();
  if (!v) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function parseTimeToMinutes(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  if (t === "0") return 0;
  const m = /^(\d+):(\d{2}):(\d{2})$/.exec(t);
  if (m) {
    return Number(m[1]) * 60 + Number(m[2]);
  }
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** Align to Optima 30-min slots: 15 → 30; others already multiples stay. */
function roundToBillingMinutes(minutes: number): number {
  if (minutes <= 0) return 0;
  if (minutes === 15) return 30;
  if (minutes % 30 === 0) return minutes;
  return Math.ceil(minutes / 30) * 30;
}

function parseDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  const formats: Array<(v: string) => Date | null> = [
    (v) => {
      const m = /^(\d{4})\/(\d{2})\/(\d{2})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(v);
      if (!m) return null;
      return new Date(
        Date.UTC(
          Number(m[1]),
          Number(m[2]) - 1,
          Number(m[3]),
          Number(m[4] ?? 12),
          Number(m[5] ?? 0),
          Number(m[6] ?? 0),
        ),
      );
    },
    (v) => {
      const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
      if (!m) return null;
      return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12, 0, 0));
    },
  ];
  for (const f of formats) {
    const d = f(s);
    if (d && !Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function importKey(parts: string[]): string {
  return createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 12);
}

function classify(row: CsvRow): "hours" | "project" | "skip" {
  const kind = row.kind.trim();
  const money = parseMoney(row.agreedValue);
  const minutes = parseTimeToMinutes(row.time);

  if (kind === "Projeto Fechado") return "project";
  if (kind === "Registo de Horas") {
    // Domain migration billed as € without time → project
    if (money != null && (minutes == null || minutes === 0) && !row.time.trim()) {
      return "project";
    }
    return "hours";
  }
  // Empty kind: infer
  if (money != null && (minutes == null || minutes === 0 || !row.time.trim())) {
    return "project";
  }
  if (minutes != null || row.time.trim()) return "hours";
  if (!row.client.trim() && !row.taskDesc.trim()) return "skip";
  return "skip";
}

function loadRows(): CsvRow[] {
  const text = readFileSync(CSV_PATH, "utf8");
  const matrix = parseCsv(text);
  const [, ...data] = matrix;
  const rows: CsvRow[] = [];

  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    while (r.length < 15) r.push("");
    const row: CsvRow = {
      line: i + 2,
      periodOrStamp: (r[0] ?? "").trim(),
      taskDesc: (r[1] ?? "").trim(),
      agreedValue: (r[2] ?? "").trim(),
      time: (r[3] ?? "").trim(),
      client: (r[4] ?? "").trim(),
      requestedBy: (r[5] ?? "").trim(),
      kind: (r[6] ?? "").trim(),
      projectTitle: (r[7] ?? "").trim(),
      projectDesc: (r[8] ?? "").trim(),
      who: (r[10] ?? "").trim(),
      invoiceDate: (r[11] ?? "").trim(),
      invoice: (r[12] ?? "").trim(),
      status: (r[13] ?? "").trim(),
      stamp: (r[14] ?? "").trim(),
    };
    if (
      !row.periodOrStamp &&
      !row.taskDesc &&
      !row.agreedValue &&
      !row.time &&
      !row.client &&
      !row.kind &&
      !row.stamp
    ) {
      continue;
    }
    rows.push(row);
  }
  return rows;
}

async function main() {
  const rows = loadRows();
  console.log(`CSV: ${CSV_PATH}`);
  console.log(`Rows: ${rows.length} · mode: ${DRY_RUN ? "DRY-RUN" : "APPLY"}`);

  const adminEmail = (process.env.ADMIN_EMAIL ?? "admin@webiton.pt").toLowerCase();
  const admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!admin && !DRY_RUN) {
    throw new Error(`Admin user not found: ${adminEmail}. Run db:seed first.`);
  }

  const clientCache = new Map<string, string>(); // name → id
  const existingClients = await prisma.client.findMany({ select: { id: true, name: true } });
  for (const c of existingClients) {
    clientCache.set(c.name.toLowerCase(), c.id);
  }

  async function ensureClient(name: string): Promise<string> {
    const key = name.toLowerCase();
    const cached = clientCache.get(key);
    if (cached) return cached;

    if (DRY_RUN) {
      const fake = `dry-${key}`;
      clientCache.set(key, fake);
      console.log(`  [dry] Client create: ${name}`);
      return fake;
    }

    const created = await prisma.client.create({
      data: { name, notes: `${IMPORT_TAG} histórico importado` },
    });
    clientCache.set(key, created.id);
    console.log(`  Client create: ${name}`);
    return created.id;
  }

  let createdClients = 0;
  let createdRequests = 0;
  let createdInterventions = 0;
  let createdProjects = 0;
  let createdProposals = 0;
  let skipped = 0;
  let skippedDup = 0;

  for (const row of rows) {
    const clientName = normalizeClientName(row.client);
    if (!clientName) {
      console.warn(`L${row.line}: skip — sem cliente`);
      skipped++;
      continue;
    }

    const type = classify(row);
    if (type === "skip") {
      skipped++;
      continue;
    }

    const performedAt =
      parseDate(row.stamp) ||
      parseDate(row.periodOrStamp) ||
      new Date("2024-01-01T12:00:00.000Z");

    const beforeClients = clientCache.size;
    const clientId = await ensureClient(clientName);
    if (clientCache.size > beforeClients) createdClients++;

    if (type === "hours") {
      const rawMinutes = parseTimeToMinutes(row.time);
      const title = row.taskDesc || "Intervenção importada";
      const key = importKey([
        "hours",
        clientName,
        performedAt.toISOString(),
        title,
        row.time,
        String(rawMinutes ?? ""),
      ]);
      const tag = `${IMPORT_TAG} ${key}`;

      const already =
        !DRY_RUN &&
        (await prisma.intervention.findFirst({
          where: { note: { contains: key } },
          select: { id: true },
        }));
      if (already) {
        skippedDup++;
        continue;
      }

      // Also skip if we already imported a zero-minute request with this key
      const alreadyReq =
        !DRY_RUN &&
        (await prisma.request.findFirst({
          where: { description: { contains: key } },
          select: { id: true },
        }));
      if (alreadyReq && (rawMinutes == null || rawMinutes === 0)) {
        skippedDup++;
        continue;
      }

      const minutes =
        rawMinutes == null ? null : roundToBillingMinutes(rawMinutes);

      const descParts = [
        tag,
        row.requestedBy ? `Pedido por: ${row.requestedBy}` : null,
        row.who ? `Who: ${row.who}` : null,
        rawMinutes === 15 ? "Tempo original: 15 min (arredondado a 30)" : null,
      ].filter(Boolean);

      if (DRY_RUN) {
        console.log(
          `  [dry] hours L${row.line} ${clientName} ${minutes ?? 0}min — ${title.slice(0, 50)}`,
        );
        createdRequests++;
        if (minutes && minutes > 0) createdInterventions++;
        continue;
      }

      const request = await prisma.request.create({
        data: {
          clientId,
          title: clipTitle(title),
          description: [...descParts, title.length > TITLE_MAX ? `Título completo:\n${title}` : null]
            .filter(Boolean)
            .join("\n"),
          status: "done",
          source: "manual",
          createdAt: performedAt,
          updatedAt: performedAt,
        },
      });
      createdRequests++;

      if (minutes && minutes > 0) {
        await prisma.intervention.create({
          data: {
            clientId,
            requestId: request.id,
            minutes,
            note: [tag, title].join("\n"),
            performedAt,
            createdById: admin!.id,
            createdAt: performedAt,
            updatedAt: performedAt,
          },
        });
        createdInterventions++;
      }
      continue;
    }

    // project
    const title =
      row.projectTitle.trim() || row.taskDesc.trim() || "Projeto importado";
    const money = parseMoney(row.agreedValue) ?? 0;
    const bodyParts = [
      `${IMPORT_TAG}`,
      row.projectDesc || row.taskDesc || "",
      row.who ? `Who: ${row.who}` : null,
      row.invoice ? `Fatura: ${row.invoice}` : null,
      row.invoiceDate ? `Data faturação: ${row.invoiceDate}` : null,
      row.status ? `Estado CSV: ${row.status}` : null,
      money === 0 && row.agreedValue.trim() === ""
        ? "Valor: 0€ (preencher depois)"
        : null,
    ].filter(Boolean);

    const key = importKey([
      "project",
      clientName,
      performedAt.toISOString(),
      title,
      String(money),
    ]);
    const tag = `${IMPORT_TAG} ${key}`;

    const alreadyProj =
      !DRY_RUN &&
      (await prisma.proposal.findFirst({
        where: { body: { contains: key } },
        select: { id: true },
      }));
    if (alreadyProj) {
      skippedDup++;
      // Still may need hours side for dual rows (e.g. SalesForce 12h)
    } else if (DRY_RUN) {
      console.log(
        `  [dry] project L${row.line} ${clientName} ${money}€ — ${title.slice(0, 50)}`,
      );
      createdProjects++;
      createdProposals++;
    } else {
      const project = await prisma.project.create({
        data: {
          clientId,
          title: clipTitle(title),
          status: "delivered",
          createdAt: performedAt,
          updatedAt: performedAt,
        },
      });
      createdProjects++;

      await prisma.proposal.create({
        data: {
          projectId: project.id,
          title: clipTitle(title),
          body: [tag, ...bodyParts].join("\n\n"),
          amountEur: money,
          status: "approved",
          decidedAt: performedAt,
          sentAt: performedAt,
          createdAt: performedAt,
          updatedAt: performedAt,
        },
      });
      createdProposals++;
    }

    // Dual: Projeto Fechado that also logged hours (SalesForce 12h)
    const rawMinutes = parseTimeToMinutes(row.time);
    if (rawMinutes && rawMinutes > 0) {
      const minutes = roundToBillingMinutes(rawMinutes);
      const hoursTitle = row.taskDesc || title;
      const hoursKey = importKey([
        "hours",
        clientName,
        performedAt.toISOString(),
        hoursTitle,
        row.time,
        String(rawMinutes),
      ]);
      const hoursTag = `${IMPORT_TAG} ${hoursKey}`;

      const alreadyHours =
        !DRY_RUN &&
        (await prisma.intervention.findFirst({
          where: { note: { contains: hoursKey } },
          select: { id: true },
        }));

      if (alreadyHours) {
        skippedDup++;
      } else if (DRY_RUN) {
        console.log(
          `  [dry] hours(from project) L${row.line} ${clientName} ${minutes}min`,
        );
        createdRequests++;
        createdInterventions++;
      } else {
        const request = await prisma.request.create({
          data: {
            clientId,
            title: clipTitle(hoursTitle),
            description: `${hoursTag}\nHoras associadas a projeto fechado importado`,
            status: "done",
            source: "manual",
            createdAt: performedAt,
            updatedAt: performedAt,
          },
        });
        createdRequests++;
        await prisma.intervention.create({
          data: {
            clientId,
            requestId: request.id,
            minutes,
            note: [hoursTag, hoursTitle].join("\n"),
            performedAt,
            createdById: admin!.id,
            createdAt: performedAt,
            updatedAt: performedAt,
          },
        });
        createdInterventions++;
      }
    }
  }

  console.log("\n=== Resultado ===");
  console.log({
    dryRun: DRY_RUN,
    createdClients,
    createdRequests,
    createdInterventions,
    createdProjects,
    createdProposals,
    skipped,
    skippedDup,
    uniqueClientsInCache: [...clientCache.keys()].sort(),
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
