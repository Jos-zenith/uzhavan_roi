import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { DECISIONS, STATUS_LABEL, type FeatureStatus } from "@/lib/domain"
import { buildReport, featureWithSpec } from "@/lib/analytics/report"
import { gateFor } from "@/lib/governance"

type Ctx = { params: Promise<{ key: string }> }

/** Gate outcomes go in the review log automatically, refusals included. */
function log(featureId: string, body: string) {
  return db.reviewNote.create({ data: { featureId, kind: "SYSTEM", author: "Release gate", body } })
}

function transition(from: string, to: FeatureStatus) {
  return `${STATUS_LABEL[from as FeatureStatus]} → ${STATUS_LABEL[to]}`
}

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
  z.object({
    op: z.literal("approve"),
    role: z.enum(["product", "engineering", "analytics", "finance"]),
    approved: z.boolean(),
    by: z.string().trim().min(2, "Sign-off needs the name of the person approving").max(80),
  }),
  z.object({ op: z.literal("advance"), releaseVersion: z.string().max(32).optional() }),
  z.object({
    op: z.literal("decide"),
    decision: z.enum(DECISIONS),
    note: z.string().max(500).default(""),
    author: z.string().trim().max(80).optional(),
  }),
])

export async function PATCH(req: Request, { params }: Ctx) {
  const feature = await load((await params).key)
  if (!feature) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const parsed = patchInput.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
  }
  const body = parsed.data

  if (body.op === "approve") {
    if (feature.status !== "DRAFT") {
      return NextResponse.json({ error: "Approvals are locked once the spec is approved" }, { status: 409 })
    }
    await db.feature.update({
      where: { id: feature.id },
      data: {
        [`${body.role}Approved`]: body.approved,
        [`${body.role}ApprovedBy`]: body.approved ? body.by : null,
        notes: {
          create: {
            kind: "SYSTEM",
            author: "Sign-off",
            body: body.approved
              ? `${body.by} signed off the spec for ${body.role}.`
              : `${body.by} withdrew the ${body.role} sign-off.`,
          },
        },
      },
    })
    return NextResponse.json({ ok: true })
  }

  if (body.op === "advance") {
    const gate = await gateFor(feature)
    if (!gate.next) return NextResponse.json({ error: "No further stage — use a portfolio decision" }, { status: 409 })
    const failing = gate.checks.filter((c) => !c.ok)
    if (failing.length > 0) {
      await log(
        feature.id,
        `Gate refused: ${transition(feature.status, gate.next)}. Failing: ${failing.map((c) => c.label.replaceAll("`", "")).join("; ")}.`,
      )
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
    const n = gate.checks.length
    const release = gate.next === "SHIPPED" ? ` in ${body.releaseVersion!.trim()}` : ""
    await log(feature.id, `Gate passed (${n}/${n} checks): ${transition(feature.status, gate.next)}${release}.`)
    return NextResponse.json({ ok: true, status: gate.next })
  }

  // decide
  if (feature.status !== "SHIPPED") {
    return NextResponse.json({ error: "Only shipped features go through portfolio review" }, { status: 409 })
  }
  // Close the loop: a decision becomes work for someone, not a line in the minutes.
  const report = await buildReport(feature)
  const savings = report.monthlyCost - report.monthlyBenefit
  const ticket =
    body.decision === "SCALE"
      ? {
          kind: "ROADMAP",
          title: `Roll out ${feature.name} to everyone in scope`,
          body: `Scale decision. ${report.recommendation.reason}${body.note ? ` ${body.note}` : ""}`,
        }
      : body.decision === "RETIRE"
        ? {
            kind: "REMOVAL",
            title: `Remove ${feature.name}`,
            body: `Retire decision. ${report.recommendation.reason} Turn off the flag, then delete the code and stop the monthly costs.${body.note ? ` ${body.note}` : ""}`,
            monthlySavings: Math.max(0, savings),
          }
        : null
  await db.feature.update({
    where: { id: feature.id },
    data: {
      decision: body.decision,
      decisionNote: body.note,
      decidedAt: new Date(),
      ...(body.decision === "RETIRE" ? { status: "RETIRED" } : {}),
      notes: {
        create: {
          kind: "DECISION",
          author: body.author || feature.owner,
          body: `${body.decision.charAt(0)}${body.decision.slice(1).toLowerCase()}.${body.note ? ` ${body.note}` : ""}`,
        },
      },
      ...(ticket ? { tickets: { create: ticket } } : {}),
    },
  })
  return NextResponse.json({ ok: true, ticket: ticket?.kind ?? null })
}
