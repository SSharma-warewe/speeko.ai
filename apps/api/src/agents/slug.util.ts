import { slugify as slugifyBase } from '../common/slug';

/** Org-agent slug: same rules as `common/slug`, empty input → `agent`. */
export function slugify(input: string): string {
  return slugifyBase(input, 'agent');
}

/**
 * Build a unique slug for the org. If `preferred` is taken, append -2, -3, …
 */
export function nextAvailableSlug(
  preferred: string,
  existingSlugs: Iterable<string>,
): string {
  const taken = new Set(
    [...existingSlugs].map((s) => s.toLowerCase()).filter(Boolean),
  );
  const base = slugify(preferred).slice(0, 72);
  if (!taken.has(base)) {
    return base;
  }
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${base}-${i}`.slice(0, 80);
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
  return `${base}-${Date.now()}`.slice(0, 80);
}
