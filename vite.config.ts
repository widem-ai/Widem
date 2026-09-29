import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { BASE } from "./src/site.ts";

// Client build writes dist/ (with dist/index.html as the pre-render template);
// the SSR build (see package.json "build") writes build-ssr/, which scripts/prerender.mjs consumes and deletes.
export default defineConfig({
  base: BASE,
  plugins: [react()],
});
