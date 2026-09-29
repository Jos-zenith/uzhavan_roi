import { formatInr } from "@/lib/domain"
import type { FeatureReport, KpiResult } from "@/lib/analytics/report"
import type { Gate, ReviewStatus } from "@/lib/governance"

/**
 * Plain-language summaries. Every clause is generated from a computed
 * number, so the story can't say more than the data does.
 */

/** ₹ in the units people here actually say: lakh and crore. */
export function money(n: number): string {
  const a = Math.abs(n)
  const sign = n < 0 ? "−" : ""
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(1)} crore`
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(1)} lakh`
  return `${sign}${formatInr(a)}`
}

export const longDate = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })

function value(v: number | null, unit: string): string {
  if (v === null) return "—"
  if (unit === "RATIO") return `${(v * 100).toFixed(1)}%`
  if (unit === "SECONDS") return `${Math.round(v)} seconds`
  return v.toFixed(1)
}

function kpiNoun(k: KpiResult): string {
  return k.name.replace(/ per 1,000 users/i, "").toLowerCase()
}

/**
 * "raised checkout conversion from 43.7% to 50.2%". With `soFar`, each clause
 * carries its own auxiliary ("has raised…", "hasn't measurably moved…") for a
 * test that's still running.
 */
export function kpiClause(k: KpiResult, soFar = false): string {
  const from = value(k.control.value, k.unit)
  const to = value(k.treatment.value, k.unit)
  const per1k = k.unit === "PER_1K" ? " per 1,000 users" : ""
  if (!k.significant || k.improvement === null) {
    return soFar ? `hasn't measurably moved ${kpiNoun(k)} yet` : `didn't measurably move ${kpiNoun(k)}`
  }
  const up = (k.delta ?? 0) > 0
  const verb = k.improvement > 0 ? (up ? "raised" : "cut") : up ? "pushed up" : "lowered"
  return `${soFar ? "has " : ""}${verb} ${kpiNoun(k)} from ${from} to ${to}${per1k}`
}

function joinClauses(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ""
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`
}

const returnPerRupee = (roi: number) => (1 + roi).toFixed(1)

export type Headline = { headline: string; detail: string }

export function featureHeadline(
  f: { name: string; status: string; observationDays: number; horizonMonths: number; releasedAt: Date | null },
  report: FeatureReport,
  gate: Gate,
): Headline {
  const failing = gate.checks.filter((c) => !c.ok)
  const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1).replaceAll("`", "")

  if (f.status === "DRAFT" || f.status === "SPEC_APPROVED") {
    return failing.length === 0
      ? { headline: "The spec is complete and signed off.", detail: "It can move to the next stage." }
      : {
          headline: `Not ready to build: ${failing.length} of ${gate.checks.length} spec checks still fail.`,
          detail: `Missing: ${failing.map((c) => lower(c.label)).join("; ")}.`,
        }
  }
  if (f.status === "IN_DEVELOPMENT") {
    return failing.length === 0
      ? { headline: "Built and fully instrumented. Ready to ship.", detail: "Every event its KPIs need has been received." }
      : {
          headline: `Built, but it can't ship: ${failing.length} required ${failing.length === 1 ? "event has" : "events have"} never arrived.`,
          detail: "Without them, its KPIs couldn't be measured after launch. That's the one thing this gate exists to prevent.",
        }
  }

  // A kill outranks everything else about the feature.
  const tripped = report.kpis.filter((k) => k.tripped)
  if (report.killed || tripped.length > 0) {
    const what = joinClauses(
      tripped.map((k) => `${kpiNoun(k)} rose from ${value(k.control.value, k.unit)} to ${value(k.treatment.value, k.unit)}`),
    )
    return {
      headline: `${f.name} was switched off on day ${report.observedDays} by its guardrail${what ? `: ${what}` : ""}.`,
      detail: "The kill switch served control to everyone automatically, no meeting required. An incident ticket is open.",
    }
  }

  // Proven changes lead; "didn't measurably move" comes last. Guardrails get their own clause.
  const ordered = report.kpis.filter((k) => k.role === "PRIMARY").sort((a, b) => Number(b.significant) - Number(a.significant))
  const guards = report.kpis.filter((k) => k.role === "GUARDRAIL")
  const guardNote = guards.length === 0 ? "" : `, while ${joinClauses(guards.map((k) => kpiNoun(k)))} held steady`
  const net = report.totalBenefit - report.totalCost
  // Proven effects get a clause each; everything unproven shares one ("…or…").
  const summarise = (soFar: boolean) => {
    const proven = ordered.filter((k) => k.significant && k.improvement !== null).map((k) => kpiClause(k, soFar))
    const flat = ordered.filter((k) => !k.significant || k.improvement === null).map((k) => kpiNoun(k))
    const nouns = flat.length <= 1 ? (flat[0] ?? "") : `${flat.slice(0, -1).join(", ")} or ${flat.at(-1)}`
    if (flat.length > 0) proven.push(soFar ? `hasn't measurably moved ${nouns} yet` : `didn't measurably move ${nouns}`)
    return joinClauses(proven)
  }
  if (!report.credible && !report.windowMet && f.releasedAt) {
    const closes = new Date(f.releasedAt.getTime() + f.observationDays * 86_400_000)
    return {
      headline: `${report.observedDays} days into a ${f.observationDays}-day test, ${f.name} ${summarise(true)}${guardNote}.`,
      detail: `None of it counts until the window closes on ${longDate(closes)}. Early lifts often shrink.`,
    }
  }
  const clauses = summarise(false) + guardNote
  const sentence = `${f.name} ${clauses}.`
  if (!report.sampleMet) return { headline: sentence, detail: "But one arm is below the minimum sample, so the result isn't final." }
  const roi = report.roi ?? 0
  return {
    headline: sentence,
    detail:
      roi >= 0
        ? `At this rate it returns ₹${returnPerRupee(roi)} for every ₹1 it costs over ${f.horizonMonths} months: ${money(net)} net.`
        : `At this rate it costs ${money(-net)} more than it proves over ${f.horizonMonths} months.`,
  }
}

