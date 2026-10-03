// Where the site lives and which pages exist. No visible strings here.
export const BASE = "/Widem/";
export const LANGS = ["en", "ar"] as const;
export type Lang = (typeof LANGS)[number];
export const dirOf = (lang: Lang): "ltr" | "rtl" => (lang === "ar" ? "rtl" : "ltr");
export const pagePath = (lang: Lang): string => (lang === "en" ? BASE : `${BASE}ar/`);
export const langOf = (pathname: string): Lang => (pathname.startsWith(`${BASE}ar`) ? "ar" : "en");
