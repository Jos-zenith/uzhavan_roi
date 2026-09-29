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
  approvals: Record<"product" | "engineering" | "analytics", { ok: boolean; by: string | null }>
  editable: boolean
}) {
  const { send, pending, error } = useMutation(featureKey)
  const [name, setName] = useState("")
  const roles = Object.keys(approvals) as (keyof typeof approvals)[]
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {roles.map((role) => {
          const a = approvals[role]
          return (
            <li key={role} className="flex flex-wrap items-center gap-3 text-sm">
              <span className="w-24 capitalize text-muted-foreground">{role}</span>
              {a.ok ? (
                <span className="rounded-md border border-status-good/60 bg-status-good/15 px-2 py-0.5">✓ {a.by ?? "signed"}</span>
              ) : (
                <span className="text-muted-foreground">not signed</span>
              )}
              {editable && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending || name.trim().length < 2}
                  onClick={() => send("", "PATCH", { op: "approve", role, approved: !a.ok, by: name.trim() })}
                >
                  {a.ok ? "Withdraw" : `Sign as ${role}`}
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      {editable && (
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Signing as (goes in the review log)</span>
          <input className={cn(input, "w-64")} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        </label>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
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

export function NoteForm({ featureKey, defaultAuthor }: { featureKey: string; defaultAuthor: string }) {
  const { send, pending, error } = useMutation(featureKey)
  const [author, setAuthor] = useState(defaultAuthor)
  const [body, setBody] = useState("")
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault()
        if (await send("/notes", "POST", { author, body })) setBody("")
      }}
    >
      <textarea
        className={cn(input, "h-16 w-full py-2")}
        placeholder="What did you see, what are you changing, what would change your mind?"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        aria-label="Note"
        required
      />
      <div className="flex flex-wrap items-center gap-2">
        <input className={cn(input, "w-60")} value={author} onChange={(e) => setAuthor(e.target.value)} aria-label="Author" required />
        <Button type="submit" size="sm" variant="secondary" disabled={pending || body.trim().length < 3}>
          Add to log
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
