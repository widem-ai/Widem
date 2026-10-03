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

  useEffect(() => {
    images.current = Array.from({ length: manifest.frames }, (_, i) => {
      const img = new Image();
      img.decoding = "async";
      img.src = frameUrl(base, manifest, i);
      img.onerror = () => { images.current[i] = null; };
      return img;
    });
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
