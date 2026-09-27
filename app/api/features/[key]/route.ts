import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { DECISIONS } from "@/lib/domain"
import { buildReport, featureWithSpec } from "@/lib/analytics/report"
import { gateFor } from "@/lib/governance"

type Ctx = { params: Promise<{ key: string }> }

async function load(key: string) {
  return db.feature.findUnique({ where: { key }, ...featureWithSpec })
}

export async function GET(_req: Request, { params }: Ctx) {
  const feature = await load((await params).key)
  if (!feature) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const [report, gate] = await Promise.all([buildReport(feature), gateFor(feature)])
  return NextResponse.json({ ...feature, report, gate })
}

const patchInput = z.discriminatedUnion("op", [
  z.object({ op: z.literal("approve"), role: z.enum(["product", "engineering", "analytics"]), approved: z.boolean() }),
  z.object({ op: z.literal("advance"), releaseVersion: z.string().max(32).optional() }),
  z.object({ op: z.literal("decide"), decision: z.enum(DECISIONS), note: z.string().max(500).default("") }),
])

export async function PATCH(req: Request, { params }: Ctx) {
  const feature = await load((await params).key)
  if (!feature) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const parsed = patchInput.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  const body = parsed.data

  if (body.op === "approve") {
    if (feature.status !== "DRAFT") {
      return NextResponse.json({ error: "Approvals are locked once the spec is approved" }, { status: 409 })
    }
    const field = `${body.role}Approved` as const
    await db.feature.update({ where: { id: feature.id }, data: { [field]: body.approved } })
    return NextResponse.json({ ok: true })
  }

  if (body.op === "advance") {
    const gate = await gateFor(feature)
    if (!gate.next) return NextResponse.json({ error: "No further stage — use a portfolio decision" }, { status: 409 })
    const failing = gate.checks.filter((c) => !c.ok)
    if (failing.length > 0) {
      return NextResponse.json({ error: "Release gate not met", failing }, { status: 409 })
    }
    if (gate.next === "SHIPPED" && !body.releaseVersion?.trim()) {
      return NextResponse.json({ error: "A release version is required to ship" }, { status: 400 })
    }
    await db.feature.update({
      where: { id: feature.id },
      data:
        gate.next === "SHIPPED"
          ? { status: gate.next, releasedAt: new Date(), releaseVersion: body.releaseVersion!.trim() }
          : { status: gate.next },
    })
    return NextResponse.json({ ok: true, status: gate.next })
  }

  // decide
  if (feature.status !== "SHIPPED") {
    return NextResponse.json({ error: "Only shipped features go through portfolio review" }, { status: 409 })
  }
  await db.feature.update({
    where: { id: feature.id },
    data: {
      decision: body.decision,
      decisionNote: body.note,
      decidedAt: new Date(),
      ...(body.decision === "RETIRE" ? { status: "RETIRED" } : {}),
    },
  })
  return NextResponse.json({ ok: true })
}
