import { db } from "@/lib/db"
import { buildReport, featureWithSpec } from "@/lib/analytics/report"
import { formatKpiValue } from "@/lib/domain"

/**
 * The kill switch. After new events arrive for a live feature, its guardrail
 * KPIs are re-tested with the always-valid sequential test, so it's safe to
 * check on every batch. If one is significantly worse, the feature is killed:
 * the flags endpoint starts serving control to everyone, the review log gets
 * an entry, and an incident ticket is opened.
 */

const lastChecked = new Map<string, number>()
const MIN_INTERVAL_MS = 5_000 // per flag, per server instance

export type KillResult = { key: string; reason: string }

export async function evaluateGuardrails(flags: string[]): Promise<KillResult[]> {
  const now = Date.now()
  const due = [...new Set(flags)].filter((f) => now - (lastChecked.get(f) ?? 0) >= MIN_INTERVAL_MS)
  due.forEach((f) => lastChecked.set(f, now))
  if (due.length === 0) return []

  const features = await db.feature.findMany({
    where: { key: { in: due }, status: "SHIPPED", killedAt: null, kpis: { some: { role: "GUARDRAIL" } } },
    ...featureWithSpec,
  })
  const killed: KillResult[] = []
  for (const f of features) {
    const report = await buildReport(f)
    const tripped = report.kpis.filter((k) => k.tripped)
    if (tripped.length === 0) continue
    const detail = tripped
      .map(
        (k) =>
          `${k.name.toLowerCase()} ${formatKpiValue(k.control.value, k.unit)} → ${formatKpiValue(k.treatment.value, k.unit)} (sequential p = ${k.pSequential!.toFixed(3)})`,
      )
      .join("; ")
    const reason = `Kill switch: ${detail}. Treatment turned off automatically; everyone gets control.`
    // Conditional update, so two instances racing on the same batch kill it once.
    const { count } = await db.feature.updateMany({ where: { id: f.id, killedAt: null }, data: { killedAt: new Date(), killReason: reason } })
    if (count === 0) continue
    await db.reviewNote.create({ data: { featureId: f.id, kind: "SYSTEM", author: "Kill switch", body: reason } })
    await db.ticket.create({
      data: {
        featureId: f.id,
        kind: "INCIDENT",
        title: `${f.name} killed by guardrail`,
        body: `${detail}. The flag now serves control to all users. Find the cause before any re-launch; a re-launch needs a new spec sign-off.`,
      },
    })
    killed.push({ key: f.key, reason })
  }
  return killed
}
