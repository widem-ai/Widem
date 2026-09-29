// The one check command (ARCHITECTURE §2): `npm run build` then `npm run check`. Exit 1 on any failure.
// Every check here was proven by a planted break that made it fail (see the commit that added it).
// Node 24 runs the .ts content files directly (type stripping), so this script needs no TS runner.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { launch } from "./lib/cdp.mjs";
import { startServer } from "./serve.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const BASE = "/Widem/";
const ORIGIN = "https://widem-ai.github.io";
const PAGES = { en: { file: "index.html", dir: "ltr", url: `${ORIGIN}${BASE}` }, ar: { file: "ar/index.html", dir: "rtl", url: `${ORIGIN}${BASE}ar/` } };
// Outside hosts the built site may reference: fonts (allowed by ARCHITECTURE §4) and the founder's LinkedIn.
const ALLOWED_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com", "www.linkedin.com"]);

const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const load = async (rel) => import(pathToFileURL(join(ROOT, rel)).href);
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const textOf = (html) => decode(html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`, "i"))?.[1];
const headline = (h) => `${h.headlineBefore} ${h.headlineWord} ${h.headlineAfter}`;

function distPage(lang) {
  const p = join(DIST, PAGES[lang].file);
  return existsSync(p) ? read(p) : null;
}

// 1. Every string key exists in both languages, and none is empty.
async function contentKeys() {
  const { en } = await load("content/en.ts");
  const { ar } = await load("content/ar.ts");
  const leaves = (o, pre = "", out = new Map()) => {
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === "object") leaves(v, `${pre}${k}.`, out);
      else out.set(pre + k, v);
    }
    return out;
  };
  const e = leaves(en), a = leaves(ar), fails = [];
  for (const k of e.keys()) if (!a.has(k)) fails.push(`key "${k}" is in en.ts but missing from ar.ts`);
  for (const k of a.keys()) if (!e.has(k)) fails.push(`key "${k}" is in ar.ts but missing from en.ts`);
  for (const [lang, m] of [["en", e], ["ar", a]])
    for (const [k, v] of m) if (typeof v !== "string" || !v.trim()) fails.push(`${lang}.${k} is empty or not a string`);
  return fails;
}

// 2. Both pages exist as static HTML with the right lang/dir, SEO tags (A9) and the hero headline.
async function pages() {
  const { en } = await load("content/en.ts");
  const { ar } = await load("content/ar.ts");
  const content = { en, ar }, fails = [];
  for (const [lang, page] of Object.entries(PAGES)) {
    const html = distPage(lang);
    if (!html) { fails.push(`dist/${page.file} missing (run npm run build first)`); continue; }
    const c = content[lang], where = `dist/${page.file}`;
    const htmlTag = html.match(/<html[^>]*>/)?.[0] ?? "";
    if (attr(htmlTag, "lang") !== lang) fails.push(`${where}: <html lang> is "${attr(htmlTag, "lang")}", want "${lang}"`);
    if (attr(htmlTag, "dir") !== page.dir) fails.push(`${where}: <html dir> is "${attr(htmlTag, "dir")}", want "${page.dir}"`);

    const title = decode(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "");
    if (title !== c.meta.title) fails.push(`${where}: <title> is "${title}", want content meta.title`);
    if ([...title].length > 60) fails.push(`${where}: title is ${[...title].length} chars (A9 max 60)`);
    const descTag = html.match(/<meta name="description"[^>]*>/)?.[0] ?? "";
    const desc = decode(attr(descTag, "content") ?? "");
    if (desc !== c.meta.description) fails.push(`${where}: meta description differs from content meta.description`);
    if ([...desc].length > 155) fails.push(`${where}: description is ${[...desc].length} chars (A9 max 155)`);

    const canonical = attr(html.match(/<link rel="canonical"[^>]*>/)?.[0] ?? "", "href");
    if (canonical !== page.url) fails.push(`${where}: canonical is "${canonical}", want "${page.url}"`);
    const alts = Object.fromEntries([...html.matchAll(/<link rel="alternate"[^>]*>/g)].map((m) => [attr(m[0], "hreflang"), attr(m[0], "href")]));
    const wantAlts = { en: PAGES.en.url, ar: PAGES.ar.url, "x-default": PAGES.en.url };
    for (const [hl, href] of Object.entries(wantAlts))
      if (alts[hl] !== href) fails.push(`${where}: hreflang="${hl}" is "${alts[hl]}", want "${href}"`);

    // The headline must be in the pre-rendered markup inside #root, not added by JS after load.
    const rootHtml = html.match(/<div id="root">([\s\S]*)<\/div>\s*<\/body>/)?.[1] ?? "";
    const h1 = rootHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1];
    // The h1 holds the full sentence for screen readers (.sr) plus the visible copy with the rotating word
    // (aria-hidden, as in the prototype). Both must read as the headline in the static HTML.
    if (h1 === undefined) fails.push(`${where}: no <h1> in the static #root markup`);
    else {
      const srMatch = h1.match(/<span class="sr"[^>]*>([^<]*)<\/span>/);
      const sr = srMatch ? decode(srMatch[1]).trim() : null;
      const vis = textOf(srMatch ? h1.replace(srMatch[0], "") : h1);
      if (sr !== headline(c.hero)) fails.push(`${where}: <h1> screen-reader text is "${sr}", want "${headline(c.hero)}"`);
      if (vis !== headline(c.hero)) fails.push(`${where}: <h1> visible text is "${vis}", want "${headline(c.hero)}"`);
    }
  }
  return fails;
}

