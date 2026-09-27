# Feature ROI: TN IMPACT 26 (TNI26073)

**Problem.** Features ship with ad-hoc or missing metrics, so nobody can prove whether they drive revenue, cut
cost or improve experience, and investment decisions become political.

**Solution.** A standard process and telemetry architecture, enforced in software:

1. **Spec before code.** Each feature declares 1–3 business goals and 1–3 KPIs from a shared catalogue, with a baseline, a target change and a ₹ value for each KPI.
2. **Attribution plan.** The spec picks an A/B test, a phased rollout or a pre/post comparison, and sets the segment, the minimum sample per arm and the observation window.
3. **Three-way sign-off.** Product, engineering and analytics approve the spec before development can start.
4. **Cost ledger.** Development, infrastructure, support and maintenance costs are recorded per feature.
5. **Release gate.** A feature can't ship until every event its KPIs need has arrived with its feature flag.
6. **ROI layer.** It computes the KPIs for each arm, tests significance, counts only proven changes as benefit, and applies `ROI = (benefits − costs) / costs`.
7. **Portfolio review.** Each feature is judged scale, iterate, retire or keep measuring, and the decision is recorded.

## Run it

```bash
npm install
npm run db:setup     # migrate SQLite, generate the client, seed demo data
npm run dev          # http://localhost:3000
```

No database server is needed: the warehouse is SQLite at `db/dev.db`. Set `TELEMETRY_DB_URL` to point it
elsewhere.

## Demo script (5 minutes)

1. **Portfolio** (`/`): ROI by feature and verdicts. Portfolio ROI is negative because the AI crop advisor destroys more value than the one-tap reorder creates.
2. **One-tap input reorder**: an A/B test where both KPIs beat their targets with p < 0.001. Verdict: **scale**.
3. **AI crop advisor**: advice acceptance didn't move, and support tickets rose significantly. Verdict: **retire**.
4. **Tamil voice search**: early numbers look good, but only 18 of 28 days have elapsed. Verdict: **keep measuring**. This shows that a good-looking early number doesn't get to count yet.
5. **Offline scheme applications**: click *Move to Shipped* and the server refuses, because `error_shown` was never instrumented.
6. **Bulk mandi booking**: a draft spec blocked by missing approvals and missing monetisation.
7. **Live demo** (`/demo`): place an order in the mock app and watch the SDK's events go into the same pipeline.
8. **Governance gaps**: the `dark_mode` flag is sending events but has no spec or owner.

## Architecture

```
product code ──SDK──▶ POST /api/events ──▶ Event warehouse ──▶ ROI layer ──▶ dashboard, gates, decisions
 expose()/track()     schema check,         + Feature, KpiDefinition,         attribution, significance,
 batching, retries    idempotent eventId      CostEntry reference tables      monetisation, ROI
```

| Path | What it is |
|---|---|
| `lib/telemetry/schema.ts` | Common event schema (zod), shared by the SDK and the ingest API |
| `lib/telemetry/sdk.ts` | Shared telemetry SDK: `createTelemetry`, `expose`, `track`, `assignVariant` |
| `lib/analytics/report.ts` | ROI calculation layer |
| `lib/analytics/stats.ts` | Two-proportion and Welch tests |
| `lib/governance.ts` | Spec, development and release gates |
| `db/schema.prisma` | Data model |
| `db/seed.ts` | Six demo features with known true effects |

## Known limits

- Significance uses normal approximations and doesn't correct for testing several KPIs at once.
- Pre/post comparisons can't separate the feature from seasonality. The spec asks teams to choose A/B tests where possible for this reason.
- There are no user accounts yet: sign-off buttons record the role, not the person.
