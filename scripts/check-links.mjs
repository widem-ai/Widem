// Link check for the static site. No dependencies: node scripts/check-links.mjs
// Fails (exit 1) when:
//   1. a booking button (data-t="cta", or the footer "Book a call", data-t="fk1")
//      still points at the #book section instead of the booking page, or does not
//      open in a new tab with rel="noopener";
//   2. any in-page link href="#x" has no element with id="x" on the same page.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BOOKING_URL = "https://calendly.com/mohannadabdelrazek/widem-onboarding";
const pages = process.argv.slice(2).length ? process.argv.slice(2) : ["index.html", "privacy.html"];

const attr = (tag, name) => {
  const m = tag.match(new RegExp(String.raw`\s${name}\s*=\s*"([^"]*)"`, "i"));
  return m ? m[1] : null;
};

const failures = [];
let bookingButtons = 0;
let anchorLinks = 0;

for (const page of pages) {
  const html = readFileSync(join(root, page), "utf8");
  const lineOf = (i) => html.slice(0, i).split("\n").length;
  const ids = new Set([...html.matchAll(/\sid\s*=\s*"([^"]+)"/gi)].map((m) => m[1]));

  for (const m of html.matchAll(/<a\b[^>]*>/gi)) {
    const tag = m[0];
    const href = attr(tag, "href");
    const dataT = attr(tag, "data-t");
    const where = `${page}:${lineOf(m.index)}`;

    if (dataT === "cta" || dataT === "fk1") {
      bookingButtons++;
      if (!href || href.startsWith("#book")) {
        failures.push(`${where} booking button (data-t="${dataT}") points at "${href}" instead of the booking page`);
      } else if (href !== BOOKING_URL) {
        failures.push(`${where} booking button (data-t="${dataT}") points at "${href}", expected ${BOOKING_URL}`);
      } else {
        if (attr(tag, "target") !== "_blank") failures.push(`${where} booking button does not open in a new tab (target="_blank")`);
        if (!/\bnoopener\b/.test(attr(tag, "rel") || "")) failures.push(`${where} booking button opens a new tab without rel="noopener"`);
      }
    }

    if (href && href.startsWith("#") && href.length > 1) {
      anchorLinks++;
      if (!ids.has(href.slice(1))) failures.push(`${where} in-page link "${href}" has no element with id="${href.slice(1)}"`);
    }
  }
}

if (bookingButtons === 0) failures.push("no booking buttons found (data-t=\"cta\" or \"fk1\"): the check would pass on nothing");

if (failures.length) {
  console.error(`FAIL: ${failures.length} problem(s) in ${pages.join(", ")}`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(`PASS: ${bookingButtons} booking buttons open ${BOOKING_URL} in a new tab; ${anchorLinks} in-page links all have a target id.`);
