import type { ReactNode } from "react";
import type { SectionId } from "./registry.ts";

export function Section({ id, children }: { id: SectionId; children?: ReactNode }) {
  return <section data-section={id} className="relative min-h-screen">{children}</section>;
}
