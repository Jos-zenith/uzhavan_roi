"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Layers, Github, ExternalLink } from "lucide-react"

export function Header() {
  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 lg:px-6">
        <div className="flex h-16 items-center justify-between">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary">
              <Layers className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-foreground">Uzhavan Analytics SDK</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">TN IMPACT 26</span>
            </div>
          </div>
          
          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              Architecture
            </Button>
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              KPIs
            </Button>
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              Documentation
            </Button>
          </nav>
          
          {/* Actions */}
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="hidden sm:flex text-[10px] border-primary/30 text-primary">
              Supply Analytics
            </Badge>
            <Button variant="outline" size="sm" className="hidden sm:flex gap-2 bg-transparent">
              <Github className="h-4 w-4" />
              View Source
            </Button>
            <Button size="sm" className="gap-2">
              <ExternalLink className="h-4 w-4" />
              <span className="hidden sm:inline">Demo</span>
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}
