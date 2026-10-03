import { test } from "node:test";
import assert from "node:assert/strict";
import { buildManifest, overBudget } from "../scripts/build-sequence.mjs";
import { parseManifest } from "../src/film/frames.ts";

test("manifest counts frames and uses the zero-padded pattern", () => {
  const m = buildManifest("hero", ["frame-0001.webp", "frame-0002.webp"], 1920, 1080);
  assert.deepEqual(m, { id: "hero", frames: 2, pattern: "frame-{n}.webp", poster: "frame-0001.webp", width: 1920, height: 1080 });
});

test("a gap in the numbering is refused", () => {
  assert.throws(() => buildManifest("hero", ["frame-0001.webp", "frame-0003.webp"], 1920, 1080), /missing frame-0002/);
});

test("the budget check fails above the limit and passes at it", () => {
  assert.equal(overBudget([600_000, 500_000], 1000), true);
  assert.equal(overBudget([500_000, 500_000], 1000), false);
});

test("the manifest build-sequence writes is one the site accepts", () => {
  const files = Array.from({ length: 48 }, (_, i) => `frame-${String(i + 1).padStart(4, "0")}.webp`);
  const m = buildManifest("hero", ["manifest.json", ...files.reverse()], 1920, 1080);
  assert.deepEqual(parseManifest(JSON.parse(JSON.stringify(m))), m);
  assert.equal(m.frames, 48);
});
