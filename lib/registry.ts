import { db } from "@/lib/db"

/**
 * Event registry: the Feature table is the list of flags allowed into
 * analytics. Events carrying any other flag are stored but quarantined, so a
 * team that registers its spec late loses no data, and nothing unowned
 * leaks into ROI numbers in the meantime.
 */

/** Spread into every analytics `where` so quarantined events never reach a KPI. */
export const ADMITTED = { quarantined: false } as const

/** Which of these flags have a registered feature spec. */
export async function registeredFlags(flags: string[]): Promise<Set<string>> {
  if (flags.length === 0) return new Set()
  const rows = await db.feature.findMany({ where: { key: { in: [...new Set(flags)] } }, select: { key: true } })
  return new Set(rows.map((r) => r.key))
}

/** Release a flag's quarantined events once its spec is registered. Returns how many were recovered. */
export async function releaseQuarantine(flag: string): Promise<number> {
  const { count } = await db.event.updateMany({ where: { featureFlag: flag, quarantined: true }, data: { quarantined: false } })
  return count
}

export type QuarantinedFlag = { flag: string; events: number; users: number; firstSeen: Date; lastSeen: Date }

export async function quarantinedFlags(): Promise<QuarantinedFlag[]> {
  const groups = await db.event.groupBy({
    by: ["featureFlag"],
    where: { quarantined: true },
    _count: { _all: true },
    _min: { timestamp: true },
    _max: { timestamp: true },
  })
  return Promise.all(
    groups
      .filter((g) => g.featureFlag)
      .map(async (g) => {
        const users = await db.event.findMany({
          where: { quarantined: true, featureFlag: g.featureFlag },
          distinct: ["userId"],
          select: { userId: true },
        })
        return {
          flag: g.featureFlag!,
          events: g._count._all,
          users: users.length,
          firstSeen: g._min.timestamp!,
          lastSeen: g._max.timestamp!,
        }
      }),
  )
}
