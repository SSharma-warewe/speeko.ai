/** Portal app base URL (no trailing slash). */
export function getPortalBaseUrl(): string {
  const raw = (import.meta.env.VITE_PORTAL_URL as string | undefined)?.trim();
  if (raw) return raw.replace(/\/$/, "");
  // Local monorepo: portal Vite defaults to :5174; marketing is :5173.
  if (import.meta.env.DEV) return "http://localhost:5174";
  return "";
}

export function portalPath(path: string): string {
  const base = getPortalBaseUrl();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${normalized}` : normalized;
}

export function isExternalPortalUrl(): boolean {
  return /^https?:\/\//i.test(getPortalBaseUrl());
}
