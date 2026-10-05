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
  const frameNameOf = (i) => HERO.pattern.replace("{n}", String(i + 1).padStart(4, "0"));
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
  // Load order (Task 6): after a mid-scrub reload the loader asks for the frame the scroll needs first,
  // then its neighbours, never index order from frame 1. The loader sets img.src in request order, so a
  // setter installed before the page's own scripts records that order.
  const { identifier: orderSpy } = await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
    const d = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src"); window.__frameOrder = [];
    Object.defineProperty(HTMLImageElement.prototype, "src", { configurable: true, get: d.get,
      set(v) { if (/\\/film\\/hero\\/frame-/.test(v)) window.__frameOrder.push(v.split("/").pop()); d.set.call(this, v); } });
  })()` });
  await scrollTo(MID_Y); await page.wait(500);
  await page.reload(); await page.wait(1200);
  const order = (await page.evaluate(`window.__frameOrder`)).slice(-HERO_FRAMES);
  await page.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: orderSpy });
  expect(order.length === HERO_FRAMES, `load order: recorded ${order.length} frame requests, expected ${HERO_FRAMES}`);
  expect(await expectedFrame() === MID_FRAME, `load order: reload restored scroll to frame ${await expectedFrame()}, not ${MID_FRAME}, so this check proves nothing`);
  const near = [MID_FRAME - 1, MID_FRAME + 1].map(frameNameOf);
  expect(order[0] === frameNameOf(MID_FRAME) && near.includes(order[1]) && near.includes(order[2]),
    `load order: first requests ${order.slice(0, 3).join(", ")}, expected ${frameNameOf(MID_FRAME)} then ${near.join(" and ")}`);
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

  // Task 8 QA frame fixes. A spy installed before the page's scripts records every frame request (img.src set)
  // with its time, so retries and request order are measured, not inferred from the end state.
  const { identifier: reqSpy } = await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
    const d = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src"); window.__frameReq = [];
    Object.defineProperty(HTMLImageElement.prototype, "src", { configurable: true, get: d.get,
      set(v) { if (/\\/film\\/hero\\/frame-/.test(v)) window.__frameReq.push([v.split("/").pop(), performance.now()]); d.set.call(this, v); } });
  })()` });
  const requestsOf = (name) => page.evaluate(`window.__frameReq.filter(([n]) => n === "${name}").length`);
  // I2: a frame that fails is retried a bounded number of times (1 + 2 retries with backoff), the nearest loaded
  // frame is drawn meanwhile (never frame 0 when a neighbour exists), and it is asked for again when the scroll
  // comes back to it. K is QA's repro frame.
  {
    const K = 22, yK = Math.floor(((K + 0.5) / HERO_FRAMES) * 3 * 900);
    await page.emulate({ width: 1440, height: 900 });
    await page.send("Network.setCacheDisabled", { cacheDisabled: true });
    await page.send("Network.setBlockedURLs", { urls: [`*/film/hero/${frameName(K)}`] });
    await page.goto(`http://127.0.0.1:${port}/Widem/`); await page.wait(3000);
    expect(await fetchFails(frameName(K)), `retry: the block did not stop ${frameName(K)}, so this check proves nothing`);
    const atMount = await requestsOf(frameName(K));
    expect(atMount === 3, `retry: a failing frame was requested ${atMount} times in 3 s, expected 3 (1 + 2 retries, then stop)`);
    await scrollTo(yK); await page.wait(3000); // longer than every backoff, so only a re-request on return can fix it
    expect(await expectedFrame() === K, `retry: scroll asks for frame ${await expectedFrame()}, not ${K}, so this check proves nothing`);
    const stale = await frame();
    expect(Math.abs(stale - K) === 1, `retry: frame ${K} blocked, canvas shows ${stale}, expected a neighbour of ${K}`);
    await page.send("Network.setBlockedURLs", { urls: [] });
    await scrollTo(0); await scrollTo(yK); await page.wait(800);
    expect(await frame() === K, `retry: frame ${K} unblocked, scrolled away and back, canvas shows ${await frame()}`);
    await page.send("Network.setCacheDisabled", { cacheDisabled: false });
    page.errors.length = 0; // the blocked frame logs load errors on purpose
  }
  // I4: on a slow network (QA's 50 KB/s, 300 ms latency) a jump to mid-scrub restarts the request order at the new
  // frame and a near frame (within 1) is drawn within 1000 ms. One frame is at most 14.5 KB: about 0.3 s of transfer
  // plus 0.3 s latency when it has the line to itself (measured 632-640 ms over 9 runs; the throttle is deterministic),
  // plus up to 0.1 s of polling. Without giving the wanted frame the line alone it took 1452-1464 ms, with the old
  // fixed order 6.2 s (both fail here). Without cancelling the old requests it took 646 or 1159 ms depending on what
  // was in flight at the jump, so the cancel is NOT reliably guarded by this check.
  {
    await page.emulate({ width: 1440, height: 900 });
    await page.send("Network.setCacheDisabled", { cacheDisabled: true });
    await page.send("Network.emulateNetworkConditions", { offline: false, latency: 300, downloadThroughput: 50 * 1024, uploadThroughput: 50 * 1024 });
    await page.goto(`http://127.0.0.1:${port}/Widem/`);
    for (let t = 0; t < 100 && await frame() !== 0; t++) await page.wait(100); // the loader is running and frame 0 is drawn
    const t0 = await page.evaluate(`(window.scrollTo(0, ${MID_Y}), performance.now())`);
    let near = -1, ms = -1;
    for (let t = 0; t < 60; t++) { await page.wait(100); const f = await frame(); if (Math.abs(f - MID_FRAME) <= 1) { near = f; ms = Math.round((await page.evaluate(`performance.now()`)) - t0); break; } }
    const after = await page.evaluate(`window.__frameReq.filter(([, t]) => t >= ${t0}).map(([n]) => n)`);
    expect(await expectedFrame() === MID_FRAME, `slow jump: scroll asks for frame ${await expectedFrame()}, not ${MID_FRAME}`);
    expect(after[0] === frameNameOf(MID_FRAME), `slow jump: first request after the jump was ${after[0]}, expected ${frameNameOf(MID_FRAME)}`);
    expect(near >= 0 && ms <= 1000, `slow jump: near frame ${near} after ${ms} ms (bound 1000 ms, -1 = not within 6 s)`);
    console.log(`slow jump: frame ${near} drawn ${ms} ms after the jump`);
    await page.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await page.send("Network.setCacheDisabled", { cacheDisabled: false });
  }
  await page.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: reqSpy });
  // m1: flipping reduced motion while the page is open releases the pin; flipping back restores a visible, scrubbing hero.
  {
    const MID = 1350;
    await page.emulate({ width: 1440, height: 900 });
    await page.goto(`http://127.0.0.1:${port}/Widem/`); await page.wait(800);
    await scrollTo(MID);
    const setReduce = (on) => page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: on ? "reduce" : "no-preference" }] });
    await setReduce(true); await page.wait(600);
    const off = await page.evaluate(`({ spacer: !!document.querySelector(".pin-spacer"), pos: getComputedStyle(document.querySelector("[data-section=hero]")).position })`);
    expect(!off.spacer && off.pos !== "fixed", `reduced toggle on: pin-spacer ${off.spacer}, hero position ${off.pos}`);
    await setReduce(false); await page.wait(600);
    await scrollTo(MID); await page.wait(400);
    const heroTop = await page.evaluate(`document.querySelector("[data-section=hero]").getBoundingClientRect().top`);
    const [tf, tw] = [await frame(), await expectedFrame()];
    expect(Math.abs(heroTop) < 2 && tf === tw && tw > 0, `reduced toggle off: hero top ${heroTop}, frame ${tf}, scroll says ${tw}`);
  }

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
  // Task 8 QA fixes. I1: an instant jump past "familiar" (scrollbar drag, find-in-page, scrollIntoView) must show the nav.
  const navVis = () => page.evaluate(`getComputedStyle(document.querySelector("nav[data-nav]")).visibility`);
  const tab = async () => { for (const type of ["keyDown", "keyUp"]) await page.send("Input.dispatchKeyEvent", { type, key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }); await page.wait(100); };
  const focused = () => page.evaluate(`(() => { const a = document.activeElement; return { inNav: !!a?.closest("nav[data-nav]"), skip: !!a?.matches("a[data-skip]"), tag: a?.tagName, href: a?.getAttribute("href") ?? "", target: !!(a?.getAttribute("href")?.startsWith("#") && document.querySelector(a.getAttribute("href"))), onScreen: (() => { const r = a?.getBoundingClientRect(); return !!r && r.width > 8 && r.height >= 24 && r.top >= 0 && r.bottom <= innerHeight; })() }; })()`);
  await page.emulate({ width: 1440, height: 900 });
  for (const id of ["how", "final"]) {
    await page.goto(`http://127.0.0.1:${port}/Widem/`); await page.wait(800);
    await page.evaluate(`window.scrollTo({ top: document.getElementById("${id}").offsetTop, behavior: "instant" })`); await page.wait(600);
    expect(await navVis() === "visible", `nav: still hidden after an instant jump to #${id}`);
  }
  // Mutation gap 2: the hidden nav is visibility:hidden (not only transparent), so Tab never lands in it.
  // m1: a keyboard user in the hero gets a skip link as the first Tab stop, visible when focused, pointing at a real target.
  await page.goto(`http://127.0.0.1:${port}/Widem/`); await page.wait(800);
  expect(await navVis() === "hidden", "nav: not visibility:hidden over the hero, so its links can take keyboard focus");
  await tab();
  const first = await focused();
  expect(first.skip && first.target && first.onScreen, `keyboard: first Tab is not a visible skip link with a real target (${JSON.stringify(first)})`);
  await tab();
  expect(!(await focused()).inNav, "keyboard: second Tab from the top landed in the hidden nav");
  // Found by eye: a focused skip link must not stay drawn over the nav once the visitor has scrolled past the hero.
  await page.goto(`http://127.0.0.1:${port}/Widem/`); await page.wait(800);
  await tab();
  await page.evaluate(`window.scrollTo({ top: document.getElementById("how").offsetTop, behavior: "instant" })`); await page.wait(600);
  expect(await page.evaluate(`getComputedStyle(document.querySelector("a[data-skip]")).visibility`) === "hidden", "keyboard: focused skip link still drawn over the nav after leaving the hero");
  // I3 and mutation gap 3: with reduced motion the hero is one screen (no scrub height reserved) and the nav stays hidden at y=0.
  for (const [width, height, path] of [[1440, 900, "/Widem/"], [390, 844, "/Widem/ar/"]]) {
    const tag = `reduced ${path}@${width}`;
    await page.emulate({ width, height, reduce: true });
    await page.goto(`http://127.0.0.1:${port}${path}`); await page.wait(800);
    const heroH = await page.evaluate(`document.querySelector("[data-hero-scroll]").getBoundingClientRect().height - innerHeight`);
    expect(Math.abs(heroH) < 2, `${tag}: hero reserves ${Math.round(heroH)}px beyond one screen`);
    expect(await navVis() === "hidden", `${tag}: nav visible over the hero at the top of the page`);
    await page.evaluate(`window.scrollTo({ top: document.getElementById("familiar").offsetTop, behavior: "instant" })`); await page.wait(400);
    expect(await navVis() === "visible", `${tag}: nav hidden inside "familiar"`);
  }
  await page.emulate({ width: 1440, height: 900, reduce: false });
  expect(page.errors.length === 0, `shell: console errors: ${page.errors.join(" | ")}`);
} finally {
  await page.close();
  server.close();
}
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log("check: all pass");
