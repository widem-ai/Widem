// Spike harness: serve spike/dist on an explicit port, screenshot, measure, check the fallback paths.
import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { launch } from "../scripts/lib/cdp.mjs";
const PORT = Number(process.env.PORT || 4791), OUT = process.argv[2];
const DIST = new URL("./dist/", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const types = { ".html": "text/html", ".js": "text/javascript", ".wasm": "application/wasm", ".glb": "model/gltf-binary", ".png": "image/png", ".json": "application/json" };
const srv = createServer((q, r) => { const p = join(DIST, decodeURIComponent(q.url.split("?")[0]).replace(/^\/$/, "/chip.html"));
  if (!existsSync(p) || statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": types[extname(p)] || "application/octet-stream" }); r.end(readFileSync(p)); });
await new Promise((res) => srv.listen(PORT, "127.0.0.1", res));
const url = `http://127.0.0.1:${PORT}/chip.html`;
const page = await launch();
const res = {};
const waitFrame = async () => { for (let i = 0; i < 150; i++) { const s = await page.evaluate("JSON.stringify(window.__spike||null)"); const o = JSON.parse(s);
  if (o && (o.firstFrameMs !== null || o.error)) return o; await page.wait(100); } return null; };
try {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    await page.emulate({ width: w, height: h });
    await page.goto(url);
    const s = await waitFrame();
    await page.evaluate("window.__spike.setTime && window.__spike.setTime(4)");
    await page.wait(300);
    writeFileSync(join(OUT, `live-${w}.png`), Buffer.from((await page.screenshot()).split(",")[1], "base64"));
    const ft = await page.evaluate(`new Promise(r=>{const n0=__spike.frames,t=performance.now();setTimeout(()=>r({fps:Math.round((__spike.frames-n0)/((performance.now()-t)/1000)),canvasW:document.getElementById('chip')?.width}),2000)})`);
    res[`${w}`] = { ...s, ...ft };
  }
  await page.emulate({ width: 1440, height: 900 });
  await page.goto(url + "?nowebgl"); await page.wait(800);
  res.fallback = await page.evaluate("({canvas: !!document.getElementById('chip'), posterLoaded: document.querySelector('.poster').complete && document.querySelector('.poster').naturalWidth>0, err: window.__spike.error})");
  await page.emulate({ width: 1440, height: 900, reduce: true });
  await page.goto(url); const rs = await waitFrame(); await page.wait(1000);
  res.reduced = { ...rs, framesAfter1s: await page.evaluate("__spike.frames") };
  await page.emulate({ width: 1440, height: 900, js: false });
  await page.goto(url); await page.wait(500);
  res.noJs = await page.evaluate("document.querySelector('.poster').naturalWidth>0");
  await page.emulate({ width: 1440, height: 900, js: true });
  res.errors = page.errors.filter((e) => !/nowebgl/.test(e));
} finally { await page.close(); srv.close(); }
console.log(JSON.stringify(res, null, 1));
