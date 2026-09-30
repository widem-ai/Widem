// Screenshots of the built hero for a human (or Alfred) to look at: `node scripts/shots.mjs [outDir]`.
// Not a check: nothing here passes or fails.
// Part 1, reduced motion: each shot is the scene's final state (the poster), per width, language and theme.
// Part 2, motion on: the pinned 3D story at 0, 25, 50, 75 and 100% of its scroll, 1440x900 and 390x844, EN and AR.
// A screenshot is not motion: a person still has to watch it move.
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
const STORY = [["en", 1440, 900], ["ar", 1440, 900], ["en", 390, 844], ["ar", 390, 844]];
const { server, port } = await startServer(0);
const page = await launch();
const url = (lang) => `http://127.0.0.1:${port}/Widem/${lang === "ar" ? "ar/" : ""}`;
const save = async (name) => {
  const shot = await page.screenshot();
  const file = join(out, name);
  writeFileSync(file, Buffer.from(shot.split(",")[1], "base64"));
  console.log(file);
};
for (const [lang, width, height, theme] of SHOTS) {
  await page.emulate({ width, height, reduce: true });
  await page.goto(url(lang));
  await page.evaluate(`document.documentElement.setAttribute("data-theme", "${theme}")`);
  await page.evaluate(`document.fonts.ready.then(() => true)`);
  await page.wait(700);
  await save(`hero-${lang}-${width}x${height}-${theme}.png`);
}
for (const [lang, width, height] of STORY) {
  await page.emulate({ width, height });
  await page.goto(url(lang));
  await page.evaluate(`document.fonts.ready.then(() => true)`);
  // Wait for the scene to fade in over the poster, then past the load moment (the chip powering up).
  for (let i = 0; i < 60 && !(await page.evaluate(`document.getElementById("hero").classList.contains("scene-on")`)); i++) await page.wait(200);
  await page.wait(3400);
  console.log(lang, width, await page.evaluate(`JSON.stringify({ state: document.getElementById("hero").__sceneState, stats: (({ buildMs, towers, layout, dpr }) => ({ buildMs, towers, layout, dpr }))(document.getElementById("hero").__scene?.stats ?? {}) })`));
  for (const p of [0, 25, 50, 75, 100]) {
    // The pinned range: the track's height minus the sticky hero's own.
    await page.evaluate(`(() => { const h = document.getElementById("hero"), sp = h.parentElement;
      const range = sp.offsetHeight - h.offsetHeight;
      window.scrollTo({ top: sp.getBoundingClientRect().top + scrollY + range * ${p / 100}, behavior: "instant" }); })()`);
    await page.wait(900);
    await save(`story-${lang}-${width}x${height}-${String(p).padStart(3, "0")}.png`);
  }
}
await page.close();
await new Promise((r) => server.close(r));
