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
    // The rotating words: dropped by Mohannad's hero v3 decision (2026-10-01; the approved sketch had none).
    // The headline's word must still be the prototype's first (static) word, and no rotating list may come back.
    const list = proto.match(new RegExp(`\\b${lang}: \\[([^\\]]*)\\]`))?.[1];
    const words = list ? [...list.matchAll(/"([^"]*)"/g)].map((m) => m[1]) : [];
    if (!words.length) fails.push(`${lang}: could not read the prototype's word list`);
    else if (c.hero.headlineWord !== words[0]) fails.push(`${lang}: headline word "${c.hero.headlineWord}" != prototype "${words[0]}"`);
    if ("moreWords" in c.hero) fails.push(`${lang}: content carries rotating words (moreWords); hero v3 has none`);
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
    const urls = [...text.matchAll(/\s(?:href|src|srcset)="([^"]*)"/gi), ...text.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)].map((m) => decode(m[1]));
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
  const heroParts = { h1: $("#hero h1"), slogan: $("#hero .slogan"), button: $("#hero .btn"), cue: $("#hero .cue") };
  const words = () => [...document.querySelectorAll("#hero .h-vis .w")];
  // The pinned story's scroll range: the track's height minus the (sticky) hero's own (0 when not pinned).
  const story = () => { const h = $("#hero"), sp = h.parentElement, pinned = getComputedStyle(h).position === "sticky" && sp.offsetHeight > h.offsetHeight;
    return { pinned, start: sp.getBoundingClientRect().top + scrollY, range: pinned ? sp.offsetHeight - h.offsetHeight : 0 }; };
  const toStory = (p) => { const s = story(); window.scrollTo({ top: s.start + s.range * p, behavior: "instant" }); };`;
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

// 7. Reduced motion: the poster with the HTML headline, everything visible, nothing moving, no scene started, no pin,
// no scroll guide, no data-stage (states list).
async function reducedMotion() {
  const { page, url } = await browser();
  const fails = [];
  const snap = `const art = $("#hero-art"); return JSON.stringify({
    parts: JSON.parse(${partsJson}),
    words: words().map(vis), scene: $("#hero").__sceneState ?? null, canvas: vis($("#hero .hero-scene")),
    guide: vis($("#hero .guide")), pinned: story().pinned, stage: document.documentElement.hasAttribute("data-stage"),
    booting: $("#hero")?.classList.contains("boot") ?? null,
    moving: [...document.querySelectorAll("#hero *")].map((e) => getComputedStyle(e).transform + "|" + getComputedStyle(e).opacity).join(","),
    art: art ? art.complete && art.naturalWidth > 0 && vis(art) === 1 : null,
    artMove: art ? getComputedStyle($(".hero-poster")).transform : null,
    textOpacity: vis($("#hero .hero-in")) });`;
  for (const lang of ["en", "ar"]) for (const width of [390, 1440]) {
    const where = `${lang} ${width}px`;
    await open(page, url(lang), { width, reduce: true });
    await page.wait(600);
    const a = JSON.parse(await probe(page, snap));
    for (const [k, o] of Object.entries(a.parts)) if (o !== 1) fails.push(`${where}: ${k} opacity ${o}, want 1`);
    if (!a.words.length || a.words.some((o) => o !== 1)) fails.push(`${where}: headline words not all shown (${a.words})`);
    if (a.scene !== null || a.canvas !== 0) fails.push(`${where}: the 3D scene started with reduced motion (state ${a.scene}, canvas opacity ${a.canvas}); the poster is the whole hero`);
    if (a.guide !== 0) fails.push(`${where}: the scroll guide shows (opacity ${a.guide}), but there is no scroll story`);
    if (a.pinned) fails.push(`${where}: the hero is pinned with reduced motion`);
    if (a.stage) fails.push(`${where}: <html data-stage> is set with reduced motion; it must be unset`);
    if (a.booting !== false) fails.push(`${where}: hero still in its boot state`);
    if (a.art !== true) fails.push(`${where}: the poster is missing, hidden or did not load`);
    await page.wait(2800);
    const b = JSON.parse(await probe(page, snap));
    if (b.moving !== a.moving) fails.push(`${where}: hero elements changed transform/opacity over 2.8 s`);
    await page.evaluate(`window.scrollTo(0, 260)`);
    await page.wait(500);
    const s = JSON.parse(await probe(page, snap));
    if (s.artMove !== "none") fails.push(`${where}: the poster moves on scroll with reduced motion (${s.artMove})`);
    if (s.textOpacity !== 1) fails.push(`${where}: the hero text fades on scroll with reduced motion (opacity ${s.textOpacity})`);
    if (s.stage) fails.push(`${where}: <html data-stage> set after scrolling with reduced motion`);
  }
  return fails;
}

/** Open with motion on and wait for the 3D scene to fade in over the poster; returns false if it never did. */
async function openScene(page, href, width, height) {
  await open(page, href, { width, height });
  const on = await until(page, `$("#hero").classList.contains("scene-on") && !$("#hero").classList.contains("boot")`, 9000);
  if (on) await page.wait(1100); // the canvas's fade
  return !!on;
}
const sceneSnap = `const s = $("#hero").__scene; return JSON.stringify({ fill: words().map(vis), board: s ? s.words() : [], cam: s ? s.cam() : -1,
  chip: s ? s.chip() : null, rest: [heroParts.slogan, heroParts.button, heroParts.cue].map(vis), pinned: story().pinned,
  canvas: vis($("#hero .hero-scene")), h1: $("#hero h1 .sr").textContent.replace(/\\s+/g, " ").trim(), state: $("#hero").__sceneState })`;

// 8. The 3D story, motion on, 1440x900 and 390x844, EN and AR: the scene replaces the poster; before the pinned
// scroll every word on the board is dark, the chip whole on screen and the subline/button/cue hidden; halfway the
// words are partly lit in reading order; at the end all lit with subline, button and cue; dark again back at the top.
// At rest on phones the chip is wholly on or wholly off screen, never cut at the edge.
const PHONE_DESK = [[1440, 900], [390, 844]];
async function traceStory() {
  const { page, url } = await browser();
  const { en } = await load("content/en.ts");
  const { ar } = await load("content/ar.ts");
  const fails = [];
  const inside = (c) => c && c.x0 >= 0.005 && c.x1 <= 0.995 && c.y0 >= 0.005 && c.y1 <= 0.995;
  const outside = (c) => c && (c.x1 <= 0 || c.x0 >= 1 || c.y1 <= 0 || c.y0 >= 1);
  for (const [lang, c] of [["en", en], ["ar", ar]]) for (const [width, height] of PHONE_DESK) {
    const where = `${lang} ${width}x${height}`;
    if (!(await openScene(page, url(lang), width, height))) { fails.push(`${where}: the 3D scene never came up (${await probe(page, `return $("#hero").__sceneState ?? "not started"`)})`); continue; }
    const top = JSON.parse(await probe(page, sceneSnap));
    if (!top.pinned) { fails.push(`${where}: the hero is not pinned with motion on`); continue; }
    if (top.canvas !== 1) fails.push(`${where}: the scene's canvas is not shown (opacity ${top.canvas})`);
    if (top.h1 !== headline(c.hero)) fails.push(`${where}: the <h1> reads "${top.h1}" with the scene on, want the headline`);
    if (top.board.length !== top.fill.length) fails.push(`${where}: the board has ${top.board.length} words, the <h1> ${top.fill.length}`);
    if (top.board.some((v) => v !== 0) || top.cam !== 0) fails.push(`${where}: before scrolling, the board is not at its first frame (words ${top.board}, camera ${top.cam})`);
    if (!inside(top.chip)) fails.push(`${where}: at 0% the chip is cut by the screen edge (${JSON.stringify(top.chip)})`);
    if (top.rest.some((o) => o !== 0)) fails.push(`${where}: before scrolling, subline/button/cue already show (${top.rest})`);
    await page.evaluate(`(() => { ${PROBE} toStory(0.5); })()`);
    await page.wait(900);
    const mid = JSON.parse(await probe(page, sceneSnap));
    const lit = mid.board.filter((v) => v === 1).length, n = mid.board.length;
    if (!(lit > 0 && lit < n)) fails.push(`${where}: halfway, ${lit}/${n} words on the board are lit (want some, not all)`);
    if (mid.board.some((v, i) => i && v > mid.board[i - 1])) fails.push(`${where}: halfway, words are not lit in reading order (${mid.board})`);
    if (!(mid.cam > 0.3 && mid.cam < 0.8)) fails.push(`${where}: halfway, the camera is at ${mid.cam} of its flight`);
    await page.evaluate(`(() => { ${PROBE} toStory(1); })()`);
    await page.wait(900);
    const end = JSON.parse(await probe(page, sceneSnap));
    if (end.board.some((v) => v !== 1) || end.cam !== 1) fails.push(`${where}: after the pinned scroll, the board is not at rest (words ${end.board}, camera ${end.cam})`);
    if (end.rest.some((o) => o !== 1)) fails.push(`${where}: after the pinned scroll, subline/button/cue are not all shown (${end.rest})`);
    if (!inside(end.chip) && !outside(end.chip)) fails.push(`${where}: at rest the chip is cut by the screen edge (${JSON.stringify(end.chip)})`);
    await page.evaluate(`window.scrollTo({ top: 0, behavior: "instant" })`);
    await page.wait(900);
    const back = JSON.parse(await probe(page, sceneSnap));
    if (back.board.some((v) => v !== 0) || back.cam !== 0) fails.push(`${where}: back at the top, the board is not dark again (words ${back.board}, camera ${back.cam})`);
  }
  return fails;
}

