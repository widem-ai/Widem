// usage: node scripts/build-sequence.mjs <id> <framesDir> [--budget-kb N]
// Copies Blender's WebP frames into public/film/<id>/ and writes the manifest the site reads.
import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function buildManifest(id, files, width, height) {
  const frames = files.filter((f) => /^frame-\d{4}\.webp$/.test(f)).sort();
  frames.forEach((f, i) => {
    const want = `frame-${String(i + 1).padStart(4, "0")}.webp`;
    if (f !== want) throw new Error(`missing ${want.replace(".webp", "")}`);
  });
  return { id, frames: frames.length, pattern: "frame-{n}.webp", poster: frames[0], width, height };
}

export const overBudget = (sizes, budgetKb) => sizes.reduce((a, b) => a + b, 0) > budgetKb * 1000;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [id, dir] = process.argv.slice(2);
  const budgetKb = Number(process.argv[process.argv.indexOf("--budget-kb") + 1] || 6000);
  const files = readdirSync(dir);
  const m = buildManifest(id, files, 1920, 1080);
  const sizes = files.filter((f) => f.endsWith(".webp")).map((f) => statSync(join(dir, f)).size);
  if (overBudget(sizes, budgetKb)) { console.error(`${id}: ${Math.round(sizes.reduce((a, b) => a + b, 0) / 1000)} KB over the ${budgetKb} KB budget`); process.exit(1); }
  const out = join("public", "film", id);
  rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
  for (const f of files.filter((f) => f.endsWith(".webp"))) copyFileSync(join(dir, f), join(out, f));
  writeFileSync(join(out, "manifest.json"), JSON.stringify(m, null, 2) + "\n");
  console.log(`${id}: ${m.frames} frames, ${Math.round(sizes.reduce((a, b) => a + b, 0) / 1000)} KB`);
}
