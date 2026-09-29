import Link from "next/link"
import { ArrowDown, ArrowRight } from "lucide-react"

const STAGES = [
  {
    title: "Spec before code",
    body: "The PM declares 1–3 business goals, maps them to 1–3 KPIs from the shared catalogue, and records baselines, target changes and how a KPI change turns into ₹.",
  },
  {
    title: "Attribution plan",
    body: "Choose an A/B test, a phased rollout or a pre/post comparison; the segment in scope; the minimum users per arm; and the observation window.",
  },
  {
    title: "Three-way sign-off",
    body: "Product, engineering and analytics approve the spec. The gate refuses to move a feature into development until all checks pass.",
  },
  {
    title: "Build with a cost ledger",
    body: "Development, infrastructure, support and maintenance costs are recorded against the feature, one-time or monthly.",
  },
  {
    title: "No ship now, measure later",
    body: "The release gate checks the warehouse for every event the KPIs need, carrying this feature's flag. If one is missing, the feature can't ship.",
  },
  {
    title: "Portfolio review",
    body: "Once the window and sample size are met, ROI counts only statistically significant KPI changes. The review records a decision: scale, iterate or retire.",
  },
]

const PIPELINE = [
  { title: "Product code", body: "Shared SDK: expose(), track(). Batching, retries, stable variant assignment." },
  { title: "Ingest API", body: "POST /api/events. Enforces the versioned contract, de-duplicates on eventId, quarantines unregistered flags." },
  { title: "Warehouse", body: "Event table keyed by feature flag + release. Reference tables: Feature, KpiDefinition, CostEntry." },
  { title: "ROI layer", body: "Splits arms, computes catalogue KPIs, tests significance, monetises, applies ROI formula." },
  { title: "Decisions", body: "Portfolio dashboard, release gates, governance gaps, recorded verdicts." },
]

