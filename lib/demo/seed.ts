/**
 * The demo scenario: Vayal (வயல், "field"), a fictional farmer app for
 * inputs, subsidies and market prices. Seven features, each at a different
 * point in the lifecycle, with synthetic events whose true effects are known,
 * so every verdict the ROI layer reaches can be checked against the truth:
 *
 *   one_tap_reorder     A/B, clear win, guardrail clean           → SCALE (decided; roadmap ticket)
 *   mandi_price_alerts  pre/post + holdout districts: the "lift"  → RETIRE (mostly the harvest)
 *   ai_crop_advisor     A/B, no lift, more tickets, expensive      → RETIRE (review overdue)
 *   upi_autopay         A/B, running; payment-failure guardrail    → KEEP MEASURING, near the kill line
 *   tamil_voice_search  20% phased rollout, window still open      → KEEP MEASURING
 *   offline_forms       in development, instrumentation missing    → blocked at release gate
 *   bulk_mandi_booking  draft spec                                 → blocked at spec gate
 *   (dark_mode)         events from a flag with no spec            → quarantined
 *
 * Everything here is invented. Nothing is data from any real app.
 */
import type { PrismaClient } from "../generated/tnimpact/client"

export const DEMO_APP = "vayal"

const DAY = 86_400_000
const HOUR = 3_600_000
const DISTRICTS = ["Thanjavur", "Madurai", "Coimbatore", "Tiruchirappalli", "Salem", "Tirunelveli", "Villupuram", "Erode"]
const HOLDOUT = ["Salem", "Erode"]

type Ev = {
  eventId: string
  timestamp: Date
  receivedAt: Date
  app: string
  release: string
  userId: string
  sessionId: string
  featureFlag: string | null
  variant: string | null
  action: string
  value: number | null
  context: string
}

