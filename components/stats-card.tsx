"use client"

import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

interface StatsCardProps {
  title: string
  value: string
  description: string
  icon: LucideIcon
  trend?: {
    value: string
    positive: boolean
  }
}

export function StatsCard({ title, value, description, icon: Icon, trend }: StatsCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {title}
          </p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
        </div>
        <div className="rounded-lg bg-secondary p-2">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </div>
      
      <div className="mt-3 flex items-center gap-2">
        {trend && (
          <span className={cn(
            "text-xs font-medium",
            trend.positive ? "text-primary" : "text-destructive"
          )}>
            {trend.positive ? "+" : ""}{trend.value}
          </span>
        )}
        <span className="text-xs text-muted-foreground">{description}</span>
      </div>
    </div>
  )
}
