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
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__lcp = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp.push([e.startTime, e.element ? (e.element.id || e.element.tagName) : e.url]); }).observe({ type: "largest-contentful-paint", buffered: true });
    window.__long = []; new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__long.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: "longtask", buffered: true });` });
  for (const [lang, width, height] of [["en", 390, 844], ["en", 1440, 900], ["ar", 390, 844]]) {
    await page.emulate({ width, height });
    await page.send("Emulation.setCPUThrottlingRate", { rate: RATE });
    await page.goto(`http://127.0.0.1:${port}/Widem/${lang === "ar" ? "ar/" : ""}`);
    let on = false;
    for (let i = 0; i < 100 && !on; i++) { await page.wait(200); on = await page.evaluate(`document.getElementById("hero").classList.contains("scene-on")`); }
    await page.wait(3500); // the load moment
    const load = JSON.parse(await page.evaluate(`JSON.stringify({ long: window.__long.splice(0), fcp: performance.getEntriesByName("first-contentful-paint")[0]?.startTime, lcp: window.__lcp.at(-1)?.[0], lcpEl: window.__lcp.at(-1)?.[1],
      state: document.getElementById("hero").__sceneState, stats: document.getElementById("hero").__film?.stats })`));
    // Scroll through the story in 60 steps over ~4 s, recording frame intervals.
    const scroll = JSON.parse(await page.evaluate(`new Promise((done) => {
      const h = document.getElementById("hero"), sp = h.parentElement, range = sp.offsetHeight - h.offsetHeight, top = sp.getBoundingClientRect().top + scrollY;
      const frames = []; let last = performance.now(), k = 0, stop = false; const r0 = h.__film.stats.draws.length;
      const tick = (t) => { frames.push(t - last); last = t; if (!stop) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
      const step = () => { window.scrollTo(0, top + range * (k / 60)); if (++k <= 60) setTimeout(step, 66); else setTimeout(() => { stop = true;
        done(JSON.stringify({ frames, long: window.__long.splice(0), renders: h.__film.stats.draws.slice(-Math.max(0, h.__film.stats.draws.length - r0)) })); }, 800); };
      step(); })`));
    const longLoad = load.long.map((l) => l[1]), longScroll = scroll.long.map((l) => l[1]);
    console.log(`${lang} ${width}x${height}, CPU ${RATE}x: film ${load.state}, set ${load.stats?.set}, ${load.stats?.loaded}/${load.stats?.total} frames (${Math.round((load.stats?.bytes ?? 0) / 1024)} KB) loaded, FCP ${Math.round(load.fcp)} ms, LCP ${Math.round(load.lcp)} ms (${load.lcpEl})`);
    console.log(`  load:   ${longLoad.length} long tasks, longest ${Math.max(0, ...longLoad)} ms, total ${longLoad.reduce((a, b) => a + b, 0)} ms`);
    console.log(`  scroll: ${longScroll.length} long tasks, longest ${Math.max(0, ...longScroll)} ms; frame interval median ${pct(scroll.frames, 0.5)} ms, p95 ${pct(scroll.frames, 0.95)} ms (${scroll.frames.length} frames); canvas draw median ${pct(scroll.renders, 0.5)} ms, p95 ${pct(scroll.renders, 0.95)} ms`);
    await page.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  }
} finally {
  await page.close();
  await new Promise((r) => server.close(r));
}
