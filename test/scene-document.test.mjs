import assert from "node:assert/strict";
import { it } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSceneStore, SCENE_STORE_SCHEMA } from "../server/scene-store.mjs";
import { encodeStoreName } from "../server/store-paths.mjs";
import { applyCommands, validateStoredSceneDefinition } from "../server/scene-commands.mjs";
import { assertWorldDefinition } from "../server/scene-document.mjs";

const scene = () => ({
  schema: "graphysx.agent-world/v2", id: "document-test", label: "Document test",
  entities: [{ id: "box", type: "box" }, { id: "gate", type: "box", physics: { mode: "trigger" } }],
});

it("rejects invalid whole writes without replacing an accepted revision", async () => {
  const dir = await mkdtemp(join(tmpdir(), "graphysx-document-"));
  try {
    const store = createSceneStore({ dir });
    await store.put("document", scene(), 0);
    for (const mutate of [
      (doc) => { doc.entities[0].type = "not-a-real-entity"; },
      (doc) => { doc.entities.push({ id: "box", type: "sphere" }); },
      (doc) => { doc.entities[0].parentId = "missing"; },
      (doc) => { doc.entities[0].parentId = "gate"; doc.entities[1].parentId = "box"; },
      (doc) => { doc.entities[0].transform = { position: [0, "bad", 0] }; },
      (doc) => { doc.entities[0].physics = { mode: "imaginary" }; },
      (doc) => { doc.rules = { schema: "invalid", finish: { triggerId: "gate" } }; },
      (doc) => { doc.rules = { schema: "graphysx.agent-rules/v1", checkpoints: [{ triggerId: "gate" }, { triggerId: "gate" }] }; },
    ]) {
      const invalid = scene();
      mutate(invalid);
      await assert.rejects(store.put("document", invalid, 1));
      const retained = await store.get("document");
      assert.equal(retained.revision, 1);
      assert.deepEqual(retained.definition, scene());
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it("allows old inert modulation to be retained or removed but refuses new writes of it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "graphysx-document-"));
  try {
    const store = createSceneStore({ dir });
    const name = "legacy";
    const definition = scene();
    definition.entities[0].behaviors = [{ id: "fade", type: "modulate", property: "intensity" }];
    const mismatch = /modulate.*intensity.*light entity.*box/;
    await assert.rejects(store.put(name, definition, 0), mismatch);
    await writeFile(join(dir, `${encodeStoreName(name)}.json`), JSON.stringify({ schema: SCENE_STORE_SCHEMA, name, revision: 1, definition }));
    const { definition: stored } = await store.get(name);
    assert.deepEqual(stored, definition);

    const updated = applyCommands(stored, [{ op: "update", id: "gate", patch: { label: "Unrelated edit" } }]).definition;
    assert.equal((await store.put(name, updated, 1)).revision, 2);
    const invalid = structuredClone(updated);
    invalid.entities[0].behaviors[0].frequencyHz = 2;
    await assert.rejects(store.put(name, invalid, 2), mismatch);
    assert.equal((await store.get(name)).revision, 2);

    const repaired = applyCommands(updated, [{ op: "detach-behavior", id: "box", behaviorId: "fade" }]).definition;
    assert.equal((await store.put(name, repaired, 2)).revision, 3);
    await assert.rejects(store.put(name, updated, 3), mismatch);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it("shares entity vocabulary and validates forward references without reordering documents", () => {
  const doc = scene();
  doc.entities[0].parentId = "parent";
  doc.entities.push({ id: "parent", type: "group" });
  doc.rules = { schema: "graphysx.agent-rules/v1", subjectId: "box", finish: { triggerId: "gate" } };
  const before = JSON.stringify(doc);
  assertWorldDefinition(doc);
  validateStoredSceneDefinition(doc);
  assert.equal(JSON.stringify(doc), before);
  doc.entities[0].type = "unknown";
  assert.throws(() => assertWorldDefinition(doc), /Unsupported entity type/);
  assert.throws(() => validateStoredSceneDefinition(doc), /Unsupported entity type/);
});

it("preserves imported media in full documents without broadening live commands", () => {
  const doc = scene();
  doc.environment = { sky: "imported-sky" };
  doc.entities[0].material = { texture: { id: "imported-texture" } };
  doc.entities.push({ id: "model", type: "model", asset: { id: "imported-model", url: "http://127.0.0.1:4199/assets/files/model/mesh.json", format: "graphysx-mesh-json" } });
  validateStoredSceneDefinition(doc);
  assert.throws(() => applyCommands(scene(), [{ op: "set-environment", environment: doc.environment }]), /Unknown/);
  assert.throws(() => applyCommands(scene(), [{ op: "spawn", entity: doc.entities[2] }]), /HTTPS/);
  assert.throws(() => applyCommands(scene(), [{ op: "update", id: "box", patch: { material: doc.entities[0].material } }]), /curated/);
});
