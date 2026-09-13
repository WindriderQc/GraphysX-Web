import assert from "node:assert/strict";
import { test } from "node:test";
import { importBrowserModule } from "./support/import-browser-module.mjs";
import { resolveAgentAppearance } from "../server/agent-appearance.mjs";
import { applyCommands, validateStoredSceneDefinition } from "../server/scene-commands.mjs";

const { createLlmXForge, readLlmXEnvironment, saveLlmXEnvironment, LLMX_SAVE_KEY } =
  await importBrowserModule(new URL("../src/llmx-environment.ts", import.meta.url));
const appearance = { kind: "voxel-face", asset: "forge-mask", palette: "forge", seed: 12 };

test("appearance validation rejects live state, unknown assets and invalid seeds on every write path", () => {
  const doc = { schema: "graphysx.agent-world/v2", id: "face-test", label: "Face test", entities: [{ id: "face", type: "agent", appearance }] };
  assert.doesNotThrow(() => validateStoredSceneDefinition(doc));
  for (const invalid of [
    { ...appearance, asset: "missing" }, { ...appearance, palette: "missing" },
    { ...appearance, seed: Infinity }, { ...appearance, seed: -1 }, { ...appearance, seed: 1.4 },
    { ...appearance, speak: 0.5 }, { ...appearance, conversationId: "private" },
  ]) {
    assert.throws(() => resolveAgentAppearance(invalid));
    assert.throws(() => validateStoredSceneDefinition({ ...doc, entities: [{ ...doc.entities[0], appearance: invalid }] }));
    assert.throws(() => applyCommands(doc, [{ op: "update", id: "face", patch: { appearance: invalid } }]));
  }
  assert.throws(() => resolveAgentAppearance(appearance, "box"));
  assert.equal(resolveAgentAppearance(null), null);
  assert.deepEqual(resolveAgentAppearance({ ...appearance, seed: undefined }), { ...appearance, seed: 1 });
});

test("Forge persists an ordinary agent appearance and restores scene edits", () => {
  const { document } = createLlmXForge();
  assert.doesNotThrow(() => validateStoredSceneDefinition(document));
  const memory = new Map();
  const storage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  assert.equal(readLlmXEnvironment(storage), null);
  document.entities.find(entity => entity.id === "llmx-face").appearance.seed = 25;
  saveLlmXEnvironment(storage, document);
  assert.deepEqual(readLlmXEnvironment(storage), document);
  const original = memory.get(LLMX_SAVE_KEY);
  memory.set(LLMX_SAVE_KEY, original.replace('"version":1', '"version":99'));
  const corrupt = memory.get(LLMX_SAVE_KEY);
  assert.throws(() => readLlmXEnvironment(storage));
  assert.equal(memory.get(LLMX_SAVE_KEY), corrupt, "a failed load must preserve the original save");
  assert.throws(() => saveLlmXEnvironment({ ...storage, setItem() { throw new Error("quota"); } }, document), /quota/);
});
