"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

type Arm = { n: number; value: number | null }
type Snapshot = { control: Arm; treatment: Arm; events: number; at: number }

async function snapshot(featureKey: string, kpiKey: string): Promise<Snapshot | null> {
  try {
    const [f, p] = await Promise.all([
      fetch(`/api/features/${featureKey}`, { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/pipeline", { cache: "no-store" }).then((r) => r.json()),
    ])
    const k = f.report?.kpis?.find((x: { key: string }) => x.key === kpiKey)
    if (!k) return null
    return { control: k.control, treatment: k.treatment, events: p.total, at: Date.now() }
  } catch {
    return null
  }
}

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(2)}%`)
const num = (v: number) => v.toLocaleString("en-IN")

/**
 * The report's own numbers, re-read from the API after every batch the ingest
 * API accepts, next to what they were when you arrived. This is the same
 * endpoint the portfolio and feature pages are built from.
 */
export function ReportMirror({ featureKey, kpiKey, refreshKey }: { featureKey: string; kpiKey: string; refreshKey: number }) {
  const [first, setFirst] = useState<Snapshot | null>(null)
  const [now, setNow] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const firstRef = useRef<Snapshot | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void snapshot(featureKey, kpiKey).then((s) => {
      if (cancelled) return
      setLoading(false)
      if (!s) return
      if (!firstRef.current) {
        firstRef.current = s
        setFirst(s)
      }
      setNow(s)
    })
    return () => {
      cancelled = true
    }
  }, [featureKey, kpiKey, refreshKey])

  const rows: [string, keyof Pick<Snapshot, "control" | "treatment">][] = [
    ["Control (3-step)", "control"],
    ["Treatment (one tap)", "treatment"],
  ]

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-base">What the report sees right now</h2>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {loading ? "reading…" : now ? "re-read after your last batch" : "unavailable"}
        </span>
      </div>
      {!now || !first ? (
        <p className="text-sm text-muted-foreground">{loading ? "Reading the live report…" : "Couldn't read the report."}</p>
      ) : (
        <>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="pb-1 font-medium">Checkout conversion</th>
                <th className="pb-1 text-right font-medium">Farmers who started</th>
                <th className="pb-1 text-right font-medium">Converted</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, arm]) => {
                const added = now[arm].n - first[arm].n
                return (
                  <tr key={arm} className="border-t border-border">
                    <td className="py-1.5">{label}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums">
                      {num(now[arm].n)}
                      {added > 0 && <span className="ml-1 rounded bg-status-good/15 px-1 text-xs">+{added} you</span>}
                    </td>
                    <td className={cn("py-1.5 text-right font-mono tabular-nums", added > 0 && "font-semibold")}>{pct(now[arm].value)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">
            Pipeline: <span className="font-mono">{num(now.events)}</span> events
            {now.events > first.events && (
              <span className="font-mono text-foreground"> (+{num(now.events - first.events)} since you arrived)</span>
            )}
            . Start a checkout and your farmer joins the count above. The{" "}
            <Link href="/" className="text-primary hover:underline">
              portfolio
            </Link>{" "}
            and the{" "}
            <Link href={`/features/${featureKey}`} className="text-primary hover:underline">
              feature report
            </Link>{" "}
            read these same rows.
          </p>
        </>
      )}
    </section>
  )
}
