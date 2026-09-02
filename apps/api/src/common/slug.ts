/** Lowercase letters, digits, optional single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const SLUG_PATTERN_MESSAGE =
  'must be lowercase alphanumeric with optional hyphens';

/** Normalize a display name into a URL-safe slug (max 80 chars). */
export function slugify(input: string, fallback = ''): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return base || fallback;
}
