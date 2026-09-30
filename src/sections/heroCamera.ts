// Hero v4 (Mohannad, 2026-10-01): sketch v2's flight, played on the concept-C photograph. A photo has one
// viewpoint, so the camera is simulated: the photo is zoomed and panned (a 2D transform on .hero-art), and the
// headline is a plane laid on the board in the photo's own perspective (a CSS 3D transform on .hl whose horizon
// is matched to the photo's), which stands up toward the viewer as the view rises. Pure maths: one scroll
// progress p (0..1) in, two transform strings out. Layout comes in measured (src/scroll), never from here.
import type { Box } from "../scroll/measure.ts";

/** Where things are in the photo, as fractions of the master (art/hero-c-*.png): the chip's centre, the horizon. */
const PHOTO = {
  desktop: { chip: [0.495, 0.64], horizon: 0.39 },
  phone: { chip: [0.5, 0.745], horizon: 0.55 },
} as const;

export type Layout = {
  W: number; H: number; // the hero box (the art box is the same)
  art: { w: number; h: number }; // the displayed crop's pixel size (object-fit: cover, object-position 50% 100%)
  phone: boolean; rtl: boolean;
  hl: { x: number; y: number }; // .hl's layout position inside the hero
  words: Box[]; // word boxes inside .hl
  wordAt: (i: number) => number; // where word i starts powering on (0..1)
  wordDur: number;
};

