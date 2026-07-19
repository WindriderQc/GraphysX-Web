import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
// @ts-expect-error -- plain .mjs build script, no type declarations
import { productAssetManifest } from "./scripts/product-assets.mjs";

/**
 * Copy only the product's assets into a release build.
 *
 * Vite's `publicDir` handling is verbatim: it would copy all ~120 MB of public/ into dist/,
 * and .github/workflows/deploy.yml tars and scp's that to production on every push. Measured
 * against a real browser, the product routes request ~44 MB of it; the remaining ~76 MB is
 * reachable only through the legacy archive player at `?host=legacy`.
 *
 * So public/ is disabled for builds and this plugin copies the manifest instead. Dev is
 * untouched (see `publicDir` below) — `?host=legacy` still has the whole archive locally.
 */
function productAssets(): Plugin {
  return {
    name: "graphysx-product-assets",
    apply: "build",
    async closeBundle() {
      const outDir = path.resolve("dist");
      const publicDir = path.resolve("public");
      const { files, bytes } = await productAssetManifest();
      for (const file of files) {
        const rel = file.replace(/^\//, "");
        const dest = path.join(outDir, rel);
        await mkdir(path.dirname(dest), { recursive: true });
        await cp(path.join(publicDir, rel), dest);
      }
      this.info(`product assets: ${files.length} files, ${(bytes / 1048576).toFixed(1)} MB (public/ is ~120 MB)`);
    },
  };
}

export default defineConfig(({ command }) => {
  // GRAPHYSX_FULL_ASSETS=1 builds the unpruned dist — for driving an archive world in the
  // legacy player against a real build, which the pruned release cannot serve.
  const fullAssets = process.env.GRAPHYSX_FULL_ASSETS === "1";
  const prune = command === "build" && !fullAssets;
  return {
    // Dev always serves all of public/, so the legacy route keeps its archive locally.
    publicDir: prune ? false : "public",
    plugins: prune ? [productAssets()] : [],
    server: {
      port: 4173
    }
  };
});
