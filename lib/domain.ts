// Shared vocabulary for the ROI process. Stored as strings in SQLite; these
// unions are the single source of truth for allowed values and labels.

export const GOAL_TYPES = ["REVENUE", "COST_SAVINGS", "PRODUCTIVITY", "RISK_REDUCTION", "EXPERIENCE"] as const
export type GoalType = (typeof GOAL_TYPES)[number]
export const GOAL_LABEL: Record<GoalType, string> = {
  REVENUE: "Incremental revenue",
  COST_SAVINGS: "Cost savings",
  PRODUCTIVITY: "Productivity",
  RISK_REDUCTION: "Risk reduction",
  EXPERIENCE: "User experience",
}
export type Goal = { type: GoalType; statement: string }

export const KPI_CATEGORIES = ["REVENUE", "COST", "PRODUCTIVITY", "RISK", "EXPERIENCE"] as const
export type KpiCategory = (typeof KPI_CATEGORIES)[number]

export const KPI_UNITS = ["RATIO", "SECONDS", "PER_1K"] as const
export type KpiUnit = (typeof KPI_UNITS)[number]

export const KPI_DIRECTIONS = ["UP", "DOWN"] as const
export type KpiDirection = (typeof KPI_DIRECTIONS)[number]

export const KPI_CALCULATIONS = ["USER_RATIO", "MEAN_VALUE", "RATE_PER_1K"] as const
export type KpiCalculation = (typeof KPI_CALCULATIONS)[number]
export const CALCULATION_LABEL: Record<KpiCalculation, string> = {
  USER_RATIO: "Distinct users who did the numerator action ÷ distinct users who did the denominator action",
  MEAN_VALUE: "Mean of the event `value` on the numerator action",
  RATE_PER_1K: "Numerator events per 1,000 users who did the denominator action",
}
/** What `monthlyVolume` counts, per calculation — used to monetise a KPI change. */
export const VOLUME_LABEL: Record<KpiCalculation, string> = {
  USER_RATIO: "denominator users / month",
  MEAN_VALUE: "numerator events / month",
  RATE_PER_1K: "thousands of users / month",
}
/** The calculation implies the unit, so the catalogue can't define a mismatched pair. */
export const UNIT_FOR_CALCULATION: Record<KpiCalculation, KpiUnit> = {
  USER_RATIO: "RATIO",
  MEAN_VALUE: "SECONDS",
  RATE_PER_1K: "PER_1K",
}

export const ATTRIBUTION_METHODS = ["AB_TEST", "PHASED_ROLLOUT", "PRE_POST"] as const
export type AttributionMethod = (typeof ATTRIBUTION_METHODS)[number]
export const ATTRIBUTION_LABEL: Record<AttributionMethod, string> = {
  AB_TEST: "A/B test",
  PHASED_ROLLOUT: "Phased rollout",
  PRE_POST: "Pre / post comparison",
}

export const FEATURE_STATUSES = ["DRAFT", "SPEC_APPROVED", "IN_DEVELOPMENT", "SHIPPED", "RETIRED"] as const
export type FeatureStatus = (typeof FEATURE_STATUSES)[number]
export const STATUS_LABEL: Record<FeatureStatus, string> = {
  DRAFT: "Draft spec",
  SPEC_APPROVED: "Spec approved",
  IN_DEVELOPMENT: "In development",
  SHIPPED: "Shipped",
  RETIRED: "Retired",
}

export const COST_CATEGORIES = ["DEVELOPMENT", "INFRASTRUCTURE", "SUPPORT", "MAINTENANCE"] as const
export type CostCategory = (typeof COST_CATEGORIES)[number]
export const COST_RECURRENCES = ["ONE_TIME", "MONTHLY"] as const
export type CostRecurrence = (typeof COST_RECURRENCES)[number]

export const DECISIONS = ["SCALE", "ITERATE", "RETIRE"] as const
export type Decision = (typeof DECISIONS)[number]

/** The exact calculation and significance test behind a catalogue KPI, as shown to reviewers. */
export function kpiFormula(k: { calculation: string; numeratorAction: string; denominatorAction: string | null }) {
  if (k.calculation === "MEAN_VALUE") return { formula: `mean(value of ${k.numeratorAction})`, test: "Welch's test on means" }
  if (k.calculation === "RATE_PER_1K") {
    return { formula: `count(${k.numeratorAction}) ÷ users(${k.denominatorAction}) × 1000`, test: "Welch's test on per-user counts" }
  }
  return { formula: `users(${k.numeratorAction}) ÷ users(${k.denominatorAction})`, test: "two-proportion z-test" }
}

export function parseGoals(json: string): Goal[] {
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export function formatKpiValue(value: number | null, unit: string): string {
  if (value === null || !Number.isFinite(value)) return "—"
  if (unit === "RATIO") return `${(value * 100).toFixed(1)}%`
  if (unit === "SECONDS") return `${value.toFixed(1)}s`
  return `${value.toFixed(1)} /1k`
}

export function formatKpiDelta(delta: number | null, unit: string): string {
  if (delta === null || !Number.isFinite(delta)) return "—"
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : ""
  const abs = Math.abs(delta)
  if (unit === "RATIO") return `${sign}${(abs * 100).toFixed(1)} pp`
  if (unit === "SECONDS") return `${sign}${abs.toFixed(1)}s`
  return `${sign}${abs.toFixed(1)} /1k`
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })
export function formatInr(n: number): string {
  return inr.format(Math.round(n))
}

export function formatPct(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—"
  return `${n >= 0 ? "" : "−"}${Math.abs(n * 100).toFixed(0)}%`
}
