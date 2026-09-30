// The hero headline as circuit traces: the outline of each word, as SVG path data, one closed path per letter
// contour. The browser shapes the word (Arabic joins, RTL, the real web font) by drawing it into a small
// canvas; marching squares on that mask gives the contours, smoothed by interpolating the edge alpha and thinned
// with Ramer-Douglas-Peucker. No text library. Runs once per layout (fonts ready, resize), never per frame.
import type { Box } from "../scroll/measure.ts";

export type TextStyle = { font: string; letterSpacing: string; rtl: boolean };

const ISO = 128; // alpha threshold of the letter edge

/** Closed contours of `word` drawn in `style`, positioned inside `box` (CSS px of the headline wrapper). */
export function wordContours(word: string, box: Box, style: TextStyle): string[] {
  const size = parseFloat(style.font.match(/([\d.]+)px/)?.[1] ?? "40");
  const s = size < 50 ? 3 : 2; // mask pixels per CSS px: enough for smooth outlines at phone sizes
  const pad = 4;
  const cv = document.createElement("canvas");
  const W = Math.ceil(box.width * s) + pad * 2 + Math.ceil(size * s * 0.3); // room for overhang (italic-ish tails)
  const H = Math.ceil(box.height * s) + pad * 2;
  cv.width = W;
  cv.height = H;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  if (!cx) return [];
  cx.font = style.font;
  const ls = cx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ("letterSpacing" in cx) ls.letterSpacing = style.letterSpacing;
  cx.direction = style.rtl ? "rtl" : "ltr";
  cx.textAlign = "center";
  cx.textBaseline = "alphabetic";
  const m = cx.measureText(word);
  const asc = m.fontBoundingBoxAscent ?? size * 0.9;
  const desc = m.fontBoundingBoxDescent ?? size * 0.25;
  // The inline box is the font's content area; its baseline sits `asc` below its top (centred if the box is taller).
  const baseline = (box.height - (asc + desc)) / 2 + asc;
  cx.setTransform(s, 0, 0, s, W / 2, pad + 0);
  cx.fillStyle = "#fff";
  cx.fillText(word, 0, baseline);
  const data = cx.getImageData(0, 0, W, H).data;
  const a = (x: number, y: number) => data[(y * W + x) * 4 + 3];

  // Marching squares over cells between pixel centres; each segment joins two edge crossings.
  // Edge ids: horizontal edge from (x,y) to (x+1,y) = 2*(y*W+x); vertical from (x,y) to (x,y+1) = +1.
  const pts = new Map<number, [number, number]>();
  const next = new Map<number, number[]>();
  const cross = (id: number): [number, number] => {
    let p = pts.get(id);
    if (p) return p;
    const cell = id >> 1, x = cell % W, y = (cell - x) / W;
    if (id & 1) { const v0 = a(x, y), v1 = a(x, y + 1); p = [x, y + (ISO - v0) / (v1 - v0)]; }
    else { const v0 = a(x, y), v1 = a(x + 1, y); p = [x + (ISO - v0) / (v1 - v0), y]; }
    pts.set(id, p);
    return p;
  };
  const link = (e1: number, e2: number) => {
    (next.get(e1) ?? next.set(e1, []).get(e1)!).push(e2);
    (next.get(e2) ?? next.set(e2, []).get(e2)!).push(e1);
  };
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
    const tl = a(x, y) >= ISO ? 8 : 0, tr = a(x + 1, y) >= ISO ? 4 : 0, br = a(x + 1, y + 1) >= ISO ? 2 : 0, bl = a(x, y + 1) >= ISO ? 1 : 0;
    const c = tl | tr | br | bl;
    if (c === 0 || c === 15) continue;
    const top = 2 * (y * W + x), bottom = 2 * ((y + 1) * W + x), left = 2 * (y * W + x) + 1, right = 2 * (y * W + x + 1) + 1;
    switch (c) {
      case 1: case 14: link(left, bottom); break;
      case 2: case 13: link(bottom, right); break;
      case 3: case 12: link(left, right); break;
      case 4: case 11: link(top, right); break;
      case 6: case 9: link(top, bottom); break;
      case 7: case 8: link(left, top); break;
      case 5: link(left, top); link(bottom, right); break;
      case 10: link(top, right); link(left, bottom); break;
    }
  }

  // Walk the links into closed loops.
  const seen = new Set<number>();
  const out: string[] = [];
  const ox = box.x + box.width / 2 - W / 2 / s, oy = box.y - pad / s;
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop: [number, number][] = [];
    let prev = -1, cur = start;
    while (!seen.has(cur)) {
      seen.add(cur);
      loop.push(cross(cur));
      const n = next.get(cur)!;
      const to = n[0] !== prev ? n[0] : n[1];
      if (to === undefined) break;
      prev = cur;
      cur = to;
    }
    if (loop.length < 8) continue; // specks
    const thin = rdp(loop, 0.35 * s / 2);
    out.push("M" + thin.map(([x, y]) => `${(x / s + ox).toFixed(1)} ${(y / s + oy).toFixed(1)}`).join("L") + "Z");
  }
  return out;
}

/** Ramer-Douglas-Peucker on a closed loop (split at the far point so both halves keep their ends). */
function rdp(p: [number, number][], eps: number): [number, number][] {
  if (p.length < 4) return p;
  let far = 0, fd = -1;
  for (let i = 1; i < p.length; i++) { const d = (p[i][0] - p[0][0]) ** 2 + (p[i][1] - p[0][1]) ** 2; if (d > fd) { fd = d; far = i; } }
  const a = simplify(p.slice(0, far + 1), eps), b = simplify([...p.slice(far), p[0]], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}
function simplify(p: [number, number][], eps: number): [number, number][] {
  if (p.length < 3) return p;
  const [x1, y1] = p[0], [x2, y2] = p[p.length - 1];
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
  let idx = 0, dmax = 0;
  for (let i = 1; i < p.length - 1; i++) {
    const d = Math.abs(dy * p[i][0] - dx * p[i][1] + x2 * y1 - y2 * x1) / len;
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax <= eps) return [p[0], p[p.length - 1]];
  const l = simplify(p.slice(0, idx + 1), eps), r = simplify(p.slice(idx), eps);
  return [...l.slice(0, -1), ...r];
}
