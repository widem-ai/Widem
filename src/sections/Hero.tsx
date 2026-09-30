import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useRef, useState } from "react";
import type { Content } from "../../content/index.ts";
import { isRtl, MOTION_OK, number, REDUCED, seconds } from "../motion/env.ts";
import { assetPath } from "../site.ts";

gsap.registerPlugin(useGSAP, ScrollTrigger);

// The hero scene: one art-directed image (the circuit city at night, concept C) anchored to the bottom of
// the hero, with the headline in the dark sky above it. On load the image settles back a little while the
// headline lights up from an unlit outline (scan line + halo), the subhead/button/cue rise in, then the
// word rotates with its gold glint. On scroll the image is pushed in slowly and the text lifts away.
// One GSAP context (useGSAP + matchMedia) owns all of it and its cleanup.
// Reduced motion: final state at once, image still, word fixed. JS off: the static markup below.
// The image is decorative (alt=""): it carries no information the text does not.
// The tall crop (9:16) replaces the wide one on portrait screens. The same query is used by the preload
// links in the page head (src/shell/document.ts). Sizes are the exported files' (art/export.py).
export const PHONE = "(orientation: portrait)";
export const ART = { desktop: { w: 1680, h: 945 }, phone: { w: 900, h: 1600 } } as const;

