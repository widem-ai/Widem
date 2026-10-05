import type { Lang } from "../site.ts";
import { en } from "./en.ts";
import { ar } from "./ar.ts";

export type Content = { draft: true; nav: { skip: string; how: string; work: string; book: string; lang: string }; hero: { line: string } };
export const contentFor = (lang: Lang): Content => (lang === "ar" ? ar : en);
