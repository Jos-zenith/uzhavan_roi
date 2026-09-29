import { db } from "@/lib/db"
import type { AttributionMethod, KpiCalculation } from "@/lib/domain"
import { ADMITTED } from "@/lib/registry"
import { holm, moments, srmPValue, twoProportion, welch, type TestResult } from "./stats"
import { requiredPerArm } from "./power"
import type { Prisma } from "@/lib/generated/tnimpact/client"

/**
 * The ROI calculation layer. For one feature it:
 *  1. splits events into a control and a treatment arm per the attribution plan,
 *  2. computes each declared KPI per arm using the catalogue's definition,
 *  3. tests whether the difference is real,
 *  4. monetises only the statistically significant improvements, and
 *  5. sets ROI = (benefits − costs) / costs over the feature's horizon.
 */

export const SIGNIFICANCE = 0.05
const DAY = 86_400_000

export const featureWithSpec = {
  include: { kpis: { include: { kpi: true }, orderBy: { id: "asc" } }, costs: { orderBy: { createdAt: "asc" } } },
} satisfies Prisma.FeatureDefaultArgs
export type FeatureWithSpec = Prisma.FeatureGetPayload<typeof featureWithSpec>
type FeatureKpiWithDef = FeatureWithSpec["kpis"][number]

type EventRow = { userId: string; action: string; value: number | null; variant: string | null; timestamp: Date }

export type ArmValue = { n: number; value: number | null }

export type KpiResult = {
  featureKpiId: string
  key: string
  name: string
  unit: string
  category: string
  /** what an arm's `n` counts: users for ratio and per-1k KPIs, events for means */
  sampleUnit: "users" | "events"
  direction: string
  baseline: number
  target: number
  targetDelta: number
  control: ArmValue
  treatment: ArmValue
  /** treatment − control, in KPI units */
  delta: number | null
  /** delta signed so that positive always means "better" */
  improvement: number | null
  ciLow: number | null
  ciHigh: number | null
  /** raw p-value from the KPI's own test */
  pValue: number | null
  /** Holm-adjusted across this feature's KPIs; this is what significance uses */
  pAdjusted: number | null
  significant: boolean
  targetMet: boolean
  /** ₹/month; 0 unless the effect is significant */
  monthlyBenefit: number
  /** Sample needed per arm to detect the spec's target change (α 0.05, power 0.8) */
  power: { required: number | null; current: number; reached: boolean; reachedOn: Date | null }
}

export type Recommendation =
  | { kind: "NOT_LIVE"; reason: string }
  | { kind: "KEEP_MEASURING"; reason: string }
  | { kind: "SCALE" | "ITERATE" | "RETIRE"; reason: string }

export type FeatureReport = {
  kpis: KpiResult[]
  armLabels: [string, string]
  observedDays: number
  windowMet: boolean
  sampleMet: boolean
  credible: boolean
  monthlyBenefit: number
  oneTimeCost: number
  monthlyCost: number
  totalBenefit: number
  totalCost: number
  roi: number | null
  /** Sample-ratio-mismatch check on exposed users; null for pre/post designs */
  srm: { expectedShare: number; observedShare: number; control: number; treatment: number; pValue: number | null; ok: boolean } | null
  /** When "keep measuring" ends, projected from the traffic seen so far */
  credibility: { windowClosesOn: Date | null; sampleReachedOn: Date | null; credibleOn: Date | null; perArmPerDay: number }
  /** ROI if the spec's ₹ values are 50%, 100% and 150% of what was assumed */
  sensitivity: { factor: number; roi: number | null }[]
  /** Fraction of the assumed ₹ values at which proven value exactly covers cost */
  breakEvenFactor: number | null
  recommendation: Recommendation
}

export const SRM_THRESHOLD = 0.001

function armsFor(method: AttributionMethod): [string, string] {
  return method === "PRE_POST" ? ["Before release", "After release"] : ["Control", "Treatment"]
}

