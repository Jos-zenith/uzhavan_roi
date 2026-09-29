# Impact Ledger: feature ROI for TN IMPACT 26 (TNI26073)

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

The warehouse is Postgres. Locally, Prisma runs one for you:

```bash
npm install
npx prisma dev -n impact -d        # local Postgres; `npx prisma dev ls` shows its TCP URL
# put that postgres://… TCP URL in .env as DATABASE_URL, with the database
# changed from /template1 to /postgres (Postgres copies template1 into every
# new database, which breaks Prisma's shadow database if you use it directly)
npm run db:setup                   # migrate, generate the client, seed demo data
npm run dev                        # http://localhost:3000
```

### Deploying to Vercel

1. In the Vercel project, open **Storage → Create Database → Neon (Postgres)** and connect it to the project.
   This sets `DATABASE_URL` (pooled, used by the app) and `DATABASE_URL_UNPOOLED` (direct, used for migrations).
2. Redeploy. The build runs `prisma migrate deploy` before `next build`, so the schema is created or updated
   on every deploy, and a missing database fails the build instead of serving 500s.
3. There's no step 3. The build runs `tsx db/seed.ts --if-empty`, which loads the demo scenario into an
   **empty** database and leaves one with data alone, so the first deploy opens on a full portfolio. Set
   `SKIP_DEMO_SEED=1` to turn that off. To replace existing data with the demo by hand:
   `DATABASE_URL="postgres://…" npm run db:seed -- --reset` (without `--reset` it refuses, because seeding
   deletes everything).

`DATABASE_POOL_MAX` (default 3) caps connections per server instance. Pages run many queries in parallel,
so an uncapped pool per serverless instance exhausts hosted connection limits quickly.

## Demo script (5 minutes)

1. **Portfolio** (`/`): ROI by feature and verdicts. Portfolio ROI is negative because the AI crop advisor destroys more value than the one-tap reorder creates.
2. **One-tap input reorder**: an A/B test where both KPIs beat their targets with p < 0.001. Verdict: **scale**.
3. **AI crop advisor**: advice acceptance didn't move, and support tickets rose significantly. Verdict: **retire**.
4. **Tamil voice search**: early numbers look good, but only 18 of 28 days have elapsed. Verdict: **keep measuring**. This shows that a good-looking early number doesn't get to count yet.
5. **Offline scheme applications**: click *Move to Shipped* and the server refuses, because `error_shown` was never instrumented.
6. **Bulk mandi booking**: a draft spec blocked by missing approvals and missing monetisation.
7. **Live demo** (`/demo`): place an order in the mock app. The ingest console shows each queued event and the API's actual response. Then use *Break it on purpose* to send an unregistered flag (quarantined), a typo'd field (rejected), a future schema version (rejected) and a replayed batch (de-duplicated).
   - On any feature page, the **Review log** shows the owner's notes, recorded decisions, and every gate outcome, including refusals. `{ }` buttons show the raw JSON behind a screen, and each KPI shows the formula and test used.
8. **Governance gaps**: the `dark_mode` flag has sent 40 events with no spec or owner. They're **quarantined**: kept, but excluded from every KPI. Click *Register a spec*; the form opens pre-filled and says how many events are waiting. Submit it, and the feature page confirms the events were released. The new spec still starts as a draft that needs sign-off.
9. **KPI catalogue → Event contract**: the versioned event schema, generated from the same validator the ingest API enforces (also at `/api/schema`). Send `schemaVersion: 2` or a typo like `feature_flag` and ingest rejects it with a precise error. Leave `schemaVersion` out, as an older SDK would, and the event is accepted as v1.

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
| `lib/registry.ts` | Event registry: quarantine for unregistered flags, released when a spec is registered |
| `lib/telemetry/version.ts` | Event contract version, and the versions ingest accepts |
| `db/schema.prisma` | Data model |
| `db/seed.ts` | Six demo features with known true effects |

## Known limits

- Significance uses normal approximations and doesn't correct for testing several KPIs at once.
- Pre/post comparisons can't separate the feature from seasonality. The spec asks teams to choose A/B tests where possible for this reason.
- There are no user accounts yet: sign-off buttons record the role, not the person.
