import { useEffect, useState } from "react";
import { type Lang, pagePath } from "./site.ts";
import { contentFor } from "./content/index.ts";

const link = "inline-flex min-h-11 items-center rounded-full px-3 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald sm:px-4";

/** Floating pill nav: hidden over the hero, shown once "familiar" passes mid-screen. */
export function Nav({ lang }: { lang: Lang }) {
  const t = contentFor(lang).nav;
  const other: Lang = lang === "en" ? "ar" : "en";
  const [shown, setShown] = useState(false);
  useEffect(() => {
    // Position, not edge: watch the hero wrapper, which runs from the page top to the top of "familiar".
    // The nav shows once that boundary is above the middle of the viewport. Because the observed box is
    // contiguous from y=0, any jump across the line (scrollbar drag, find-in-page, scrollIntoView, a restored
    // scroll) flips its intersection state, which an observer on "familiar" alone could miss.
    // The mid-screen line also keeps the nav hidden when the reduced-motion hero is exactly one screen tall.
    const hero = document.querySelector("[data-hero-scroll]");
    if (!hero) { console.error("nav: [data-hero-scroll] missing, nav stays hidden"); return; }
    const io = new IntersectionObserver(([e]) => setShown(!e.isIntersecting), { rootMargin: "-50% 0px 0px 0px", threshold: 0 });
    io.observe(hero);
    return () => io.disconnect();
  }, []);
  // invisible (not just transparent) while hidden, so keyboard focus cannot land on a nav nobody can see.
  return (
    <>
    {/* First Tab stop: the nav is hidden over the hero, so a keyboard user needs a way past the film. It hides once the nav shows, so it never sits over it. */}
    <a data-skip href="#familiar" className={`fixed start-3 top-3 z-[60] inline-flex min-h-11 -translate-y-24 items-center rounded-full border border-line bg-panel px-4 text-sm focus:translate-y-0 ${shown ? "invisible" : ""} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald motion-safe:transition-transform motion-safe:duration-150`}>{t.skip}</a>
    <nav
      data-nav
      className={`fixed inset-x-0 top-3 z-50 mx-auto flex w-fit max-w-[calc(100vw-1.5rem)] items-center rounded-full border border-line bg-panel/80 p-1 text-sm backdrop-blur transition-[opacity,visibility] duration-200 motion-reduce:transition-none ${shown ? "opacity-100" : "pointer-events-none invisible opacity-0"}`}
    >
      <a href="#how" className={link}>{t.how}</a>
      <a href="#proof" className={link}>{t.work}</a>
      <a href="#final" className={link}>{t.book}</a>
      <a href={pagePath(other)} lang={other} hrefLang={other} className={`${link} text-ink-2`}>{t.lang}</a>
    </nav>
    </>
  );
}
