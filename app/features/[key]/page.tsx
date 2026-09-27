import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { buildReport, featureWithSpec, weeklyAdoption, SIGNIFICANCE } from "@/lib/analytics/report"
import { gateFor, instrumentationStatus } from "@/lib/governance"
import {
  ATTRIBUTION_LABEL,
  FEATURE_STATUSES,
  GOAL_LABEL,
  STATUS_LABEL,
  formatInr,
  formatKpiDelta,
  formatKpiValue,
  formatPct,
  parseGoals,
  type AttributionMethod,
  type Decision,
} from "@/lib/domain"
import { CheckRow, RecommendationBadge, StatusBadge } from "@/components/badges"
import { AdoptionChart } from "@/components/adoption-chart"
import { Approvals, AdvanceButton, CostForm, DecisionForm } from "./controls"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

export default async function FeaturePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const f = await db.feature.findUnique({ where: { key }, ...featureWithSpec })
  if (!f) notFound()

  const [report, gate, inst, adoption] = await Promise.all([
    buildReport(f),
    gateFor(f),
    instrumentationStatus(f),
    weeklyAdoption(f.key),
  ])
  const goals = parseGoals(f.goals)
  const method = f.attributionMethod as AttributionMethod
  const live = f.status === "SHIPPED" || f.status === "RETIRED"
  const stageIndex = FEATURE_STATUSES.indexOf(f.status as (typeof FEATURE_STATUSES)[number])
  const rec = report.recommendation
  const suggested = (["SCALE", "ITERATE", "RETIRE"] as const).includes(rec.kind as Decision) ? (rec.kind as Decision) : null

  return (
    <div className="space-y-8">
      {/* Header */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={f.status} />
          <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">{f.key}</code>
          {f.releaseVersion && <span className="text-xs text-muted-foreground">released in {f.releaseVersion}</span>}
        </div>
        <h1 className="text-3xl font-bold">{f.name}</h1>
        <p className="max-w-3xl text-muted-foreground">{f.summary}</p>
        <p className="text-sm text-muted-foreground">
          Owner: <span className="text-foreground">{f.owner}</span> · Team: <span className="text-foreground">{f.team}</span>
        </p>
      </section>

      {/* Lifecycle */}
      <ol className="flex flex-wrap gap-2 text-xs" aria-label="Lifecycle">
        {FEATURE_STATUSES.map((s, i) => (
          <li
            key={s}
            className={cn(
              "rounded-full border px-3 py-1",
              i === stageIndex ? "border-primary bg-primary/15 text-foreground" : i < stageIndex ? "border-border text-foreground" : "border-border text-muted-foreground",
            )}
          >
            {i < stageIndex && "✓ "}
            {STATUS_LABEL[s]}
          </li>
        ))}
      </ol>

      {/* Verdict */}
      {live && (
        <section className="grid gap-4 md:grid-cols-[2fr_1fr]">
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <RecommendationBadge kind={rec.kind} className="text-sm" />
              <span className="text-sm text-muted-foreground">{rec.reason}</span>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Figure label="ROI" value={formatPct(report.roi)} />
              <Figure label={`Proven benefit (${f.horizonMonths} mo)`} value={formatInr(report.totalBenefit)} />
              <Figure label={`Total cost (${f.horizonMonths} mo)`} value={formatInr(report.totalCost)} />
              <Figure label="Observed" value={`${report.observedDays} / ${f.observationDays} days`} />
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              ROI = ({formatInr(report.monthlyBenefit)}/mo × {f.horizonMonths} − ({formatInr(report.oneTimeCost)} +{" "}
              {formatInr(report.monthlyCost)}/mo × {f.horizonMonths})) ÷ total cost. Benefits count only KPI changes
              with p &lt; {SIGNIFICANCE}.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-1 font-semibold">Leading indicator</h2>
            <p className="mb-3 text-xs text-muted-foreground">Weekly users exposed to the feature (treatment)</p>
            <AdoptionChart weeks={adoption.map((w) => ({ label: w.weekStart.toISOString().slice(0, 10), users: w.users }))} />
          </div>
        </section>
      )}

      {/* KPI results */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">KPIs: declared targets vs measured impact</h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">KPI</th>
                <th className="px-4 py-3 font-medium">Baseline → target</th>
                <th className="px-4 py-3 text-right font-medium">{report.armLabels[0]}</th>
                <th className="px-4 py-3 text-right font-medium">{report.armLabels[1]}</th>
                <th className="px-4 py-3 text-right font-medium">Change (95% CI)</th>
                <th className="px-4 py-3 text-right font-medium">p</th>
                <th className="px-4 py-3 font-medium">Result</th>
                <th className="px-4 py-3 text-right font-medium">₹ / month</th>
              </tr>
            </thead>
            <tbody>
              {report.kpis.map((k) => {
                const worse = k.significant && (k.improvement ?? 0) < 0
                return (
                  <tr key={k.featureKpiId} className="border-t border-border align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium">{k.name}</div>
                      <div className="text-xs text-muted-foreground">{k.direction === "UP" ? "higher is better" : "lower is better"}</div>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {formatKpiValue(k.baseline, k.unit)} → {formatKpiValue(k.target, k.unit)}
                      <div className="text-xs">({formatKpiDelta(k.targetDelta, k.unit)})</div>
                    </td>
                    <Arm value={formatKpiValue(k.control.value, k.unit)} n={k.control.n} />
                    <Arm value={formatKpiValue(k.treatment.value, k.unit)} n={k.treatment.n} />
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatKpiDelta(k.delta, k.unit)}
                      {k.ciLow !== null && (
                        <div className="text-xs text-muted-foreground">
                          {formatKpiDelta(k.ciLow, k.unit)} … {formatKpiDelta(k.ciHigh, k.unit)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{k.pValue === null ? "—" : k.pValue < 0.001 ? "<0.001" : k.pValue.toFixed(3)}</td>
                    <td className="px-4 py-3 text-xs">
                      {!live ? (
                        <span className="text-muted-foreground">not live</span>
                      ) : worse ? (
                        <span className="text-status-critical">✕ significantly worse</span>
                      ) : k.targetMet ? (
                        <span className="text-status-good">✓ target met</span>
                      ) : k.significant ? (
                        <span>↗ improved, below target</span>
                      ) : (
                        <span className="text-muted-foreground">no proven change</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{live ? formatInr(k.monthlyBenefit) : "—"}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Spec */}
        <section className="space-y-4 rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Metrics &amp; telemetry spec</h2>
          <div>
            <h3 className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Business goals</h3>
            <ul className="space-y-1 text-sm">
              {goals.map((g, i) => (
                <li key={i}>
                  <span className="text-muted-foreground">{GOAL_LABEL[g.type]}:</span> {g.statement}
                </li>
              ))}
            </ul>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Attribution</dt>
            <dd>{ATTRIBUTION_LABEL[method]}</dd>
            <dt className="text-muted-foreground">Segment</dt>
            <dd>{f.segment}</dd>
            <dt className="text-muted-foreground">Min. sample</dt>
            <dd>{f.minSamplePerArm} users per arm</dd>
            <dt className="text-muted-foreground">Window</dt>
            <dd>{f.observationDays} days</dd>
            <dt className="text-muted-foreground">ROI horizon</dt>
            <dd>{f.horizonMonths} months</dd>
            {f.qualitativeBenefits && (
              <>
                <dt className="text-muted-foreground">Qualitative</dt>
                <dd>{f.qualitativeBenefits}</dd>
              </>
            )}
          </dl>
          <div>
            <h3 className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Sign-off</h3>
            <Approvals
              featureKey={f.key}
              editable={f.status === "DRAFT"}
              approvals={{ product: f.productApproved, engineering: f.engineeringApproved, analytics: f.analyticsApproved }}
            />
          </div>
        </section>

        {/* Gate or decision */}
        {gate.next ? (
          <section className="space-y-4 rounded-xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold">Gate: {STATUS_LABEL[gate.next]}</h2>
            <ul className="space-y-2">
              {gate.checks.map((c) => (
                <CheckRow key={c.label} {...c} />
              ))}
            </ul>
            <AdvanceButton featureKey={f.key} next={gate.next} ready={gate.checks.every((c) => c.ok)} />
          </section>
        ) : f.status === "SHIPPED" ? (
          <section className="space-y-4 rounded-xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold">Portfolio review</h2>
            {f.decision && (
              <p className="text-sm">
                Last decision: <strong>{f.decision.toLowerCase()}</strong>
                {f.decidedAt && <span className="text-muted-foreground"> on {f.decidedAt.toISOString().slice(0, 10)}</span>}
                {f.decisionNote && <span className="text-muted-foreground">: “{f.decisionNote}”</span>}
              </p>
            )}
            <DecisionForm featureKey={f.key} suggested={suggested} />
          </section>
        ) : (
          <section className="space-y-2 rounded-xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold">Retired</h2>
            <p className="text-sm text-muted-foreground">
              {f.decisionNote || "Retired after portfolio review."}
            </p>
          </section>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Costs */}
        <section className="space-y-4 rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Cost ledger</h2>
          {f.costs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No costs recorded.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {f.costs.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="py-2 capitalize">{c.category.toLowerCase()}</td>
                    <td className="py-2 text-muted-foreground">{c.note}</td>
                    <td className="py-2 text-right tabular-nums">
                      {formatInr(c.amount)}
                      <span className="text-muted-foreground">{c.recurrence === "MONTHLY" ? "/mo" : ""}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <CostForm featureKey={f.key} />
        </section>

        {/* Instrumentation */}
        <section className="space-y-4 rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Instrumentation</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="pb-2 font-medium">Required event</th>
                <th className="pb-2 text-right font-medium">Received</th>
                <th className="pb-2 text-right font-medium">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {inst.actions.map((a) => (
                <tr key={a.action} className="border-t border-border">
                  <td className="py-2">
                    <code className="font-mono text-xs">{a.action}</code>
                  </td>
                  <td className={cn("py-2 text-right tabular-nums", a.count === 0 && "text-status-critical")}>
                    {a.count === 0 ? "✕ none" : a.count.toLocaleString("en-IN")}
                  </td>
                  <td className="py-2 text-right text-muted-foreground">{a.lastSeen ? a.lastSeen.toISOString().slice(0, 10) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">SDK snippet for engineers</summary>
            <pre className="mt-2 overflow-x-auto rounded-md bg-background p-3 font-mono text-xs leading-relaxed">{sdkSnippet(f.key, method, inst.actions.map((a) => a.action))}</pre>
          </details>
        </section>
      </div>
    </div>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function Arm({ value, n }: { value: string; n: number }) {
  return (
    <td className="px-4 py-3 text-right tabular-nums">
      {value}
      <div className="text-xs text-muted-foreground">n = {n.toLocaleString("en-IN")}</div>
    </td>
  )
}

function sdkSnippet(flag: string, method: AttributionMethod, actions: string[]) {
  const kpiActions = actions.filter((a) => a !== "feature_exposed")
  const assign =
    method === "PRE_POST"
      ? `t.expose("${flag}", "treatment")`
      : `t.expose("${flag}", assignVariant("${flag}", user.id, ${method === "AB_TEST" ? 50 : 20}))`
  return `import { createTelemetry, assignVariant } from "@/lib/telemetry/sdk"

const t = createTelemetry({ endpoint: "/api/events", app: "uzhavan", release: APP_VERSION })
t.identify(user.id)
${assign}

${kpiActions.map((a) => `t.track("${a}", { feature: "${flag}"${a.endsWith("completed") || a.endsWith("submitted") ? ", value: seconds" : ""} })`).join("\n")}`
}
