import { useEffect } from "react";
import { MARKETING_ORIGIN, MARKETING_PATHS } from "../data/marketing-routes";

export { MARKETING_ORIGIN };

const PATH_ALIASES: Record<string, string> = {
  "/signup": "/get-demo",
};

export function normalizePath(pathname: string): string {
  const raw = pathname.split("?")[0]?.split("#")[0] ?? "/";
  const collapsed = raw.replace(/\/{2,}/g, "/");
  if (collapsed.length > 1 && collapsed.endsWith("/")) {
    return collapsed.slice(0, -1);
  }
  return collapsed || "/";
}

/** Map any marketing pathname to the sitemap loc path. */
export function toCanonicalPath(pathname: string): string {
  const path = normalizePath(pathname);
  if (PATH_ALIASES[path]) return PATH_ALIASES[path];
  if (MARKETING_PATHS.has(path)) return path;
  if (path.startsWith("/solutions/")) return "/solutions";
  return "/";
}

export function canonicalUrl(pathname: string): string {
  const path = toCanonicalPath(pathname);
  return path === "/" ? `${MARKETING_ORIGIN}/` : `${MARKETING_ORIGIN}${path}`;
}

/** Upsert `<link rel="canonical">` for the lifetime of the page. */
export function useCanonicalUrl(pathname: string) {
  const href = canonicalUrl(pathname);

  useEffect(() => {
    let link = document.head.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    const created = !link;
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    const previous = link.getAttribute("href");
    link.setAttribute("href", href);
    return () => {
      if (created) {
        link.remove();
      } else if (previous) {
        link.setAttribute("href", previous);
      }
    };
  }, [href]);
}
