import Link from "next/link"
import { AlertTriangle, Plus } from "lucide-react"
import { db } from "@/lib/db"
import { buildReport, featureWithSpec } from "@/lib/analytics/report"
import { gateFor } from "@/lib/governance"
import { ATTRIBUTION_LABEL, formatInr, formatPct, type AttributionMethod } from "@/lib/domain"
import { RecommendationBadge, StatusBadge } from "@/components/badges"
import { RoiChart } from "@/components/roi-chart"
import { Button } from "@/components/ui/button"

export const dynamic = "force-dynamic"

export default async function PortfolioPage() {
  const features = await db.feature.findMany({ ...featureWithSpec, orderBy: { createdAt: "asc" } })
  const rows = await Promise.all(
    features.map(async (f) => ({ f, report: await buildReport(f), gate: await gateFor(f) })),
  )

  const live = rows.filter(({ f }) => f.status === "SHIPPED" || f.status === "RETIRED")
  // Headline figures use credible results only — provisional numbers stay out of the portfolio total.
  const credibleRows = live.filter((r) => r.report.credible)
  const invested = credibleRows.reduce((a, r) => a + r.report.totalCost, 0)
  const proven = credibleRows.reduce((a, r) => a + r.report.totalBenefit, 0)
  const portfolioRoi = invested > 0 ? (proven - invested) / invested : null
  const credible = credibleRows.length

  const flagGroups = await db.event.groupBy({ by: ["featureFlag"], where: { featureFlag: { not: null } }, _count: { _all: true } })
  const registered = new Set(features.map((f) => f.key))
  const unregistered = flagGroups.filter((g) => g.featureFlag && !registered.has(g.featureFlag))
  const blocked = rows.filter((r) => r.gate.next && r.gate.checks.some((c) => !c.ok))

  const sorted = [...live].sort((a, b) => (b.report.roi ?? -Infinity) - (a.report.roi ?? -Infinity))

  return (
    <div className="space-y-10">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl space-y-2">
          <h1 className="text-3xl font-bold">Feature portfolio</h1>
          <p className="text-muted-foreground">
            Every feature declares its KPIs before development, ships with instrumentation, and is judged on proven
            ROI. Only KPI changes that are statistically significant count as benefit.
          </p>
        </div>
        <Button asChild>
          <Link href="/features/new">
            <Plus className="h-4 w-4" /> New feature spec
          </Link>
        </Button>
      </section>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Portfolio ROI" value={formatPct(portfolioRoi)} hint="credible features, proven benefits only" />
        <Stat label="Proven benefit" value={formatInr(proven)} hint="credible features, over each horizon" />
        <Stat label="Total cost" value={formatInr(invested)} hint="credible features, build + run" />
        <Stat label="Credible results" value={`${credible} / ${live.length}`} hint="window and sample size met" />
      </section>

      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-1 text-lg font-semibold">ROI by feature</h2>
        <p className="mb-5 text-sm text-muted-foreground">Hover a bar for benefit and cost; click a name for the full report.</p>
        <RoiChart
          bars={sorted
            .filter((r) => r.report.roi !== null)
            .map(({ f, report }) => ({
              key: f.key,
              name: f.name,
              roi: report.roi!,
              totalBenefit: report.totalBenefit,
              totalCost: report.totalCost,
              provisional: !report.credible,
            }))}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">All features</h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Feature</th>
                <th className="px-4 py-3 font-medium">Stage</th>
                <th className="px-4 py-3 font-medium">Attribution</th>
                <th className="px-4 py-3 text-right font-medium">ROI</th>
                <th className="px-4 py-3 font-medium">Verdict</th>
                <th className="px-4 py-3 font-medium">Decision</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ f, report }) => (
                <tr key={f.id} className="border-t border-border hover:bg-secondary/30">
                  <td className="px-4 py-3">
                    <Link href={`/features/${f.key}`} className="font-medium hover:underline">
                      {f.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {f.team} · {f.owner}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={f.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {ATTRIBUTION_LABEL[f.attributionMethod as AttributionMethod]}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatPct(report.roi)}</td>
                  <td className="px-4 py-3">
                    <RecommendationBadge kind={report.recommendation.kind} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{f.decision ? f.decision.toLowerCase() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {(blocked.length > 0 || unregistered.length > 0) && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <AlertTriangle className="h-5 w-5 text-status-warning" aria-hidden /> Governance gaps
          </h2>
          <ul className="space-y-2 text-sm">
            {blocked.map(({ f, gate }) => (
              <li key={f.id} className="rounded-lg border border-border bg-card px-4 py-3">
                <Link href={`/features/${f.key}`} className="font-medium hover:underline">
                  {f.name}
                </Link>{" "}
                <span className="text-muted-foreground">
                  is blocked from moving on: {gate.checks.filter((c) => !c.ok).length} check(s) failing.
                </span>
              </li>
            ))}
            {unregistered.map((g) => (
              <li key={g.featureFlag} className="rounded-lg border border-border bg-card px-4 py-3">
                <code className="font-mono text-xs">{g.featureFlag}</code>{" "}
                <span className="text-muted-foreground">
                  sent {g._count._all} events but has no registered spec, owner or KPIs, so its impact can&apos;t
                  be measured.
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  )
}
