import { useEffect, useRef } from "react";
import { frameAt, frameUrl, type Manifest } from "./frames.ts";

// Frames are drawn at most at 2x device pixels: sharper buys nothing visible and costs memory per draw.
const DPR_CAP = 2;

/** Draws the frame for `progress`, cover-fitted. Keeps the last good frame when one fails to load. */
export function FrameCanvas({ manifest, base, progress }: { manifest: Manifest; base: string; progress: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const images = useRef<(HTMLImageElement | null)[]>([]);
  // The frame the scroll position asks for right now; a late image load may only draw this one.
  const wanted = useRef(0);

  // The latest progress, read when loading starts. The scrub reports a restored scroll position one
  // synchronous render after this canvas mounts, so loading waits one task for it.
  const latest = useRef(progress);
  latest.current = progress;

  useEffect(() => {
    images.current = [];
    const start = setTimeout(() => {
      // Request the frame the scroll position needs first, then outward from it: on a slow network, index
      // order would leave a mid-page reload waiting behind every earlier frame.
      const first = frameAt(latest.current, manifest.frames);
      const order = Array.from({ length: manifest.frames }, (_, i) => i).sort((a, b) => Math.abs(a - first) - Math.abs(b - first) || a - b);
      const list: (HTMLImageElement | null)[] = new Array(manifest.frames).fill(null);
      images.current = list;
      for (const i of order) {
        const img = new Image();
        img.decoding = "async";
        if (i === first) img.fetchPriority = "high";
        img.onload = () => draw(i); // draws only if it is still the frame the scroll asks for
        img.onerror = () => { images.current[i] = null; };
        img.src = frameUrl(base, manifest, i);
        list[i] = img;
      }
    }, 0);
    return () => clearTimeout(start);
  }, [manifest, base]);

  const draw = (index: number) => {
    const c = canvas.current;
    const img = images.current[index];
    if (!c || index !== wanted.current || !img || !img.complete || img.naturalWidth === 0) return;
    const ctx = c.getContext("2d")!;
    const dpr = Math.min(devicePixelRatio, DPR_CAP);
    c.width = c.clientWidth * dpr;
    c.height = c.clientHeight * dpr;
    const s = Math.max(c.width / img.naturalWidth, c.height / img.naturalHeight);
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    ctx.drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h);
    c.dataset.frame = String(index);
    c.style.opacity = "1";
  };

  useEffect(() => {
    const index = frameAt(progress, manifest.frames);
    wanted.current = index;
    const img = images.current[index];
    const onLoad = () => draw(index);
    if (img && !img.complete) img.addEventListener("load", onLoad, { once: true });
    draw(index);
    // A fast fling leaves earlier frames still loading; they must not paint over the current one.
    return () => img?.removeEventListener("load", onLoad);
  }, [progress, manifest]);

  // A resize or rotation changes the canvas box; redraw the current frame at the new size.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ro = new ResizeObserver(() => draw(wanted.current));
    ro.observe(c);
    return () => ro.disconnect();
  }, [manifest]);

  return <canvas ref={canvas} data-film={manifest.id} className="absolute inset-0 h-full w-full opacity-0" />;
}
