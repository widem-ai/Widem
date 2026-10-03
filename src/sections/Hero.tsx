import { useEffect, useRef, useState } from "react";
import { BASE } from "../site.ts";
import { loadManifest, type Manifest } from "../film/frames.ts";
import { FrameCanvas } from "../film/FrameCanvas.tsx";
import { useScrub } from "../film/useScrub.ts";
import { useReducedMotion } from "../film/useReducedMotion.ts";

// Scrub length in viewport heights. The wrapper reserves it (plus the one screen the hero itself fills)
// from the first render, so the page is tall enough for the browser to restore scroll before the manifest loads.
const SCRUB_LENGTH = 3;

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [progress, setProgress] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => { loadManifest(BASE, "hero").then(setManifest, (e: unknown) => {
      // Loud on purpose: a broken manifest must show up in the console (and the check's error gate).
      console.error("hero: manifest failed to load:", e);
      setManifest(null);
    }); }, []);
  useScrub(ref, setProgress, { enabled: manifest !== null && !reduce, length: SCRUB_LENGTH });
  const base = `${BASE}film/hero/`;
  return (
    <div data-hero-scroll style={reduce ? undefined : { height: `${(SCRUB_LENGTH + 1) * 100}vh` }}>
      <section ref={ref} data-section="hero" className="relative h-screen overflow-hidden">
        {manifest && <img data-poster="hero" src={base + manifest.poster} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        {manifest && !reduce && <FrameCanvas manifest={manifest} base={base} progress={progress} />}
      </section>
    </div>
  );
}
