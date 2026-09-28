import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"

const noteInput = z.object({
  author: z.string().trim().min(2).max(80),
  body: z.string().trim().min(3).max(1000),
})

export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const feature = await db.feature.findUnique({ where: { key: (await params).key } })
  if (!feature) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const parsed = noteInput.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "A note needs an author and some text" }, { status: 400 })
  const note = await db.reviewNote.create({ data: { ...parsed.data, kind: "NOTE", featureId: feature.id } })
  return NextResponse.json(note, { status: 201 })
}
