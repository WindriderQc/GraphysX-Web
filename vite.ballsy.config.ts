import path from "node:path";
import { readFile } from "node:fs/promises";
import { defineConfig, type Plugin } from "vite";
// @ts-expect-error -- shared Node manifest, not browser code
import { xrAssetManifest } from "./scripts/product-assets.mjs";

function xrInputAssets(): Plugin {
  return {
    name: "ballsy-local-xr-input-assets",
    apply: "build",
    async buildStart() {
      for (const url of await xrAssetManifest()) {
        const fileName = url.replace(/^\//, "");
        this.emitFile({ type: "asset", fileName, source: await readFile(path.resolve("public", fileName)) });
      }
    },
  };
}

// Isolated Quest staging: no release embeds or product-asset plugin writing to dist/.
// Copy only the three same-origin XR input assets, never the full product's public/ tree.
export default defineConfig({
  publicDir: false,
  plugins: [xrInputAssets()],
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
