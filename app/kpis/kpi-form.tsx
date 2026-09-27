"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { CALCULATION_LABEL, KPI_CALCULATIONS, KPI_CATEGORIES, type KpiCalculation } from "@/lib/domain"
import { cn } from "@/lib/utils"

const input =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

const empty = {
  key: "",
  name: "",
  description: "",
  category: "REVENUE",
  direction: "UP",
  calculation: "USER_RATIO" as KpiCalculation,
  numeratorAction: "",
  denominatorAction: "",
}

export function KpiForm() {
  const router = useRouter()
  const [form, setForm] = useState(empty)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<typeof empty>) => setForm((f) => ({ ...f, ...patch }))
  const needsDenominator = form.calculation !== "MEAN_VALUE"

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault()
        setError(null)
        const res = await fetch("/api/kpis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, denominatorAction: needsDenominator ? form.denominatorAction : null }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) return setError(data.error ?? "Could not save")
        setForm(empty)
        router.refresh()
      }}
    >
      <div className="grid gap-4 md:grid-cols-3">
        <L label="Name">
          <input className={input} required value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </L>
        <L label="Key">
          <input className={cn(input, "font-mono")} required pattern="[a-z0-9_]+" value={form.key} onChange={(e) => set({ key: e.target.value })} placeholder="tasks_per_hour" />
        </L>
        <L label="Category">
          <select className={input} value={form.category} onChange={(e) => set({ category: e.target.value })}>
            {KPI_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.toLowerCase()}
              </option>
            ))}
          </select>
        </L>
      </div>
      <L label="Definition">
        <input className={input} required minLength={10} value={form.description} onChange={(e) => set({ description: e.target.value })} />
      </L>
      <div className="grid gap-4 md:grid-cols-4">
        <L label="Calculation">
          <select className={input} value={form.calculation} onChange={(e) => set({ calculation: e.target.value as KpiCalculation })}>
            {KPI_CALCULATIONS.map((c) => (
              <option key={c} value={c}>
                {c === "USER_RATIO" ? "User ratio" : c === "MEAN_VALUE" ? "Mean of value" : "Rate per 1k users"}
              </option>
            ))}
          </select>
        </L>
        <L label="Better when">
          <select className={input} value={form.direction} onChange={(e) => set({ direction: e.target.value })}>
            <option value="UP">higher</option>
            <option value="DOWN">lower</option>
          </select>
        </L>
        <L label="Numerator action">
          <input className={cn(input, "font-mono")} required pattern="[a-z0-9_]+" value={form.numeratorAction} onChange={(e) => set({ numeratorAction: e.target.value })} />
        </L>
        {needsDenominator && (
          <L label="Denominator action">
            <input className={cn(input, "font-mono")} required pattern="[a-z0-9_]+" value={form.denominatorAction} onChange={(e) => set({ denominatorAction: e.target.value })} />
          </L>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{CALCULATION_LABEL[form.calculation]}</p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit">Add to catalogue</Button>
    </form>
  )
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm">{label}</span>
      {children}
    </label>
  )
}
