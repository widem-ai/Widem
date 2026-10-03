import { useEffect, useRef, useState } from "react";
import { BASE } from "../site.ts";
import { loadManifest, type Manifest } from "../film/frames.ts";
import { FrameCanvas } from "../film/FrameCanvas.tsx";
import { useScrub } from "../film/useScrub.ts";

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [progress, setProgress] = useState(0);
  useEffect(() => { loadManifest(BASE, "hero").then(setManifest, () => setManifest(null)); }, []);
  useScrub(ref, setProgress, { enabled: manifest !== null, length: 3 });
  const base = `${BASE}film/hero/`;
  return (
    <section ref={ref} data-section="hero" className="relative h-screen overflow-hidden">
      {manifest && <img data-poster="hero" src={base + manifest.poster} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      {manifest && <FrameCanvas manifest={manifest} base={base} progress={progress} />}
    </section>
  );
}
