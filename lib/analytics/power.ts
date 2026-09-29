// Sample-size maths, pure so the spec form can run it in the browser and the
// gates and reports can run it on the server. Two-sided α = 0.05, power = 0.8.

const Z_ALPHA = 1.959964 // two-sided 95%
const Z_POWER = 0.841621 // 80% power

/**
 * Users (or events) needed per arm to detect `delta` on a KPI with this
 * baseline. Returns null when it can't be computed without more information
 * (mean KPIs need an estimate of the spread, which specs don't collect yet).
 */
export function requiredPerArm(calculation: string, baseline: number, delta: number): number | null {
  if (!delta) return null
  if (calculation === "USER_RATIO") {
    const p1 = baseline
    const p2 = baseline + delta
    if (p1 <= 0 || p1 >= 1 || p2 <= 0 || p2 >= 1) return null
    const pBar = (p1 + p2) / 2
    const a = Z_ALPHA * Math.sqrt(2 * pBar * (1 - pBar))
    const b = Z_POWER * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))
    return Math.ceil((a + b) ** 2 / delta ** 2)
  }
  if (calculation === "RATE_PER_1K") {
    // Per-user counts ≈ Poisson, so the variance is the rate itself.
    const l1 = baseline / 1000
    const l2 = (baseline + delta) / 1000
    if (l1 < 0 || l2 < 0) return null
    return Math.ceil(((Z_ALPHA + Z_POWER) ** 2 * (l1 + l2)) / (delta / 1000) ** 2)
  }
  return null
}

/**
 * Units per arm the spec expects in its observation window, from its monthly
 * volume and traffic split. The smaller arm is what limits the test.
 */
export function expectedPerArm(calculation: string, monthlyVolume: number, observationDays: number, treatmentShare: number): number {
  const perMonth = calculation === "RATE_PER_1K" ? monthlyVolume * 1000 : monthlyVolume
  return Math.floor(perMonth * (observationDays / 30) * Math.min(treatmentShare, 1 - treatmentShare))
}

/** Days of observation the spec would need for the smaller arm to reach `required`. */
export function daysNeeded(calculation: string, monthlyVolume: number, treatmentShare: number, required: number): number | null {
  const perDay = expectedPerArm(calculation, monthlyVolume, 1, treatmentShare)
  if (perDay <= 0) return null
  return Math.ceil(required / perDay)
}
