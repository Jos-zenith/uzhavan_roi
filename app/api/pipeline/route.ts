import { NextResponse } from "next/server"
import { pipelineStatus } from "@/lib/pipeline"

export const dynamic = "force-dynamic"

/** Live pipeline counts, polled by the portfolio's status strip and the demo. */
export async function GET() {
  return NextResponse.json(await pipelineStatus(), { headers: { "Cache-Control": "no-store" } })
}