// Deterministic PRNG so every seed produces the same verdicts.
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export async function seedDemo(db: PrismaClient): Promise<{ kpis: number; features: number; events: number }> {
  const NOW = Date.now()
  const rand = mulberry32(2603)
  const chance = (p: number) => rand() < p
  const gaussian = (mean: number, sd: number) => {
    const u = 1 - rand()
    const v = rand()
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
  const events: Ev[] = []
  let seq = 0

  const user = (prefix: string, i: number) => {
    const userId = `${prefix}-${i.toString().padStart(5, "0")}`
    return { userId, sessionId: `${userId}-s1` }
  }

  /** Emit a user's events from a random start inside [from, to). ~4% arrive late, like phones that were offline. */
  const emit = (
    u: { userId: string; sessionId: string },
    from: number,
    to: number,
    flag: string | null,
    variant: string | null,
    steps: { action: string; value?: number; afterSec?: number }[],
    release = "4.2.0",
    district = DISTRICTS[Math.floor(rand() * DISTRICTS.length)],
  ) => {
    let t = from + rand() * (to - from)
    const lateBy = chance(0.04) ? (2 + rand() * 34) * HOUR : 0
    for (const s of steps) {
      t += (s.afterSec ?? 5) * 1000
      const timestamp = new Date(Math.min(t, NOW - 1000))
      events.push({
        eventId: `seed-${++seq}`,
        timestamp,
        receivedAt: new Date(Math.min(timestamp.getTime() + lateBy, NOW - 500)),
        app: DEMO_APP,
        release,
        userId: u.userId,
        sessionId: u.sessionId,
        featureFlag: flag,
        variant,
        action: s.action,
        value: s.value ?? null,
        context: JSON.stringify({ district }),
      })
    }
  }

  await db.ticket.deleteMany()
  await db.event.deleteMany()
  await db.reviewNote.deleteMany()
  await db.costEntry.deleteMany()
  await db.featureKpi.deleteMany()
  await db.feature.deleteMany()
  await db.kpiDefinition.deleteMany()

  // ── KPI catalogue ──────────────────────────────────────────────────────
  const kpiRows = [
    { key: "checkout_conversion", name: "Checkout conversion", category: "REVENUE", direction: "UP", calculation: "USER_RATIO", numeratorAction: "checkout_completed", denominatorAction: "checkout_started", description: "Share of users who start a checkout and complete it." },
    { key: "time_to_checkout", name: "Time to checkout", category: "PRODUCTIVITY", direction: "DOWN", calculation: "MEAN_VALUE", numeratorAction: "checkout_completed", denominatorAction: null, description: "Mean seconds from checkout start to completion; sent as the `value` of checkout_completed." },
    { key: "payment_failure_rate", name: "Payment failure rate", category: "RISK", direction: "DOWN", calculation: "USER_RATIO", numeratorAction: "payment_failed", denominatorAction: "checkout_started", description: "Share of users who start a checkout and hit a failed payment. The usual guardrail for anything touching checkout." },
    { key: "search_success_rate", name: "Search success rate", category: "EXPERIENCE", direction: "UP", calculation: "USER_RATIO", numeratorAction: "search_result_opened", denominatorAction: "search_performed", description: "Share of searching users who open at least one result." },
    { key: "support_tickets_per_1k", name: "Support tickets per 1,000 users", category: "COST", direction: "DOWN", calculation: "RATE_PER_1K", numeratorAction: "support_ticket_created", denominatorAction: "session_started", description: "Support tickets raised per 1,000 active users." },
    { key: "advice_acceptance_rate", name: "Advice acceptance rate", category: "REVENUE", direction: "UP", calculation: "USER_RATIO", numeratorAction: "advice_accepted", denominatorAction: "advice_viewed", description: "Share of users shown crop advice who act on it (buy the recommended input)." },
    { key: "produce_sale_rate", name: "Produce sale rate", category: "REVENUE", direction: "UP", calculation: "USER_RATIO", numeratorAction: "produce_sold", denominatorAction: "produce_listed", description: "Share of farmers who list produce and sell it through the app." },
    { key: "errors_per_1k", name: "Errors per 1,000 users", category: "RISK", direction: "DOWN", calculation: "RATE_PER_1K", numeratorAction: "error_shown", denominatorAction: "session_started", description: "User-visible errors per 1,000 active users." },
    { key: "form_completion_time", name: "Form completion time", category: "PRODUCTIVITY", direction: "DOWN", calculation: "MEAN_VALUE", numeratorAction: "form_submitted", denominatorAction: null, description: "Mean seconds to complete a scheme application form; sent as the `value` of form_submitted." },
  ] as const
  const unit = { USER_RATIO: "RATIO", MEAN_VALUE: "SECONDS", RATE_PER_1K: "PER_1K" } as const
  const kpi: Record<string, string> = {}
  for (const k of kpiRows) {
    const row = await db.kpiDefinition.create({ data: { ...k, unit: unit[k.calculation] } })
    kpi[k.key] = row.id
  }

  const approved = {
    productApproved: true,
    engineeringApproved: true,
    analyticsApproved: true,
    financeApproved: true,
    engineeringApprovedBy: "S. Prakash (Engineering lead)",
    analyticsApprovedBy: "N. Fathima (Analytics)",
    financeApprovedBy: "R. Lakshmi (Finance)",
  }
  const goals = (...g: [string, string][]) => JSON.stringify(g.map(([type, statement]) => ({ type, statement })))

  // ── 1. One-tap reorder: A/B, clear win, guardrail clean ────────────────
  {
    const released = NOW - 42 * DAY
    await db.feature.create({
      data: {
        key: "one_tap_reorder", name: "One-tap input reorder", team: "Marketplace", owner: "Kavya R. (Marketplace PM)",
        summary: "Lets a farmer reorder last season's seeds and fertiliser in one tap instead of a four-step cart.",
        goals: goals(["REVENUE", "Lift input-purchase conversion by 5 pp"], ["PRODUCTIVITY", "Cut checkout time by 20 seconds"]),
        attributionMethod: "AB_TEST", segment: "Returning buyers with ≥1 past order, all districts, 50/50 split",
        minSamplePerArm: 400, observationDays: 28, status: "SHIPPED", releaseVersion: "4.2.0", releasedAt: new Date(released),
        qualitativeBenefits: "Farmers in field interviews describe reordering as 'finally simple'.",
        decision: "SCALE",
        decisionNote: "Both KPIs beat target with p < 0.001, and payment failures didn't move. Roll out to 100% of returning buyers in 4.3.",
        decidedAt: new Date(NOW - 10 * DAY),
        ...approved, productApprovedBy: "Kavya R. (Marketplace PM)",
        kpis: {
          create: [
            { kpiId: kpi.checkout_conversion, baseline: 0.42, targetDelta: 0.05, monthlyVolume: 20000, valuePerUnit: 120, valueLow: 80, valueHigh: 150, valueSource: "Average margin per input order, FY25 finance ledger (illustrative)" },
            { kpiId: kpi.time_to_checkout, baseline: 95, targetDelta: -20, monthlyVolume: 9000, valuePerUnit: 0.5, valueLow: 0.2, valueHigh: 0.8, valueSource: "Analytics model: fewer abandoned carts per second saved (illustrative)" },
            { kpiId: kpi.payment_failure_rate, role: "GUARDRAIL", baseline: 0.025, targetDelta: 0.01, monthlyVolume: 20000, valuePerUnit: 60, valueSource: "Refund and support cost per failed payment (illustrative)" },
          ],
        },
        costs: {
          create: [
            { category: "DEVELOPMENT", recurrence: "ONE_TIME", amount: 900000, note: "2 engineers × 6 weeks" },
            { category: "INFRASTRUCTURE", recurrence: "MONTHLY", amount: 20000, note: "Order-history cache" },
            { category: "SUPPORT", recurrence: "MONTHLY", amount: 10000, note: "Reorder disputes" },
          ],
        },
      },
    })
    for (const variant of ["control", "treatment"] as const) {
      for (let i = 0; i < 1500; i++) {
        const t = variant === "treatment"
        const steps: { action: string; value?: number; afterSec?: number }[] = [
          { action: "session_started", afterSec: 0 },
          { action: "feature_exposed", afterSec: 2 },
          { action: "checkout_started", afterSec: 20 },
        ]
        if (chance(0.025)) steps.push({ action: "payment_failed", afterSec: 30 })
        else if (chance(t ? 0.5 : 0.42)) {
          const secs = Math.max(10, gaussian(t ? 70 : 95, t ? 20 : 25))
          steps.push({ action: "checkout_completed", value: Math.round(secs), afterSec: secs })
        }
        emit(user(`otr-${variant[0]}`, i), released, NOW, "one_tap_reorder", variant, steps)
      }
    }
  }

  // ── 2. Mandi price alerts: pre/post with holdout districts ─────────────
  // Everyone's sale rate rises ~4 pp with the kuruvai harvest; the alerts
  // themselves add ~1 pp in the districts that get them. Naive pre/post
  // would credit the feature with the harvest. The holdout doesn't.
  {
    const released = NOW - 35 * DAY
    const span = 28 * DAY
    await db.feature.create({
      data: {
        key: "mandi_price_alerts", name: "Mandi price alerts", team: "Market Linkage", owner: "Arun S. (Market Linkage PM)",
        summary: "Push alert when the nearest mandi price for a listed crop crosses the farmer's ask price.",
        goals: goals(["REVENUE", "Sell more listed produce through the app"]),
        attributionMethod: "PRE_POST", holdoutDistricts: HOLDOUT.join(","),
        segment: "All farmers with an active listing. Alerts go district-wide, so Salem and Erode are held out to measure the season.",
        minSamplePerArm: 500, observationDays: 28, status: "SHIPPED", releaseVersion: "4.1.0", releasedAt: new Date(released),
        ...approved, productApprovedBy: "Arun S. (Market Linkage PM)",
        kpis: {
          create: [
            { kpiId: kpi.produce_sale_rate, baseline: 0.3, targetDelta: 0.05, monthlyVolume: 15000, valuePerUnit: 35, valueLow: 25, valueHigh: 45, valueSource: "Platform fee per completed produce sale (illustrative)" },
          ],
        },
        costs: {
          create: [
            { category: "DEVELOPMENT", recurrence: "ONE_TIME", amount: 250000, note: "1 engineer × 3 weeks" },
            { category: "INFRASTRUCTURE", recurrence: "MONTHLY", amount: 5000, note: "Agmarknet price feed + push" },
          ],
        },
      },
    })
    for (const phase of ["pre", "post"] as const) {
      const from = phase === "pre" ? released - span : released
      for (let i = 0; i < 2400; i++) {
        const district = DISTRICTS[i % DISTRICTS.length]
        const holdout = HOLDOUT.includes(district)
        const p = 0.3 + (phase === "post" ? 0.04 + (holdout ? 0 : 0.01) : 0)
        const steps = [{ action: "produce_listed", afterSec: 0 }]
        if (chance(p)) steps.push({ action: "produce_sold", afterSec: 3600 })
        const u = user(`mpa-${phase}`, i)
        emit(u, from, from + span, null, null, steps, phase === "pre" ? "4.0.3" : "4.1.0", district)
        if (phase === "post" && !holdout) emit(u, from, from + span, "mandi_price_alerts", "treatment", [{ action: "feature_exposed" }], "4.1.0", district)
      }
    }
  }

  // ── 3. AI crop advisor: A/B, expensive and makes things worse ──────────
  {
    const released = NOW - 60 * DAY
    await db.feature.create({
      data: {
        key: "ai_crop_advisor", name: "AI crop advisor", team: "Agronomy", owner: "Meena P. (Agronomy PM)",
        summary: "LLM chat that recommends fertiliser and pesticide doses from a photo of the crop.",
        goals: goals(["REVENUE", "More farmers buy the recommended input"], ["COST_SAVINGS", "Deflect agronomy questions from the call centre"]),
        attributionMethod: "AB_TEST", segment: "Paddy and banana growers in delta districts, 50/50 split",
        minSamplePerArm: 400, observationDays: 28, status: "SHIPPED", releaseVersion: "4.0.0", releasedAt: new Date(released),
        ...approved, productApprovedBy: "Meena P. (Agronomy PM)",
        kpis: {
          create: [
            { kpiId: kpi.advice_acceptance_rate, baseline: 0.3, targetDelta: 0.1, monthlyVolume: 12000, valuePerUnit: 150, valueLow: 100, valueHigh: 200, valueSource: "Average margin on recommended inputs (illustrative)" },
            { kpiId: kpi.support_tickets_per_1k, baseline: 10, targetDelta: -4, monthlyVolume: 25, valuePerUnit: 150, valueLow: 120, valueHigh: 220, valueSource: "Call-centre budget ÷ tickets handled, FY25 (illustrative)" },
          ],
        },
        costs: {
          create: [
            { category: "DEVELOPMENT", recurrence: "ONE_TIME", amount: 1200000, note: "2 engineers × 8 weeks + agronomist review" },
            { category: "INFRASTRUCTURE", recurrence: "MONTHLY", amount: 50000, note: "Vision + LLM inference" },
            { category: "MAINTENANCE", recurrence: "MONTHLY", amount: 20000, note: "Prompt and model upkeep" },
          ],
        },
      },
    })
    for (const variant of ["control", "treatment"] as const) {
      for (let i = 0; i < 1200; i++) {
        const t = variant === "treatment"
        const steps: { action: string; afterSec?: number }[] = [
          { action: "session_started", afterSec: 0 },
          { action: "feature_exposed" },
          { action: "advice_viewed", afterSec: 30 },
        ]
        if (chance(t ? 0.31 : 0.3)) steps.push({ action: "advice_accepted", afterSec: 120 })
        if (chance(t ? 0.03 : 0.01)) steps.push({ action: "support_ticket_created", afterSec: 600 })
        emit(user(`aca-${variant[0]}`, i), released, NOW, "ai_crop_advisor", variant, steps)
      }
    }
  }

  // ── 4. UPI autopay: running, payment-failure guardrail near its line ───
  {
    const released = NOW - 6 * DAY
    await db.feature.create({
      data: {
        key: "upi_autopay", name: "UPI autopay for inputs", team: "Payments", owner: "Suresh N. (Payments PM)",
        summary: "Pay for seasonal inputs with a UPI autopay mandate instead of paying at every order.",
        goals: goals(["REVENUE", "Lift checkout conversion by 3 pp"]),
        attributionMethod: "AB_TEST", segment: "Buyers with a linked UPI id, all districts, 50/50 split",
        minSamplePerArm: 400, observationDays: 21, status: "SHIPPED", releaseVersion: "4.3.1", releasedAt: new Date(released),
        ...approved, productApprovedBy: "Suresh N. (Payments PM)",
        kpis: {
          create: [
            { kpiId: kpi.checkout_conversion, baseline: 0.42, targetDelta: 0.03, monthlyVolume: 18000, valuePerUnit: 120, valueLow: 80, valueHigh: 150, valueSource: "Average margin per input order, FY25 finance ledger (illustrative)" },
            { kpiId: kpi.payment_failure_rate, role: "GUARDRAIL", baseline: 0.025, targetDelta: 0.01, monthlyVolume: 18000, valuePerUnit: 60, valueSource: "Refund and support cost per failed payment (illustrative)" },
          ],
        },
        costs: {
          create: [
            { category: "DEVELOPMENT", recurrence: "ONE_TIME", amount: 400000, note: "Mandate flow + bank callbacks" },
            { category: "INFRASTRUCTURE", recurrence: "MONTHLY", amount: 8000, note: "Payment gateway mandate fees" },
          ],
        },
      },
    })
    for (const variant of ["control", "treatment"] as const) {
      for (let i = 0; i < 350; i++) {
        const t = variant === "treatment"
        const steps: { action: string; afterSec?: number }[] = [
          { action: "session_started", afterSec: 0 },
          { action: "feature_exposed", afterSec: 2 },
          { action: "checkout_started", afterSec: 20 },
        ]
        if (chance(t ? 0.05 : 0.025)) steps.push({ action: "payment_failed", afterSec: 25 })
        else if (chance(t ? 0.47 : 0.42)) steps.push({ action: "checkout_completed", afterSec: 40 })
        emit(user(`upi-${variant[0]}`, i), released, NOW, "upi_autopay", variant, steps, "4.3.1")
      }
    }
  }

  // ── 5. Tamil voice search: phased rollout, still inside its window ─────
  {
    const released = NOW - 18 * DAY
    await db.feature.create({
      data: {
        key: "tamil_voice_search", name: "Tamil voice search", team: "Discovery", owner: "Karthik V. (Discovery PM)",
        summary: "Search schemes, inputs and prices by speaking in Tamil instead of typing.",
        goals: goals(["EXPERIENCE", "More searches end in a useful result"], ["COST_SAVINGS", "Fewer 'can't find it' support calls"]),
        attributionMethod: "PHASED_ROLLOUT", treatmentShare: 0.2, segment: "20% of Android users on app ≥ 4.3, expanding to 50% after the window",
        minSamplePerArm: 400, observationDays: 28, status: "SHIPPED", releaseVersion: "4.3.0", releasedAt: new Date(released),
        ...approved, productApprovedBy: "Karthik V. (Discovery PM)",
        kpis: {
          create: [
            { kpiId: kpi.search_success_rate, baseline: 0.55, targetDelta: 0.08, monthlyVolume: 40000, valuePerUnit: 6, valueLow: 3, valueHigh: 10, valueSource: "Assisted orders per successful search, analytics estimate (illustrative)" },
            { kpiId: kpi.support_tickets_per_1k, baseline: 12, targetDelta: -3, monthlyVolume: 80, valuePerUnit: 250, valueLow: 150, valueHigh: 300, valueSource: "Call-centre budget ÷ tickets handled, FY25 (illustrative)" },
          ],
        },
        costs: {
          create: [
            { category: "DEVELOPMENT", recurrence: "ONE_TIME", amount: 700000, note: "Speech model fine-tuning + UI" },
            { category: "INFRASTRUCTURE", recurrence: "MONTHLY", amount: 25000, note: "Speech-to-text" },
          ],
        },
      },
    })
    for (const [variant, n] of [["control", 2000], ["treatment", 500]] as const) {
      for (let i = 0; i < n; i++) {
        const t = variant === "treatment"
        const steps: { action: string; afterSec?: number }[] = [
          { action: "session_started", afterSec: 0 },
          { action: "feature_exposed" },
          { action: "search_performed", afterSec: 10 },
        ]
        if (chance(t ? 0.61 : 0.55)) steps.push({ action: "search_result_opened" })
        if (chance(t ? 0.009 : 0.012)) steps.push({ action: "support_ticket_created", afterSec: 300 })
        emit(user(`tvs-${variant[0]}`, i), released, NOW, "tamil_voice_search", variant, steps, "4.3.0")
      }
    }
  }

  // ── 6. Offline forms: in development, instrumentation incomplete ───────
  await db.feature.create({
    data: {
      key: "offline_forms", name: "Offline scheme applications", team: "Schemes", owner: "Divya K. (Schemes PM)",
      summary: "Fill subsidy application forms without signal; sync when the phone reconnects.",
      goals: goals(["PRODUCTIVITY", "Cut form completion time for low-connectivity villages"], ["RISK_REDUCTION", "Fewer failed submissions"]),
      attributionMethod: "AB_TEST", segment: "Users whose last 3 sessions had < 1 Mbps, 50/50 split",
      minSamplePerArm: 300, observationDays: 21, status: "IN_DEVELOPMENT",
      ...approved, productApprovedBy: "Divya K. (Schemes PM)",
      kpis: {
        create: [
          { kpiId: kpi.form_completion_time, baseline: 540, targetDelta: -120, monthlyVolume: 6000, valuePerUnit: 0.3, valueLow: 0.2, valueHigh: 0.5, valueSource: "Field-officer time on assisted applications (illustrative)" },
          { kpiId: kpi.errors_per_1k, baseline: 45, targetDelta: -20, monthlyVolume: 30, valuePerUnit: 400, valueLow: 250, valueHigh: 500, valueSource: "Cost to resolve a failed submission (illustrative)" },
        ],
      },
      costs: { create: [{ category: "DEVELOPMENT", recurrence: "ONE_TIME", amount: 600000, note: "Local-first sync layer" }] },
    },
  })
  // Staging traffic: only some of the required events are wired up yet.
  for (let i = 0; i < 25; i++) {
    emit(user("off-stg", i), NOW - 3 * DAY, NOW, "offline_forms", "treatment", [
      { action: "feature_exposed", afterSec: 0 },
      { action: "form_submitted", value: Math.round(gaussian(400, 60)), afterSec: 400 },
    ], "4.4.0-beta")
  }

  // ── 7. Bulk mandi booking: draft spec, incomplete ──────────────────────
  await db.feature.create({
    data: {
      key: "bulk_mandi_booking", name: "Bulk mandi slot booking", team: "Market Linkage", owner: "Arun S. (Market Linkage PM)",
      summary: "FPOs book unloading slots at the regulated market for a whole truck of members' produce.",
      goals: goals(["PRODUCTIVITY", "Cut waiting time at the mandi gate"]),
      attributionMethod: "PRE_POST", segment: "Registered FPOs in Salem and Erode",
      minSamplePerArm: 50, observationDays: 14, productApproved: true, productApprovedBy: "Arun S. (Market Linkage PM)",
      kpis: { create: [{ kpiId: kpi.produce_sale_rate, baseline: 0.3, targetDelta: 0.04, monthlyVolume: 0, valuePerUnit: 0 }] },
    },
  })

  // ── Review logs, decisions and tickets ─────────────────────────────────
  // Figures quoted here match what the ROI layer computes from this seed.
  // Anything beyond the telemetry is framed as a hypothesis, not a finding.
  const ids = Object.fromEntries((await db.feature.findMany({ select: { key: true, id: true } })).map((f) => [f.key, f.id]))
  const log: [string, number, string, "NOTE" | "DECISION" | "SYSTEM", string][] = [
    ["one_tap_reorder", 42, "Release gate", "SYSTEM", "Gate passed (4/4 checks): In development → Shipped in 4.2.0."],
    ["one_tap_reorder", 40, "Kavya R. (Marketplace PM)", "NOTE", "Scope reminder: the test only covers returning buyers. First-time buyers have no past order to reorder, so don't extrapolate this result to them."],
    ["one_tap_reorder", 12, "Kavya R. (Marketplace PM)", "NOTE", "Window closed at day 28 and both arms are well past 400 users. Conversion +6.7 pp and checkout 24s faster, both p < 0.001, and both beat target. The payment-failure guardrail didn't move. Proposing we scale to 100% in 4.3."],
    ["one_tap_reorder", 10, "Portfolio review", "DECISION", "Scale. Both KPIs beat target with p < 0.001, and payment failures didn't move. Roll out to 100% of returning buyers in 4.3."],

    ["mandi_price_alerts", 35, "Release gate", "SYSTEM", "Gate passed (4/4 checks): In development → Shipped in 4.1.0."],
    ["mandi_price_alerts", 34, "Arun S. (Market Linkage PM)", "NOTE", "Alerts go to a whole district, so no user-level A/B. We're holding Salem and Erode back as holdout districts, so the season doesn't get credited to the feature."],
    ["mandi_price_alerts", 5, "Arun S. (Market Linkage PM)", "NOTE", "Glad we held out. Sale rate rose about 7 pp in the alert districts, but also about 4 pp in Salem and Erode, which got no alerts. That's the kuruvai harvest, not us. What's left for the feature (~3 pp) isn't distinguishable from zero (p = 0.35). Naive pre/post would have called this a win. Recommending retire at the next review."],

    ["ai_crop_advisor", 60, "Release gate", "SYSTEM", "Gate passed (5/5 checks): In development → Shipped in 4.0.0."],
    ["ai_crop_advisor", 45, "Meena P. (Agronomy PM)", "NOTE", "Two weeks in: acceptance looks flat and support tickets are running higher in treatment. Too early to call; leaving it on."],
    ["ai_crop_advisor", 25, "Meena P. (Agronomy PM)", "NOTE", "Window closed. Acceptance didn't move (p = 0.93). Tickets went from 8.3 to 35.0 per 1,000 users (p < 0.001), so the feature is creating support load, not removing it. With ₹70k/month to run, every month on costs money twice."],
    ["ai_crop_advisor", 24, "Meena P. (Agronomy PM)", "NOTE", "Recommending retire at the next portfolio review. Open question for any v2, not answered by this data: are the tickets about wrong advice, or about advice farmers couldn't act on? We should sample the tickets before building anything else here."],

    ["upi_autopay", 6, "Release gate", "SYSTEM", "Gate passed (4/4 checks): In development → Shipped in 4.3.1."],
    ["upi_autopay", 1, "Suresh N. (Payments PM)", "NOTE", "Day 5. Payment failures are running higher in treatment than control. Not beyond noise yet, and the guardrail will cut the feature off automatically if it gets there. Watching the bank-callback timeouts in the meantime."],

    ["tamil_voice_search", 18, "Release gate", "SYSTEM", "Gate passed (5/5 checks): In development → Shipped in 4.3.0."],
    ["tamil_voice_search", 1, "Karthik V. (Discovery PM)", "NOTE", "Day 17 of 28. Search success is up ~5 pp in the 20% cohort, but not significant yet, and the ticket rate hasn't moved measurably. Nothing is proven, so the ROI shows the full cost for now. Holding at 20% until the window closes; early lifts often shrink."],

    ["offline_forms", 20, "Release gate", "SYSTEM", "Gate passed (1/1 checks): Spec approved → In development."],
    ["offline_forms", 1, "Release gate", "SYSTEM", "Gate refused: In development → Shipped. Failing: Event error_shown received with flag offline_forms; Event session_started received with flag offline_forms."],
    ["offline_forms", 1, "Divya K. (Schemes PM)", "NOTE", "Fair refusal. The staging build only sends feature_exposed and form_submitted. Without error_shown we couldn't measure the risk goal at all. Ship date moves until both events are wired."],

    ["bulk_mandi_booking", 6, "Arun S. (Market Linkage PM)", "NOTE", "Spec is incomplete on purpose: no monthly volume until the market committee shares FPO registration numbers, so there's nothing honest to put in the ROI model yet. Analytics won't sign off without it, which is the right call."],
  ]
  await db.reviewNote.createMany({
    data: log.map(([key, daysAgo, author, kind, body]) => ({
      featureId: ids[key],
      author,
      kind,
      body,
      createdAt: new Date(NOW - daysAgo * DAY + 9.5 * HOUR * rand()),
    })),
  })
  await db.ticket.create({
    data: {
      featureId: ids.one_tap_reorder,
      kind: "ROADMAP",
      title: "Roll out One-tap input reorder to 100% of returning buyers",
      body: "Scale decision from portfolio review. Conversion +6.7 pp and checkout 24s faster (both p < 0.001); payment-failure guardrail clean. Ship in 4.3.",
      createdAt: new Date(NOW - 10 * DAY),
    },
  })

  // ── Events for a flag nobody registered (a governance gap) ─────────────
  for (let i = 0; i < 40; i++) {
    emit(user("dm", i), NOW - 10 * DAY, NOW, "dark_mode", "treatment", [{ action: "feature_exposed", afterSec: 0 }], "4.3.0")
  }

  // The seed bypasses the ingest API, so apply its registry rule here too.
  const registered = new Set((await db.feature.findMany({ select: { key: true } })).map((f) => f.key))
  const rows = events.map((e) => ({ ...e, quarantined: !!e.featureFlag && !registered.has(e.featureFlag) }))
  for (let i = 0; i < rows.length; i += 2000) {
    await db.event.createMany({ data: rows.slice(i, i + 2000) })
  }
  return { kpis: kpiRows.length, features: Object.keys(ids).length, events: events.length }
}