// 8b. The scroll guide: shown at the top of the story with its pulse running, inside the first screen, reading the
// content string; hidden once scrolling starts; back at the top it returns.
async function scrollGuide() {
  const { page, url } = await browser();
  const { en } = await load("content/en.ts");
  const { ar } = await load("content/ar.ts");
  const fails = [];
  const snap = `const g = $("#hero .guide"); const r = g.getBoundingClientRect(); return JSON.stringify({ o: vis(g), text: g.textContent.trim(),
    inView: r.top >= 0 && r.bottom <= innerHeight && r.width > 0, pulse: getComputedStyle(g.querySelector(".guide-line i")).animationName })`;
  for (const [lang, c] of [["en", en], ["ar", ar]]) for (const [width, height] of PHONE_DESK) {
    const where = `${lang} ${width}x${height}`;
    await open(page, url(lang), { width, height });
    await until(page, `!$("#hero").classList.contains("boot")`, 6000);
    await page.wait(600);
    const top = JSON.parse(await probe(page, snap));
    if (top.o !== 1) fails.push(`${where}: at the top the scroll guide is not shown (opacity ${top.o})`);
    if (!top.inView) fails.push(`${where}: the scroll guide is not inside the first screen`);
    if (top.text !== c.hero.guide) fails.push(`${where}: the guide reads "${top.text}", want "${c.hero.guide}"`);
    if (top.pulse !== "guide-pulse") fails.push(`${where}: the guide's pulse is not animating (${top.pulse})`);
    await page.evaluate(`window.scrollTo({ top: 300, behavior: "instant" })`);
    await page.wait(800);
    const down = JSON.parse(await probe(page, snap));
    if (down.o !== 0) fails.push(`${where}: after scrolling 300px the guide still shows (opacity ${down.o})`);
    await page.evaluate(`window.scrollTo({ top: 0, behavior: "instant" })`);
    await page.wait(800);
    const back = JSON.parse(await probe(page, snap));
    if (back.o !== 1) fails.push(`${where}: back at the top the guide did not return (opacity ${back.o})`);
  }
  return fails;
}

// 8c. The header contract: <html data-stage> is "intro" inside the pinned story, "site" after it, "intro" again on
// scrolling back into it. (Unset with reduced motion and JS off: checked in 7 and 10.)
async function stageAttribute() {
  const { page, url } = await browser();
  const fails = [];
  for (const lang of ["en", "ar"]) {
    await open(page, url(lang), { width: 1440, height: 900 });
    await until(page, `!$("#hero").classList.contains("boot")`, 6000);
    const at = async (p) => { await page.evaluate(`(() => { ${PROBE} toStory(${p}); })()`); await page.wait(500); return probe(page, `return document.documentElement.dataset.stage ?? null`); };
    const want = [[0, "intro"], [0.5, "intro"], [1.2, "site"], [0.6, "intro"], [3, "site"]];
    for (const [p, s] of want) { const got = await at(p); if (got !== s) fails.push(`${lang}: at ${Math.round(p * 100)}% of the story data-stage is ${JSON.stringify(got)}, want "${s}"`); }
  }
  return fails;
}

