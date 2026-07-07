import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Additive Vite scaffold: builds from index.vite.html / src/main.jsx into dist/,
// without touching the currently-deployed index.html + app.jsx (Babel-in-browser,
// no build step) that GitHub Pages serves today. See docs/ROADMAP.md item 8 -
// cutting the live deploy over to this build is a separate follow-up decision
// (it changes the GitHub Pages deploy pipeline).
export default defineConfig({
  plugins: [react()],
  base: "./",
  publicDir: "public",
  build: {
    outDir: "dist",
    rollupOptions: {
      input: "index.vite.html",
    },
  },
});
