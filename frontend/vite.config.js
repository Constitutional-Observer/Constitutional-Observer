import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  build: {
    cssMinify: 'esbuild',
  },
  esbuild: {
  },
  optimizeDeps: {
  },
   css: {
    transformer: 'postcss' // fallback from lightningcss
  }
});
