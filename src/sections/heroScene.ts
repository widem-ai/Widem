// The hero's three.js world (sketch v2, chosen by Mohannad 2026-10-01): a dark circuit board with a city of towers,
// a gold chip, and the headline laid on the board as copper traces. The camera flies low past the words while each
// one powers on in reading order, then settles above the board with the whole headline lit. Ported from the vault
// sketch (output/widem-website/design/hero-3d-sketch-v2/scene.js); board, streets, towers and chip are unchanged.
//
// This module is loaded with a dynamic import after first paint (Hero.tsx); it never runs on the server. Hero.tsx
// owns the scroll: it calls set(cameraProgress, wordProgress) from its GSAP timeline, so the words' timing has one
// source of truth. The real headline stays the HTML <h1>; this canvas is aria-hidden.
import {
  AdditiveBlending, BoxGeometry, BufferGeometry, CanvasTexture, CatmullRomCurve3, Color, CylinderGeometry,
  Float32BufferAttribute, Group, InstancedBufferAttribute, InstancedMesh, LinearMipmapLinearFilter, Matrix4, Mesh,
  MeshBasicMaterial, NearestFilter, PerspectiveCamera, PlaneGeometry, Quaternion, Scene, ShaderMaterial, Sprite,
  SpriteMaterial, SRGBColorSpace, Vector3, Vector4, WebGLRenderer, type BufferGeometry as BG,
} from "three";

export type HeroSceneOpts = {
  canvas: HTMLCanvasElement;
  words: string[];          // the headline's words in reading order (the same split as the HTML spans)
  rtl: boolean;
  family: string;           // the h1's font-family, so the board shows the site's face
  poster?: boolean;         // render the rest frame once, with no headline on the board (scripts/poster.mjs)
};
export type HeroScene = {
  /** cam: the camera's progress along its flight (0..1); words: each word's power (0 dark .. 1 lit). */
  set(cam: number, words: ArrayLike<number>): void;
  resize(): void;
  setVisible(on: boolean): void;
  destroy(): void;
  /** For the checks: the words' power as the board shows it, and where the chip lands on screen (0..1). */
  words(): number[];
  cam(): number;
  chip(): { x0: number; x1: number; y0: number; y1: number };
  probe(n?: number): { fg: number[][]; bg: number[][]; cap: number[] };
  stats: { buildMs: number; renders: number[]; towers: number; layout: "wide" | "narrow"; dpr: number };
};

const F = 160;       // font size in mask pixels
const K = 1 / 80;    // world units per mask pixel
const PAD = 72;      // mask padding for the glow
const X0 = 3.3;      // reading start, measured from the chip centre
const MAXW = 16;     // most words the shaders take
const WAVE_END = 95;

const HEX = (h: number): [number, number, number] => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const EMERALD = HEX(0x2fd39e), GOLD = HEX(0xe8b03a), GROUND = HEX(0x040b09);
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const V = (x: number, y: number, z: number) => new Vector3(x, y, z);
type Pt = [number, number];

const GLSL_COMMON = /* glsl */`
  uniform vec3 uEmerald; uniform vec3 uGold; uniform vec3 uGround;
  uniform float uFog; uniform float uTime; uniform float uWave; uniform float uPower;
  float fogF(float d){ return 1.0 - exp(-uFog*uFog*d*d); }
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
`;

type Word = { text: string; line: number; x0: number; x1: number; cx0: number; cx1: number; cy0: number; cy1: number };
type Layout = { lines: string[][]; words: Word[]; maxW: number; LH: number; cap: number; base: number; cw: number; ch: number; idCanvas?: HTMLCanvasElement };

/** Break the words into n lines so the longest line is as short as possible (the browser measures; Arabic shapes). */
function breakLines(width: (s: string) => number, words: string[], n: number): string[][] {
  const k = words.length; n = Math.min(n, k);
  const w = (i: number, j: number) => width(words.slice(i, j).join(" "));
  const best: number[][] = Array.from({ length: n + 1 }, () => Array(k + 1).fill(Infinity));
  const cut: number[][] = Array.from({ length: n + 1 }, () => Array(k + 1).fill(0));
  best[0][0] = 0;
  for (let l = 1; l <= n; l++) for (let j = l; j <= k; j++) for (let i = l - 1; i < j; i++) {
    const v = Math.max(best[l - 1][i], w(i, j));
    if (v < best[l][j]) { best[l][j] = v; cut[l][j] = i; }
  }
  const out: string[][] = []; let j = k;
  for (let l = n; l > 0; l--) { const i = cut[l][j]; out.unshift(words.slice(i, j)); j = i; }
  return out;
}

/** Give the main thread back between build phases, so a slow phone never meets one long task (input stays live). */
const breathe = () => new Promise<void>((r) => setTimeout(r, 0));

