"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  ATTRIBUTION_LABEL,
  ATTRIBUTION_METHODS,
  GOAL_LABEL,
  GOAL_TYPES,
  VOLUME_LABEL,
  type AttributionMethod,
  type GoalType,
  type KpiCalculation,
} from "@/lib/domain"
import { cn } from "@/lib/utils"
import { daysNeeded, expectedPerArm, requiredPerArm } from "@/lib/analytics/power"

type KpiOption = { id: string; name: string; unit: string; direction: string; calculation: string }
type KpiRow = { kpiId: string; baseline: string; targetDelta: string; monthlyVolume: string; valuePerUnit: string; valueSource: string }

const input =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 64)

/** Ratios are entered as percentages / percentage points and stored as fractions. */
const unitHint = (unit?: string) => (unit === "RATIO" ? "%" : unit === "SECONDS" ? "seconds" : "per 1k users")
const toStored = (v: string, unit?: string) => (unit === "RATIO" ? Number(v) / 100 : Number(v))

export function SpecForm({ kpis, initialFlag }: { kpis: KpiOption[]; initialFlag?: string }) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [key, setKey] = useState(initialFlag ?? "")
  const [keyTouched, setKeyTouched] = useState(!!initialFlag)
  const [summary, setSummary] = useState("")
  const [owner, setOwner] = useState("")
  const [team, setTeam] = useState("")
  const [goals, setGoals] = useState<{ type: GoalType; statement: string }[]>([{ type: "REVENUE", statement: "" }])
  const [rows, setRows] = useState<KpiRow[]>([{ kpiId: "", baseline: "", targetDelta: "", monthlyVolume: "", valuePerUnit: "", valueSource: "" }])
  const [method, setMethod] = useState<AttributionMethod>("AB_TEST")
  const [share, setShare] = useState("50") // % of traffic in treatment
  const [segment, setSegment] = useState("")
  const [minSample, setMinSample] = useState("400")
  const [windowDays, setWindowDays] = useState("28")
  const [horizon, setHorizon] = useState("12")
  const [qualitative, setQualitative] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const kpiById = new Map(kpis.map((k) => [k.id, k]))
  const setRow = (i: number, patch: Partial<KpiRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    const res = await fetch("/api/features", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key,
        name,
        summary,
        owner,
        team,
        goals,
        kpis: rows.map((r) => {
          const unit = kpiById.get(r.kpiId)?.unit
          return {
            kpiId: r.kpiId,
            baseline: toStored(r.baseline, unit),
            targetDelta: toStored(r.targetDelta, unit),
            monthlyVolume: Number(r.monthlyVolume),
            valuePerUnit: Number(r.valuePerUnit),
            valueSource: r.valueSource,
          }
        }),
        attributionMethod: method,
        treatmentShare: method === "PRE_POST" ? 0.5 : Number(share) / 100,
        segment,
        minSamplePerArm: Number(minSample),
        observationDays: Number(windowDays),
        horizonMonths: Number(horizon),
        qualitativeBenefits: qualitative,
      }),
    })
    setSaving(false)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return setError(data.error ?? "Could not save the spec")
    router.push(`/features/${key}${data.recoveredEvents ? `?recovered=${data.recoveredEvents}` : ""}`)
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <Section title="1 · The feature">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Name">
            <input
              className={input}
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (!keyTouched) setKey(slug(e.target.value))
              }}
              placeholder="Tamil voice search"
            />
          </Field>
          <Field label="Feature flag" hint="Every event about this feature carries this key">
            <input
              className={cn(input, "font-mono")}
              required
              pattern="[a-z0-9_]+"
              value={key}
              onChange={(e) => {
                setKeyTouched(true)
                setKey(e.target.value)
              }}
            />
          </Field>
          <Field label="Business owner">
            <input className={input} required value={owner} onChange={(e) => setOwner(e.target.value)} />
          </Field>
          <Field label="Team">
            <input className={input} required value={team} onChange={(e) => setTeam(e.target.value)} />
          </Field>
        </div>
        <Field label="What it does, and for whom">
          <textarea className={cn(input, "h-20 py-2")} required value={summary} onChange={(e) => setSummary(e.target.value)} />
        </Field>
      </Section>

      <Section title="2 · Business goals (1–3)">
        {goals.map((g, i) => (
          <div key={i} className="flex gap-2">
            <select
              className={cn(input, "w-48 shrink-0")}
              value={g.type}
              onChange={(e) => setGoals(goals.map((x, j) => (j === i ? { ...x, type: e.target.value as GoalType } : x)))}
              aria-label="Goal type"
            >
              {GOAL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {GOAL_LABEL[t]}
                </option>
              ))}
            </select>
            <input
              className={input}
              required
              placeholder="e.g. Reduce checkout time by 20%"
              value={g.statement}
              onChange={(e) => setGoals(goals.map((x, j) => (j === i ? { ...x, statement: e.target.value } : x)))}
              aria-label="Goal statement"
            />
            {goals.length > 1 && <RemoveButton onClick={() => setGoals(goals.filter((_, j) => j !== i))} />}
          </div>
        ))}
        {goals.length < 3 && (
          <AddButton onClick={() => setGoals([...goals, { type: "PRODUCTIVITY", statement: "" }])}>Add goal</AddButton>
        )}
      </Section>

      <Section title="3 · KPIs from the shared catalogue (1–3)">
        <p className="text-sm text-muted-foreground">
          Baseline and target change say what success looks like. Volume and ₹ value turn a KPI change into money:
          benefit per month = improvement × volume × value.
        </p>
        {rows.map((r, i) => {
          const k = kpiById.get(r.kpiId)
          const hint = unitHint(k?.unit)
          return (
            <div key={i} className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex gap-2">
                <select className={input} required value={r.kpiId} onChange={(e) => setRow(i, { kpiId: e.target.value })} aria-label="KPI">
                  <option value="">Choose a KPI…</option>
                  {kpis.map((o) => (
                    <option key={o.id} value={o.id} disabled={rows.some((x, j) => j !== i && x.kpiId === o.id)}>
                      {o.name}
                    </option>
                  ))}
                </select>
                {rows.length > 1 && <RemoveButton onClick={() => setRows(rows.filter((_, j) => j !== i))} />}
              </div>
              {k && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label={`Baseline (${hint})`}>
                    <input className={input} type="number" step="any" required value={r.baseline} onChange={(e) => setRow(i, { baseline: e.target.value })} />
                  </Field>
                  <Field label={`Target change (${k.unit === "RATIO" ? "pp" : hint})`} hint={k.direction === "UP" ? "positive, higher is better" : "negative, lower is better"}>
                    <input className={input} type="number" step="any" required value={r.targetDelta} onChange={(e) => setRow(i, { targetDelta: e.target.value })} />
                  </Field>
                  <Field label="Monthly volume" hint={VOLUME_LABEL[k.calculation as KpiCalculation]}>
                    <input className={input} type="number" step="any" min={0} required value={r.monthlyVolume} onChange={(e) => setRow(i, { monthlyVolume: e.target.value })} />
                  </Field>
                  <Field label="₹ value per unit" hint={k.unit === "RATIO" ? "₹ per extra converting user" : k.unit === "SECONDS" ? "₹ per second saved" : "₹ per avoided event"}>
                    <input className={input} type="number" step="any" min={0} required value={r.valuePerUnit} onChange={(e) => setRow(i, { valuePerUnit: e.target.value })} />
                  </Field>
                  <div className="sm:col-span-2 lg:col-span-4">
                    <Field label="Where does the ₹ value come from?" hint="A report, ledger or model someone can check. The spec can't be approved without one.">
                      <input className={input} required value={r.valueSource} onChange={(e) => setRow(i, { valueSource: e.target.value })} placeholder="e.g. Average margin per input order, FY25 finance ledger" />
                    </Field>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-4">
                    <PowerReadout
                      calculation={k.calculation}
                      baseline={toStored(r.baseline, k.unit)}
                      delta={toStored(r.targetDelta, k.unit)}
                      volume={Number(r.monthlyVolume)}
                      windowDays={Number(windowDays)}
                      share={method === "PRE_POST" ? null : Number(share) / 100}
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {rows.length < 3 && (
          <AddButton onClick={() => setRows([...rows, { kpiId: "", baseline: "", targetDelta: "", monthlyVolume: "", valuePerUnit: "", valueSource: "" }])}>
            Add KPI
          </AddButton>
        )}
      </Section>

      <Section title="4 · Experiment and attribution plan">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Attribution method">
          {ATTRIBUTION_METHODS.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={method === m}
              onClick={() => {
                setMethod(m)
                setShare(m === "PHASED_ROLLOUT" ? "20" : "50")
              }}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm",
                method === m ? "border-primary bg-primary/15" : "border-border text-muted-foreground hover:bg-secondary",
              )}
            >
              {ATTRIBUTION_LABEL[m]}
            </button>
          ))}
        </div>
        <Field label="Traffic / segment in scope">
          <input className={input} required value={segment} onChange={(e) => setSegment(e.target.value)} placeholder="e.g. 50/50 split of returning buyers in delta districts" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {method !== "PRE_POST" && (
            <Field label="Treatment share (%)" hint={method === "PHASED_ROLLOUT" ? "the rollout's current step" : "50 gives the most power"}>
              <input className={input} type="number" min={1} max={99} required value={share} onChange={(e) => setShare(e.target.value)} />
            </Field>
          )}
          <Field label="Minimum users per arm" hint="policy: ≥ 100">
            <input className={input} type="number" min={1} required value={minSample} onChange={(e) => setMinSample(e.target.value)} />
          </Field>
          <Field label="Observation window (days)" hint="policy: ≥ 14">
            <input className={input} type="number" min={1} required value={windowDays} onChange={(e) => setWindowDays(e.target.value)} />
          </Field>
          <Field label="ROI horizon (months)">
            <input className={input} type="number" min={1} max={60} required value={horizon} onChange={(e) => setHorizon(e.target.value)} />
          </Field>
        </div>
        <Field label="Qualitative benefits (optional)">
          <input className={input} value={qualitative} onChange={(e) => setQualitative(e.target.value)} />
        </Field>
      </Section>

      {error && <p className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm">{error}</p>}
      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Submit spec for sign-off"}
      </Button>
    </form>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4 rounded-xl border border-border bg-card p-6">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      {children}
    </fieldset>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  )
}

