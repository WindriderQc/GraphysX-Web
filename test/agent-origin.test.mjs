import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCommands } from "../server/scene-commands.mjs";
import { buildWorldVocabulary } from "../server/world-vocabulary.mjs";

// `agent.origin`: where an agent entity's position sits on its body (feet or centre).
// The drawing itself is checked on the islands (living-island.test.mjs).
const world = () => ({ schema: "graphysx.agent-world/v2", id: "origin-test", label: "Origin test", entities: [] });

test("the stored-scene validator accepts feet and center and refuses anything else", () => {
  for (const origin of ["feet", "center"]) {
    assert.doesNotThrow(() => applyCommands(world(), [{ op: "spawn", entity: { id: "eko", type: "agent", geometry: { height: 5, radius: 1 }, agent: { origin } } }]));
  }
  assert.throws(() => applyCommands(world(), [{ op: "spawn", entity: { id: "eko", type: "agent", agent: { origin: "middle" } } }]), /origin/);
  assert.match(JSON.stringify(buildWorldVocabulary()), /feet \(default\) or center/);
});
