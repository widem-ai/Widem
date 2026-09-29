// Site-wide facts: where the site lives and which pages exist. No visible strings here.
export const BASE = "/Widem/";
export const ORIGIN = "https://widem-ai.github.io";

export const LANGS = ["en", "ar"] as const;
export type Lang = (typeof LANGS)[number];

export const dirOf = (lang: Lang): "ltr" | "rtl" => (lang === "ar" ? "rtl" : "ltr");
/** Root-relative path of a language's page, always under the base path. */
export const pagePath = (lang: Lang): string => (lang === "en" ? BASE : `${BASE}ar/`);
/** Absolute URL of a language's page (canonical, hreflang). */
export const pageUrl = (lang: Lang): string => ORIGIN + pagePath(lang);
/** Any file served from public/ (favicons), resolved under the base path. */
export const assetPath = (file: string): string => BASE + file;

export const LINKEDIN_URL = "https://www.linkedin.com/in/muhannad-abdulrazek-b41707371/";
