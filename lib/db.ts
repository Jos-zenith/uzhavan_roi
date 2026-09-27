import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3"
import { PrismaClient } from "./generated/tnimpact/client"

const url = process.env.TELEMETRY_DB_URL ?? "file:./db/dev.db"

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const db =
  globalForPrisma.prisma ?? new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db