async function loadEvents(feature: FeatureWithSpec, actions: string[]): Promise<{ control: EventRow[]; treatment: EventRow[] }> {
  const select = { userId: true, action: true, value: true, variant: true, timestamp: true } as const
  if (feature.attributionMethod === "PRE_POST") {
    if (!feature.releasedAt) return { control: [], treatment: [] }
    // Equal-length windows either side of the release. Events from other
    // experiments (a different flag) are excluded so they don't contaminate.
    const released = feature.releasedAt.getTime()
    const span = feature.observationDays * DAY
    const rows = await db.event.findMany({
      where: {
        ...ADMITTED,
        action: { in: actions },
        OR: [{ featureFlag: null }, { featureFlag: feature.key }],
        timestamp: { gte: new Date(released - span), lt: new Date(released + span) },
      },
      select,
    })
    return {
      control: rows.filter((e) => e.timestamp.getTime() < released),
      treatment: rows.filter((e) => e.timestamp.getTime() >= released),
    }
  }
  const rows = await db.event.findMany({
    where: { ...ADMITTED, featureFlag: feature.key, action: { in: actions }, variant: { in: ["control", "treatment"] } },
    select,
  })
  return {
    control: rows.filter((e) => e.variant === "control"),
    treatment: rows.filter((e) => e.variant === "treatment"),
  }
}

type ArmComputation =
  | { kind: "ratio"; x: number; n: number }
  | { kind: "mean"; m: ReturnType<typeof moments>; scale: number }

function computeArm(calc: KpiCalculation, numerator: string, denominator: string | null, events: EventRow[]): ArmComputation {
  if (calc === "MEAN_VALUE") {
    const xs = events.filter((e) => e.action === numerator && e.value !== null).map((e) => e.value as number)
    return { kind: "mean", m: moments(xs), scale: 1 }
  }
  const denomUsers = new Set(events.filter((e) => e.action === denominator).map((e) => e.userId))
  if (calc === "USER_RATIO") {
    const numUsers = new Set(events.filter((e) => e.action === numerator && denomUsers.has(e.userId)).map((e) => e.userId))
    return { kind: "ratio", x: numUsers.size, n: denomUsers.size }
  }
  // RATE_PER_1K: per-user event counts (zeros included) so we can test the mean.
  const counts = new Map<string, number>()
  for (const u of denomUsers) counts.set(u, 0)
  for (const e of events) if (e.action === numerator && counts.has(e.userId)) counts.set(e.userId, counts.get(e.userId)! + 1)
  return { kind: "mean", m: moments([...counts.values()]), scale: 1000 }
}

function armValue(a: ArmComputation): ArmValue {
  if (a.kind === "ratio") return { n: a.n, value: a.n > 0 ? a.x / a.n : null }
  return { n: a.m.n, value: a.m.n > 0 ? a.m.mean * a.scale : null }
}

function test(c: ArmComputation, t: ArmComputation): TestResult | null {
  if (c.kind === "ratio" && t.kind === "ratio") return twoProportion(c.x, c.n, t.x, t.n)
  if (c.kind === "mean" && t.kind === "mean") {
    const r = welch(c.m, t.m)
    if (!r) return null
    const s = c.scale
    return { diff: r.diff * s, se: r.se * s, pValue: r.pValue, ciLow: r.ciLow * s, ciHigh: r.ciHigh * s }
  }
  return null
}

/** Per-KPI result before Holm: significance and benefit are settled across all KPIs in buildReport. */
function kpiResult(fk: FeatureKpiWithDef, control: EventRow[], treatment: EventRow[]): KpiResult {
  const { kpi } = fk
  const calc = kpi.calculation as KpiCalculation
  const c = computeArm(calc, kpi.numeratorAction, kpi.denominatorAction, control)
  const t = computeArm(calc, kpi.numeratorAction, kpi.denominatorAction, treatment)
  const r = test(c, t)
  const sign = kpi.direction === "DOWN" ? -1 : 1
  const improvement = r ? r.diff * sign : null
  const significant = !!r && r.pValue < SIGNIFICANCE
  const targetImprovement = Math.abs(fk.targetDelta)
  return {
    featureKpiId: fk.id,
    key: kpi.key,
    name: kpi.name,
    unit: kpi.unit,
    category: kpi.category,
    sampleUnit: calc === "MEAN_VALUE" ? "events" : "users",
    direction: kpi.direction,
    baseline: fk.baseline,
    target: fk.baseline + fk.targetDelta,
    targetDelta: fk.targetDelta,
    control: armValue(c),
    treatment: armValue(t),
    delta: r?.diff ?? null,
    improvement,
    ciLow: r?.ciLow ?? null,
    ciHigh: r?.ciHigh ?? null,
    pValue: r?.pValue ?? null,
    pAdjusted: r?.pValue ?? null,
    significant,
    targetMet: significant && improvement !== null && improvement >= targetImprovement,
    monthlyBenefit: significant && improvement !== null ? improvement * fk.monthlyVolume * fk.valuePerUnit : 0,
    power: { required: null, current: 0, reached: false, reachedOn: null },
  }
}

