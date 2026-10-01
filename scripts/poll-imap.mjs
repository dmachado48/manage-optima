#!/usr/bin/env node

import { fileURLToPath } from "node:url";

import { config } from "dotenv";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
config({ path: `${projectRoot}/.env`, quiet: true });

const secret = process.env.CRON_SECRET?.trim();
if (!secret) {
  console.error(`${new Date().toISOString()} CRON_SECRET não configurado`);
  process.exitCode = 1;
} else {
  const baseUrl = process.env.AUTH_URL || "https://manage.webiton.pt";
  const url = new URL("/api/cron/imap-poll", baseUrl);

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(120_000),
    });
    const body = await response.text();

    if (!response.ok) {
      console.error(
        `${new Date().toISOString()} IMAP cron HTTP ${response.status}: ${body}`,
      );
      process.exitCode = 1;
    } else {
      const result = JSON.parse(body);
      if (result.processed > 0 || result.failed > 0) {
        console.log(
          `${new Date().toISOString()} IMAP: ${result.processed} processado(s), ${result.failed} erro(s)`,
        );
      }
    }
  } catch (error) {
    console.error(
      `${new Date().toISOString()} IMAP cron falhou:`,
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
  }
}