// 8d. The hero button keeps its passing sheen (Mohannad, v3): the ::before light is animating, and moves.
async function buttonSheen() {
  const { page, url } = await browser();
  const fails = [];
  const snap = `const b = $("#hero .btn"), s = getComputedStyle(b, "::before"); return JSON.stringify({ o: vis(b), name: s.animationName, n: s.animationIterationCount, t: s.transform })`;
  for (const lang of ["en", "ar"]) {
    await open(page, url(lang), { width: 1440, height: 900 });
    await until(page, `!$("#hero").classList.contains("boot")`, 6000);
    await page.evaluate(`(() => { ${PROBE} toStory(1); })()`);
    await page.wait(900);
    const a = JSON.parse(await probe(page, snap));
    await page.wait(700);
    const b = JSON.parse(await probe(page, snap));
    if (a.o !== 1) fails.push(`${lang}: at the end of the story the button is not shown (opacity ${a.o})`);
    if (a.name !== "sheen" || a.n !== "infinite") fails.push(`${lang}: the button's sheen is not running (animation "${a.name}" x ${a.n})`);
    else if (a.t === b.t) fails.push(`${lang}: the button's sheen did not move over 0.7 s (${a.t})`);
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
    // Resize 1440 -> 390 without reloading: still no overflow, the poster switches to the tall crop, and the scene
    // re-lays its headline for a narrow screen.
    if (!(await openScene(page, url(lang), 1440, 900))) { fails.push(`${lang}: the 3D scene never came up`); continue; }
    await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await page.wait(900);
    await until(page, `/scene-tall\\./.test($("#hero-art")?.currentSrc ?? "") && $("#hero-art").complete && $("#hero").__scene?.stats.layout === "narrow"`, 4000);
    const r = JSON.parse(await probe(page, `const art = $("#hero-art"); return JSON.stringify({ doc: document.documentElement.scrollWidth,
      view: document.documentElement.clientWidth, src: art ? art.currentSrc : null, ok: art ? art.complete && art.naturalWidth > 0 : false,
      layout: $("#hero").__scene?.stats.layout, canvasW: $("#hero .hero-scene").width })`));
    if (r.doc > r.view) fails.push(`${lang} resized to 390px: page is ${r.doc}px wide`);
    if (!/scene-tall\./.test(r.src ?? "")) fails.push(`${lang} resized to 390px: the poster is still "${r.src}", want the tall crop`);
    else if (!r.ok) fails.push(`${lang} resized to 390px: the tall poster did not load`);
    if (r.layout !== "narrow") fails.push(`${lang} resized to 390px: the scene kept its "${r.layout}" headline layout`);
    if (!(r.canvasW > 0 && r.canvasW <= 390 * 2)) fails.push(`${lang} resized to 390px: the canvas is ${r.canvasW}px wide`);
  }
  return fails;
}

// 10. JS off: the pre-rendered hero is readable over the poster (headline, subhead, button all visible); no canvas,
// no guide, no data-stage.
async function jsOff() {
  const { page, url } = await browser();
  const { en } = await load("content/en.ts");
  const { ar } = await load("content/ar.ts");
  const fails = [];
  for (const [lang, c] of [["en", en], ["ar", ar]]) {
    await open(page, url(lang), { width: 390, js: false });
    await page.wait(400);
    const s = JSON.parse(await probe(page, `return JSON.stringify({
      parts: JSON.parse(${partsJson}),
      text: $("#hero h1 .h-vis") ? $("#hero h1 .h-vis").innerText.replace(/\\s+/g, " ").trim() : null,
      canvas: vis($("#hero .hero-scene")), poster: $("#hero-art")?.complete && $("#hero-art").naturalWidth > 0 && vis($("#hero-art")) === 1,
      guide: vis($("#hero .guide")), stage: document.documentElement.hasAttribute("data-stage") })`));
    for (const [k, o] of Object.entries(s.parts)) if (o !== 1) fails.push(`${lang} JS off: ${k} opacity ${o}, want 1`);
    if (s.text !== headline(c.hero)) fails.push(`${lang} JS off: visible headline reads "${s.text}", want "${headline(c.hero)}"`);
    if (s.canvas !== 0) fails.push(`${lang} JS off: the (empty) scene canvas is showing`);
    if (!s.poster) fails.push(`${lang} JS off: the poster is not shown`);
    if (s.guide !== 0) fails.push(`${lang} JS off: the scroll guide shows, but there is no scroll story`);
    if (s.stage) fails.push(`${lang} JS off: <html data-stage> is set`);
  }
  await page.emulate({ width: 1440, js: true });
  return fails;
}

// 10b. No WebGL, and a weak device (2 cores): the scene is not run; the poster stays with the HTML headline, and the
// story still works as light motion (the pin, the words fading on in reading order, the stage), with nothing logged.
async function noScene() {
  const { page, url } = await browser();
  const fails = [];
  const cases = [
    ["no WebGL", "no-webgl", async () => (await page.send("Page.addScriptToEvaluateOnNewDocument", { source:
      `(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, o) { return /webgl/.test(t) ? null : g.call(this, t, o); }; })();` })).identifier],
    ["weak device", "weak-device", async () => { await page.send("Emulation.setHardwareConcurrencyOverride", { hardwareConcurrency: 2 }); return null; }],
  ];
  for (const [name, want, setup] of cases) for (const lang of ["en", "ar"]) {
    const where = `${lang} ${name}`;
    const id = await setup();
    await open(page, url(lang), { width: 390, height: 844 });
    await until(page, `$("#hero").__sceneState === "${want}"`, 6000);
    await page.wait(800);
    const snap = `return JSON.stringify({ state: $("#hero").__sceneState ?? null, on: $("#hero").classList.contains("scene-on"), canvas: vis($("#hero .hero-scene")),
      poster: $("#hero-art")?.complete && $("#hero-art").naturalWidth > 0 && vis($("#hero-art")) === 1, fill: words().map(vis), pinned: story().pinned,
      stage: document.documentElement.dataset.stage ?? null, parts: JSON.parse(${partsJson}) })`;
    const top = JSON.parse(await probe(page, snap));
    if (top.state !== want) fails.push(`${where}: scene state "${top.state}", want "${want}"`);
    if (top.on || top.canvas !== 0) fails.push(`${where}: the scene shows (canvas opacity ${top.canvas})`);
    if (!top.poster) fails.push(`${where}: the poster is not shown`);
    if (!top.pinned || top.stage !== "intro") fails.push(`${where}: no pinned story (pinned ${top.pinned}, stage ${top.stage})`);
    if (top.fill.some((o) => o !== 0)) fails.push(`${where}: before scrolling the words already show (${top.fill})`);
    await page.evaluate(`(() => { ${PROBE} toStory(0.5); })()`);
    await page.wait(900);
    const mid = JSON.parse(await probe(page, snap));
    if (mid.fill.some((o, i) => i && o > mid.fill[i - 1]) || !mid.fill.some((o) => o === 1)) fails.push(`${where}: halfway the words are not fading on in reading order (${mid.fill})`);
    await page.evaluate(`(() => { ${PROBE} toStory(1.2); })()`);
    await page.wait(900);
    const end = JSON.parse(await probe(page, snap));
    for (const [k, o] of Object.entries(end.parts)) if (o !== 1) fails.push(`${where}: after the story, ${k} opacity ${o}, want 1`);
    if (end.stage !== "site") fails.push(`${where}: after the story data-stage is ${end.stage}, want "site"`);
    if (id) await page.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: id });
    else await page.send("Emulation.setHardwareConcurrencyOverride", { hardwareConcurrency: 8 });
  }
  return fails;
}

