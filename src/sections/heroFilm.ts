// The hero film (hero-cinematic, 2026-10-01): a short shot pre-rendered in Blender (art/cinematic/scene.py) as a
// frame sequence, drawn on a canvas at the frame that matches the scroll. No library: a 2D canvas and <img> decoding.
// - Two sets: "wide" (desktop) and "tall" (portrait phones, its own camera, fewer frames). Picked once per layout.
// - Frame 0 of each set is also the poster (art/export.py writes both from the same master), so the canvas fading
//   in over the poster shows no jump.
// - Loading is progressive and lazy: frame 0, then every 16th, 8th, 4th, 2nd, then the rest, a few at a time, so a
//   coarse film is scrubbable within the first few hundred KB and fills in; until a frame arrives the nearest loaded
//   one is drawn. Nothing loads before the page's own load event (the caller starts us after first paint).
// - Between two loaded neighbours the canvas cross-fades by the fractional position, which hides the frame steps.
// - Draws only when the wanted position or the set of loaded frames changes; no timer, no loop.

export const FILM = {
  wide: { count: 96, w: 1280, h: 720 },
  tall: { count: 72, w: 540, h: 960 },
} as const;
export type FilmSet = keyof typeof FILM;

export interface HeroFilm {
  /** Show the film at progress p (0..1). */
  set(p: number): void;
  resize(): void;
  destroy(): void;
  /** For the checks: what is on the canvas, and how much has loaded. */
  stats: { set: FilmSet; drawn: number; loaded: number; total: number; bytes: number; draws: number[] };
}

const ORDER_STEPS = [16, 8, 4, 2, 1];

/** The order frames are fetched in: 0, then coarse to fine. */
export function loadOrder(count: number): number[] {
  const seen = new Set<number>(), out: number[] = [];
  for (const step of ORDER_STEPS) for (let i = 0; i < count; i += step) if (!seen.has(i)) { seen.add(i); out.push(i); }
  if (!seen.has(count - 1)) out.splice(1, 0, count - 1); // the last frame early: the rest state must never wait
  return out;
}

export function createHeroFilm(opts: { canvas: HTMLCanvasElement; set: FilmSet; url: (set: FilmSet, i: number) => string;
  onFirst: () => void; parallel?: number }): HeroFilm {
  const { canvas, set } = opts;
  const meta = FILM[set];
  const ctx = canvas.getContext("2d", { alpha: false });
  const frames: (HTMLImageElement | null)[] = Array(meta.count).fill(null);
  const stats = { set, drawn: -1, loaded: 0, total: meta.count, bytes: 0, draws: [] as number[] };
  let want = 0, drawnKey = "", alive = true, first = true;

  const nearest = (i: number) => {
    for (let d = 0; d < meta.count; d++) {
      if (i - d >= 0 && frames[i - d]) return i - d;
      if (i + d < meta.count && frames[i + d]) return i + d;
    }
    return -1;
  };

  const draw = () => {
    if (!ctx || !alive) return;
    const pos = want * (meta.count - 1), lo = Math.floor(pos), hi = Math.min(meta.count - 1, lo + 1), f = pos - lo;
    const a = frames[lo] ? lo : nearest(Math.round(pos));
    if (a < 0) return;
    const blend = a === lo && frames[hi] && f > 0.001 ? f : 0;
    const key = `${a}:${blend.toFixed(3)}:${canvas.width}`;
    if (key === drawnKey) return;
    drawnKey = key;
    const t0 = performance.now();
    // cover, centred (the poster's object-fit: cover; object-position: 50% 50%)
    const s = Math.max(canvas.width / meta.w, canvas.height / meta.h);
    const dw = meta.w * s, dh = meta.h * s, dx = (canvas.width - dw) / 2, dy = (canvas.height - dh) / 2;
    ctx.globalAlpha = 1;
    ctx.drawImage(frames[a]!, dx, dy, dw, dh);
    if (blend) { ctx.globalAlpha = blend; ctx.drawImage(frames[hi]!, dx, dy, dw, dh); ctx.globalAlpha = 1; }
    stats.drawn = blend > 0.5 ? hi : a;
    if (stats.draws.push(performance.now() - t0) > 300) stats.draws.shift(); // for scripts/perf.mjs
    if (first) { first = false; opts.onFirst(); }
  };

  const resize = () => {
    // The frames are 1280 (wide) / 540 (tall) px across: a backing store larger than about 1.5x that adds nothing.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.min(Math.round(canvas.clientWidth * dpr), Math.round(meta.w * 1.5)));
    const h = Math.max(1, Math.round((w * canvas.clientHeight) / Math.max(1, canvas.clientWidth)));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; drawnKey = ""; draw(); }
  };

  // Progressive loader: a small pool of decodes in flight, in loadOrder.
  const queue = loadOrder(meta.count);
  const fetchOne = async (i: number) => {
    const img = new Image();
    img.decoding = "async";
    img.src = opts.url(set, i);
    try { await img.decode(); } catch { return; }
    if (!alive) return;
    frames[i] = img;
    stats.loaded++;
    const entry = performance.getEntriesByName(img.src)[0] as PerformanceResourceTiming | undefined;
    stats.bytes += entry?.encodedBodySize ?? 0;
    // redraw if this frame is closer to what is wanted than what is drawn
    drawnKey = "";
    draw();
  };
  // The frame the visitor is looking at jumps the queue (a reload deep in the story must not wait for the coarse pass).
  const next = () => {
    const t = Math.round(want * (meta.count - 1)), k = queue.indexOf(t);
    return k >= 0 ? queue.splice(k, 1)[0] : queue.shift()!;
  };
  const worker = async () => { while (alive && queue.length) await fetchOne(next()); };
  for (let k = 0; k < (opts.parallel ?? 4); k++) void worker();

  resize();
  return {
    set(p) { want = Math.min(1, Math.max(0, p)); draw(); },
    resize,
    destroy() { alive = false; frames.fill(null); queue.length = 0; },
    stats,
  };
}
