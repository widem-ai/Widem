// The hero scene's cost, measured (not a check: headless Chrome's GPU is not a phone's). `node scripts/perf.mjs`
// after `npm run build`. With the CPU throttled 4x: long tasks (>50 ms) on the main thread during load (first paint
// to the scene's first frame, plus the load moment) and during a scroll through the whole story; the frame intervals
// while scrolling; the scene's own build time and render-call time; the DPR it chose. A screenshot is not motion and
// this is not a phone: a person still has to watch it on a real device.
import { launch } from "./lib/cdp.mjs";
import { startServer } from "./serve.mjs";

const RATE = Number(process.env.RATE ?? 4);
const { server, port } = await startServer(0);
const page = await launch();
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(1) : null; };
try {
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__long = []; new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__long.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: "longtask", buffered: true });` });
  for (const [lang, width, height] of [["en", 390, 844], ["en", 1440, 900], ["ar", 390, 844]]) {
    await page.emulate({ width, height });
    await page.send("Emulation.setCPUThrottlingRate", { rate: RATE });
    await page.goto(`http://127.0.0.1:${port}/Widem/${lang === "ar" ? "ar/" : ""}`);
    let on = false;
    for (let i = 0; i < 100 && !on; i++) { await page.wait(200); on = await page.evaluate(`document.getElementById("hero").classList.contains("scene-on")`); }
    await page.wait(3500); // the load moment
    const load = JSON.parse(await page.evaluate(`JSON.stringify({ long: window.__long.splice(0), fcp: performance.getEntriesByName("first-contentful-paint")[0]?.startTime,
      state: document.getElementById("hero").__sceneState, stats: document.getElementById("hero").__scene?.stats })`));
    // Scroll through the story in 60 steps over ~4 s, recording frame intervals.
    const scroll = JSON.parse(await page.evaluate(`new Promise((done) => {
      const h = document.getElementById("hero"), sp = h.parentElement, range = sp.offsetHeight - h.offsetHeight, top = sp.getBoundingClientRect().top + scrollY;
      const frames = []; let last = performance.now(), k = 0, stop = false; const r0 = h.__scene.stats.renders.length;
      const tick = (t) => { frames.push(t - last); last = t; if (!stop) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
      const step = () => { window.scrollTo(0, top + range * (k / 60)); if (++k <= 60) setTimeout(step, 66); else setTimeout(() => { stop = true;
        done(JSON.stringify({ frames, long: window.__long.splice(0), renders: h.__scene.stats.renders.slice(r0) })); }, 800); };
      step(); })`));
    const longLoad = load.long.map((l) => l[1]), longScroll = scroll.long.map((l) => l[1]);
    console.log(`${lang} ${width}x${height}, CPU ${RATE}x: scene ${load.state}, layout ${load.stats?.layout}, DPR ${load.stats?.dpr}, towers ${load.stats?.towers}, build ${load.stats?.buildMs} ms, FCP ${Math.round(load.fcp)} ms`);
    console.log(`  load:   ${longLoad.length} long tasks, longest ${Math.max(0, ...longLoad)} ms, total ${longLoad.reduce((a, b) => a + b, 0)} ms`);
    console.log(`  scroll: ${longScroll.length} long tasks, longest ${Math.max(0, ...longScroll)} ms; frame interval median ${pct(scroll.frames, 0.5)} ms, p95 ${pct(scroll.frames, 0.95)} ms (${scroll.frames.length} frames); render call median ${pct(scroll.renders, 0.5)} ms, p95 ${pct(scroll.renders, 0.95)} ms`);
    await page.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  }
} finally {
  await page.close();
  await new Promise((r) => server.close(r));
}
