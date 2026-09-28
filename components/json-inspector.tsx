"use client"

import { useState } from "react"
import { Braces } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

/** `{ }` button that shows exactly what an API endpoint returns — the data behind the screen. */
export function JsonInspector({ url, title, className }: { url: string; title: string; className?: string }) {
  const [text, setText] = useState<string | null>(null)
  const [status, setStatus] = useState<number | null>(null)

  async function load() {
    setText(null)
    try {
      const res = await fetch(url)
      setStatus(res.status)
      setText(JSON.stringify(await res.json(), null, 2))
    } catch (err) {
      setText(String(err))
    }
  }

  return (
    <Dialog onOpenChange={(open) => open && void load()}>
      <DialogTrigger
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 font-mono text-xs text-muted-foreground hover:bg-secondary hover:text-foreground",
          className,
        )}
        aria-label={`Inspect raw JSON: ${title}`}
      >
        <Braces className="h-3.5 w-3.5" aria-hidden />
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            GET {url} {status !== null && `→ ${status}`}
          </DialogDescription>
        </DialogHeader>
        <pre className="max-h-[65vh] overflow-auto terminal rounded-md p-3 font-mono text-xs leading-relaxed">
          {text ?? "loading…"}
        </pre>
      </DialogContent>
    </Dialog>
  )
}
