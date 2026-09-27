/**
 * Demo data: a KPI catalogue and six features of the Uzhavan farmer app, one
 * at each lifecycle stage, with synthetic events whose true effects are known
 * so the ROI layer's verdicts can be checked:
 *
 *   one_tap_reorder     A/B, clear win on two KPIs              → SCALE
 *   mandi_price_alerts  pre/post, modest win                    → ITERATE
 *   ai_crop_advisor     A/B, no lift + more tickets, expensive  → RETIRE
 *   tamil_voice_search  phased rollout, window not over yet     → KEEP MEASURING
 *   offline_forms       in development, instrumentation missing → blocked at release gate
 *   bulk_mandi_booking  draft spec, approvals missing           → blocked at spec gate
 */
import { db } from "../lib/db"

const DAY = 86_400_000
const NOW = Date.now()

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
const rand = mulberry32(2603)
const chance = (p: number) => rand() < p
const gaussian = (mean: number, sd: number) => {
  const u = 1 - rand()
  const v = rand()
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

type Ev = {
  eventId: string
  timestamp: Date
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
const events: Ev[] = []
let seq = 0

function user(prefix: string, i: number) {
  const userId = `${prefix}-${i.toString().padStart(5, "0")}`
  const sessionId = `${userId}-s1`
  return { userId, sessionId }
}

/** Emit a user's events, starting at a random time inside [from, to). */
function emit(
  u: { userId: string; sessionId: string },
  from: number,
  to: number,
  flag: string | null,
  variant: string | null,
  steps: { action: string; value?: number; afterSec?: number }[],
  release = "4.2.0",
) {
  let t = from + rand() * (to - from)
  for (const s of steps) {
    t += (s.afterSec ?? 5) * 1000
    events.push({
      eventId: `seed-${++seq}`,
      timestamp: new Date(Math.min(t, NOW - 1000)),
      app: "uzhavan",
      release,
      userId: u.userId,
      sessionId: u.sessionId,
      featureFlag: flag,
      variant,
      action: s.action,
      value: s.value ?? null,
      context: JSON.stringify({ district: DISTRICTS[Math.floor(rand() * DISTRICTS.length)] }),
    })
  }
}
const DISTRICTS = ["Thanjavur", "Madurai", "Coimbatore", "Tiruchirappalli", "Salem", "Tirunelveli", "Villupuram", "Erode"]

async function main() {
  await db.event.deleteMany()
  await db.costEntry.deleteMany()
  await db.featureKpi.deleteMany()
  await db.feature.deleteMany()
  await db.kpiDefinition.deleteMany()

  // ── KPI catalogue ──────────────────────────────────────────────────────
  const kpiRows = [
    { key: "checkout_conversion", name: "Checkout conversion", category: "REVENUE", direction: "UP", calculation: "USER_RATIO", numeratorAction: "checkout_completed", denominatorAction: "checkout_started", description: "Share of users who start a checkout and complete it." },
    { key: "time_to_checkout", name: "Time to checkout", category: "PRODUCTIVITY", direction: "DOWN", calculation: "MEAN_VALUE", numeratorAction: "checkout_completed", denominatorAction: null, description: "Mean seconds from checkout start to completion; sent as the `value` of checkout_completed." },
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

  const approved = { productApproved: true, engineeringApproved: true, analyticsApproved: true }
  const goals = (...g: [string, string][]) => JSON.stringify(g.map(([type, statement]) => ({ type, statement })))

  // ── 1. One-tap reorder: A/B, clear win ─────────────────────────────────
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
        ...approved,
        kpis: {
          create: [
            { kpiId: kpi.checkout_conversion, baseline: 0.42, targetDelta: 0.05, monthlyVolume: 20000, valuePerUnit: 120 },
            { kpiId: kpi.time_to_checkout, baseline: 95, targetDelta: -20, monthlyVolume: 9000, valuePerUnit: 0.5 },
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
        const u = user(`otr-${variant[0]}`, i)
        const t = variant === "treatment"
        const steps: { action: string; value?: number; afterSec?: number }[] = [
          { action: "session_started", afterSec: 0 },
          { action: "feature_exposed", afterSec: 2 },
          { action: "checkout_started", afterSec: 20 },
        ]
        if (chance(t ? 0.5 : 0.42)) {
          const secs = Math.max(10, gaussian(t ? 70 : 95, t ? 20 : 25))
          steps.push({ action: "checkout_completed", value: Math.round(secs), afterSec: secs })
        }
        emit(u, released, NOW, "one_tap_reorder", variant, steps)
      }
    }
  }

  // ── 2. Mandi price alerts: pre/post, modest win ────────────────────────
  {
    const released = NOW - 35 * DAY
    const span = 28 * DAY
    await db.feature.create({
      data: {
        key: "mandi_price_alerts", name: "Mandi price alerts", team: "Market Linkage", owner: "Arun S. (Market Linkage PM)",
        summary: "Push alert when the nearest mandi price for a listed crop crosses the farmer's ask price.",
        goals: goals(["REVENUE", "Sell more listed produce through the app"]),
        attributionMethod: "PRE_POST", segment: "All farmers with an active produce listing (no holdout possible — alerts are district-wide)",
        minSamplePerArm: 500, observationDays: 28, status: "SHIPPED", releaseVersion: "4.1.0", releasedAt: new Date(released),
        ...approved,
        kpis: { create: [{ kpiId: kpi.produce_sale_rate, baseline: 0.3, targetDelta: 0.05, monthlyVolume: 15000, valuePerUnit: 35 }] },
        costs: {
          create: [
            { category: "DEVELOPMENT", recurrence: "ONE_TIME", amount: 250000, note: "1 engineer × 3 weeks" },
            { category: "INFRASTRUCTURE", recurrence: "MONTHLY", amount: 5000, note: "Agmarknet price feed + push" },
          ],
        },
      },
    })
    for (const [phase, from, p] of [["pre", released - span, 0.3], ["post", released, 0.345]] as const) {
      for (let i = 0; i < 1500; i++) {
        const u = user(`mpa-${phase}`, i)
        const steps = [{ action: "produce_listed", afterSec: 0 }]
        if (chance(p)) steps.push({ action: "produce_sold", afterSec: 3600 })
        emit(u, from, from + span, null, null, steps, phase === "pre" ? "4.0.3" : "4.1.0")
        if (phase === "post") emit(u, from, from + span, "mandi_price_alerts", "treatment", [{ action: "feature_exposed" }], "4.1.0")
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
        ...approved,
        kpis: {
          create: [
            { kpiId: kpi.advice_acceptance_rate, baseline: 0.3, targetDelta: 0.1, monthlyVolume: 12000, valuePerUnit: 150 },
            { kpiId: kpi.support_tickets_per_1k, baseline: 10, targetDelta: -4, monthlyVolume: 25, valuePerUnit: 150 },
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
        const u = user(`aca-${variant[0]}`, i)
        const t = variant === "treatment"
        const steps: { action: string; afterSec?: number }[] = [
          { action: "session_started", afterSec: 0 },
          { action: "feature_exposed" },
          { action: "advice_viewed", afterSec: 30 },
        ]
        if (chance(t ? 0.31 : 0.3)) steps.push({ action: "advice_accepted", afterSec: 120 })
        if (chance(t ? 0.03 : 0.01)) steps.push({ action: "support_ticket_created", afterSec: 600 })
        emit(u, released, NOW, "ai_crop_advisor", variant, steps)
      }
    }
  }

  // ── 4. Tamil voice search: phased rollout, still inside its window ─────
  {
    const released = NOW - 18 * DAY
    await db.feature.create({
      data: {
        key: "tamil_voice_search", name: "Tamil voice search", team: "Discovery", owner: "Karthik V. (Discovery PM)",
        summary: "Search schemes, inputs and prices by speaking in Tamil instead of typing.",
        goals: goals(["EXPERIENCE", "More searches end in a useful result"], ["COST_SAVINGS", "Fewer 'can't find it' support calls"]),
        attributionMethod: "PHASED_ROLLOUT", segment: "20% of Android users on app ≥ 4.3, expanding to 50% after the window",
        minSamplePerArm: 400, observationDays: 28, status: "SHIPPED", releaseVersion: "4.3.0", releasedAt: new Date(released),
        ...approved,
        kpis: {
          create: [
            { kpiId: kpi.search_success_rate, baseline: 0.55, targetDelta: 0.08, monthlyVolume: 40000, valuePerUnit: 6 },
            { kpiId: kpi.support_tickets_per_1k, baseline: 12, targetDelta: -3, monthlyVolume: 80, valuePerUnit: 250 },
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
        const u = user(`tvs-${variant[0]}`, i)
        const t = variant === "treatment"
        const steps: { action: string; afterSec?: number }[] = [
          { action: "session_started", afterSec: 0 },
          { action: "feature_exposed" },
          { action: "search_performed", afterSec: 10 },
        ]
        if (chance(t ? 0.61 : 0.55)) steps.push({ action: "search_result_opened" })
        if (chance(t ? 0.009 : 0.012)) steps.push({ action: "support_ticket_created", afterSec: 300 })
        emit(u, released, NOW, "tamil_voice_search", variant, steps, "4.3.0")
      }
    }
  }

  // ── 5. Offline forms: in development, instrumentation incomplete ───────
  await db.feature.create({
    data: {
      key: "offline_forms", name: "Offline scheme applications", team: "Schemes", owner: "Divya K. (Schemes PM)",
      summary: "Fill subsidy application forms without signal; sync when the phone reconnects.",
      goals: goals(["PRODUCTIVITY", "Cut form completion time for low-connectivity villages"], ["RISK_REDUCTION", "Fewer failed submissions"]),
      attributionMethod: "AB_TEST", segment: "Users whose last 3 sessions had < 1 Mbps, 50/50 split",
      minSamplePerArm: 300, observationDays: 21, status: "IN_DEVELOPMENT", ...approved,
      kpis: {
        create: [
          { kpiId: kpi.form_completion_time, baseline: 540, targetDelta: -120, monthlyVolume: 6000, valuePerUnit: 0.3 },
          { kpiId: kpi.errors_per_1k, baseline: 45, targetDelta: -20, monthlyVolume: 30, valuePerUnit: 400 },
        ],
      },
      costs: { create: [{ category: "DEVELOPMENT", recurrence: "ONE_TIME", amount: 600000, note: "Local-first sync layer" }] },
    },
  })
  // Staging traffic: only some of the required events are wired up yet.
  for (let i = 0; i < 25; i++) {
    const u = user("off-stg", i)
    emit(u, NOW - 3 * DAY, NOW, "offline_forms", "treatment", [
      { action: "feature_exposed", afterSec: 0 },
      { action: "form_submitted", value: Math.round(gaussian(400, 60)), afterSec: 400 },
    ], "4.4.0-beta")
  }

  // ── 6. Bulk mandi booking: draft spec, incomplete ──────────────────────
  await db.feature.create({
    data: {
      key: "bulk_mandi_booking", name: "Bulk mandi slot booking", team: "Market Linkage", owner: "Arun S. (Market Linkage PM)",
      summary: "FPOs book unloading slots at the regulated market for a whole truck of members' produce.",
      goals: goals(["PRODUCTIVITY", "Cut waiting time at the mandi gate"]),
      attributionMethod: "PRE_POST", segment: "Registered FPOs in Salem and Erode",
      minSamplePerArm: 50, observationDays: 14, productApproved: true,
      kpis: { create: [{ kpiId: kpi.produce_sale_rate, baseline: 0.3, targetDelta: 0.04, monthlyVolume: 0, valuePerUnit: 0 }] },
    },
  })

  // ── Events for a flag nobody registered (a governance gap) ─────────────
  for (let i = 0; i < 40; i++) {
    emit(user("dm", i), NOW - 10 * DAY, NOW, "dark_mode", "treatment", [{ action: "feature_exposed", afterSec: 0 }], "4.3.0")
  }

  for (let i = 0; i < events.length; i += 2000) {
    await db.event.createMany({ data: events.slice(i, i + 2000) })
  }
  console.log(`Seeded ${kpiRows.length} KPIs, 6 features, ${events.length} events.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