// 11. The hero poster as files: both crops in both formats, inside the weight budget (A6), preloaded, and present in
// the static HTML (so it shows with JS off). Rendered from the scene by scripts/poster.mjs, encoded by art/export.py.
const ART_BUDGET_KB = { "hero/scene-wide.avif": 120, "hero/scene-tall.avif": 90, "hero/scene-wide.webp": 180, "hero/scene-tall.webp": 140 };
function heroArtFiles() {
  const fails = [];
  for (const [file, kb] of Object.entries(ART_BUDGET_KB)) {
    const p = join(DIST, file);
    if (!existsSync(p)) { fails.push(`dist/${file} is missing`); continue; }
    const size = Math.ceil(statSync(p).size / 1024);
    if (size > kb) fails.push(`dist/${file} is ${size} KB (budget ${kb} KB)`);
  }
  for (const lang of ["en", "ar"]) {
    const html = distPage(lang) ?? "", where = `dist/${PAGES[lang].file}`;
    const root = html.match(/<div id="root">([\s\S]*)<\/div>\s*<\/body>/)?.[1] ?? "";
    for (const file of Object.keys(ART_BUDGET_KB))
      if (!root.includes(`${BASE}${file}"`)) fails.push(`${where}: the static hero markup does not reference ${file}`);
    const img = root.match(/<img[^>]*id="hero-art"[^>]*>/)?.[0] ?? "";
    if (!img) fails.push(`${where}: no <img id="hero-art"> in the static markup`);
    else {
      if (attr(img, "alt") !== "") fails.push(`${where}: the hero poster must have alt="" (decorative)`);
      if (!attr(img, "width") || !attr(img, "height")) fails.push(`${where}: the hero poster has no width/height`);
    }
    const preloads = [...html.matchAll(/<link rel="preload" as="image"[^>]*>/g)].map((m) => attr(m[0], "href"));
    for (const file of ["hero/scene-wide.avif", "hero/scene-tall.avif"])
      if (!preloads.includes(`${BASE}${file}`)) fails.push(`${where}: no preload for ${file}`);
    // three.js is never in the first-paint bundle: only the scene's own chunk, loaded after paint, carries it.
    const entry = html.match(/<script type="module"[^>]*src="([^"]+)"/)?.[1];
    const js = entry && existsSync(join(DIST, entry.replace(BASE, ""))) ? read(join(DIST, entry.replace(BASE, ""))) : "";
    if (!js) fails.push(`${where}: could not read the entry script`);
    else if (/WebGLRenderer|THREE\.WebGLRenderer|webglcontextlost/.test(js)) fails.push(`${where}: three.js is in the entry bundle; it must load after first paint`);
  }
  return fails;
}

// 12. The poster on screen (reduced motion), at every width in the states list, both languages and both themes: the
// right crop loads, and the HTML text and the header sit on a background dark enough to read. Measured from a
// screenshot with the letters made invisible: the brightest tenth of the pixels behind each piece of text must still
// give 4.5:1 against that text's colour.
const SCREENS = [[360, 740], [390, 780], [768, 1024], [1280, 800], [1440, 900], [1920, 1080]];
const HEADER_BOXES = [[".site-head .brand", ".site-head .brand"]];
async function heroArtOnScreen() {
  const { page, url } = await browser();
  const fails = [];
  for (const lang of ["en", "ar"]) for (const [width, height] of SCREENS) for (const theme of ["dark", "light"]) {
    if (theme === "light" && ![390, 1440].includes(width)) continue;
    const where = `${lang} ${width}x${height} ${theme}`;
    await open(page, url(lang), { width, height, reduce: true });
    await page.evaluate(`document.documentElement.setAttribute("data-theme", "${theme}")`);
    const loaded = await until(page, `$("#hero-art")?.complete && $("#hero-art").naturalWidth > 0`, 5000);
    if (!loaded) { fails.push(`${where}: the poster did not load`); continue; }
    const info = JSON.parse(await probe(page, `return JSON.stringify({ src: $("#hero-art").currentSrc, vh: innerHeight, button: $("#hero .btn").getBoundingClientRect().bottom });`));
    const want = width < height ? "tall" : "wide";
    if (!new RegExp(`/hero/scene-${want}\\.(avif|webp)$`).test(info.src)) fails.push(`${where}: shows "${info.src}", want the ${want} poster`);
    if (info.button > info.vh) fails.push(`${where}: the button ends at ${Math.round(info.button)}px, below the first screen (${info.vh}px)`);
    const boxes = [["#hero h1", "#hero h1 .w"], ["#hero .slogan"], ["#hero .cue"], ...(theme === "dark" ? HEADER_BOXES : [])];
    for (const f of await textContrast(page, boxes)) fails.push(`${where}: ${f}`);
  }
  return fails;
}

/** Contrast of text against what is behind it, measured from a screenshot with the text (and the scene's own copy of
 *  the headline) made invisible: the brightest tenth of the pixels behind each box must still give 4.5:1 against the
 *  text's colour. boxes: [selector, selector whose colour is the ink (default the same)]. Returns failure lines. */
async function textContrast(page, boxes, measured = []) {
  const info = JSON.parse(await probe(page, `
    const lum = (rgb) => { const [r, g, b] = rgb.match(/[\\d.]+/g).slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const box = ([sel, inkSel = sel]) => { const el = $(sel); if (!el) return { sel, missing: true }; const r = el.getBoundingClientRect(); return { sel, x: r.left, y: r.top, w: r.width, h: r.height, ink: lum(getComputedStyle($(inkSel)).color) }; };
    return JSON.stringify({ boxes: ${JSON.stringify(boxes)}.map(box) });`));
  const sels = boxes.map((b) => `${b[0]}, ${b[0]} *`).join(", ");
  const hide = await page.evaluate(`(() => { const s = document.createElement("style"); s.id = "contrast-probe"; s.textContent = ${JSON.stringify(`${sels} { color: transparent !important; -webkit-text-fill-color: transparent !important; } .site-head .brand svg { visibility: hidden !important; }`)}; document.head.append(s); return true; })()`);
  await page.wait(150);
  const shot = await page.screenshot();
  await page.evaluate(`document.getElementById("contrast-probe")?.remove()`);
  const p90 = JSON.parse(await page.evaluate(`(async () => {
    const img = new Image(); img.src = ${JSON.stringify(shot)}; await img.decode();
    const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height;
    const cx = cv.getContext("2d"); cx.drawImage(img, 0, 0);
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return JSON.stringify(${JSON.stringify(info.boxes)}.map((b) => {
      if (b.missing) return null;
      const x = Math.max(0, Math.floor(b.x)), y = Math.max(0, Math.floor(b.y));
      const w = Math.max(1, Math.min(cv.width - x, Math.ceil(b.w))), h = Math.max(1, Math.min(cv.height - y, Math.ceil(b.h)));
      if (y >= cv.height || b.w < 1) return null;
      const d = cx.getImageData(x, y, w, h).data, ls = [];
      for (let i = 0; i < d.length; i += 4) ls.push(0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]));
      ls.sort((a, b) => a - b);
      return ls[Math.floor(ls.length * 0.9)];
    }));
  })()`));
  const fails = [];
  if (!hide) fails.push("could not hide the text for the measurement");
  info.boxes.forEach((b, i) => {
    if (p90[i] === null) { fails.push(`${b.sel} is off screen, missing or empty: nothing measured`); return; }
    const ratio = (b.ink + 0.05) / (p90[i] + 0.05);
    measured.push(`${b.sel.replace("#hero ", "")} ${ratio.toFixed(2)}`);
    if (ratio < 4.5) fails.push(`${b.sel} has ${ratio.toFixed(2)}:1 against what is behind it (need 4.5:1)`);
  });
  return fails;
}

