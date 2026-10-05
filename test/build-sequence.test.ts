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

// Review fix round 1: the budget flag, an empty folder and stray files.
import { parseBudgetKb } from "../scripts/build-sequence.mjs";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

test("--budget-kb: absent means 6000, a plain number is read, anything else is refused", () => {
  assert.equal(parseBudgetKb(["hero", "dir"]), 6000);
  assert.equal(parseBudgetKb(["hero", "dir", "--budget-kb", "6000"]), 6000);
  assert.throws(() => parseBudgetKb(["hero", "dir", "--budget-kb", "6,000"]), /--budget-kb/);
  assert.throws(() => parseBudgetKb(["hero", "dir", "--budget-kb"]), /--budget-kb/);
  assert.throws(() => parseBudgetKb(["hero", "dir", "--budget-kb", "0"]), /--budget-kb/);
});

test("a folder with no frames is refused", () => {
  assert.throws(() => buildManifest("hero", ["manifest.json", "notes.txt"], 1920, 1080), /no frame-####\.webp/);
});

// The CLI writes to public/film/<id> under its working directory, so it runs in a temp folder.
const SCRIPT = fileURLToPath(new URL("../scripts/build-sequence.mjs", import.meta.url));
const run = (cwd: string, args: string[]) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: "utf8" });
const sandbox = () => {
  const cwd = mkdtempSync(join(tmpdir(), "build-seq-"));
  const out = join(cwd, "public", "film", "t");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "keep.txt"), "previous build");
  const src = join(cwd, "src-frames");
  mkdirSync(src);
  return { cwd, out, src };
};

test("CLI: an empty folder or a bad budget fails before the previous build is touched", () => {
  const empty = sandbox();
  const r1 = run(empty.cwd, ["t", empty.src]);
  assert.notEqual(r1.status, 0);
  assert.ok(existsSync(join(empty.out, "keep.txt")), "empty folder: previous build was deleted");
  const bad = sandbox();
  writeFileSync(join(bad.src, "frame-0001.webp"), "x");
  const r2 = run(bad.cwd, ["t", bad.src, "--budget-kb", "6,000"]);
  assert.notEqual(r2.status, 0);
  assert.ok(existsSync(join(bad.out, "keep.txt")), "bad budget: previous build was deleted");
});

test("CLI: only frame-####.webp files are budgeted and copied", () => {
  const s = sandbox();
  writeFileSync(join(s.src, "frame-0001.webp"), "x".repeat(100));
  writeFileSync(join(s.src, "frame-0001-old.webp"), "x".repeat(5000)); // stray: would break a 1 KB budget
  const r = run(s.cwd, ["t", s.src, "--budget-kb", "1"]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(readdirSync(s.out).sort(), ["frame-0001.webp", "manifest.json"]);
});
