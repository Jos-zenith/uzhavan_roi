/**
 * Data-minimisation guard for the event contract. Telemetry identifies farmers
 * only by pseudonymous ids; anything that looks like direct personal data is
 * rejected at ingest rather than stored and cleaned up later (DPDP Act 2023:
 * collect only what the stated purpose needs).
 */

const PERSONAL_KEYS =
  /^(name|full_?name|first_?name|last_?name|phone|mobile|msisdn|whatsapp|email|e_?mail|aadhaa?r|pan|voter_?id|address|pincode|dob|date_?of_?birth|bank|account|ifsc|upi|lat|lng|lon|latitude|longitude|gps|location)$/i

// Free-text context values: flag personal data appearing anywhere in the value.
const PERSONAL_IN_TEXT: [RegExp, string][] = [
  [/(^|\D)(\+?91[\s-]?)?[6-9]\d{9}(\D|$)/, "an Indian mobile number"],
  [/(^|\D)\d{4}\s\d{4}\s\d{4}(\D|$)|(^|\D)\d{12}(\D|$)/, "an Aadhaar-like 12-digit number"],
  [/[^\s@]+@[^\s@]+\.[^\s@]+/, "an email address"],
]
// Id fields: only whole-value matches. Substring matching would flag the digit
// runs that random UUIDs contain and silently reject real sessions.
const PERSONAL_AS_ID: [RegExp, string][] = [
  [/^(\+?91[\s-]?)?[6-9]\d{9}$/, "an Indian mobile number"],
  [/^\d{4}\s?\d{4}\s?\d{4}$/, "an Aadhaar-like 12-digit number"],
  [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "an email address"],
]

/** Returns a reason if the value looks like direct personal data, otherwise null. */
function personalValue(value: unknown, patterns: [RegExp, string][]): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null
  const text = String(value).trim()
  for (const [pattern, what] of patterns) if (pattern.test(text)) return what
  return null
}

export type PrivacyIssue = { path: string; message: string }

export function findPersonalData(event: { userId: string; sessionId: string; context: Record<string, unknown> }): PrivacyIssue[] {
  const issues: PrivacyIssue[] = []
  for (const field of ["userId", "sessionId"] as const) {
    const what = personalValue(event[field], PERSONAL_AS_ID)
    if (what) issues.push({ path: field, message: `${field} looks like ${what}. Use a pseudonymous id, never an identity.` })
  }
  for (const [key, value] of Object.entries(event.context ?? {})) {
    if (PERSONAL_KEYS.test(key)) {
      issues.push({ path: `context.${key}`, message: `context.${key} is a personal-data field. Telemetry carries ids, not identities.` })
      continue
    }
    const what = personalValue(value, PERSONAL_IN_TEXT)
    if (what) issues.push({ path: `context.${key}`, message: `context.${key} looks like ${what}.` })
  }
  return issues
}
