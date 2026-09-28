import type { TelemetryEvent } from "./schema"
import { EVENT_SCHEMA_VERSION } from "./version"

/**
 * Shared telemetry SDK. Engineers only call `expose()` when a user sees a
 * flagged feature and `track()` for the actions a KPI is built on; the SDK
 * fills in user, session, flag, variant, release and batching.
 *
 *   const t = createTelemetry({ endpoint: "/api/events", app: "uzhavan", release: "4.2.0" })
 *   t.identify(farmerId)
 *   const variant = t.expose("one_tap_reorder", assignVariant("one_tap_reorder", farmerId, 50))
 *   t.track("checkout_completed", { feature: "one_tap_reorder", value: secondsTaken })
 */

export type Variant = "control" | "treatment"

export type TelemetryConfig = {
  endpoint: string
  app: string
  release: string
  /** Flush when this many events are queued. */
  maxBatch?: number
  /** Flush at least this often while events are queued. */
  flushIntervalMs?: number
  /** Called with every event as it is queued (handy for debug panels). */
  onEvent?: (event: TelemetryEvent) => void
  /** Called after every flush attempt with the server's actual response. */
  onFlush?: (result: FlushResult) => void
}

export type FlushResult = {
  events: number
  /** HTTP status, or null when the request never reached the server. */
  status: number | null
  body: unknown
  ms: number
  retrying: boolean
}

export type TrackOptions = {
  /** Feature flag this action belongs to; its exposed variant is attached. */
  feature?: string
  value?: number
  context?: Record<string, string | number | boolean | null>
}

export function newId(): string {
  const c = globalThis.crypto
  if (c?.randomUUID) return c.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

/** FNV-1a hash → [0, 100). Deterministic, so a user keeps their variant. */
function bucket(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return ((h >>> 0) % 10000) / 100
}

/** Stable variant assignment for A/B tests and phased rollouts. */
export function assignVariant(flag: string, userId: string, treatmentPercent: number): Variant {
  return bucket(`${flag}:${userId}`) < treatmentPercent ? "treatment" : "control"
}

export function createTelemetry(config: TelemetryConfig) {
  const maxBatch = config.maxBatch ?? 20
  const flushIntervalMs = config.flushIntervalMs ?? 3000
  const exposures = new Map<string, Variant>()
  let queue: TelemetryEvent[] = []
  let userId = "anonymous"
  let sessionId = newId()
  let timer: ReturnType<typeof setTimeout> | null = null

  function enqueue(action: string, opts: TrackOptions = {}) {
    const flag = opts.feature ?? null
    const event: TelemetryEvent = {
      schemaVersion: EVENT_SCHEMA_VERSION,
      eventId: newId(),
      timestamp: new Date().toISOString(),
      app: config.app,
      release: config.release,
      userId,
      sessionId,
      featureFlag: flag,
      variant: flag ? (exposures.get(flag) ?? null) : null,
      action,
      value: opts.value ?? null,
      context: opts.context ?? {},
    }
    queue.push(event)
    config.onEvent?.(event)
    if (queue.length >= maxBatch) void flush()
    else if (!timer) timer = setTimeout(() => void flush(), flushIntervalMs)
  }

  async function flush(): Promise<void> {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (queue.length === 0) return
    const batch = queue
    queue = []
    const started = Date.now()
    try {
      const res = await fetch(config.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: batch }),
        keepalive: true,
      })
      // 4xx means the batch is malformed and retrying won't help.
      const retrying = res.status >= 500
      if (retrying) queue = batch.concat(queue)
      const body = await res.json().catch(() => null)
      config.onFlush?.({ events: batch.length, status: res.status, body, ms: Date.now() - started, retrying })
    } catch (err) {
      queue = batch.concat(queue) // network error: retry on next flush (eventIds dedupe)
      config.onFlush?.({ events: batch.length, status: null, body: String(err), ms: Date.now() - started, retrying: true })
    }
  }

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void flush()
    })
  }

  return {
    identify(id: string) {
      userId = id
    },
    newSession() {
      sessionId = newId()
      exposures.clear()
    },
    /** Record that the user saw `flag` in `variant`; later tracks inherit it. */
    expose(flag: string, variant: Variant): Variant {
      exposures.set(flag, variant)
      enqueue("feature_exposed", { feature: flag })
      return variant
    },
    track: enqueue,
    flush,
  }
}

export type Telemetry = ReturnType<typeof createTelemetry>
