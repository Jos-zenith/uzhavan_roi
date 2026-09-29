import { db } from "@/lib/db"
import type { AttributionMethod, KpiCalculation } from "@/lib/domain"
import { ADMITTED } from "@/lib/registry"
import { diffInDiffProportions, holm, moments, msprtPValue, srmPValue, twoProportion, welch, type TestResult } from "./stats"
import { requiredPerArm } from "./power"
import type { Prisma } from "@/lib/generated/tnimpact/client"

/**
 * The ROI calculation layer. For one feature it:
 *  1. splits events into arms per the attribution plan (A/B, phased rollout,
 *     or pre/post, netted against holdout districts when there are any),
 *  2. computes each declared KPI per arm using the catalogue's definition,
 *  3. tests each difference twice: a fixed-horizon test (the final verdict)
 *     and an always-valid sequential test (safe to watch live, and what lets
 *     a clear result be called before the window closes),
 *  4. checks guardrail KPIs for harm, which trips the kill switch,
 *  5. monetises only the statistically significant primary effects, and
 *  6. sets ROI = (benefits − costs) / costs, as a low / base / high band.
 */

export const SIGNIFICANCE = 0.05
export const SRM_THRESHOLD = 0.001
const DAY = 86_400_000

export const featureWithSpec = {
  include: { kpis: { include: { kpi: true }, orderBy: { id: "asc" } }, costs: { orderBy: { createdAt: "asc" } } },
} satisfies Prisma.FeatureDefaultArgs
export type FeatureWithSpec = Prisma.FeatureGetPayload<typeof featureWithSpec>
type FeatureKpiWithDef = FeatureWithSpec["kpis"][number]

type EventRow = { userId: string; action: string; value: number | null; variant: string | null; timestamp: Date; district?: string }

export type ArmValue = { n: number; value: number | null }

export type KpiResult = {
  featureKpiId: string
  key: string
  name: string
  unit: string
  category: string
  /** PRIMARY: what the feature is for. GUARDRAIL: must not get worse; harm trips the kill switch. */
  role: "PRIMARY" | "GUARDRAIL"
  /** what an arm's `n` counts: users for ratio and per-1k KPIs, events for means */
  sampleUnit: "users" | "events"
  direction: string
  baseline: number
  target: number
  targetDelta: number
  control: ArmValue
  treatment: ArmValue
  /** treatment − control in KPI units (holdout-adjusted when the feature has holdout districts) */
  delta: number | null
  /** delta signed so that positive always means "better" */
  improvement: number | null
  ciLow: number | null
  ciHigh: number | null
  /** raw fixed-horizon p-value */
  pValue: number | null
  /** Holm-adjusted across the feature's primary KPIs; this is what the final verdict uses */
  pAdjusted: number | null
  /** always-valid sequential (mSPRT) p-value: valid however often the dashboard is looked at */
  pSequential: number | null
  significant: boolean
  targetMet: boolean
  /** Guardrails only: significantly worse under the sequential test */
  tripped: boolean
  /** ₹/month; 0 unless the effect is significant */
  monthlyBenefit: number
  /** ₹ per unit this KPI would need to be worth for the feature to break even (others as assumed) */
  breakEvenValue: number | null
  valuePerUnit: number
  /** Pre/post with holdout districts: how much each group moved, before netting out */
  seasonal: { treatedChange: number; holdoutChange: number; holdoutDistricts: string[] } | null
  /** Sample needed per arm to detect the spec's target change (α 0.05, power 0.8) */
  power: { required: number | null; current: number; reached: boolean; reachedOn: Date | null }
}

export type Recommendation =
  | { kind: "NOT_LIVE"; reason: string }
  | { kind: "KEEP_MEASURING"; reason: string }
  | { kind: "KILLED"; reason: string }
  | { kind: "SCALE" | "ITERATE" | "RETIRE"; reason: string }

export type FeatureReport = {
  kpis: KpiResult[]
  armLabels: [string, string]
  observedDays: number
  windowMet: boolean
  sampleMet: boolean
  credible: boolean
  /** true when the result became final before the window closed, via the sequential test */
  decidedEarly: boolean
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
  /** ROI with every ₹ value at its low, assumed and high estimate */
  sensitivity: { label: "low" | "base" | "high"; roi: number | null }[]
  /** Fraction of the assumed ₹ values at which proven value exactly covers cost */
  breakEvenFactor: number | null
  killed: { at: Date; reason: string } | null
  recommendation: Recommendation
}