function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick}>
      <Plus className="h-4 w-4" /> {children}
    </Button>
  )
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="icon" onClick={onClick} aria-label="Remove">
      <X className="h-4 w-4" />
    </Button>
  )
}

/** Live sample-size check: can this test prove its own target within its window? */
function PowerReadout(p: { calculation: string; baseline: number; delta: number; volume: number; windowDays: number; share: number | null }) {
  if (!Number.isFinite(p.baseline) || !p.delta || !p.volume || !p.windowDays) {
    return <p className="text-xs text-muted-foreground">Fill in baseline, target, volume and window to see whether this test can succeed.</p>
  }
  const required = requiredPerArm(p.calculation, p.baseline, p.delta)
  if (required === null) {
    return (
      <p className="text-xs text-muted-foreground">
        Sample size for averages needs an estimate of the spread, which this form doesn&apos;t collect yet. Check it with analytics.
      </p>
    )
  }
  const expected =
    p.share === null
      ? expectedPerArm(p.calculation, p.volume, p.windowDays, 0.5) * 2
      : expectedPerArm(p.calculation, p.volume, p.windowDays, p.share)
  const ok = expected >= required
  const days = p.share === null ? null : daysNeeded(p.calculation, p.volume, p.share, required)
  const n = (v: number) => v.toLocaleString("en-IN")
  return (
    <p className={cn("rounded-md px-3 py-2 text-sm", ok ? "bg-status-good/10" : "bg-status-critical/10")}>
      {ok ? "✓ " : "✕ "}
      To detect this change you need about <strong>{n(required)}</strong> per arm (95% confidence, 80% power). Your
      window gives about <strong>{n(expected)}</strong>.
      {!ok && (
        <>
          {" "}
          This test can&apos;t reach significance as planned
          {days ? <>: run it for ~{n(days)} days, split closer to 50/50, or target a bigger change.</> : ". Target a bigger change or add traffic."}
        </>
      )}
    </p>
  )
}
