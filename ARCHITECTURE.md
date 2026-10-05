# Widem website (rebuild from zero) - ARCHITECTURE.md

**Read this first.** Intent, not every file. Update it in the same commit as any change that alters an answer here.

## Purpose
A scroll-driven site for Widem: one hero film, then seven sections, in English and Arabic (RTL). Spec:
`C:/Users/User/OneDrive/Documents/Obsidian Vault/output/widem-website/rebuild-zero/` (spec, section 5 holds the order and handoffs).
Lives at `/Widem/` (GitHub Pages), Arabic at `/Widem/ar/`.

## Layout
- `src/sections/` the eight sections and `registry.ts`, the single source of page order and handoffs.
- `src/film/` the hero film (added in later tasks). `public/film/` its frames and posters.
- `src/site.ts` base path, languages, direction. No visible strings.
- `spike/` (branch `spike-live-chip` only) an isolated three.js test page for the live chip; not built or checked with the site.
  Build: `npx vite build --config spike/vite.config.mjs`; shoot: `node spike/shoot.mjs <outDir>`. `three` is a dependency for it only.
- `proto/` (branch `proto-code-only`) the chip built in code only: three + `postprocessing` + `n8ao`, no GLB. Build:
  `npx vite build --config proto/vite.config.mjs`; shoot: `node proto/shoot.mjs <outDir>`.
- `scripts/` `check.mjs` (browser check), `serve.mjs` (serves `dist/` at `/Widem/`), `lib/cdp.mjs` (Chrome driver).
  `build-sequence.mjs <id> <framesDir> [--budget-kb N]` copies Blender's `frame-####.webp` into `public/film/<id>/`,
  writes its manifest (poster = frame 1) and fails over the size budget (hero: 6000 KB). Frames are rendered by
  `scene.py --beat 1 --frames N --out DIR --res W` in the vault's `rebuild-zero/blender/`, never over the approved stills.

## The handoff rule
Each section ends on an object or light (`handoffOut`); the next must start on the same one (`handoffIn`). The film starts on
`chip-dark` and ends on `chip-alive`. `test/registry.test.ts` enforces all three. Change the order only in `registry.ts`.

## Checks
`npm run typecheck && npm test && npm run build && npm run check` must pass before any commit. `test/` runs by node type
stripping and is not type-checked (no `@types/node`).

## Never
Never merge to `main`, never push. Mohannad pushes.
