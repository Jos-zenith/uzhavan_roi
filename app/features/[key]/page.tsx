import { OctagonX } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { buildReport, featureWithSpec, weeklyAdoption, SIGNIFICANCE, type FeatureReport } from "@/lib/analytics/report"
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
  kpiFormula,
  parseGoals,
  type AttributionMethod,
  type Decision,
} from "@/lib/domain"
import { CheckRow, RecommendationBadge, StatusBadge } from "@/components/badges"
import { AdoptionChart } from "@/components/adoption-chart"
import { JsonInspector } from "@/components/json-inspector"
import { KpiIcon } from "@/components/kpi-icon"
import { featureHeadline, longDate, money } from "@/lib/narrative"
import { Approvals, AdvanceButton, CostForm, DecisionForm, NoteForm } from "./controls"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

export default async function FeaturePage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>
  searchParams: Promise<{ recovered?: string }>
}) {
  const { key } = await params
  const recovered = Number((await searchParams).recovered) || 0
  const f = await db.feature.findUnique({ where: { key }, ...featureWithSpec })
  if (!f) notFound()

  const [report, gate, inst, adoption, notes] = await Promise.all([
    buildReport(f),
    gateFor(f),
    instrumentationStatus(f),
    weeklyAdoption(f.key),
    db.reviewNote.findMany({ where: { featureId: f.id }, orderBy: { createdAt: "desc" } }),
  ])
  const kpiDefs = new Map(f.kpis.map((fk) => [fk.kpi.key, fk.kpi]))
  const headline = featureHeadline(f, report, gate)
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
          {f.releaseVersion && (
            <span className="font-mono text-xs text-muted-foreground">
              released {f.releaseVersion}
              {f.releasedAt && ` · ${f.releasedAt.toISOString().slice(0, 10)}`}
            </span>
          )}
          <JsonInspector url={`/api/features/${f.key}`} title={`${f.name}: spec, gate and report`} className="ml-auto" />
        </div>
        <p className="text-sm font-medium uppercase tracking-wide text-primary">
          {f.name} · {f.team}
        </p>
        <h1 className="max-w-4xl text-3xl leading-tight">{headline.headline}</h1>
        <p className="max-w-3xl text-lg text-muted-foreground">{headline.detail}</p>
        <p className="max-w-3xl pt-2 text-sm text-muted-foreground">
          <span className="text-foreground">What it is:</span> {f.summary} Owned by{" "}
          <span className="text-foreground">{f.owner}</span>.
        </p>
      </section>

      {report.killed && (
        <div className="flex items-start gap-3 rounded-xl border-2 border-status-critical/50 bg-status-critical/10 px-4 py-3">
          <OctagonX className="mt-0.5 h-5 w-5 shrink-0 text-status-critical" aria-hidden />
          <div className="text-sm">
            <p className="font-medium">
              Killed by its guardrail on {longDate(report.killed.at)}, {report.killed.at.toISOString().slice(11, 16)} UTC
            </p>
            <p className="text-muted-foreground">{report.killed.reason}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              The flag endpoint (<code className="font-mono">/api/flags</code>) now serves control to everyone. An incident
              ticket is open.
            </p>
          </div>
        </div>
      )}

      {recovered > 0 && (
        <p className="rounded-xl border border-status-good/40 bg-status-good/10 px-4 py-3 text-sm">
          ✓ Spec registered. <strong>{recovered.toLocaleString("en-IN")} quarantined events</strong> for{" "}
          <code className="font-mono text-xs">{f.key}</code> were released and now count toward instrumentation and
          KPIs.
        </p>
      )}

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
              <Figure label="Return on cost" value={formatPct(report.roi)} />
              <Figure label={`Proven value, ${f.horizonMonths} mo`} value={money(report.totalBenefit)} />
              <Figure label={`Cost, ${f.horizonMonths} mo`} value={money(report.totalCost)} />
              <Figure
                label={report.windowMet ? `Days measured (needed ${f.observationDays})` : "Days measured"}
                value={report.windowMet ? `${report.observedDays}` : `${report.observedDays} of ${f.observationDays}`}
              />
            </div>
            <Sensitivity rows={report.sensitivity} breakEven={report.breakEvenFactor} credible={report.credible} />
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">How this is calculated</summary>
              <div className="mt-2 space-y-1 font-mono text-xs text-muted-foreground">
                <p>
                  value = {formatInr(report.monthlyBenefit)}/mo × {f.horizonMonths} = {formatInr(report.totalBenefit)}
                </p>
                <p>
                  cost = {formatInr(report.oneTimeCost)} + {formatInr(report.monthlyCost)}/mo × {f.horizonMonths} ={" "}
                  {formatInr(report.totalCost)}
                </p>
                <p>return on cost = (value − cost) ÷ cost = {formatPct(report.roi)}</p>
                <p className="font-sans">
                  Only KPI changes with p &lt; {SIGNIFICANCE} count as value. Each KPI&apos;s monthly value = its proven
                  improvement × monthly volume × ₹ per unit, from the spec below.
                </p>
              </div>
            </details>
          </div>
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-1 font-semibold">Who&apos;s using it</h2>
            <p className="mb-3 text-xs text-muted-foreground">Farmers who saw the feature each week (treatment group)</p>
            <AdoptionChart weeks={adoption.map((w) => ({ label: w.weekStart.toISOString().slice(0, 10), users: w.users }))} />
          </div>
        </section>
      )}

      {live && !report.credible && rec.kind !== "KILLED" && <Countdown f={f} report={report} />}

      {/* KPI results */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">What we promised vs what happened</h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">KPI</th>
                <th className="px-4 py-3 font-medium">Baseline → target</th>
                <th className="px-4 py-3 text-right font-medium">{report.armLabels[0]}</th>
                <th className="px-4 py-3 text-right font-medium">{report.armLabels[1]}</th>
                <th className="px-4 py-3 text-right font-medium">Change (95% CI)</th>
                <th className="px-4 py-3 text-right font-medium" title="Final-verdict test, Holm-adjusted across the primary KPIs">
                  p (Holm)
                </th>
                <th className="px-4 py-3 text-right font-medium" title="Always-valid sequential test (mSPRT): safe to watch live">
                  p (live)
                </th>
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
                      <div className="flex gap-3">
                        <KpiIcon category={k.category} />
                        <div>
                          <div className="font-medium">
                            {k.name}
                            {k.role === "GUARDRAIL" && (
                              <span className="ml-2 rounded border border-border px-1.5 py-px align-middle font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                                guardrail
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">{k.direction === "UP" ? "higher is better" : "lower is better"}</div>
                          {kpiDefs.get(k.key) && (
                            <div className="mt-1 font-mono text-[11px] leading-4 text-muted-foreground" title={kpiFormula(kpiDefs.get(k.key)!).test}>
                              {kpiFormula(kpiDefs.get(k.key)!).formula}
                            </div>
                          )}
                        </div>
                      </div>
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
                      {k.seasonal && (
                        <div className="mt-1 max-w-52 text-left text-xs text-muted-foreground">
                          alert districts {formatKpiDelta(k.seasonal.treatedChange, k.unit)}, holdout ({k.seasonal.holdoutDistricts.join(", ")}){" "}
                          {formatKpiDelta(k.seasonal.holdoutChange, k.unit)}: the difference is the feature
                        </div>
                      )}
                    </td>
                    <td
                      className="px-4 py-3 text-right font-mono tabular-nums"
                      title={k.pValue === null ? undefined : `raw p = ${k.pValue.toFixed(4)}`}
                    >
                      {fmtP(k.pAdjusted)}
                      {k.pValue !== null && k.pAdjusted !== null && k.pAdjusted !== k.pValue && (
                        <div className="text-xs text-muted-foreground">raw {fmtP(k.pValue)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{fmtP(k.pSequential)}</td>
                    <td className="px-4 py-3 text-xs">
                      {!live ? (
                        <span className="text-muted-foreground">not live</span>
                      ) : k.role === "GUARDRAIL" ? (
                        k.tripped ? (
                          <span className="font-medium text-status-critical">✕ harm detected: kill switch</span>
                        ) : (
                          <span className="text-status-good">✓ no harm detected</span>
                        )
                      ) : worse ? (
                        <span className="text-status-critical">✕ significantly worse</span>
                      ) : k.targetMet ? (
                        <span className="text-status-good">✓ target met</span>
                      ) : k.significant ? (
                        <span>↗ improved, below target</span>
                      ) : (
                        <span className="text-muted-foreground">
                          no proven change
                          {k.power.required !== null && !k.power.reached && (
                            <span className="block">
                              underpowered: needs ~{k.power.required.toLocaleString("en-IN")}/arm, has{" "}
                              {k.power.current.toLocaleString("en-IN")}
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums">
                      {live ? formatInr(k.monthlyBenefit) : "—"}
                      {k.breakEvenValue !== null && (
                        <div className="whitespace-normal font-sans text-xs text-muted-foreground" title="₹ per unit this KPI would need to be worth for the feature to break even, others as assumed">
                          {k.breakEvenValue < 0.005
                            ? "pays back even at ₹0 per unit"
                            : `breaks even at ₹${k.breakEvenValue.toFixed(k.breakEvenValue < 10 ? 2 : 0)}/unit (assumed ₹${k.valuePerUnit})`}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <MethodNote
          kpis={report.kpis.map((k) => ({ name: k.name, test: kpiDefs.get(k.key) ? kpiFormula(kpiDefs.get(k.key)!).test : "—" }))}
          minSample={f.minSamplePerArm}
          smallestArm={report.kpis.length ? Math.min(...report.kpis.flatMap((k) => [k.control.n, k.treatment.n])) : 0}
          sampleMet={report.sampleMet}
          windowDays={f.observationDays}
          observedDays={report.observedDays}
          windowMet={report.windowMet}
          live={live}
          method={ATTRIBUTION_LABEL[method]}
          holm={report.kpis.length > 1}
          srm={report.srm}
        />
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
            {f.attributionMethod !== "PRE_POST" && (
              <>
                <dt className="text-muted-foreground">Split</dt>
                <dd>{Math.round(f.treatmentShare * 100)}% treatment</dd>
              </>
            )}
            {f.holdoutDistricts && (
              <>
                <dt className="text-muted-foreground">Holdout</dt>
                <dd>{f.holdoutDistricts.split(",").join(", ")}: no alerts, to measure the season</dd>
              </>
            )}
            <dt className="text-muted-foreground">₹ sources</dt>
            <dd>
              <ul className="space-y-1">
                {f.kpis.map((k) => (
                  <li key={k.id}>
                    <span className="font-mono text-xs">
                      ₹{k.valuePerUnit}
                      {k.valueLow !== null && k.valueHigh !== null && ` (₹${k.valueLow}–₹${k.valueHigh})`}
                    </span>{" "}
                    per unit of {k.kpi.name.toLowerCase()}:{" "}
                    {k.valueSource ? (
                      <span className="text-muted-foreground">{k.valueSource}</span>
                    ) : (
                      <span className="text-status-critical">no source given</span>
                    )}
                  </li>
                ))}
              </ul>
            </dd>
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
              approvals={{
                product: { ok: f.productApproved, by: f.productApprovedBy },
                engineering: { ok: f.engineeringApproved, by: f.engineeringApprovedBy },
                analytics: { ok: f.analyticsApproved, by: f.analyticsApprovedBy },
                finance: { ok: f.financeApproved, by: f.financeApprovedBy },
              }}
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
          <section id="review" className="scroll-mt-20 space-y-4 rounded-xl border border-border bg-card p-6">
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

      {/* Review log */}
      <section className="space-y-4 rounded-xl border border-border bg-card p-6">
        <div>
          <h2 className="text-lg font-semibold">Review log</h2>
          <p className="text-sm text-muted-foreground">
            What the owner saw, decided and why, plus every gate outcome, including refusals.
          </p>
        </div>
        <NoteForm featureKey={f.key} defaultAuthor={f.owner} />
        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing logged yet.</p>
        ) : (
          <ol className="space-y-0">
            {notes.map((n) => (
              <li key={n.id} className="grid grid-cols-[6.5rem_1fr] gap-3 border-t border-border py-3 text-sm first:border-0">
                <time className="font-mono text-xs text-muted-foreground" dateTime={n.createdAt.toISOString()}>
                  {n.createdAt.toISOString().slice(0, 10)}
                  <br />
                  {n.createdAt.toISOString().slice(11, 16)} UTC
                </time>
                <div className="min-w-0">
                  <div className="mb-0.5 flex flex-wrap items-center gap-2 text-xs">
                    <span className={n.kind === "SYSTEM" ? "font-mono text-muted-foreground" : "font-medium text-foreground"}>{n.author}</span>
                    {n.kind !== "NOTE" && (
                      <span className="rounded border border-border px-1.5 py-px font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                        {n.kind === "DECISION" ? "decision" : "system"}
                      </span>
                    )}
                  </div>
                  <p className={cn("whitespace-pre-line", n.kind === "SYSTEM" && "font-mono text-xs text-muted-foreground")}>
                    {n.body.split("`").map((part, i) => (i % 2 ? <code key={i} className="font-mono text-xs">{part}</code> : part))}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

const fmtP = (p: number | null) => (p === null ? "—" : p < 0.001 ? "<0.001" : p.toFixed(3))

const verdictAt = (roi: number | null) => (roi === null ? "—" : roi >= 0.5 ? "scale" : roi >= 0 ? "iterate" : "retire")

/** ROI as a band: every ₹ value at its low, assumed and high estimate, and where it breaks even. */
function Sensitivity({ rows, breakEven, credible }: { rows: FeatureReport["sensitivity"]; breakEven: number | null; credible: boolean }) {
  if (rows.every((r) => r.roi === null)) return null
  const fragile = breakEven !== null && breakEven > 0.8
  const label = { low: "low ₹ estimates", base: "as assumed", high: "high ₹ estimates" } as const
  return (
    <div className="mt-4 rounded-lg bg-background p-3 text-sm">
      <p className="mb-2 text-xs text-muted-foreground">Return on cost across the finance-approved ₹ range</p>
      <div className="grid grid-cols-3 gap-2">
        {rows.map((r) => (
          <div key={r.label} className={cn("rounded-md p-2", r.label === "base" && "bg-card")}>
            <div className="text-xs text-muted-foreground">{label[r.label]}</div>
            <div className="font-mono text-base">{formatPct(r.roi)}</div>
            {credible && <div className="text-xs text-muted-foreground">would be: {verdictAt(r.roi)}</div>}
          </div>
        ))}
      </div>
      <p className={cn("mt-2 text-xs", fragile ? "text-foreground" : "text-muted-foreground")}>
        {breakEven === null
          ? "No proven value, so no ₹ assumption can make this pay back."
          : breakEven > 1
            ? `Would only break even if the ₹ values were ${(breakEven * 100).toFixed(0)}% of what's assumed.`
            : `Breaks even if the ₹ values are at least ${(breakEven * 100).toFixed(0)}% of what's assumed.${fragile ? " That's fragile: a small misestimate flips the verdict." : " Robust to a large misestimate."}`}
      </p>
    </div>
  )
}

/** "Keep measuring" as a countdown: what's still missing, and when it arrives at current traffic. */
function Countdown({ f, report }: { f: { observationDays: number; minSamplePerArm: number }; report: FeatureReport }) {
  const { credibility: c } = report
  const smallest = report.kpis.length ? Math.min(...report.kpis.flatMap((k) => [k.control.n, k.treatment.n])) : 0
  const farOff = (d: Date | null) => d !== null && d.getTime() - Date.now() > 365 * 86_400_000
  const unproven = report.kpis.filter((k) => k.role === "PRIMARY" && !k.significant && k.power.required !== null)
  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <p className="text-xs font-medium uppercase tracking-wide text-primary">When this becomes final</p>
      <p className="mt-1 font-serif text-2xl font-semibold">
        {report.srm && !report.srm.ok
          ? "Not until the traffic split is fixed"
          : c.credibleOn
            ? longDate(c.credibleOn)
            : "Not at current traffic"}
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Progress
          label="Observation window"
          value={report.observedDays}
          target={f.observationDays}
          unit="days"
          note={c.windowClosesOn ? `closes ${longDate(c.windowClosesOn)}` : undefined}
        />
        <Progress
          label="Minimum sample, smallest arm"
          value={smallest}
          target={f.minSamplePerArm}
          unit="per arm"
          note={
            report.sampleMet
              ? "met"
              : c.sampleReachedOn
                ? `at ~${c.perArmPerDay.toFixed(0)}/day, reached ${longDate(c.sampleReachedOn)}`
                : "no traffic yet"
          }
        />
      </div>
      {unproven.length > 0 && (
        <ul className="mt-4 space-y-1 border-t border-border pt-3 text-sm">
          {unproven.map((k) => (
            <li key={k.key}>
              <span className="font-medium">{k.name}</span>
              <span className="text-muted-foreground">
                : to detect its target it needs ~{k.power.required!.toLocaleString("en-IN")} per arm and has{" "}
                {k.power.current.toLocaleString("en-IN")}.{" "}
                {k.power.reached
                  ? "Enough sample. If it's still not significant at the close, the effect is smaller than targeted."
                  : k.power.reachedOn
                    ? farOff(k.power.reachedOn)
                      ? `At current traffic that's ${k.power.reachedOn.getFullYear()}, so effectively it can't be proven. Judge this feature on its other KPIs.`
                      : `At current traffic, enough by ${longDate(k.power.reachedOn)}.`
                    : "No traffic yet."}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Progress({ label, value, target, unit, note }: { label: string; value: number; target: number; unit: string; note?: string }) {
  const pctDone = Math.min(100, (value / Math.max(1, target)) * 100)
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {value.toLocaleString("en-IN")} / {target.toLocaleString("en-IN")} {unit}
        </span>
      </div>
      <div className="h-2 rounded-full bg-secondary" role="progressbar" aria-valuenow={Math.round(pctDone)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-2 rounded-full bg-primary" style={{ width: `${pctDone}%` }} />
      </div>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </div>
  )
}

function MethodNote(p: {
  kpis: { name: string; test: string }[]
  minSample: number
  smallestArm: number
  sampleMet: boolean
  windowDays: number
  observedDays: number
  windowMet: boolean
  live: boolean
  method: string
  holm: boolean
  srm: FeatureReport["srm"]
}) {
  const mark = (ok: boolean) => (ok ? <span className="text-status-good">met</span> : <span className="text-foreground">not yet</span>)
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-sm">
      <p className="mb-2 font-medium">
        Method{" "}
        <Link href="/playbook#method" className="text-xs font-normal text-primary hover:underline">
          how significance is decided →
        </Link>
      </p>
      <ul className="grid gap-x-8 gap-y-1 text-muted-foreground md:grid-cols-2">
        <li>
          {p.method}, two-sided tests at <span className="text-foreground">95% confidence</span> (an effect counts only if p &lt; 0.05)
        </li>
        {p.kpis.map((k) => (
          <li key={k.name}>
            {k.name}: <span className="text-foreground">{k.test}</span>
          </li>
        ))}
        <li>
          Minimum sample: {p.minSample.toLocaleString("en-IN")} per arm ·{" "}
          {p.live ? (
            <>
              smallest arm {p.smallestArm.toLocaleString("en-IN")} · {mark(p.sampleMet)}
            </>
          ) : (
            "not live yet"
          )}
        </li>
        <li>
          Observation window: {p.windowDays} days ·{" "}
          {p.live ? (
            <>
              day {p.observedDays} · {mark(p.windowMet)}
            </>
          ) : (
            "not live yet"
          )}
        </li>
        {p.holm && (
          <li>
            <span className="text-foreground">Holm correction</span> across the primary KPIs, so testing several
            doesn&apos;t inflate the chance of a false win
          </li>
        )}
        <li>
          <span className="text-foreground">Live p-values are always-valid</span> (mSPRT): looking early can&apos;t fake a
          win, so a clear result can be called before the window closes
        </li>
        <li>
          <span className="text-foreground">Guardrails</span> are re-tested on every batch of events; significant harm
          trips the kill switch
        </li>
        {p.srm && (
          <li>
            Traffic split (SRM check): planned {Math.round(p.srm.expectedShare * 100)}% treatment, observed{" "}
            {(p.srm.observedShare * 100).toFixed(1)}% ·{" "}
            {p.srm.ok ? <span className="text-status-good">consistent</span> : <span className="font-medium text-status-critical">mismatch, results untrusted</span>}
          </li>
        )}
      </ul>
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

const t = createTelemetry({ endpoint: "/api/events", app: "vayal", release: APP_VERSION })
t.identify(user.id)
${assign}

${kpiActions.map((a) => `t.track("${a}", { feature: "${flag}"${a.endsWith("completed") || a.endsWith("submitted") ? ", value: seconds" : ""} })`).join("\n")}`
}