// 12b. Readability at rest with the scene on: at the end of the pinned story the headline drawn on the board is
// measured from a screenshot at points the scene itself reports as inside a letter and between letters (its own mask,
// projected through its camera): the median letter against the brightest tenth of the gaps must give 3:1 (large text),
// with at least 200 samples of each on screen, and every line's letters at least 16px tall. The subline and cue use
// the rule above. 390x844 and 1440x900, EN/AR.
async function restContrast() {
  const { page, url } = await browser();
  const fails = [];
  for (const lang of ["en", "ar"]) for (const [width, height] of PHONE_DESK) {
    const where = `${lang} ${width}x${height} at rest`;
    if (!(await openScene(page, url(lang), width, height))) { fails.push(`${where}: the 3D scene never came up`); continue; }
    await page.evaluate(`(() => { ${PROBE} toStory(1); })()`);
    await page.wait(3200); // past the gold pulse and the load moment
    const pts = JSON.parse(await probe(page, `const s = $("#hero").__scene; if (!s || s.cam() !== 1) return "null"; return JSON.stringify(s.probe(1200))`));
    if (!pts) { fails.push(`${where}: the board did not reach rest`); continue; }
    const shot = await page.screenshot();
    const m = JSON.parse(await page.evaluate(`(async () => {
      const img = new Image(); img.src = ${JSON.stringify(shot)}; await img.decode();
      const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height;
      const cx = cv.getContext("2d"); cx.drawImage(img, 0, 0); const d = cx.getImageData(0, 0, cv.width, cv.height).data;
      const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      const L = ([x, y]) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= cv.width || y >= cv.height) return null; const i = (y * cv.width + x) * 4; return 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]); };
      const pts = ${JSON.stringify(pts)};
      const fg = pts.fg.map(L).filter((v) => v !== null).sort((a, b) => a - b), bg = pts.bg.map(L).filter((v) => v !== null).sort((a, b) => a - b);
      return JSON.stringify({ nf: fg.length, nb: bg.length, fg: fg[Math.floor(fg.length / 2)], bg: bg[Math.floor(bg.length * 0.9)], cap: pts.cap });
    })()`));
    if (m.nf < 200 || m.nb < 200) { fails.push(`${where}: only ${m.nf} letter and ${m.nb} gap samples on screen (need 200 each): the headline is not in view`); continue; }
    const ratio = (m.fg + 0.05) / (m.bg + 0.05), minCap = Math.min(...m.cap);
    if (ratio < 3) fails.push(`${where}: the board headline has ${ratio.toFixed(2)}:1 (letters against gaps; need 3:1)`);
    if (minCap < 16) fails.push(`${where}: a line of the board headline is ${minCap}px tall (need 16px)`);
    const measured = [`board headline ${ratio.toFixed(2)} (letters ${minCap}-${Math.max(...m.cap)}px)`];
    for (const f of await textContrast(page, [["#hero .slogan"], ["#hero .cue"]], measured)) fails.push(`${where}: ${f}`);
    console.log(`      (measured ${where}: ${measured.join(", ")})`);
  }
  return fails;
}

// 13. The scroll scene: the camera's progress follows the pinned scroll while the text stays put; back at the top
// everything is at rest again. Also when the page is loaded already scrolled into the story (reload, deep link): the
// camera and the words match the position, not the first frame.
async function heroScroll() {
  const { page, url } = await browser();
  const fails = [];
  const state = `const s = $("#hero").__scene; return JSON.stringify({ cam: s ? s.cam() : -1, on: $("#hero").classList.contains("scene-on"),
    textTop: Math.round($("#hero .hero-in").getBoundingClientRect().top), lit: words().filter((w) => vis(w) === 1).length,
    board: s ? s.words().filter((v) => v === 1).length : -1, y: scrollY, range: story().range })`;
  for (const lang of ["en", "ar"]) {
    if (!(await openScene(page, url(lang), 1440, 900))) { fails.push(`${lang}: the 3D scene never came up`); continue; }
    const top = JSON.parse(await probe(page, state));
    if (top.cam !== 0) fails.push(`${lang}: at the top the camera is already at ${top.cam}`);
    if (top.range < 200) { fails.push(`${lang}: the pinned story is too short to test (${top.range}px)`); continue; }
    await page.evaluate(`(() => { ${PROBE} toStory(0.6); })()`);
    await page.wait(900);
    const down = JSON.parse(await probe(page, state));
    if (!(Math.abs(down.cam - 0.6 / 0.9) < 0.03)) fails.push(`${lang}: at 60% of the story the camera is at ${down.cam} of its flight, want ${(0.6 / 0.9).toFixed(3)}`);
    if (Math.abs(down.textTop - top.textTop) > 1) fails.push(`${lang}: the text moved from ${top.textTop}px to ${down.textTop}px while the hero is pinned`);
    await page.evaluate(`window.scrollTo({ top: 0, behavior: "instant" })`);
    await page.wait(900);
    const back = JSON.parse(await probe(page, state));
    if (back.cam !== 0 || back.lit !== 0 || back.board !== 0) fails.push(`${lang}: back at the top the scene is not at its first frame (camera ${back.cam}, ${back.board} words lit)`);

    // Reload while scrolled into the story: the browser restores the position; the scene must match it.
    await page.evaluate(`(() => { ${PROBE} toStory(0.6); })()`);
    await page.wait(300);
    await page.send("Page.reload");
    await until(page, `$("#hero").classList.contains("scene-on")`, 9000);
    await page.wait(1200);
    const deep = JSON.parse(await probe(page, state));
    if (deep.y < 100) fails.push(`${lang}: the reload did not keep the scroll position (${deep.y}px), so the deep-load state was not tested`);
    else {
      if (!deep.on) fails.push(`${lang}: loaded at ${deep.y}px, but the scene did not come up`);
      if (!(deep.cam > 0.5)) fails.push(`${lang}: loaded at ${deep.y}px (60% of the story), but the camera is at ${deep.cam}`);
      if (!(deep.board > 0)) fails.push(`${lang}: loaded at ${deep.y}px (60% of the story), but no word on the board is lit`);
    }
  }
  return fails;
}

