import assert from "node:assert/strict";
import { it } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSceneStore } from "../server/scene-store.mjs";
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
