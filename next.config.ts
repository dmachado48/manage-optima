import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Keep Prisma out of the Turbopack bundle so `prisma generate` is picked up
  // after a server restart (avoids stale DMMF → "Unknown argument `active`").
  serverExternalPackages: [
    "@prisma/client",
    "imapflow",
    "mailparser",
    "prisma",
  ],
  turbopack: {
    root: path.join(__dirname),
  },
  experimental: {
    // Shared cPanel limits process/thread creation. Keep build-time page-data
    // collection to one worker so Turbopack does not hit EAGAIN / SIGABRT.
    cpus: 1,
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