function armsFor(method: AttributionMethod): [string, string] {
  return method === "PRE_POST" ? ["Before release", "After release"] : ["Control", "Treatment"]
}

type Loaded = { control: EventRow[]; treatment: EventRow[]; holdout: { before: EventRow[]; after: EventRow[] } | null }

async function loadEvents(feature: FeatureWithSpec, actions: string[]): Promise<Loaded> {
  const select = { userId: true, action: true, value: true, variant: true, timestamp: true, context: true } as const
  if (feature.attributionMethod === "PRE_POST") {
    if (!feature.releasedAt) return { control: [], treatment: [], holdout: null }
    // Equal-length windows either side of the release. Events from other
    // experiments (a different flag) are excluded so they don't contaminate.
    const released = feature.releasedAt.getTime()
    const span = feature.observationDays * DAY
    const rows = (
      await db.event.findMany({
        where: {
          ...ADMITTED,
          action: { in: actions },
          OR: [{ featureFlag: null }, { featureFlag: feature.key }],
          timestamp: { gte: new Date(released - span), lt: new Date(released + span) },
        },
        select,
      })
    ).map(({ context, ...e }) => ({ ...e, district: districtOf(context) }))
    const holdouts = feature.holdoutDistricts
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean)
    const before = (e: EventRow) => e.timestamp.getTime() < released
    if (holdouts.length === 0) {
      return { control: rows.filter(before), treatment: rows.filter((e) => !before(e)), holdout: null }
    }
    const inHoldout = (e: EventRow) => holdouts.includes(e.district ?? "")
    const treated = rows.filter((e) => !inHoldout(e))
    const held = rows.filter(inHoldout)
    return {
      control: treated.filter(before),
      treatment: treated.filter((e) => !before(e)),
      holdout: { before: held.filter(before), after: held.filter((e) => !before(e)) },
    }
  }
  const rows = await db.event.findMany({
    where: { ...ADMITTED, featureFlag: feature.key, action: { in: actions }, variant: { in: ["control", "treatment"] } },
    select: { userId: true, action: true, value: true, variant: true, timestamp: true },
  })
  return {
    control: rows.filter((e) => e.variant === "control"),
    treatment: rows.filter((e) => e.variant === "treatment"),
    holdout: null,
  }
}

