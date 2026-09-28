import { NextResponse } from "next/server"
import { eventJsonSchema } from "@/lib/telemetry/schema"

/** The published event contract, generated from the same zod schema ingest enforces. */
export function GET() {
  return NextResponse.json(eventJsonSchema(), {
    headers: { "Content-Type": "application/schema+json" },
  })
}
