import { db } from "@/lib/db"
import { SpecForm } from "./spec-form"

export const dynamic = "force-dynamic"

export default async function NewFeaturePage() {
  const kpis = await db.kpiDefinition.findMany({ orderBy: { name: "asc" } })
  return (
    <div className="space-y-6">
      <div className="max-w-2xl space-y-2">
        <h1 className="text-3xl font-bold">New feature: metrics &amp; telemetry spec</h1>
        <p className="text-muted-foreground">
          Declare what the feature is for and how you&apos;ll prove it before anyone writes code. Product,
          engineering and analytics sign off on this spec; development can&apos;t start until they do.
        </p>
      </div>
      <SpecForm
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
