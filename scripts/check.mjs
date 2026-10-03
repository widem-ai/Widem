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
  // The frame count comes from the manifest actually served (the build output), never a constant.
  const HERO = JSON.parse(readFileSync(new URL("../dist/film/hero/manifest.json", import.meta.url), "utf8"));
  const HERO_FRAMES = HERO.frames;
  expect(Number.isInteger(HERO_FRAMES) && HERO_FRAMES > 1, `hero: built manifest has ${HERO_FRAMES} frames`);
  // Mid-scrub probe: the centre of the middle frame at 1440x900, so a restore off by a few pixels still
  // names the same frame, and a reload that always shows the first or last frame fails.
  const MID_FRAME = Math.floor(HERO_FRAMES / 2);
  const MID_Y = Math.floor(((MID_FRAME + 0.5) / HERO_FRAMES) * 3 * 900);
  await page.emulate({ width: 1440, height: 900 });
  await page.goto(`http://127.0.0.1:${port}/Widem/`);
  await page.wait(800);
  const frame = () => page.evaluate(`Number(document.querySelector("canvas[data-film=hero]")?.dataset.frame ?? -1)`);
  // The frame the current scroll position should show: the pin starts at 0 and lasts 3 viewport heights.
  const expectedFrame = () => page.evaluate(`Math.min(${HERO_FRAMES} - 1, Math.floor(Math.min(1, Math.max(0, scrollY / (3 * innerHeight))) * ${HERO_FRAMES}))`);
  const scrollTo = async (y) => { await page.evaluate(`window.scrollTo(0, ${y})`); await page.wait(400); };
  // The hero wrapper reserves the whole scrub length (plus the hero's own screen) from the first render.
  const pinEnd = await page.evaluate(`(() => { const w = document.querySelector("[data-hero-scroll]"); return w.offsetTop + w.offsetHeight; })()`);

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
  const buf = await page.evaluate(`(() => { const c = document.querySelector("canvas[data-film=hero]"); return c ? [c.width, c.clientWidth, Number(c.dataset.frame)] : [-1, 0, -1]; })()`);
  expect(buf[0] === buf[1], `hero: canvas buffer ${buf[0]}px wide in a ${buf[1]}px box after a resize on frame ${buf[2]} (stretched frame)`);
  // The box can change with no scroll or viewport event (layout shift, font swap): the frame must refit.
  await page.evaluate(`document.querySelector("canvas[data-film=hero]")?.style.setProperty("width", "50%")`); await page.wait(300);
  const half = await page.evaluate(`(() => { const c = document.querySelector("canvas[data-film=hero]"); return c ? [c.width, c.clientWidth] : [-1, 0]; })()`);
  expect(half[0] === half[1], `hero: canvas buffer ${half[0]}px wide in a ${half[1]}px box after a box change (stretched frame)`);
  // Review focus 4: reload mid-hero restores the matching frame
  await page.emulate({ width: 1440, height: 900 });
  await page.goto(`http://127.0.0.1:${port}/Widem/`); await page.wait(800);
  // A real reload, not a fresh goto: only a reload restores the scroll position. No retries: the wrapper
  // reserves the page height at first render, so restore must work every time.
  // Two positions: mid-scrub (the middle frame, so a reload that always shows the first or last frame
  // fails) and past the scrub end (the last frame).
  for (const [label, target] of [["mid-scrub", MID_Y], ["near the end", pinEnd * 0.9]]) {
    await scrollTo(target); await page.wait(500);
    await page.reload(); await page.wait(1200);
    const y = await page.evaluate(`window.scrollY`);
    const navType = await page.evaluate(`performance.getEntriesByType("navigation")[0]?.type`);
    expect(navType === "reload", `hero: reload check (${label}) did not reload (navigation type ${navType})`);
    expect(y > 0, `hero: scroll position not restored after reload (${label})`);
    const [rf, rw] = [await frame(), await expectedFrame()];
    expect(y > 0 && rf === rw, `hero: after reload ${label} at y=${y} frame ${rf}, scroll says ${rw}`);
    if (label === "mid-scrub") expect(rf === MID_FRAME, `hero: mid-scrub reload landed on frame ${rf}, expected ${MID_FRAME}`);
  }
  // Slow network: the manifest arrives well after the load event, yet the page must already be tall
  // enough for the browser to restore the scroll position (the wrapper reserves it at first render).
  await page.send("Network.enable");
  await page.send("Network.emulateNetworkConditions", { offline: false, latency: 700, downloadThroughput: -1, uploadThroughput: -1 });
  await scrollTo(MID_Y); await page.wait(500);
  await page.reload(); await page.wait(4000);
  const slowY = await page.evaluate(`window.scrollY`);
  expect(slowY > 0, "hero: scroll position not restored after a reload on a slow network");
  expect(slowY > 0 && await frame() === await expectedFrame(), `hero: slow-network reload at y=${slowY} frame ${await frame()}, scroll says ${await expectedFrame()}`);
  await page.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  expect(page.errors.length === 0, `console errors: ${page.errors.join(" | ")}`);
  // Reduced motion: poster only, no pin, page reads top to bottom (Task 4)
  await page.emulate({ width: 1440, height: 900, reduce: true });
  await page.goto(`http://127.0.0.1:${port}/Widem/`); await page.wait(800);
  expect(await page.evaluate(`!!document.querySelector("img[data-poster=hero]") && !document.querySelector("canvas[data-film=hero]")`), "reduced motion: canvas still drawn or poster missing");
  expect(await page.evaluate(`!document.querySelector(".pin-spacer")`), "reduced motion: hero still pinned");
  // Review focus 3: frames fail to load, the poster stays visible and the canvas stays hidden.
  // The poster is frame 1 (it arrives with the first paint), so every other frame is blocked and the page
  // is reloaded mid-scrub, where the frame the scroll asks for is one of the blocked ones.
  await page.emulate({ width: 1440, height: 900, reduce: false });
  await page.send("Network.enable");
  await page.send("Network.setCacheDisabled", { cacheDisabled: true });
  const frameName = (i) => HERO.pattern.replace("{n}", String(i + 1).padStart(4, "0"));
  await page.send("Network.setBlockedURLs", { urls: Array.from({ length: HERO_FRAMES - 1 }, (_, i) => `*/film/hero/${frameName(i + 1)}`) });
  await page.goto(`http://127.0.0.1:${port}/Widem/`); await page.wait(800);
  await scrollTo(MID_Y); await page.wait(300);
  await page.reload(); await page.wait(1500);
  expect(await page.evaluate(`window.scrollY`) > 0, "failed frames: scroll position not restored, so the wanted frame may be the poster");
  // Prove the block works on the real frame URLs and spares the poster before trusting what it implies.
  const fetchFails = (name) => page.evaluate(`fetch("/Widem/film/hero/${name}", { cache: "no-store" }).then(() => false, () => true)`);
  const blocked = await fetchFails(frameName(MID_FRAME)) && await fetchFails(frameName(HERO_FRAMES - 1));
  expect(blocked, `failed frames: the block did not stop ${frameName(MID_FRAME)}, so this check proves nothing`);
  expect(!(await fetchFails(HERO.poster)), `failed frames: the block also stopped the poster ${HERO.poster}`);
  const posterVisible = await page.evaluate(`(() => { const i = document.querySelector("img[data-poster=hero]"); return !!i && i.complete && i.naturalWidth > 0; })()`);
  const canvasHidden = await page.evaluate(`getComputedStyle(document.querySelector("canvas[data-film=hero]")).opacity === "0"`);
  expect(posterVisible && canvasHidden, `failed frames: poster visible ${posterVisible}, canvas hidden ${canvasHidden}`);
  await page.send("Network.setBlockedURLs", { urls: [] });
  await page.send("Network.setCacheDisabled", { cacheDisabled: false });
  page.errors.length = 0; // blocked frames log load errors on purpose

  // Shell (Task 5): language, pill nav after the hero, hero line on the text side. Review focus 5 (Arabic).
  for (const width of [1440, 390]) for (const [lang, path] of [["en", "/Widem/"], ["ar", "/Widem/ar/"]]) {
    const tag = `${lang}@${width}`;
    await page.emulate({ width, height: width === 390 ? 844 : 900 });
    await page.goto(`http://127.0.0.1:${port}${path}`); await page.wait(800);
    const navShown = () => page.evaluate(`(() => { const n = document.querySelector("nav[data-nav]"); return !!n && getComputedStyle(n).visibility !== "hidden" && getComputedStyle(n).opacity !== "0"; })()`);
    expect(!(await navShown()), `${tag}: pill nav visible inside the hero`);
    // The hero wrapper reserves the scrub length, so the hero ends at its bottom edge.
    const end = await page.evaluate(`(() => { const w = document.querySelector("[data-hero-scroll]"); return w.offsetTop + w.offsetHeight; })()`);
    await page.evaluate(`window.scrollTo(0, ${end + 50})`); await page.wait(600);
    expect(await navShown(), `${tag}: pill nav missing after the hero`);
    const box = await page.evaluate(`(() => { const n = document.querySelector("nav[data-nav]"); if (!n) return [0, 0, 1]; const rs = [n, ...n.querySelectorAll("a")].map((e) => e.getBoundingClientRect()); return [Math.min(...rs.map((r) => r.left)), Math.max(...rs.map((r) => r.right)), innerWidth]; })()`);
    expect(box[0] >= 0 && box[1] <= box[2], `${tag}: nav or a link runs off screen (${box.map(Math.round)})`);
    await page.evaluate(`window.scrollTo(0, 0)`); await page.wait(600);
    expect(!(await navShown()), `${tag}: pill nav still visible after scrolling back into the hero`);
    // The hero line sits on the text side (left in English, right in Arabic) and does not cross the middle
    const line = await page.evaluate(`(() => { const r = document.querySelector("[data-hero-line]")?.getBoundingClientRect(); return r ? [r.left, r.right, innerWidth] : null; })()`);
    expect(!!line, `${tag}: hero line missing`);
    if (line) {
      const side = line[0] + (line[1] - line[0]) / 2 < line[2] / 2 ? "left" : "right";
      expect(side === (lang === "ar" ? "right" : "left"), `${tag}: hero line on the ${side}`);
      expect(line[0] >= 0 && line[1] <= line[2], `${tag}: hero line runs off screen`);
    }
    expect(await page.evaluate(`document.documentElement.lang`) === lang, `${tag}: html lang is not ${lang}`);
    expect(await page.evaluate(`document.querySelector("[data-hero-line]")?.textContent?.length > 0 && getComputedStyle(document.querySelector("[data-hero-line]")).direction`) === (lang === "ar" ? "rtl" : "ltr"), `${tag}: hero line direction`);
  }
  expect(page.errors.length === 0, `shell: console errors: ${page.errors.join(" | ")}`);
} finally {
  await page.close();
  server.close();
}
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log("check: all pass");
