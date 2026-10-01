# Widem website — ARCHITECTURE.md

**Read this before touching anything.** It records intent, not every file. Spec and gate history live in the
vault (`output/widem-website/spec.md` §13, hub `output/widem-website/README.md`). Written 2026-09-30 at the
start of the React rebuild; update it in the same commit as any change that alters an answer below.

## 1. What's in the system?

```
content/en.ts · content/ar.ts   (every visible string, one file per language)
        │
src/  React + TypeScript components  ── GSAP + ScrollTrigger (scroll scenes, via @gsap/react useGSAP)
        │
scripts/prerender  ── renders / and /ar/ to static HTML at build time
        │
dist/  plain static files ──(GitHub Action)──▶ GitHub Pages, https://widem-ai.github.io/Widem/
```
No server, no database, no forms, no analytics, no cookies. One outbound link: the booking page (Calendly).
`prototype/` holds the approved v5 HTML prototype, kept as the reference for text and design parity (A14).
It is never served from the React build.
`art/` holds the hero film's source: `art/cinematic/scene.py` (the whole Blender scene as a script; its PNG frame
masters are rendered into `art/cinematic/frames/`, which git ignores) and `art/export.py`, which writes the web files to
`public/hero/` (the WebP frame sequences in `film/wide/` and `film/tall/`, and frame 0 of each as the AVIF + WebP
poster). Only `public/` is served.

## 2. Who's responsible for what?

| Responsibility | Sole owner |
|---|---|
| Every visible word, both languages | `content/en.ts`, `content/ar.ts` (same keys; a key missing in one fails the check) |
| Colours, type, spacing, motion timings | `src/styles/tokens.css` (design tokens as CSS variables; components read roles, never raw values) |
| Tailwind's theme | `src/styles/tailwind.css`: maps Tailwind colour/font names onto the tokens; its default palette is switched off |
| Language and direction (`lang`, `dir`) | the page shell, set at pre-render; components never set `dir` themselves |
| Theme (dark/light) | one `data-theme` attribute on `<html>`; stored per visitor |
| Where the visitor is in the hero story (`intro` / `site`) | one `data-stage` attribute on `<html>`, written only by `src/sections/Hero.tsx`: `intro` inside the pinned story, `site` after it; read (never written) by the header, which never measures the hero; unset (JS off, reduced motion) = full navigation. See §3 |
| Scroll scenes | one component per section under `src/sections/`, each owning its own GSAP context and cleanup |
| Shared scroll utilities (the route line, docks) | `src/scroll/`: nothing else measures layout for scroll |
| SEO tags, hreflang, JSON-LD | `src/seo/`, rendered into the HTML at pre-render (never injected after load) |
| Imagery | masters in `art/` (the hero film and its poster are rendered by `art/cinematic/scene.py` in Blender), web files made only by `art/export.py`; weight budgets live in the check (A6) |
| Checks | `scripts/check.mjs`: one command, run by CI |

## 3. Why is it built this way? (don't "improve" these)

- **React, pre-rendered, not a browser-only app.** Spec A1 needs a real `/ar/` page and A9 needs tags in the
  HTML; a client-side-only React app fails both. Chosen by Mohannad 2026-09-30 (R1) over Next.js.
- **Strings in content files, not in components.** Two languages share one layout; a string in a component
  is a string the Arabic page will miss.
- **Layout measured without transforms.** Scroll scenes scale and move cards; measuring with
  `getBoundingClientRect` mid-animation put the route line 16–664 px off its docks on the prototype
  (2026-09-29). Measure layout positions (offset-based), and redraw on the page's own size changes, fonts,
  images and visibility changes.
- **The hero is a pre-rendered film scrubbed by the scroll (branch `hero-cinematic`, 2026-10-01, a proof: not yet
  approved by Mohannad, so it does not replace the three.js hero of `hero-3d` until he says so).** His reference is a
  2026 "cinematic scroll" site: one near-photoreal object, film light, haze, one bold line, the scroll as the playhead.
  Real-time three.js cannot reach film lighting on a phone within a sane weight, so the shot ("the core": a gold,
  glass-windowed chip on a dark board) is rendered offline in Blender (Cycles) by `art/cinematic/scene.py` and played as
  a WebP frame sequence: `src/sections/heroFilm.ts` (no library, a 2D canvas) draws the frame that matches the pinned
  scroll, cross-fading between neighbours, with progressive loading (coarse frames first, the frame in view jumps the
  queue) after the page's load event. Two sets: wide (desktop, 96 frames) and tall (portrait phones, 72 frames, its
  own camera). The hero is pinned as before (CSS `position: sticky` in a track `--hero-pin` screens tall, only with JS
  and motion allowed). One GSAP timeline in `src/sections/Hero.tsx` owns the playhead and the text: the text steps
  aside for the glide and locks back in, word by word, at the reveal. The headline is always the HTML `<h1>`, never
  drawn into the frames. Storyboard and scene script: vault `output/widem-website/design/hero-cinematic/`. three.js is
  no longer imported on this branch (it stays in package.json until the branch is merged or dropped).
