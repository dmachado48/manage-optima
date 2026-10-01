import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Keep Prisma out of the Turbopack bundle so `prisma generate` is picked up
  // after a server restart (avoids stale DMMF → "Unknown argument `active`").
  serverExternalPackages: ["@prisma/client", "prisma"],
  turbopack: {
    root: path.join(__dirname),
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