// 3. Hero text parity with the approved prototype (A14, for the part of the page built so far).
async function heroParity() {
  const { en } = await load("content/en.ts");
  const { ar } = await load("content/ar.ts");
  const proto = read(join(ROOT, "prototype/index.html"));
  const arTable = (key) => proto.match(new RegExp(`\\b${key}: "([^"]*)"`))?.[1];
  const want = {
    en: { h: proto.match(/id="h-full">([^<]*)</)?.[1], sub: proto.match(/class="slogan" data-t="slogan">([^<]*)</)?.[1], cta: proto.match(/data-t="cta">([^<]*)</)?.[1] },
    ar: { h: arTable("hFull"), sub: arTable("slogan"), cta: arTable("cta") },
  };
  const fails = [];
  for (const [lang, c] of [["en", en], ["ar", ar]]) {
    const w = want[lang];
    if (!w.h || !w.sub || !w.cta) { fails.push(`${lang}: could not read the hero strings from prototype/index.html`); continue; }
    if (headline(c.hero) !== w.h) fails.push(`${lang}: headline "${headline(c.hero)}" != prototype "${w.h}"`);
    if (c.hero.subhead !== w.sub) fails.push(`${lang}: subhead "${c.hero.subhead}" != prototype "${w.sub}"`);
    if (c.hero.cta !== w.cta) fails.push(`${lang}: button "${c.hero.cta}" != prototype "${w.cta}"`);
    const cue = lang === "en" ? proto.match(/data-t="cue">([^<]*)</)?.[1] : arTable("cue");
    if (c.hero.cue !== cue) fails.push(`${lang}: cue "${c.hero.cue}" != prototype "${cue}"`);
    // The rotating words: the prototype's WORDS list, first word = the static headline word.
    const list = proto.match(new RegExp(`\\b${lang}: \\[([^\\]]*)\\]`))?.[1];
    const words = list ? [...list.matchAll(/"([^"]*)"/g)].map((m) => m[1]) : [];
    const ours = [c.hero.headlineWord, ...(c.hero.moreWords ?? [])];
    if (!words.length) fails.push(`${lang}: could not read the rotating words from the prototype`);
    else if (JSON.stringify(ours) !== JSON.stringify(words)) fails.push(`${lang}: rotating words ${JSON.stringify(ours)} != prototype ${JSON.stringify(words)}`);
  }
  return fails;
}

