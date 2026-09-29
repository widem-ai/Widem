// The page shell: the only place that sets lang/dir (on <html>), and the head tags every page shares.
import { content } from "../../content/index.ts";
import { seoHead } from "../seo/head.ts";
import { assetPath, dirOf, type Lang } from "../site.ts";
import { escapeHtml } from "./escape.ts";

const FONT_CSS = "https://fonts.googleapis.com/css2?family=Readex+Pro:wght@300;400;500;600;700&display=swap";

// Runs before first paint: applies the visitor's stored theme (no flash) and marks JS as on,
// so controls that need JS (the theme button) are hidden when it is off.
const THEME_BOOT =
  '(function(){var r=document.documentElement;r.classList.add("js");try{var t=localStorage.getItem("widem-theme");' +
  'if(t==="light"||t==="dark")r.setAttribute("data-theme",t)}catch(e){}})();';

export function htmlAttributes(lang: Lang): string {
  return `lang="${lang}" dir="${dirOf(lang)}"`;
}

export function shellHead(lang: Lang): string {
  return [
    `<script>${THEME_BOOT}</script>`,
    seoHead(lang, content[lang]),
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    `<link rel="stylesheet" href="${escapeHtml(FONT_CSS)}">`,
    `<link rel="icon" href="${assetPath("favicon.svg")}" type="image/svg+xml">`,
    `<link rel="icon" href="${assetPath("favicon-32.png")}" type="image/png" sizes="32x32">`,
    `<link rel="apple-touch-icon" href="${assetPath("apple-touch-icon.png")}">`,
  ].join("\n");
}
