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
  { title: "Ingest API", body: "POST /api/events. Rejects anything off-schema; idempotent on eventId." },
  { title: "Warehouse", body: "Event table keyed by feature flag + release. Reference tables: Feature, KpiDefinition, CostEntry." },
  { title: "ROI layer", body: "Splits arms, computes catalogue KPIs, tests significance, monetises, applies ROI formula." },
  { title: "Decisions", body: "Portfolio dashboard, release gates, governance gaps, recorded verdicts." },
]

const SCHEMA = [
  ["eventId", "Client-generated UUID; retries are de-duplicated"],
  ["timestamp", "When the action happened (ISO 8601)"],
  ["app · release", "Which product and version emitted it"],
  ["userId · sessionId", "Who, and in which session"],
  ["featureFlag · variant", "Which feature, and control or treatment"],
  ["action", "snake_case verb the KPI catalogue refers to"],
  ["value", "Optional number, e.g. seconds taken"],
  ["context", "Flat key/value extras (district, crop…)"],
]

export default function PlaybookPage() {
  return (
    <div className="space-y-12">
      <div className="max-w-2xl space-y-2">
        <h1 className="text-3xl font-bold">The playbook</h1>
        <p className="text-muted-foreground">
          Features used to ship with ad-hoc metrics or none, so arguments about their value were political. This is
          the standard process and telemetry architecture that makes every feature&apos;s ROI traceable, and the app
          enforces each step.
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
          <table className="w-full text-sm">
            <tbody>
              {SCHEMA.map(([field, desc]) => (
                <tr key={field} className="border-t border-border first:border-0">
                  <td className="py-2 pr-4 font-mono text-xs">{field}</td>
                  <td className="py-2 text-muted-foreground">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
    </div>
  )
}
