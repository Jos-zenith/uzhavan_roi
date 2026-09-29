import { db } from "@/lib/db"
import { parseGoals, type FeatureStatus } from "@/lib/domain"
import type { FeatureWithSpec } from "@/lib/analytics/report"
import { ADMITTED } from "@/lib/registry"
import { daysNeeded, expectedPerArm, requiredPerArm } from "@/lib/analytics/power"

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
    {
      label: "Every ₹ value names where it comes from",
      ok: f.kpis.length > 0 && f.kpis.every((k) => k.valueSource.trim().length > 0),
      detail: f.kpis.filter((k) => !k.valueSource.trim()).map((k) => `missing for ${k.kpi.name.toLowerCase()}`).join("; ") || undefined,
    },
    ...powerChecks(f),
    { label: "Attribution plan: segment in scope", ok: f.segment.trim().length > 0 },
    { label: "Minimum sample per arm ≥ 100", ok: f.minSamplePerArm >= 100, detail: `${f.minSamplePerArm}` },
    { label: "Observation window ≥ 14 days", ok: f.observationDays >= 14, detail: `${f.observationDays} days` },
    { label: "Approved by product", ok: f.productApproved, detail: f.productApprovedBy ?? undefined },
    { label: "Approved by engineering", ok: f.engineeringApproved, detail: f.engineeringApprovedBy ?? undefined },
    { label: "Approved by analytics", ok: f.analyticsApproved, detail: f.analyticsApprovedBy ?? undefined },
  ]
}

/**
 * Can this test actually prove what it's promising? For each KPI whose sample
 * size can be computed, compare the sample the target change needs with the
 * sample the planned traffic and window will deliver. If the window can't get
 * there, the fix is a longer window, a 50/50 split or a bigger target change.
 */
function powerChecks(f: FeatureWithSpec): Check[] {
  const prePost = f.attributionMethod === "PRE_POST"
  const checks: Check[] = []
  if (!prePost) {
    checks.push({
      label: "Traffic split is between 1% and 99% treatment",
      ok: f.treatmentShare >= 0.01 && f.treatmentShare <= 0.99,
      detail: `${Math.round(f.treatmentShare * 100)}% treatment`,
    })
  }
  for (const k of f.kpis) {
    const required = requiredPerArm(k.kpi.calculation, k.baseline, k.targetDelta)
    if (required === null) continue
    // Pre/post compares two full windows of traffic, so each "arm" gets all of it.
    const expected = prePost
      ? expectedPerArm(k.kpi.calculation, k.monthlyVolume, f.observationDays, 0.5) * 2
      : expectedPerArm(k.kpi.calculation, k.monthlyVolume, f.observationDays, f.treatmentShare)
    const ok = expected >= required
    const days = prePost ? null : daysNeeded(k.kpi.calculation, k.monthlyVolume, f.treatmentShare, required)
    checks.push({
      label: `${k.kpi.name} can reach significance in the window`,
      ok,
      detail: ok
        ? `needs ~${required.toLocaleString("en-IN")} per arm; window gives ~${expected.toLocaleString("en-IN")}`
        : `needs ~${required.toLocaleString("en-IN")} per arm but the window gives ~${expected.toLocaleString("en-IN")}` +
          (days ? `. Run ~${days} days, split closer to 50/50, or target a bigger change` : ". Target a bigger change or add traffic"),
    })
  }
  return checks
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
    where: { ...ADMITTED, featureFlag: f.key, action: { in: actions } },
    _count: { _all: true },
    _max: { timestamp: true },
  })
  const byAction = new Map(grouped.map((g) => [g.action, g]))
  let baselineEvents = 0
  if (f.attributionMethod === "PRE_POST") {
    baselineEvents = await db.event.count({
      where: {
        ...ADMITTED,
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

export type ReviewStatus =
  | { kind: "DECIDED"; decision: string; at: Date }
  | { kind: "DUE"; at: Date } // window still open; review on this date
  | { kind: "OVERDUE"; since: Date; days: number } // results credible, nobody has decided
  | { kind: "NEEDS_SAMPLE"; since: Date } // window closed, but an arm is below minimum sample
  | { kind: "NONE" }

const DAY_MS = 86_400_000

/** Where a shipped feature stands in portfolio review, from its observation window. */
export function reviewStatus(f: FeatureWithSpec, credible: boolean, now = new Date()): ReviewStatus {
  if (f.decision && f.decidedAt) return { kind: "DECIDED", decision: f.decision, at: f.decidedAt }
  if (f.status !== "SHIPPED" || !f.releasedAt) return { kind: "NONE" }
  const windowCloses = new Date(f.releasedAt.getTime() + f.observationDays * DAY_MS)
  if (now < windowCloses) return { kind: "DUE", at: windowCloses }
  if (!credible) return { kind: "NEEDS_SAMPLE", since: windowCloses }
  return { kind: "OVERDUE", since: windowCloses, days: Math.floor((now.getTime() - windowCloses.getTime()) / DAY_MS) }
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
