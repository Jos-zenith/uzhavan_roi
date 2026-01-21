"use client"

import { cn } from "@/lib/utils"
import { 
  Smartphone, 
  Database, 
  Shield, 
  Server, 
  Clock, 
  Brain, 
  BarChart3, 
  Cloud, 
  Key,
  HardDrive
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

interface TechStackCardProps {
  layer: string
  technology: string
  description: string
  role: string
  icon: LucideIcon
  colorClass: string
  isActive?: boolean
  onClick?: () => void
}

export function TechStackCard({
  layer,
  technology,
  description,
  role,
  icon: Icon,
  colorClass,
  isActive = false,
  onClick,
}: TechStackCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border bg-card p-5 transition-all duration-300 cursor-pointer",
        "hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5",
        isActive && "border-primary shadow-lg shadow-primary/10"
      )}
    >
      {/* Accent line */}
      <div 
        className={cn(
          "absolute top-0 left-0 h-1 w-full opacity-60 transition-opacity group-hover:opacity-100",
          colorClass
        )} 
      />
      
      {/* Icon container */}
      <div className={cn(
        "mb-4 inline-flex items-center justify-center rounded-lg p-2.5",
        "bg-secondary/50"
      )}>
        <Icon className={cn("h-5 w-5", colorClass.replace("bg-", "text-"))} />
      </div>
      
      {/* Content */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full",
            "bg-secondary text-muted-foreground"
          )}>
            {layer}
          </span>
        </div>
        
        <h3 className="text-base font-semibold text-foreground">
          {technology}
        </h3>
        
        <p className="text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>
        
        <div className="pt-2 border-t border-border/50">
          <p className="text-xs text-muted-foreground/80 leading-relaxed">
            <span className="font-medium text-foreground/70">Role: </span>
            {role}
          </p>
        </div>
      </div>
    </div>
  )
}

export const techStackData = [
  {
    layer: "Frontend / SDK",
    technology: "React Native",
    description: "Cross-platform mobile framework",
    role: "Provides a unified UI for Uzhavan, GRAINS, and AgriStack services",
    icon: Smartphone,
    colorClass: "bg-layer-frontend",
  },
  {
    layer: "Edge Storage",
    technology: "expo-sqlite",
    description: "Local-first SQLite database",
    role: 'Enables "Store-and-Forward" telemetry for rural areas with poor connectivity',
    icon: HardDrive,
    colorClass: "bg-layer-storage",
  },
  {
    layer: "Policy Engine",
    technology: "Custom JSON SDK",
    description: "Declarative impact mapping",
    role: 'Mandates a Policy_ID for every event to prevent "vanity metrics"',
    icon: Shield,
    colorClass: "bg-layer-policy",
  },
  {
    layer: "Backend API",
    technology: "Node.js / Python",
    description: "Microservices layer",
    role: "Handles high-concurrency ingestion of telemetry from 32+ districts",
    icon: Server,
    colorClass: "bg-layer-backend",
  },
  {
    layer: "Core Database",
    technology: "PostgreSQL",
    description: "Relational metadata storage",
    role: "Stores Farmer IDs and mapping for the 18 vital services",
    icon: Database,
    colorClass: "bg-layer-database",
  },
  {
    layer: "Time-Series DB",
    technology: "TimescaleDB",
    description: "Postgres extension",
    role: 'Critical for analyzing seasonal ROI and "Pre vs Post" feature rollouts',
    icon: Clock,
    colorClass: "bg-layer-timeseries",
  },
  {
    layer: "Analytics Engine",
    technology: "Python (Scikit-learn)",
    description: "Machine Learning models",
    role: 'Predicts "Hectares Saved" and "Subsidy Lead Time" using regression',
    icon: Brain,
    colorClass: "bg-layer-analytics",
  },
  {
    layer: "Visualization",
    technology: "React + Recharts",
    description: "Dynamic data visualization",
    role: 'Powers the CM Dashboard with "Value Driver Trees" instead of basic charts',
    icon: BarChart3,
    colorClass: "bg-layer-visualization",
  },
  {
    layer: "Infrastructure",
    technology: "AWS / Azure / On-Prem",
    description: "Cloud hosting",
    role: "Ensures 99.9% availability for real-time seed/fertilizer stock checks",
    icon: Cloud,
    colorClass: "bg-layer-infra",
  },
  {
    layer: "Identity / Auth",
    technology: "AgriStack / JWT",
    description: "Secure authentication",
    role: "Links impact data directly to the Unique Farmer ID ecosystem",
    icon: Key,
    colorClass: "bg-layer-auth",
  },
]
