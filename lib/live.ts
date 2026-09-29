import { db } from "@/lib/db"

/** What the live stream pushes: the newest events, and every running test's group sizes. */
export type LiveSnapshot = {
  total: number
  recent: {
    id: string
    action: string
    flag: string | null
    variant: string | null
    district: string | null
    timestamp: string
    receivedAt: string
    quarantined: boolean
  }[]
  tests: {
    key: string
    name: string
    control: number
    treatment: number
    minSample: number
    treatmentShare: number
    killed: boolean
  }[]
}

export async function liveSnapshot(): Promise<LiveSnapshot> {
  const [total, recent, features, exposed] = await Promise.all([
    db.event.count(),
    db.event.findMany({
      orderBy: { receivedAt: "desc" },
      take: 10,
      select: { id: true, action: true, featureFlag: true, variant: true, context: true, timestamp: true, receivedAt: true, quarantined: true },
    }),
    db.feature.findMany({
      where: { status: "SHIPPED", attributionMethod: { not: "PRE_POST" } },
      select: { key: true, name: true, minSamplePerArm: true, treatmentShare: true, killedAt: true, decision: true },
      orderBy: { releasedAt: "desc" },
    }),
    // Distinct farmers exposed per flag and group. One query, counted in the database.
    db.$queryRaw<{ flag: string; variant: string; n: number }[]>`
      SELECT "featureFlag" AS flag, variant, count(DISTINCT "userId")::int AS n
      FROM "Event"
      WHERE action = 'feature_exposed' AND quarantined = false AND variant IN ('control', 'treatment')
      GROUP BY "featureFlag", variant`,
  ])
  const count = (flag: string, variant: string) => exposed.find((e) => e.flag === flag && e.variant === variant)?.n ?? 0
  return {
    total,
    recent: recent.map((e) => ({
      id: e.id,
      action: e.action,
      flag: e.featureFlag,
      variant: e.variant,
      district: districtOf(e.context),
      timestamp: e.timestamp.toISOString(),
      receivedAt: e.receivedAt.toISOString(),
      quarantined: e.quarantined,
    })),
    tests: features
      .filter((f) => !f.decision) // decided tests are no longer running
      .map((f) => ({
        key: f.key,
        name: f.name,
        control: count(f.key, "control"),
        treatment: count(f.key, "treatment"),
        minSample: f.minSamplePerArm,
        treatmentShare: f.treatmentShare,
        killed: !!f.killedAt,
      })),
  }
}

function districtOf(context: string): string | null {
  try {
    const d = JSON.parse(context)?.district
    return typeof d === "string" ? d : null
  } catch {
    return null
  }
}
