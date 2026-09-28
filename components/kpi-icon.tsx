import { IndianRupee, PiggyBank, ShieldCheck, Smile, Timer, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/** What each KPI category means in business terms, and the icon that stands for it. */
export const KPI_GROUPS: Record<string, { label: string; blurb: string; icon: LucideIcon }> = {
  REVENUE: { label: "Revenue", blurb: "money that comes in because of the feature", icon: IndianRupee },
  COST: { label: "Cost", blurb: "money we stop spending, mostly on support", icon: PiggyBank },
  PRODUCTIVITY: { label: "Time", blurb: "time farmers get back", icon: Timer },
  RISK: { label: "Risk", blurb: "failures and errors avoided", icon: ShieldCheck },
  EXPERIENCE: { label: "Experience", blurb: "whether people find what they came for", icon: Smile },
}

export function KpiIcon({ category, className }: { category: string; className?: string }) {
  const g = KPI_GROUPS[category]
  if (!g) return null
  const Icon = g.icon
  return (
    <span
      className={cn("inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-primary", className)}
      title={g.label}
    >
      <Icon className="h-4 w-4" aria-hidden />
      <span className="sr-only">{g.label}</span>
    </span>
  )
}
