// The one check command: `npm run build` then `npm run check`. Exit 1 on any failure.
import { launch } from "./lib/cdp.mjs";
import { startServer } from "./serve.mjs";

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
  expect(page.errors.length === 0, `console errors: ${page.errors.join(" | ")}`);
} finally {
  await page.close();
  server.close();
}
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log("check: all pass");
