// usage: node scripts/build-sequence.mjs <id> <framesDir> [--budget-kb N]
// Copies Blender's WebP frames into public/film/<id>/ and writes the manifest the site reads.
import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** The frame files in a folder, in order. Only these are budgeted, copied and counted. */
export const frameFiles = (files) => files.filter((f) => /^frame-\d{4}\.webp$/.test(f)).sort();

export function buildManifest(id, files, width, height) {
  const frames = frameFiles(files);
  if (frames.length === 0) throw new Error("no frame-####.webp files in the folder");
  frames.forEach((f, i) => {
    const want = `frame-${String(i + 1).padStart(4, "0")}.webp`;
    if (f !== want) throw new Error(`missing ${want.replace(".webp", "")}`);
  });
  return { id, frames: frames.length, pattern: "frame-{n}.webp", poster: frames[0], width, height };
}

export const overBudget = (sizes, budgetKb) => sizes.reduce((a, b) => a + b, 0) > budgetKb * 1000;

/** The budget in KB: 6000 without the flag; a missing, non-numeric or non-positive value is refused. */
export function parseBudgetKb(args) {
  const i = args.indexOf("--budget-kb");
  if (i === -1) return 6000;
  const raw = args[i + 1];
  const kb = /^\d+(\.\d+)?$/.test(raw ?? "") ? Number(raw) : NaN;
  if (!(kb > 0)) throw new Error(`--budget-kb needs a positive number of KB, got ${raw ?? "nothing"}`);
  return kb;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const [id, dir] = args;
  try {
    // Everything that can refuse runs before the previous build is removed.
    const budgetKb = parseBudgetKb(args);
    const files = readdirSync(dir);
    const m = buildManifest(id, files, 1920, 1080);
    const frames = frameFiles(files);
    const total = frames.map((f) => statSync(join(dir, f)).size).reduce((a, b) => a + b, 0);
    if (overBudget([total], budgetKb)) throw new Error(`${Math.round(total / 1000)} KB over the ${budgetKb} KB budget`);
    const out = join("public", "film", id);
    rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
    for (const f of frames) copyFileSync(join(dir, f), join(out, f));
    writeFileSync(join(out, "manifest.json"), JSON.stringify(m, null, 2) + "\n");
    console.log(`${id}: ${m.frames} frames, ${Math.round(total / 1000)} KB`);
  } catch (e) {
    console.error(`${id}: ${e.message}`);
    process.exit(1);
  }
}
