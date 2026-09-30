import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Content } from "../../content/index.ts";
import type { Lang } from "../site.ts";
import { BrandMark } from "./BrandMark.tsx";
import { LangSwitch } from "./LangSwitch.tsx";
import { ThemeToggle } from "./ThemeToggle.tsx";

// The section ids the links point to, in the prototype's order (their labels live in content header.nav).
const SECTIONS = ["problem", "services", "compare", "work", "how", "about", "faq"] as const;
const order = (i: number) => ({ "--i": i }) as CSSProperties;

// Two stages, read from one attribute the hero sets on <html>: data-stage="intro" while the visitor is inside the
// hero story (brand and AR|EN only), "site" once they land in the page (the full navigation arrives). Unset = full
// navigation (JS off, reduced motion). The header never measures the hero; the whole change is CSS (site.css),
// and everything that arrives carries the class `late`.
export function Header({ lang, c }: { lang: Lang; c: Content["header"] }) {
  const [open, setOpen] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const head = useRef<HTMLElement>(null);
  const sig = useRef<HTMLSpanElement>(null);

  // While the phone menu is open: Escape closes it (focus back on the button), so does a tap outside the header,
  // and so does the page going back to the intro (the menu button fades out; the menu must not stay behind).
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      menuBtn.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (!head.current?.contains(e.target as Node)) setOpen(false);
    };
    const mo = new MutationObserver(() => {
      if (root.dataset.stage === "intro") setOpen(false);
    });
    mo.observe(root, { attributes: true, attributeFilter: ["data-stage"] });
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      mo.disconnect();
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  // The signal line under the link you point at (prototype), moved by transform only. Positions are read with
  // offsetLeft/offsetWidth (layout, not transforms: ARCHITECTURE §3); the line is 100px wide and scaled to fit.
  const sigTo = (a: HTMLElement | null) => {
    const s = sig.current;
    if (!s) return;
    if (!a) {
      s.style.opacity = "0";
      return;
    }
    s.style.transform = `translateX(${a.offsetLeft + 10}px) scaleX(${Math.max(0, a.offsetWidth - 20) / 100})`;
    s.style.opacity = "1";
  };
  const close = () => setOpen(false);

  return (
    <header className="site-head" ref={head}>
      <div className="head-in">
        <a className="brand" href="#top" aria-label={c.homeLabel}>
          <BrandMark />
          <span>{c.brand}</span>
        </a>
        <nav className="nav late" aria-label={c.navLabel} onPointerLeave={() => sigTo(null)}>
          {SECTIONS.map((id, i) => (
            <a
              key={id}
              href={`#${id}`}
              style={order(i)}
              onPointerEnter={(e) => sigTo(e.currentTarget)}
              onFocus={(e) => sigTo(e.currentTarget)}
              onBlur={() => sigTo(null)}
            >
              {c.nav[id]}
            </a>
          ))}
          <span className="nav-sig" ref={sig} aria-hidden="true" />
        </nav>
        <div className="ctrl">
          <span className="late slot book-slot">
            <a className="btn btn-sm" href="#book">
              {c.book}
            </a>
          </span>
          <span className="late slot theme-slot">
            <ThemeToggle c={c} />
          </span>
          <LangSwitch lang={lang} c={c} />
          <span className="late slot menu-slot">
            <button
              ref={menuBtn}
              className="icon-btn menu-btn"
              type="button"
              aria-expanded={open}
              aria-controls="mnav"
              aria-label={c.menu}
              onClick={() => setOpen((o) => !o)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path className="l1" d="M4 7h16" />
                <path className="l2" d="M4 12h16" />
                <path className="l3" d="M4 17h16" />
              </svg>
            </button>
          </span>
        </div>
      </div>
      <nav className={open ? "mnav open" : "mnav"} id="mnav" aria-label={c.navLabel}>
        {SECTIONS.map((id, i) => (
          <a key={id} href={`#${id}`} style={order(i)} onClick={close}>
            {c.nav[id]}
          </a>
        ))}
        <div className="mnav-row" style={order(SECTIONS.length)}>
          <ThemeToggle c={c} />
          <a className="btn" href="#book" onClick={close}>
            {c.book}
          </a>
        </div>
      </nav>
    </header>
  );
}
