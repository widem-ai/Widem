// The page order and the handoff chain from the spec (section 5). A handoff names the object or light
// a section ends on; the next section must start on the same one (test/registry.test.ts).
export type Handoff =
  | "chip-dark" | "gold-trace" | "point-of-light" | "four-cards" | "gold-die"
  | "green-line" | "divider" | "green-point" | "chip-alive";

export type SectionId = "hero" | "familiar" | "proof" | "how" | "compare" | "founder" | "questions" | "final";

export type SectionDef = { id: SectionId; handoffIn: Handoff; handoffOut: Handoff };

export const SECTIONS: readonly SectionDef[] = [
  { id: "hero", handoffIn: "chip-dark", handoffOut: "gold-trace" },
  { id: "familiar", handoffIn: "gold-trace", handoffOut: "point-of-light" },
  { id: "proof", handoffIn: "point-of-light", handoffOut: "four-cards" },
  { id: "how", handoffIn: "four-cards", handoffOut: "gold-die" },
  { id: "compare", handoffIn: "gold-die", handoffOut: "green-line" },
  { id: "founder", handoffIn: "green-line", handoffOut: "divider" },
  { id: "questions", handoffIn: "divider", handoffOut: "green-point" },
  { id: "final", handoffIn: "green-point", handoffOut: "chip-alive" },
];
