import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Fragment, useRef } from "react";
import type { Content } from "../../content/index.ts";
import { isRtl, MOTION_OK, number, REDUCED, seconds } from "../motion/env.ts";
import { inlineBoxes, observeSize } from "../scroll/measure.ts";
import { assetPath } from "../site.ts";
import { wordContours } from "./heroTraces.ts";

gsap.registerPlugin(useGSAP, ScrollTrigger);

// Hero v3 (Mohannad, 2026-10-01): the circuit-city image (concept C) with the headline etched into its dark
// sky as circuit traces. The hero is pinned (sticky) for --hero-pin screens; as the visitor scrolls, each word powers on in
// reading order (light runs around every letter, then the letter fills), the image is pushed in slowly, and at
// the end the subline, button and cue appear and the page releases. A small guide at the start says to scroll.
// Poster: the image with the headline fully lit, which is also the reduced-motion and JS-off state.
// The real headline is the <h1> (HTML text); the traces are an aria-hidden SVG drawn from the same words.
// Contract with the header: <html data-stage> is "intro" while the pinned story runs, "site" after it;
// unset when there is no pinned story (reduced motion, JS off). ARCHITECTURE §3.
// The tall crop (9:16) replaces the wide one on portrait screens. The same query is used by the preload
// links in the page head (src/shell/document.ts). Sizes are the exported files' (art/export.py).
export const PHONE = "(orientation: portrait)";
export const ART = { desktop: { w: 1680, h: 945 }, phone: { w: 900, h: 1600 } } as const;

export function Hero({ c }: { c: Content["hero"] }) {
  const scope = useRef<HTMLElement>(null);
  const full = `${c.headlineBefore} ${c.headlineWord} ${c.headlineAfter}`;
  const words = full.split(" ");

  useGSAP(
    () => {
      const hero = scope.current;
      if (!hero) return;
      const q = gsap.utils.selector(hero);
      const root = document.documentElement;

      // The traces, in every mode with JS (reduced motion shows them fully lit). Built once the real font is in,
      // and again whenever the headline's size changes (resize, rotate), from layout boxes (src/scroll).
      const hl = q(".hl")[0] as HTMLElement, h1 = q("h1")[0] as HTMLElement;
      const spans = q(".h-vis .w") as HTMLElement[], groups = [...hero.querySelectorAll<SVGGElement>(".tw")];
      let frame = 0, stopSize = () => {}, alive = true;
      const build = () => {
        frame = 0;
        const cs = getComputedStyle(h1);
        const style = { font: `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`, letterSpacing: cs.letterSpacing, rtl: isRtl() };
        inlineBoxes(spans).forEach((box, i) => {
          const loops = wordContours(spans[i].textContent ?? "", box, style);
          const layer = (cls: string) => loops.map((d) => `<path class="${cls}" pathLength="1" d="${d}"/>`).join("");
          groups[i].innerHTML = `<path class="i" d="${loops.join("")}"/>${layer("g")}${layer("l")}${layer("r")}`;
        });
        hero.classList.add("traced");
      };
      (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
        if (!alive) return;
        stopSize = observeSize(hl, () => { if (!frame) frame = requestAnimationFrame(build); });
      });

      const mm = gsap.matchMedia(hero);
      mm.add({ motion: MOTION_OK, reduce: REDUCED }, (ctx) => {
        if (!ctx.conditions?.motion) {
          hero.classList.remove("boot");
          return;
        }

        const guide = q(".guide"), rising = [q(".slogan"), q(".hero-in > .btn"), q(".cue")];
        const n = spans.length;
        // Word timing inside the pinned story (timeline length 1): words from 4% to 80%, each overlapping the next.
        const gap = 0.76 / (n - 1 + 2.2), dur = gap * 2.2;
        const setStage = (p: number) => {
          const s = p >= 1 ? "site" : "intro";
          if (root.dataset.stage !== s) root.dataset.stage = s;
        };
        const tl = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: {
            // The pin is CSS (the track is tall and the hero sticky, site.css), so the page already has its full
            // height before any script runs: a reload mid-story keeps its place. The scene only follows the track.
            trigger: hero.parentElement, start: "top top", end: "bottom bottom",
            scrub: number("--hero-scrub"), invalidateOnRefresh: true,
            onUpdate: (self) => setStage(self.progress), onRefresh: (self) => setStage(self.progress),
          },
        });
        tl.to(q(".hero-art"), { scale: number("--hero-push"), duration: 1 }, 0)
          .fromTo(guide, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.03 }, 0);
        groups.forEach((g, i) => {
          const at = 0.04 + i * gap;
          tl.fromTo(g, { "--d": 1 }, { "--d": 0, duration: dur, ease: "power1.inOut" }, at)
            .fromTo(spans[i], { opacity: 0 }, { opacity: 1, duration: dur * 0.5, ease: "power1.in" }, at + dur * 0.55);
        });
        rising.forEach((el, i) => tl.fromTo(el, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.06, ease: "power2.out" }, 0.82 + i * 0.03));
        tl.to({}, { duration: 0.06 }, 0.94); // a short rest with everything lit before the page releases

        hero.classList.remove("boot");
        gsap.from(q(".hero-art img"), { scale: number("--hero-settle-from"), duration: seconds("--hero-settle"), ease: "power2.out" });
        return () => { delete root.dataset.stage; };
      });

      return () => {
        alive = false;
        stopSize();
        if (frame) cancelAnimationFrame(frame);
      };
    },
    { scope },
  );

  return (
    <div className="hero-track">
    <section className="hero night boot" id="hero" aria-labelledby="h" ref={scope}>
      <div className="hero-art" aria-hidden="true">
        <picture>
          <source media={PHONE} type="image/avif" srcSet={assetPath("hero/phone.avif")} width={ART.phone.w} height={ART.phone.h} />
          <source media={PHONE} type="image/webp" srcSet={assetPath("hero/phone.webp")} width={ART.phone.w} height={ART.phone.h} />
          <source type="image/avif" srcSet={assetPath("hero/desktop.avif")} width={ART.desktop.w} height={ART.desktop.h} />
          <img id="hero-art" src={assetPath("hero/desktop.webp")} width={ART.desktop.w} height={ART.desktop.h} alt="" decoding="async" fetchPriority="high" />
        </picture>
      </div>
      <div className="hero-in">
        <div className="hl">
          <h1 id="h" className="hl-text">
            <span className="sr">{full}</span>
            <span className="h-vis" aria-hidden="true">
              {words.map((w, i) => (
                <Fragment key={i}>
                  {i ? " " : ""}
                  <span className="w">{w}</span>
                </Fragment>
              ))}
            </span>
          </h1>
          <svg className="traces" aria-hidden="true" focusable="false">
            {words.map((_, i) => <g key={i} className="tw" />)}
          </svg>
        </div>
        <p className="slogan">{c.subhead}</p>
        <a className="btn" href="#book">
          {c.cta}
        </a>
      </div>
      <p className="cue-wrap">
        <a className="cue" href="#story">
          {c.cue}
        </a>
      </p>
      <p className="guide" aria-hidden="true">
        <span className="guide-line"><i /></span>
        {c.guide}
      </p>
    </section>
    </div>
  );
}
