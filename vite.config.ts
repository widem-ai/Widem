import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { BASE } from "./src/site.ts";

export default defineConfig({
  base: BASE,
  plugins: [react(), tailwindcss()],
  build: { rollupOptions: { input: { en: "index.html", ar: "ar/index.html" } } },
});
