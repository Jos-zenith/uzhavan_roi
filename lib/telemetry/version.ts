// Kept separate from schema.ts so the browser SDK can stamp the version
// without bundling zod.
export const EVENT_SCHEMA_VERSION = 1
export const SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [1]
