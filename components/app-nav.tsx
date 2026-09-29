"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BookOpenText } from "lucide-react"
import { cn } from "@/lib/utils"

const LINKS = [
  { href: "/", label: "Portfolio" },
  { href: "/playbook", label: "How it works" },
  { href: "/demo", label: "Try it live" },
  { href: "/kpis", label: "KPI catalogue" },
  { href: "/features/new", label: "New spec" },
]

export function AppNav() {
  const pathname = usePathname()
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-4 py-3 lg:px-6">
        <Link href="/" className="flex items-baseline gap-2">
          <BookOpenText className="h-5 w-5 self-center text-primary" aria-hidden />
          <span className="font-serif text-lg font-semibold">Impact Ledger</span>
          <span className="text-xs text-muted-foreground">Uzhavan · TN IMPACT 26</span>
        </Link>
        <nav className="flex flex-wrap gap-1 text-sm">
          {LINKS.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href)
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground",
                  active && "bg-card text-foreground shadow-sm",
                )}
              >
                {l.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