function districtOf(context: string): string | undefined {
  try {
    const d = JSON.parse(context)?.district
    return typeof d === "string" ? d : undefined
  } catch {
    return undefined
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
function kpiResult(fk: FeatureKpiWithDef, data: Loaded, holdoutDistricts: string[]): KpiResult {
  const { kpi } = fk
  const calc = kpi.calculation as KpiCalculation
  const c = computeArm(calc, kpi.numeratorAction, kpi.denominatorAction, data.control)
  const t = computeArm(calc, kpi.numeratorAction, kpi.denominatorAction, data.treatment)

  let r: TestResult | null
  let seasonal: KpiResult["seasonal"] = null
  if (data.holdout && calc === "USER_RATIO") {
    const hb = computeArm(calc, kpi.numeratorAction, kpi.denominatorAction, data.holdout.before)
    const ha = computeArm(calc, kpi.numeratorAction, kpi.denominatorAction, data.holdout.after)
    const cell = (a: ArmComputation): [number, number] => (a.kind === "ratio" ? [a.x, a.n] : [0, 0])
    const did = diffInDiffProportions({ tBefore: cell(c), tAfter: cell(t), hBefore: cell(hb), hAfter: cell(ha) })
    r = did
    if (did) seasonal = { treatedChange: did.treatedChange, holdoutChange: did.holdoutChange, holdoutDistricts }
  } else {
    r = test(c, t)
  }

  const role = fk.role === "GUARDRAIL" ? "GUARDRAIL" : "PRIMARY"
  const sign = kpi.direction === "DOWN" ? -1 : 1
  const improvement = r ? r.diff * sign : null
  const tau = Math.abs(fk.targetDelta) || Math.abs(fk.baseline) * 0.1 || 1
  const pSequential = r ? msprtPValue(r.diff, r.se, tau) : null
  return {
    featureKpiId: fk.id,
    key: kpi.key,
    name: kpi.name,
    unit: kpi.unit,
    category: kpi.category,
    role,
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
    pSequential,
    significant: false,
    targetMet: false,
    tripped: role === "GUARDRAIL" && improvement !== null && improvement < 0 && pSequential !== null && pSequential < SIGNIFICANCE,
    monthlyBenefit: 0,
    breakEvenValue: null,
    valuePerUnit: fk.valuePerUnit,
    seasonal,
    power: { required: null, current: 0, reached: false, reachedOn: null },
  }
}

/**
 * Settle significance. Primary KPIs are Holm-corrected together (several
 * chances at a win shouldn't inflate false wins). Guardrails are safety checks,
 * judged on their own. Only a significant effect is worth ₹.
 */
function settle(kpis: KpiResult[], specs: FeatureKpiWithDef[]): KpiResult[] {
  const primaryIdx = kpis.map((k, i) => (k.role === "PRIMARY" ? i : -1)).filter((i) => i >= 0)
  const adjusted = holm(primaryIdx.map((i) => kpis[i].pValue))
  return kpis.map((k, i) => {
    const pos = primaryIdx.indexOf(i)
    const pAdjusted = pos >= 0 ? adjusted[pos] : k.pValue
    const significant = pAdjusted !== null && pAdjusted < SIGNIFICANCE
    const fk = specs[i]
    return {
      ...k,
      pAdjusted,
      significant,
      targetMet: k.role === "PRIMARY" && significant && k.improvement !== null && k.improvement >= Math.abs(fk.targetDelta),
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
const shortDate = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })

function recommend(feature: FeatureWithSpec, r: Omit<FeatureReport, "recommendation">): Recommendation {
  if (feature.status !== "SHIPPED" && feature.status !== "RETIRED") {
    return { kind: "NOT_LIVE", reason: "Not released yet — nothing to measure." }
  }
  const tripped = r.kpis.filter((k) => k.tripped)
  if (r.killed || tripped.length > 0) {
    return {
      kind: "KILLED",
      reason:
        r.killed?.reason ??
        `Guardrail breached: ${tripped.map((k) => k.name.toLowerCase()).join(" and ")} got significantly worse. The kill switch turns the feature off.`,
    }
  }
  if (r.srm && !r.srm.ok) {
    return {
      kind: "KEEP_MEASURING",
      reason: `The traffic split is broken: planned ${Math.round(r.srm.expectedShare * 100)}% treatment, got ${(r.srm.observedShare * 100).toFixed(1)}%. No result from this test can be trusted until assignment is fixed.`,
    }
  }
  const when = r.credibility.credibleOn ? ` Final by ${shortDate(r.credibility.credibleOn)} at current traffic.` : ""
  if (!r.credible && !r.windowMet) {
    return { kind: "KEEP_MEASURING", reason: `${r.observedDays} of ${feature.observationDays} observation days elapsed.${when}` }
  }
  if (!r.credible) {
    return {
      kind: "KEEP_MEASURING",
      reason: `Needs ${feature.minSamplePerArm} per arm; smallest arm has ${Math.min(...r.kpis.flatMap((k) => [k.control.n, k.treatment.n]))}.${when}`,
    }
  }
  const early = r.decidedEarly ? " Called early: the sequential test is already conclusive." : ""
  const worse = r.kpis.filter((k) => k.significant && (k.improvement ?? 0) < 0).map((k) => k.name.toLowerCase())
  const roi = r.roi ?? -1
  if (roi >= 0.5) return { kind: "SCALE", reason: `Proven ROI of ${(roi * 100).toFixed(0)}% over ${feature.horizonMonths} months.${early}` }
  if (roi >= 0) return { kind: "ITERATE", reason: `Pays back, but below the 50% bar for scaling. Improve the weakest KPI.${early}` }
  const proven = r.kpis.filter((k) => k.role === "PRIMARY" && k.significant && (k.improvement ?? 0) > 0).length
  const seasonal = r.kpis.some((k) => k.seasonal)
  return {
    kind: "RETIRE",
    reason:
      worse.length > 0
        ? `Made ${worse.join(" and ")} significantly worse, and costs exceed proven benefits.`
        : proven === 0
          ? seasonal
            ? "Once the holdout districts net out the season, no KPI moved significantly."
            : "No KPI moved significantly after the full observation window."
          : "Proven benefits don't cover the cost.",
  }
}

export async function buildReport(feature: FeatureWithSpec, now = new Date()): Promise<FeatureReport> {
  const actions = [
    ...new Set(feature.kpis.flatMap((fk) => [fk.kpi.numeratorAction, fk.kpi.denominatorAction].filter((a): a is string => !!a))),
  ]
  const live = !!feature.releasedAt
  const holdoutDistricts = feature.holdoutDistricts
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean)
  const [data, srm] = await Promise.all([
    live ? loadEvents(feature, actions) : Promise.resolve<Loaded>({ control: [], treatment: [], holdout: null }),
    sampleRatio(feature),
  ])
  const observedDays = feature.releasedAt ? Math.floor((now.getTime() - feature.releasedAt.getTime()) / DAY) : 0
  const daysRunning = Math.max(1, Math.min(observedDays, feature.attributionMethod === "PRE_POST" ? feature.observationDays : observedDays))

  const kpis = settle(
    feature.kpis.map((fk) => kpiResult(fk, data, holdoutDistricts)),
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

  const primaries = kpis.filter((k) => k.role === "PRIMARY")
  const windowMet = live && observedDays >= feature.observationDays
  const sampleMet = primaries.length > 0 && primaries.every((k) => k.control.n >= feature.minSamplePerArm && k.treatment.n >= feature.minSamplePerArm)
  // Sequential early call: every primary KPI conclusive under the always-valid
  // test (Holm-adjusted), with the sample floor met and the split healthy.
  const seqAdjusted = holm(primaries.map((k) => k.pSequential))
  const conclusiveEarly = primaries.length > 0 && seqAdjusted.every((p) => p !== null && p < SIGNIFICANCE)
  const splitOk = srm?.ok ?? true
  const credible = live && sampleMet && splitOk && (windowMet || conclusiveEarly)
  const decidedEarly = credible && !windowMet

  // "Keep measuring" as a countdown: the window's close, and when the slowest arm reaches the minimum sample.
  const smallest = primaries.length ? Math.min(...primaries.flatMap((k) => [k.control.n, k.treatment.n])) : 0
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

  // ₹ band: every KPI at its low / high ₹ estimate (half / one-and-a-half the assumed value when none was given).
  const benefitAt = (pick: (fk: FeatureKpiWithDef) => number) =>
    kpis.reduce((a, k, i) => (k.significant && k.improvement !== null ? a + k.improvement * feature.kpis[i].monthlyVolume * pick(feature.kpis[i]) : a), 0) *
    feature.horizonMonths
  const roiFor = (benefit: number) => (live && totalCost > 0 ? (benefit - totalCost) / totalCost : null)
  const sensitivity: FeatureReport["sensitivity"] = [
    { label: "low", roi: roiFor(benefitAt((fk) => fk.valueLow ?? fk.valuePerUnit * 0.5)) },
    { label: "base", roi },
    { label: "high", roi: roiFor(benefitAt((fk) => fk.valueHigh ?? fk.valuePerUnit * 1.5)) },
  ]

  // Break-even ₹ per unit for each proven, positive KPI, holding the others at their assumed values.
  const withBreakEven = kpis.map((k, i) => {
    const fk = feature.kpis[i]
    const perUnitValue = k.significant && k.improvement !== null && k.improvement > 0 ? k.improvement * fk.monthlyVolume * feature.horizonMonths : 0
    if (!live || perUnitValue <= 0) return k
    const others = totalBenefit - k.monthlyBenefit * feature.horizonMonths
    return { ...k, breakEvenValue: Math.max(0, (totalCost - others) / perUnitValue) }
  })

  const partial = {
    kpis: withBreakEven,
    armLabels: armsFor(feature.attributionMethod as AttributionMethod),
    observedDays,
    windowMet,
    sampleMet,
    credible,
    decidedEarly,
    monthlyBenefit,
    oneTimeCost,
    monthlyCost,
    totalBenefit,
    totalCost,
    roi,
    srm,
    credibility: { windowClosesOn, sampleReachedOn, credibleOn, perArmPerDay },
    sensitivity,
    breakEvenFactor: live && totalBenefit > 0 ? totalCost / totalBenefit : null,
    killed: feature.killedAt ? { at: feature.killedAt, reason: feature.killReason ?? "Kill switch tripped." } : null,
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
