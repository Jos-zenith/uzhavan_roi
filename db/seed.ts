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
  // Seeding wipes every table. Never do that to a database with data in it by accident.
  const existing = await db.feature.count()
  // --if-empty (run by every deploy): load demo data into a fresh database, otherwise do nothing.
  if (process.argv.includes("--if-empty")) {
    if (process.env.SKIP_DEMO_SEED) return console.log("SKIP_DEMO_SEED is set; not loading demo data.")
    if (existing > 0) return console.log(`Database already has ${existing} features; leaving it alone.`)
    console.log("Empty database: loading the demo scenario.")
  } else if (existing > 0 && !process.argv.includes("--reset")) {
    console.error(
      `Refusing to seed: this database already has ${existing} features, and seeding deletes everything.\n` +
        "If you really want to replace it with demo data, run: npm run db:seed -- --reset",
    )
    process.exit(1)
  }

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
        decision: "SCALE",
        decisionNote: "Both KPIs beat target with p < 0.001. Roll out to 100% of returning buyers in 4.3.",
        decidedAt: new Date(NOW - 10 * DAY),
        ...approved,
        kpis: {
          create: [
            { kpiId: kpi.checkout_conversion, baseline: 0.42, targetDelta: 0.05, monthlyVolume: 20000, valuePerUnit: 120, valueSource: "Average margin per input order, FY25 finance ledger (illustrative)" },
            { kpiId: kpi.time_to_checkout, baseline: 95, targetDelta: -20, monthlyVolume: 9000, valuePerUnit: 0.5, valueSource: "Analytics model: fewer abandoned carts per second saved (illustrative)" },
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
        decision: "ITERATE",
        decisionNote: "Keep it on, no new investment. Re-measure with a district-staggered rollout next season to separate the feature from the harvest.",
        decidedAt: new Date(NOW - 3 * DAY),
        ...approved,
        kpis: { create: [{ kpiId: kpi.produce_sale_rate, baseline: 0.3, targetDelta: 0.05, monthlyVolume: 15000, valuePerUnit: 35, valueSource: "Platform fee per completed produce sale (illustrative)" }] },
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
            { kpiId: kpi.advice_acceptance_rate, baseline: 0.3, targetDelta: 0.1, monthlyVolume: 12000, valuePerUnit: 150, valueSource: "Average margin on recommended inputs (illustrative)" },
            { kpiId: kpi.support_tickets_per_1k, baseline: 10, targetDelta: -4, monthlyVolume: 25, valuePerUnit: 150, valueSource: "Call-centre budget ÷ tickets handled, FY25 (illustrative)" },
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
        attributionMethod: "PHASED_ROLLOUT", treatmentShare: 0.2, segment: "20% of Android users on app ≥ 4.3, expanding to 50% after the window",
        minSamplePerArm: 400, observationDays: 28, status: "SHIPPED", releaseVersion: "4.3.0", releasedAt: new Date(released),
        ...approved,
        kpis: {
          create: [
            { kpiId: kpi.search_success_rate, baseline: 0.55, targetDelta: 0.08, monthlyVolume: 40000, valuePerUnit: 6, valueSource: "Assisted orders per successful search, analytics estimate (illustrative)" },
            { kpiId: kpi.support_tickets_per_1k, baseline: 12, targetDelta: -3, monthlyVolume: 80, valuePerUnit: 250, valueSource: "Call-centre budget ÷ tickets handled, FY25 (illustrative)" },
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
          { kpiId: kpi.form_completion_time, baseline: 540, targetDelta: -120, monthlyVolume: 6000, valuePerUnit: 0.3, valueSource: "Field-officer time on assisted applications (illustrative)" },
          { kpiId: kpi.errors_per_1k, baseline: 45, targetDelta: -20, monthlyVolume: 30, valuePerUnit: 400, valueSource: "Cost to resolve a failed submission (illustrative)" },
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

  // ── Named sign-offs (illustrative people, like everything else here) ───
  for (const f of await db.feature.findMany()) {
    await db.feature.update({
      where: { id: f.id },
      data: {
        productApprovedBy: f.productApproved ? f.owner : null,
        engineeringApprovedBy: f.engineeringApproved ? "S. Prakash (Engineering lead)" : null,
        analyticsApprovedBy: f.analyticsApproved ? "N. Fathima (Analytics)" : null,
      },
    })
  }

  // ── Review logs ────────────────────────────────────────────────────────
  // Figures quoted here match what the ROI layer computes from this seed.
  // Anything beyond the telemetry is framed as a hypothesis, not a finding.
  const ids = Object.fromEntries((await db.feature.findMany({ select: { key: true, id: true } })).map((f) => [f.key, f.id]))
  const log: [string, number, string, "NOTE" | "DECISION" | "SYSTEM", string][] = [
    ["one_tap_reorder", 42, "Release gate", "SYSTEM", "Gate passed (3/3 checks): In development → Shipped in 4.2.0."],
    ["one_tap_reorder", 40, "Kavya R. (Marketplace PM)", "NOTE", "Scope reminder: the test only covers returning buyers. First-time buyers have no past order to reorder, so don't extrapolate this result to them."],
    ["one_tap_reorder", 12, "Kavya R. (Marketplace PM)", "NOTE", "Window closed at day 28 and both arms are well past 400 users. Conversion +6.5 pp and checkout 27s faster, both p < 0.001, and both beat target. Proposing we scale to 100% in 4.3."],

    ["one_tap_reorder", 10, "Portfolio review", "DECISION", "Scale. Both KPIs beat target with p < 0.001. Roll out to 100% of returning buyers in 4.3."],

    ["mandi_price_alerts", 35, "Release gate", "SYSTEM", "Gate passed (4/4 checks): In development → Shipped in 4.1.0."],
    ["mandi_price_alerts", 34, "Arun S. (Market Linkage PM)", "NOTE", "No holdout possible: alerts go to a whole district at once, so this is pre/post. Treat the result as an upper bound."],
    ["mandi_price_alerts", 5, "Arun S. (Market Linkage PM)", "NOTE", "Sale rate +5.7 pp, above the 5 pp target, but the post window overlaps the start of the kuruvai harvest. Some of that lift may be seasonal and this design can't separate it. ROI is positive but thin (~17%). Before we invest more: run a district-level staggered rollout for the next season to get a real comparison."],

    ["mandi_price_alerts", 3, "Portfolio review", "DECISION", "Iterate. Keep it on, no new investment. Re-measure with a district-staggered rollout next season to separate the feature from the harvest."],

    ["ai_crop_advisor", 60, "Release gate", "SYSTEM", "Gate passed (5/5 checks): In development → Shipped in 4.0.0."],
    ["ai_crop_advisor", 45, "Meena P. (Agronomy PM)", "NOTE", "Two weeks in: acceptance looks flat and support tickets are running higher in treatment. Too early to call; leaving it on."],
    ["ai_crop_advisor", 25, "Meena P. (Agronomy PM)", "NOTE", "Window closed. Acceptance didn't move (p = 0.66). Tickets went from 10.8 to 28.3 per 1,000 users (p = 0.002), so the feature is creating support load, not removing it. With ₹70k/month to run, every month on costs money twice."],
    ["ai_crop_advisor", 24, "Meena P. (Agronomy PM)", "NOTE", "Recommending retire at the next portfolio review. Open question for any v2, not answered by this data: are the tickets about wrong advice, or about advice farmers couldn't act on? We should sample the tickets before building anything else here."],

    ["tamil_voice_search", 18, "Release gate", "SYSTEM", "Gate passed (5/5 checks): In development → Shipped in 4.3.0."],
    ["tamil_voice_search", 1, "Karthik V. (Discovery PM)", "NOTE", "Day 17 of 28. Search success is up ~7 pp in the 20% cohort; ticket rate hasn't moved. The ROI reads −80% because only the search lift is proven so far (about ₹17k/month) against ₹10 lakh of build and run cost; the ticket saving isn't proven. Holding at 20%, and not expanding to 50% until the window closes. Early lifts in phased rollouts often shrink."],

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
      createdAt: new Date(NOW - daysAgo * DAY + 9.5 * 3_600_000 * rand()),
    })),
  })

  // ── Events for a flag nobody registered (a governance gap) ─────────────
  for (let i = 0; i < 40; i++) {
    emit(user("dm", i), NOW - 10 * DAY, NOW, "dark_mode", "treatment", [{ action: "feature_exposed", afterSec: 0 }], "4.3.0")
  }

  // The seed bypasses the ingest API, so apply its registry rule here too.
  const registered = new Set((await db.feature.findMany({ select: { key: true } })).map((f) => f.key))
  const rows = events.map((e) => ({ ...e, receivedAt: e.timestamp, quarantined: !!e.featureFlag && !registered.has(e.featureFlag) }))
  for (let i = 0; i < rows.length; i += 2000) {
    await db.event.createMany({ data: rows.slice(i, i + 2000) })
  }
  console.log(`Seeded ${kpiRows.length} KPIs, 6 features, ${events.length} events.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
