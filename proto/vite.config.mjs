// Prototype build only: `npx vite build --config proto/vite.config.mjs`. Not part of the site build.
import { defineConfig } from "vite";
export default defineConfig({ root: "proto", base: "./", publicDir: "public",
  build: { outDir: "dist", emptyOutDir: true, rollupOptions: { input: "proto/chip.html" } } });
