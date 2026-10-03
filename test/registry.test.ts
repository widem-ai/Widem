import { test } from "node:test";
import assert from "node:assert/strict";
import { SECTIONS } from "../src/sections/registry.ts";

test("eight sections in the approved order", () => {
  assert.deepEqual(SECTIONS.map((s) => s.id), [
    "hero", "familiar", "proof", "how", "compare", "founder", "questions", "final",
  ]);
});

test("every section ends where the next one begins", () => {
  for (let i = 0; i < SECTIONS.length - 1; i++) {
    assert.equal(SECTIONS[i].handoffOut, SECTIONS[i + 1].handoffIn,
      `${SECTIONS[i].id} ends on ${SECTIONS[i].handoffOut} but ${SECTIONS[i + 1].id} starts on ${SECTIONS[i + 1].handoffIn}`);
  }
});

test("the film closes its loop: dark chip first, living chip last", () => {
  assert.equal(SECTIONS[0].handoffIn, "chip-dark");
  assert.equal(SECTIONS.at(-1)!.handoffOut, "chip-alive");
});
