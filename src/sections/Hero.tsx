import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Fragment, useRef } from "react";
import type { Content } from "../../content/index.ts";
import { MOTION_OK, number, REDUCED, token } from "../motion/env.ts";
import { observeSize } from "../scroll/measure.ts";
import { assetPath } from "../site.ts";
import type { FilmSet, HeroFilm } from "./heroFilm.ts";

gsap.registerPlugin(useGSAP, ScrollTrigger);

// Hero (hero-cinematic, 2026-10-01; storyboard: vault output/widem-website/design/hero-cinematic/storyboard.md):
// a short film rendered in Blender ("the core": a gold, glass-windowed chip on a dark board, film light and haze),
// scrubbed by the scroll while the hero is pinned. The visitor's scroll is the playhead:
//   0%      the poster: the key light has found the core; headline, subline and button are on screen.
//   5-15%   the camera descends; the text steps aside; the die wakes behind the glass.
//   15-60%  a low glide across the traces as power runs out from the core (no text: the picture carries it).
//   60-85%  the camera rises to the hero angle; the headline locks back in word by word, then subline and button.
//   85-100% the light falls away to the page's ground; the page releases.
// Poster first: frame 0 of the film (art/export.py writes both from the same master) is the first paint and the whole
// hero with reduced motion, JS off or a weak device (2 cores or fewer, 2 GB or less, Save-Data). The film
// (heroFilm.ts, no library) loads after the page's load event and fades in over the poster; the page never waits.
// The headline is always the real <h1> (HTML text, never drawn into the frames).
// Contract with the header: <html data-stage> is "intro" while the pinned story runs, "site" after it; unset when
// there is no pinned story (reduced motion, JS off). ARCHITECTURE §3.
// Portrait screens get the tall poster and the tall film; the same query is used by the preload links
// (src/shell/document.ts).
export const PHONE = "(orientation: portrait)";
export const POSTER = { wide: { w: 1280, h: 720 }, tall: { w: 540, h: 960 } } as const;

type FilmHost = HTMLElement & { __film?: HeroFilm | null; __sceneState?: string; __p?: number };

/** A device we do not ask to stream the film: it keeps the poster (the text story still runs over it). */
function weakDevice(): boolean {
  const n = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  return (n.hardwareConcurrency ?? 8) <= 2 || (n.deviceMemory ?? 8) <= 2 || !!n.connection?.saveData;
}

