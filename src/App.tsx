import { SECTIONS } from "./sections/registry.ts";
import { Section } from "./sections/Section.tsx";
import { Hero } from "./sections/Hero.tsx";

export function App() {
  return <main>{SECTIONS.map((s) => (s.id === "hero" ? <Hero key="hero" /> : <Section key={s.id} id={s.id} />))}</main>;
}
