import { test } from "node:test";
import assert from "node:assert/strict";
import { contentFor } from "../src/content/index.ts";

const leaves = (o: unknown): string[] =>
  typeof o === "string" ? [o] : typeof o === "object" && o ? Object.values(o).flatMap(leaves) : [];

test("both languages have the same keys and are marked draft", () => {
  const en = contentFor("en"), ar = contentFor("ar");
  assert.deepEqual(Object.keys(en).sort(), Object.keys(ar).sort());
  assert.equal(en.draft, true);
  assert.equal(ar.draft, true);
});

test("no em dashes and no WhatsApp in any string", () => {
  for (const lang of ["en", "ar"] as const) {
    for (const s of leaves(contentFor(lang))) {
      assert.ok(!/[\u2013\u2014]/.test(s), `${lang}: dash in "${s}"`);
      assert.ok(!/whatsapp|واتساب/i.test(s), `${lang}: WhatsApp in "${s}"`);
    }
  }
});