// 4. Every URL in the built HTML/CSS resolves under /Widem/ to a real file, or is an allowed outside host.
function links() {
  if (!existsSync(DIST)) return ["dist/ missing (run npm run build first)"];
  const fails = [];
  const files = walk(DIST).filter((f) => /\.(html|css)$/.test(f));
  for (const file of files) {
    const text = read(file), where = relative(ROOT, file).replace(/\\/g, "/");
    const urls = [...text.matchAll(/\s(?:href|src)="([^"]*)"/gi), ...text.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)].map((m) => decode(m[1]));
    for (const url of urls) {
      if (url.startsWith("#") || url.startsWith("data:")) continue; // same-page anchors: checked per section in later slices
      let path;
      if (/^https?:\/\//i.test(url)) {
        const u = new URL(url);
        if (u.origin === ORIGIN) path = u.pathname;
        else if (u.protocol === "https:" && ALLOWED_HOSTS.has(u.host)) continue;
        else { fails.push(`${where}: outside URL not allowed: ${url}`); continue; }
      } else if (url.startsWith("/")) path = url.split(/[?#]/)[0];
      else { fails.push(`${where}: relative or non-http URL "${url}" (every URL must go through ${BASE})`); continue; }
      if (!path.startsWith(BASE)) { fails.push(`${where}: "${url}" is not under ${BASE}`); continue; }
      let target = join(DIST, decodeURIComponent(path.slice(BASE.length)));
      if (path.endsWith("/")) target = join(target, "index.html");
      if (!existsSync(target) || !statSync(target).isFile()) fails.push(`${where}: "${url}" does not resolve to a file in dist/`);
    }
  }
  if (!files.length) fails.push("no HTML/CSS files in dist/");
  return fails;
}

// 5. A5: no founder/contact name, email, secret key or internal URL anywhere in the repo (prototype/ is the
// frozen reference; it is never served). The client BUSINESS may be named since 2026-09-30 (permission
// recorded in the vault, in the client's people file); the founder never is (spec D7). Names are base64 here so
// this file does not match itself.
function a5Grep() {
  const b64 = (s) => Buffer.from(s, "base64").toString("utf8");
  const names = ["RmF0aW1h", "2YHYp9i32YXYqQ=="].map(b64);
  const rules = [
    ...names.map((n) => [`founder/contact name "${n}"`, new RegExp(`(^|[^\\p{L}])${n}($|[^\\p{L}])`, "iu")]),
    ["email address", /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/],
    ["API key (sk-)", /\bsk-[A-Za-z0-9_-]{20,}/],
    ["Supabase secret/publishable key", /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{10,}/],
    ["JWT", /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/],
    ["AWS key", /\bAKIA[0-9A-Z]{16}\b/],
    ["GitHub token", /\b(?:ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{20,}/],
    ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ["service-role reference", new RegExp(["service", "role"].join("_"), "i")],
    ["internal URL", /[a-z0-9-]+\.(?:supabase\.co|vercel\.app|n8n\.cloud)\b/i],
  ];
  const skipDirs = new Set([".git", "node_modules", "prototype"]);
  const binary = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2", ".avif"]);
  const fails = [];
  for (const file of walk(ROOT, skipDirs)) {
    if (binary.has(extname(file).toLowerCase())) continue;
    const where = relative(ROOT, file).replace(/\\/g, "/");
    read(file).split("\n").forEach((line, i) => {
      for (const [what, re] of rules) if (re.test(line)) fails.push(`${where}:${i + 1}: ${what}`);
    });
  }
  return fails;
}

// 6. TypeScript: the whole project type-checks.
function typescript() {
  const r = spawnSync(process.execPath, [join(ROOT, "node_modules/typescript/bin/tsc"), "--noEmit", "-p", ROOT], { encoding: "utf8" });
  if (r.status === 0) return [];
  return [(r.stdout + r.stderr).trim() || `tsc exited ${r.status}`];
}

// ---------- Browser checks: the hero scene in real Chrome (states list, spec A13) ----------
// One Chrome and one local server (any free port) serve every browser check; both close at the end of the run.
let session = null;
async function browser() {
  if (!session) {
    if (!existsSync(join(DIST, "index.html"))) throw new Error("dist/ missing (run npm run build first)");
    const { server, port } = await startServer(0);
    const page = await launch();
    session = { server, page, url: (lang) => `http://127.0.0.1:${port}${BASE}${lang === "ar" ? "ar/" : ""}` };
  }
  return session;
}
async function closeBrowser() {
  if (!session) return;
  await session.page.close();
  await new Promise((r) => session.server.close(r));
  session = null;
}

// In-page probe. vis(el) = effective opacity (0 when not rendered, or hidden by any ancestor).
const PROBE = `
  const vis = (el) => { if (!el || !el.getClientRects().length) return 0; let o = 1;
    for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e);
      if (s.display === "none" || s.visibility === "hidden") return 0; o *= Number(s.opacity); } return Math.round(o * 1000) / 1000; };
  const $ = (s) => document.querySelector(s);
  const heroParts = { h1: $("#hero h1"), slogan: $("#hero .slogan"), button: $("#hero .btn"), cue: $("#hero .cue") };`;
const probe = (page, body) => page.evaluate(`(() => { ${PROBE} ${body} })()`);

async function open(page, url, opts) {
  await page.emulate(opts);
  await page.goto(url);
  if (opts.js !== false) await page.evaluate(`document.fonts ? document.fonts.ready.then(() => true) : true`);
}
/** Poll an in-page boolean expression until true or timeout; returns the last value. */
async function until(page, expr, ms) {
  const end = Date.now() + ms;
  let v;
  do { v = await page.evaluate(`(() => { ${PROBE} return (${expr}); })()`); if (v) return v; await page.wait(150); } while (Date.now() < end);
  return v;
}
const partsJson = `JSON.stringify(Object.fromEntries(Object.entries(heroParts).map(([k, el]) => [k, vis(el)])))`;

// 7. Reduced motion: the hero's final state, everything visible, nothing moving (states list).
async function reducedMotion() {
  const { page, url } = await browser();
  const { en } = await load("content/en.ts");
  const { ar } = await load("content/ar.ts");
  const fails = [];
  const snap = `const cv = $("#circuit"); return JSON.stringify({
    parts: JSON.parse(${partsJson}),
    fx: [...document.querySelectorAll("#hero .hl-fx")].map(vis),
    word: $("#hero .rot")?.textContent ?? null,
    booting: $("#hero")?.classList.contains("boot") ?? null,
    moving: [...document.querySelectorAll("#hero *")].map((e) => getComputedStyle(e).transform + "|" + getComputedStyle(e).opacity).join(","),
    canvas: cv ? cv.toDataURL() : null });`;
  for (const [lang, c] of [["en", en], ["ar", ar]]) for (const width of [390, 1440]) {
    const where = `${lang} ${width}px`;
    await open(page, url(lang), { width, reduce: true });
    await page.wait(600);
    const a = JSON.parse(await probe(page, snap));
    for (const [k, o] of Object.entries(a.parts)) if (o !== 1) fails.push(`${where}: ${k} opacity ${o}, want 1`);
    if (a.fx.some((o) => o !== 0)) fails.push(`${where}: power-on layers still showing (${a.fx})`);
    if (a.booting !== false) fails.push(`${where}: hero still in its boot state`);
    if (a.word !== c.hero.headlineWord) fails.push(`${where}: rotating word shows "${a.word}", want "${c.hero.headlineWord}"`);
    if (a.canvas === null) fails.push(`${where}: no circuit canvas`);
    await page.wait(2800);
    const b = JSON.parse(await probe(page, snap));
    if (b.word !== a.word) fails.push(`${where}: the word rotated ("${a.word}" -> "${b.word}")`);
    if (b.moving !== a.moving) fails.push(`${where}: hero elements changed transform/opacity over 2.8 s`);
    if (b.canvas !== a.canvas) fails.push(`${where}: the circuit canvas kept animating`);
  }
  return fails;
}

// 8. Motion on: the power-on finishes (nothing left dark) and the word rotates.
async function motionOn() {
  const { page, url } = await browser();
  const fails = [];
  for (const lang of ["en", "ar"]) {
    await open(page, url(lang), { width: 1440 });
    const lit = await until(page, `!$("#hero").classList.contains("boot") && Object.values(heroParts).every((el) => vis(el) === 1)`, 7000);
    if (!lit) fails.push(`${lang}: after 7 s the hero is not fully lit: ${await probe(page, `return ${partsJson}`)}`);
    const first = await probe(page, `return $("#hero .rot")?.textContent ?? null`);
    const changed = await until(page, `($("#hero .rot")?.textContent ?? null) !== ${JSON.stringify(first)}`, 7000);
    if (!changed) fails.push(`${lang}: the word "${first}" did not rotate within 7 s`);
  }
  return fails;
}

// 9. No horizontal scroll at 360 / 390 / 1440 in both languages, mid-animation, and after a resize.
async function noHorizontalScroll() {
  const { page, url } = await browser();
  const fails = [];
  const widthNow = `return JSON.stringify({ doc: document.documentElement.scrollWidth, view: document.documentElement.clientWidth })`;
  for (const lang of ["en", "ar"]) {
    for (const width of [360, 390, 1440]) {
      await open(page, url(lang), { width });
      await page.wait(2500);
      const m = JSON.parse(await probe(page, widthNow));
      if (m.doc > m.view) fails.push(`${lang} ${width}px: page is ${m.doc}px wide in a ${m.view}px viewport`);
    }
    // Resize 1440 -> 390 without reloading: still no overflow, and the circuit is redrawn at the new size.
    await open(page, url(lang), { width: 1440 });
    await page.wait(800);
    await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await page.wait(900);
    const r = JSON.parse(await probe(page, `const cv = $("#circuit"); return JSON.stringify({ doc: document.documentElement.scrollWidth,
      view: document.documentElement.clientWidth, cw: cv ? cv.width : -1, css: cv ? cv.clientWidth : -2 })`));
    if (r.doc > r.view) fails.push(`${lang} resized to 390px: page is ${r.doc}px wide`);
    if (r.cw < 0) fails.push(`${lang} resized to 390px: no circuit canvas`);
    else if (Math.abs(r.cw - r.css) > 1) fails.push(`${lang} resized to 390px: circuit canvas is ${r.cw}px for a ${r.css}px box (not redrawn)`);
  }
  return fails;
}

// 10. JS off: the pre-rendered hero is readable (headline, word, subhead, button all visible).
async function jsOff() {
  const { page, url } = await browser();
  const { en } = await load("content/en.ts");
  const { ar } = await load("content/ar.ts");
  const fails = [];
  for (const [lang, c] of [["en", en], ["ar", ar]]) {
    await open(page, url(lang), { width: 390, js: false });
    const s = JSON.parse(await probe(page, `return JSON.stringify({
      parts: JSON.parse(${partsJson}),
      text: $("#hero h1 .h-vis") ? $("#hero h1 .h-vis").innerText.replace(/\\s+/g, " ").trim() : null,
      fx: [...document.querySelectorAll("#hero .hl-fx")].map(vis) })`));
    for (const [k, o] of Object.entries(s.parts)) if (o !== 1) fails.push(`${lang} JS off: ${k} opacity ${o}, want 1`);
    if (s.text !== headline(c.hero)) fails.push(`${lang} JS off: visible headline reads "${s.text}", want "${headline(c.hero)}"`);
    if (s.fx.some((o) => o !== 0)) fails.push(`${lang} JS off: power-on layers showing (${s.fx})`);
  }
  await page.emulate({ width: 1440, js: true });
  return fails;
}

// 11. Zero console errors, uncaught exceptions or failed loads across every browser check above.
async function consoleClean() {
  const { page } = await browser();
  return page.errors.map((e) => e.slice(0, 300));
}

function walk(dir, skip = new Set()) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, skip));
    else if (e.isFile()) out.push(p);
  }
  return out;
}

