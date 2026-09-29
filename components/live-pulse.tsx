"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { OctagonX } from "lucide-react"
import type { LiveSnapshot } from "@/lib/live"
import { cn } from "@/lib/utils"

type Countdown = { credibleOn: string | null; verdict: string }

const n = (v: number) => v.toLocaleString("en-IN")

function daysUntil(iso: string | null, now: number): string {
  if (!iso) return "not at current traffic"
  const d = Math.ceil((new Date(iso).getTime() - now) / 86_400_000)
  if (d <= 0) return "ready to decide now"
  return `ready to decide in ${d} day${d === 1 ? "" : "s"}`
}

function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  if (s < 172800) return `${Math.round(s / 3600)}h`
  return `${Math.round(s / 86400)}d`
}

/**
 * The live pulse: running tests with their group sizes against the minimum
 * sample, and the newest events, pushed by Server-Sent Events as they land.
 */
export function LivePulse({ initial, countdowns }: { initial: LiveSnapshot; countdowns: Record<string, Countdown> }) {
  const [snap, setSnap] = useState(initial)
  const [status, setStatus] = useState<"connecting" | "live" | "reconnecting">("connecting")
  const [fresh, setFresh] = useState<Set<string>>(new Set())
  const [now, setNow] = useState(() => Date.now())
  const seen = useRef(new Set(initial.recent.map((e) => e.id)))

  useEffect(() => {
    const source = new EventSource("/api/live")
    source.addEventListener("open", () => setStatus("live"))
    source.addEventListener("error", () => setStatus("reconnecting"))
    source.addEventListener("snapshot", (e) => {
      const next: LiveSnapshot = JSON.parse((e as MessageEvent).data)
      const arrived = next.recent.filter((r) => !seen.current.has(r.id)).map((r) => r.id)
      arrived.forEach((id) => seen.current.add(id))
      if (arrived.length) {
        setFresh(new Set(arrived))
        setTimeout(() => setFresh(new Set()), 4000)
      }
      setSnap(next)
      setStatus("live")
    })
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      source.close()
      clearInterval(tick)
    }
  }, [])

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xl">
          <span className="relative flex h-2.5 w-2.5" aria-hidden>
            <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-60", status === "live" ? "animate-ping bg-status-good" : "bg-status-warning")} />
            <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", status === "live" ? "bg-status-good" : "bg-status-warning")} />
          </span>
          Live now
        </h2>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {status === "live" ? "streaming" : status === "connecting" ? "connecting…" : "reconnecting…"} ·{" "}
          <span className="font-mono">{n(snap.total)}</span> events ·{" "}
          <Link href="/demo" className="text-primary hover:underline">
            send some from the demo →
          </Link>
        </span>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Running tests: farmers in each group vs the minimum sample</p>
          {snap.tests.length === 0 && <p className="text-sm text-muted-foreground">No tests running.</p>}
          {snap.tests.map((t) => {
            const cd = countdowns[t.key]
            return (
              <div key={t.key} className="space-y-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <Link href={`/features/${t.key}`} className="font-medium hover:underline">
                    {t.name}
                  </Link>
                  {t.killed ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-status-critical">
                      <OctagonX className="h-3.5 w-3.5" aria-hidden /> killed by guardrail
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">{cd ? daysUntil(cd.credibleOn, now) : ""}</span>
                  )}
                </div>
                {(["control", "treatment"] as const).map((arm) => {
                  const value = t[arm]
                  const pct = Math.min(100, (value / Math.max(1, t.minSample)) * 100)
                  return (
                    <div key={arm} className="grid grid-cols-[5.5rem_1fr_7rem] items-center gap-2 text-xs">
                      <span className="text-muted-foreground">{arm}</span>
                      <div className="h-1.5 rounded-full bg-secondary" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${t.name} ${arm}`}>
                        <div className={cn("h-1.5 rounded-full transition-all", t.killed ? "bg-muted-foreground" : "bg-primary")} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-right font-mono tabular-nums">
                        {n(value)} / {n(t.minSample)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
        <div className="terminal rounded-xl border border-border p-3">
          <p className="mb-2 font-mono text-xs text-muted-foreground">newest events · by arrival</p>
          <ul className="space-y-1 font-mono text-xs">
            {snap.recent.map((e) => {
              const lateHours = (new Date(e.receivedAt).getTime() - new Date(e.timestamp).getTime()) / 3_600_000
              return (
                <li
                  key={e.id}
                  className={cn("grid grid-cols-[2.5rem_1fr] gap-2 rounded px-1 transition-colors", fresh.has(e.id) && "bg-status-good/20")}
                >
                  <span className="text-muted-foreground">{ago(e.receivedAt, now)}</span>
                  <span className="truncate">
                    <span className="text-foreground">{e.action}</span>
                    <span className="text-muted-foreground">
                      {e.flag && ` ${e.flag}`}
                      {e.variant && `/${e.variant}`}
                      {e.district && ` · ${e.district}`}
                      {e.quarantined && " · quarantined"}
                      {lateHours >= 1 && ` · arrived ${Math.round(lateHours)}h late`}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </section>
  )
}
