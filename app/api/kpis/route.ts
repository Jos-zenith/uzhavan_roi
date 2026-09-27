import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { KPI_CALCULATIONS, KPI_CATEGORIES, KPI_DIRECTIONS, UNIT_FOR_CALCULATION } from "@/lib/domain"

export async function GET() {
  const kpis = await db.kpiDefinition.findMany({ orderBy: { name: "asc" } })
  return NextResponse.json(kpis)
}

const action = z.string().regex(/^[a-z0-9_]+$/, "actions are snake_case")

const kpiInput = z
  .object({
    key: z.string().regex(/^[a-z0-9_]+$/, "keys are snake_case").max(64),
    name: z.string().min(3).max(80),
    description: z.string().min(10).max(400),
    category: z.enum(KPI_CATEGORIES),
    direction: z.enum(KPI_DIRECTIONS),
    calculation: z.enum(KPI_CALCULATIONS),
    numeratorAction: action,
    denominatorAction: action.nullable(),
  })
  .refine((k) => k.calculation === "MEAN_VALUE" || !!k.denominatorAction, {
    message: "Ratio and per-1k KPIs need a denominator action",
    path: ["denominatorAction"],
  })

export async function POST(req: Request) {
  const parsed = kpiInput.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid KPI" }, { status: 400 })
  const k = parsed.data
  if (await db.kpiDefinition.findUnique({ where: { key: k.key } })) {
    return NextResponse.json({ error: `KPI "${k.key}" already exists — reuse it instead of redefining it.` }, { status: 409 })
  }
  const created = await db.kpiDefinition.create({
    data: {
      ...k,
      unit: UNIT_FOR_CALCULATION[k.calculation],
      denominatorAction: k.calculation === "MEAN_VALUE" ? null : k.denominatorAction,
    },
  })
  return NextResponse.json(created, { status: 201 })
}
