import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "db/schema.prisma",
  migrations: {
    path: "db/migrations",
    seed: "tsx db/seed.ts",
  },
  datasource: {
    // CLI only (migrate, seed): prefer a direct connection. Vercel's Neon integration sets
    // DATABASE_URL (pooled, used by the app at runtime) and DATABASE_URL_UNPOOLED (direct).
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "",
  },
});