export async function createHeroScene(o: HeroSceneOpts): Promise<HeroScene | null> {
  const { canvas, rtl: AR } = o;
  const S = AR ? -1 : 1; // reading direction on the board: +x for English, -x for Arabic
  const FONT = `600 ${F}px ${o.family}`;
  let renderer: WebGLRenderer;
  // Ask for WebGL 2 ourselves first (three.js needs it): no context means the poster stays, with nothing logged.
  const attrs = { antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: !!o.poster } as const;
  const context = canvas.getContext("webgl2", attrs) as WebGL2RenderingContext | null;
  if (!context) return null;
  try { renderer = new WebGLRenderer({ canvas, context: context as unknown as WebGLRenderingContext, ...attrs }); } catch { return null; }
  const t0 = performance.now();

  // ---------- text layout: the browser shapes the words (Arabic joins, RTL), we only place them ----------
  const mc = document.createElement("canvas").getContext("2d")!;
  mc.font = FONT; mc.direction = AR ? "rtl" : "ltr";
  function measureLayout(lines: string[][]): Layout {
    const m = mc.measureText(AR ? "أحد" : "Hg");
    const asc = m.fontBoundingBoxAscent ?? F * 0.95, desc = m.fontBoundingBoxDescent ?? F * 0.3;
    const LH = Math.round(AR ? (asc + desc) * 1.02 : F * 1.16);
    const space = mc.measureText(" ").width;
    const words: Word[] = []; let maxW = 0;
    lines.forEach((parts, li) => {
      let x = 0;
      parts.forEach((w, wi) => {
        const ww = mc.measureText(w).width;
        words.push({ text: w, line: li, x0: x, x1: x + ww, cx0: 0, cx1: 0, cy0: 0, cy1: 0 });
        x += ww + (wi < parts.length - 1 ? space : 0);
      });
      maxW = Math.max(maxW, x);
    });
    const cap = mc.measureText(AR ? "ا" : "H").actualBoundingBoxAscent;
    const base = (LH - (asc + desc)) / 2 + asc;
    return { lines, words, maxW, LH, cap, base, cw: Math.ceil(maxW + PAD * 2), ch: Math.ceil(lines.length * LH + PAD * 2) };
  }
  const width = (s: string) => mc.measureText(s).width;
  // Wide screens: three lines. Narrow: the fewest lines that keep the block no wider than 1.5x its height.
  const LW = measureLayout(breakLines(width, o.words, 3));
  let LN: Layout = LW;
  for (let n = 3; n <= 7; n++) { LN = measureLayout(breakLines(width, o.words, n)); if (LN.maxW / (n * LN.LH) <= 1.5) break; }

  function drawMask(L: Layout) {
    const cv = document.createElement("canvas"); cv.width = L.cw; cv.height = L.ch;
    const c = cv.getContext("2d", { willReadFrequently: true })!;
    c.fillStyle = "#000"; c.fillRect(0, 0, L.cw, L.ch);
    c.fillStyle = "#fff"; c.font = FONT; c.direction = AR ? "rtl" : "ltr"; c.textBaseline = "alphabetic";
    c.textAlign = AR ? "right" : "left";
    for (const w of L.words) {
      w.cx0 = AR ? L.cw - PAD - w.x1 : PAD + w.x0;
      w.cx1 = AR ? L.cw - PAD - w.x0 : PAD + w.x1;
      w.cy0 = PAD + w.line * L.LH; w.cy1 = w.cy0 + L.LH;
      c.fillText(w.text, AR ? w.cx1 : w.cx0, w.cy0 + L.base); // one word at a time: joins never cross a space
    }
    // Word-id map: each pixel knows its word, even where a tall Arabic letter reaches into the line above.
    // Fat strokes first (so the glow near a letter belongs to it), exact fills last.
    const idc = document.createElement("canvas"); idc.width = L.cw; idc.height = L.ch;
    const d = idc.getContext("2d")!;
    d.fillStyle = "#000"; d.fillRect(0, 0, L.cw, L.ch);
    d.font = FONT; d.direction = AR ? "rtl" : "ltr"; d.textAlign = AR ? "right" : "left"; d.lineWidth = 30; d.lineJoin = "round";
    d.imageSmoothingEnabled = false;
    for (const pass of ["stroke", "fill"] as const) L.words.forEach((w, i) => {
      d.fillStyle = d.strokeStyle = `rgb(${i + 1},0,0)`;
      if (pass === "stroke") d.strokeText(w.text, AR ? w.cx1 : w.cx0, w.cy0 + L.base);
      else d.fillText(w.text, AR ? w.cx1 : w.cx0, w.cy0 + L.base);
    });
    L.idCanvas = idc;
    return cv;
  }

  // Marching squares on the mask: every letter outline becomes a closed polyline (a trace).
  function traceOutlines(img: Uint8ClampedArray, w: number, h: number, th = 128): Pt[][] {
    const v = (x: number, y: number) => img[(y * w + x) * 4];
    const adj = new Map<number, number[]>(), pts = new Map<number, Pt>();
    const ek = (x: number, y: number, d: number) => (y * w + x) * 2 + d;
    const point = (k: number): Pt => {
      let p = pts.get(k); if (p) return p;
      const d = k & 1, i = k >> 1, x = i % w, y = (i / w) | 0;
      const a = v(x, y), b = d ? v(x, y + 1) : v(x + 1, y), t = (th - a) / (b - a);
      p = d ? [x, y + t] : [x + t, y]; pts.set(k, p); return p;
    };
    const link = (a: number, b: number) => {
      (adj.get(a) ?? adj.set(a, []).get(a)!).push(b); (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
    };
    for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
      const a = +(v(x, y) >= th), b = +(v(x + 1, y) >= th), c = +(v(x + 1, y + 1) >= th), d = +(v(x, y + 1) >= th);
      const code = a * 8 + b * 4 + c * 2 + d;
      if (code === 0 || code === 15) continue;
      const T = ek(x, y, 0), R = ek(x + 1, y, 1), B = ek(x, y + 1, 0), Lf = ek(x, y, 1);
      if (code === 5 || code === 10) {
        const centre = (v(x, y) + v(x + 1, y) + v(x + 1, y + 1) + v(x, y + 1)) / 4 >= th;
        if ((code === 10) === centre) { link(T, R); link(B, Lf); } else { link(T, Lf); link(R, B); }
        continue;
      }
      const e: number[] = [];
      if (a !== b) e.push(T); if (b !== c) e.push(R); if (c !== d) e.push(B); if (d !== a) e.push(Lf);
      link(e[0], e[1]);
    }
    const seen = new Set<number>(), loops: Pt[][] = [];
    for (const s of adj.keys()) {
      if (seen.has(s)) continue;
      const loop: Pt[] = []; let prev = -1, cur: number | undefined = s;
      while (cur !== undefined && !seen.has(cur)) {
        seen.add(cur); loop.push(point(cur));
        const n: number[] = adj.get(cur)!; const nx: number | undefined = n[0] !== prev ? n[0] : n[1];
        prev = cur; cur = nx;
      }
      const out: Pt[] = [loop[0]]; // decimate: keep points at least 1.6 mask px apart
      for (const p of loop) { const q = out[out.length - 1]; if (Math.hypot(p[0] - q[0], p[1] - q[1]) >= 1.6) out.push(p); }
      if (out.length > 3) loops.push(out);
    }
    return loops;
  }

  let seed = 20260930;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const range = (a: number, b: number) => a + (b - a) * rnd();
  const sign = () => (rnd() < 0.5 ? -1 : 1);

  const isNarrow = () => innerWidth / innerHeight < 0.9 || innerWidth < 700;
  const dprCap = () => Math.min(devicePixelRatio || 1, innerWidth < 768 ? 1.5 : 2);
  renderer.setPixelRatio(o.poster ? devicePixelRatio : dprCap());
  renderer.setClearColor(new Color().setRGB(...GROUND, SRGBColorSpace), 1);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, 0.1, 260);
  const shared = {
    uEmerald: { value: V(...EMERALD) }, uGold: { value: V(...GOLD) }, uGround: { value: V(...GROUND) },
    uFog: { value: 0.03 }, uTime: { value: 0 }, uWave: { value: 0 }, uPower: { value: 0 },
    uLitReach: { value: 0 }, uPulse: { value: 0.6 }, uPx: { value: 1 },
    uWP: { value: new Float32Array(MAXW) }, uGoldBand: { value: -1 }, uRtl: { value: AR ? 1 : 0 },
  };

  // ---------- both layouts are measured now; the board keeps a plaza that fits either ----------
  const zTop = -(LW.lines.length * LW.LH * K) / 2; // wide block centred on the chip; narrow shares the top
  // Narrow screens frame the words alone, so their block starts further from the chip: at rest the chip then lies
  // wholly off screen instead of being cut at the edge.
  const NARROW_SHIFT = 1.5;
  const startOf = (Lx: Layout) => (Lx === LN && LN !== LW ? X0 + NARROW_SHIFT : X0);
  const readW = Math.max(LW.maxW * K, LN.maxW * K + (LN !== LW ? NARROW_SHIFT : 0));
  const plazaH = Math.max(LN.lines.length * LN.LH, LW.lines.length * LW.LH + 2.2 * LW.LH) * K;
  const inText = (x: number, z: number, m = 0) => {
    const r = S * x; return r > X0 - 1.0 - m && r < X0 + readW + 1.0 + m && z > zTop - 1.0 - m && z < zTop + plazaH + 1.5 + m;
  };

  // ---------- occupancy grid ----------
  const GX0 = -70, GZ0 = -95, CELL = 0.5, GW = 280, GH = 270;
  const occ = new Uint8Array(GW * GH);
  const cellIdx = (x: number, z: number) => { const i = Math.floor((x - GX0) / CELL), j = Math.floor((z - GZ0) / CELL);
    return i < 0 || j < 0 || i >= GW || j >= GH ? -1 : j * GW + i; };
  const mark = (x: number, z: number, r: number) => { for (let dx = -r; dx <= r; dx += CELL) for (let dz = -r; dz <= r; dz += CELL) { const k = cellIdx(x + dx, z + dz); if (k >= 0) occ[k] = 1; } };
  const free = (x: number, z: number, r: number) => { for (let dx = -r; dx <= r; dx += CELL) for (let dz = -r; dz <= r; dz += CELL) { const k = cellIdx(x + dx, z + dz); if (k < 0 || occ[k]) return false; } return true; };

  // ---------- city traces, kept off the headline plaza ----------
  const pos: number[] = [], dist: number[] = [], across: number[] = [], meta: number[] = [], idx: number[] = [];
  let vCount = 0;
  function ribbon(pts: Pt[], dist0: number, s: number, hero: number, width: number, gain: number) {
    let acc = dist0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
      if (len < 1e-4) continue;
      const nx = (-dz / len) * width * 0.5, nz = (dx / len) * width * 0.5;
      pos.push(ax - nx, 0.012, az - nz, ax + nx, 0.012, az + nz, bx - nx, 0.012, bz - nz, bx + nx, 0.012, bz + nz);
      dist.push(acc, acc, acc + len, acc + len); across.push(-1, 1, -1, 1);
      for (let k = 0; k < 4; k++) meta.push(s, hero, gain);
      idx.push(vCount, vCount + 1, vCount + 2, vCount + 2, vCount + 1, vCount + 3); vCount += 4;
      for (let t = 0; t <= len; t += 0.25) mark(ax + (dx * t) / len, az + (dz * t) / len, width > 0.16 ? 0.35 : 0.15);
      acc += len;
    }
  }
  const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
  const perp = (v: Pt): Pt => [-v[1], v[0]];
  const norm2 = (v: Pt): Pt => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
  function offsetLine(pts: Pt[], off: number): Pt[] {
    return pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const n1 = norm2(perp(sub(p, a).every((v) => v === 0) ? sub(b, p) : sub(p, a)));
      const n2 = norm2(perp(sub(b, p).every((v) => v === 0) ? sub(p, a) : sub(b, p)));
      const m = norm2([n1[0] + n2[0], n1[1] + n2[1]]);
      const k = off / Math.max(0.35, m[0] * n1[0] + m[1] * n1[1]);
      return [p[0] + m[0] * k, p[1] + m[1] * k] as Pt;
    });
  }
  const inBounds = (p: Pt) => p[0] > -62 && p[0] < 62 && p[1] > -90 && p[1] < 32 && !inText(p[0], p[1]);
  function walk(pts: Pt[], heading: Pt, total: number) {
    let p = pts[pts.length - 1];
    while (total > 0 && inBounds(p)) {
      const seg = range(3, 9);
      const np: Pt = [p[0] + heading[0] * seg, p[1] + heading[1] * seg];
      if (!inBounds(np)) break;
      p = np; pts.push(p); total -= seg;
      const r = rnd(), sd = sign(), side: Pt = [perp(heading)[0] * sd, perp(heading)[1] * sd];
      if (r < 0.45) { const j = range(0.8, 2.6), d = norm2([heading[0] + side[0], heading[1] + side[1]]); p = [p[0] + d[0] * j, p[1] + d[1] * j]; pts.push(p); }
      else if (r < 0.62) { const d = norm2([heading[0] + side[0], heading[1] + side[1]]); p = [p[0] + d[0] * 1.2, p[1] + d[1] * 1.2]; pts.push(p); heading = side; }
    }
    return pts;
  }
  function bundle(center: Pt[], n: number, spacing: number, d0: number, hero: number, width: number, gain: number) {
    for (let i = 0; i < n; i++) ribbon(offsetLine(center, (i - (n - 1) / 2) * spacing), d0, rnd(), hero, width, gain * range(0.75, 1.1));
  }
  await breathe();
  const DIRS: Pt[] = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  DIRS.forEach((d) => {
    if (d[0] === S) return; // the reading side feeds the headline instead
    const t = perp(d);
    for (const k of [-1, 0, 1]) {
      let p: Pt = [d[0] * 1.75 + t[0] * k, d[1] * 1.75 + t[1] * k]; const pts: Pt[] = [p];
      p = [p[0] + d[0], p[1] + d[1]]; pts.push(p);
      if (k !== 0) { const q = norm2([d[0] + t[0] * k, d[1] + t[1] * k]), L = range(1.4, 3); p = [p[0] + q[0] * L, p[1] + q[1] * L]; pts.push(p); }
      p = [p[0] + d[0] * range(2, 5), p[1] + d[1] * range(2, 5)]; pts.push(p);
      walk(pts, d, range(30, 70));
      bundle(pts, 5, 0.17, 0, 0, 0.24, 1.0);
    }
  });
  const lineZ = (i: number, L: Layout) => zTop + (i * L.LH + L.base - L.cap * 0.5) * K;
  for (let i = 0; i < LW.lines.length; i++) { // feeders: one bundle from the chip to the start of each line
    const z = lineZ(i, LW), zc = Math.max(-1.1, Math.min(1.1, z));
    const jog = Math.abs(z - zc);
    bundle([[S * 1.75, zc], [S * 2.2, zc], [S * (2.2 + jog * 0.6), z], [S * (X0 - 0.35), z]], 3, 0.15, 0, 0, 0.2, 1.15);
  }
  for (let s = 0; s < 90; s++) {
    const p: Pt = [range(-58, 58), range(-85, 30)]; if (inText(p[0], p[1], 1)) continue;
    bundle(walk([p], DIRS[Math.floor(rnd() * 4)], range(15, 50)), 2 + Math.floor(rnd() * 4), 0.16, Math.hypot(p[0], p[1]), 0, 0.2, range(0.55, 0.9));
  }
  for (let s = 0; s < 800; s++) {
    const p = [range(-50, 50), range(-60, 28)].map((v) => v * (rnd() < 0.5 ? 0.5 : 1)) as Pt; if (inText(p[0], p[1], 0.5)) continue;
    bundle(walk([p], DIRS[Math.floor(rnd() * 4)], range(2, 7)), 1 + Math.floor(rnd() * 3), 0.12, Math.hypot(p[0], p[1]), 0, 0.14, range(0.25, 0.55));
  }
  await breathe();
  const traceGeo = new BufferGeometry();
  traceGeo.setAttribute("position", new Float32BufferAttribute(pos, 3));
  traceGeo.setAttribute("aDist", new Float32BufferAttribute(dist, 1));
  traceGeo.setAttribute("aAcross", new Float32BufferAttribute(across, 1));
  traceGeo.setAttribute("aMeta", new Float32BufferAttribute(meta, 3));
  traceGeo.setIndex(idx);
  const traceMat = new ShaderMaterial({
    uniforms: shared, transparent: true, depthWrite: false, blending: AdditiveBlending,
    vertexShader: /* glsl */`
      attribute float aDist; attribute float aAcross; attribute vec3 aMeta;
      varying float vDist; varying float vAcross; varying vec3 vMeta; varying float vDepth;
      void main(){ vDist = aDist; vAcross = aAcross; vMeta = aMeta;
        vec4 mv = modelViewMatrix * vec4(position,1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: GLSL_COMMON + /* glsl */`
      uniform float uPulse;
      varying float vDist; varying float vAcross; varying vec3 vMeta; varying float vDepth;
      void main(){
        float a = abs(vAcross);
        float core = smoothstep(0.34, 0.16, a); float halo = pow(1.0 - a, 2.2) * 0.32;
        float lit = smoothstep(uWave, uWave - 2.5, vDist);
        float front = exp(-pow((vDist - uWave) * 0.7, 2.0)) * step(uWave, 90.0);
        float s = vMeta.x, gain = vMeta.z;
        float period = 26.0; float d = mod(uTime * 5.0 - s * period - vDist, period);
        float pulse = exp(-d * 1.1) * smoothstep(0.0, 0.6, d) * smoothstep(period, period - 1.0, d) * step(0.45, fract(s * 7.13)) * uPulse * 1.6;
        vec3 col = mix(uEmerald, uGold, exp(-vDist * 0.55) * 0.75);
        col = col * (core + halo) * gain * (0.85 + pulse) * lit + mix(uGold, vec3(1.0), 0.4) * front * (core + halo) * 1.4;
        col *= 1.0 - fogF(vDepth);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  scene.add(new Mesh(traceGeo, traceMat));

  // ---------- the board ----------
  const board = new Mesh(new PlaneGeometry(300, 300), new ShaderMaterial({
    uniforms: shared,
    vertexShader: /* glsl */`varying vec3 vW; varying float vDepth;
      void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: GLSL_COMMON + /* glsl */`varying vec3 vW; varying float vDepth;
      void main(){
        float r = length(vW.xz);
        vec3 col = vec3(0.020, 0.045, 0.036);
        vec2 g = floor(vW.xz * 0.5); col += (hash(g) - 0.5) * 0.010;
        col += uEmerald * 0.04 * smoothstep(uWave, uWave - 10.0, r);
        col += uGold * 0.55 * exp(-r * r / 7.0) * uPower;
        float f = fogF(vDepth);
        col = mix(col, uGround, f);
        col += uEmerald * 0.05 * smoothstep(0.55, 0.9, f) * (1.0 - smoothstep(0.93, 1.0, f));
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  board.rotation.x = -Math.PI / 2; board.position.z = -40; scene.add(board);

  // ---------- camera path: keyframes at 0, 25, 50, 75 % in reading coordinates, rest fitted to the screen ----------
  // The opening frames keep the whole chip inside the screen on both layouts (the sketch cut it at the phone's edge).
  let L: Layout = LW;
  let camPos: CatmullRomCurve3, camTgt: CatmullRomCurve3;
  function flightKeys(Lx: Layout) {
    const W = Lx.maxW * K, H = Lx.lines.length * Lx.LH * K, z0 = lineZ(0, Lx), zMid = zTop + H / 2, zBot = zTop + H;
    const nb = Lx === LN && LN !== LW, X = (r: number) => S * (r + startOf(Lx) - X0);
    return {
      pos: [nb ? V(X(0.9 - NARROW_SHIFT), 15, z0 + 15) : V(X(X0 - 8.6), 5.6, z0 + 11.8), V(X(X0 + 0.3 * W), 2.8, z0 + 4.8), V(X(X0 + 0.72 * W), 7.5, z0 + 8.5), nb ? V(X(X0 + 0.5 * W), 22, zBot + 16) : V(X(X0 + 0.45 * W), 12.5, zBot + 10.5)],
      tgt: [nb ? V(X(2.0 - NARROW_SHIFT), 0, z0 + 0.6) : V(X(X0 + 4.2), 0, z0 - 0.6), V(X(X0 + 0.64 * W), 0, z0 + 0.2), V(X(X0 + 0.62 * W), 0, zMid), V(X(X0 + 0.45 * W), 0, zMid)],
      W, H,
    };
  }
  // Rest: fixed tilt; distance and aim searched so the headline sits in the upper band of the screen.
  function fitRest(W: number, H: number) {
    const narrow = isNarrow(), x0 = startOf(L);
    const el = (narrow ? 64 : 60) * Math.PI / 180;
    // Desktop frames the chip beside the words; narrow screens frame the words alone, tight on the reading start, so
    // the chip lies wholly off screen rather than cut at the edge.
    const xs = narrow ? [S * (x0 - 0.3), S * (x0 + W + PAD * K * 0.2)] : [S * (x0 - PAD * K), S * (x0 + W + PAD * K * 0.2), S * -1.9];
    const zs = [zTop - 0.2, zTop + H + 0.1];
    const corners: Vector3[] = []; for (const x of xs) for (const z of zs) corners.push(V(x, 0, z));
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const band = narrow ? [0.15, 0.62] : [0.2, 0.66], maxW = narrow ? 0.9 : 0.84;
    const cam = camera.clone();
    const proj = (D: number, dz: number) => {
      const t = V(cx, 0, zTop + H / 2 + dz);
      cam.position.set(t.x, D * Math.sin(el), t.z + D * Math.cos(el)); cam.lookAt(t); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
      let x0 = 1, x1 = -1, y0 = 1, y1 = -1;
      for (const c of corners) { const q = c.clone().project(cam); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
      return { w: (x1 - x0) / 2, top: (1 - y1) / 2, bot: (1 - y0) / 2 };
    };
    for (let D = 8; D < 140; D *= 1.02) {
      let lo = -40, hi = 40;
      for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2, r = proj(D, m); ((r.top + r.bot) / 2 < (band[0] + band[1]) / 2) ? (hi = m) : (lo = m); }
      const dz = (lo + hi) / 2, r = proj(D, dz);
      if (r.w <= maxW && r.bot - r.top <= band[1] - band[0]) {
        const t = V(cx, 0, zTop + H / 2 + dz);
        return { pos: V(t.x, D * Math.sin(el), t.z + D * Math.cos(el)), tgt: t };
      }
    }
    return { pos: V(cx, 40, zTop + 20), tgt: V(cx, 0, zTop + H / 2) };
  }
  function buildPath() {
    const k = flightKeys(L), rest = fitRest(k.W, k.H);
    camPos = new CatmullRomCurve3([...k.pos, rest.pos], false, "centripetal");
    camTgt = new CatmullRomCurve3([...k.tgt, rest.tgt], false, "centripetal");
  }

  // ---------- towers, kept off the headline plaza and the camera's low flight ----------
  mark(0, 0, 2.9);
  L = isNarrow() ? LN : LW;
  buildPath();
  const lowPath = [...camPos!.getPoints(80)];
  lowPath.push(...new CatmullRomCurve3(flightKeys(L === LN ? LW : LN).pos, false, "centripetal").getPoints(60));
  type Tower = { x: number; z: number; w: number; h: number; d: number; kind: number; dc: number; dt: number; rank?: number };
  const towers: Tower[] = [];
  for (let n = 0; n < 50000 && towers.length < 3400; n++) {
    if (n % 6000 === 5999) await breathe();
    const cl = rnd() < 0.5, x = cl ? range(-22, 22) + S * 10 : range(-55, 55), z = cl ? range(-18, 16) : range(-75, 30);
    if (inText(x, z, 0.4)) continue;
    const dcx = Math.hypot(x - S * (X0 + readW / 2), z);
    if (dcx > 20 && rnd() < 0.35) continue;
    const r = rnd(), kind = r < 0.35 ? 1 : 0;
    let w = kind ? range(0.28, 0.8) : range(0.3, 1.3);
    const h = r > 0.8 ? range(0.08, 0.22) : 0.2 + Math.pow(rnd(), 2.6) * 3.2;
    if (r > 0.8) w = range(0.4, 1.4);
    const dpt = kind ? w : (r > 0.8 ? range(0.3, 0.9) : range(0.3, 1.3));
    const rad = Math.max(w, dpt) * 0.5 + 0.15;
    if (!free(x, z, rad)) continue;
    if (h > 0.3 && lowPath.some((c) => Math.hypot(c.x - x, c.z - z) < rad + 0.5 && c.y < h + 0.8)) continue;
    mark(x, z, rad);
    towers.push({ x, z, w, h, d: dpt, kind, dc: Math.hypot(x, z), dt: dcx });
  }
  const nearT = towers.filter((t) => t.dt < 22).sort((a, b) => S * (a.x - b.x));
  nearT.forEach((t, i) => (t.rank = (i + 1) / nearT.length));
  const towerMat = new ShaderMaterial({
    uniforms: shared,
    vertexShader: /* glsl */`
      attribute vec4 aInfo; attribute vec3 aSize;
      varying vec3 vN; varying vec3 vW; varying vec2 vUv; varying vec4 vInfo; varying vec3 vSize; varying float vDepth;
      void main(){ vec4 w = modelMatrix * instanceMatrix * vec4(position,1.0);
        vW = w.xyz; vUv = uv; vInfo = aInfo; vSize = aSize;
        vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        vec4 mv = viewMatrix * w; vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: GLSL_COMMON + /* glsl */`
      uniform float uLitReach;
      varying vec3 vN; varying vec3 vW; varying vec2 vUv; varying vec4 vInfo; varying vec3 vSize; varying float vDepth;
      void main(){
        float rank = vInfo.x, sd = vInfo.y, dc = vInfo.z, kind = vInfo.w;
        vec3 n = normalize(vN); vec3 v = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        float on = smoothstep(uWave, uWave - 3.0, dc);
        vec3 col = vec3(0.016, 0.03, 0.026);
        col += uEmerald * (0.05 + 0.16 * fres) * on;
        col += uEmerald * 0.22 * exp(-vW.y * 2.2) * (1.0 - abs(n.y)) * on;
        col += uGold * 0.9 * exp(-dc * 0.45) * (0.25 + fres) * uPower;
        if (n.y > 0.5) col += vec3(0.012, 0.028, 0.022) + uEmerald * 0.03 * on;
        float towerLit = smoothstep(rank - 0.04, rank, uLitReach);
        if (abs(n.y) < 0.5 && vSize.y > 0.3) {
          float wid = kind > 0.5 ? vSize.x * 3.14 : vSize.x;
          vec2 g = vec2(vUv.x * wid * 7.0, vW.y * 8.0); vec2 id = floor(g), f = fract(g);
          float win = step(0.28, f.x) * step(f.x, 0.72) * step(0.3, f.y) * step(f.y, 0.7) * step(0.25, vW.y);
          float h = hash(id + sd * 31.7);
          float lit = step(0.955 - 0.3 * towerLit, h) * win * on;
          col += mix(uGold, vec3(1.0, 0.93, 0.75), h * 0.5) * lit * (0.7 + 1.1 * towerLit);
        }
        col = mix(col, uGround, fogF(vDepth));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  function towerMesh(geo: BG, list: Tower[]) {
    const mesh = new InstancedMesh(geo, towerMat, list.length);
    const info = new Float32Array(list.length * 4), size = new Float32Array(list.length * 3), m = new Matrix4();
    list.forEach((t, i) => { m.makeScale(t.w, t.h, t.d).setPosition(t.x, 0, t.z); mesh.setMatrixAt(i, m);
      info.set([t.rank ?? 2, rnd(), t.dc, t.kind], i * 4); size.set([t.w, t.h, t.d], i * 3); });
    geo.setAttribute("aInfo", new InstancedBufferAttribute(info, 4));
    geo.setAttribute("aSize", new InstancedBufferAttribute(size, 3));
    mesh.frustumCulled = false; scene.add(mesh);
  }
  towerMesh(new BoxGeometry(1, 1, 1).translate(0, 0.5, 0), towers.filter((t) => !t.kind));
  towerMesh(new CylinderGeometry(0.5, 0.5, 1, 18).translate(0, 0.5, 0), towers.filter((t) => t.kind));

  await breathe();
  // ---------- the gold chip ----------
  const chipMat = new ShaderMaterial({
    uniforms: shared,
    vertexShader: /* glsl */`varying vec3 vN; varying vec3 vW; varying float vDepth;
      void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
        vec4 mv = viewMatrix * w; vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: GLSL_COMMON + /* glsl */`varying vec3 vN; varying vec3 vW; varying float vDepth;
      void main(){
        vec3 n = normalize(vN); vec3 warm = vec3(1.0, 0.86, 0.55); vec3 col;
        if (n.y > 0.5) { vec2 g = vW.xz * 6.0; vec2 id = floor(g), f = fract(g); float cell = step(0.1, f.x) * step(0.1, f.y);
          col = uGold * (0.55 + 0.45 * hash(id)) * cell + uGold * 0.25; col += warm * 0.35 * step(0.86, hash(id + 3.1)) * cell; }
        else { float horiz = abs(n.x) > 0.5 ? vW.z : vW.x; vec2 f = fract(vec2(horiz * 9.0, vW.y * 14.0));
          float slot = step(0.3, f.x) * step(f.x, 0.7) * step(0.25, f.y) * step(f.y, 0.75); col = uGold * 0.35 + warm * slot * 0.9; }
        col *= uPower * 1.15; col = mix(col, uGround, fogF(vDepth)); gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const chip = new Group();
  chip.add(new Mesh(new BoxGeometry(3.3, 0.12, 3.3).translate(0, 0.06, 0), new MeshBasicMaterial({ color: 0x1c1408 })));
  ([[2.6, 0.12, 0.34], [2.0, 0.46, 0.34], [1.35, 0.8, 0.4]] as const).forEach(([s, y, h]) => chip.add(new Mesh(new BoxGeometry(s, h, s).translate(0, y + h / 2, 0), chipMat)));
  const pinMat = new MeshBasicMaterial({ color: 0x000000 });
  const pins = new InstancedMesh(new BoxGeometry(0.06, 0.04, 0.3), pinMat, 4 * 22);
  { const m = new Matrix4(), q = new Quaternion(), up = V(0, 1, 0); let i = 0;
    DIRS.forEach(([dx, dz]) => { for (let k = 0; k < 22; k++) { const t = -1.45 + (2.9 * k) / 21; q.setFromAxisAngle(up, dx ? Math.PI / 2 : 0);
      m.compose(V(dx * 1.72 + (dz ? t : 0), 0.03, dz * 1.72 + (dx ? t : 0)), q, V(1, 1, 1)); pins.setMatrixAt(i++, m); } }); }
  chip.add(pins); scene.add(chip);
  function glowTexture(stops: [number, string][]) {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const x = c.getContext("2d")!, g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    stops.forEach(([at, col]) => g.addColorStop(at, col)); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; return t;
  }
  const goldTex = glowTexture([[0, "rgba(255,214,130,1)"], [0.25, "rgba(232,176,58,.55)"], [0.6, "rgba(232,140,40,.12)"], [1, "rgba(0,0,0,0)"]]);
  const glowA = new Sprite(new SpriteMaterial({ map: goldTex, blending: AdditiveBlending, depthWrite: false, transparent: true }));
  glowA.scale.set(7, 5, 1); glowA.position.set(0, 1.0, 0); scene.add(glowA);
  const glowB = new Sprite(new SpriteMaterial({ map: goldTex, blending: AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 }));
  glowB.scale.set(2.6, 2.0, 1); glowB.position.set(0, 1.35, 0); scene.add(glowB);

  // ---------- the headline on the board: a lit mask (letter fill) + outline traces ----------
  // Unlit letters are etched copper, dim but plainly letters (the opening frame shows them waiting to be switched on).
  const textGroup = new Group(); if (!o.poster) scene.add(textGroup);
  const textMatFill = new ShaderMaterial({
    uniforms: { ...shared, uMask: { value: null as CanvasTexture | null }, uId: { value: null as CanvasTexture | null },
      uRect: { value: Array.from({ length: MAXW }, () => new Vector4()) }, uNW: { value: 0 } },
    transparent: true, depthWrite: false, blending: AdditiveBlending,
    vertexShader: /* glsl */`varying vec2 vUv; varying float vDepth;
      void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: GLSL_COMMON + /* glsl */`
      uniform sampler2D uMask; uniform sampler2D uId; uniform vec4 uRect[${MAXW}]; uniform float uWP[${MAXW}]; uniform float uNW; uniform float uRtl; uniform float uGoldBand;
      varying vec2 vUv; varying float vDepth;
      void main(){
        float m = texture2D(uMask, vUv).r;
        float halo = texture2D(uMask, vUv, 4.0).r;
        vec2 c = vec2(vUv.x, 1.0 - vUv.y);
        float f = -9.0, loc = 0.0;
        int id = int(texture2D(uId, vUv).r * 255.0 + 0.5) - 1;
        if (id >= 0 && float(id) < uNW) {
          vec4 r = uRect[id];
          loc = clamp((c.x - r.x) / (r.z - r.x), 0.0, 1.0); if (uRtl > 0.5) loc = 1.0 - loc;
          f = uWP[id] * 1.35 - 0.3;
        }
        float lit = 1.0 - smoothstep(f - 0.05, f + 0.03, loc);
        float front = exp(-pow((loc - f) * 11.0, 2.0)) * step(-0.25, f) * step(f, 1.02);
        float g = (uRtl > 0.5 ? 1.0 - c.x : c.x) * 0.75 + c.y * 0.25;
        float gold = exp(-pow((g - uGoldBand) * 7.0, 2.0));
        vec3 unlit = vec3(0.034, 0.072, 0.058);
        vec3 litCol = mix(uEmerald, vec3(0.80, 1.0, 0.92), 0.22);
        vec3 col = m * mix(unlit, litCol, lit);
        col += m * front * vec3(1.0, 0.95, 0.8) * 0.9;
        col += (1.0 - m) * halo * (uEmerald * 0.20 * lit + vec3(1.0, 0.9, 0.6) * 0.35 * front);
        col = mix(col, col * 0.4 + uGold * (m * 1.05 + halo * 0.35), gold * max(lit, 0.0));
        col *= 1.0 - fogF(vDepth) * 0.35;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const textMatLine = new ShaderMaterial({
    uniforms: shared, transparent: true, depthWrite: false, blending: AdditiveBlending,
    vertexShader: /* glsl */`
      uniform float uWP[${MAXW}];
      attribute float aAcross; attribute vec4 aTrace; // t along the outline 0..1, word, start in word, reading pos
      varying float vAcross; varying vec4 vTrace; varying float vWP; varying float vDepth;
      void main(){ vAcross = aAcross; vTrace = aTrace; vWP = uWP[int(aTrace.y + 0.5)];
        vec4 mv = modelViewMatrix * vec4(position,1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: GLSL_COMMON + /* glsl */`
      uniform float uGoldBand;
      varying float vAcross; varying vec4 vTrace; varying float vWP; varying float vDepth;
      void main(){
        float core = smoothstep(1.0, 0.25, abs(vAcross));
        float t = vTrace.x, s = vTrace.z;
        float c = clamp((vWP - s * 0.45) / 0.4, 0.0, 1.0);
        float on = smoothstep(c + 0.004, c - 0.01, t) * step(0.0001, c);
        float head = exp(-pow((t - c) * 28.0, 2.0)) * step(0.0001, c) * step(c, 0.999);
        float loop = exp(-mod(uTime * 0.18 - t + s, 1.0) * 18.0) * step(0.999, c) * 0.7;
        float gold = exp(-pow((vTrace.w - uGoldBand) * 7.0, 2.0));
        vec3 col = vec3(0.07, 0.17, 0.13) * (1.0 - on);
        col += vec3(0.62, 1.0, 0.86) * on * (0.75 + loop);
        col += vec3(1.0, 0.92, 0.7) * head * 2.2;
        col = mix(col, uGold * 1.4, gold * on);
        col *= core * (1.0 - fogF(vDepth) * 0.35);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });

  let textInfo: { L: Layout; data: Uint8ClampedArray; WX: (p: number) => number; WZ: (p: number) => number } | null = null;
  function buildText(Lx: Layout) {
    textGroup.children.slice().forEach((ob) => { (ob as Mesh).geometry.dispose(); textGroup.remove(ob); });
    textMatFill.uniforms.uMask.value?.dispose(); textMatFill.uniforms.uId.value?.dispose();
    const cv = drawMask(Lx);
    const tex = new CanvasTexture(cv);
    tex.anisotropy = maxAniso; tex.minFilter = LinearMipmapLinearFilter; tex.generateMipmaps = true;
    textMatFill.uniforms.uMask.value = tex;
    const idTex = new CanvasTexture(Lx.idCanvas!);
    idTex.minFilter = idTex.magFilter = NearestFilter; idTex.generateMipmaps = false;
    textMatFill.uniforms.uId.value = idTex;
    const xLeft = AR ? -startOf(Lx) - (Lx.cw - PAD) * K : startOf(Lx) - PAD * K; // world x of the mask's left edge
    const zT = zTop - PAD * K;                                   // world z of the mask's top edge
    const WX = (px: number) => xLeft + px * K, WZ = (py: number) => zT + py * K;
    const plane = new Mesh(new PlaneGeometry(Lx.cw * K, Lx.ch * K), textMatFill);
    plane.rotation.x = -Math.PI / 2; plane.position.set(xLeft + (Lx.cw * K) / 2, 0.016, zT + (Lx.ch * K) / 2);
    textGroup.add(plane);
    Lx.words.forEach((w, i) => textMatFill.uniforms.uRect.value[i].set(w.cx0 / Lx.cw, w.cy0 / Lx.ch, w.cx1 / Lx.cw, w.cy1 / Lx.ch));
    textMatFill.uniforms.uNW.value = Lx.words.length;

    const data = cv.getContext("2d")!.getImageData(0, 0, Lx.cw, Lx.ch).data;
    const loops = traceOutlines(data, Lx.cw, Lx.ch);
    const P: number[] = [], A: number[] = [], T: number[] = [], I: number[] = []; let n = 0;
    const RW = 0.05;
    for (const loop of loops) {
      let x0 = 1e9, x1 = -1e9, sx = 0, sy = 0;
      for (const [x, y] of loop) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); sx += x; sy += y; }
      sx /= loop.length; sy /= loop.length;
      let wi = Lx.words.findIndex((w) => sx >= w.cx0 - 4 && sx <= w.cx1 + 4 && sy >= w.cy0 && sy <= w.cy1);
      if (wi < 0) wi = 0;
      const w = Lx.words[wi], ww = w.cx1 - w.cx0;
      const s = clamp01(AR ? (w.cx1 - x1) / ww : (x0 - w.cx0) / ww);
      let len = 0; for (let i = 0; i < loop.length; i++) { const a = loop[i], b = loop[(i + 1) % loop.length]; len += Math.hypot(b[0] - a[0], b[1] - a[1]); }
      let d = 0;
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i], b = loop[(i + 1) % loop.length];
        const ax = WX(a[0]), az = WZ(a[1]), bx = WX(b[0]), bz = WZ(b[1]);
        const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz); if (l < 1e-5) continue;
        const nx = (-dz / l) * RW * 0.5, nz = (dx / l) * RW * 0.5;
        P.push(ax - nx, 0.022, az - nz, ax + nx, 0.022, az + nz, bx - nx, 0.022, bz - nz, bx + nx, 0.022, bz + nz);
        A.push(-1, 1, -1, 1);
        const t0 = d / len, t1 = (d + Math.hypot(b[0] - a[0], b[1] - a[1])) / len;
        const g0 = (AR ? 1 - a[0] / Lx.cw : a[0] / Lx.cw) * 0.75 + (a[1] / Lx.ch) * 0.25;
        const g1 = (AR ? 1 - b[0] / Lx.cw : b[0] / Lx.cw) * 0.75 + (b[1] / Lx.ch) * 0.25;
        T.push(t0, wi, s, g0, t0, wi, s, g0, t1, wi, s, g1, t1, wi, s, g1);
        I.push(n, n + 1, n + 2, n + 2, n + 1, n + 3); n += 4;
        d += Math.hypot(b[0] - a[0], b[1] - a[1]);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(P, 3));
    g.setAttribute("aAcross", new Float32BufferAttribute(A, 1));
    g.setAttribute("aTrace", new Float32BufferAttribute(T, 4));
    g.setIndex(I);
    textGroup.add(new Mesh(g, textMatLine));
    textInfo = { L: Lx, data, WX, WZ };
  }
  // The words map by reading order: the HTML spans are split the same way, so word i is span i.
  const wordIndex = () => L.words.map((_, i) => i);

  // ---------- state and loop ----------
  const state = { cam: o.poster ? 1 : 0, wp: new Float32Array(MAXW).fill(o.poster ? 1 : 0) };
  let dirty = true, raf = 0, last = performance.now(), lastRender = 0, lastSet = 0;
  let waveT = o.poster ? 10 : 0, visible = !document.hidden, inView = true, lost = false, dead = false;
  const tmpT = new Vector3();
  const stats = { buildMs: 0, renders: [] as number[], towers: towers.length, layout: "wide" as "wide" | "narrow", dpr: renderer.getPixelRatio() };

  function apply() {
    const p = state.cam;
    camera.position.copy(camPos.getPoint(p)); camera.lookAt(tmpT.copy(camTgt.getPoint(p)));
    shared.uFog.value = 0.03 - 0.014 * smooth(0.45, 1, p);
    wordIndex().forEach((i) => (shared.uWP.value[i] = state.wp[i]));
    shared.uGoldBand.value = -0.3 + 1.7 * smooth(0.86, 0.97, p);
    shared.uLitReach.value = smooth(0.05, 0.85, p);
    const pw = shared.uPower.value * (1 + 0.5 * Math.sin(Math.PI * smooth(0.84, 0.94, p)));
    pinMat.color.setRGB(GOLD[0] * pw, GOLD[1] * pw, GOLD[2] * pw, SRGBColorSpace);
    glowA.material.opacity = pw; glowB.material.opacity = 0.6 * pw;
  }

  function frame(now: number) {
    raf = 0;
    if (dead || !visible || !inView || lost) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (waveT < 10) { // load moment: the chip powers up, then light runs out along the streets and feeders
      waveT += dt;
      shared.uPower.value = smooth(0.1, 0.7, waveT);
      shared.uWave.value = waveT < 0.5 ? 0 : Math.pow((waveT - 0.5) / 2.6, 1.6) * WAVE_END;
      if (shared.uWave.value >= WAVE_END) waveT = 10;
      dirty = true;
    }
    // Time decorates: the quiet pulses along the streets redraw at ~30 fps; scroll redraws every frame.
    if (dirty || now - lastSet < 400 || now - lastRender > 32) {
      shared.uTime.value = now / 1000;
      apply();
      const r0 = performance.now();
      renderer.render(scene, camera);
      if (stats.renders.length < 600) stats.renders.push(performance.now() - r0);
      lastRender = now; dirty = false;
      if (!canvas.classList.contains("on")) { canvas.classList.add("on"); canvas.dispatchEvent(new Event("scene-ready", { bubbles: true })); }
    }
    raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf && !dead && visible && inView && !lost) { last = performance.now(); raf = requestAnimationFrame(frame); } }

  const onVis = () => { visible = !document.hidden; if (visible) { dirty = true; kick(); } };
  document.addEventListener("visibilitychange", onVis);
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); lost = true; canvas.classList.remove("on"); canvas.dispatchEvent(new Event("scene-lost", { bubbles: true })); });
  canvas.addEventListener("webglcontextrestored", () => { lost = false; dirty = true; kick(); });

  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    renderer.setPixelRatio(o.poster ? devicePixelRatio : dprCap()); renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.fov = camera.aspect < 1 ? 56 : 40; camera.updateProjectionMatrix();
    shared.uPx.value = renderer.getPixelRatio() * (h / 900);
    const want = isNarrow() ? LN : LW;
    if (want !== L || !textInfo) { L = want; buildText(L); }
    stats.layout = L === LN && LN !== LW ? "narrow" : "wide"; stats.dpr = renderer.getPixelRatio();
    buildPath();
    dirty = true; kick();
  }

  if (o.poster) { shared.uPower.value = 1; shared.uWave.value = WAVE_END; shared.uTime.value = 7.3; }
  await breathe();
  if (dead) return null;
  resize();
  stats.buildMs = +(performance.now() - t0).toFixed(1);
  if (o.poster) { apply(); renderer.render(scene, camera); canvas.classList.add("on"); }
  else kick();

  // Measurement for the checks: letter-interior and between-letter points projected to the screen (CSS px),
  // and each line's cap height in pixels. Uses the same mask the letters are drawn from.
  function probe(n = 1500) {
    const out = { fg: [] as number[][], bg: [] as number[][], cap: [] as number[] };
    if (!textInfo) return out;
    const { L: Lx, data, WX, WZ } = textInfo; const w = Lx.cw;
    const at = (x: number, y: number) => data[(y * w + x) * 4];
    const r = canvas.getBoundingClientRect();
    const scr = (px: number, py: number) => { const q = V(WX(px), 0.016, WZ(py)).project(camera); return [r.left + (q.x + 1) / 2 * r.width, r.top + (1 - q.y) / 2 * r.height]; };
    let guard = 0;
    while ((out.fg.length < n || out.bg.length < n) && guard++ < n * 400) {
      const word = Lx.words[Math.floor(Math.random() * Lx.words.length)];
      const x = Math.floor(word.cx0 + Math.random() * (word.cx1 - word.cx0)), y = Math.floor(word.cy0 + Math.random() * (word.cy1 - word.cy0));
      const rr = 5; const v = [at(x, y), at(x - rr, y), at(x + rr, y), at(x, y - rr), at(x, y + rr)];
      if (v.every((a) => a > 250) && out.fg.length < n) out.fg.push(scr(x, y));
      else if (v.every((a) => a === 0) && out.bg.length < n) out.bg.push(scr(x, y));
    }
    Lx.lines.forEach((_, i) => {
      const ws = Lx.words.filter((wd) => wd.line === i); const xm = (ws[0].cx0 + ws[ws.length - 1].cx1) / 2;
      const yb = PAD + i * Lx.LH + Lx.base;
      const a = scr(xm, yb), b = scr(xm, yb - Lx.cap);
      out.cap.push(+Math.hypot(a[0] - b[0], a[1] - b[1]).toFixed(1));
    });
    return out;
  }

  return {
    set(cam, words) {
      state.cam = clamp01(cam);
      for (let i = 0; i < Math.min(MAXW, words.length); i++) state.wp[i] = clamp01(words[i]);
      lastSet = performance.now(); dirty = true; kick();
    },
    resize,
    setVisible(on) { inView = on; if (on) { dirty = true; kick(); } },
    destroy() {
      dead = true; if (raf) cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      scene.traverse((ob) => { const m = ob as Mesh; m.geometry?.dispose(); });
      renderer.dispose();
    },
    words: () => L.words.map((_, i) => +shared.uWP.value[i].toFixed(3)),
    cam: () => +state.cam.toFixed(3),
    chip() {
      let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
      for (const [x, z] of [[-1.72, -1.72], [1.72, -1.72], [-1.72, 1.72], [1.72, 1.72]]) for (const y of [0, 1.2]) {
        const q = V(x, y, z).project(camera); const sx = (q.x + 1) / 2, sy = (1 - q.y) / 2;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      }
      return { x0: +x0.toFixed(3), x1: +x1.toFixed(3), y0: +y0.toFixed(3), y1: +y1.toFixed(3) };
    },
    probe,
    stats,
  };
}
