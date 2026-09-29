import type { Content } from "../../content/index.ts";
import { LINKEDIN_URL } from "../site.ts";
import { BrandMark } from "./BrandMark.tsx";

// Links point at the prototype's section ids; those sections arrive in later slices.
// The prototype's "Legal > Privacy policy" column waits for the privacy page to be ported.
export function Footer({ c, brand }: { c: Content["footer"]; brand: Content["header"] }) {
  return (
    <footer className="foot">
      <div className="foot-in">
        <div className="about">
          <a className="brand" href="#top" aria-label={brand.homeLabel}>
            <BrandMark />
            <span>{brand.brand}</span>
          </a>
          <p>{c.slogan}</p>
        </div>
        <div>
          <h2>{c.company}</h2>
          <ul>
            <li><a href="#about">{c.about}</a></li>
            <li><a href="#work">{c.work}</a></li>
            <li><a href="#how">{c.how}</a></li>
            <li><a href="#faq">{c.faq}</a></li>
          </ul>
        </div>
        <div>
          <h2>{c.services}</h2>
          <ul>
            {[c.s1, c.s2, c.s3, c.s4, c.s5].map((s) => (
              <li key={s}><a href="#services">{s}</a></li>
            ))}
          </ul>
        </div>
        <div>
          <h2>{c.contact}</h2>
          <ul>
            <li><a href="#book">{c.book}</a></li>
            <li><a href={LINKEDIN_URL} target="_blank" rel="noopener">{c.linkedin}</a></li>
          </ul>
        </div>
      </div>
      <div className="foot-bottom">
        <span>{c.copyright}</span>
        <span>{c.noTracking}</span>
      </div>
    </footer>
  );
}
