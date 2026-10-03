import { type RefObject } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/** Pins `ref` for `length` viewport heights and reports scroll progress 0..1. */
export function useScrub(
  ref: RefObject<HTMLElement | null>,
  onProgress: (p: number) => void,
  { enabled, length }: { enabled: boolean; length: number },
) {
  useGSAP(() => {
    if (!enabled || !ref.current) return;
    const st = ScrollTrigger.create({
      trigger: ref.current,
      start: "top top",
      end: `+=${length * 100}%`,
      pin: true,
      scrub: true,
      invalidateOnRefresh: true,
      onUpdate: (self) => onProgress(self.progress),
      onRefresh: (self) => onProgress(self.progress),
    });
    onProgress(st.progress);
  }, { scope: ref, dependencies: [enabled, length] });
}
