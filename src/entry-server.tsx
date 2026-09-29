// Pre-render entry (built with `vite build --ssr`, run by scripts/prerender.mjs). Not shipped to the browser.
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { App } from "./App.tsx";
import { htmlAttributes, shellHead } from "./shell/document.ts";
import { LANGS, pagePath, type Lang } from "./site.ts";

export { LANGS, pagePath };

export function renderPage(lang: Lang): { htmlAttrs: string; head: string; body: string } {
  return {
    htmlAttrs: htmlAttributes(lang),
    head: shellHead(lang),
    body: renderToString(
      <StrictMode>
        <App lang={lang} />
      </StrictMode>,
    ),
  };
}
