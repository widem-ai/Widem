// The one place scenes get layout sizes from (ARCHITECTURE §2-3). Sizes come from ResizeObserver's
// content box: the element's layout size, unaffected by any transform a scene applies mid-animation
// (never getBoundingClientRect). Fires on the element's own size changes: window resize, phone rotate,
// fonts or images re-flowing the page, a hidden tab coming back at a new size.

export type Size = { width: number; height: number };

/** Calls `onSize` now (synchronously, from offset sizes) and on every later size change. Returns a stop function. */
export function observeSize(el: HTMLElement, onSize: (size: Size) => void): () => void {
  let last: Size = { width: el.offsetWidth, height: el.offsetHeight };
  onSize(last);
  if (typeof ResizeObserver === "undefined") return () => {};
  const ro = new ResizeObserver((entries) => {
    const box = entries[entries.length - 1].contentRect;
    const next = { width: Math.round(box.width), height: Math.round(box.height) };
    if (next.width === last.width && next.height === last.height) return;
    last = next;
    onSize(next);
  });
  ro.observe(el);
  return () => ro.disconnect();
}

/** Whether the element is on screen (for pausing work when it is not). Returns a stop function. */
export function observeVisible(el: Element, onChange: (visible: boolean) => void, threshold = 0): () => void {
  if (typeof IntersectionObserver === "undefined") { onChange(true); return () => {}; }
  const io = new IntersectionObserver((entries) => onChange(entries[entries.length - 1].isIntersecting), { threshold });
  io.observe(el);
  return () => io.disconnect();
}

export type Box = { x: number; y: number; width: number; height: number };

/** Layout boxes of inline elements (e.g. the words of a headline) relative to their offset parent, from offset
 *  sizes: unaffected by transforms or a pinned scene. Words never wrap inside themselves, so one box each. */
export function inlineBoxes(els: HTMLElement[]): Box[] {
  return els.map((el) => ({ x: el.offsetLeft, y: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight }));
}
