export function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/+$/, '').toLowerCase();
}

/** Comma-separated CORS_ORIGIN → normalized origins (no trailing slash, lowercase). */
export function parseCorsOriginAllowlist(
  raw: string | undefined | null,
): string[] {
  if (!raw?.trim()) {
    return [];
  }
  return raw
    .split(',')
    .map((o) => normalizeOrigin(o))
    .filter(Boolean);
}
