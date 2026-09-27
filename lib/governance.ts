import { db } from "@/lib/db"
import { parseGoals, type FeatureStatus } from "@/lib/domain"
import type { FeatureWithSpec } from "@/lib/analytics/report"

/**
 * Release gates. A feature only moves forward when every check for its next
 * stage passes — this is what enforces "no ship now, measure later".
 */

export type Check = { label: string; ok: boolean; detail?: string }
export type Gate = { next: FeatureStatus | null; checks: Check[] }

const NEXT: Partial<Record<FeatureStatus, FeatureStatus>> = {
  DRAFT: "SPEC_APPROVED",
  SPEC_APPROVED: "IN_DEVELOPMENT",
  IN_DEVELOPMENT: "SHIPPED",
}

export function specChecks(f: FeatureWithSpec): Check[] {
  const goals = parseGoals(f.goals)
  return [
    { label: "1–3 business goals declared", ok: goals.length >= 1 && goals.length <= 3, detail: `${goals.length} declared` },
    { label: "1–3 KPIs from the shared catalogue", ok: f.kpis.length >= 1 && f.kpis.length <= 3, detail: `${f.kpis.length} mapped` },
    {
      label: "Every KPI has a baseline and a non-zero target delta",
      ok: f.kpis.length > 0 && f.kpis.every((k) => k.targetDelta !== 0),
    },
    {
      label: "Every target points the KPI's better direction",
      ok: f.kpis.every((k) => (k.kpi.direction === "UP" ? k.targetDelta > 0 : k.targetDelta < 0)),
    },
    {
      label: "Every KPI can be monetised (volume and ₹ value set)",
      ok: f.kpis.every((k) => k.monthlyVolume > 0 && k.valuePerUnit > 0),
    },
    { label: "Attribution plan: segment in scope", ok: f.segment.trim().length > 0 },
    { label: "Minimum sample per arm ≥ 100", ok: f.minSamplePerArm >= 100, detail: `${f.minSamplePerArm}` },
    { label: "Observation window ≥ 14 days", ok: f.observationDays >= 14, detail: `${f.observationDays} days` },
    { label: "Approved by product", ok: f.productApproved },
    { label: "Approved by engineering", ok: f.engineeringApproved },
    { label: "Approved by analytics", ok: f.analyticsApproved },
  ]
}

/** Actions the feature's KPIs are computed from — these must be instrumented before release. */
export function requiredActions(f: FeatureWithSpec): string[] {
  const set = new Set<string>(["feature_exposed"])
  for (const k of f.kpis) {
    set.add(k.kpi.numeratorAction)
    if (k.kpi.denominatorAction) set.add(k.kpi.denominatorAction)
  }
  return [...set]
}

export async function instrumentationStatus(f: FeatureWithSpec) {
  const actions = requiredActions(f)
  const grouped = await db.event.groupBy({
    by: ["action"],
    where: { featureFlag: f.key, action: { in: actions } },
    _count: { _all: true },
    _max: { timestamp: true },
  })
  const byAction = new Map(grouped.map((g) => [g.action, g]))
  let baselineEvents = 0
  if (f.attributionMethod === "PRE_POST") {
    baselineEvents = await db.event.count({
      where: {
        featureFlag: null,
        action: { in: actions.filter((a) => a !== "feature_exposed") },
        ...(f.releasedAt ? { timestamp: { lt: f.releasedAt } } : {}),
      },
    })
  }
  return {
    actions: actions.map((a) => ({
      action: a,
      count: byAction.get(a)?._count._all ?? 0,
      lastSeen: byAction.get(a)?._max.timestamp ?? null,
    })),
    baselineEvents,
  }
}

export async function gateFor(f: FeatureWithSpec): Promise<Gate> {
  const next = NEXT[f.status as FeatureStatus] ?? null
  switch (f.status) {
    case "DRAFT":
      return { next, checks: specChecks(f) }
    case "SPEC_APPROVED": {
      const dev = f.costs.filter((c) => c.category === "DEVELOPMENT")
      return {
        next,
        checks: [{ label: "Development cost estimate recorded", ok: dev.length > 0, detail: `${dev.length} entries` }],
      }
    }
    case "IN_DEVELOPMENT": {
      const inst = await instrumentationStatus(f)
      const checks: Check[] = inst.actions.map((a) => ({
        label: `Event \`${a.action}\` received with flag \`${f.key}\``,
        ok: a.count > 0,
        detail: a.count > 0 ? `${a.count} events` : "never seen",
      }))
      if (f.attributionMethod === "PRE_POST") {
        checks.push({
          label: "Pre-release baseline events exist for the KPI actions",
          ok: inst.baselineEvents > 0,
          detail: `${inst.baselineEvents} events`,
        })
      }
      return { next, checks }
    }
    default:
      return { next: null, checks: [] }
  }
}
