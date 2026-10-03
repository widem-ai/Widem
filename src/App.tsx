import { SECTIONS } from "./sections/registry.ts";
import { Section } from "./sections/Section.tsx";

export function App() {
  return <main>{SECTIONS.map((s) => <Section key={s.id} id={s.id} />)}</main>;
}
