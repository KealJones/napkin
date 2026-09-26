import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Where the site is served from: "/" locally, "/<repo>/" on GitHub Pages.
  base: process.env.NAPKIN_BASE ?? "/",
  // The files a browser host mounts (scripts/assets.mjs) ship only with that build.
  publicDir: process.env.VITE_NAPKIN_HOST === "browser" ? "public-pages" : "public",
  plugins: [react()],
  // The browser host's API runs in a module Worker that loads the runtime on demand.
  worker: { format: "es" },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4174",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
