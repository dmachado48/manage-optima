import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Single shared PrismaClient for the Node process.
 * Avoid recreating on HMR — that exhausts MySQL `max_connections`.
 * Schema gaps (e.g. PlatformConfig) are handled via `$queryRaw` fallbacks.
 */
function createClient() {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
