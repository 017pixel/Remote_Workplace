const SENSITIVE_KEY_PATTERN = /key|token|secret|password|authorization/i;

/**
 * Entfernt sensible Werte aus Daten, bevor Hermes-Antworten weitergereicht
 * oder in Diagnosezustände übernommen werden. Die Funktion ist absichtlich
 * rein und kennt keine Hermes-spezifischen Datenmodelle.
 */
export function redactSensitive(value: unknown, key?: string, depth = 0): unknown {
  if (key && SENSITIVE_KEY_PATTERN.test(key)) return "***";
  if (depth > 12) return "[gekürzt]";
  if (Array.isArray(value)) return value.map((item) => redactSensitive(item, undefined, depth + 1));
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      result[childKey] = redactSensitive(childValue, childKey, depth + 1);
    }
    return result;
  }
  return value;
}

export function redactText(value: string, maximumLength = 8_192): string {
  const trimmed = value.length > maximumLength ? `${value.slice(0, maximumLength)}\n[gekürzt]` : value;
  try {
    return JSON.stringify(redactSensitive(JSON.parse(trimmed))) ?? trimmed;
  } catch {
    return trimmed.replace(/((?:api[-_ ]?key|token|secret|password|authorization)\s*[:=]\s*)([^\s,;]+)/gi, "$1***");
  }
}

export function truncateText(value: unknown, maximumLength: number): string {
  const text = typeof value === "string" ? value : value == null ? "" : JSON.stringify(redactSensitive(value)) ?? String(value);
  return text.length > maximumLength ? `${text.slice(0, maximumLength)}\n[gekürzt]` : text;
}
