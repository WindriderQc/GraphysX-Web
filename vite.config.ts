import { realpathSync } from "node:fs";
import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { build, defineConfig, loadEnv, type Plugin } from "vite";
// @ts-expect-error -- plain .mjs build script, no type declarations
import { productAssetManifest } from "./scripts/product-assets.mjs";
// @ts-expect-error -- local development middleware, not browser code
import { createKidxDocumentRoute } from "./scripts/kidx-document-server.mjs";
// @ts-expect-error -- local development middleware, not browser code
import { createKidxTeamRoute } from "./scripts/kidx-team-server.mjs";
// @ts-expect-error -- local server composition, never part of the browser bundle
import { createLlmXRoute } from "./scripts/llmx-server.mjs";
// @ts-expect-error -- local agent relay (Codex / Claude Code MCP), never part of the browser bundle
import { createGraphysXAgentRoute } from "./scripts/graphysx-agent-relay.mjs";
// @ts-expect-error -- local read-only bridge to AgentX Data for DiskX, never part of the browser bundle
import { createDiskxRoute } from "./scripts/diskx-server.mjs";

function kidxDocuments(diskx?: { dataUrl?: string; volumesSpec?: string }): Plugin {
  return { name: "kidx-local-instructions", apply: "serve", async configureServer(server) {
    const route = await createKidxDocumentRoute();
    const teams = createKidxTeamRoute();
    const llmx = createLlmXRoute();
    // The same relay the built preview mounts (scripts/serve-llmx.mjs), so a `?agentBridge=1` tab on the
    // dev server is reachable by the graphysx MCP too (GRAPHYSX_URL=http://127.0.0.1:<dev port>/).
    // The relay itself refuses anything but loopback, same-origin requests.
    const agents = createGraphysXAgentRoute();
    // DiskX reads AgentX Data through the page's own origin; `DISKX_DATA_URL` unset means fixture.
    const diskxRoute = createDiskxRoute({ dataUrl: diskx?.dataUrl, volumesSpec: diskx?.volumesSpec });
    server.httpServer?.once("close", () => agents.dispose());
    server.middlewares.use((req, res, next) => { if (!agents(req, res) && !llmx(req, res) && !diskxRoute(req, res) && !teams(req, res) && !route(req, res)) next(); });
  } };
}

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

/**
 * Build the `<llmx-face>` and `<diskx-city>` embeds (vite.face.config.ts, vite.diskx.config.ts) with
 * every release build, so the gate, CI and deploy all ship `dist/embed/llmx-face.js` and `diskx.js` — they run `vite build`, not the npm script.
 */
function faceEmbed(): Plugin {
  return {
    name: "graphysx-llmx-face-embed",
    apply: "build",
    async closeBundle() {
      await build({ configFile: path.resolve("vite.face.config.ts"), logLevel: "warn" });
      // `<diskx-city>` for an AgentX Core page (vite.diskx.config.ts), shipped the same way.
      await build({ configFile: path.resolve("vite.diskx.config.ts"), logLevel: "warn" });
      await build({ configFile: path.resolve("vite.llmx.config.ts"), logLevel: "warn" });
    },
  };
}

export default defineConfig(({ command, mode }) => {
  // `DISKX_DATA_URL` / `DISKX_VOLUMES` may come from the shell or from an ignored `.env.local`,
  // so a developer on the home LAN can point DiskX at AgentX Data (and declare or measure the
  // volumes' capacity, which AgentX Data lacks) without exporting anything per terminal.
  const diskxEnv = loadEnv(mode, process.cwd(), "DISKX_");
  const diskx = {
    dataUrl: process.env.DISKX_DATA_URL || diskxEnv.DISKX_DATA_URL || undefined,
    volumesSpec: process.env.DISKX_VOLUMES || diskxEnv.DISKX_VOLUMES || undefined,
  };
  // GRAPHYSX_FULL_ASSETS=1 builds the unpruned dist — for driving an archive world in the
  // legacy player against a real build, which the pruned release cannot serve.
  const fullAssets = process.env.GRAPHYSX_FULL_ASSETS === "1";
  const prune = command === "build" && !fullAssets;
  return {
    // Dev always serves all of public/, so the legacy route keeps its archive locally.
    publicDir: prune ? false : "public",
    plugins: prune ? [productAssets(), faceEmbed()] : command === "build" ? [faceEmbed()] : [kidxDocuments(diskx)],
    optimizeDeps: { entries: ["index.html"] },
    // Cyber Race 1992 is a standalone page (its own renderer and loop) published beside the
    // product at /cyber-race.html; the Games shelf links to it. See docs/CYBER_RACE.md.
    build: {
      rollupOptions: {
        input: {
          main: path.resolve("index.html"),
          "cyber-race": path.resolve("cyber-race.html"),
        },
      },
    },
    server: {
      // PORT lets a second checkout/session run its own dev server beside the default one.
      port: Number(process.env.PORT ?? 4173),
      watch: { ignored: ["**/output/**", "**/docs/Lego/**"] },
      // A worktree links node_modules to the main checkout; Vite resolves the junction and
      // would refuse the fonts behind it as outside the root, so allow the real path too.
      fs: { allow: [process.cwd(), realpathSync("node_modules")] },
    }
  };
});
