import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { COST_CATEGORIES, COST_RECURRENCES } from "@/lib/domain"

const costInput = z.object({
  category: z.enum(COST_CATEGORIES),
  recurrence: z.enum(COST_RECURRENCES),
  amount: z.number().finite().positive(),
  note: z.string().max(200).default(""),
})

export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const feature = await db.feature.findUnique({ where: { key: (await params).key } })
  if (!feature) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const parsed = costInput.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid cost entry" }, { status: 400 })
  const cost = await db.costEntry.create({ data: { ...parsed.data, featureId: feature.id } })
  return NextResponse.json(cost, { status: 201 })
}
