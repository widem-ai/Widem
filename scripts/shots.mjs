// Screenshots of the built hero for a human (or Alfred) to look at: `node scripts/shots.mjs [outDir]`.
// Not a check: nothing here passes or fails. Reduced motion, so each shot is the scene's final state.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch } from "./lib/cdp.mjs";
import { startServer } from "./serve.mjs";

const out = process.argv[2] ?? "shots";
mkdirSync(out, { recursive: true });
const SHOTS = [
  ["en", 1440, 900, "dark"], ["ar", 1440, 900, "dark"], ["en", 1920, 1080, "dark"], ["en", 1280, 800, "dark"],
  ["en", 390, 780, "dark"], ["ar", 390, 780, "dark"], ["ar", 768, 1024, "dark"], ["en", 1440, 900, "light"],
];
const { server, port } = await startServer(0);
const page = await launch();
for (const [lang, width, height, theme] of SHOTS) {
  await page.emulate({ width, height, reduce: true });
  await page.goto(`http://127.0.0.1:${port}/Widem/${lang === "ar" ? "ar/" : ""}`);
  await page.evaluate(`document.documentElement.setAttribute("data-theme", "${theme}")`);
  await page.evaluate(`document.fonts.ready.then(() => true)`);
  await page.wait(700);
  const shot = await page.screenshot();
  const file = join(out, `hero-${lang}-${width}x${height}-${theme}.png`);
  writeFileSync(file, Buffer.from(shot.split(",")[1], "base64"));
  console.log(file);
}
await page.close();
await new Promise((r) => server.close(r));
