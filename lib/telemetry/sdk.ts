import type { TelemetryEvent } from "./schema"
import { EVENT_SCHEMA_VERSION } from "./version"

/**
 * Shared telemetry SDK. Engineers only call `expose()` when a user sees a
 * flagged feature and `track()` for the actions a KPI is built on; the SDK
 * fills in user, session, flag, variant, release and batching.
 *
 *   const t = createTelemetry({ endpoint: "/api/events", app: "vayal", release: "4.2.0", requireConsent: true })
 *   t.setConsent(farmerAgreed)
 *   t.identify(farmerId)
 *   const variant = t.expose("one_tap_reorder", assignVariant("one_tap_reorder", farmerId, 50))
 *   t.track("checkout_completed", { feature: "one_tap_reorder", value: secondsTaken })
 *
 * Built for rural networks: batches are gzip-compressed, and events queued
 * while offline are kept on the device (surviving reloads) and sent when the
 * connection returns. Retries are safe because ingest de-duplicates eventIds.
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
  /** Drop every event until setConsent(true) is called (DPDP Act: consent before collection). */
  requireConsent?: boolean
  /** Keep unsent events in localStorage so they survive reloads while offline. Default on in browsers. */
  persist?: boolean
  /** Most events kept on the device while offline; the oldest are dropped first. */
  maxStoredEvents?: number
  /** Called with every event as it is queued (handy for debug panels). */
  onEvent?: (event: TelemetryEvent) => void
  /** Called when an event is not collected, and why. */
  onDrop?: (action: string, reason: "no_consent") => void
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
  /** true when the SDK held the batch because the device is offline */
  offline: boolean
  /** payload size before and after compression */
  bytes: { raw: number; sent: number }
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

async function gzip(text: string): Promise<ArrayBuffer | null> {
  if (typeof CompressionStream === "undefined") return null
  try {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"))
    return await new Response(stream).arrayBuffer()
  } catch {
    return null
  }
}

export function createTelemetry(config: TelemetryConfig) {
  const maxBatch = config.maxBatch ?? 20
  const flushIntervalMs = config.flushIntervalMs ?? 3000
  const maxStored = config.maxStoredEvents ?? 500
  const storageKey = `tnimpact:queue:${config.app}`
  const canStore = (config.persist ?? true) && typeof localStorage !== "undefined"
  const exposures = new Map<string, Variant>()
  let queue: TelemetryEvent[] = load()
  let userId = "anonymous"
  let sessionId = newId()
  let timer: ReturnType<typeof setTimeout> | null = null
  let consent = !config.requireConsent
  let forcedOffline = false

  function load(): TelemetryEvent[] {
    if (!canStore) return []
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "[]")
      return Array.isArray(saved) ? saved : []
    } catch {
      return []
    }
  }

  function save() {
    if (!canStore) return
    try {
      if (queue.length === 0) localStorage.removeItem(storageKey)
      else localStorage.setItem(storageKey, JSON.stringify(queue.slice(-maxStored)))
    } catch {
      // storage full or blocked: events stay in memory only
    }
  }

  const isOffline = () => forcedOffline || (typeof navigator !== "undefined" && navigator.onLine === false)

  function enqueue(action: string, opts: TrackOptions = {}) {
    if (!consent) {
      config.onDrop?.(action, "no_consent")
      return
    }
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
    if (queue.length > maxStored) queue = queue.slice(-maxStored)
    save()
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
    const batch = queue.slice(0, 200)
    const json = JSON.stringify({ events: batch })
    const raw = new TextEncoder().encode(json).length
    if (isOffline()) {
      // Nothing is lost: the queue is already on the device and goes out on reconnect.
      config.onFlush?.({ events: batch.length, status: null, body: "offline", ms: 0, retrying: true, offline: true, bytes: { raw, sent: 0 } })
      return
    }
    queue = queue.slice(batch.length)
    const compressed = await gzip(json)
    const started = Date.now()
    try {
      const res = await fetch(config.endpoint, {
        method: "POST",
        headers: compressed
          ? { "Content-Type": "application/json", "Content-Encoding": "gzip" }
          : { "Content-Type": "application/json" },
        body: compressed ?? json,
        keepalive: true,
      })
      // 4xx means the batch is malformed and retrying won't help.
      const retrying = res.status >= 500
      if (retrying) queue = batch.concat(queue)
      save()
      const body = await res.json().catch(() => null)
      config.onFlush?.({
        events: batch.length,
        status: res.status,
        body,
        ms: Date.now() - started,
        retrying,
        offline: false,
        bytes: { raw, sent: compressed?.byteLength ?? raw },
      })
    } catch (err) {
      queue = batch.concat(queue) // network error: retry later (eventIds dedupe)
      save()
      config.onFlush?.({ events: batch.length, status: null, body: String(err), ms: Date.now() - started, retrying: true, offline: false, bytes: { raw, sent: 0 } })
    }
  }

  if (typeof window !== "undefined") {
    window.addEventListener("online", () => void flush())
  }
  // Events left on the device by an earlier offline session go out shortly after startup.
  if (queue.length > 0) timer = setTimeout(() => void flush(), flushIntervalMs)
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
    /** Grant or withdraw consent. Withdrawing also deletes anything not yet sent. */
    setConsent(granted: boolean) {
      consent = granted
      if (!granted) {
        queue = []
        save()
      }
    },
    /** Pretend the device is offline (for demos and tests); `false` returns to the real network state. */
    simulateOffline(offline: boolean) {
      forcedOffline = offline
      if (!offline) void flush()
    },
    get pending() {
      return queue.length
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
