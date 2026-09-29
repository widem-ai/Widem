import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { useRef, useState } from "react";
import type { Content } from "../../content/index.ts";
import { isRtl, MOTION_OK, REDUCED, seconds } from "../motion/env.ts";
import { createCircuit } from "./hero/circuit.ts";

gsap.registerPlugin(useGSAP);

// The hero scene, ported from the v5 prototype: circuit background with a power-on wave, the headline
// lighting up from an unlit outline (scan line + halo), subhead/button/cue rising in, then the rotating
// word with its gold glint. One GSAP context (useGSAP + matchMedia) owns all of it and its cleanup.
// Reduced motion: final state at once, circuit drawn still, word fixed. JS off: the static markup below.
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
      const canvas = q(".circuit")[0] as HTMLCanvasElement;

      const mm = gsap.matchMedia(hero);
      mm.add({ motion: MOTION_OK, reduce: REDUCED }, (ctx) => {
        const motion = Boolean(ctx.conditions?.motion);
        const circuit = createCircuit(canvas, motion);

        if (!motion) {
          hero.classList.remove("boot");
          setWordIndex(0);
          return () => circuit.destroy();
        }

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
          circuit.startWave();

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
          circuit.destroy();
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
    <section className="hero boot" id="hero" aria-labelledby="h" ref={scope}>
      <canvas className="circuit" id="circuit" aria-hidden="true" />
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
        <a className="cue" href="#story">
          {c.cue}
        </a>
      </div>
    </section>
  );
}
