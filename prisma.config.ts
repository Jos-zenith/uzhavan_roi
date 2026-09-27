import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "db/schema.prisma",
  migrations: {
    path: "db/migrations",
    seed: "tsx db/seed.ts",
  },
  datasource: {
    url: process.env.TELEMETRY_DB_URL ?? "file:./db/dev.db",
  },
});
