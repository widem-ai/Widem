/* Widem chip cursor (2026-09-27). Self-contained, no library.
   Include with: <script src="cursor.js" defer></script>
   - A small AI die (rounded square, 3 pins per side) replaces the mouse cursor.
     Hotspot = the die's top-left corner, drawn exactly on the pointer so clicks stay precise.
   - A soft glow ring trails behind (lerp 0.25). Only transform and opacity ever animate.
   - Interactive elements "power it on"; text fields hide it and bring back the native I-beam.
   - Runs only for a fine, hovering pointer (a mouse). Never on touch; never under
     prefers-reduced-motion or forced-colors: the native cursor stays and nothing is injected.
   - Pointer coordinates are physical (clientX/Y), so it behaves identically in RTL. */
(function () {
  "use strict";
  if (typeof window === "undefined" || !window.matchMedia || !window.requestAnimationFrame) return;

  var fine = window.matchMedia("(hover: hover) and (pointer: fine)");
  var calm = window.matchMedia("(prefers-reduced-motion: reduce)");
  var forced = window.matchMedia("(forced-colors: active)");
  var root = document.documentElement;

  var HOT = 3;            /* SVG units from the SVG's corner to the die's corner = hotspot offset */
  var DIE = 18;           /* die side in px */
  var RING = 34;          /* glow ring diameter in px */
  var LERP = 0.25;

  var INTERACTIVE = 'a[href], button, [role="button"], [role="tab"], [role="link"], summary, label, select, input, [tabindex]:not([tabindex="-1"])';
  var TEXTY = 'textarea, [contenteditable]:not([contenteditable="false"]), input:not([type]), ' +
    'input[type="text"], input[type="email"], input[type="search"], input[type="tel"], input[type="url"], ' +
    'input[type="password"], input[type="number"], input[type="date"], input[type="time"], input[type="datetime-local"], input[type="month"], input[type="week"]';

  var css =
    "html.chip-cursor, html.chip-cursor * { cursor: none !important; }" +
    "html.chip-cursor " + TEXTY.split(", ").join(", html.chip-cursor ") + " { cursor: text !important; }" +
    "#chip-cursor { position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647; pointer-events: none; direction: ltr; contain: layout style; opacity: 0; transition: opacity .15s linear; }" +
    "#chip-cursor.is-in { opacity: 1; }" +
    "#chip-cursor.is-text { opacity: 0; }" +
    "#chip-cursor > * { position: absolute; top: 0; left: 0; pointer-events: none; will-change: transform; }" +
    "#chip-cursor .cc-ring { width: " + RING + "px; height: " + RING + "px; margin: " + (-RING / 2) + "px 0 0 " + (-RING / 2) + "px; border-radius: 50%;" +
    " background: radial-gradient(circle, var(--cc-glow) 0%, transparent 68%); opacity: .55; }" +
    "#chip-cursor .cc-pulse { width: " + RING + "px; height: " + RING + "px; margin: " + (-RING / 2) + "px 0 0 " + (-RING / 2) + "px; border-radius: 50%;" +
    " border: 1.5px solid var(--cc-c); opacity: 0; }" +
    "#chip-cursor .cc-pulse > i { display: block; }" +
    "#chip-cursor .cc-die { width: 24px; height: 24px; margin: " + (-HOT) + "px 0 0 " + (-HOT) + "px; }" +
    "#chip-cursor .cc-scale { width: 24px; height: 24px; transform-origin: " + HOT + "px " + HOT + "px; transition: transform .14s cubic-bezier(.2,.8,.2,1); }" +
    "#chip-cursor.is-on .cc-scale { transform: scale(1.35); }" +
    "#chip-cursor.is-on .cc-ring { opacity: 1; }" +
    "#chip-cursor svg { display: block; overflow: visible; }" +
    "#chip-cursor .cc-pins, #chip-cursor .cc-core { opacity: .55; transition: opacity .14s linear; }" +
    "#chip-cursor .cc-halo { opacity: 0; transition: opacity .14s linear; }" +
    "#chip-cursor.is-on .cc-pins, #chip-cursor.is-on .cc-core, #chip-cursor.is-on .cc-halo { opacity: 1; }" +
    "#chip-cursor .cc-ring { transition: opacity .2s linear; }" +
    "#chip-cursor .cc-pulse.go { animation: cc-pulse .38s cubic-bezier(.2,.7,.3,1) forwards; }" +
    "@keyframes cc-pulse { from { opacity: .9; transform: var(--cc-at) scale(.35); } to { opacity: 0; transform: var(--cc-at) scale(1.25); } }";

  /* 24x24 SVG; the die is the 18x18 square at (3,3). Pins: 3 per side, 2.4px long. */
  function pins() {
    var d = "", at = [7.5, 12, 16.5], i;
    for (i = 0; i < 3; i++) {
      d += "M" + at[i] + " 3V0.6M" + at[i] + " 21V23.4M3 " + at[i] + "H0.6M21 " + at[i] + "H23.4";
    }
    return d;
  }
  var SVG =
    '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<defs><filter id="cc-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6"/></filter></defs>' +
    '<g class="cc-halo" filter="url(#cc-blur)" stroke="var(--cc-c)" stroke-width="2.2" fill="none">' +
    '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="' + pins() + '" stroke-linecap="round"/></g>' +
    '<path class="cc-pins" d="' + pins() + '" stroke="var(--cc-c)" stroke-width="1.5" stroke-linecap="round" fill="none"/>' +
    '<rect x="3" y="3" width="18" height="18" rx="4" fill="var(--cc-fill)" stroke="var(--cc-c)" stroke-width="1.5"/>' +
    '<rect class="cc-core" x="8.5" y="8.5" width="7" height="7" rx="1.5" fill="none" stroke="var(--cc-c)" stroke-width="1.1"/>' +
    '</svg>';

  var el, ring, pulse, die, style, raf = 0, active = false;
  var x = -100, y = -100, rx = -100, ry = -100, seen = false;

  function token(name, fallback) {
    var v = getComputedStyle(root).getPropertyValue(name).trim();
    return v || fallback;
  }
  function paint() {
    if (!el) return;
    el.style.setProperty("--cc-c", token("--action-bright", "#2FD39E"));
    el.style.setProperty("--cc-fill", token("--ground", "#040B09"));
    el.style.setProperty("--cc-glow", token("--glow", "rgba(47, 211, 158, 0.35)"));
  }

  function frame() {
    raf = 0;
    rx += (x - rx) * LERP;
    ry += (y - ry) * LERP;
    if (Math.abs(x - rx) < 0.1 && Math.abs(y - ry) < 0.1) { rx = x; ry = y; }
    die.style.transform = "translate3d(" + x + "px," + y + "px,0)";
    var c = DIE / 2;
    ring.style.transform = "translate3d(" + (rx + c) + "px," + (ry + c) + "px,0)";
    if (rx !== x || ry !== y) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }

  function onMove(e) {
    if (e.pointerType && e.pointerType !== "mouse") return;
    x = e.clientX; y = e.clientY;
    if (!seen) { seen = true; rx = x; ry = y; root.classList.add("chip-cursor"); }
    el.classList.add("is-in");
    kick();
  }
  function onOver(e) {
    var t = e.target && e.target.closest ? e.target : null;
    var text = !!(t && t.closest(TEXTY));
    el.classList.toggle("is-text", text);
    el.classList.toggle("is-on", !text && !!(t && t.closest(INTERACTIVE)));
  }
  function onDown(e) {
    if ((e.pointerType && e.pointerType !== "mouse") || el.classList.contains("is-text")) return;
    pulse.style.setProperty("--cc-at", "translate3d(" + (x + DIE / 2) + "px," + (y + DIE / 2) + "px,0)");
    pulse.classList.remove("go");
    void pulse.offsetWidth; /* restart the animation */
    pulse.classList.add("go");
  }
  function onLeave(e) { if (!e.relatedTarget) el.classList.remove("is-in"); }
  function onBlur() { el.classList.remove("is-in"); }

  function start() {
    if (active) return;
    active = true;
    style = document.createElement("style");
    style.id = "chip-cursor-style";
    style.textContent = css;
    document.head.appendChild(style);
    el = document.createElement("div");
    el.id = "chip-cursor";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = '<div class="cc-ring"></div><div class="cc-pulse"></div><div class="cc-die"><div class="cc-scale">' + SVG + "</div></div>";
    ring = el.children[0]; pulse = el.children[1]; die = el.children[2];
    document.body.appendChild(el);
    paint();
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerover", onOver, { passive: true });
    document.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("mouseout", onLeave, { passive: true });
    window.addEventListener("blur", onBlur);
  }
  function stop() {
    if (!active) return;
    active = false; seen = false;
    if (raf) cancelAnimationFrame(raf), raf = 0;
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerover", onOver);
    document.removeEventListener("pointerdown", onDown);
    document.removeEventListener("mouseout", onLeave);
    window.removeEventListener("blur", onBlur);
    root.classList.remove("chip-cursor");
    if (el) el.remove();
    if (style) style.remove();
    el = style = null;
  }
  function decide() { (fine.matches && !calm.matches && !forced.matches) ? start() : stop(); }
  function watch(mq) { mq.addEventListener ? mq.addEventListener("change", decide) : mq.addListener(decide); }

  watch(fine); watch(calm); watch(forced);
  /* Tokens can change if a theme attribute or class flips on <html>. */
  new MutationObserver(paint).observe(root, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
  if (document.body) decide(); else document.addEventListener("DOMContentLoaded", decide);
})();
