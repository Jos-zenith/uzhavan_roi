import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { ATTRIBUTION_METHODS, GOAL_TYPES } from "@/lib/domain"
import { buildReport, featureWithSpec } from "@/lib/analytics/report"
import { releaseQuarantine } from "@/lib/registry"

export async function GET() {
  const features = await db.feature.findMany({ ...featureWithSpec, orderBy: { createdAt: "asc" } })
  const withReports = await Promise.all(features.map(async (f) => ({ ...f, report: await buildReport(f) })))
  return NextResponse.json(withReports)
}

const specInput = z.object({
  key: z.string().regex(/^[a-z0-9_]+$/, "Feature flag must be snake_case").max(64),
  name: z.string().min(3).max(80),
  summary: z.string().min(10).max(500),
  owner: z.string().min(2).max(80),
  team: z.string().min(2).max(80),
  goals: z.array(z.object({ type: z.enum(GOAL_TYPES), statement: z.string().min(5).max(200) })).min(1).max(3),
  kpis: z
    .array(
      z.object({
        kpiId: z.string(),
        baseline: z.number().finite(),
        targetDelta: z.number().finite(),
        monthlyVolume: z.number().finite().nonnegative(),
        valuePerUnit: z.number().finite().nonnegative(),
        valueSource: z.string().trim().max(200).default(""),
        valueLow: z.number().finite().nonnegative().nullable().default(null),
        valueHigh: z.number().finite().nonnegative().nullable().default(null),
        role: z.enum(["PRIMARY", "GUARDRAIL"]).default("PRIMARY"),
      }),
    )
    .min(1, "Map at least one KPI")
    .max(5, "At most 5 KPIs: up to 3 primary and 2 guardrails")
    .refine((ks) => { const n = ks.filter((k) => k.role === "PRIMARY").length; return n >= 1 && n <= 3 }, "1–3 primary KPIs: pick the ones that matter")
    .refine((ks) => ks.filter((k) => k.role === "GUARDRAIL").length <= 2, "At most 2 guardrail KPIs"),
  attributionMethod: z.enum(ATTRIBUTION_METHODS),
  treatmentShare: z.number().min(0.01).max(0.99).default(0.5),
  holdoutDistricts: z.string().max(200).default(""),
  segment: z.string().min(3).max(200),
  minSamplePerArm: z.number().int().positive(),
  observationDays: z.number().int().positive(),
  horizonMonths: z.number().int().min(1).max(60),
  qualitativeBenefits: z.string().max(500).default(""),
})

export async function POST(req: Request) {
  const parsed = specInput.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return NextResponse.json({ error: issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid spec" }, { status: 400 })
  }
  const { kpis, goals, ...spec } = parsed.data
  if (new Set(kpis.map((k) => k.kpiId)).size !== kpis.length) {
    return NextResponse.json({ error: "Each KPI can only be mapped once" }, { status: 400 })
  }
  if (await db.feature.findUnique({ where: { key: spec.key } })) {
    return NextResponse.json({ error: `Feature flag "${spec.key}" is already registered` }, { status: 409 })
  }
  const found = await db.kpiDefinition.count({ where: { id: { in: kpis.map((k) => k.kpiId) } } })
  if (found !== kpis.length) return NextResponse.json({ error: "Unknown KPI — use the shared catalogue" }, { status: 400 })

  const feature = await db.feature.create({
    data: { ...spec, goals: JSON.stringify(goals), kpis: { create: kpis } },
  })
  // Registering the flag admits any events that arrived before the spec did.
  const recoveredEvents = await releaseQuarantine(feature.key)
  await db.reviewNote.create({
    data: {
      featureId: feature.id,
      kind: "SYSTEM",
      author: "Registry",
      body: `Spec registered by ${feature.owner}; flag \`${feature.key}\` admitted to analytics${
        recoveredEvents > 0 ? `. Released ${recoveredEvents} quarantined events that arrived before the spec` : ""
      }.`,
    },
  })
  return NextResponse.json({ ...feature, recoveredEvents }, { status: 201 })
}
