import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";

// Execute the real release plugin hooks, recording their filesystem/build effects.
// No bundling, renderer, server, or writes to a checkout's existing dist are needed.
function releasePlugins() {
  const effects = { copies: [], directories: [], writes: [], builds: [] };
  const fs = {
    mkdir: async (...args) => { effects.directories.push(args); },
    cp: async (...args) => { effects.copies.push(args); },
    writeFile: async (...args) => { effects.writes.push(args); },
  };
  const assets = ["/assets/hdri/studio-small-08_1k.hdr", "/assets/shelf-thumbnails/cyber-race.webp"];
  const vocabularyJson = '{"schema":"release-output-contract"}';
  const processStub = { cwd: () => path.resolve("unrelated-working-directory"), env: {} };
  let vocabulary;
  const load = file => {
    const { outputText } = transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), {
      compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, esModuleInterop: true },
    });
    const exports = {};
    vm.runInNewContext(outputText, {
      exports, Buffer, process: processStub,
      require(specifier) {
        if (specifier === "node:path") return path;
        if (specifier === "node:fs") return { realpathSync: value => value };
        if (specifier === "node:fs/promises") return fs;
        if (specifier === "vite") return {
          defineConfig: config => config,
          loadEnv: () => ({}),
          build: async config => { effects.builds.push(config); },
        };
        if (specifier === "./scripts/product-assets.mjs") return {
          productAssetManifest: async () => ({ files: assets, bytes: 42 }),
        };
        if (specifier === "./vite.vocabulary") return vocabulary;
        if (specifier === "./server/world-vocabulary.mjs") return { renderWorldVocabulary: () => vocabularyJson };
        if (specifier.startsWith("./scripts/") || specifier.startsWith("./src/")) return {};
        throw new Error(`Unexpected release configuration dependency: ${specifier}`);
      },
    }, { filename: file });
    return exports;
  };
  vocabulary = load("vite.vocabulary.ts");
  const config = load("vite.config.ts").default({ command: "build", mode: "production" });
  return { plugins: config.plugins, effects, assets, vocabularyJson };
}

for (const [label, outDir] of [
  ["default", "dist"],
  ["isolated relative", "output/acceptance/dist"],
  ["isolated absolute", path.resolve("isolated-release-output", "dist")],
]) {
  test(`release assets, embeds and vocabulary share the ${label} output under an explicit root`, async () => {
    const { plugins, effects, assets, vocabularyJson } = releasePlugins();
    const root = path.resolve("explicit-release-root");
    const output = path.resolve(root, outDir);
    assert.deepEqual(Array.from(plugins, plugin => plugin.name), [
      "graphysx-product-assets", "graphysx-llmx-face-embed", "graphysx-world-vocabulary",
    ]);
    for (const plugin of plugins) {
      plugin.configResolved?.({ root, build: { outDir } });
      await plugin.closeBundle.call({ info() {} });
    }
    assert.deepEqual(effects.copies, assets.map(asset => [
      path.join(root, "public", asset.slice(1)), path.join(output, asset.slice(1)),
    ]));
    assert.deepEqual(effects.writes, [[path.join(output, "embed/world-vocabulary.json"), vocabularyJson]]);
    assert.deepEqual(effects.directories.map(([directory]) => directory), [
      path.join(output, "assets/hdri"), path.join(output, "assets/shelf-thumbnails"), path.join(output, "embed"),
    ]);
    assert.deepEqual(effects.builds.map(config => ({
      root: config.root, configFile: config.configFile, outDir: config.build.outDir,
    })), ["vite.face.config.ts", "vite.diskx.config.ts", "vite.llmx.config.ts", "vite.center-host.config.ts"].map(configFile => ({
      root, configFile: path.join(root, configFile), outDir: path.join(output, "embed"),
    })));
  });
}
