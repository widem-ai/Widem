// The shadcn `cn` helper (https://ui.shadcn.com/docs/installation/manual): joins class names and lets later
// Tailwind utilities override earlier ones. Components pulled from the registries in components.json import it
// as "@/lib/utils". Kept to clsx + tailwind-merge on purpose: `shadcn init` (v4.21) wrote a re-export of an npm
// package named "cn" instead, which was reverted (2026-10-06).
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
