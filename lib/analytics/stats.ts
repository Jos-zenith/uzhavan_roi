// Small, dependency-free significance tests. Enough to stop a team declaring
// victory on noise; not a replacement for a proper experimentation platform.

/** Standard normal CDF (Abramowitz & Stegun 7.1.26 erf approximation). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2))
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))))
  const erf = 1 - poly * Math.exp(-(z * z) / 2)
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2
}

export type TestResult = { diff: number; se: number; pValue: number; ciLow: number; ciHigh: number }

function result(diff: number, testSe: number, ciSe: number): TestResult | null {
  if (!(testSe > 0) || !(ciSe > 0)) return null
  const z = diff / testSe
  return {
    diff,
    se: ciSe,
    pValue: 2 * (1 - normalCdf(Math.abs(z))),
    ciLow: diff - 1.96 * ciSe,
    ciHigh: diff + 1.96 * ciSe,
  }
}

/** Two-proportion z-test (pooled SE for the test, unpooled for the CI). */
export function twoProportion(x1: number, n1: number, x2: number, n2: number): TestResult | null {
  if (n1 === 0 || n2 === 0) return null
  const p1 = x1 / n1
  const p2 = x2 / n2
  const pooled = (x1 + x2) / (n1 + n2)
  const testSe = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2))
  const ciSe = Math.sqrt((p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2)
  return result(p2 - p1, testSe, ciSe)
}

export type Moments = { n: number; mean: number; variance: number }

export function moments(xs: number[]): Moments {
  const n = xs.length
  if (n === 0) return { n: 0, mean: NaN, variance: NaN }
  const mean = xs.reduce((a, b) => a + b, 0) / n
  const variance = n > 1 ? xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1) : 0
  return { n, mean, variance }
}

/**
 * Holm–Bonferroni adjusted p-values (same order as the input). Controls the
 * chance of any false win across a feature's KPIs at α, which testing each
 * KPI separately at 0.05 does not.
 */
export function holm(pValues: (number | null)[]): (number | null)[] {
  const indexed = pValues.map((p, i) => ({ p, i })).filter((x): x is { p: number; i: number } => x.p !== null)
  indexed.sort((a, b) => a.p - b.p)
  const m = indexed.length
  const adjusted: (number | null)[] = pValues.map(() => null)
  let running = 0
  indexed.forEach(({ p, i }, rank) => {
    running = Math.max(running, Math.min(1, (m - rank) * p))
    adjusted[i] = running
  })
  return adjusted
}

/**
 * Sample-ratio-mismatch check: chi-square (1 df) on how many users landed in
 * each arm vs the planned split. A tiny p-value means assignment or logging is
 * broken, and no KPI comparison from that test can be trusted.
 */
export function srmPValue(control: number, treatment: number, treatmentShare: number): number | null {
  const n = control + treatment
  if (n === 0 || treatmentShare <= 0 || treatmentShare >= 1) return null
  const eT = n * treatmentShare
  const eC = n - eT
  const chi2 = (treatment - eT) ** 2 / eT + (control - eC) ** 2 / eC
  return 2 * (1 - normalCdf(Math.sqrt(chi2)))
}

/** Welch's test on means, using the normal approximation (fine for n ≳ 30). */
export function welch(a: Moments, b: Moments): TestResult | null {
  if (a.n < 2 || b.n < 2) return null
  const se = Math.sqrt(a.variance / a.n + b.variance / b.n)
  return result(b.mean - a.mean, se, se)
}
