import type { Lang } from "./site.ts";
import { SECTIONS } from "./sections/registry.ts";
import { Section } from "./sections/Section.tsx";
import { Hero } from "./sections/Hero.tsx";
import { Nav } from "./Nav.tsx";

export function App({ lang }: { lang: Lang }) {
  return (
    <>
      <Nav lang={lang} />
      <main>{SECTIONS.map((s) => (s.id === "hero" ? <Hero key="hero" lang={lang} /> : <Section key={s.id} id={s.id} />))}</main>
    </>
  );
}
