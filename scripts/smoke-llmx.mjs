import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { applySmokeTimeout, launchSmokeBrowser } from "./smoke-harness.mjs";
import { startStaticServer } from "./static-server.mjs";

const artifacts = process.env.SMOKE_ARTIFACTS || "output/verify";
mkdirSync(artifacts, { recursive: true });
const server = process.env.SMOKE_BASE ? null : await startStaticServer({ root: path.resolve("dist"), port: 0 });
const base = process.env.SMOKE_BASE || server.url;
const browser = await launchSmokeBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  applySmokeTimeout(page);
  // This journey qualifies the visual room offline; conversation has its own transport smoke.
  await page.route('**/llmx-api/config', route => route.fulfill({ json: { enabled: false } }));
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`${base}?app=llmx`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Forge nocturne", exact: true }).waitFor();
  const initial = await page.evaluate(() => JSON.parse(window.render_game_to_text()).application);
  assert.equal(initial.application, "llmx");
  assert.equal(initial.entrance.phase, "ready");
  assert.equal(initial.face.build, 1);
  assert.equal(initial.conversation.available, false, "visual readiness must not claim AgentX connection");
  await page.screenshot({ path: path.join(artifacts, "llmx-forge-desktop.png") });

  const lifecycle = await page.evaluate(() => {
    const api = window.__GRAPHYSX__;
    const host = window.__GRAPHYSX_HOST__;
    const must = result => { if (!result.ok) throw new Error(result.error); return result; };
    const original = api.exportDocument();
    const appearance = original.entities.find(entity => entity.id === "llmx-face").appearance;
    must(api.spawn({ id: "face-child-test", type: "box", parentId: "llmx-face", material: { color: "#ff0000" } }));
    must(api.update("llmx-face", { appearance: { ...appearance, seed: 29 } }));
    const childKept = host.world.getEntityObject("face-child-test").parent === host.world.getEntityObject("llmx-face");
    const changed = api.exportDocument();
    const invalid = api.update("llmx-face", { appearance: { ...appearance, seed: -1 } });
    const afterInvalid = api.exportDocument();
    const unchanged = JSON.stringify(afterInvalid) === JSON.stringify(changed);
    const changedEntities = changed.entities.filter((entity, index) => JSON.stringify(entity) !== JSON.stringify(afterInvalid.entities[index])).map(entity => entity.id);
    must(api.load(changed));
    const reloaded = api.state().entities.find(entity => entity.id === "llmx-face").appearance;
    must(api.update("llmx-face", { appearance: null }));
    const restoredDefault = api.state().entities.find(entity => entity.id === "llmx-face").appearance === null;
    must(api.update("llmx-face", { appearance }));
    const object = host.world.getEntityObject("llmx-face");
    const visual = object.userData.graphysxAgentVisual;
    const meshes = visual.children.filter(child => child.isInstancedMesh);
    const materialsOwned = meshes.every(mesh => mesh.receiveShadow === false && mesh.material.metalness <= 0.5);
    must(api.load(original));
    host.frameView([1, 2, 9], [0, 2, 0], 0);
    const immediateCamera = host.camera.position.toArray();
    return { appearance, childKept, rejected: !invalid.ok, unchanged, changedEntities, reloaded, restoredDefault, materialsOwned, meshCount: meshes.length, immediateCamera };
  });
  assert.equal(lifecycle.childKept, true);
  assert.equal(lifecycle.rejected, true);
  assert.equal(lifecycle.unchanged, true, JSON.stringify(lifecycle.changedEntities));
  assert.equal(lifecycle.reloaded.seed, 29);
  assert.equal(lifecycle.restoredDefault, true);
  assert.equal(lifecycle.materialsOwned, true);
  assert.equal(lifecycle.meshCount, 5);
  assert.deepEqual(lifecycle.immediateCamera, [1, 2, 9]);
  console.log("ok: persisted appearance, rejected patch atomicity, avatar replacement, child ownership, materials and immediate camera");

  await page.getByRole("button", { name: "Sauvegarder", exact: true }).click();
  await page.getByText("Votre Forge est sauvegardée dans ce navigateur.", { exact: true }).waitFor();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Forge nocturne", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => JSON.parse(window.render_game_to_text()).application.saved), true);
  await page.getByRole("button", { name: "Environnements", exact: true }).click();
  await page.getByRole("dialog", { name: "Vos environnements" }).waitFor();
  await page.getByRole("button", { name: "Forge nocturne Reprendre votre sauvegarde" }).click();
  await page.getByRole("button", { name: "Rejouer l’entrée", exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(artifacts, "llmx-forge-mobile.png") });
  await page.getByRole("button", { name: "Quitter LLMx", exact: true }).click();
  await page.getByRole("button", { name: "LLMx · Forge nocturne", exact: true }).waitFor();
  await page.getByRole("button", { name: "LLMx · Forge nocturne", exact: true }).click();
  await page.getByRole("heading", { name: "Forge nocturne", exact: true }).waitFor();
  assert.deepEqual(errors, []);
  await page.close();
  console.log("ok: LLMx save/reload, environment selection, mobile layout and Center round trip");
} finally {
  await browser.close();
  if (server) await server.close();
}
