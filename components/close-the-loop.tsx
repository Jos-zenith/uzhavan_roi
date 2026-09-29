import Link from "next/link"
import { ClipboardList, OctagonX, Rocket, Trash2 } from "lucide-react"
import { money } from "@/lib/narrative"
import { CopyTicket } from "@/components/copy-ticket"

export type ForecastItem = { key: string; name: string; monthlySaving: number; roi: number }
export type TicketRow = {
  id: string
  kind: string
  title: string
  body: string
  monthlySavings: number | null
  createdAt: Date
  feature: { key: string; name: string }
}

const KIND = {
  ROADMAP: { label: "Roadmap", icon: Rocket },
  REMOVAL: { label: "Removal", icon: Trash2 },
  INCIDENT: { label: "Incident", icon: OctagonX },
} as const

/** Decisions become work: the savings on the table, and the tickets decisions have already opened. */
export function CloseTheLoop({ forecast, tickets }: { forecast: ForecastItem[]; tickets: TicketRow[] }) {
  const monthly = forecast.reduce((a, f) => a + f.monthlySaving, 0)
  return (
    <section className="space-y-3">
      <h2 className="text-xl">Closing the loop</h2>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">Forecast</p>
          {forecast.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No live feature is losing money on its proven results.</p>
          ) : (
            <>
              <p className="mt-1 font-serif text-2xl font-semibold leading-snug">
                Retire the bottom {forecast.length} and save {money(monthly)} a month
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{money(monthly * 12)} a year: run costs no longer paid, minus the proven value they&apos;d stop producing.</p>
              <ul className="mt-3 space-y-1 text-sm">
                {forecast.map((f) => (
                  <li key={f.key} className="flex justify-between gap-3">
                    <Link href={`/features/${f.key}`} className="hover:underline">
                      {f.name}
                    </Link>
                    <span className="font-mono text-muted-foreground">{money(f.monthlySaving)}/mo</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-primary">
            <ClipboardList className="h-4 w-4" aria-hidden /> Opened by decisions
          </p>
          {tickets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tickets yet. Recording &ldquo;scale&rdquo; opens a roadmap item, &ldquo;retire&rdquo; opens a removal ticket,
              and a tripped guardrail opens an incident.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {tickets.map((t) => {
                const kind = KIND[t.kind as keyof typeof KIND] ?? KIND.ROADMAP
                const Icon = kind.icon
                return (
                  <li key={t.id} className="flex items-start gap-3 py-2.5 text-sm">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{t.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {kind.label} · <span className="font-mono">{t.createdAt.toISOString().slice(0, 10)}</span>
                        {t.monthlySavings ? ` · saves ${money(t.monthlySavings)}/mo` : ""}
                      </p>
                    </div>
                    <CopyTicket text={`## ${t.title}\n\n${t.body}\n\nFeature: ${t.feature.name} (${t.feature.key})${t.monthlySavings ? `\nMonthly saving: ${money(t.monthlySavings)}` : ""}`} />
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
