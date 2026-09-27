"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { COST_CATEGORIES, COST_RECURRENCES, DECISIONS, type Decision, type FeatureStatus, STATUS_LABEL } from "@/lib/domain"
import { cn } from "@/lib/utils"

const input =
  "h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

function useMutation(featureKey: string) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  async function send(path: string, method: "PATCH" | "POST", body: unknown): Promise<boolean> {
    setError(null)
    const res = await fetch(`/api/features/${featureKey}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? `Request failed (${res.status})`)
      return false
    }
    start(() => router.refresh())
    return true
  }
  return { send, pending, error }
}

export function Approvals({
  featureKey,
  approvals,
  editable,
}: {
  featureKey: string
  approvals: { product: boolean; engineering: boolean; analytics: boolean }
  editable: boolean
}) {
  const { send, pending, error } = useMutation(featureKey)
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(approvals) as (keyof typeof approvals)[]).map((role) => (
          <button
            key={role}
            type="button"
            disabled={!editable || pending}
            aria-pressed={approvals[role]}
            onClick={() => send("", "PATCH", { op: "approve", role, approved: !approvals[role] })}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm capitalize transition-colors disabled:cursor-not-allowed",
              approvals[role]
                ? "border-status-good/60 bg-status-good/15 text-foreground"
                : "border-border text-muted-foreground hover:bg-secondary",
            )}
          >
            {approvals[role] ? "✓ " : ""}
            {role}
          </button>
        ))}
      </div>
      {editable && <p className="mt-2 text-xs text-muted-foreground">Click to sign off as each function.</p>}
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  )
}

export function AdvanceButton({ featureKey, next, ready }: { featureKey: string; next: FeatureStatus; ready: boolean }) {
  const { send, pending, error } = useMutation(featureKey)
  const [version, setVersion] = useState("")
  const shipping = next === "SHIPPED"
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {shipping && (
          <input
            className={cn(input, "w-36")}
            placeholder="Release, e.g. 4.4.0"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            aria-label="Release version"
          />
        )}
        <Button
          disabled={pending}
          variant={ready ? "default" : "outline"}
          onClick={() => send("", "PATCH", { op: "advance", releaseVersion: version || undefined })}
        >
          Move to “{STATUS_LABEL[next]}”
        </Button>
      </div>
      {!ready && <p className="text-xs text-muted-foreground">The server will refuse until every check passes. Try it.</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

export function CostForm({ featureKey }: { featureKey: string }) {
  const { send, pending, error } = useMutation(featureKey)
  const [form, setForm] = useState({ category: "DEVELOPMENT", recurrence: "ONE_TIME", amount: "", note: "" })
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault()
        const ok = await send("/costs", "POST", { ...form, amount: Number(form.amount) })
        if (ok) setForm((f) => ({ ...f, amount: "", note: "" }))
      }}
    >
      <div className="flex flex-wrap gap-2">
        <select className={input} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} aria-label="Cost category">
          {COST_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c.toLowerCase()}
            </option>
          ))}
        </select>
        <select className={input} value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value })} aria-label="Recurrence">
          {COST_RECURRENCES.map((c) => (
            <option key={c} value={c}>
              {c === "ONE_TIME" ? "one-time" : "monthly"}
            </option>
          ))}
        </select>
        <input
          className={cn(input, "w-32")}
          type="number"
          min={1}
          required
          placeholder="Amount ₹"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          aria-label="Amount in rupees"
        />
        <input
          className={cn(input, "min-w-40 flex-1")}
          placeholder="Note"
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          aria-label="Note"
        />
        <Button type="submit" variant="secondary" disabled={pending}>
          Add cost
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  )
}

export function DecisionForm({ featureKey, suggested }: { featureKey: string; suggested: Decision | null }) {
  const { send, pending, error } = useMutation(featureKey)
  const [note, setNote] = useState("")
  return (
    <div className="space-y-3">
      <textarea
        className={cn(input, "h-20 w-full py-2")}
        placeholder="Rationale recorded with the decision"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        aria-label="Decision rationale"
      />
      <div className="flex flex-wrap gap-2">
        {DECISIONS.map((d) => (
          <Button
            key={d}
            variant={d === suggested ? "default" : "outline"}
            disabled={pending}
            onClick={() => send("", "PATCH", { op: "decide", decision: d, note })}
          >
            {d.charAt(0) + d.slice(1).toLowerCase()}
            {d === suggested && " (suggested)"}
          </Button>
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
