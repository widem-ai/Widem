// The one check command: `npm run build` then `npm run check`. Exit 1 on any failure.
import { launch } from "./lib/cdp.mjs";
import { startServer } from "./serve.mjs";
import { readFileSync } from "node:fs";

const failures = [];
const expect = (ok, msg) => { if (!ok) failures.push(msg); };
const ORDER = ["hero", "familiar", "proof", "how", "compare", "founder", "questions", "final"];

const { server, port } = await startServer(0);
const page = await launch();
try {
  for (const [lang, path, dir] of [["en", "/Widem/", "ltr"], ["ar", "/Widem/ar/", "rtl"]]) {
    await page.emulate({ width: 1440 });
    await page.goto(`http://127.0.0.1:${port}${path}`);
    await page.wait(500);
    const ids = await page.evaluate(`[...document.querySelectorAll("[data-section]")].map(s => s.dataset.section)`);
    expect(JSON.stringify(ids) === JSON.stringify(ORDER), `${lang}: sections ${JSON.stringify(ids)}`);
    expect(await page.evaluate(`document.documentElement.dir`) === dir, `${lang}: dir is not ${dir}`);
  }

  // Hero: pinned, scroll-scrubbed frame sequence (Task 3).
  const HERO_FRAMES = JSON.parse(readFileSync(new URL("../public/film/hero/manifest.json", import.meta.url), "utf8")).frames;
  await page.emulate({ width: 1440, height: 900 });
  await page.goto(`http://127.0.0.1:${port}/Widem/`);
  await page.wait(800);
  const frame = () => page.evaluate(`Number(document.querySelector("canvas[data-film=hero]")?.dataset.frame ?? -1)`);
  // The frame the current scroll position should show: the pin starts at 0 and lasts 3 viewport heights.
  const expectedFrame = () => page.evaluate(`Math.min(${HERO_FRAMES} - 1, Math.floor(Math.min(1, Math.max(0, scrollY / (3 * innerHeight))) * ${HERO_FRAMES}))`);
  const scrollTo = async (y) => { await page.evaluate(`window.scrollTo(0, ${y})`); await page.wait(400); };
  // While pinned, GSAP wraps the hero in a .pin-spacer that holds the whole scrub length.
  const pinEnd = await page.evaluate(`(() => { const s = document.querySelector("[data-section=hero]"); const box = s.closest(".pin-spacer") ?? s; return box.offsetTop + box.offsetHeight; })()`);

  expect(await frame() === 0, "hero: not on frame 0 at the top");
  await scrollTo(pinEnd * 0.9);
  expect(await frame() > 0, "hero: frame did not advance with the scroll");
  // Review focus 1: fling to the bottom and back to the top
  await scrollTo(999999); await scrollTo(0);
  expect(await frame() === 0, "hero: stale frame after a fling back to the top");
  // The pin releases: the next section reaches the top of the viewport after the hero
  await scrollTo(pinEnd + 10);
  const nextTop = await page.evaluate(`document.querySelector("[data-section=familiar]").getBoundingClientRect().top`);
  expect(nextTop <= 20, `hero: pin did not release (familiar top ${nextTop})`);
  // Review focus 2: resize while pinned recalculates, no overlap
  await scrollTo(pinEnd * 0.5);
  await page.emulate({ width: 390, height: 844 });
  await page.wait(600);
  const overlap = await page.evaluate(`(() => { const h = document.querySelector("[data-section=hero]").getBoundingClientRect(); const f = document.querySelector("[data-section=familiar]").getBoundingClientRect(); return f.top < h.bottom - 1 && f.top < window.innerHeight; })()`);
  expect(!overlap, "hero: familiar overlaps the hero after a resize");
  // Review focus 2, scrub range: park just below a frame boundary at 1440x900, resize to 390x844 without
  // scrolling; the shorter range must move the frame across that boundary.
  await page.emulate({ width: 1440, height: 900 });
  await page.wait(600);
  await scrollTo(Math.floor(((HERO_FRAMES - 1) / HERO_FRAMES) * 3 * 900) - 40);
  const before = await frame();
  await page.emulate({ width: 390, height: 844 });
  await page.wait(600);
  const [after, want] = [await frame(), await expectedFrame()];
  expect(after === want && after !== before, `hero: frame ${after} after a resize, scroll says ${want} (was ${before})`);
  // A resize at the top keeps frame 0, so only a redraw on resize can fit the canvas to its new box.
  await page.emulate({ width: 1440, height: 900 });
  await scrollTo(0); await page.wait(400);
  await page.emulate({ width: 390, height: 844 });
  await page.wait(600);
  const buf = await page.evaluate(`(() => { const c = document.querySelector("canvas[data-film=hero]"); return [c.width, c.clientWidth, Number(c.dataset.frame)]; })()`);
  expect(buf[0] === buf[1], `hero: canvas buffer ${buf[0]}px wide in a ${buf[1]}px box after a resize on frame ${buf[2]} (stretched frame)`);
  // The box can change with no scroll or viewport event (layout shift, font swap): the frame must refit.
  await page.evaluate(`document.querySelector("canvas[data-film=hero]").style.width = "50%"`); await page.wait(300);
  const half = await page.evaluate(`(() => { const c = document.querySelector("canvas[data-film=hero]"); return [c.width, c.clientWidth]; })()`);
  expect(half[0] === half[1], `hero: canvas buffer ${half[0]}px wide in a ${half[1]}px box after a box change (stretched frame)`);
  // Review focus 4: reload mid-hero restores the matching frame
  await page.emulate({ width: 1440, height: 900 });
  await page.goto(`http://127.0.0.1:${port}/Widem/`); await page.wait(800);
  await scrollTo(pinEnd * 0.9);
  await page.goto(`http://127.0.0.1:${port}/Widem/`); await page.wait(1200);
  const y = await page.evaluate(`window.scrollY`);
  expect(y === 0 || await frame() > 0, "hero: after reload mid-hero the frame does not match the scroll position");
  expect(await frame() === await expectedFrame(), `hero: after reload at y=${y} frame ${await frame()}, scroll says ${await expectedFrame()}`);
  expect(page.errors.length === 0, `console errors: ${page.errors.join(" | ")}`);
} finally {
  await page.close();
  server.close();
}
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log("check: all pass");
