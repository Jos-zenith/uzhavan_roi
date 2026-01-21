"use client"

import { cn } from "@/lib/utils"

interface ArchitectureDiagramProps {
  activeLayer?: string
}

export function ArchitectureDiagram({ activeLayer }: ArchitectureDiagramProps) {
  const layers = [
    { id: "Frontend / SDK", label: "Frontend / SDK", color: "bg-layer-frontend" },
    { id: "Edge Storage", label: "Edge Storage", color: "bg-layer-storage" },
    { id: "Policy Engine", label: "Policy Engine", color: "bg-layer-policy" },
    { id: "Backend API", label: "Backend API", color: "bg-layer-backend" },
    { id: "Core Database", label: "Core Database", color: "bg-layer-database" },
    { id: "Time-Series DB", label: "Time-Series DB", color: "bg-layer-timeseries" },
    { id: "Analytics Engine", label: "Analytics", color: "bg-layer-analytics" },
    { id: "Visualization", label: "Visualization", color: "bg-layer-visualization" },
    { id: "Infrastructure", label: "Infrastructure", color: "bg-layer-infra" },
    { id: "Identity / Auth", label: "Auth", color: "bg-layer-auth" },
  ]

  return (
    <div className="relative rounded-xl border border-border bg-card p-6">
      <h3 className="text-sm font-medium text-muted-foreground mb-4 uppercase tracking-wider">
        System Architecture
      </h3>
      
      <div className="space-y-2">
        {layers.map((layer) => (
          <div
            key={layer.id}
            className={cn(
              "relative flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-300",
              activeLayer === layer.id 
                ? "bg-secondary" 
                : "bg-secondary/30 opacity-60 hover:opacity-100"
            )}
          >
            <div className={cn("h-2 w-2 rounded-full", layer.color)} />
            <span className="text-xs font-medium text-foreground">{layer.label}</span>
            
            {/* Connection line */}
            {layer.id !== "Identity / Auth" && (
              <div className="absolute left-[19px] -bottom-2 w-px h-2 bg-border" />
            )}
          </div>
        ))}
      </div>
      
      {/* Flow indicators */}
      <div className="mt-6 pt-4 border-t border-border">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Data Flow</span>
          <div className="flex items-center gap-1">
            <div className="h-px w-8 bg-primary/50" />
            <div className="h-0 w-0 border-t-4 border-t-transparent border-b-4 border-b-transparent border-l-4 border-l-primary/50" />
          </div>
        </div>
      </div>
    </div>
  )
}
