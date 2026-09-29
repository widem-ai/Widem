import type { Content } from "../../content/index.ts";
import type { Lang } from "../site.ts";
import { BrandMark } from "./BrandMark.tsx";
import { LangSwitch } from "./LangSwitch.tsx";
import { ThemeToggle } from "./ThemeToggle.tsx";

export function Header({ lang, c }: { lang: Lang; c: Content["header"] }) {
  return (
    <header className="site-head">
      <div className="head-in">
        <a className="brand" href="#top" aria-label={c.homeLabel}>
          <BrandMark />
          <span>{c.brand}</span>
        </a>
        <div className="ctrl">
          <ThemeToggle c={c} />
          <LangSwitch lang={lang} c={c} />
        </div>
      </div>
    </header>
  );
}
