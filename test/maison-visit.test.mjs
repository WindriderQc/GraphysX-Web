import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";
import { applyCommands, validateStoredSceneDefinition } from "../server/scene-commands.mjs";

let temporary, buildMaisonVisit, maisonLookCommands, maisonMaterialCommands, maisonViewCommands, MAISON_STOPS, buildMaisonExplorer;
before(async () => {
  temporary = mkdtempSync(join(tmpdir(), "graphysx-maison-contract-"));
  const root = fileURLToPath(new URL("../", import.meta.url));
  await build({ configFile: false, root, publicDir: false, logLevel: "silent", ssr: { noExternal: true },
    build: { ssr: true, target: "node22", outDir: temporary, emptyOutDir: true,
      rollupOptions: { input: { visit: join(root, "src/maison-visit.ts"), archive: join(root, "src/archive-worlds.ts") },
        output: { format: "es", entryFileNames: "[name].mjs", chunkFileNames: "chunks/[name]-[hash].mjs" } } } });
  ({ buildMaisonVisit, maisonLookCommands, maisonMaterialCommands, maisonViewCommands, MAISON_STOPS } = await import(pathToFileURL(join(temporary, "visit.mjs"))));
  ({ buildMaisonExplorer } = await import(pathToFileURL(join(temporary, "archive.mjs"))));
});
after(() => { if (temporary) rmSync(temporary, { recursive: true, force: true }); });

test("Maison visit retains both complete source model definitions and hidden massing", () => {
  const source = buildMaisonExplorer(), visit = buildMaisonVisit();
  for (const id of ["maison-source-model", "cuisine-model"]) {
    const original = source.entities.find(entity => entity.id === id), actual = visit.entities.find(entity => entity.id === id);
    assert.deepEqual(actual, { ...original, castShadow: true, receiveShadow: false });
  }
  assert.equal(visit.entities.length, source.entities.length + 5);
  assert.equal(visit.entities.find(entity => entity.id === "maison-massing").visible, false);
  assert.equal(visit.entities.find(entity => entity.id === "maison-house").visible, true);
  assert.doesNotThrow(() => validateStoredSceneDefinition(visit));
  const reloaded = JSON.parse(JSON.stringify(buildMaisonVisit("kitchen", "night")));
  assert.doesNotThrow(() => validateStoredSceneDefinition(reloaded));
  assert.equal(buildMaisonVisit("kitchen").entities.find(entity => entity.id === "maison-kitchen").visible, true);
});

test("light and view commands preserve added objects, native model fields and unrelated environment", () => {
  const document = buildMaisonVisit();
  document.entities.push({ id: "my-sculpture", type: "box", label: "My addition", transform: { position: [5, 4, 2] } });
  document.environment.ground.gridColor = "#123456";
  const before = structuredClone(document);
  const commands = [...maisonViewCommands("kitchen"), ...maisonLookCommands(document, "night")];
  const result = applyCommands(document, commands);
  const after = result.definition;
  for (const id of ["my-sculpture", "maison-source-model", "cuisine-model"]) assert.deepEqual(after.entities.find(entity => entity.id === id), before.entities.find(entity => entity.id === id));
  assert.deepEqual(after.environment.ground, before.environment.ground);
  assert.deepEqual(after.environment.physics, before.environment.physics);
  assert.equal(after.entities.find(entity => entity.id === "maison-house").visible, false);
  assert.equal(after.entities.find(entity => entity.id === "maison-kitchen").visible, true);
  assert.equal(after.entities.find(entity => entity.id === "maison-visit-lantern").visible, true);
});

test("compatible emission defaults retain every authored material field and tolerate pending slots", () => {
  const document = buildMaisonVisit(), house = document.entities.find(entity => entity.id === "maison-source-model");
  house.modelMaterialOverrides = { paint: { color: "#ef8833", opacity: .8, emissive: "#123456", emissiveIntensity: .25 }, extra: { color: "#ff0000" } };
  const before = structuredClone(house.modelMaterialOverrides);
  assert.deepEqual(maisonMaterialCommands(document, [{ id: house.id, materialSlots: null }]), []);
  const [command] = maisonMaterialCommands(document, [{ id: house.id, materialSlots: [{ id: "paint" }, { id: "wall" }] }]);
  assert.deepEqual(command.patch.modelMaterialOverrides.paint, before.paint);
  assert.deepEqual(command.patch.modelMaterialOverrides.extra, before.extra);
  assert.deepEqual(command.patch.modelMaterialOverrides.wall, { emissive: "#000000", emissiveIntensity: 0 });
  assert.deepEqual(house.modelMaterialOverrides, before, "Planning a preset must not mutate the source document");
  for (const values of Object.values(command.patch.modelMaterialOverrides)) assert.ok(!("roughness" in values) && !("metalness" in values), "Native Phong material classes are retained");
});

test("all three House stops remain above the native shell and Kitchen stays on its cutaway side", () => {
  assert.equal(MAISON_STOPS.house.length, 3); assert.equal(MAISON_STOPS.kitchen.length, 3);
  for (const point of [...MAISON_STOPS.house, ...MAISON_STOPS.kitchen]) assert.ok([...point.position, ...point.target].every(Number.isFinite));
  for (const point of MAISON_STOPS.house) assert.ok(point.position[1] >= 9);
  for (const point of MAISON_STOPS.kitchen) assert.equal(point.position[0], -3.002289);
});