/** Re-decide significance with Holm-adjusted p-values; benefit only follows a surviving effect. */
function applyHolm(kpis: KpiResult[], specs: FeatureKpiWithDef[]): KpiResult[] {
  const adjusted = holm(kpis.map((k) => k.pValue))
  return kpis.map((k, i) => {
    const pAdjusted = adjusted[i]
    const significant = pAdjusted !== null && pAdjusted < SIGNIFICANCE
    const fk = specs[i]
    return {
      ...k,
      pAdjusted,
      significant,
      targetMet: significant && k.improvement !== null && k.improvement >= Math.abs(fk.targetDelta),
      monthlyBenefit: significant && k.improvement !== null ? k.improvement * fk.monthlyVolume * fk.valuePerUnit : 0,
    }
  })
}

async function sampleRatio(feature: FeatureWithSpec): Promise<FeatureReport["srm"]> {
  if (feature.attributionMethod === "PRE_POST" || !feature.releasedAt) return null
  const exposed = await db.event.findMany({
    where: { ...ADMITTED, featureFlag: feature.key, action: "feature_exposed", variant: { in: ["control", "treatment"] } },
    distinct: ["userId", "variant"],
    select: { variant: true },
  })
  const treatment = exposed.filter((e) => e.variant === "treatment").length
  const control = exposed.length - treatment
  const pValue = srmPValue(control, treatment, feature.treatmentShare)
  return {
    expectedShare: feature.treatmentShare,
    observedShare: exposed.length ? treatment / exposed.length : 0,
    control,
    treatment,
    pValue,
    ok: pValue === null || pValue >= SRM_THRESHOLD,
  }
}

const addDays = (from: Date, days: number) => new Date(from.getTime() + Math.ceil(days) * DAY)

function recommend(feature: FeatureWithSpec, r: Omit<FeatureReport, "recommendation">): Recommendation {
  if (feature.status !== "SHIPPED" && feature.status !== "RETIRED") {
    return { kind: "NOT_LIVE", reason: "Not released yet — nothing to measure." }
  }
  if (r.srm && !r.srm.ok) {
    return {
      kind: "KEEP_MEASURING",
      reason: `The traffic split is broken: planned ${Math.round(r.srm.expectedShare * 100)}% treatment, got ${(r.srm.observedShare * 100).toFixed(1)}%. No result from this test can be trusted until assignment is fixed.`,
    }
  }
  const when = r.credibility.credibleOn
    ? ` Final on ${r.credibility.credibleOn.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} at current traffic.`
    : ""
  if (!r.windowMet) {
    return {
      kind: "KEEP_MEASURING",
      reason: `${r.observedDays} of ${feature.observationDays} observation days elapsed.${when}`,
    }
  }
  if (!r.sampleMet) {
    return {
      kind: "KEEP_MEASURING",
      reason: `Needs ${feature.minSamplePerArm} per arm; smallest arm has ${Math.min(...r.kpis.flatMap((k) => [k.control.n, k.treatment.n]))}.${when}`,
    }
  }
  const worse = r.kpis.filter((k) => k.significant && (k.improvement ?? 0) < 0).map((k) => k.name.toLowerCase())
  const roi = r.roi ?? -1
  if (roi >= 0.5) return { kind: "SCALE", reason: `Proven ROI of ${(roi * 100).toFixed(0)}% over ${feature.horizonMonths} months.` }
  if (roi >= 0) return { kind: "ITERATE", reason: "Pays back, but below the 50% bar for scaling. Improve the weakest KPI." }
  const proven = r.kpis.filter((k) => k.significant && (k.improvement ?? 0) > 0).length
  return {
    kind: "RETIRE",
    reason:
      worse.length > 0
        ? `Made ${worse.join(" and ")} significantly worse, and costs exceed proven benefits.`
        : proven === 0
          ? "No KPI moved significantly after the full observation window."
          : "Proven benefits don't cover the cost.",
  }
}

