import Link from "next/link"
import { formatInr, formatPct } from "@/lib/domain"

export type RoiBar = {
  key: string
  name: string
  roi: number
  totalBenefit: number
  totalCost: number
  provisional: boolean
}

/**
 * Diverging bar chart of ROI per feature around a zero baseline — blue for
 * value created, red for value destroyed. Every bar is direct-labelled and
 * carries a hover tooltip, so identity and value never rely on colour.
 */
export function RoiChart({ bars }: { bars: RoiBar[] }) {
  if (bars.length === 0) return <p className="text-sm text-muted-foreground">No live features yet.</p>
  const maxAbs = Math.max(1, ...bars.map((b) => Math.abs(b.roi)))
  const hasNeg = bars.some((b) => b.roi < 0)
  // Put the zero line where it leaves room for both sides.
  const negShare = hasNeg ? Math.max(...bars.map((b) => (b.roi < 0 ? -b.roi : 0))) / (maxAbs * 2) : 0
  const zero = hasNeg ? Math.min(0.5, Math.max(0.2, negShare)) : 0
  const scale = (v: number) => (Math.abs(v) / maxAbs) * (v < 0 ? zero : 1 - zero) * 100

  return (
    <figure>
      <div className="space-y-2" role="list">
        {bars.map((b) => {
          const w = scale(b.roi)
          const left = b.roi < 0 ? zero * 100 - w : zero * 100
          return (
            <div key={b.key} role="listitem" className="group grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 sm:grid-cols-[12rem_1fr]">
              <Link href={`/features/${b.key}`} className="truncate text-sm text-muted-foreground hover:text-foreground">
                {b.name}
              </Link>
              <div className="relative h-7">
                <div className="absolute inset-y-0 w-px bg-muted-foreground/50" style={{ left: `${zero * 100}%` }} aria-hidden />
                <div
                  className="absolute top-1 h-5 transition-opacity group-hover:opacity-80"
                  style={{
                    left: `${left}%`,
                    width: `${Math.max(w, 0.5)}%`,
                    background: b.roi < 0 ? "var(--viz-negative)" : "var(--viz-positive)",
                    borderRadius: b.roi < 0 ? "4px 0 0 4px" : "0 4px 4px 0",
                    opacity: b.provisional ? 0.45 : 1,
                  }}
                />
                <span
                  className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap px-1.5 text-xs font-medium tabular-nums text-foreground"
                  style={b.roi < 0 ? { right: `${100 - left}%` } : { left: `${left + w}%` }}
                >
                  {formatPct(b.roi)}
                  {b.provisional && <span className="font-normal text-muted-foreground"> provisional</span>}
                </span>
                <div
                  role="tooltip"
                  className="pointer-events-none absolute -top-14 z-10 hidden rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lg group-hover:block"
                  style={{ left: `${zero * 100}%` }}
                >
                  <div className="font-medium">{b.name}</div>
                  <div className="tabular-nums text-muted-foreground">
                    Benefit {formatInr(b.totalBenefit)} · Cost {formatInr(b.totalCost)}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <figcaption className="mt-3 text-xs text-muted-foreground">
        ROI = (proven benefits − costs) ÷ costs over each feature&apos;s horizon. Faded bars are provisional: the
        observation window or sample size isn&apos;t met yet.
      </figcaption>
    </figure>
  )
}
