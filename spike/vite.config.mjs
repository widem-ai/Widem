// Spike build only: `npx vite build --config spike/vite.config.mjs`. Not part of the site build.
import { defineConfig } from "vite";
export default defineConfig({ root: "spike", base: "./", publicDir: "public",
  build: { outDir: "dist", emptyOutDir: true, rollupOptions: { input: "spike/chip.html" } } });
