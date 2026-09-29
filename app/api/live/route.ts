import { liveSnapshot } from "@/lib/live"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const TICK_MS = 2500
const LIFETIME_MS = 50_000 // stay inside serverless time limits; EventSource reconnects on its own

/**
 * Server-Sent Events: pushes a snapshot whenever the newest events or any
 * running test's group sizes change, and a keep-alive comment otherwise.
 */
export async function GET(req: Request) {
  const encoder = new TextEncoder()
  let closed = false
  req.signal.addEventListener("abort", () => {
    closed = true
  })

  const stream = new ReadableStream({
    async start(controller) {
      const write = (text: string) => {
        if (!closed) controller.enqueue(encoder.encode(text))
      }
      write("retry: 2000\n\n")
      let last = ""
      const started = Date.now()
      while (!closed && Date.now() - started < LIFETIME_MS) {
        try {
          const snap = await liveSnapshot()
          const body = JSON.stringify(snap)
          if (body !== last) {
            write(`event: snapshot\ndata: ${body}\n\n`)
            last = body
          } else {
            write(": keep-alive\n\n")
          }
        } catch {
          write(": snapshot failed, retrying\n\n")
        }
        await new Promise((r) => setTimeout(r, TICK_MS))
      }
      if (!closed) controller.close()
    },
    cancel() {
      closed = true
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
