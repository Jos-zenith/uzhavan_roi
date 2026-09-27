import { z } from "zod"

/**
 * The common event schema every product emits. The ingest API rejects
 * anything that doesn't match, so the warehouse only ever holds this shape.
 */
export const telemetryEventSchema = z.object({
  eventId: z.string().min(8).max(64),
  timestamp: z.string().datetime(),
  app: z.string().min(1).max(64),
  release: z.string().min(1).max(32),
  userId: z.string().min(1).max(128),
  sessionId: z.string().min(1).max(128),
  featureFlag: z.string().regex(/^[a-z0-9_]+$/).max(64).nullable(),
  variant: z.enum(["control", "treatment"]).nullable(),
  action: z.string().regex(/^[a-z0-9_]+$/, "actions are snake_case").max(64),
  value: z.number().finite().nullable(),
  context: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
})

export type TelemetryEvent = z.infer<typeof telemetryEventSchema>

export const MAX_BATCH = 500

export const ingestBatchSchema = z.object({
  events: z.array(telemetryEventSchema).min(1).max(MAX_BATCH),
})
