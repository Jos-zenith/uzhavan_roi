"use client"

import { useState } from "react"
import { Header } from "@/components/header"
import { TechStackCard, techStackData } from "@/components/tech-stack-card"
import { ArchitectureDiagram } from "@/components/architecture-diagram"
import { StatsCard } from "@/components/stats-card"
import { Badge } from "@/components/ui/badge"
import { 
  Users, 
  MapPin, 
  Zap, 
  TrendingUp,
  ChevronRight,
  Sparkles
} from "lucide-react"

export default function Home() {
  const [activeLayer, setActiveLayer] = useState<string | undefined>()

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 lg:px-6 py-8">
        {/* Hero Section */}
        <section className="mb-12">
          <div className="flex flex-col gap-4 max-w-3xl">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                <Sparkles className="h-3 w-3 mr-1" />
                Hackathon Project
              </Badge>
              <span className="text-xs text-muted-foreground">TN IMPACT 26</span>
            </div>
            
            <h1 className="text-3xl md:text-4xl font-bold text-foreground leading-tight text-balance">
              Shared Telemetry SDK for{" "}
              <span className="text-primary">Supply Analytics</span>
            </h1>
            
            <p className="text-base text-muted-foreground leading-relaxed max-w-2xl">
              A standardized KPI collection framework integrated with the Uzhavan app ecosystem. 
              Track ROI, measure impact, and enable data-driven decisions for Tamil Nadu{"'"}s agricultural supply chain.
            </p>
          </div>
        </section>
        
        {/* Stats Section */}
        <section className="mb-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard
              title="Districts Covered"
              value="32+"
              description="Across Tamil Nadu"
              icon={MapPin}
              trend={{ value: "100%", positive: true }}
            />
            <StatsCard
              title="Farmers Reached"
              value="8M+"
              description="Registered users"
              icon={Users}
              trend={{ value: "15%", positive: true }}
            />
            <StatsCard
              title="Services Tracked"
              value="18"
              description="Vital agricultural services"
              icon={Zap}
            />
            <StatsCard
              title="Projected ROI"
              value="650%"
              description="Feature attribution"
              icon={TrendingUp}
              trend={{ value: "Based on pilot data", positive: true }}
            />
          </div>
        </section>
        
        {/* Tech Stack Section */}
        <section>
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Architecture Sidebar */}
            <aside className="lg:w-64 shrink-0">
              <div className="lg:sticky lg:top-24">
                <ArchitectureDiagram activeLayer={activeLayer} />
                
                {/* Legend */}
                <div className="mt-6 rounded-xl border border-border bg-card p-4">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                    Quick Stats
                  </h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Total Layers</span>
                      <span className="font-medium text-foreground">10</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Technologies</span>
                      <span className="font-medium text-foreground">12+</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Availability</span>
                      <span className="font-medium text-primary">99.9%</span>
                    </div>
                  </div>
                </div>
              </div>
            </aside>
            
            {/* Tech Stack Grid */}
            <div className="flex-1">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-semibold text-foreground">Technology Stack</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Click on a card to highlight in the architecture diagram
                  </p>
                </div>
                <button className="flex items-center gap-1 text-sm text-primary hover:underline">
                  View all <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {techStackData.map((tech) => (
                  <TechStackCard
                    key={tech.layer}
                    {...tech}
                    isActive={activeLayer === tech.layer}
                    onClick={() => setActiveLayer(
                      activeLayer === tech.layer ? undefined : tech.layer
                    )}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>
        
        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-border">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
            <p>Built for TN IMPACT 26 Hackathon</p>
            <p>Uzhavan Analytics SDK - Supply Analytics Domain</p>
          </div>
        </footer>
      </main>
    </div>
  )
}
