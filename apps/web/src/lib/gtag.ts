import { useEffect, useRef } from "react";

export const GA_MEASUREMENT_ID = "G-5XRJR460G9";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** Send GA4 page_view on client-side navigations. First load is already sent by the HTML gtag config. */
export function useGtagPageView(pathname: string) {
  const isFirst = useRef(true);

  useEffect(() => {
    if (typeof window.gtag !== "function") return;
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    window.gtag("event", "page_view", {
      page_title: document.title,
      page_location: window.location.href,
      page_path: pathname,
    });
  }, [pathname]);
}
