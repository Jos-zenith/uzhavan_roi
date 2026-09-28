import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "./generated/tnimpact/client"

function createClient() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString?.startsWith("postgres")) {
    throw new Error(
      "DATABASE_URL must be a direct postgres:// connection string. " +
        "Locally: run `npx prisma dev` and use its TCP URL. On Vercel: add a Postgres database under Storage.",
    )
  }
  // Each serverless instance opens its own pool, so keep it small. Pages fire many
  // queries in parallel; a capped pool queues them instead of opening a connection
  // per query (which exhausts hosted limits and crashes `prisma dev` locally).
  const max = Number(process.env.DATABASE_POOL_MAX) || 3
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max }) })
}

// One client per process; reused across hot reloads in dev and warm invocations on Vercel.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const db = globalForPrisma.prisma ?? createClient()

globalForPrisma.prisma = db
