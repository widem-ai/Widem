// Renders the hero poster masters from the three.js scene itself, at rest, with no headline on the board (the
// headline over the poster is the HTML <h1>): `npm run build && node scripts/poster.mjs && python art/export.py`.
// Writes art/scene-wide.png (1680x945) and art/scene-tall.png (900x1600), both at 2x, for art/export.py to encode.
// The page renders the poster when it is opened with ?poster (Hero.tsx); this script only frames and saves it.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "./lib/cdp.mjs";
import { startServer } from "./serve.mjs";

const ART = join(dirname(fileURLToPath(import.meta.url)), "..", "art");
const JOBS = [["scene-wide", 1680, 945], ["scene-tall", 900, 1600]];
const { server, port } = await startServer(0);
const page = await launch();
try {
  for (const [name, width, height] of JOBS) {
    await page.emulate({ width, height, reduce: true });
    await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: false });
    await page.goto(`http://127.0.0.1:${port}/Widem/?poster`);
    let ok = false;
    for (let i = 0; i < 80 && !ok; i++) {
      await page.wait(150);
      ok = await page.evaluate(`document.getElementById("hero")?.__sceneState === "running" && document.querySelector("#hero .hero-scene.on") !== null`);
    }
    if (!ok) throw new Error(`${name}: the scene never rendered (state ${await page.evaluate(`document.getElementById("hero")?.__sceneState`)})`);
    // Only the canvas, full screen, no fade.
    await page.evaluate(`(() => { const s = document.createElement("style");
      s.textContent = "body * { visibility: hidden !important; } #hero .hero-scene { visibility: visible !important; position: fixed !important; inset: 0 !important; opacity: 1 !important; transition: none !important; z-index: 9999; }";
      document.head.append(s); window.scrollTo(0, 0); return true; })()`);
    await page.wait(400);
    const shot = await page.screenshot();
    const file = join(ART, `${name}.png`);
    writeFileSync(file, Buffer.from(shot.split(",")[1], "base64"));
    console.log(`${file}  (${width}x${height} at 2x)`);
  }
} finally {
  await page.close();
  await new Promise((r) => server.close(r));
}
