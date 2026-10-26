// The vocabulary is what AgentX Core composes proposals against, and Core is forbidden a copy
// of its own. So the file must agree with the runtime's types — the only place a new operation
// or entity type is ever introduced — and every example in it must be a command list the
// product would actually accept. These tests read the TypeScript unions from source rather than
// importing the runtime, which needs a browser; the regexes are narrow and fail loudly if the
// source moves.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { HOST_ONLY_ENTITY_ID_PREFIXES } from "../server/host-entity-id-policy.mjs";
import { SCENE_COMMAND_TABLES, applyCommands } from "../server/scene-commands.mjs";
import { WORLD_SCHEMA } from "../server/scene-document.mjs";
import { EXAMPLES, buildWorldVocabulary, renderWorldVocabulary } from "../server/world-vocabulary.mjs";
import { PROPOSABLE_OPS, PROVIDER_LIMITS, validateProviderCommands } from "../src/coauthor-provider.ts";

const runtimeSource = readFileSync(new URL("../src/agent-world-runtime.ts", import.meta.url), "utf8");
const prefabSource = readFileSync(new URL("../src/agent-world-prefabs.ts", import.meta.url), "utf8");

/** The string literals of one exported union type, e.g. `export type X = | "a" | "b";`. */
function unionLiterals(source, typeName) {
  const match = new RegExp(`export type ${typeName} =([^;]*);`).exec(source);
  assert.ok(match, `${typeName} not found in source`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((hit) => hit[1]);
}

/** The `op: "…"` members of the AgentWorldCommand union. */
function commandOps() {
  // Members are object types with `;` separators, so the union ends at the first blank line.
  const match = /export type AgentWorldCommand =([\s\S]*?)\r?\n\r?\n/.exec(runtimeSource);
  assert.ok(match);
  return [...match[1].matchAll(/op: "([a-z-]+)"/g)].map((hit) => hit[1]);
}

/** Every behavior `type: "…"` literal declared on an `AgentWorld…Behavior` type. */
function behaviorTypes() {
  return [...runtimeSource.matchAll(/export type AgentWorld\w+Behavior = \{[^}]*?type: "([a-z-]+)"/g)].map((hit) => hit[1]);
}
function interactionTypes() {
  return [...runtimeSource.matchAll(/export type AgentWorld\w+Interaction = \{[^}]*?type: "([a-z-]+)"/g)].map((hit) => hit[1]);
}

/** Prefab descriptors as the runtime declares them, read from source. */
function prefabDescriptorsFromSource() {
  const block = /GRAPHYSX_AGENT_WORLD_PREFABS[^=]*=\s*\[([\s\S]*?)\] as const;/.exec(prefabSource);
  assert.ok(block);
  return [...block[1].matchAll(/id: "([^"]+)",\s*label: "([^"]+)",\s*summary: "([^"]+)",\s*entityCount: (\d+)/g)]
    .map((hit) => ({ id: hit[1], label: hit[2], summary: hit[3], entityCount: Number(hit[4]) }));
}

const sorted = (list) => [...list].sort();
const vocabulary = buildWorldVocabulary({ descriptors: { prefabs: prefabDescriptorsFromSource() } });

describe("the published world vocabulary", () => {
  it("names exactly the operations the runtime's command union has, and the provider accepts", () => {
    const ops = Object.keys(vocabulary.operations);
    assert.deepEqual(sorted(ops), sorted(commandOps()));
    assert.deepEqual(sorted(ops), sorted([...PROPOSABLE_OPS]));
    for (const op of ops) {
      assert.equal(vocabulary.operations[op].shape.op, op);
      assert.ok(vocabulary.operations[op].description.length > 20, `${op} needs a description`);
      assert.equal(typeof vocabulary.operations[op].documentSubset, "boolean");
    }
    assert.deepEqual(sorted(ops.filter((op) => vocabulary.operations[op].documentSubset)), sorted(SCENE_COMMAND_TABLES.documentOps));
  });

  it("names exactly the runtime's entity types", () => {
    assert.deepEqual(sorted(Object.keys(vocabulary.entityTypes)), sorted(unionLiterals(runtimeSource, "AgentWorldEntityType")));
    assert.equal(vocabulary.entityTypes.box.primitive, true);
    assert.equal(vocabulary.entityTypes.flock.config, "flock");
    assert.equal(vocabulary.entityTypes.flock.physics, false);
    assert.equal(vocabulary.entityTypes["formula-field"].config, "formula");
    assert.equal(vocabulary.entityTypes["dna-tree"].config, "dna");
    assert.equal(vocabulary.entityTypes["force-field"].config, "forceField");
  });

  it("lists the runtime's behaviors and interactions", () => {
    assert.deepEqual(sorted(Object.keys(vocabulary.behaviors)), sorted(behaviorTypes()));
    assert.deepEqual(sorted(Object.keys(vocabulary.interactions)), sorted(interactionTypes()));
    assert.ok(behaviorTypes().length >= 6);
    assert.ok(interactionTypes().length >= 3);
  });

  it("lists every prefab the runtime declares, with its label and summary", () => {
    const union = unionLiterals(prefabSource, "AgentWorldPrefabId");
    assert.ok(union.length >= 9);
    assert.deepEqual(sorted(vocabulary.prefabs.map((prefab) => prefab.id)), sorted(union));
    for (const prefab of vocabulary.prefabs) {
      assert.ok(prefab.label && prefab.summary && prefab.entityCount > 0, prefab.id);
    }
  });

  it("carries the provider limits and the reserved id namespaces", () => {
    assert.deepEqual(vocabulary.proposalLimits, { ...PROVIDER_LIMITS });
    assert.deepEqual(vocabulary.reservedIdPrefixes, [...HOST_ONLY_ENTITY_ID_PREFIXES]);
    assert.equal(vocabulary.worldSchema, WORLD_SCHEMA);
    assert.equal(vocabulary.schema, "graphysx.world-vocabulary/v1");
  });

  it("publishes the bounds the validator holds a reply to", () => {
    const field = (block, name) => vocabulary.fields[block].find((entry) => entry.name === name);
    assert.deepEqual(field("physics", "mass").range, [0, 100_000]);
    assert.deepEqual(field("dayNight", "cycleSeconds").range, [5, 86_400]);
    assert.deepEqual(field("dayNight", "phaseOffset").range, [0, 1]);
    assert.deepEqual(field("envelope", "fogFar").range, [0, 100_000]);
    assert.deepEqual(field("bloom", "strength").range, [0, 3]);
    assert.deepEqual(field("lighting", "yawDegrees").range, [-180, 180]);
    assert.deepEqual(field("transform", "position").range, [-10_000, 10_000]);
    assert.deepEqual(field("environmentPhysics", "gravity").range, [-1_000, 1_000]);
    assert.deepEqual(field("material", "roughness").range, [0, 1]);
    // Every entity field has a line of explanation: a name alone does not tell a model what to put in it.
    for (const entry of vocabulary.fields.entity) assert.ok(entry.description, `entity.${entry.name} needs a description`);
  });

  it("carries the curated ids the validator accepts", () => {
    assert.deepEqual(vocabulary.enums.skyIds.map((sky) => sky.id), [...SCENE_COMMAND_TABLES.skyIds]);
    assert.deepEqual(vocabulary.enums.flockPresets.map((preset) => preset.id), [...SCENE_COMMAND_TABLES.flockPresets]);
    assert.deepEqual(vocabulary.enums.emitterPresets.map((preset) => preset.id), [...SCENE_COMMAND_TABLES.emitterPresets]);
    assert.deepEqual(vocabulary.enums.textureIds, [...SCENE_COMMAND_TABLES.textureIds]);
    assert.deepEqual(vocabulary.enums.physicsModes, ["static", "dynamic", "kinematic", "trigger"]);
    // Descriptors passed by the build enrich ids; ids the build does not know are kept bare.
    const enriched = buildWorldVocabulary({ descriptors: { skies: [{ id: "clearblue", label: "Clear Blue", description: "Day." }] } });
    assert.deepEqual(enriched.enums.skyIds[0], { id: "clearblue", label: "Clear Blue", description: "Day." });
    assert.deepEqual(enriched.enums.skyIds[1], { id: SCENE_COMMAND_TABLES.skyIds[1] });
  });

  it("gives examples that the provider boundary accepts", () => {
    assert.ok(Object.keys(EXAMPLES).length >= 6);
    for (const [name, commands] of Object.entries(EXAMPLES)) {
      const result = validateProviderCommands(commands);
      assert.equal(result.ok, true, `${name}: ${result.reason}`);
      assert.deepEqual(vocabulary.examples[name], commands);
    }
    // Together they touch the families the brief asks for.
    const flat = Object.values(EXAMPLES).flat();
    const types = new Set(flat.filter((command) => command.op === "spawn").map((command) => command.entity.type));
    for (const type of ["water", "flock", "point-light", "emitter", "dna-tree", "force-field", "box"]) assert.ok(types.has(type), type);
    assert.ok(flat.some((command) => command.op === "set-environment" && command.environment.dayNight));
    assert.ok(flat.some((command) => command.op === "spawn-prefab"));
  });

  it("gives examples the document validator applies in order", () => {
    // The browser runtime accepts every op; the server's document subset is what a stored scene
    // must survive. Applying the subset examples cumulatively proves the ids and references in
    // them are real, not illustrative.
    let world = { schema: WORLD_SCHEMA, id: "vocab", label: "Vocabulary", entities: [] };
    const subset = new Set(SCENE_COMMAND_TABLES.documentOps);
    let applied = 0;
    for (const commands of Object.values(EXAMPLES)) {
      const documentCommands = commands.filter((command) => subset.has(command.op));
      if (documentCommands.length === 0) continue;
      ({ definition: world } = applyCommands(world, documentCommands));
      applied += documentCommands.length;
    }
    assert.ok(applied >= 10);
    assert.ok(world.entities.some((entity) => entity.type === "water"));
    assert.ok(world.environment.dayNight.cycleSeconds === 120);
    // update-and-remove removed the crate and dimmed the lamp.
    assert.equal(world.entities.find((entity) => entity.id === "crate"), undefined);
    assert.equal(world.entities.find((entity) => entity.id === "lamp-light").intensity, 2);
  });

  it("renders as plain JSON of a size a prompt can carry", () => {
    const text = renderWorldVocabulary({ descriptors: { prefabs: prefabDescriptorsFromSource() } });
    const parsed = JSON.parse(text);
    assert.deepEqual(parsed, JSON.parse(JSON.stringify(vocabulary)));
    assert.ok(text.length < 128 * 1024, `vocabulary is ${text.length} bytes`);
    assert.ok(Array.isArray(parsed.rules) && parsed.rules.length >= 6);
  });
});
