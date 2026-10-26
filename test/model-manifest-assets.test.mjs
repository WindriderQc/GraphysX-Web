import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { modelManifestAssets, productAssetManifest } from "../scripts/product-assets.mjs";

test("the empty ecosystem model manifest ships in production", async () => {
  const manifest = await productAssetManifest();
  assert.ok(manifest.files.includes("/assets/ecosystem/models.json"));
});

test("a model manifest brings its converted meshes and textures into the release", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "graphysx-model-assets-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "assets/models"), { recursive: true });
  await writeFile(path.join(root, "assets/models.json"), JSON.stringify({ models: { node: { url: "/assets/models/node.json" } } }));
  await writeFile(path.join(root, "assets/models/node.json"), JSON.stringify({ meshes: [
    { materials: [{ textureUrl: "/assets/models/body%20texture.png" }, { textureUrl: null }] },
    { materials: [{ textureUrl: "/assets/models/body%20texture.png" }] },
  ] }));
  assert.deepEqual(await modelManifestAssets(root, "/assets/models.json"), [
    "/assets/models.json", "/assets/models/node.json", "/assets/models/body texture.png",
  ]);
  await rm(path.join(root, "assets/models/node.json"));
  await assert.rejects(modelManifestAssets(root, "/assets/models.json"), /ENOENT/, "a missing custom mesh fails the build");
});
