import { test } from "node:test";
import assert from "node:assert/strict";
import { frameAt, frameUrl, nearestLoaded, requestOrder, type Manifest } from "../src/film/frames.ts";

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

test("nearestLoaded picks the closest loaded frame, never a farther one", () => {
  const loaded = Array.from({ length: 48 }, (_, i) => i === 0 || i === 21 || i === 30);
  assert.equal(nearestLoaded(22, loaded), 21); // frame 0 is loaded too, but 21 is closer
  assert.equal(nearestLoaded(27, loaded), 30);
  assert.equal(nearestLoaded(2, loaded), 0);
  assert.equal(nearestLoaded(25, Array.from({ length: 48 }, (_, i) => i === 24 || i === 26)), 24); // tie: earlier
  assert.equal(nearestLoaded(5, new Array(48).fill(false)), -1);
});

test("requestOrder starts at the wanted frame and goes outward, skipping what is done", () => {
  assert.deepEqual(requestOrder(24, 48, () => false).slice(0, 5), [24, 23, 25, 22, 26]);
  assert.deepEqual(requestOrder(0, 4, (i) => i === 1), [0, 2, 3]);
  assert.deepEqual(requestOrder(47, 48, () => false).slice(0, 2), [47, 46]);
});
