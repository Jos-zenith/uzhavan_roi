"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { RotateCcw } from "lucide-react"

/** Put the demo back to its starting story, e.g. before walking a judge through it. */
export function ResetDemo() {
  const router = useRouter()
  const [state, setState] = useState<"idle" | "running" | "error">("idle")

  async function reset() {
    if (!window.confirm("Replace all data with the demo scenario? Everyone's live-demo events and decisions will be lost.")) return
    setState("running")
    const res = await fetch("/api/demo/reset", { method: "POST" }).catch(() => null)
    if (!res?.ok) return setState("error")
    setState("idle")
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={reset}
      disabled={state === "running"}
      className="inline-flex items-center gap-1 text-primary hover:underline disabled:cursor-wait disabled:opacity-60"
    >
      <RotateCcw className={state === "running" ? "h-3 w-3 animate-spin" : "h-3 w-3"} aria-hidden />
      {state === "running" ? "resetting… (up to a minute)" : state === "error" ? "reset failed, retry" : "reset demo"}
    </button>
  )
}