export default function PlaybookPage() {
  return (
    <div className="space-y-12">
      <div className="max-w-2xl space-y-2">
        <h1 className="text-2xl font-bold">The playbook</h1>
        <p className="text-muted-foreground">
          When every team tracks different numbers, or none, &ldquo;was it worth it?&rdquo; gets settled by whoever
          argues best. These are the rules this tool enforces instead. None of them is optional: each one is a gate
          check or a query filter in the code, not a guideline.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Operating model</h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STAGES.map((s, i) => (
            <li key={s.title} className="rounded-xl border border-border bg-card p-5">
              <div className="mb-2 text-xs font-medium text-primary">Step {i + 1}</div>
              <h3 className="mb-1 font-semibold">{s.title}</h3>
              <p className="text-sm text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Telemetry architecture</h2>
        <ol className="flex flex-col items-stretch gap-2 lg:flex-row lg:items-center">
          {PIPELINE.map((p, i) => (
            <li key={p.title} className="contents">
              <div className="flex-1 rounded-xl border border-border bg-card p-4">
                <h3 className="mb-1 text-sm font-semibold">{p.title}</h3>
                <p className="text-xs text-muted-foreground">{p.body}</p>
              </div>
              {i < PIPELINE.length - 1 && (
                <>
                  <ArrowRight className="hidden h-4 w-4 shrink-0 text-muted-foreground lg:block" aria-hidden />
                  <ArrowDown className="mx-auto h-4 w-4 text-muted-foreground lg:hidden" aria-hidden />
                </>
              )}
            </li>
          ))}
        </ol>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3 rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Common event schema</h2>
          <p className="text-sm text-muted-foreground">
            One versioned contract (user, session, feature flag, variant, action, value, context) shared by the SDK,
            the ingest API and analytics. The field reference is generated from the validator itself and published on
            the <Link href="/kpis" className="text-primary hover:underline">KPI catalogue</Link> and at{" "}
            <a href="/api/schema" className="font-mono text-xs text-primary hover:underline">/api/schema</a>.
          </p>
          <p className="text-sm text-muted-foreground">
            Events for a flag with no registered spec are <strong className="text-foreground">quarantined</strong>:
            they're kept, but excluded from every KPI, until the spec is registered and they're released.
          </p>
        </section>

        <section className="space-y-4 rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">The ROI formula</h2>
          <p className="rounded-md bg-background px-4 py-3 text-center font-mono text-sm">
            ROI = (Total benefits − Total costs) ÷ Total costs
          </p>
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              <strong className="text-foreground">Benefit per KPI per month</strong> = measured improvement × monthly
              volume × ₹ value per unit, counted <em>only if</em> p &lt; 0.05.
            </li>
            <li>
              <strong className="text-foreground">Total cost</strong> = one-time costs + monthly costs × horizon.
            </li>
            <li>
              <strong className="text-foreground">Credible</strong> only when the observation window has elapsed
              and every arm has the minimum sample. Until then the verdict is &ldquo;keep measuring&rdquo;.
            </li>
            <li>
              <strong className="text-foreground">Verdict</strong>: ROI ≥ 50% → scale · 0–50% → iterate · &lt; 0 →
              retire.
            </li>
          </ul>
        </section>
      </div>

      <section id="method" className="scroll-mt-20 space-y-4">
        <h2 className="text-lg font-semibold">How we decide an effect is real</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Every KPI change is tested before it can become ₹. The code is in{" "}
          <code className="font-mono text-xs">lib/analytics/stats.ts</code> and{" "}
          <code className="font-mono text-xs">report.ts</code>. Each feature report shows which of these was applied to it.
        </p>
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-secondary/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">KPI type</th>
                <th className="px-4 py-2 font-medium">Test</th>
                <th className="px-4 py-2 font-medium">What&apos;s compared</th>
              </tr>
            </thead>
            <tbody>
              {METHODS.map(([type, test, what]) => (
                <tr key={type} className="border-t border-border align-top">
                  <td className="px-4 py-2">{type}</td>
                  <td className="px-4 py-2 font-medium">{test}</td>
                  <td className="px-4 py-2 text-muted-foreground">{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {RULES.map(([term, def]) => (
            <div key={term} className="rounded-xl border border-border bg-card p-4">
              <dt className="font-medium">{term}</dt>
              <dd className="mt-1 text-muted-foreground">{def}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Farmer data and the DPDP Act</h2>
          <dl className="space-y-2 text-sm">
            {PRIVACY.map(([term, def]) => (
              <div key={term} className="rounded-xl border border-border bg-card p-4">
                <dt className="font-medium">{term}</dt>
                <dd className="mt-1 text-muted-foreground">{def}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Built for rural networks</h2>
          <dl className="space-y-2 text-sm">
            {RURAL.map(([term, def]) => (
              <div key={term} className="rounded-xl border border-border bg-card p-4">
                <dt className="font-medium">{term}</dt>
                <dd className="mt-1 text-muted-foreground">{def}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">What this doesn&apos;t do yet</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Known limits, written down so nobody over-trusts a number:
        </p>
        <ul className="grid gap-3 text-sm sm:grid-cols-2">
          {LIMITS.map(([title, body]) => (
            <li key={title} className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-1 font-medium">{title}</h3>
              <p className="text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

const METHODS: [string, string, string][] = [
  [
    "Rates (e.g. checkout conversion)",
    "Two-proportion z-test",
    "Share of users who did the numerator action, control vs treatment. Pooled standard error for the test, unpooled for the interval.",
  ],
  [
    "Averages (e.g. time to checkout)",
    "Welch's test on means",
    "Mean of the event value per arm. Welch's version doesn't assume both arms have the same spread.",
  ],
  [
    "Per-1,000 counts (e.g. support tickets)",
    "Welch's test on per-user counts",
    "Events per user, zeros included, compared as means and then scaled to per 1,000 users.",
  ],
]

const RULES: [string, string][] = [
  ['Confidence level', 'Two-sided tests at 95% confidence: an effect counts only if p < 0.05, whichever direction it goes. A 95% interval on the difference is shown next to every result.'],
  ['Several KPIs, one feature', 'p-values are Holm-corrected across a feature’s KPIs, so checking three KPIs doesn’t triple the chance of a false win. Reports show the adjusted p, with the raw one beside it.'],
  ['Broken splits', 'A sample-ratio-mismatch check compares who landed in each arm with the planned split (chi-square, p < 0.001). If it fails, no result from that test is trusted until assignment is fixed.'],
  ['Can the test succeed?', 'At spec time, a power calculation (95% confidence, 80% power) compares the sample the target change needs with what the traffic and window will deliver. If the window can’t get there, the spec can’t be approved.'],
  ['Minimum sample', 'Set per feature in its spec (policy floor: 100 per arm). Below it, the verdict is “keep measuring”, with a projected date from the traffic so far.'],
  ['Observation window', 'Set per feature (policy floor: 14 days). Nothing is final before it closes. Results aren’t checked for early stopping, so looking early can’t bias them.'],
]

const PRIVACY: [string, string][] = [
  ['Consent before collection', 'The SDK drops every event until the app records consent. Withdrawing consent deletes anything still queued on the device.'],
  ['Pseudonymous by design', 'Events carry a farmer id, never a name. The ingest API rejects phone numbers, Aadhaar-like numbers, email addresses and fields named for personal data (phone, address, GPS…), so they are never stored.'],
  ['Minimum fields', 'The event contract is closed: unknown fields are rejected, so nobody can quietly start collecting more than the KPIs need.'],
  ['Not built yet', 'Retention limits, a data-erasure request per farmer, a consent-notice text in Tamil and English, and keeping the database in an Indian region. A real deployment needs all four under the DPDP Act 2023.'],
]

const RURAL: [string, string][] = [
  ['Works offline', 'Events queue on the phone, survive reloads and app restarts, and go out when the signal returns. Try it on the live demo with “No signal”.'],
  ['Small on the wire', 'Batches are gzip-compressed: a typical 20-event batch goes from about 7 KB to under 1 KB. Events are batched, not sent one per tap.'],
  ['Safe to retry', 'Every event has a client-generated id, and ingest de-duplicates, so a flaky 2G retry never double-counts a farmer.'],
]

const LIMITS: [string, string][] = [
  [
    'Pre/post can’t see seasons',
    'Mandi price alerts has no holdout, so a harvest-season lift and a feature lift look the same. The spec form steers teams to A/B tests or phased rollouts for this reason.',
  ],
  [
    '₹ values are estimates',
    'Every ₹ value must name its source, and each report shows ROI at 50%, 100% and 150% of it plus the break-even point. But the figures still come from the spec author and analytics, not an audited finance system.',
  ],
  [
    'Averages can’t be sized yet',
    'Sample-size checks cover rates and per-1,000 counts. For averages such as time to checkout, the spec would need an estimate of the spread, which the form doesn’t collect yet.',
  ],
  [
    'Signers are named, not verified',
    'Every sign-off records who signed and when, and withdrawals are logged too. But there are no accounts yet, so a name is typed, not proven. Real use would put sign-off behind SSO.',
  ],
]
