import Link from "next/link"
import { AlertTriangle, CalendarClock, Plus, ShieldAlert } from "lucide-react"
import { briefing, longDate, money } from "@/lib/narrative"
import { EmptyState, FeaturedStory, HowItWorks, Intro } from "@/components/home-sections"
import { cn } from "@/lib/utils"
import { db } from "@/lib/db"
import { buildReport, featureWithSpec, type KpiResult } from "@/lib/analytics/report"
import { gateFor, reviewStatus, type ReviewStatus } from "@/lib/governance"
import { quarantinedFlags } from "@/lib/registry"
import { pipelineStatus } from "@/lib/pipeline"
import { LivePipeline } from "@/components/live-pipeline"
import { EVENT_SCHEMA_VERSION } from "@/lib/telemetry/version"
import {
  ATTRIBUTION_LABEL,
  STATUS_LABEL,
  formatInr,
  formatKpiDelta,
  formatPct,
  type AttributionMethod,
  type FeatureStatus,
} from "@/lib/domain"
import { CheckRow, RecommendationBadge, StatusBadge } from "@/components/badges"
import { RoiChart } from "@/components/roi-chart"
import { JsonInspector } from "@/components/json-inspector"
import { Button } from "@/components/ui/button"

export const dynamic = "force-dynamic"

