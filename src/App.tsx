import { content } from "../content/index.ts";
import { Footer } from "./components/Footer.tsx";
import { Header } from "./components/Header.tsx";
import { Hero } from "./sections/Hero.tsx";
import type { Lang } from "./site.ts";

export function App({ lang }: { lang: Lang }) {
  const c = content[lang];
  return (
    <>
      <Header lang={lang} c={c.header} />
      <main id="top">
        <Hero c={c.hero} />
      </main>
      <Footer c={c.footer} brand={c.header} />
    </>
  );
}
