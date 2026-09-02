import { useEffect } from "react";
import { MARKETING_ROUTES } from "../data/marketing-routes";
import { canonicalUrl, toCanonicalPath, useCanonicalUrl } from "./canonical";

export type PageMeta = {
  title: string;
  description: string;
};

/** SEO copy keyed by canonical path (same locs as sitemap.xml). */
export const PAGE_META: Record<string, PageMeta> = Object.fromEntries(
  MARKETING_ROUTES.map((route) => [
    route.path,
    { title: route.title, description: route.description },
  ]),
);

export function pageMetaForPath(pathname: string): PageMeta {
  const path = toCanonicalPath(pathname);
  return PAGE_META[path] ?? PAGE_META["/"];
}

function upsertMeta(
  attr: "name" | "property",
  key: string,
  content: string,
): () => void {
  const selector = `meta[${attr}="${CSS.escape(key)}"]`;
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  const created = !el;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  const previous = el.getAttribute("content");
  el.setAttribute("content", content);
  return () => {
    if (created) {
      el.remove();
    } else if (previous != null) {
      el.setAttribute("content", previous);
    } else {
      el.removeAttribute("content");
    }
  };
}

/** Title, description, Open Graph, and Twitter tags for the current marketing route. */
export function usePageMeta(pathname: string) {
  useCanonicalUrl(pathname);
  const meta = pageMetaForPath(pathname);
  const url = canonicalUrl(pathname);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = meta.title;

    const restore = [
      upsertMeta("name", "description", meta.description),
      upsertMeta("property", "og:type", "website"),
      upsertMeta("property", "og:site_name", "Speeko"),
      upsertMeta("property", "og:title", meta.title),
      upsertMeta("property", "og:description", meta.description),
      upsertMeta("property", "og:url", url),
      upsertMeta("name", "twitter:card", "summary"),
      upsertMeta("name", "twitter:title", meta.title),
      upsertMeta("name", "twitter:description", meta.description),
    ];

    return () => {
      document.title = previousTitle;
      for (const fn of restore) fn();
    };
  }, [meta.title, meta.description, url]);
}
