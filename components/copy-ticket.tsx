"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"

/** Copy a ticket as Markdown, ready to paste into GitHub, Jira or Linear. */
export function CopyTicket({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border px-2 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          // clipboard blocked: nothing to do
        }
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      {copied ? "copied" : "copy as issue"}
    </button>
  )
}
