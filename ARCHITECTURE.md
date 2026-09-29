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

## 2. Who's responsible for what?

| Responsibility | Sole owner |
|---|---|
| Every visible word, both languages | `content/en.ts`, `content/ar.ts` (same keys; a key missing in one fails the check) |
| Colours, type, spacing, motion timings | `src/styles/tokens.css` (design tokens as CSS variables; components read roles, never raw values) |
| Language and direction (`lang`, `dir`) | the page shell, set at pre-render; components never set `dir` themselves |
| Theme (dark/light) | one `data-theme` attribute on `<html>`; stored per visitor |
| Scroll scenes | one component per section under `src/sections/`, each owning its own GSAP context and cleanup |
| Shared scroll utilities (the route line, docks) | `src/scroll/`: nothing else measures layout for scroll |
| SEO tags, hreflang, JSON-LD | `src/seo/`, rendered into the HTML at pre-render (never injected after load) |
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
- **GitHub Pages, base path `/Widem/`.** Free, public repo (Spec D3/D5). Every asset URL goes through the
  base path; a hard-coded `/` breaks the live site.
- **Founder named, client not.** The client stays "a Riyadh career-services firm" until the client's written permission
  (`CLIENT_NAMED` switch). Spec D7.

## 4. What's allowed to touch what?

content → components → scroll utilities → GSAP. Pre-render reads components and content; nothing reads the
prototype at runtime.
**Banned:** hard-coded visible strings in components · raw colours or pixel timings outside tokens · a scroll
scene measuring layout itself instead of `src/scroll/` · animating layout properties (only `transform`,
`opacity`) · any tracker, cookie, form or third-party script except fonts and the booking link · client
names, emails, internal URLs or keys anywhere (A5 grep fails the build) · the three banned competitor lines (A8).

## 5. How does data actually move?

Build: content + components → pre-render → `dist/en` + `dist/ar` HTML with tags → deploy.
Visit: static HTML paints (readable with JS off) → React hydrates → GSAP scenes attach per section → scroll
drives them; reduced motion skips straight to each scene's final state.
Language switch: a link to the same section in the other page (A2), not a client-side string swap.

## 6. What can never break?

- Content is readable with JS off and with reduced motion (final state, nothing hidden).
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
| A string | both `content/*.ts` files, same key |
| A token | `src/styles/tokens.css` |
| A check | `scripts/check.mjs`, with a planted break proving it fails |
| A dependency | only with a stated reason and Alfred's yes; record it here if it changes an answer above |

## 8. When do you stop and ask?

If a task needs anything banned in §4, breaks §6, or changes a "why" in §3 (for example a new framework, a
tracker, naming a client, a server): **STOP → name the conflict → show what it affects → propose the smallest
fix that keeps the rule.**