export async function buildReport(feature: FeatureWithSpec, now = new Date()): Promise<FeatureReport> {
  const actions = [
    ...new Set(feature.kpis.flatMap((fk) => [fk.kpi.numeratorAction, fk.kpi.denominatorAction].filter((a): a is string => !!a))),
  ]
  const live = !!feature.releasedAt
  const [{ control, treatment }, srm] = await Promise.all([
    live ? loadEvents(feature, actions) : Promise.resolve({ control: [] as EventRow[], treatment: [] as EventRow[] }),
    sampleRatio(feature),
  ])
  const observedDays = feature.releasedAt ? Math.floor((now.getTime() - feature.releasedAt.getTime()) / DAY) : 0
  const daysRunning = Math.max(1, Math.min(observedDays, feature.attributionMethod === "PRE_POST" ? feature.observationDays : observedDays))

  const kpis = applyHolm(
    feature.kpis.map((fk) => kpiResult(fk, control, treatment)),
    feature.kpis,
  ).map((k, i) => {
    // Power: the sample this KPI needs to detect its own target, and when traffic gets it there.
    const fk = feature.kpis[i]
    const required = requiredPerArm(fk.kpi.calculation, fk.baseline, fk.targetDelta)
    const current = Math.min(k.control.n, k.treatment.n)
    const rate = current / daysRunning
    const reached = required !== null && current >= required
    const reachedOn = required === null || reached || rate <= 0 ? null : addDays(now, (required - current) / rate)
    return { ...k, power: { required, current, reached, reachedOn } }
  })

  const windowMet = live && observedDays >= feature.observationDays
  const sampleMet = kpis.length > 0 && kpis.every((k) => k.control.n >= feature.minSamplePerArm && k.treatment.n >= feature.minSamplePerArm)

  // "Keep measuring" as a countdown: the window's close, and when the slowest arm reaches the minimum sample.
  const smallest = kpis.length ? Math.min(...kpis.flatMap((k) => [k.control.n, k.treatment.n])) : 0
  const perArmPerDay = live ? smallest / daysRunning : 0
  const windowClosesOn = feature.releasedAt ? addDays(feature.releasedAt, feature.observationDays) : null
  const sampleReachedOn =
    !live || sampleMet ? null : perArmPerDay > 0 ? addDays(now, (feature.minSamplePerArm - smallest) / perArmPerDay) : null
  const credibleOn =
    !live || (!sampleMet && perArmPerDay <= 0)
      ? null
      : new Date(Math.max(windowClosesOn?.getTime() ?? 0, sampleReachedOn?.getTime() ?? 0, now.getTime()))

  const oneTimeCost = feature.costs.filter((c) => c.recurrence === "ONE_TIME").reduce((a, c) => a + c.amount, 0)
  const monthlyCost = feature.costs.filter((c) => c.recurrence === "MONTHLY").reduce((a, c) => a + c.amount, 0)
  const monthlyBenefit = kpis.reduce((a, k) => a + k.monthlyBenefit, 0)
  const totalCost = oneTimeCost + monthlyCost * feature.horizonMonths
  const totalBenefit = monthlyBenefit * feature.horizonMonths
  const roi = live && totalCost > 0 ? (totalBenefit - totalCost) / totalCost : null

  const partial = {
    kpis,
    armLabels: armsFor(feature.attributionMethod as AttributionMethod),
    observedDays,
    windowMet,
    sampleMet,
    credible: windowMet && sampleMet && (srm?.ok ?? true),
    monthlyBenefit,
    oneTimeCost,
    monthlyCost,
    totalBenefit,
    totalCost,
    roi,
    srm,
    credibility: { windowClosesOn, sampleReachedOn, credibleOn, perArmPerDay },
    sensitivity: [0.5, 1, 1.5].map((factor) => ({
      factor,
      roi: live && totalCost > 0 ? (totalBenefit * factor - totalCost) / totalCost : null,
    })),
    breakEvenFactor: live && totalBenefit > 0 ? totalCost / totalBenefit : null,
  }
  return { ...partial, recommendation: recommend(feature, partial) }
}

/** Leading indicator: distinct treatment users exposed to the feature, per week. */
export async function weeklyAdoption(featureKey: string, weeks = 8, now = new Date()) {
  const start = new Date(now.getTime() - weeks * 7 * DAY)
  const rows = await db.event.findMany({
    where: { ...ADMITTED, featureFlag: featureKey, action: "feature_exposed", variant: "treatment", timestamp: { gte: start } },
    select: { userId: true, timestamp: true },
  })
  const buckets = Array.from({ length: weeks }, (_, i) => ({
    weekStart: new Date(start.getTime() + i * 7 * DAY),
    users: new Set<string>(),
  }))
  for (const r of rows) {
    const i = Math.min(weeks - 1, Math.floor((r.timestamp.getTime() - start.getTime()) / (7 * DAY)))
    buckets[i].users.add(r.userId)
  }
  return buckets.map((b) => ({ weekStart: b.weekStart, users: b.users.size }))
}
