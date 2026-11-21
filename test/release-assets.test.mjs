import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { prepareReleaseAssets } from "../scripts/prepare-release-assets.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "graphysx-release-assets-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return async (name, files) => {
    const release = path.join(root, name);
    for (const [pathname, bytes] of Object.entries(files)) {
      const file = path.join(release, "assets", pathname);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, bytes);
    }
    return release;
  };
}

test("lists every changed immutable URL, including equal-length replacements, before linking anything", async t => {
  const build = await fixture(t);
  const a = await build("a", { "planet model.glb": "old", "config/settings.json": "{}", "route-old.js": "module A" });
  const b = await build("b", { "planet model.glb": "new", "config/settings.json": '{"new":true}', "route-new.js": "module B" });
  await assert.rejects(prepareReleaseAssets(b, a), error => {
    assert.match(error.message, /\/assets\/planet%20model\.glb/);
    assert.match(error.message, /\/assets\/config\/settings\.json/);
    assert.match(error.message, /[a-f\d]{64} → [a-f\d]{64}/);
    return true;
  });
  await assert.rejects(stat(path.join(b, "assets/route-old.js")), { code: "ENOENT" });
});

test("keeps old modules and nested assets for one release, including when a retained SHA is reused", async t => {
  const build = await fixture(t);
  const a = await build("a", { "route-a.js": "module A", "scene/old-texture.ktx2": "old texture" });
  const b = await build("b", { "route-b.js": "module B" });
  const c = await build("c", { "route-c.js": "module C" });
  const targets = ["/assets/route-a.js", "/assets/scene/old-texture.ktx2"];
  assert.deepEqual(await prepareReleaseAssets(b, a), { compared: 0, retained: targets });
  assert.equal(await readFile(path.join(b, "assets/route-a.js"), "utf8"), "module A");
  assert.equal((await stat(path.join(a, "assets/route-a.js"))).nlink, 2);
  assert.deepEqual(await prepareReleaseAssets(c, b), { compared: 0, retained: ["/assets/route-b.js"] });
  await assert.rejects(stat(path.join(c, "assets/route-a.js")), { code: "ENOENT" });
  await prepareReleaseAssets(b, c);
  await assert.rejects(stat(path.join(b, "assets/route-a.js")), { code: "ENOENT" });
  assert.equal(await readFile(path.join(b, "assets/route-c.js"), "utf8"), "module C");
});

test("checks a reintroduced URL against the bytes still served through a retained hardlink", async t => {
  const build = await fixture(t);
  const a = await build("a", { "scene/earth.glb": "first earth" });
  const b = await build("b", { "route-b.js": "module B" });
  const c = await build("c", { "scene/earth.glb": "second earth" });
  await prepareReleaseAssets(b, a);
  await assert.rejects(prepareReleaseAssets(c, b), /\/assets\/scene\/earth\.glb/);
});
