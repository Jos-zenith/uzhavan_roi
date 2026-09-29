"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { Check, RotateCcw, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { assignVariant, createTelemetry, newId, type FlushResult, type Telemetry, type Variant } from "@/lib/telemetry/sdk"
import type { TelemetryEvent } from "@/lib/telemetry/schema"
import { EVENT_SCHEMA_VERSION } from "@/lib/telemetry/version"
import { cn } from "@/lib/utils"
import { ReportMirror } from "./report-mirror"

const FLAG = "one_tap_reorder"
const STORAGE_KEY = "tnimpact-demo-user"
const CART = [
  { item: "ADT 45 paddy seed", qty: "30 kg", price: 1350 },
  { item: "Neem-coated urea", qty: "2 bags", price: 540 },
  { item: "Potash (MOP)", qty: "1 bag", price: 1700 },
]
const STEPS = ["Review items", "Delivery slot", "Payment"] as const

type Line =
  | { id: string; at: Date; kind: "queued"; event: TelemetryEvent }
  | { id: string; at: Date; kind: "response"; label: string; status: number | null; summary: string; ms: number }
  | { id: string; at: Date; kind: "info"; text: string }

function loadUser(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return saved
  } catch {}
  return freshUser()
}
function freshUser(): string {
  const id = `demo-${newId().slice(0, 8)}`
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {}
  return id
}

/** One line summarising what the ingest API actually said. */
function summarise(status: number | null, body: unknown): string {
  if (status === null) return `network error: ${String(body)}`
  const b = (body ?? {}) as Record<string, unknown>
  if (status >= 400) {
    type Issue = { code?: string; path?: unknown[]; message?: string }
    const issues = (Array.isArray(b.issues) ? b.issues : []) as Issue[]
    // An unknown key is usually the root cause (a typo), so show it first.
    const issue = issues.find((i) => i.code === "unrecognized_keys") ?? issues[0]
    const where = issue?.path?.slice(2).join(".")
    const more = issues.length > 1 ? ` (+${issues.length - 1} more)` : ""
    return `${b.error ?? "rejected"}${issue ? ` · ${where ? `${where}: ` : ""}${issue.message}${more}` : ""}`
  }
  const q = Array.isArray(b.quarantinedFlags) && b.quarantinedFlags.length ? ` (${b.quarantinedFlags.join(", ")})` : ""
  const kill = Array.isArray(b.killSwitch) && b.killSwitch.length
    ? ` · KILL SWITCH: ${(b.killSwitch as { key: string }[]).map((k) => k.key).join(", ")} turned off for everyone`
    : ""
  return `accepted ${b.accepted} · quarantined ${b.quarantined}${q} · duplicates ${b.duplicates}${kill}`
}

