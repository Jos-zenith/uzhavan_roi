import { z } from "zod/v4"
import { EVENT_SCHEMA_VERSION, SUPPORTED_SCHEMA_VERSIONS } from "./version"
import { findPersonalData } from "./privacy"

/**
 * The common event schema every product emits — the data contract between
 * engineering and analytics. The ingest API rejects anything that doesn't
 * match, and the published JSON Schema (GET /api/schema) is generated from
 * this same definition, so the docs can't drift from what's enforced.
 *
 * Versioning rule: adding an *optional* field is backward compatible and stays
 * on the current version. Renaming, removing, retyping or making a field
 * required is breaking and needs a new version the ingest API supports
 * alongside the old one until every producer has migrated. Unknown fields are
 * rejected (catches typos like `feature_flag`), so a new optional field ships
 * in the ingest API before any producer sends it.
 */
export { EVENT_SCHEMA_VERSION, SUPPORTED_SCHEMA_VERSIONS }

const snake = /^[a-z0-9_]+$/

export const telemetryEventSchema = z
  .object({
    schemaVersion: z
      .number()
      .int()
      .refine((v) => SUPPORTED_SCHEMA_VERSIONS.includes(v), {
        message: `Unsupported schemaVersion (this ingest API accepts: ${SUPPORTED_SCHEMA_VERSIONS.join(", ")})`,
      })
      .default(EVENT_SCHEMA_VERSION)
      .describe("Event contract version. Omitted = 1, so producers that predate versioning keep working."),
    eventId: z.string().min(8).max(64).describe("Client-generated unique id; retries with the same id are de-duplicated."),
    timestamp: z.iso.datetime().describe("When the action happened, ISO 8601 UTC."),
    app: z.string().min(1).max(64).describe("Product that emitted the event, e.g. vayal."),
    release: z.string().min(1).max(32).describe("App version that emitted the event."),
    userId: z.string().min(1).max(128).describe("Stable pseudonymous user id."),
    sessionId: z.string().min(1).max(128).describe("Session the action happened in."),
    featureFlag: z
      .string()
      .regex(snake)
      .max(64)
      .nullable()
      .describe("Registered feature this action belongs to. Unregistered flags are quarantined until a spec exists."),
    variant: z.enum(["control", "treatment"]).nullable().describe("Arm the user was assigned to for this feature."),
    action: z.string().regex(snake, "actions are snake_case").max(64).describe("snake_case verb the KPI catalogue refers to."),
    value: z.number().nullable().describe("Optional measurement, e.g. seconds taken for a MEAN_VALUE KPI."),
    context: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .default({})
      .describe("Flat key/value extras such as district or crop. No personal data: see lib/telemetry/privacy.ts."),
  })
  .strict()
  .superRefine((event, ctx) => {
    for (const issue of findPersonalData(event)) {
      ctx.addIssue({ code: "custom", path: issue.path.split("."), message: issue.message })
    }
  })

/** What producers send (schemaVersion and context may be omitted). */
export type TelemetryEventInput = z.input<typeof telemetryEventSchema>
/** What the ingest API stores after defaults are applied. */
export type TelemetryEvent = z.output<typeof telemetryEventSchema>

export const MAX_BATCH = 500

export const ingestBatchSchema = z.object({
  events: z.array(telemetryEventSchema).min(1).max(MAX_BATCH),
})

/** The published contract, as JSON Schema — describes what producers may send. */
export function eventJsonSchema() {
  return {
    ...z.toJSONSchema(telemetryEventSchema, { io: "input" }),
    title: "TelemetryEvent",
    $id: `tnimpact:telemetry-event:v${EVENT_SCHEMA_VERSION}`,
  }
}
