import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

/**
 * What the SDK should serve. A killed or retired feature is off: everyone
 * gets control. Apps poll this (or fetch it at startup) before assigning variants.
 */
export async function GET() {
  const features = await db.feature.findMany({
    where: { status: { in: ["SHIPPED", "RETIRED"] } },
    select: { key: true, status: true, treatmentShare: true, killedAt: true, killReason: true },
  })
  const flags = Object.fromEntries(
    features.map((f) => [
      f.key,
      {
        enabled: f.status === "SHIPPED" && !f.killedAt,
        treatmentPercent: f.status === "SHIPPED" && !f.killedAt ? Math.round(f.treatmentShare * 100) : 0,
        reason: f.killedAt ? f.killReason : f.status === "RETIRED" ? "retired" : null,
      },
    ]),
  )
  return NextResponse.json({ flags }, { headers: { "Cache-Control": "no-store" } })
}
