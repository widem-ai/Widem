import type { MouseEvent } from "react";
import type { Content } from "../../content/index.ts";
import { LANGS, pagePath, type Lang } from "../site.ts";

// A2: a real link to the other language's page (works with JS off). With JS, the click carries the
// current section (#hash) across, so the visitor lands on the same section in the other language.
function keepSection(e: MouseEvent<HTMLAnchorElement>) {
  const a = e.currentTarget;
  a.href = a.pathname + window.location.hash;
}

export function LangSwitch({ lang, c }: { lang: Lang; c: Content["header"] }) {
  return (
    <nav className="seg" aria-label={c.langLabel}>
      {LANGS.map((l) =>
        l === lang ? (
          <span key={l} className="seg-item on" aria-current="page" lang={l}>
            {c.langShort[l]}
          </span>
        ) : (
          <a key={l} className="seg-item" href={pagePath(l)} hrefLang={l} lang={l} onClick={keepSection}>
            {c.langShort[l]}
          </a>
        ),
      )}
    </nav>
  );
}
