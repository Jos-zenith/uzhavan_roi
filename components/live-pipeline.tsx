"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { ResetDemo } from "@/components/reset-demo"

export type PipelineSnapshot = {
  total: number
  last24h: number
  quarantinedEvents: number
  quarantinedFlags: number
  activeFlags7d: number
  lastReceivedAt: string | null
  lateArrivals7d: number
}

const POLL_MS = 5000

function ago(iso: string | null, now: number): string {
  if (!iso) return "never"
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`
}

/**
 * The pipeline strip, kept live: polls /api/pipeline while the tab is visible,
 * so events sent from the demo (or any producer) show up here without a reload.
 */
export function LivePipeline({ initial, schemaVersion }: { initial: PipelineSnapshot; schemaVersion: number }) {
  const [p, setP] = useState(initial)
  const [clock, setClock] = useState(() => Date.now())
  const [arrived, setArrived] = useState(0)
  const prevTotal = useRef(initial.total)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      if (document.visibilityState === "visible") {
        try {
          const next: PipelineSnapshot = await fetch("/api/pipeline", { cache: "no-store" }).then((r) => r.json())
          if (next.total > prevTotal.current) setArrived(next.total - prevTotal.current)
          prevTotal.current = next.total
          setP(next)
        } catch {
          // keep showing the last good snapshot
        }
      }
      timer = setTimeout(poll, POLL_MS)
    }
    timer = setTimeout(poll, POLL_MS)
    const tick = setInterval(() => setClock(Date.now()), 1000)
    return () => {
      clearTimeout(timer)
      clearInterval(tick)
    }
  }, [])

  // The "+N new" flag fades after a few seconds.
  useEffect(() => {
    if (arrived === 0) return
    const t = setTimeout(() => setArrived(0), 6000)
    return () => clearTimeout(t)
  }, [arrived])

  return (
    <section
      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-lg border border-border bg-card px-4 py-2 font-mono text-xs text-muted-foreground"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="flex items-center gap-1.5 text-foreground">
          <span className="relative flex h-2 w-2" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-good opacity-50" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-status-good" />
          </span>
          live pipeline
        </span>
        <span className={cn("transition-colors", arrived > 0 && "text-foreground")}>
          {p.total.toLocaleString("en-IN")} events
          {arrived > 0 && <span className="ml-1.5 rounded bg-status-good/15 px-1.5 py-0.5 text-foreground">+{arrived} just now</span>}
        </span>
        <span>{p.last24h.toLocaleString("en-IN")} in 24h</span>
        <span>{p.activeFlags7d} flags active (7d)</span>
        <span className={p.quarantinedEvents > 0 ? "text-foreground" : undefined}>
          {p.quarantinedEvents} quarantined ({p.quarantinedFlags} {p.quarantinedFlags === 1 ? "flag" : "flags"})
        </span>
        <span title="Events that arrived an hour or more after they happened (offline phones). Analytics uses event time.">
          {p.lateArrivals7d.toLocaleString("en-IN")} arrived late (7d)
        </span>
        <span>last event {ago(p.lastReceivedAt, clock)}</span>
        <span>schema v{schemaVersion}</span>
      </div>
      <span className="flex flex-wrap items-center gap-x-2">
        seeded demo data ·
        <Link href="/demo" className="text-primary hover:underline">
          add real events →
        </Link>
        · <ResetDemo />
      </span>
    </section>
  )
}