export function Hero({ c }: { c: Content["hero"] }) {
  const scope = useRef<HTMLElement>(null);
  const full = `${c.headlineBefore} ${c.headlineWord} ${c.headlineAfter}`;
  const words = full.split(" ");

  useGSAP(
    () => {
      const hero = scope.current as FilmHost | null;
      if (!hero) return;
      const q = gsap.utils.selector(hero);
      const root = document.documentElement;
      const canvas = q(".hero-scene")[0] as HTMLCanvasElement;
      let film: HeroFilm | null = null, alive = true, stopSize = () => {};
      const view = { p: 0 };
      const push = () => { hero.__p = view.p; film?.set(view.p); };

      const startFilm = async () => {
        hero.__sceneState = "loading";
        let mod: typeof import("./heroFilm.ts");
        try { mod = await import("./heroFilm.ts"); } catch { hero.__sceneState = "failed-load"; return; }
        if (!alive) return;
        const set: FilmSet = matchMedia(PHONE).matches ? "tall" : "wide";
        film = mod.createHeroFilm({
          canvas, set, url: (s, i) => assetPath(`hero/film/${s}/${String(i).padStart(3, "0")}.webp`),
          onFirst: () => { canvas.classList.add("on"); hero.classList.add("scene-on"); hero.__sceneState = "running"; },
        });
        hero.__film = film;
        push();
        stopSize = observeSize(hero, () => {
          // the layout turned between landscape and portrait: the other set has its own camera, so swap the film
          const now: FilmSet = matchMedia(PHONE).matches ? "tall" : "wide";
          if (film && now !== film.stats.set) { film.destroy(); film = null; hero.__film = null; stopSize(); void startFilm(); }
          else film?.resize();
        });
      };
      const later = (fn: () => void) => {
        const go = () => ("requestIdleCallback" in window ? requestIdleCallback(fn, { timeout: 600 }) : setTimeout(fn, 200));
        if (document.readyState === "complete") go(); else addEventListener("load", go, { once: true });
      };

      // The stylesheet can land after this module runs (it follows the script in the head); the timeline reads its
      // timings from tokens.css, so wait for the page's load when they are not there yet.
      let mm: gsap.MatchMedia | null = null;
      const setup = () => { if (!alive) return; mm = gsap.matchMedia(hero); mm.add({ motion: MOTION_OK, reduce: REDUCED }, (ctx) => {
        if (!ctx.conditions?.motion) { hero.classList.remove("boot"); return; }

        const guide = q(".guide"), hl = q(".hl"), spans = q(".h-vis .w"), slogan = q(".slogan"), btn = q(".hero-in > .btn"), cue = q(".cue");
        const setStage = (p: number) => {
          const s = p >= 1 ? "site" : "intro";
          if (root.dataset.stage !== s) root.dataset.stage = s;
        };
        const tl = gsap.timeline({
          defaults: { ease: "none" },
          onUpdate: push,
          scrollTrigger: {
            // The pin is CSS (the track is tall and the hero sticky, site.css), so the page already has its full
            // height before any script runs: a reload mid-story keeps its place. The film only follows the track.
            trigger: hero.parentElement, start: "top top", end: "bottom bottom",
            scrub: number("--hero-scrub"), invalidateOnRefresh: true,
            onUpdate: (self) => setStage(self.progress), onRefresh: (self) => setStage(self.progress),
          },
        });
        // The film's playhead is the scroll itself (linear); the text is placed on the same 0..1 axis.
        tl.to(view, { p: 1, duration: 1 }, 0)
          .to(q(".hero-poster"), { scale: number("--hero-push"), duration: 1 }, 0) // only seen without the film
          .fromTo(guide, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.03 }, 0)
          // the descent: the text steps aside for the film
          .fromTo([hl, slogan, btn], { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: -18, duration: 0.1, ease: "power1.in" }, 0.05)
          // the reveal: the headline locks back in, word by word (never letter by letter: Arabic joins), then the rest
          .set(hl, { autoAlpha: 1, y: 0 }, 0.6)
          .fromTo(spans, { opacity: 0, y: "0.3em" }, { opacity: 1, y: 0, duration: 0.03, stagger: 0.09 / Math.max(1, spans.length), ease: "power2.out", immediateRender: false }, 0.62)
          .fromTo([slogan, btn], { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.05, stagger: 0.03, ease: "power2.out", immediateRender: false }, 0.75)
          .fromTo(cue, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.04, ease: "power2.out" }, 0.84)
          .to({}, { duration: 0.01 }, 0.99);

        hero.classList.remove("boot");
        if (weakDevice()) hero.__sceneState = "weak-device";
        else later(startFilm);
        return () => { delete root.dataset.stage; };
      }); };
      if (token("--hero-scrub")) setup(); else addEventListener("load", setup, { once: true });

      return () => {
        alive = false;
        removeEventListener("load", setup);
        mm?.revert();
        stopSize();
        film?.destroy();
        hero.__film = null;
      };
    },
    { scope },
  );

  return (
    <div className="hero-track">
    <section className="hero night boot" id="hero" aria-labelledby="h" ref={scope}>
      <div className="hero-art" aria-hidden="true">
        <picture className="hero-poster">
          <source media={PHONE} type="image/avif" srcSet={assetPath("hero/scene-tall.avif")} width={POSTER.tall.w} height={POSTER.tall.h} />
          <source media={PHONE} type="image/webp" srcSet={assetPath("hero/scene-tall.webp")} width={POSTER.tall.w} height={POSTER.tall.h} />
          <source type="image/avif" srcSet={assetPath("hero/scene-wide.avif")} width={POSTER.wide.w} height={POSTER.wide.h} />
          <img id="hero-art" src={assetPath("hero/scene-wide.webp")} width={POSTER.wide.w} height={POSTER.wide.h} alt="" decoding="async" fetchPriority="high" />
        </picture>
        <canvas className="hero-scene" aria-hidden="true" />
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
