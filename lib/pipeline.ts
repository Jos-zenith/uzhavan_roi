import { db } from "@/lib/db"

const DAY = 86_400_000

/** Operational health of the telemetry pipeline, computed from the warehouse. */
export async function pipelineStatus(now = new Date()) {
  const [total, last24h, quarantined, activeFlags, lastReceived, late] = await Promise.all([
    db.event.count(),
    db.event.count({ where: { receivedAt: { gte: new Date(now.getTime() - DAY) } } }),
    db.event.groupBy({ by: ["featureFlag"], where: { quarantined: true }, _count: { _all: true } }),
    db.event.groupBy({
      by: ["featureFlag"],
      where: { quarantined: false, featureFlag: { not: null }, timestamp: { gte: new Date(now.getTime() - 7 * DAY) } },
    }),
    db.event.findFirst({ orderBy: { receivedAt: "desc" }, select: { receivedAt: true } }),
    // Events that reached us an hour or more after they happened: phones that were offline.
    // Analytics always uses event time, so these still land in the right day and arm.
    db.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM "Event"
      WHERE "receivedAt" > now() - interval '7 days' AND "receivedAt" - "timestamp" >= interval '1 hour'`,
  ])
  return {
    total,
    last24h,
    quarantinedEvents: quarantined.reduce((a, g) => a + g._count._all, 0),
    quarantinedFlags: quarantined.length,
    activeFlags7d: activeFlags.length,
    lastReceivedAt: lastReceived?.receivedAt ?? null,
    lateArrivals7d: late[0]?.n ?? 0,
  }
}

export function relativeTime(from: Date, now = new Date()): string {
  const s = Math.max(0, Math.round((now.getTime() - from.getTime()) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}
