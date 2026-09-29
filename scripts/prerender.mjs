// Pre-render: turns the client build's dist/index.html template into one static page per language.
// Input: dist/index.html (vite build) + build-ssr/entry-server.js (vite build --ssr).
// Output: dist/index.html (English, /Widem/) and dist/ar/index.html (Arabic, /Widem/ar/). Fails loudly.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const ssrDir = join(root, "build-ssr");

const template = await readFile(join(dist, "index.html"), "utf8");
const { renderPage, LANGS, pagePath } = await import(pathToFileURL(join(ssrDir, "entry-server.js")).href);

function fill(tpl, marker, value) {
  if (!tpl.includes(marker)) throw new Error(`prerender: template has no ${marker}`);
  return tpl.replace(marker, () => value);
}

for (const lang of LANGS) {
  const { htmlAttrs, head, body } = renderPage(lang);
  const htmlTag = /<html[^>]*>/;
  if (!htmlTag.test(template)) throw new Error("prerender: template has no <html> tag");
  let page = template.replace(htmlTag, () => `<html ${htmlAttrs}>`);
  page = fill(page, "<!--app-head-->", head);
  page = fill(page, "<!--app-html-->", body);

  const rel = pagePath(lang).replace(/^\/Widem\//, ""); // "" or "ar/"
  const outDir = join(dist, rel);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "index.html"), page);
  console.log(`prerender: ${lang} -> dist/${rel}index.html (${Buffer.byteLength(page)} bytes)`);
}

await rm(ssrDir, { recursive: true, force: true });
