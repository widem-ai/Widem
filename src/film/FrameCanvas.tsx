import { useEffect, useRef } from "react";
import { frameAt, frameUrl, nearestLoaded, requestOrder, type Manifest } from "./frames.ts";

// Frames are drawn at most at 2x device pixels: sharper buys nothing visible and costs memory per draw.
const DPR_CAP = 2;
// Requests in flight at once. We hold the queue ourselves (not the browser) so it can be re-ordered when the
// visitor jumps; four keeps a fast connection busy while a jump waits behind at most a few small frames.
const MAX_IN_FLIGHT = 4;
// A failed frame is tried again twice, after 400 ms then 800 ms, then left until the scroll comes back to it.
const RETRIES = 2;
const BACKOFF_MS = 400;
// A frame this close to the one the scroll asks for reads as the right one.
const NEAR = 1;
// Requests this close to the wanted frame are never cancelled by a re-order (no churn while scrolling slowly).
const KEEP = 2;

type Slot = { img: HTMLImageElement | null; state: "idle" | "loading" | "ok" | "failed"; tries: number; notBefore: number };

/** Draws the frame for `progress`, cover-fitted; while it is missing, the nearest loaded frame. */
export function FrameCanvas({ manifest, base, progress }: { manifest: Manifest; base: string; progress: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const slots = useRef<Slot[]>([]);
  // The frame the scroll position asks for right now.
  const wanted = useRef(0);
  const loader = useRef<{ want: (i: number) => void } | null>(null);

  // The latest progress, read when loading starts. The scrub reports a restored scroll position one
  // synchronous render after this canvas mounts, so loading waits one task for it.
  const latest = useRef(progress);
  latest.current = progress;

  useEffect(() => {
    const list: Slot[] = Array.from({ length: manifest.frames }, () => ({ img: null, state: "idle", tries: 0, notBefore: 0 }));
    slots.current = list;
    let dead = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const abort = (s: Slot) => {
      if (s.state !== "loading" || !s.img) return;
      s.img.onload = s.img.onerror = null;
      s.img.src = ""; // cancels the request in flight
      s.img = null;
      s.state = "idle";
    };

    // Keeps the requests in flight on the frames nearest the one the scroll asks for. Runs on every load,
    // failure and change of the wanted frame, so a jump re-orders the queue around the new position.
    const pump = () => {
      if (dead) return;
      clearTimeout(timer);
      const w = wanted.current, now = performance.now();
      // Until a frame near the wanted one is loaded, the wanted frame has the line to itself.
      const nearOk = list.some((s, i) => s.state === "ok" && Math.abs(i - w) <= NEAR);
      const limit = nearOk ? MAX_IN_FLIGHT : 1;
      const desired = requestOrder(w, list.length, (i) => {
        const s = list[i];
        return !(s.state === "loading" || (s.state === "idle" && s.notBefore <= now));
      }).slice(0, limit);
      list.forEach((s, i) => { if (!desired.includes(i) && Math.abs(i - w) > KEEP) abort(s); });
      let inFlight = list.filter((s) => s.state === "loading").length;
      for (const i of desired) {
        const s = list[i];
        if (s.state !== "idle" || (inFlight >= limit && i !== w)) continue;
        const img = new Image();
        img.decoding = "async";
        if (i === w) img.fetchPriority = "high";
        img.onload = () => { s.state = "ok"; draw(); pump(); };
        img.onerror = () => {
          s.img = null;
          s.tries += 1;
          if (s.tries > RETRIES) s.state = "failed";
          else { s.state = "idle"; s.notBefore = performance.now() + BACKOFF_MS * 2 ** (s.tries - 1); }
          pump();
        };
        s.img = img; s.state = "loading"; inFlight++;
        img.src = frameUrl(base, manifest, i);
      }
      // Wake up for the earliest retry still waiting out its backoff.
      const waits = list.filter((s) => s.state === "idle" && s.notBefore > now).map((s) => s.notBefore - now);
      if (waits.length) timer = setTimeout(pump, Math.min(...waits));
    };

    const start = setTimeout(() => {
      wanted.current = frameAt(latest.current, manifest.frames);
      loader.current = {
        want: (i) => {
          // Coming back to a frame that gave up asks for it again, with a fresh set of retries.
          for (let j = i - NEAR; j <= i + NEAR; j++) {
            const s = list[j];
            if (s?.state === "failed") { s.state = "idle"; s.tries = 0; s.notBefore = 0; }
          }
          pump();
        },
      };
      pump();
    }, 0);
    return () => {
      dead = true;
      clearTimeout(start); clearTimeout(timer);
      list.forEach(abort);
      loader.current = null;
    };
  }, [manifest, base]);

  // Draws the loaded frame nearest the wanted one. Before the first draw the poster underneath stays unless the
  // frame is within KEEP of the wanted one: a far frame would show the wrong moment of the film.
  const draw = () => {
    const c = canvas.current;
    const list = slots.current;
    if (!c || !list.length) return;
    const w = wanted.current;
    const index = nearestLoaded(w, list.map((s) => s.state === "ok"));
    if (index < 0 || (c.dataset.frame === undefined && Math.abs(index - w) > KEEP)) return;
    const img = list[index].img!;
    const ctx = c.getContext("2d")!;
    const dpr = Math.min(devicePixelRatio, DPR_CAP);
    c.width = c.clientWidth * dpr;
    c.height = c.clientHeight * dpr;
    const s = Math.max(c.width / img.naturalWidth, c.height / img.naturalHeight);
    const iw = img.naturalWidth * s, ih = img.naturalHeight * s;
    ctx.drawImage(img, (c.width - iw) / 2, (c.height - ih) / 2, iw, ih);
    c.dataset.frame = String(index);
    c.style.opacity = "1";
  };

  useEffect(() => {
    wanted.current = frameAt(progress, manifest.frames);
    loader.current?.want(wanted.current);
    draw();
  }, [progress, manifest]);

  // A resize or rotation changes the canvas box; redraw the current frame at the new size.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(c);
    return () => ro.disconnect();
  }, [manifest]);

  return <canvas ref={canvas} data-film={manifest.id} className="absolute inset-0 h-full w-full opacity-0" />;
}
