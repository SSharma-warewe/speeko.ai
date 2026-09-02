import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { KEYWORD_PAGE_BY_PATH } from "./src/data/keyword-pages";
import {
  MARKETING_ROUTES,
  marketingUrl,
  type KeywordPath,
  type MarketingRoute,
} from "./src/data/marketing-routes";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function escapeAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function replaceTag(
  html: string,
  pattern: RegExp,
  replacement: string,
): string {
  if (!pattern.test(html)) return html;
  return html.replace(pattern, replacement);
}

function jsonLdScript(id: string, data: unknown): string {
  return `    <script id="${id}" type="application/ld+json">\n${JSON.stringify(data, null, 2)
    .split("\n")
    .map((line) => `      ${line}`)
    .join("\n")}\n    </script>`;
}

function routeJsonLd(route: MarketingRoute): string {
  const url = marketingUrl(route.path);
  const webpage = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: route.title,
    description: route.description,
    url,
    isPartOf: {
      "@type": "WebSite",
      name: "Speeko",
      url: "https://speeko.ai/",
    },
  };

  const scripts: string[] = [];
  if (route.path === "/") {
    scripts.push(
      jsonLdScript("speeko-jsonld", {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "WebSite",
            name: "Speeko",
            url: "https://speeko.ai/",
          },
          webpage,
        ],
      }),
    );
  } else {
    scripts.push(jsonLdScript("speeko-jsonld", webpage));
  }

  const keyword = KEYWORD_PAGE_BY_PATH[route.path as KeywordPath];
  if (keyword?.faqs.length) {
    scripts.push(
      jsonLdScript("speeko-faq-jsonld", {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: keyword.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.q,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.a,
          },
        })),
      }),
    );
  }

  return scripts.join("\n");
}

function applyRouteHead(html: string, route: MarketingRoute): string {
  const url = marketingUrl(route.path);
  const title = escapeAttr(route.title);
  const description = escapeAttr(route.description);

  let out = html;
  out = replaceTag(
    out,
    /<title>[\s\S]*?<\/title>/,
    `<title>${title}</title>`,
  );
  out = replaceTag(
    out,
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/>/,
    `<link rel="canonical" href="${url}" />`,
  );
  out = replaceTag(
    out,
    /<meta\s+name="description"[\s\S]*?\/>/,
    `<meta name="description" content="${description}" />`,
  );
  out = replaceTag(
    out,
    /<meta\s+property="og:title"[\s\S]*?\/>/,
    `<meta property="og:title" content="${title}" />`,
  );
  out = replaceTag(
    out,
    /<meta\s+property="og:description"[\s\S]*?\/>/,
    `<meta property="og:description" content="${description}" />`,
  );
  out = replaceTag(
    out,
    /<meta\s+property="og:url"[\s\S]*?\/>/,
    `<meta property="og:url" content="${url}" />`,
  );
  out = replaceTag(
    out,
    /<meta\s+name="twitter:title"[\s\S]*?\/>/,
    `<meta name="twitter:title" content="${title}" />`,
  );
  out = replaceTag(
    out,
    /<meta\s+name="twitter:description"[\s\S]*?\/>/,
    `<meta name="twitter:description" content="${description}" />`,
  );
  out = out.replace(
    /<script(?:\s+id="[^"]*")?\s+type="application\/ld\+json">[\s\S]*?<\/script>/g,
    "",
  );
  out = out.replace("</head>", `${routeJsonLd(route)}\n  </head>`);
  return out;
}

export function sitemapXml(): string {
  const urls = MARKETING_ROUTES.map((route) => {
    const loc = marketingUrl(route.path);
    const priority = Number.isInteger(route.priority)
      ? route.priority.toFixed(1)
      : String(route.priority);
    return `  <url>\n    <loc>${loc}</loc>\n    <priority>${priority}</priority>\n  </url>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function marketingHtmlPlugin(): Plugin {
  return {
    name: "marketing-html-shells",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0];
        if (url === "/sitemap.xml") {
          res.setHeader("Content-Type", "application/xml; charset=utf-8");
          res.end(sitemapXml());
          return;
        }
        next();
      });
    },
    closeBundle() {
      const dist = path.resolve(__dirname, "dist");
      const indexPath = path.join(dist, "index.html");
      if (!fs.existsSync(indexPath)) return;
      const template = fs.readFileSync(indexPath, "utf8");

      for (const route of MARKETING_ROUTES) {
        const html = applyRouteHead(template, route);
        if (route.path === "/") {
          fs.writeFileSync(indexPath, html);
          continue;
        }
        const dir = path.join(dist, route.path.replace(/^\//, ""));
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "index.html"), html);
      }

      fs.writeFileSync(path.join(dist, "sitemap.xml"), sitemapXml());
    },
  };
}