const CHECKS = [
  ["content keys match (en/ar)", contentKeys],
  ["pages: lang/dir, SEO tags, static hero headline", pages],
  ["hero text matches the prototype", heroParity],
  ["every URL resolves under /Widem/", links],
  ["A5: no founder name, email, key or internal URL", a5Grep],
  ["TypeScript (tsc --noEmit)", typescript],
  ["hero, reduced motion: final state, nothing moving (390/1440, EN/AR)", reducedMotion],
  ["hero, motion on: power-on completes and the word rotates", motionOn],
  ["hero: no horizontal scroll at 360/390/1440 EN/AR, and after a resize", noHorizontalScroll],
  ["hero, JS off: headline, subhead and button readable", jsOff],
  ["browser: zero console errors across the checks above", consoleClean],
];

let failed = 0;
for (const [name, fn] of CHECKS) {
  let fails;
  try { fails = await fn(); } catch (err) { fails = [`crashed: ${err.message}`]; }
  console.log(`${fails.length ? "FAIL" : "PASS"}  ${name}`);
  for (const f of fails) console.log(`      - ${f}`);
  if (fails.length) failed++;
}
await closeBrowser();
console.log(`\n${CHECKS.length - failed}/${CHECKS.length} checks passed`);
process.exit(failed ? 1 : 0);
