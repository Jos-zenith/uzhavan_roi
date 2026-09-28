import { ShieldAlert } from "lucide-react"
import { db } from "@/lib/db"
import { SpecForm } from "./spec-form"

export const dynamic = "force-dynamic"

export default async function NewFeaturePage({ searchParams }: { searchParams: Promise<{ flag?: string }> }) {
  const { flag } = await searchParams
  const initialFlag = flag && /^[a-z0-9_]+$/.test(flag) ? flag : undefined
  const [kpis, waiting] = await Promise.all([
    db.kpiDefinition.findMany({ orderBy: { name: "asc" } }),
    initialFlag ? db.event.count({ where: { featureFlag: initialFlag, quarantined: true } }) : Promise.resolve(0),
  ])
  return (
    <div className="space-y-6">
      <div className="max-w-2xl space-y-2">
        <h1 className="text-2xl font-bold">New feature: metrics &amp; telemetry spec</h1>
        <p className="text-muted-foreground">
          Write down what success means before anyone writes code, while it&apos;s still cheap to be honest about.
          Product, engineering and analytics each sign off; the gate keeps development closed until all three have.
        </p>
      </div>
      {waiting > 0 && (
        <div className="flex max-w-3xl items-start gap-3 rounded-xl border border-status-warning/40 bg-status-warning/10 px-4 py-3 text-sm">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            <code className="font-mono text-xs">{initialFlag}</code> already has{" "}
            <strong>{waiting.toLocaleString("en-IN")} quarantined events</strong>. They are released into analytics as
            soon as this spec is registered, so no data is lost.
          </p>
        </div>
      )}
      <SpecForm
        initialFlag={initialFlag}
        kpis={kpis.map((k) => ({
          id: k.id,
          name: k.name,
          unit: k.unit,
          direction: k.direction,
          calculation: k.calculation,
        }))}
      />
    </div>
  )
}
