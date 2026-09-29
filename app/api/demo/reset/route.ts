import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { seedDemo } from "@/lib/demo/seed"

export const dynamic = "force-dynamic"
// Reloading ~38,000 events takes tens of seconds on hosted Postgres (minutes on the embedded `prisma dev` one).
export const maxDuration = 300

let running = false

/**
 * Replace everything with the demo scenario. For demo deployments only: set
 * DEMO_RESET=off anywhere real data lives, and this endpoint refuses.
 */
export async function POST() {
  if (process.env.DEMO_RESET === "off") {
    return NextResponse.json({ error: "Demo reset is turned off on this deployment" }, { status: 403 })
  }
  if (running) return NextResponse.json({ error: "A reset is already running" }, { status: 409 })
  running = true
  const started = Date.now()
  try {
    const r = await seedDemo(db)
    return NextResponse.json({ ok: true, ...r, ms: Date.now() - started })
  } finally {
    running = false
  }
}
