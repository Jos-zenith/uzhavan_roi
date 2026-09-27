"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { Check, RotateCcw, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { assignVariant, createTelemetry, newId, type Telemetry, type Variant } from "@/lib/telemetry/sdk"
import type { TelemetryEvent } from "@/lib/telemetry/schema"

const FLAG = "one_tap_reorder"
const STORAGE_KEY = "tnimpact-demo-user"
const CART = [
  { item: "ADT 45 paddy seed", qty: "30 kg", price: 1350 },
  { item: "Neem-coated urea", qty: "2 bags", price: 540 },
  { item: "Potash (MOP)", qty: "1 bag", price: 1700 },
]
const STEPS = ["Review items", "Delivery slot", "Payment"] as const

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

export function ReorderDemo() {
  const telemetry = useRef<Telemetry | null>(null)
  const startedAt = useRef<number>(0)
  const booted = useRef(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [variant, setVariant] = useState<Variant | null>(null)
  const [log, setLog] = useState<TelemetryEvent[]>([])
  const [step, setStep] = useState<number | null>(null) // null = not started; STEPS.length = done
  const [flushState, setFlushState] = useState<string>("")

  function startSession(id: string) {
    const t =
      telemetry.current ??
      createTelemetry({
        endpoint: "/api/events",
        app: "uzhavan",
        release: "4.2.0",
        flushIntervalMs: 1500,
        onEvent: (e) => setLog((l) => [e, ...l].slice(0, 30)),
      })
    telemetry.current = t
    t.newSession()
    t.identify(id)
    const v = t.expose(FLAG, assignVariant(FLAG, id, 50))
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

  function beginCheckout() {
    startedAt.current = performance.now()
    telemetry.current?.track("checkout_started", { feature: FLAG, context: { items: CART.length } })
    setStep(0)
  }

  async function complete() {
    const seconds = Math.max(1, Math.round((performance.now() - startedAt.current) / 1000))
    telemetry.current?.track("checkout_completed", { feature: FLAG, value: seconds })
    setStep(STEPS.length)
    setFlushState("sending…")
    await telemetry.current?.flush()
    setFlushState("delivered to /api/events")
  }

  const total = CART.reduce((a, c) => a + c.price, 0)

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      {/* Phone mock */}
      <div className="mx-auto w-full max-w-[380px] rounded-[2rem] border-4 border-secondary bg-card p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>Uzhavan · Inputs</span>
          <span className="font-mono">{variant ?? "…"}</span>
        </div>

        {step === null && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Last season&apos;s order</h2>
            <ul className="space-y-2 text-sm">
              {CART.map((c) => (
                <li key={c.item} className="flex justify-between">
                  <span>
                    {c.item} <span className="text-muted-foreground">· {c.qty}</span>
                  </span>
                  <span className="tabular-nums">₹{c.price}</span>
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

      {/* Event stream */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted-foreground">
            User <code className="font-mono text-foreground">{userId}</code> is in the{" "}
            <strong>{variant}</strong> arm.
          </span>
          <Button variant="outline" size="sm" onClick={() => startSession(freshUser())}>
            <RotateCcw className="h-4 w-4" /> Be a different farmer
          </Button>
          <Link href={`/features/${FLAG}`} className="text-primary hover:underline">
            Open the feature report →
          </Link>
        </div>
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-2 text-xs text-muted-foreground">
            <span>Events emitted by the SDK (newest first)</span>
            <span>{flushState}</span>
          </div>
          <ul className="max-h-[460px] divide-y divide-border overflow-y-auto font-mono text-xs">
            {log.length === 0 && <li className="px-4 py-3 text-muted-foreground">No events yet.</li>}
            {log.map((e) => (
              <li key={e.eventId} className="grid grid-cols-[5.5rem_1fr] gap-2 px-4 py-2">
                <span className="text-muted-foreground">{e.timestamp.slice(11, 19)}</span>
                <span className="break-all">
                  <span className="text-primary">{e.action}</span> flag={e.featureFlag} variant={e.variant}
                  {e.value !== null && ` value=${e.value}`} session={e.sessionId.slice(0, 8)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
