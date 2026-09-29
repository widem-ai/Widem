// The hero's circuit background, ported from the v5 prototype (drawBg): random right-angle traces on a
// 34px grid, a few pulses running along them, and a power-on wave that brightens traces as it passes
// outward from behind the headline. Canvas drawing, so no DOM property animates (ARCHITECTURE §4).
// Size comes from src/scroll/ (layout size, never a transformed box); colours from tokens.css.
import { gsap } from "gsap";
import { observeSize, observeVisible } from "../../scroll/measure.ts";
import { onThemeChange, token } from "../../motion/env.ts";

const GRID = 34;              // px between trace nodes
const TRACE_DENSITY = 14;     // one trace per this many grid cells
const MAX_PULSES = 30;
const WAVE_SPEED = 1.3;       // px per ms, the power-on wave's radius growth
const WAVE_WIDTH = 90;        // px, how far either side of the wave front a trace is lit
const ORIGIN_Y = 0.42;        // wave origin, as a share of the hero's height (behind the headline)
const TAIL = 7;               // dots in a pulse's tail

type Pt = [number, number];
type Trace = { pts: Pt[]; dist: number };
type Pulse = { t: number; p: number; v: number };

const rnd = (n: number) => Math.floor(Math.random() * n);

export type Circuit = { startWave(): void; destroy(): void };

/** Starts drawing into `canvas`. With `animate` false it draws one still frame (reduced motion). */
export function createCircuit(canvas: HTMLCanvasElement, animate: boolean): Circuit {
  const cx = canvas.getContext("2d");
  if (!cx) return { startWave() {}, destroy() {} };

  let W = 0, H = 0, traces: Trace[] = [], pulses: Pulse[] = [], wave0: number | null = null, visible = true;
  let colors = readColors();

  function readColors() {
    return { trace: token("--trace"), node: token("--trace-node"), pulse: token("--pulse") };
  }

  function makeTraces() {
    traces = []; pulses = [];
    const cols = Math.ceil(W / GRID), rows = Math.ceil(H / GRID), count = Math.round((cols * rows) / TRACE_DENSITY);
    for (let i = 0; i < count; i++) {
      let x = rnd(cols), y = rnd(rows), dir = rnd(4);
      const cells: Pt[] = [[x, y]], len = 3 + rnd(9);
      for (let s = 0; s < len; s++) {
        if (Math.random() < 0.3) dir = (dir + (Math.random() < 0.5 ? 1 : 3)) % 4;
        x += [1, 0, -1, 0][dir]; y += [0, 1, 0, -1][dir];
        cells.push([x, y]);
      }
      const pts = cells.map(([a, b]): Pt => [a * GRID, b * GRID]);
      traces.push({ pts, dist: Math.hypot(pts[0][0] - W / 2, pts[0][1] - H * ORIGIN_Y) });
    }
    for (let k = 0; k < Math.min(MAX_PULSES, traces.length); k++) pulses.push({ t: rnd(traces.length), p: Math.random(), v: 0.004 + Math.random() * 0.006 });
  }

  function pointAt(pts: Pt[], p: number): Pt {
    const n = pts.length - 1, f = p * n, i = Math.min(Math.floor(f), n - 1), r = f - i;
    return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * r, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * r];
  }

  function draw(now: number) {
    if (!cx) return;
    cx.clearRect(0, 0, W, H);
    const R = wave0 === null ? -1 : (now - wave0) * WAVE_SPEED;
    for (const { pts, dist } of traces) {
      const boost = R < 0 ? 0 : Math.max(0, 1 - Math.abs(dist - R) / WAVE_WIDTH);
      cx.strokeStyle = boost > 0.02 ? `rgba(${colors.pulse},${0.25 + boost * 0.7})` : colors.trace;
      cx.lineWidth = 1 + boost;
      cx.beginPath(); cx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) cx.lineTo(pts[i][0], pts[i][1]);
      cx.stroke();
      cx.fillStyle = colors.node; cx.fillRect(pts[0][0] - 1.5, pts[0][1] - 1.5, 3, 3);
    }
    cx.lineWidth = 1;
    for (const pu of pulses) {
      const tr = traces[pu.t];
      if (!tr) continue;
      for (let j = 0; j < TAIL; j++) {
        const q = pu.p - j * 0.018;
        if (q < 0) break;
        const [px, py] = pointAt(tr.pts, q);
        cx.fillStyle = `rgba(${colors.pulse},${0.8 - j * 0.11})`;
        cx.beginPath(); cx.arc(px, py, j ? 1.6 : 2.2, 0, Math.PI * 2); cx.fill();
      }
    }
    if (wave0 !== null && R > Math.hypot(W, H) + WAVE_WIDTH) wave0 = null; // wave has left the screen
  }

  // One frame of motion: pulses advance at the same speed whatever the display's refresh rate.
  function tick() {
    if (!visible || document.hidden) return;
    const k = gsap.ticker.deltaRatio(60);
    for (const pu of pulses) {
      pu.p += pu.v * k;
      if (pu.p > 1) { pu.p = 0; pu.t = rnd(traces.length); }
    }
    draw(performance.now());
  }

  const stopSize = observeSize(canvas, ({ width, height }) => {
    const D = Math.min(window.devicePixelRatio || 1, 2);
    W = width; H = height;
    canvas.width = Math.round(W * D); canvas.height = Math.round(H * D);
    cx.setTransform(D, 0, 0, D, 0, 0);
    makeTraces();
    draw(performance.now());
  });
  const stopTheme = onThemeChange(() => { colors = readColors(); draw(performance.now()); });
  const stopVisible = animate ? observeVisible(canvas, (v) => { visible = v; }) : () => {};
  if (animate) gsap.ticker.add(tick);

  return {
    startWave() { if (animate) wave0 = performance.now(); },
    destroy() {
      gsap.ticker.remove(tick);
      stopSize(); stopTheme(); stopVisible();
    },
  };
}