type Key = [number, number][];
// Piecewise keyframes, eased between keys (smoothstep), flat outside them.
const key = (p: number, k: Key): number => {
  if (p <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    const [p1, v1] = k[i];
    if (p <= p1) {
      const [p0, v0] = k[i - 1];
      const t = (p - p0) / (p1 - p0), e = t * t * (3 - 2 * t);
      return v0 + (v1 - v0) * e;
    }
  }
  return k[k.length - 1][1];
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// The story's shape (v2's beats): glide low along line 1, rise and pull back through lines 2-3, rest at 0.8.
const SHOT = {
  desktop: {
    zoom: [[0, 2.1], [0.2, 2.3], [0.45, 1.8], [0.8, 1]] as Key,
    tilt: [[0, 72], [0.25, 64], [0.5, 54], [0.68, 34], [0.8, 0]] as Key, // the text plane: 90 = flat on the board, 0 = upright
    turn: [[0, -58], [0.25, -48], [0.5, -30], [0.8, 0]] as Key, // yaw on the board (reading direction away from the chip)
    size: [[0, 1.15], [0.22, 1.6], [0.55, 1.6], [0.8, 1]] as Key, // the letters loom as the view closes in (vector: stays sharp)
    lift: [[0, 0], [0.55, 0], [0.8, 1]] as Key, // 0 = lying beside the chip, 1 = standing at its rest place
    start: [0.26, 0.82], // where the chip sits on screen at 0%
    follow: [0.5, 0.55], // where the powering word is held while the view glides
    lie: [0.12, -0.01], // where line 1 starts on the board, from the chip (fractions of the drawn photo)
  },
  phone: {
    // The tall crop has little board between the chip and the horizon, so on phones the text lies in front of the
    // chip (nearer the viewer) and the view looks across it toward the chip.
    zoom: [[0, 1.9], [0.25, 1.9], [0.5, 1.5], [0.8, 1]] as Key,
    tilt: [[0, 70], [0.25, 62], [0.5, 48], [0.8, 0]] as Key,
    turn: [[0, -28], [0.25, -22], [0.5, -12], [0.8, 0]] as Key,
    size: [[0, 0.8], [0.5, 0.9], [0.8, 1]] as Key,
    lift: [[0, 0], [0.5, 0], [0.8, 1]] as Key,
    start: [0.58, 0.5],
    follow: [0.5, 0.55],
    lie: [-0.22, 0.1],
  },
};
const TRACK_IN: Key = [[0, 0], [0.1, 1]]; // from framing the chip to following the words
const RELEASE: Key = [[0.52, 0], [0.8, 1]]; // the camera returns to the whole picture

export function landmarks(l: Layout) {
  const c = Math.max(l.W / l.art.w, l.H / l.art.h), rw = l.art.w * c, rh = l.art.h * c;
  const ox = (l.W - rw) / 2, oy = l.H - rh;
  const ph = l.phone ? PHOTO.phone : PHOTO.desktop;
  return { chip: [ox + ph.chip[0] * rw, oy + ph.chip[1] * rh], horizon: oy + ph.horizon * rh, rw, rh };
}

export type Frame = { art: string; hl: string; scrim: number; scale: number };

export function frame(p: number, l: Layout): Frame {
  const shot = l.phone ? SHOT.phone : SHOT.desktop, sgn = l.rtl ? -1 : 1;
  const { chip, horizon, rw, rh } = landmarks(l);
  const w0 = l.words[0];
  if (!w0) return { art: "none", hl: "none", scrim: 1, scale: 1 };
  // The text plane's hinge: where line 1 begins (its reading start, at the baseline).
  const O = [l.rtl ? w0.x + w0.width : w0.x, w0.y + w0.height * 0.82];
  const rest = [l.hl.x + O[0], l.hl.y + O[1]];
  const lie = [chip[0] + sgn * shot.lie[0] * rw, chip[1] + shot.lie[1] * rh];
  const a0 = shot.tilt[0][1];
  // Perspective chosen so the plane, lying at its start angle, meets the photo's horizon.
  const P = Math.max(600, (lie[1] - horizon) * Math.tan((a0 * Math.PI) / 180));

  const a = key(p, shot.tilt), b = sgn * key(p, shot.turn), k = key(p, shot.size), u = key(p, shot.lift);
  const D = [lerp(lie[0], rest[0], u), lerp(lie[1], rest[1], u)];
  // Upright (at rest) the plane is flat on the screen: no perspective, so the text is drawn as plain 2D again.
  const tilt = Math.abs(a) < 0.01 && Math.abs(b) < 0.01 ? "" : `perspective(${P}px) rotateX(${a}deg) rotateZ(${b}deg) `;
  const pose = `translate(${D[0] - l.hl.x}px,${D[1] - l.hl.y}px) ${tilt}scale(${k}) translate(${-O[0]}px,${-O[1]}px)`;

  // The reading point: the centre of the word powering now, carried through the pose into the hero's coordinates.
  const n = l.words.length;
  const f = clamp((p - l.wordAt(0) - l.wordDur * 0.4) / Math.max(1e-6, l.wordAt(1) - l.wordAt(0)), 0, n - 1);
  const i0 = Math.floor(f), i1 = Math.min(n - 1, i0 + 1), fr = f - i0;
  const cx = (i: number) => [l.words[i].x + l.words[i].width / 2, l.words[i].y + l.words[i].height / 2];
  const q = [lerp(cx(i0)[0], cx(i1)[0], fr), lerp(cx(i0)[1], cx(i1)[1], fr)];
  let read = chip;
  if (typeof DOMMatrix !== "undefined") {
    const m = new DOMMatrix(pose).transformPoint(new DOMPoint(q[0], q[1], 0, 1));
    read = [l.hl.x + m.x / m.w, l.hl.y + m.y / m.w];
  }

  // The camera: zoom s about a focus point shown at a target point on screen; clamped so the photo always covers.
  const s = key(p, shot.zoom), tr = key(p, TRACK_IN), rel = key(p, RELEASE);
  const start = [l.rtl ? 1 - shot.start[0] : shot.start[0], shot.start[1]];
  const focus = [lerp(chip[0], read[0], tr), lerp(chip[1], read[1], tr)];
  const target = [lerp(start[0], shot.follow[0], tr) * l.W, lerp(start[1], shot.follow[1], tr) * l.H];
  const tx = lerp(clamp(target[0] - s * focus[0], l.W * (1 - s), 0), 0, rel);
  const ty = lerp(clamp(target[1] - s * focus[1], l.H * (1 - s), 0), 0, rel);

  return {
    art: `translate(${tx}px,${ty}px) scale(${s})`,
    hl: `translate(${tx + (s - 1) * l.hl.x}px,${ty + (s - 1) * l.hl.y}px) scale(${s}) ${pose}`,
    scrim: lerp(0.25, 1, rel),
    scale: s,
  };
}
