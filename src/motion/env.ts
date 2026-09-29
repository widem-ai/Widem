// What scenes need to know about the page around them: timing and colour tokens (tokens.css owns the
// values, ARCHITECTURE §2), the current direction, and theme changes. Browser-only; call from effects.

const rootStyle = () => getComputedStyle(document.documentElement);

/** A CSS custom property from tokens.css, trimmed. */
export function token(name: string): string {
  return rootStyle().getPropertyValue(name).trim();
}

/** A timing token ("0.38s" or "380ms") in seconds, for GSAP. */
export function seconds(name: string): number {
  const v = token(name);
  const n = parseFloat(v);
  if (Number.isNaN(n)) throw new Error(`Widem: timing token ${name} is missing from tokens.css`);
  return v.endsWith("ms") ? n / 1000 : n;
}

export const isRtl = (): boolean => document.documentElement.dir === "rtl";

/** Runs `cb` whenever the theme switch changes data-theme on <html>. Returns a stop function. */
export function onThemeChange(cb: () => void): () => void {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}

export const REDUCED = "(prefers-reduced-motion: reduce)";
export const MOTION_OK = "(prefers-reduced-motion: no-preference)";
