import type { Lang } from "../src/site.ts";
import { ar } from "./ar.ts";
import { en, type Content } from "./en.ts";

export type { Content };
export const content: Record<Lang, Content> = { en, ar };