// 14. Tailwind reads only Widem's tokens: the built CSS maps its colours to tokens.css variables and carries none
// of Tailwind's default palette; no component writes a raw colour in a class (bg-[#...], text-[rgb(...)]...).
function tailwindTokens() {
  const fails = [];
  const assets = existsSync(join(DIST, "assets")) ? readdirSync(join(DIST, "assets")).filter((f) => f.endsWith(".css")) : [];
  if (!assets.length) return ["no CSS in dist/assets (run npm run build first)"];
  const css = assets.map((f) => read(join(DIST, "assets", f))).join("\n");
  // The mapping lives in src/styles/tailwind.css (theme "inline": values are written into each utility, so the
  // built CSS only carries the ones in use). Check the source for the reset and the token mapping.
  const tw = existsSync(join(ROOT, "src/styles/tailwind.css")) ? read(join(ROOT, "src/styles/tailwind.css")) : "";
  if (!/--color-\*:\s*initial/.test(tw)) fails.push("src/styles/tailwind.css: Tailwind's default palette is not switched off (--color-*: initial)");
  if (!/--color-ground:\s*var\(--ground\)/.test(tw)) fails.push("src/styles/tailwind.css: --color-ground is not mapped to var(--ground)");
  if (!/@layer\s+theme/.test(css) || !/@layer\s+base/.test(css)) fails.push("built CSS: no Tailwind layers (theme, base): is the Vite plugin wired?");
  const stray = css.match(/--color-(?:red|blue|gray|slate|zinc|neutral|stone|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\s*:/);
  if (stray) fails.push(`built CSS: Tailwind's default palette is present (${stray[0].trim()})`);
  const raw = /\b(?:bg|text|border|fill|stroke|from|to|via|ring|outline|shadow|decoration|accent|caret)-\[(?:#|rgb|hsl|oklch|color)/;
  for (const file of walk(join(ROOT, "src")).filter((f) => /\.(tsx|ts)$/.test(f))) {
    read(file).split("\n").forEach((line, i) => {
      if (raw.test(line)) fails.push(`${relative(ROOT, file).replace(/\\/g, "/")}:${i + 1}: raw colour in a Tailwind class; use a token colour`);
    });
  }
  return fails;
}

// 15. Zero console errors, uncaught exceptions or failed loads across every browser check above.
async function consoleClean() {
  const { page } = await browser();
  return page.errors.map((e) => e.slice(0, 300));
}

// ---------- Navigation (header-nav slice, 2026-10-01) ----------
// The header reads one attribute, <html data-stage>: "intro" while the visitor is inside the hero story (brand and
// AR|EN only), "site" after it (the full navigation). Unset (JS off, reduced motion, hero not merged) = full nav.

// 16. Nav strings and links match the prototype's header (A14): the link list (order, href, text) in the bar and in
// the phone menu, the "Book a call" button, and the English labels the prototype carries (Main, Menu, Language).
async function navParity() {
  const { en } = await load("content/en.ts");
  const { ar } = await load("content/ar.ts");
  const proto = read(join(ROOT, "prototype/index.html"));
  const arTable = (key) => proto.match(new RegExp(`\\b${key}: "([^"]*)"`))?.[1];
  const protoNav = proto.match(/<nav class="nav" id="nav" aria-label="([^"]*)">([\s\S]*?)<\/nav>/);
  if (!protoNav) return ['could not read the prototype\'s <nav class="nav">'];
  const items = [...protoNav[2].matchAll(/<a href="([^"]*)" data-t="([^"]*)">([^<]*)<\/a>/g)].map((m) => ({ href: m[1], key: m[2], en: m[3] }));
  const want = {
    en: { links: items.map((i) => [i.href, i.en]), book: proto.match(/data-t="fk1">([^<]*)</)?.[1], navLabel: protoNav[1],
          menu: proto.match(/class="icon-btn menu-btn"[^>]*aria-label="([^"]*)"/)?.[1], lang: proto.match(/data-t="langL">([^<]*)</)?.[1] },
    ar: { links: items.map((i) => [i.href, arTable(i.key)]), book: arTable("fk1"), lang: arTable("langL") },
  };
  const c = { en, ar }, fails = [];
  if (items.length !== 7) fails.push(`read ${items.length} links from the prototype's nav, expected 7`);
  for (const lang of ["en", "ar"]) {
    const html = distPage(lang) ?? "", where = `dist/${PAGES[lang].file}`, w = want[lang];
    const head = html.match(/<header class="site-head[\s\S]*?<\/header>/)?.[0];
    if (!head) { fails.push(`${where}: no <header class="site-head"> in the static HTML`); continue; }
    for (const [cls, name] of [["nav", "bar"], ["mnav", "phone menu"]]) {
      const nav = head.match(new RegExp(`<nav class="${cls}[" ][^>]*>([\\s\\S]*?)</nav>`));
      if (!nav) { fails.push(`${where}: no ${name} nav (.${cls})`); continue; }
      const got = [...nav[1].matchAll(/<a [^>]*href="(#[^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [m[1], textOf(m[2])]).filter(([h]) => h !== "#book");
      if (JSON.stringify(got) !== JSON.stringify(w.links)) fails.push(`${where}: ${name} links ${JSON.stringify(got)} != prototype ${JSON.stringify(w.links)}`);
      const label = attr(nav[0], "aria-label");
      if (label !== c[lang].header.navLabel) fails.push(`${where}: ${name} aria-label "${label}", want content header.navLabel`);
    }
    const books = [...head.matchAll(/<a class="btn[^"]*" href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [m[1], textOf(m[2])]);
    if (books.length !== 2 || books.some(([h, t]) => h !== "#book" || t !== w.book)) fails.push(`${where}: header buttons ${JSON.stringify(books)}, want two "${w.book}" -> #book (bar + phone menu)`);
    if (c[lang].header.book !== w.book) fails.push(`${lang}: header.book "${c[lang].header.book}" != prototype "${w.book}"`);
    if (c[lang].header.langLabel !== w.lang) fails.push(`${lang}: header.langLabel "${c[lang].header.langLabel}" != prototype "${w.lang}"`);
    if (lang === "en" && en.header.navLabel !== w.navLabel) fails.push(`en: header.navLabel "${en.header.navLabel}" != prototype "${w.navLabel}"`);
    if (lang === "en" && en.header.menu !== w.menu) fails.push(`en: header.menu "${en.header.menu}" != prototype "${w.menu}"`);
  }
  return fails;
}

const KEYS = { Tab: 9, Enter: 13, Escape: 27 };
async function press(page, key) {
  const k = { key, code: key, windowsVirtualKeyCode: KEYS[key], nativeVirtualKeyCode: KEYS[key] };
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", ...k, ...(key === "Enter" ? { text: "\r" } : {}) });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", ...k });
}
async function tap(page, sel) {
  const p = JSON.parse(await probe(page, `const b = $(${JSON.stringify(sel)}).getBoundingClientRect(); return JSON.stringify({ x: b.left + b.width / 2, y: b.top + b.height / 2 })`));
  await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p.x, y: p.y }] });
  await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}