export default async function PortfolioPage() {
  const features = await db.feature.findMany({ ...featureWithSpec, orderBy: { createdAt: "asc" } })
  if (features.length === 0) return <EmptyState />
  const [rows, pipeline, unregistered, decisions] = await Promise.all([
    Promise.all(features.map(async (f) => ({ f, report: await buildReport(f), gate: await gateFor(f) }))),
    pipelineStatus(),
    quarantinedFlags(),
    db.reviewNote.findMany({ where: { kind: "DECISION" }, orderBy: { createdAt: "asc" }, select: { featureId: true, author: true } }),
  ])
  // Latest decision author per feature (later entries overwrite earlier ones).
  const decidedBy = new Map(decisions.map((d) => [d.featureId, d.author]))

  const live = rows.filter(({ f }) => f.status === "SHIPPED" || f.status === "RETIRED")
  // Headline figures use credible results only — provisional numbers stay out of the portfolio total.
  const credibleRows = live.filter((r) => r.report.credible)
  const invested = credibleRows.reduce((a, r) => a + r.report.totalCost, 0)
  const proven = credibleRows.reduce((a, r) => a + r.report.totalBenefit, 0)
  const portfolioRoi = invested > 0 ? (proven - invested) / invested : null
  const worst = [...credibleRows].sort((a, b) => a.report.totalBenefit - a.report.totalCost - (b.report.totalBenefit - b.report.totalCost))[0]
  // The strongest proven result tells the method's story in one example.
  const featured = [...credibleRows].filter((r) => (r.report.roi ?? 0) > 0).sort((a, b) => b.report.roi! - a.report.roi!)[0]
  const brief = briefing(
    rows.map((r) => ({ ...r, review: reviewStatus(r.f, r.report.credible) })),
    unregistered,
  )
  const sorted = [...live].sort((a, b) => (b.report.roi ?? -Infinity) - (a.report.roi ?? -Infinity))

  return (
    <div className="space-y-8">
      {/* Pipeline status: live counts from the warehouse, re-polled every few seconds */}
      <LivePipeline
        initial={{ ...pipeline, lastReceivedAt: pipeline.lastReceivedAt?.toISOString() ?? null }}
        schemaVersion={EVENT_SCHEMA_VERSION}
      />

      {/* The question the product answers, then the answer, generated from the numbers below */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium uppercase tracking-wide text-primary">Portfolio review · {longDate(new Date())}</p>
          <Button asChild size="sm" variant="outline">
            <Link href="/features/new">
              <Plus className="h-4 w-4" /> New feature spec
            </Link>
          </Button>
        </div>
        <h1 className="max-w-4xl text-4xl leading-tight md:text-5xl">Which features actually paid for themselves?</h1>
        <p className="max-w-4xl font-serif text-xl leading-snug md:text-2xl">{brief.headline}</p>
        <p className="max-w-3xl text-muted-foreground">
          {brief.summary} Only KPI changes that pass a significance test count as benefit. A win that isn&apos;t
          proven counts as zero, not &ldquo;promising&rdquo;.
        </p>
      </section>

      {featured && <FeaturedStory feature={featured.f} report={featured.report} />}

      <Intro />

      <HowItWorks />

      {brief.items.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl">Needs you</h2>
          <ul className="space-y-2">
            {brief.items.map((item) => {
              const Icon = item.tone === "urgent" ? AlertTriangle : item.tone === "soon" ? ShieldAlert : CalendarClock
              return (
                <li
                  key={item.title}
                  className={cn(
                    "flex flex-wrap items-start gap-3 rounded-xl border border-border border-l-4 bg-card px-4 py-3",
                    item.tone === "urgent" && "border-l-status-critical",
                    item.tone === "soon" && "border-l-status-warning",
                    item.tone === "info" && "border-l-muted-foreground/40",
                  )}
                >
                  <Icon
                    className={cn(
                      "mt-0.5 h-5 w-5 shrink-0",
                      item.tone === "urgent" ? "text-status-critical" : item.tone === "soon" ? "text-status-warning" : "text-muted-foreground",
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {item.title.split("`").map((part, i) => (i % 2 ? <code key={i} className="font-mono text-sm">{part}</code> : part))}
                    </p>
                    <p className="text-sm text-muted-foreground">{item.detail}</p>
                    {item.checks && (
                      <ul className="mt-1.5 space-y-1">
                        {item.checks.map((c) => (
                          <CheckRow key={c} ok={false} label={c} />
                        ))}
                      </ul>
                    )}
                  </div>
                  <Button asChild size="sm" variant={item.tone === "urgent" ? "default" : "outline"}>
                    <Link href={item.href}>{item.action}</Link>
                  </Button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <h2 className="border-t border-border pt-8 text-xl">The numbers behind it</h2>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Portfolio ROI" value={formatPct(portfolioRoi)} hint={`${credibleRows.length} credible features, proven benefits only`} />
        <Stat label="Proven benefit" value={money(proven)} hint="credible features, over each horizon" />
        <Stat label="Total cost" value={money(invested)} hint="build + run, same horizon" />
        <Stat
          label="Biggest drag"
          value={worst ? money(worst.report.totalBenefit - worst.report.totalCost) : "—"}
          hint={worst ? `${worst.f.name}: net over ${worst.f.horizonMonths} months` : "no credible results yet"}
        />
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-1 font-semibold">ROI by feature</h2>
        <p className="mb-4 text-sm text-muted-foreground">Hover a bar for the evidence behind it. Click a name for the full report.</p>
        <RoiChart
          bars={sorted
            .filter((r) => r.report.roi !== null)
            .map(({ f, report }) => ({
              key: f.key,
              name: f.name,
              roi: report.roi!,
              totalBenefit: report.totalBenefit,
              totalCost: report.totalCost,
              horizonMonths: f.horizonMonths,
              provisional: !report.credible,
              arms: armSample(report.kpis, report.armLabels),
              evidence: report.kpis.map((k) => ({
                name: k.name,
                delta: formatKpiDelta(k.delta, k.unit),
                relative: k.delta !== null && k.control.value ? k.delta / k.control.value : null,
                pValue: k.pValue,
                significant: k.significant,
                better: (k.improvement ?? 0) > 0,
              })),
            }))}
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">All features</h2>
          <JsonInspector url="/api/features" title="All features, with computed reports" />
        </div>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-secondary/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Feature</th>
                <th className="px-3 py-2 font-medium">Stage</th>
                <th className="px-3 py-2 font-medium">Attribution</th>
                <th className="px-3 py-2 text-right font-medium">ROI</th>
                <th className="px-3 py-2 font-medium">Verdict</th>
                <th className="px-3 py-2 font-medium">Decision</th>
                <th className="px-3 py-2" aria-label="Inspect" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ f, report }) => (
                <tr key={f.id} className="border-t border-border align-top hover:bg-secondary/30">
                  <td className="px-3 py-2">
                    <Link href={`/features/${f.key}`} className="font-medium hover:underline">
                      {f.name}
                    </Link>
                    <div className="font-mono text-xs text-muted-foreground">{f.key}</div>
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={f.status} />
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{ATTRIBUTION_LABEL[f.attributionMethod as AttributionMethod]}</td>
                  <td className="px-3 py-2 text-right">
                    {report.roi === null ? (
                      <span className="font-mono text-muted-foreground">—</span>
                    ) : (
                      <span className="group relative inline-block cursor-help font-mono tabular-nums underline decoration-dotted underline-offset-4">
                        {formatPct(report.roi)}
                        <span
                          role="tooltip"
                          className="pointer-events-none absolute right-0 top-full z-20 mt-1 hidden w-64 rounded-md border border-border bg-popover p-3 text-left text-xs no-underline shadow-lg group-hover:block"
                        >
                          <Breakdown label="Proven benefit" value={report.totalBenefit} />
                          <Breakdown label={`One-time cost`} value={-report.oneTimeCost} />
                          <Breakdown label={`Run cost × ${f.horizonMonths} mo`} value={-report.monthlyCost * f.horizonMonths} />
                          <div className="mt-1 border-t border-border pt-1">
                            <Breakdown label="Net" value={report.totalBenefit - report.totalCost} strong />
                          </div>
                          {!report.credible && <p className="mt-2 text-muted-foreground">Provisional: {report.recommendation.reason}</p>}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <RecommendationBadge kind={report.recommendation.kind} />
                    <div className="mt-1 max-w-56 text-xs text-muted-foreground">{report.recommendation.reason}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    <ReviewCell status={reviewStatus(f, report.credible)} by={decidedBy.get(f.id)} featureKey={f.key} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <JsonInspector url={`/api/features/${f.key}`} title={`${f.name}: spec, gate and report`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  )
}

const day = (d: Date) => d.toISOString().slice(0, 10)

/** Users per arm, from the user-based KPIs; falls back to event counts only if a feature has none. */
function armSample(kpis: KpiResult[], labels: [string, string]) {
  const userKpis = kpis.filter((k) => k.sampleUnit === "users")
  const pool = userKpis.length > 0 ? userKpis : kpis
  return {
    labels,
    unit: userKpis.length > 0 ? ("users" as const) : ("events" as const),
    n: [Math.max(...pool.map((k) => k.control.n)), Math.max(...pool.map((k) => k.treatment.n))] as [number, number],
  }
}

function ReviewCell({ status, by, featureKey }: { status: ReviewStatus; by?: string; featureKey: string }) {
  switch (status.kind) {
    case "DECIDED":
      return (
        <>
          <span className="text-sm font-medium capitalize text-foreground">{status.decision.toLowerCase()}</span>
          <div className="font-mono">{day(status.at)}</div>
          {by && <div>{by}</div>}
        </>
      )
    case "DUE":
      return (
        <>
          <span>review due</span>
          <div className="font-mono text-foreground">{day(status.at)}</div>
          <div>when the window closes</div>
        </>
      )
    case "OVERDUE":
      return (
        <>
          <span className="inline-flex items-center gap-1 font-medium text-foreground">
            <AlertTriangle className="h-3.5 w-3.5 text-status-warning" aria-hidden /> overdue {status.days}d
          </span>
          <div>
            results final since <span className="font-mono">{day(status.since)}</span>
          </div>
          <Link href={`/features/${featureKey}#review`} className="text-primary hover:underline">
            record a decision →
          </Link>
        </>
      )
    case "NEEDS_SAMPLE":
      return (
        <>
          <span>window closed</span>
          <div>below minimum sample. Extend or widen the rollout.</div>
        </>
      )
    default:
      return <span>—</span>
  }
}

function Breakdown({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-mono font-semibold text-foreground" : "font-mono text-foreground"}>{formatInr(value)}</span>
    </div>
  )
}
