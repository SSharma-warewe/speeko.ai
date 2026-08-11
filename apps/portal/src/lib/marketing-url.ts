/** Public marketing site base URL (no trailing slash). */
export function getMarketingHomeUrl(): string {
  const raw = (import.meta.env.VITE_MARKETING_URL as string | undefined)?.trim();
  if (raw) return raw.replace(/\/$/, "") || "/";
  // Local monorepo: marketing Vite defaults to :5173; portal is :5174.
  if (import.meta.env.DEV) return "http://localhost:5173";
  return "/";
}

/** True when the marketing home is an absolute URL (different host). */
export function isExternalMarketingUrl(url: string = getMarketingHomeUrl()): boolean {
  return /^https?:\/\//i.test(url);
}