const setStage = (page, stage) => page.evaluate(stage ? `document.documentElement.dataset.stage = "${stage}"` : `delete document.documentElement.dataset.stage`);
// Names a header element by its part; "out" once focus has left the header.
const PART = `const part = (el) => { if (!el || !el.closest(".site-head")) return "out";
  if (el.closest(".mnav")) return el.matches(".btn") ? "panel-book" : el.matches(".theme-btn") ? "panel-theme" : "panel-link";
  if (el.closest(".nav")) return "link"; if (el.matches(".brand")) return "brand"; if (el.closest(".seg")) return "seg";
  if (el.matches(".menu-btn")) return "menu"; if (el.matches(".theme-btn")) return "theme"; if (el.matches(".btn")) return "book"; return el.tagName; };
  const H = $(".site-head"), q = (s) => H.querySelector(s);
  const parts = { brand: q(".brand"), seg: q(".head-in .seg"), nav: q(".nav"), book: q(".head-in .btn"), theme: q(".head-in .theme-btn"), menu: q(".menu-btn"), panel: q(".mnav") };`;
/** Presses Tab from the top of a fresh page and lists the header parts focus visits, with their focus ring. */
async function tabWalk(page) {
  const seen = [];
  for (let i = 0; i < 25; i++) {
    await press(page, "Tab");
    const s = JSON.parse(await probe(page, `${PART} const a = document.activeElement, cs = getComputedStyle(a);
      return JSON.stringify({ p: part(a), ring: cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2 })`));
    if (s.p === "out") break;
    seen.push(s);
  }
  return seen;
}
const ALL_1440 = ["brand", ...Array(7).fill("link"), "book", "theme", "seg"];
const EXPECT = { intro: { 1440: ["brand", "seg"], 390: ["brand", "seg"] }, site: { 1440: ALL_1440, 390: ["brand", "seg", "menu"] } };
EXPECT.unset = EXPECT.site;

// 17. Stage states: intro shows brand + AR|EN only and nothing hidden takes focus; site and unset show the full nav.
// Keyboard walk with real Tab presses, focus ring on every stop, RTL mirrored, only transform/opacity animate.
async function navStates() {
  const { page, url } = await browser();
  const fails = [];
  for (const lang of ["en", "ar"]) for (const width of [1440, 390]) for (const stage of ["intro", "site", "unset"]) {
    const where = `${lang} ${width}px stage=${stage}`;
    await open(page, url(lang), { width, height: width > 600 ? 900 : 844 });
    await setStage(page, stage === "unset" ? null : stage);
    await page.wait(1100);
    const s = JSON.parse(await probe(page, `${PART}
      const shown = Object.fromEntries(Object.entries(parts).map(([k, el]) => [k, vis(el)]));
      const box = (el) => el ? el.getBoundingClientRect() : { left: NaN };
      const moving = [...H.querySelectorAll(".late"), H].flatMap((el) => [getComputedStyle(el), getComputedStyle(el, "::before"), getComputedStyle(el, "::after")])
        .flatMap((cs) => cs.transitionDuration.split(",").some((d) => parseFloat(d) > 0) ? cs.transitionProperty.split(",").map((p) => p.trim()) : [])
        .filter((p) => !["opacity", "transform", "visibility"].includes(p));
      return JSON.stringify({ shown, brandX: box(parts.brand).left, segX: box(parts.seg).left,
        doc: document.documentElement.scrollWidth, view: document.documentElement.clientWidth, moving: [...new Set(moving)] });`));
    const wantShown = { brand: 1, seg: 1, nav: 0, book: 0, theme: 0, menu: 0, panel: 0 };
    if (stage !== "intro") Object.assign(wantShown, width > 600 ? { nav: 1, book: 1, theme: 1 } : { menu: 1 });
    for (const [k, v] of Object.entries(wantShown)) if (s.shown[k] !== v) fails.push(`${where}: ${k} opacity ${s.shown[k]}, want ${v}`);
    const walk = await tabWalk(page);
    const got = walk.map((w) => w.p);
    if (JSON.stringify(got) !== JSON.stringify(EXPECT[stage][width])) fails.push(`${where}: Tab visits ${JSON.stringify(got)}, want ${JSON.stringify(EXPECT[stage][width])}`);
    const noRing = walk.filter((w) => !w.ring).map((w) => w.p);
    if (noRing.length) fails.push(`${where}: no visible focus ring on ${JSON.stringify(noRing)}`);
    if ((lang === "ar") !== (s.brandX > s.segX)) fails.push(`${where}: brand at x=${Math.round(s.brandX)}, AR|EN at x=${Math.round(s.segX)}: not mirrored for ${lang}`);
    if (s.doc > s.view) fails.push(`${where}: page is ${s.doc}px wide in a ${s.view}px viewport`);
    if (s.moving.length) fails.push(`${where}: header transitions animate ${JSON.stringify(s.moving)} (only transform/opacity)`);
    // In the intro the header floats on the hero's night picture, so it keeps the night palette in the light theme.
    if (stage === "intro" && width === 1440) {
      await page.evaluate(`document.documentElement.setAttribute("data-theme", "light")`);
      const ink = await probe(page, `return getComputedStyle($(".site-head .brand")).color`);
      if (ink !== "rgb(232, 242, 238)") fails.push(`${where} light theme: brand ink is ${ink}, want the night palette's ink rgb(232, 242, 238)`);
      await page.evaluate(`document.documentElement.removeAttribute("data-theme")`);
    }
  }
  return fails;
}

