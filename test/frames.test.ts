import { test } from "node:test";
import assert from "node:assert/strict";
import { frameAt, frameUrl, type Manifest } from "../src/film/frames.ts";

const m: Manifest = { id: "hero", frames: 48, pattern: "frame-{n}.webp", poster: "poster.webp", width: 1920, height: 1080 };

test("progress maps to a 0-based frame, clamped at both ends", () => {
  assert.equal(frameAt(0, 48), 0);
  assert.equal(frameAt(1, 48), 47);
  assert.equal(frameAt(0.5, 48), 24);
  assert.equal(frameAt(-0.2, 48), 0);
  assert.equal(frameAt(1.7, 48), 47);
  assert.equal(frameAt(Number.NaN, 48), 0);
});

test("a single-frame sequence always shows frame 0", () => {
  assert.equal(frameAt(0.9, 1), 0);
});

test("frame urls are 1-based and zero-padded to four digits", () => {
  assert.equal(frameUrl("/Widem/film/hero/", m, 0), "/Widem/film/hero/frame-0001.webp");
  assert.equal(frameUrl("/Widem/film/hero/", m, 47), "/Widem/film/hero/frame-0048.webp");
});

test("a frame holds until the next one is fully reached (floor, not round)", () => {
  assert.equal(frameAt(0.27, 48), 12); // 12.96 must not round up to 13
  assert.equal(frameAt(0.99, 3), 2);
  assert.equal(frameAt(0.6, 3), 1);    // 1.8 must not round up to 2
});
