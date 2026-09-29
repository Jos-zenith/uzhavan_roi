import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { registeredFlags, releaseQuarantine } from "@/lib/registry"
import { ingestBatchSchema } from "@/lib/telemetry/schema"

const MAX_BODY_BYTES = 2 * 1024 * 1024 // after decompression

class BodyError extends Error {}

/** JSON body, gzip-decoded when the SDK compressed it (it does whenever the browser can). */
async function readBody(req: Request): Promise<unknown> {
  const raw = new Uint8Array(await req.arrayBuffer())
  let bytes = raw
  if ((req.headers.get("content-encoding") ?? "").toLowerCase() === "gzip") {
    try {
      const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("gzip"))
      bytes = new Uint8Array(await new Response(stream).arrayBuffer())
    } catch {
      throw new BodyError("Body is marked gzip but isn't valid gzip")
    }
  }
  if (bytes.length > MAX_BODY_BYTES) throw new BodyError("Batch too large; send at most 500 events per request")
  return JSON.parse(new TextDecoder().decode(bytes))
}

/**
 * Ingest endpoint for the telemetry SDK. Validates against the common schema,
 * is idempotent on `eventId`, and quarantines events whose feature flag has
 * no registered spec.
 */
export async function POST(req: Request) {
  let body: unknown
  try {
    body = await readBody(req)
  } catch (err) {
    return NextResponse.json({ error: err instanceof BodyError ? err.message : "Body must be JSON" }, { status: 400 })
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

  const flags = fresh.map((e) => e.featureFlag).filter((f): f is string => !!f)
  const registered = await registeredFlags(flags)
  const isQuarantined = (flag: string | null) => !!flag && !registered.has(flag)
  const quarantinedFlags = [...new Set(flags.filter(isQuarantined))]

  if (fresh.length > 0) {
    await db.event.createMany({
      data: fresh.map((e) => ({
        ...e,
        timestamp: new Date(e.timestamp),
        context: JSON.stringify(e.context),
        quarantined: isQuarantined(e.featureFlag),
      })),
    })
  }
  // A spec registered while this batch was in flight has already run its
  // release, so release again for any flag that is registered by now.
  if (quarantinedFlags.length > 0) {
    const nowRegistered = await registeredFlags(quarantinedFlags)
    await Promise.all([...nowRegistered].map(releaseQuarantine))
  }

  return NextResponse.json({
    accepted: fresh.length,
    quarantined: fresh.filter((e) => isQuarantined(e.featureFlag)).length,
    quarantinedFlags,
    duplicates: events.length - fresh.length,
  })
}
