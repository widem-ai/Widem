import type { Content } from "../../content/index.ts";

// Walking-skeleton hero: headline, subhead, main button. The scroll scene and rotating word come later.
export function Hero({ c }: { c: Content["hero"] }) {
  return (
    <section className="hero" id="hero" aria-labelledby="h">
      <div className="hero-in">
        <h1 id="h">
          {c.headlineBefore} <span className="rot">{c.headlineWord}</span> {c.headlineAfter}
        </h1>
        <p className="slogan">{c.subhead}</p>
        <a className="btn" href="#book">
          {c.cta}
        </a>
      </div>
    </section>
  );
}
