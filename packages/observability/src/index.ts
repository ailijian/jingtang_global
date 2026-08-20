const forbiddenKey =
  /(authorization|cookie|password|secret|token|oauth|signed.?url|email|content|asset)/i;
const emailLike = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const bearerLike = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;

export type SafeLogValue =
  string | number | boolean | null | SafeLogValue[] | { [key: string]: SafeLogValue };

export function redactForLog(value: unknown): SafeLogValue {
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    return value.replace(emailLike, "[REDACTED_EMAIL]").replace(bearerLike, "Bearer [REDACTED]");
  }
  if (Array.isArray(value)) return value.map(redactForLog);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        forbiddenKey.test(key) ? "[REDACTED]" : redactForLog(entry),
      ]),
    );
  }
  return "[UNSERIALIZABLE]";
}

export function safeLog(
  level: "info" | "warn" | "error",
  event: string,
  fields: Readonly<Record<string, unknown>>,
): void {
  const redactedFields = redactForLog(fields) as { [key: string]: SafeLogValue };
  const record = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...redactedFields,
  };
  process.stdout.write(`${JSON.stringify(record)}\n`);
}
