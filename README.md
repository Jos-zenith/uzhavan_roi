# Impact Ledger: feature ROI, measured honestly

**Problem.** Features ship with ad-hoc or missing metrics, so nobody can prove whether they drive revenue, cut
cost or improve experience, and investment decisions become political.

**Solution.** A standard process and telemetry architecture, enforced in software:

1. **Spec before code.** Each feature declares 1–3 business goals and 1–3 primary KPIs from a shared catalogue (baseline, target, ₹ value with a low–high range and a source), plus up to 2 guardrail KPIs it must not make worse.
2. **Attribution plan.** An A/B test, a phased rollout, or pre/post with holdout districts; a minimum sample and observation window; and a power check that the test can actually succeed.
3. **Four-way sign-off.** Product, engineering and analytics approve the spec, and finance approves the ₹ values. Each signer is named and logged.
4. **Release gate.** A feature can't ship until every event its KPIs need is already arriving.
5. **ROI layer.** Fixed-horizon tests (Holm-corrected) for the verdict, always-valid sequential tests (mSPRT) for watching live, an SRM check on the split, and holdout netting for seasons. Only proven effects become ₹; ROI is shown as a low / base / high band.
6. **Kill switch.** Guardrails are re-tested on every batch of events. Significant harm turns the feature off for everyone and opens an incident.
7. **Closing the loop.** Scale opens a roadmap ticket and retire opens a removal ticket with its monthly saving. The portfolio forecasts what retiring the worst performers would save.

The data is an **illustrative scenario**: Vayal (வயல், "field"), a fictional farmer app. Every feature, cost and
result is invented, with known true effects so every verdict can be checked.

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

The embedded `prisma dev` database is slow at bulk inserts: loading the demo takes several minutes locally,
against tens of seconds on hosted Postgres.

### Deploying to Vercel

1. In the Vercel project, open **Storage → Create Database → Neon (Postgres)** and connect it to the project.
   This sets `DATABASE_URL` (pooled, used by the app) and `DATABASE_URL_UNPOOLED` (direct, used for migrations).
2. Redeploy. The build runs `prisma migrate deploy`, then loads the demo into an **empty** database only
   (`SKIP_DEMO_SEED=1` turns that off), then `next build`.
3. A database that already holds an older version of the demo keeps it. Press **reset demo** in the
   portfolio's status strip to load the current scenario.

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_POOL_MAX` | 3 | Connections per server instance. Pages run many queries in parallel. |
| `DEMO_RESET` | on | Set to `off` wherever real data lives; the reset endpoint then refuses. |
| `SKIP_DEMO_SEED` | unset | Stops deploys from loading the demo into an empty database. |

## Demo script (6 minutes)

1. **Portfolio** (`/`). The question, and the answer in one sentence. **Live now** streams running tests (farmers per group against the minimum sample, days until decidable) and the newest events.
2. **Try it live** (`/demo`), with the portfolio open in another tab. Place an order and watch it arrive. Then press **Spike UPI payment failures** twice: the first batch isn't conclusive (sequential p ≈ 0.09); the second trips the guardrail (p ≈ 0.01), the ingest response reports `killSwitch`, and `/api/flags` serves control to everyone. Back on the portfolio: the kill is at the top of *Needs you*, with an incident ticket under *Closing the loop*.
3. **One-tap input reorder**: both primary KPIs proven (p < 0.001), guardrail clean, decided **scale**, roadmap ticket open. ROI band 43% to 255% across finance's ₹ range.
4. **Mandi price alerts**: sale rate rose ~7 pp where alerts went out, but ~4 pp in the holdout districts too. That's the harvest. The feature's own effect isn't significant, so **retire**, although naive pre/post would have called it a win.
5. **AI crop advisor**: support tickets up significantly, acceptance flat, review overdue. Record **retire** and a removal ticket appears with its monthly saving.
6. **Tamil voice search**: the countdown shows when it becomes final, and says its ticket KPI can't be proven at this traffic.
7. **Offline scheme applications** (release gate refuses: events missing) and **Bulk mandi booking** (spec gate: power, ₹ source and finance sign-off missing).
8. **Reset demo** puts everything back.

## Architecture

```
product code ──SDK──▶ POST /api/events ──▶ Event warehouse ──▶ ROI layer ──▶ dashboard, gates, decisions
 consent, offline     schema + privacy      event time and          fixed + sequential tests,
 queue, gzip          checks, dedupe,       arrival time, flags,    SRM, holdouts, ₹ band
                      quarantine, guardrail  specs, costs, tickets
                      re-test → kill switch                          ──▶ /api/live (SSE), /api/flags
```

| Path | What it is |
|---|---|
| `lib/telemetry/sdk.ts` | Shared SDK: consent, offline queue, gzip, `expose`, `track`, `assignVariant` |
| `lib/telemetry/schema.ts`, `privacy.ts` | Versioned event contract and the personal-data guard |
| `lib/analytics/report.ts` | ROI layer |
| `lib/analytics/stats.ts` | Two-proportion and Welch tests, Holm, SRM, mSPRT, difference-in-differences |
| `lib/analytics/power.ts` | Sample-size maths for the spec form and gates |
| `lib/guardrails.ts` | Kill switch |
| `lib/governance.ts` | Spec, development and release gates; review status |
| `lib/live.ts`, `app/api/live` | Live snapshot and its Server-Sent Events stream |
| `lib/demo/seed.ts` | The Vayal scenario, shared by the CLI seed and the reset button |

## Known limits

See *What this doesn't do yet* on the playbook page: holdout netting covers rate KPIs only, averages can't be
power-sized yet, ₹ values are estimates, and signers are named but not verified.
