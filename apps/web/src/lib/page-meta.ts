import { useEffect } from "react";
import { canonicalUrl, toCanonicalPath, useCanonicalUrl } from "./canonical";

export type PageMeta = {
  title: string;
  description: string;
};

/** SEO copy keyed by canonical path (same locs as sitemap.xml). */
export const PAGE_META: Record<string, PageMeta> = {
  "/": {
    title: "Speeko — Voice agents for calls",
    description:
      "Speeko places and answers calls for appointment confirmations and lead outreach — with live transcripts, real-time outcomes, and zero missed follow-ups.",
  },
  "/get-demo": {
    title: "Get a demo — Speeko",
    description:
      "See Speeko voice agents handle real inbound and outbound calls. Request a live walkthrough tailored to your volume and stack.",
  },
  "/how-it-works": {
    title: "How it works — Speeko",
    description:
      "Bring a virtual number from Telnyx, Twilio, or your SIP carrier. Name the agents, switch on tools, and take a persona live — no code.",
  },
  "/voice": {
    title: "Voice that people stay on — Speeko",
    description:
      "Speeko agents use neural speech you pick on the agent — talent, pace, delivery — so the first second does not sound like an IVR.",
  },
  "/solutions": {
    title: "Solutions — Speeko",
    description:
      "Agents only run tools you enable — hang up, look someone up, check a calendar, book, cancel, transfer. Assemble a profile. You do not upload code.",
  },
  "/solutions/customer-service": {
    title: "Customer Service tools — Speeko",
    description:
      "Assemble a clinic agent from hangup, lookup, confirm, calendar, and transfer. Speeko voice agents finish the visit, not the voicemail.",
  },
  "/solutions/marketing-sales": {
    title: "Marketing & Sales tools — Speeko",
    description:
      "A demo-setter profile: GHL contact tools, free slots, and schedule. Qualification is the task; the tools are how a meeting actually lands.",
  },
};

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
