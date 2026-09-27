import { db } from "@/lib/db"
import { CALCULATION_LABEL, type KpiCalculation } from "@/lib/domain"
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
        <h1 className="text-3xl font-bold">KPI catalogue</h1>
        <p className="text-muted-foreground">
          One organisation-wide definition per KPI. Features can only commit to KPIs listed here, so &ldquo;conversion&rdquo;
          means the same thing in every team&apos;s report and results are comparable across the portfolio.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">KPI</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Calculation</th>
              <th className="px-4 py-3 font-medium">Better</th>
              <th className="px-4 py-3 text-right font-medium">Used by</th>
            </tr>
          </thead>
          <tbody>
            {kpis.map((k) => (
              <tr key={k.id} className="border-t border-border align-top">
                <td className="px-4 py-3">
                  <div className="font-medium">{k.name}</div>
                  <code className="font-mono text-xs text-muted-foreground">{k.key}</code>
                  <p className="mt-1 max-w-xs text-xs text-muted-foreground">{k.description}</p>
                </td>
                <td className="px-4 py-3 capitalize text-muted-foreground">{k.category.toLowerCase()}</td>
                <td className="px-4 py-3">
                  <p className="text-xs text-muted-foreground">{CALCULATION_LABEL[k.calculation as KpiCalculation]}</p>
                  <p className="mt-1 font-mono text-xs">
                    {k.numeratorAction}
                    {k.denominatorAction && <> ÷ {k.denominatorAction}</>}
                  </p>
                </td>
                <td className="px-4 py-3">{k.direction === "UP" ? "↑ higher" : "↓ lower"}</td>
                <td className="px-4 py-3 text-right tabular-nums">{k._count.featureKpis} features</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