// 18. The phone menu: opens and closes with the keyboard (Enter, Escape, focus back on the button) and with touch
// (tap the button, tap a link), aria-expanded right each time, and closes itself when the visitor scrolls back
// into the intro. Checked at 360 (the narrowest) in both languages, with no horizontal scroll while open.
async function phoneMenu() {
  const { page, url } = await browser();
  const fails = [];
  const st = `${PART} return JSON.stringify({ exp: parts.menu.getAttribute("aria-expanded"), panel: vis(parts.panel),
    links: [...parts.panel.querySelectorAll("a")].map(vis), focus: part(document.activeElement),
    doc: document.documentElement.scrollWidth, view: document.documentElement.clientWidth })`;
  for (const lang of ["en", "ar"]) {
    const where = `${lang} 360px`;
    await open(page, url(lang), { width: 360, height: 740 });
    await setStage(page, "site");
    await page.wait(900);
    await page.evaluate(`document.querySelector(".menu-btn").focus()`);
    await press(page, "Enter");
    await page.wait(900); // the menu's last row lands at ~615 ms (stagger)
    let s = JSON.parse(await probe(page, st));
    if (s.exp !== "true" || s.panel !== 1 || !s.links.length || s.links.some((o) => o !== 1)) fails.push(`${where} Enter: menu not open (aria-expanded ${s.exp}, panel ${s.panel}, links ${s.links})`);
    if (s.doc > s.view) fails.push(`${where} menu open: page is ${s.doc}px wide`);
    await press(page, "Tab");
    s = JSON.parse(await probe(page, st));
    if (s.focus !== "panel-link") fails.push(`${where}: Tab after opening goes to "${s.focus}", want the first menu link`);
    await press(page, "Escape");
    await page.wait(600);
    s = JSON.parse(await probe(page, st));
    if (s.exp !== "false" || s.panel !== 0) fails.push(`${where} Escape: menu still open (aria-expanded ${s.exp}, panel ${s.panel})`);
    if (s.focus !== "menu") fails.push(`${where} Escape: focus is on "${s.focus}", want back on the menu button`);

    await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    await tap(page, ".menu-btn");
    await page.wait(900);
    s = JSON.parse(await probe(page, st));
    if (s.exp !== "true" || s.panel !== 1) fails.push(`${where} tap: menu not open (aria-expanded ${s.exp}, panel ${s.panel})`);
    else {
      await tap(page, ".mnav a");
      await page.wait(600);
      s = JSON.parse(await probe(page, st));
      if (s.exp !== "false" || s.panel !== 0) fails.push(`${where} tap on a link: menu still open (aria-expanded ${s.exp}, panel ${s.panel})`);
    }
    await tap(page, ".menu-btn");
    await page.wait(500);
    await setStage(page, "intro");
    await page.wait(700);
    s = JSON.parse(await probe(page, st));
    if (s.exp !== "false" || s.panel !== 0) fails.push(`${where} back to intro: menu still open (aria-expanded ${s.exp}, panel ${s.panel})`);
    await page.send("Emulation.setTouchEmulationEnabled", { enabled: false });
  }
  return fails;
}

// 19. The nav's "Book a call" carries the main button's light sheen (Mohannad: keep the flash), in the bar and in
// the phone menu, on the same cycle token as the hero button.
async function navSheen() {
  const { page, url } = await browser();
  const fails = [];
  const sheen = (sel) => `const el = $(${JSON.stringify(sel)}); if (!el) return JSON.stringify(null); const b = getComputedStyle(el, "::before");
    return JSON.stringify({ vis: vis(el), name: b.animationName, count: b.animationIterationCount, dur: b.animationDuration, state: b.animationPlayState,
      cycle: getComputedStyle(document.documentElement).getPropertyValue("--sheen-cycle").trim() })`;
  for (const [width, sel, openMenu] of [[1440, ".head-in .btn", false], [390, ".mnav .btn", true]]) {
    const where = `${width}px ${sel}`;
    await open(page, url("en"), { width });
    await setStage(page, "site");
    await page.wait(900);
    if (openMenu) { await page.evaluate(`document.querySelector(".menu-btn")?.click()`); await page.wait(900); }
    const s = JSON.parse(await probe(page, sheen(sel)));
    if (!s) { fails.push(`${where}: no button`); continue; }
    if (s.vis !== 1) fails.push(`${where}: button not visible (${s.vis})`);
    if (s.name !== "sheen" || s.count !== "infinite" || s.state !== "running") fails.push(`${where}: ::before animation is "${s.name}" x${s.count} (${s.state}), want the sheen, infinite, running`);
    if (s.dur !== s.cycle) fails.push(`${where}: sheen lasts ${s.dur}, want --sheen-cycle (${s.cycle})`);
  }
  return fails;
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
  ["hero text matches the prototype (v3: no rotating words)", heroParity],
  ["every URL resolves under /Widem/", links],
  ["A5: no founder name, email, key or internal URL", a5Grep],
  ["TypeScript (tsc --noEmit)", typescript],
  ["Tailwind: token colours only, no default palette, no raw colours in classes", tailwindTokens],
  ["hero, reduced motion: poster + HTML headline, nothing moving, no scene/pin/guide/stage (390/1440, EN/AR)", reducedMotion],
  ["hero 3D story: board dark and chip whole at 0%, words lit in order, all lit at rest (390/1440, EN/AR)", traceStory],
  ["hero scroll guide: shown at the top, hidden once scrolling starts (390/1440, EN/AR)", scrollGuide],
  ["header contract: data-stage intro inside the story, site after it", stageAttribute],
  ["hero button keeps its passing sheen", buttonSheen],
  ["hero: no horizontal scroll at 360/390/1440 EN/AR, and after a resize", noHorizontalScroll],
  ["hero, JS off: headline, subhead and button readable over the poster; no canvas, guide or data-stage", jsOff],
  ["hero, no WebGL / weak device: poster + HTML headline, light word-by-word story, nothing logged", noScene],
  ["hero poster: both crops, both formats, in budget, preloaded, in the static HTML; three.js not in the entry bundle", heroArtFiles],
  ["hero poster on screen: right crop, text and header readable over it (360-1920, EN/AR, dark/light)", heroArtOnScreen],
  ["hero at rest, scene on: board headline readable, measured from screenshots (390/1440, EN/AR)", restContrast],
  ["hero scroll scene: camera follows the pinned scroll, first frame at the top, right after a scrolled reload", heroScroll],
  ["nav: strings and links match the prototype (EN/AR, bar and phone menu)", navParity],
  ["nav stages: intro = brand + AR|EN only, site/unset = full nav; Tab order, focus ring, RTL (390/1440)", navStates],
  ["nav: phone menu opens/closes by keyboard and touch, aria-expanded, Escape, closes on intro", phoneMenu],
  ["nav: Book a call carries the sheen (bar and phone menu)", navSheen],
  ["browser: zero console errors across the checks above", consoleClean],
];

// ONLY=<text> runs just the checks whose name contains it (for proving a planted break); CI runs them all.
const only = process.env.ONLY;
const run = only ? CHECKS.filter(([name]) => name.includes(only) || name.startsWith("browser:")) : CHECKS;
if (only && run.length < 2) { console.log(`ONLY="${only}" matches no check`); process.exit(1); }
let failed = 0;
for (const [name, fn] of run) {
  let fails;
  try { fails = await fn(); } catch (err) { fails = [`crashed: ${err.message}`]; }
  console.log(`${fails.length ? "FAIL" : "PASS"}  ${name}`);
  for (const f of fails) console.log(`      - ${f}`);
  if (fails.length) failed++;
}
await closeBrowser();
console.log(`\n${run.length - failed}/${run.length} checks passed${only ? ` (ONLY="${only}": not the full run)` : ""}`);
process.exit(failed ? 1 : 0);