const time = (d: Date) => d.toTimeString().slice(0, 8)
const kb = (bytes: number) => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`)

export function ReorderDemo() {
  const telemetry = useRef<Telemetry | null>(null)
  const startedAt = useRef<number>(0)
  const booted = useRef(false)
  const pending = useRef<TelemetryEvent[]>([])
  const lastBatch = useRef<TelemetryEvent[]>([])
  const consoleBox = useRef<HTMLDivElement | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [variant, setVariant] = useState<Variant | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [step, setStep] = useState<number | null>(null) // null = not started; STEPS.length = done
  const [accepted, setAccepted] = useState(0) // batches the ingest API accepted
  const [offline, setOffline] = useState(false)
  const [consent, setConsent] = useState(true)

  const push = (line: Line) => setLines((l) => [...l, line].slice(-200))

  function onFlush(r: FlushResult) {
    if (r.offline) {
      push({ id: newId(), at: new Date(), kind: "info", text: `offline: ${r.events} events kept on the device (${kb(r.bytes.raw)}), will send on reconnect` })
      return
    }
    lastBatch.current = pending.current.splice(0, r.events)
    const size = r.bytes.sent < r.bytes.raw ? ` · ${kb(r.bytes.raw)} → ${kb(r.bytes.sent)} gzip` : ""
    push({ id: newId(), at: new Date(), kind: "response", label: `POST /api/events (${r.events})`, status: r.status, summary: summarise(r.status, r.body) + size, ms: r.ms })
    if (r.status === 200) setAccepted((n) => n + 1) // re-read the report
  }

  function startSession(id: string) {
    const t =
      telemetry.current ??
      createTelemetry({
        endpoint: "/api/events",
        app: "vayal",
        release: "4.2.0",
        flushIntervalMs: 1500,
        requireConsent: true,
        onEvent: (e) => {
          pending.current.push(e)
          push({ id: e.eventId, at: new Date(), kind: "queued", event: e })
        },
        onDrop: (action) => push({ id: newId(), at: new Date(), kind: "info", text: `not collected: ${action} (no consent)` }),
        onFlush,
      })
    if (!telemetry.current) t.setConsent(true) // the demo farmer agreed at onboarding; toggle below to withdraw
    telemetry.current = t
    t.newSession()
    t.identify(id)
    const assigned = assignVariant(FLAG, id, 50)
    push({ id: newId(), at: new Date(), kind: "info", text: `session for ${id} · assigned ${assigned} (hash of flag + user, 50/50)` })
    const v = t.expose(FLAG, assigned)
    t.track("session_started", { feature: FLAG })
    setUserId(id)
    setVariant(v)
    setStep(null)
  }

  useEffect(() => {
    if (booted.current) return // React dev mode mounts twice; one session per visit
    booted.current = true
    startSession(loadUser())
    return () => void telemetry.current?.flush()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const box = consoleBox.current
    if (box) box.scrollTop = box.scrollHeight
  }, [lines])

  function beginCheckout() {
    startedAt.current = performance.now()
    telemetry.current?.track("checkout_started", { feature: FLAG, context: { items: CART.length } })
    setStep(0)
  }

  async function complete() {
    const seconds = Math.max(1, Math.round((performance.now() - startedAt.current) / 1000))
    telemetry.current?.track("checkout_completed", { feature: FLAG, value: seconds })
    setStep(STEPS.length)
    await telemetry.current?.flush()
  }

  /** Bypass the SDK and send a hand-built payload, to show what ingest does with bad input. */
  async function inject(label: string, events: unknown[]) {
    const started = Date.now()
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events }),
      })
      const body = await res.json().catch(() => null)
      push({ id: newId(), at: new Date(), kind: "response", label, status: res.status, summary: summarise(res.status, body), ms: Date.now() - started })
    } catch (err) {
      push({ id: newId(), at: new Date(), kind: "response", label, status: null, summary: summarise(null, err), ms: Date.now() - started })
    }
  }

  const base = () => ({
    schemaVersion: EVENT_SCHEMA_VERSION,
    eventId: newId(),
    timestamp: new Date().toISOString(),
    app: "vayal",
    release: "4.2.0",
    userId: userId ?? "demo",
    sessionId: "fault-injection",
    featureFlag: FLAG as string | null,
    variant: null,
    action: "feature_exposed",
    value: null,
    context: {},
  })

  const total = CART.reduce((a, c) => a + c.price, 0)

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        {/* Phone mock */}
        <div className="mx-auto w-full max-w-[360px] rounded-[2rem] border-4 border-secondary bg-card p-5 shadow-xl">
          <div className="mb-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>Vayal · Inputs</span>
            <span className="font-mono">{variant ?? "assigning…"}</span>
          </div>

          {/* Until the browser has assigned an arm, show that, not a guess: rendering the
              control button first would briefly put treatment users in the wrong flow. */}
          {step === null && !variant && (
            <div className="space-y-3 py-6 text-center text-sm text-muted-foreground" role="status">
              <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" aria-hidden />
              Assigning you to a test group…
            </div>
          )}

          {step === null && variant && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Last season&apos;s order</h2>
              <ul className="space-y-2 text-sm">
                {CART.map((c) => (
                  <li key={c.item} className="flex justify-between gap-2">
                    <span>
                      {c.item} <span className="text-muted-foreground">· {c.qty}</span>
                    </span>
                    <span className="font-mono tabular-nums">₹{c.price}</span>
                  </li>
                ))}
              </ul>
              {variant === "treatment" ? (
                <Button
                  className="w-full"
                  onClick={() => {
                    beginCheckout()
                    void complete()
                  }}
                >
                  <Zap className="h-4 w-4" /> Reorder in one tap · ₹{total}
                </Button>
              ) : (
                <Button className="w-full" variant="secondary" onClick={beginCheckout}>
                  Start reorder
                </Button>
              )}
            </div>
          )}

          {step !== null && step < STEPS.length && (
            <div className="space-y-4">
              <ol className="flex gap-1 text-[11px]">
                {STEPS.map((s, i) => (
                  <li key={s} className={i <= step ? "flex-1 border-t-2 border-primary pt-1" : "flex-1 border-t-2 border-border pt-1 text-muted-foreground"}>
                    {s}
                  </li>
                ))}
              </ol>
              <h2 className="text-lg font-semibold">{STEPS[step]}</h2>
              <p className="text-sm text-muted-foreground">
                {step === 0 && "Confirm quantities for each item."}
                {step === 1 && "Choose a delivery slot at your village collection point."}
                {step === 2 && `Pay ₹${total} by UPI.`}
              </p>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => (step === STEPS.length - 1 ? void complete() : setStep(step + 1))}>
                  {step === STEPS.length - 1 ? "Place order" : "Continue"}
                </Button>
                <Button variant="ghost" onClick={() => setStep(null)}>
                  Abandon
                </Button>
              </div>
            </div>
          )}

          {step === STEPS.length && (
            <div className="space-y-3 py-6 text-center">
              <Check className="mx-auto h-10 w-10 text-status-good" aria-hidden />
              <p className="font-semibold">Order placed</p>
              <Button variant="outline" size="sm" onClick={() => setStep(null)}>
                Back
              </Button>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="space-y-5 text-sm">
          <div className="space-y-2">
            <p className="text-muted-foreground">
              {userId && variant ? (
                <>
                  You are farmer <code className="font-mono text-foreground">{userId}</code>, in the{" "}
                  <strong className="text-foreground">{variant}</strong> group.{" "}
                </>
              ) : (
                <>Assigning you a farmer id and a test group… </>
              )}
              Control gets the old three-step checkout; treatment gets the one-tap button. The split is a hash of
              flag + user, so reloading keeps you in the same group.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => startSession(freshUser())}>
                <RotateCcw className="h-4 w-4" /> Be a different farmer
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href={`/features/${FLAG}`}>Open the feature report →</Link>
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="font-semibold">Field conditions</h2>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--primary)]"
                  checked={offline}
                  onChange={(e) => {
                    setOffline(e.target.checked)
                    telemetry.current?.simulateOffline(e.target.checked)
                    push({
                      id: newId(),
                      at: new Date(),
                      kind: "info",
                      text: e.target.checked ? "no signal: events stay on the device" : "signal back: sending what was held",
                    })
                  }}
                />
                No signal (village without coverage)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--primary)]"
                  checked={consent}
                  onChange={(e) => {
                    setConsent(e.target.checked)
                    telemetry.current?.setConsent(e.target.checked)
                    push({
                      id: newId(),
                      at: new Date(),
                      kind: "info",
                      text: e.target.checked
                        ? "consent given: usage is collected again"
                        : "consent withdrawn: unsent events deleted from the device, nothing new is collected",
                    })
                  }}
                />
                Farmer consents to usage data
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Go offline, place an order, reload the page if you like, then turn the signal back on. The held events
              arrive, gzip-compressed.
            </p>
          </div>

          <ReportMirror featureKey={FLAG} kpiKey="checkout_conversion" refreshKey={accepted} />

          <div className="space-y-2">
            <h2 className="font-semibold">Break it on purpose</h2>
            <p className="text-muted-foreground">
              Each button sends a real request to the ingest API. The console shows exactly what came back.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => inject("unregistered flag", [{ ...base(), featureFlag: "voice_checkout_beta", variant: "treatment" }])}
              >
                Unregistered flag
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const { featureFlag, ...rest } = base()
                  void inject("typo: feature_flag", [{ ...rest, feature_flag: featureFlag }])
                }}
              >
                Typo in a field name
              </Button>
              <Button variant="outline" size="sm" onClick={() => inject("schemaVersion 2", [{ ...base(), schemaVersion: 2 }])}>
                Future schema version
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => inject("personal data", [{ ...base(), context: { district: "Madurai", phone: "9876543210" } }])}
              >
                Farmer&apos;s phone number
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-status-critical/50"
                onClick={() => {
                  // 25 new treatment farmers in the UPI autopay test whose payment fails. The ingest API
                  // re-tests the guardrail on this batch; a couple of clicks pushes it past the line.
                  const batch = newId().slice(0, 6)
                  const events = Array.from({ length: 25 }, (_, i) => {
                    const farmer = `spike-${batch}-${i}`
                    return ["session_started", "feature_exposed", "checkout_started", "payment_failed"].map((action) => ({
                      ...base(),
                      userId: farmer,
                      sessionId: `${farmer}-s1`,
                      featureFlag: "upi_autopay",
                      variant: "treatment",
                      action,
                      context: { district: "Villupuram" },
                    }))
                  }).flat()
                  void inject("25 failed UPI payments", events)
                }}
              >
                Spike UPI payment failures
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={lastBatch.current.length === 0}
                onClick={() => inject(`replay last batch (${lastBatch.current.length})`, lastBatch.current)}
              >
                Replay last batch
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              The unregistered flag lands in quarantine and shows up under &ldquo;Needs you&rdquo; on the portfolio.
              Spiking UPI failures a couple of times trips that test&apos;s guardrail: watch the kill switch fire here, then
              find the incident on the portfolio.
            </p>
          </div>
        </div>
      </div>

      {/* Console */}
      <div className="overflow-hidden terminal rounded-xl border border-border">
        <div className="flex items-center justify-between border-b border-border px-4 py-2 font-mono text-xs text-muted-foreground">
          <span>ingest console · vayal@4.2.0 → /api/events</span>
          <button type="button" className="hover:text-foreground" onClick={() => setLines([])}>
            clear
          </button>
        </div>
        <div ref={consoleBox} className="max-h-[360px] overflow-y-auto px-4 py-3 font-mono text-xs leading-6" role="log" aria-live="polite">
          {lines.length === 0 && <div className="text-muted-foreground">waiting for events…</div>}
          {lines.map((l) => (
            <div key={l.id} className="grid grid-cols-[4.5rem_1fr] gap-2">
              <span className="text-muted-foreground">{time(l.at)}</span>
              {l.kind === "queued" ? (
                <span className="break-all text-muted-foreground">
                  <span className="text-foreground">queue</span> {l.event.action}
                  {l.event.featureFlag && ` flag=${l.event.featureFlag}`}
                  {l.event.variant && ` variant=${l.event.variant}`}
                  {l.event.value !== null && ` value=${l.event.value}s`}
                </span>
              ) : l.kind === "info" ? (
                <span className="text-muted-foreground"># {l.text}</span>
              ) : (
                <span className="break-all">
                  <span
                    className={cn(
                      "mr-2 rounded px-1.5 font-semibold",
                      l.status === null || l.status >= 400 ? "bg-status-critical/20 text-foreground" : "bg-status-good/20 text-foreground",
                    )}
                  >
                    {l.status ?? "ERR"}
                  </span>
                  <span className="text-foreground">{l.label}</span>
                  <span className="text-muted-foreground"> · {l.summary} · {l.ms}ms</span>
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
