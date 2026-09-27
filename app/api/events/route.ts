import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { ingestBatchSchema } from "@/lib/telemetry/schema"

/** Ingest endpoint for the telemetry SDK. Idempotent on `eventId`. */
export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 })
  }
  const parsed = ingestBatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Events do not match the common schema", issues: parsed.error.issues }, { status: 400 })
  }

  const events = parsed.data.events
  // SQLite's createMany can't skip duplicates, so filter retried events first.
  const existing = await db.event.findMany({
    where: { eventId: { in: events.map((e) => e.eventId) } },
    select: { eventId: true },
  })
  const seen = new Set(existing.map((e) => e.eventId))
  const fresh = events.filter((e, i) => !seen.has(e.eventId) && events.findIndex((x) => x.eventId === e.eventId) === i)

  if (fresh.length > 0) {
    await db.event.createMany({
      data: fresh.map((e) => ({ ...e, timestamp: new Date(e.timestamp), context: JSON.stringify(e.context) })),
    })
  }
  return NextResponse.json({ accepted: fresh.length, duplicates: events.length - fresh.length })
}
