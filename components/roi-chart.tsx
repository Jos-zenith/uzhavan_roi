import Link from "next/link"
import { formatInr, formatPct } from "@/lib/domain"

export type RoiEvidence = {
  name: string
  /** formatted absolute change, e.g. "+6.5 pp" */
  delta: string
  /** change relative to the control arm, e.g. 1.62 for +162% */
  relative: number | null
  pValue: number | null
  significant: boolean
  /** true when the change is in the KPI's good direction */
  better: boolean
}

export type RoiBar = {
  key: string
  name: string
  roi: number
  totalBenefit: number
  totalCost: number
  horizonMonths: number
  provisional: boolean
  /** sample per arm; users unless the feature only has mean-value KPIs */
  arms: { labels: [string, string]; unit: "users" | "events"; n: [number, number] }
  evidence: RoiEvidence[]
}

const fmtP = (p: number | null) => (p === null ? "p —" : p < 0.001 ? "p < 0.001" : `p = ${p.toFixed(3)}`)
const fmtRel = (r: number | null) => (r === null || !Number.isFinite(r) ? "" : ` (${r >= 0 ? "+" : "−"}${Math.abs(r * 100).toFixed(0)}%)`)
const n = (v: number) => v.toLocaleString("en-IN")

/**
 * Diverging bar chart of ROI per feature around a zero baseline — blue for
 * value created, red for value destroyed. Every bar is direct-labelled with
 * its ROI and sample size, and the hover card shows the evidence behind it,
 * so neither identity nor value relies on colour.
 */
export function RoiChart({ bars }: { bars: RoiBar[] }) {
  if (bars.length === 0) return <p className="text-sm text-muted-foreground">No live features yet.</p>
  const maxAbs = Math.max(1, ...bars.map((b) => Math.abs(b.roi)))
  const hasNeg = bars.some((b) => b.roi < 0)
  // Put the zero line where it leaves room for both sides.
  const negShare = hasNeg ? Math.max(...bars.map((b) => (b.roi < 0 ? -b.roi : 0))) / (maxAbs * 2) : 0
  const zero = hasNeg ? Math.min(0.5, Math.max(0.2, negShare)) : 0
  const scale = (v: number) => (Math.abs(v) / maxAbs) * (v < 0 ? zero : 1 - zero) * 88 // leave room for the direct label

  return (
    <figure>
      <div className="space-y-3" role="list">
        {bars.map((b) => {
          const w = scale(b.roi)
          const left = b.roi < 0 ? zero * 100 - w : zero * 100
          const net = b.totalBenefit - b.totalCost
          return (
            <div key={b.key} role="listitem" className="group grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 sm:grid-cols-[13rem_1fr]">
              <div className="min-w-0">
                <Link href={`/features/${b.key}`} className="block truncate text-sm text-muted-foreground hover:text-foreground">
                  {b.name}
                </Link>
                <div className="font-mono text-[11px] text-muted-foreground">
                  {n(b.arms.n[0])} / {n(b.arms.n[1])} {b.arms.unit}
                </div>
              </div>
              <div className="relative h-8">
                <div className="absolute inset-y-0 w-px bg-muted-foreground/50" style={{ left: `${zero * 100}%` }} aria-hidden />
                <div
                  className="absolute top-1.5 h-5 transition-opacity group-hover:opacity-80"
                  style={{
                    left: `${left}%`,
                    width: `${Math.max(w, 0.5)}%`,
                    background: b.roi < 0 ? "var(--viz-negative)" : "var(--viz-positive)",
                    borderRadius: b.roi < 0 ? "4px 0 0 4px" : "0 4px 4px 0",
                    opacity: b.provisional ? 0.45 : 1,
                  }}
                />
                <span
                  className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap px-1.5 font-mono text-xs font-medium tabular-nums text-foreground"
                  style={b.roi < 0 ? { right: `${100 - left}%` } : { left: `${left + w}%` }}
                >
                  {formatPct(b.roi)}
                  {b.provisional && <span className="font-sans font-normal text-muted-foreground"> provisional</span>}
                </span>
                <div
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full z-20 mb-1 hidden w-[22rem] max-w-[80vw] rounded-md border border-border bg-popover p-3 text-xs shadow-lg group-hover:block"
                  style={{ left: `${Math.min(zero * 100, 40)}%` }}
                >
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <span className="font-medium">{b.name}</span>
                    <span className="font-mono text-muted-foreground">
                      {b.arms.labels[0].toLowerCase()} {n(b.arms.n[0])} · {b.arms.labels[1].toLowerCase()} {n(b.arms.n[1])}
                    </span>
                  </div>
                  <ul className="mb-2 space-y-1">
                    {b.evidence.map((e) => (
                      <li key={e.name} className="flex justify-between gap-3">
                        <span className="text-muted-foreground">{e.name}</span>
                        <span className="whitespace-nowrap font-mono">
                          {e.significant ? (e.better ? "✓ " : "✕ ") : "· "}
                          {e.delta}
                          {fmtRel(e.relative)} <span className="text-muted-foreground">{fmtP(e.pValue)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="space-y-0.5 border-t border-border pt-2 font-mono">
                    <Row label={`proven benefit (${b.horizonMonths} mo)`} value={formatInr(b.totalBenefit)} />
                    <Row label="cost (build + run)" value={formatInr(-b.totalCost)} />
                    <Row label="net" value={formatInr(net)} strong />
                  </div>
                  <p className="mt-2 text-muted-foreground">✓ proven better · ✕ proven worse · · not significant, counted as ₹0</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <figcaption className="mt-4 text-xs text-muted-foreground">
        ROI = (proven benefits − costs) ÷ costs over each feature&apos;s horizon. Under each name: sample per arm (control / treatment, or before / after). Faded bars are
        provisional: the observation window or sample size isn&apos;t met yet.
      </figcaption>
    </figure>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-semibold text-foreground" : "text-foreground"}>{value}</span>
    </div>
  )
}
