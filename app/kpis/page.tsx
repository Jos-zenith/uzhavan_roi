import { db } from "@/lib/db"
import { kpiFormula } from "@/lib/domain"
import { KpiIcon, KPI_GROUPS } from "@/components/kpi-icon"
import { EventContract } from "@/components/event-contract"
import { KpiForm } from "./kpi-form"

export const dynamic = "force-dynamic"

export default async function KpiCataloguePage() {
  const kpis = await db.kpiDefinition.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: { _count: { select: { featureKpis: true } } },
  })
  return (
    <div className="space-y-8">
      <div className="max-w-2xl space-y-2">
        <h1 className="text-2xl font-bold">KPI catalogue</h1>
        <p className="text-muted-foreground">
          If two teams compute &ldquo;conversion&rdquo; differently, their ROI numbers can&apos;t be compared, and
          the one with the friendlier definition wins the budget meeting. So there&apos;s one definition per KPI,
          and a feature spec can only pick from this list.
        </p>
      </div>

      <div className="space-y-6">
        {Object.entries(KPI_GROUPS).map(([category, group]) => {
          const inGroup = kpis.filter((k) => k.category === category)
          if (inGroup.length === 0) return null
          return (
            <section key={category} className="space-y-2">
              <div className="flex items-center gap-3">
                <KpiIcon category={category} />
                <h2 className="text-lg">
                  {group.label} <span className="font-sans text-sm font-normal text-muted-foreground">· {group.blurb}</span>
                </h2>
              </div>
              <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                {inGroup.map((k) => {
                  const { formula, test } = kpiFormula(k)
                  return (
                    <li key={k.id} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[1.2fr_1.3fr_auto]">
                      <div>
                        <div className="font-medium">
                          {k.name} <span className="text-muted-foreground">{k.direction === "UP" ? "↑ higher is better" : "↓ lower is better"}</span>
                        </div>
                        <p className="text-muted-foreground">
                          {k.description.split("`").map((part, i) => (i % 2 ? <code key={i} className="font-mono text-xs">{part}</code> : part))}
                        </p>
                      </div>
                      <div>
                        <code className="font-mono text-xs">{formula}</code>
                        <p className="text-xs text-muted-foreground">
                          key <code className="font-mono">{k.key}</code> · tested with a {test}
                        </p>
                      </div>
                      <div className="text-xs text-muted-foreground md:text-right">
                        {k._count.featureKpis === 0
                          ? "not used yet"
                          : `used by ${k._count.featureKpis} ${k._count.featureKpis === 1 ? "feature" : "features"}`}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>

      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-1 text-lg font-semibold">Event contract</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Every KPI above is computed from events in this shape: the action names in each formula are the{" "}
          <code className="font-mono text-xs">action</code> values products send. This is the single source of truth shared by
          the SDK, the ingest API and analytics.
        </p>
        <EventContract />
      </section>

      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-1 text-lg font-semibold">Propose a KPI</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Check the list first. Duplicate keys are rejected, so a KPI is defined once and reused.
        </p>
        <KpiForm />
      </section>
    </div>
  )
}
