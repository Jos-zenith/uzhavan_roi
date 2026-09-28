import { eventJsonSchema, EVENT_SCHEMA_VERSION, SUPPORTED_SCHEMA_VERSIONS } from "@/lib/telemetry/schema"

type JsonProp = {
  type?: string | string[]
  enum?: unknown[]
  anyOf?: JsonProp[]
  format?: string
  pattern?: string
  description?: string
  default?: unknown
}

function typeLabel(p: JsonProp): string {
  if (p.anyOf) return p.anyOf.map(typeLabel).join(" | ")
  if (p.enum) return p.enum.map((v) => JSON.stringify(v)).join(" | ")
  if (p.format) return `${p.type} (${p.format})`
  if (p.pattern === "^[a-z0-9_]+$") return "string (snake_case)"
  return Array.isArray(p.type) ? p.type.join(" | ") : (p.type ?? "any")
}

/**
 * The published event contract, rendered from the JSON Schema generated off
 * the same zod definition the ingest API enforces. Nothing here is typed by
 * hand, so the docs can't drift from the validator.
 */
export function EventContract() {
  const schema = eventJsonSchema() as { properties: Record<string, JsonProp>; required?: string[] }
  const required = new Set(schema.required ?? [])
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-md bg-primary/15 px-2 py-0.5 font-mono text-xs">v{EVENT_SCHEMA_VERSION}</span>
        <span className="text-muted-foreground">
          current version · ingest accepts {SUPPORTED_SCHEMA_VERSIONS.map((v) => `v${v}`).join(", ")} · machine-readable at{" "}
          <a href="/api/schema" className="font-mono text-xs text-primary hover:underline">
            /api/schema
          </a>
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="pb-2 pr-4 font-medium">Field</th>
              <th className="pb-2 pr-4 font-medium">Type</th>
              <th className="pb-2 pr-4 font-medium">Required</th>
              <th className="pb-2 font-medium">Meaning</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(schema.properties).map(([name, p]) => (
              <tr key={name} className="border-t border-border align-top">
                <td className="py-2 pr-4 font-mono text-xs">{name}</td>
                <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">{typeLabel(p)}</td>
                <td className="py-2 pr-4 text-xs">
                  {required.has(name) ? "yes" : p.default !== undefined ? `no, default ${JSON.stringify(p.default)}` : "no"}
                </td>
                <td className="py-2 text-muted-foreground">{p.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
        <li>Unknown fields are rejected, so typos like <code className="font-mono">feature_flag</code> fail loudly instead of silently losing data.</li>
        <li>Adding an optional field is backward compatible and keeps the version. Ingest learns the field before any producer sends it.</li>
        <li>Renaming, removing, retyping or requiring a field is breaking: it ships as a new version, and ingest accepts both until every producer has migrated.</li>
      </ul>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Raw JSON Schema</summary>
        <pre className="mt-2 max-h-96 overflow-auto rounded-md bg-background p-3 font-mono text-xs leading-relaxed">
          {JSON.stringify(eventJsonSchema(), null, 2)}
        </pre>
      </details>
    </div>
  )
}
