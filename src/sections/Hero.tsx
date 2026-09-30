import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Fragment, useRef } from "react";
import type { Content } from "../../content/index.ts";
import { isRtl, MOTION_OK, number, REDUCED, token } from "../motion/env.ts";
import { observeSize } from "../scroll/measure.ts";
import { assetPath } from "../site.ts";
import type { HeroScene } from "./heroScene.ts";

gsap.registerPlugin(useGSAP, ScrollTrigger);

// Hero (Mohannad, 2026-10-01: "keep the one that looked like a 3D model"): the three.js circuit world of sketch v2.
// The headline lies on the board as copper traces; while the hero is pinned, the camera flies low past the words and
// each one powers on in reading order; then the camera settles above the board with the headline lit, and the
// subline, button and cue arrive. ARCHITECTURE §3.
// Poster first: a still of that world at rest (rendered from the scene by scripts/poster.mjs) is the first paint and
// the whole hero with reduced motion, JS off, no WebGL or a weak device; there the headline is the HTML <h1> over it.
// The scene (heroScene.ts, three.js) is imported after first paint and fades in over the poster; the page never waits.
// The real headline is always the <h1>; the canvas is aria-hidden.
// Contract with the header: <html data-stage> is "intro" while the pinned story runs, "site" after it; unset when
// there is no pinned story (reduced motion, JS off). ARCHITECTURE §3.
// Portrait screens get the tall poster; the same query is used by the preload links (src/shell/document.ts).
export const PHONE = "(orientation: portrait)";
export const POSTER = { wide: { w: 1680, h: 945 }, tall: { w: 900, h: 1600 } } as const;

type SceneHost = HTMLElement & { __scene?: HeroScene | null; __sceneState?: string };

/** A device we do not ask to run the scene: it keeps the poster (with the light word-by-word motion). */
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
      const hero = scope.current as SceneHost | null;
      if (!hero) return;
      const q = gsap.utils.selector(hero);
      const root = document.documentElement;
      const canvas = q(".hero-scene")[0] as HTMLCanvasElement;
      const h1 = q("h1")[0] as HTMLElement;
      const spans = q(".h-vis .w") as HTMLElement[];
      let scene: HeroScene | null = null, alive = true, stopSize = () => {};
      const view = { cam: 0, on: true };
      const wp: Record<string, number> = {};
      spans.forEach((_, i) => (wp[`w${i}`] = 0));
      const wpArr = () => spans.map((_, i) => wp[`w${i}`]);
      const push = () => scene?.set(view.cam, wpArr());

      // The scene, after first paint and only when motion is allowed (or for the poster renderer).
      const posterShot = new URLSearchParams(location.search).has("poster");
      const startScene = async () => {
        hero.__sceneState = "loading";
        const family = getComputedStyle(h1).fontFamily;
        await Promise.race([document.fonts?.load(`600 160px ${family}`, full), new Promise((r) => setTimeout(r, 3000))]).catch(() => {});
        let mod: typeof import("./heroScene.ts");
        try { mod = await import("./heroScene.ts"); } catch { hero.__sceneState = "failed-load"; return; }
        if (!alive) return;
        scene = mod.createHeroScene({ canvas, words, rtl: isRtl(), family, poster: posterShot });
        hero.__scene = scene;
        if (!scene) { hero.__sceneState = "no-webgl"; return; }
        hero.__sceneState = "running";
        if (!posterShot) push(); // the poster stays at rest
        scene.setVisible(view.on);
        stopSize = observeSize(hero, () => scene?.resize());
      };
      const onReady = () => hero.classList.add("scene-on");
      const onLost = () => hero.classList.remove("scene-on");
      canvas.addEventListener("scene-ready", onReady);
      canvas.addEventListener("scene-lost", onLost);
      const later = (fn: () => void) => {
        const go = () => ("requestIdleCallback" in window ? requestIdleCallback(fn, { timeout: 600 }) : setTimeout(fn, 200));
        if (document.readyState === "complete") go(); else addEventListener("load", go, { once: true });
      };

      // The stylesheet can land after this module runs (it follows the script in the head); the timeline reads its
      // timings from tokens.css, so wait for the page's load when they are not there yet.
      let mm: gsap.MatchMedia | null = null;
      const setup = () => { if (!alive) return; mm = gsap.matchMedia(hero); mm.add({ motion: MOTION_OK, reduce: REDUCED }, (ctx) => {
        if (!ctx.conditions?.motion) {
          hero.classList.remove("boot");
          if (posterShot) later(startScene);
          return;
        }

        const guide = q(".guide"), rising = [q(".slogan"), q(".hero-in > .btn"), q(".cue")];
        // Word timing: in reading order, spread by length across the camera's flight (the flight is 90% of the
        // story; the last tenth brings in the subline, button and cue, then a short rest before the page releases).
        const total = words.reduce((a, w) => a + w.length, 0);
        let acc = 0;
        const at = words.map((w) => { const t = 0.9 * (0.05 + (acc / total) * 0.76); acc += w.length; return t; });
        const dur = 0.09;
        const setStage = (p: number) => {
          const s = p >= 1 ? "site" : "intro";
          if (root.dataset.stage !== s) root.dataset.stage = s;
        };
        const tl = gsap.timeline({
          defaults: { ease: "none" },
          onUpdate: push,
          scrollTrigger: {
            // The pin is CSS (the track is tall and the hero sticky, site.css), so the page already has its full
            // height before any script runs: a reload mid-story keeps its place. The scene only follows the track.
            trigger: hero.parentElement, start: "top top", end: "bottom bottom",
            scrub: number("--hero-scrub"), invalidateOnRefresh: true,
            onUpdate: (self) => setStage(self.progress), onRefresh: (self) => setStage(self.progress),
          },
        });
        tl.to(view, { cam: 1, duration: 0.9 }, 0)
          .to(q(".hero-poster"), { scale: number("--hero-push"), duration: 1 }, 0)
          .fromTo(guide, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.03 }, 0);
        spans.forEach((span, i) => {
          tl.fromTo(wp, { [`w${i}`]: 0 }, { [`w${i}`]: 1, duration: dur }, at[i])
            .fromTo(span, { opacity: 0 }, { opacity: 1, duration: dur * 0.5, ease: "power1.in" }, at[i] + dur * 0.55);
        });
        rising.forEach((el, i) => tl.fromTo(el, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.05, ease: "power2.out" }, 0.88 + i * 0.03));
        tl.to({}, { duration: 0.02 }, 0.98);
        // Draw only while the hero is on screen.
        const seen = ScrollTrigger.create({ trigger: hero.parentElement, start: "top bottom", end: "bottom top",
          onToggle: (self) => { view.on = self.isActive; scene?.setVisible(self.isActive); } });

        hero.classList.remove("boot");
        if (weakDevice()) hero.__sceneState = "weak-device";
        else later(startScene);
        return () => { seen.kill(); delete root.dataset.stage; };
      }); };
      if (token("--hero-scrub")) setup(); else addEventListener("load", setup, { once: true });

      return () => {
        alive = false;
        removeEventListener("load", setup);
        mm?.revert();
        stopSize();
        canvas.removeEventListener("scene-ready", onReady);
        canvas.removeEventListener("scene-lost", onLost);
        scene?.destroy();
        hero.__scene = null;
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
        <canvas className="hero-scene" />
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
