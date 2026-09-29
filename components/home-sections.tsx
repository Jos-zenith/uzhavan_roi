import Link from "next/link"
import { ArrowRight, ClipboardCheck, Radio, Scale } from "lucide-react"
import type { FeatureReport } from "@/lib/analytics/report"
import { formatKpiValue } from "@/lib/domain"
import { money } from "@/lib/narrative"
import { KpiIcon } from "@/components/kpi-icon"
import { Button } from "@/components/ui/button"

export function Intro() {
  return (
    <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
      <span className="font-medium text-foreground">Impact Ledger</span> exists because teams ship features without
      knowing whether they paid off. The data here is an <span className="text-foreground">illustrative scenario</span>:
      Vayal (வயல், &ldquo;field&rdquo;), a fictional farmer app for inputs, subsidies and market prices in Tamil Nadu.
      Every feature, cost and result is invented to show the process.
    </p>
  )
}

const STEPS = [
  {
    icon: ClipboardCheck,
    title: "Spec before code",
    body: "Each feature names 1–3 KPIs, a baseline, a target and a ₹ value. Product, engineering and analytics sign it.",
  },
  {
    icon: Radio,
    title: "No telemetry, no release",
    body: "The release gate checks that every event the KPIs need is already arriving. If one is missing, it can't ship.",
  },
  {
    icon: Scale,
    title: "Only proven wins count",
    body: "After the test window, KPI changes that pass a significance test become ₹. Everything else counts as zero.",
  },
]

export function HowItWorks() {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xl">How it works</h2>
        <Link href="/playbook" className="text-sm text-primary hover:underline">
          The full playbook →
        </Link>
      </div>
      <ol className="grid gap-3 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="relative rounded-xl border border-border bg-card p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-primary">
                <s.icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="text-xs font-medium text-muted-foreground">Step {i + 1}</span>
            </div>
            <h3 className="font-serif text-lg font-semibold">{s.title}</h3>
            <p className="text-sm text-muted-foreground">{s.body}</p>
            {i < STEPS.length - 1 && (
              <ArrowRight className="absolute -right-3 top-1/2 hidden h-5 w-5 -translate-y-1/2 rounded-full bg-background text-muted-foreground md:block" aria-hidden />
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

/** One feature's before/after, straight from its report: the whole method in a single example. */
export function FeaturedStory({
  feature,
  report,
}: {
  feature: { key: string; name: string; summary: string; decision: string | null; horizonMonths: number }
  report: FeatureReport
}) {
  const roi = report.roi ?? 0
  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <p className="text-xs font-medium uppercase tracking-wide text-primary">A result, start to finish</p>
      <div className="mt-2 grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <div className="space-y-2">
          <h2 className="text-2xl">{feature.name}</h2>
          <p className="text-muted-foreground">{feature.summary}</p>
          <p className="pt-2 font-serif text-3xl font-semibold">
            ₹{(1 + roi).toFixed(1)} back <span className="text-lg font-normal text-muted-foreground">for every ₹1 spent</span>
          </p>
          <p className="text-sm text-muted-foreground">
            {money(report.totalBenefit)} of proven value against {money(report.totalCost)} of cost over{" "}
            {feature.horizonMonths} months.
            {feature.decision && (
              <>
                {" "}
                Decision: <span className="font-medium capitalize text-foreground">{feature.decision.toLowerCase()}</span>.
              </>
            )}
          </p>
          <Button asChild variant="outline" size="sm" className="mt-2">
            <Link href={`/features/${feature.key}`}>See the evidence</Link>
          </Button>
        </div>
        <ul className="space-y-3">
          {report.kpis.filter((k) => k.role === "PRIMARY").map((k) => (
            <li key={k.key} className="rounded-xl bg-background p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <KpiIcon category={k.category} className="h-6 w-6" />
                {k.name}
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">{report.armLabels[0]}</div>
                  <div className="font-mono text-2xl text-muted-foreground">{formatKpiValue(k.control.value, k.unit)}</div>
                </div>
                <ArrowRight className="mb-2 h-5 w-5 text-muted-foreground" aria-hidden />
                <div>
                  <div className="text-xs text-muted-foreground">{report.armLabels[1]}</div>
                  <div className="font-mono text-2xl font-semibold">{formatKpiValue(k.treatment.value, k.unit)}</div>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {k.control.n.toLocaleString("en-IN")} vs {k.treatment.n.toLocaleString("en-IN")}{" "}
                {k.sampleUnit} ·{" "}
                {k.significant
                  ? `real effect (p ${k.pValue! < 0.001 ? "< 0.001" : `= ${k.pValue!.toFixed(3)}`})`
                  : "not significant, so it counts as ₹0"}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export function EmptyState() {
  return (
    <section className="mx-auto max-w-2xl space-y-4 rounded-2xl border border-border bg-card p-8 text-center">
      <h1 className="text-2xl">The ledger is empty</h1>
      <p className="text-muted-foreground">
        The database is connected and migrated, but no features have been registered yet. Deploys load the demo
        scenario automatically into an empty database. To load it by hand:
      </p>
      <pre className="terminal rounded-md p-3 text-left font-mono text-xs">DATABASE_URL=&quot;postgres://…&quot; npm run db:seed</pre>
      <p className="text-sm text-muted-foreground">
        Or start for real:{" "}
        <Link href="/features/new" className="text-primary hover:underline">
          write the first feature spec
        </Link>
        .
      </p>
    </section>
  )
}
