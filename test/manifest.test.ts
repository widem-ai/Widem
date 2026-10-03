import { test } from "node:test";
import assert from "node:assert/strict";
import { parseManifest } from "../src/film/frames.ts";

const good = { id: "hero", frames: 3, pattern: "frame-{n}.png", poster: "poster.png", width: 1920, height: 1080 };

test("a well-formed manifest parses to itself", () => {
  assert.deepEqual(parseManifest(good), good);
});

test("a malformed manifest throws instead of reaching the canvas", () => {
  const bad: unknown[] = [
    null, "hero", [],
    { ...good, frames: 0 }, { ...good, frames: 2.5 }, { ...good, frames: "3" }, { ...good, frames: -1 },
    { ...good, pattern: "frame.png" }, { ...good, pattern: 7 },
    { ...good, poster: "" }, { ...good, poster: undefined },
    { ...good, width: 0 }, { ...good, height: Number.NaN }, { ...good, width: "1920" },
  ];
  for (const b of bad) assert.throws(() => parseManifest(b), /manifest/, JSON.stringify(b));
});
