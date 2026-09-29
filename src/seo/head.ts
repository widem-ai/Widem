// SEO tags for one language's page, rendered into the static HTML at pre-render (never injected after load).
// A9: title, meta description, canonical, hreflang both ways plus x-default. JSON-LD: a later slice.
import type { Content } from "../../content/index.ts";
import { LANGS, pageUrl, type Lang } from "../site.ts";
import { escapeHtml } from "../shell/escape.ts";

export function seoHead(lang: Lang, c: Content): string {
  const alternates = LANGS.map(
    (l) => `<link rel="alternate" hreflang="${l}" href="${escapeHtml(pageUrl(l))}">`,
  );
  return [
    `<title>${escapeHtml(c.meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(c.meta.description)}">`,
    `<link rel="canonical" href="${escapeHtml(pageUrl(lang))}">`,
    ...alternates,
    `<link rel="alternate" hreflang="x-default" href="${escapeHtml(pageUrl("en"))}">`,
  ].join("\n");
}