- **Poster first.** Frame 0 of each film (`public/hero/scene-wide|tall.*`, written by `art/export.py` from the same
  master as the frame) is the first paint, the LCP, and the whole hero with reduced motion, JS off or a weak device
  (2 cores or fewer, 2 GB or less, Save-Data: no frames are downloaded; the text story still runs over the poster).
  Because frame 0 is the poster, the canvas fading in shows no jump (the check compares them pixel by pixel). Re-export
  whenever the film is re-rendered; the check measures text contrast over the poster and over the film. The section
  keeps the class `night`.
- **The header contract: `<html data-stage>`.** `"intro"` while the visitor is inside the pinned hero story, `"site"`
  once it has ended and the page releases (and `"intro"` again on scrolling back into it). **Unset** when there is no
  pinned story (reduced motion, JS off): the header then shows the full site navigation. Only the hero writes it; the
  header only reads it. Checked in `scripts/check.mjs` (stage, reduced motion, JS off).
- **Tailwind CSS v4, reading our tokens (added 2026-09-30, Mohannad's decision).** Reason: the component libraries
  worth borrowing from (SmoothUI, Unlumen UI, Skiper UI) are written in Tailwind; with it their pieces port with
  little rewriting. Tailwind never owns a value: `tailwind.css` points every colour at a `tokens.css` variable and
  switches the default palette off, so `bg-ground` follows the theme and the `night` scope like everything else.
  Existing components keep their own CSS; new ones may use either. Its reset (preflight) sits in a CSS layer, so our
  unlayered styles win (checked: footer and hero pixel-identical before and after, EN and AR). Motion (framer-motion)
  is not added: GSAP stays the one animation engine unless a borrowed component truly needs Motion.
- **GitHub Pages, base path `/Widem/`.** Free, public repo (Spec D3/D5). Every asset URL goes through the
  base path; a hard-coded `/` breaks the live site.
- **Clients named by business, never by founder.** The client agreed to be named (2026-09-30, recorded in the vault):
  the Work section shows the business name, in both languages. The founder or contact is never named anywhere,
  and the A5 check fails the build if they are. A logo or testimonial needs its own permission. Spec D7.

## 4. What's allowed to touch what?

content → components → scroll utilities → GSAP. Pre-render reads components and content; nothing reads the
prototype at runtime.
**Banned:** hard-coded visible strings in components · raw colours or pixel timings outside tokens · a scroll
scene measuring layout itself instead of `src/scroll/` · animating layout properties (only `transform`,
`opacity`) · any tracker, cookie, form or third-party script except fonts and the booking link · client
names, emails, internal URLs or keys anywhere (A5 grep fails the build) · the three banned competitor lines (A8) · a raw colour in a Tailwind class (`bg-[#...]`) or Tailwind's default palette (the check fails).

## 5. How does data actually move?

Build: content + components → pre-render → `dist/en` + `dist/ar` HTML with tags → deploy.
Visit: static HTML paints (readable with JS off) → React hydrates → GSAP scenes attach per section → scroll
drives them; reduced motion skips straight to each scene's final state.
Language switch: a link to the same section in the other page (A2), not a client-side string swap.

## 6. What can never break?

- Content is readable with JS off and with reduced motion (final state, nothing hidden).
- The header in the intro stage keeps the brand and AR|EN reachable; whatever it hides is `visibility:hidden`, so
  it is out of the Tab order too (checked by a real Tab walk).
- `/` and `/ar/` have the same sections, strings and links (A14); Arabic is `dir="rtl"` and mirrored.
- Lighthouse Performance ≥ 90 and Accessibility ≥ 95 in both languages **with** the scenes (A6).
- No horizontal scroll at any width; keyboard focus never trapped by a pinned scene.
- The one contact path is "Book a call" (A4).
- No client identity or secret in the repo (A5).

## 7. Where does new code belong?

| Adding | Goes |
|---|---|
| A section | `src/sections/<Name>.tsx` + its strings in both content files + its entry in the states-list checks |
| A scroll effect | inside its section component, using `src/scroll/` for any measurement |
| A helper scenes share (timing/colour tokens, direction, theme changes) | `src/motion/`: reads tokens, never defines values |
| A browser check | `scripts/check.mjs`, driving Chrome through `scripts/lib/cdp.mjs` (no Playwright dependency) |
| An image | master in `art/`, a job in `art/export.py`, a budget line in the check; never a hand-made file in `public/` |
| Screenshots to look at | `node scripts/shots.mjs <dir>` (not a check) |
| A string | both `content/*.ts` files, same key |
| A token | `src/styles/tokens.css` |
| A check | `scripts/check.mjs`, with a planted break proving it fails |
| A dependency | only with a stated reason and Alfred's yes; record it here if it changes an answer above (three.js: unused on `hero-cinematic`; the film needs none) |

## 8. When do you stop and ask?

If a task needs anything banned in §4, breaks §6, or changes a "why" in §3 (for example a new framework, a
tracker, naming a client, a server): **STOP → name the conflict → show what it affects → propose the smallest
fix that keeps the rule.**