export type AttentionItem = {
  tone: "urgent" | "soon" | "info"
  title: string
  detail: string
  checks?: string[]
  href: string
  action: string
}

type Row = { f: { key: string; name: string; status: string }; report: FeatureReport; gate: Gate; review: ReviewStatus }

export function briefing(rows: Row[], quarantined: { flag: string; events: number; users: number }[]) {
  const live = rows.filter((r) => r.f.status === "SHIPPED" || r.f.status === "RETIRED")
  const credible = live.filter((r) => r.report.credible && r.report.roi !== null)
  const best = [...credible].sort((a, b) => b.report.roi! - a.report.roi!)[0]
  // Only still-running features are "on track to lose" anything; retired ones are already dealt with.
  const worst = credible.filter((r) => r.f.status === "SHIPPED" && r.report.recommendation.kind !== "KILLED").sort((a, b) => a.report.totalBenefit - a.report.totalCost - (b.report.totalBenefit - b.report.totalCost))[0]

  const lines: string[] = []
  if (best && best.report.roi! > 0) {
    lines.push(`${best.f.name} returns ₹${returnPerRupee(best.report.roi!)} for every ₹1 it costs.`)
  }
  if (worst && worst !== best && worst.report.totalBenefit < worst.report.totalCost) {
    const loss = money(worst.report.totalCost - worst.report.totalBenefit)
    lines.push(
      worst.review.kind === "OVERDUE"
        ? `${worst.f.name} is on track to lose ${loss}, and its review is ${worst.review.days} days overdue.`
        : `${worst.f.name} is on track to lose ${loss}.`,
    )
  }
  const measuring = live.length - credible.length
  const summary = `${credible.length} of ${live.length} live features have final results${measuring > 0 ? `; ${measuring} ${measuring === 1 ? "is" : "are"} still inside ${measuring === 1 ? "its" : "their"} test window` : ""}.`

  const items: AttentionItem[] = []
  for (const r of rows) {
    const failing = r.gate.checks.filter((c) => !c.ok)
    if (r.report.recommendation.kind === "KILLED") {
      items.push({
        tone: "urgent",
        title: `${r.f.name} was killed by its guardrail`,
        detail: r.report.recommendation.reason,
        href: `/features/${r.f.key}`,
        action: "See what tripped",
      })
      continue
    }
    if (r.review.kind === "OVERDUE") {
      items.push({
        tone: "urgent",
        title: `Decide on ${r.f.name}`,
        detail: `Results have been final since ${longDate(r.review.since)}. ${r.report.recommendation.reason}`,
        href: `/features/${r.f.key}#review`,
        action: "Record a decision",
      })
    } else if (r.report.srm && !r.report.srm.ok) {
      items.push({
        tone: "urgent",
        title: `${r.f.name}: the traffic split is broken`,
        detail: `Planned ${Math.round(r.report.srm.expectedShare * 100)}% treatment, observed ${(r.report.srm.observedShare * 100).toFixed(1)}%. Fix assignment before trusting any result from this test.`,
        href: `/features/${r.f.key}`,
        action: "Investigate",
      })
    } else if (r.review.kind === "DUE") {
      const final = r.report.credibility.credibleOn
      items.push({
        tone: "info",
        title: `${r.f.name}: final on ${longDate(final ?? r.review.at)}`,
        detail:
          "Its test window is still open. Don't expand the rollout on early numbers." +
          (r.report.kpis.some((k) => k.role === "PRIMARY" && !k.significant && k.power.required !== null && !k.power.reached && k.power.reachedOn && k.power.reachedOn.getTime() - Date.now() > 365 * 86_400_000)
            ? " One of its KPIs can't be proven at this traffic, so judge it on the others."
            : ""),
        href: `/features/${r.f.key}`,
        action: "See early read",
      })
    }
    if (r.gate.next && failing.length > 0) {
      items.push({
        tone: r.f.status === "IN_DEVELOPMENT" ? "soon" : "info",
        title: r.f.status === "IN_DEVELOPMENT" ? `${r.f.name} can't ship yet` : `${r.f.name} can't start development`,
        detail: `${failing.length} of ${r.gate.checks.length} gate checks failing:`,
        checks: failing.map((c) => c.label),
        href: `/features/${r.f.key}`,
        action: "Open spec",
      })
    }
  }
  for (const q of quarantined) {
    items.push({
      tone: "soon",
      title: `Nobody owns \`${q.flag}\``,
      detail: `${q.events.toLocaleString("en-IN")} events from ${q.users.toLocaleString("en-IN")} users are quarantined: kept, but kept out of every number until someone registers a spec.`,
      href: `/features/new?flag=${encodeURIComponent(q.flag)}`,
      action: "Register a spec",
    })
  }
  const order = { urgent: 0, soon: 1, info: 2 }
  items.sort((a, b) => order[a.tone] - order[b.tone])

  return { headline: lines.join(" ") || "No feature has final results yet.", summary, items }
}
