export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val instanceof Date) return val.toISOString();
    if (Array.isArray(val)) return val;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const entries = Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
      return Object.fromEntries(entries);
    }
    return val;
  });
}

export function parseJson(value: string): unknown {
  return JSON.parse(value);
}
