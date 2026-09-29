import { CircleCheck, CircleDashed, CircleX, Hourglass, OctagonX, RefreshCw, TrendingUp } from "lucide-react"
import { STATUS_LABEL, type FeatureStatus } from "@/lib/domain"
import type { Recommendation } from "@/lib/analytics/report"
import { cn } from "@/lib/utils"

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
      {STATUS_LABEL[status as FeatureStatus] ?? status}
    </span>
  )
}

const REC = {
  SCALE: { label: "Scale", icon: TrendingUp, dot: "bg-status-good" },
  ITERATE: { label: "Iterate", icon: RefreshCw, dot: "bg-status-warning" },
  RETIRE: { label: "Retire", icon: CircleX, dot: "bg-status-critical" },
  KILLED: { label: "Killed by guardrail", icon: OctagonX, dot: "bg-status-critical" },
  KEEP_MEASURING: { label: "Keep measuring", icon: Hourglass, dot: "bg-muted-foreground" },
  NOT_LIVE: { label: "Not live", icon: CircleDashed, dot: "bg-border" },
} as const

/** Verdict badge — colour is never the only signal: icon + label always present. */
export function RecommendationBadge({ kind, className }: { kind: Recommendation["kind"]; className?: string }) {
  const r = REC[kind]
  const Icon = r.icon
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium", className)}>
      <span className={cn("h-2 w-2 rounded-full", r.dot)} aria-hidden />
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {r.label}
    </span>
  )
}

export function CheckRow({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {ok ? (
        <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-status-good" aria-label="Passed" />
      ) : (
        <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-status-critical" aria-label="Failing" />
      )}
      <span className={cn(!ok && "text-foreground", ok && "text-muted-foreground")}>
        {label.split("`").map((part, i) => (i % 2 ? <code key={i} className="font-mono text-xs">{part}</code> : part))}
        {detail && <span className="text-muted-foreground"> · {detail}</span>}
      </span>
    </li>
  )
}
