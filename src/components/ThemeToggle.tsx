import { useSyncExternalStore } from "react";
import type { Content } from "../../content/index.ts";

// Theme lives in one place: data-theme on <html> (set before paint by the shell), stored per visitor.
// The pre-render knows no visitor, so it renders the default (dark); hydration then reads the real value.
type Theme = "dark" | "light";
const STORE_KEY = "widem-theme";

function subscribe(onChange: () => void) {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}
const getTheme = (): Theme => (document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
const getServerTheme = (): Theme => "dark";

function setTheme(next: Theme) {
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem(STORE_KEY, next);
  } catch {
    // Storage blocked (private mode): the theme still applies for this visit.
  }
}

export function ThemeToggle({ c }: { c: Content["header"] }) {
  const theme = useSyncExternalStore(subscribe, getTheme, getServerTheme);
  return (
    <button
      className="icon-btn theme-btn"
      type="button"
      aria-label={theme === "light" ? c.themeToDark : c.themeToLight}
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
    >
      <svg className="moon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
      </svg>
      <svg className="sun" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8" />
      </svg>
    </button>
  );
}