export function Hero({ c }: { c: Content["hero"] }) {
  const scope = useRef<HTMLElement>(null);
  const rotated = useRef(false);
  const words = [c.headlineWord, ...c.moreWords];
  const [wordIndex, setWordIndex] = useState(0);
  const word = words[wordIndex];
  const full = `${c.headlineBefore} ${c.headlineWord} ${c.headlineAfter}`;

  useGSAP(
    () => {
      const hero = scope.current;
      if (!hero) return;
      const q = gsap.utils.selector(hero);

      const mm = gsap.matchMedia(hero);
      mm.add({ motion: MOTION_OK, reduce: REDUCED }, (ctx) => {
        const motion = Boolean(ctx.conditions?.motion);

        if (!motion) {
          hero.classList.remove("boot");
          setWordIndex(0);
          return;
        }

        // Scroll: the image is pushed in and the text lifts away, tied to the hero leaving the screen.
        // Two elements so the two motions never fight: the wrapper takes the scroll, the image the settle.
        gsap.timeline({ scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true } })
          .to(q(".hero-art"), { scale: number("--hero-push"), ease: "none" }, 0)
          .to(q(".hero-in"), { yPercent: number("--hero-lift"), opacity: number("--hero-lift-fade"), ease: "none" }, 0)
          .to(q(".cue-wrap"), { opacity: 0, ease: "none", duration: 0.25 }, 0);

        let alive = true;
        const start = ctx.add("start", () => {
          const T = {
            delay: seconds("--hero-boot-delay"), power: seconds("--hero-power"), rise: seconds("--hero-rise"),
            wordStart: seconds("--hero-word-start"), hold: seconds("--hero-word-hold"), out: seconds("--hero-word-out"),
            sweep: seconds("--hero-sweep"), rest: seconds("--hero-sweep-rest"), fallback: seconds("--hero-fallback"),
          };
          const rtl = isRtl();
          const h1 = q(".hl h1"), outline = q(".hl-outline"), glow = q(".hl-glow"), scan = q(".hl-scan");
          const rising = [q(".slogan"), q(".hero-in > .btn"), q(".cue")];

          // If the page took so long that the CSS fallback already showed the hero, don't dim it again.
          const late = performance.now() / 1000 > T.fallback - 0.2;
          if (late) {
            gsap.set(outline, { autoAlpha: 0 });
          } else {
            // Take over the boot state from CSS as inline styles, then drop the class.
            gsap.set(h1, { opacity: 0 });
            gsap.set(outline, { autoAlpha: 1 });
            gsap.set([glow, scan], { autoAlpha: 0 });
            gsap.set(scan, { xPercent: 0 });
            gsap.set(rising, { opacity: 0, y: 10 });
          }
          hero.classList.remove("boot");
          if (!late) gsap.from(q(".hero-art img"), { scale: number("--hero-settle-from"), duration: seconds("--hero-settle"), ease: "power2.out" });

          if (!late) {
            const lit = T.power * 0.55; // the prototype's glow peak: 55% through the power-on
            const powerEase = "power3.inOut";
            gsap.timeline({ delay: T.delay })
              .to(outline, { autoAlpha: 0, duration: lit, ease: powerEase }, 0)
              .to(h1, { opacity: 1, duration: lit, ease: powerEase }, 0)
              .to(glow, { autoAlpha: 1, duration: lit, ease: "power2.in" }, 0)
              .to(glow, { autoAlpha: 0, duration: T.power - lit, ease: "power2.out" }, lit)
              .to(scan, { xPercent: rtl ? -100 : 100, duration: T.power, ease: powerEase }, 0)
              .to(scan, { autoAlpha: 1, duration: T.power * 0.1 }, 0)
              .to(scan, { autoAlpha: 0, duration: T.power * 0.1 }, T.power * 0.9)
              .to(rising[0], { opacity: 1, y: 0, duration: T.rise, ease: "expo.out" }, 0.9)
              .to(rising[1], { opacity: 1, y: 0, duration: T.rise, ease: "expo.out" }, 1.1)
              .to(rising[2], { opacity: 1, y: 0, duration: T.rise, ease: "expo.out" }, 1.4);
          }

          // The word: out every `hold` seconds, then React swaps the text and the effect below brings it in.
          gsap.timeline({ delay: late ? 0 : T.wordStart, repeat: -1, repeatDelay: T.hold - T.out })
            .to(q(".rot"), { opacity: 0, y: "-0.3em", duration: T.out, ease: "power1.in",
              onComplete: () => setWordIndex((i) => (i + 1) % words.length) });

          // The gold glint: the window slides one way, the gold copy inside it the other way.
          const along = rtl ? 1 : -1; // toward the inline start, as the prototype's sweep travelled
          gsap.timeline({ delay: late ? 0 : T.delay + T.power, repeat: -1, repeatDelay: T.rest })
            .set(q(".glint"), { opacity: 1 })
            .fromTo(q(".glint"), { xPercent: -110 * along }, { xPercent: 110 * along, duration: T.sweep, ease: "none" }, 0)
            .fromTo(q(".glint i"), { xPercent: 110 * along }, { xPercent: -110 * along, duration: T.sweep, ease: "none" }, 0)
            .set(q(".glint"), { opacity: 0 });
        });

        // Power on once the real font is in, so the outline and the lit text line up (playbook §5 trap).
        (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => { if (alive) start(); });
        return () => {
          alive = false;
          setWordIndex(0);
        };
      });
    },
    { scope },
  );

  // Bring each new word in. Skipped on the first render: the first word arrives with the power-on.
  useGSAP(
    () => {
      if (wordIndex === 0 && !rotated.current) return;
      rotated.current = true;
      gsap.fromTo(".rot", { opacity: 0, y: "0.35em" }, { opacity: 1, y: 0, duration: seconds("--hero-word-in"), ease: "power3.out" });
    },
    { scope, dependencies: [wordIndex] },
  );

  return (
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
              {c.headlineBefore}{" "}
              <span className="rot">
                {word}
                <span className="glint">
                  <i data-word={word} />
                </span>
              </span>{" "}
              {c.headlineAfter}
            </span>
          </h1>
          <p className="hl-text hl-fx hl-outline" aria-hidden="true">
            {c.headlineBefore} <span className="slot">{c.headlineWord}</span> {c.headlineAfter}
          </p>
          <p className="hl-text hl-fx hl-glow" aria-hidden="true">
            {c.headlineBefore} <span className="slot">{c.headlineWord}</span> {c.headlineAfter}
          </p>
          <span className="hl-fx hl-scan" aria-hidden="true">
            <i />
          </span>
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
    </section>
  );
}
