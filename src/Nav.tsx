import { useEffect, useState } from "react";
import { type Lang, pagePath } from "./site.ts";
import { contentFor } from "./content/index.ts";

const link = "inline-flex min-h-11 items-center rounded-full px-3 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald sm:px-4";

/** Floating pill nav: hidden while the hero is on screen, shown from section 2 on. */
export function Nav({ lang }: { lang: Lang }) {
  const t = contentFor(lang).nav;
  const other: Lang = lang === "en" ? "ar" : "en";
  const [shown, setShown] = useState(false);
  useEffect(() => {
    // The hero stays in view for its whole pinned scrub, so watch the section after it instead:
    // the nav shows once "familiar" has reached the viewport or scrolled past it.
    const next = document.querySelector("[data-section=familiar]");
    if (!next) return;
    const io = new IntersectionObserver(([e]) => setShown(e.isIntersecting || e.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(next);
    return () => io.disconnect();
  }, []);
  // invisible (not just transparent) while hidden, so keyboard focus cannot land on a nav nobody can see.
  return (
    <nav
      data-nav
      className={`fixed inset-x-0 top-3 z-50 mx-auto flex w-fit max-w-[calc(100vw-1.5rem)] items-center rounded-full border border-line bg-panel/80 p-1 text-sm backdrop-blur transition-[opacity,visibility] duration-200 motion-reduce:transition-none ${shown ? "opacity-100" : "pointer-events-none invisible opacity-0"}`}
    >
      <a href="#how" className={link}>{t.how}</a>
      <a href="#proof" className={link}>{t.work}</a>
      <a href="#final" className={link}>{t.book}</a>
      <a href={pagePath(other)} lang={other} hrefLang={other} className={`${link} text-ink-2`}>{t.lang}</a>
    </nav>
  );
}
