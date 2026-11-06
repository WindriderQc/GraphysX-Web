import path from "node:path";
import { defineConfig } from "vite";

// Isolated Quest staging: no release embeds or product-asset plugin writing to dist/.
// Ballsy uses procedural geometry and bundled fonts; it needs no public/ assets.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: "output/quest-shovel/dist",
    rollupOptions: {
      input: {
        ballsy: path.resolve("ballsy.html"),
        "ballsy-giant": path.resolve("ballsy-giant.html"),
      },
    },
  },
});
