import assert from "node:assert/strict";
import { applyCommands, SceneCommandError } from "../server/scene-commands.mjs";
import {
  HOST_ONLY_ENTITY_ID_PREFIXES,
  assertAuthoredSceneCommandNamespaces,
  assertAuthoredWorldEntityNamespaces,
} from "../server/host-entity-id-policy.mjs";

const results = [];

function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : ` — ${detail}`}`);
}

const base = {
  schema: "graphysx.agent-world/v2",
  id: "scene-command-validation",
  label: "Scene command validation",
  environment: {
    background: "#081018",
    sky: null,
    ground: { visible: true, size: 40, color: "#16202a", grid: true, gridColor: "#4aa998" },
    physics: { gravity: [0, -9.81, 0] },
  },
  entities: [
    { id: "root", type: "group", label: "Root" },
    { id: "anchor", type: "box", parentId: "root", transform: { position: [0, 0.5, 0] } },
    { id: "dynamic-ball", type: "sphere", physics: { mode: "dynamic", mass: 1 } },
    { id: "route", type: "spline", path: { points: [[0, 0, 0], [2, 0, 2]] } },
    { id: "arrow", type: "cone" },
    {
      id: "driver",
      type: "sphere",
      physics: { mode: "dynamic", mass: 1 },
      steering: { headingDegrees: 0, force: 30, arrowId: "arrow" },
    },
    {
      id: "speaker",
      type: "sound",
      sound: { source: "/assets/audio/chime.ogg", volume: 0.8, loop: true, autoplay: false, positional: true, refDistance: 8 },
    },
    { id: "embers", type: "emitter", emitter: { preset: "campfire", rate: 3, speed: 2 } },
    {
      id: "grove",
      type: "dna-tree",
      dna: { preset: null, generation: 2, genome: { trunkLength: 0.78, lengthRatio: 0.69 } },
    },
  ],
};

const baseBytes = JSON.stringify(base);
const valid = applyCommands(base, [
  {
    op: "spawn",
    entity: {
      id: "valid-box",
      type: "box",
      parentId: "root",
      label: "Valid box",
      transform: { position: [1, 1, 0], rotationDegrees: [0, 30, 0], scale: [1, 1, 1] },
      behaviors: [{ id: "valid-spin", type: "spin", axis: "y", speedDegrees: 12 }],
      interactions: [{ id: "toggle-anchor", type: "toggle-visibility", targetIds: ["anchor"] }],
    },
  },
  { op: "update", id: "speaker", patch: { sound: { volume: 0.25 } } },
  { op: "update", id: "driver", patch: { steering: { headingDegrees: 90 } } },
  { op: "update", id: "embers", patch: { emitter: { preset: "fireball", rate: 9 } } },
  { op: "update", id: "grove", patch: { dna: { generation: 3, genome: { depth: 5 } } } },
  { op: "set-environment", environment: { ground: { size: 72 } } },
]);

const byId = new Map(valid.definition.entities.map((entity) => [entity.id, entity]));
check("valid basic spawn keeps its stable behavior and interaction ids",
  byId.get("valid-box")?.behaviors?.[0]?.id === "valid-spin"
    && byId.get("valid-box")?.interactions?.[0]?.id === "toggle-anchor");
check("partial sound update retains the source and sibling configuration",
  byId.get("speaker")?.sound?.source === "/assets/audio/chime.ogg"
    && byId.get("speaker")?.sound?.volume === 0.25
    && byId.get("speaker")?.sound?.loop === true);
check("partial steering update merges over the authored tuning",
  byId.get("driver")?.steering?.headingDegrees === 90
    && byId.get("driver")?.steering?.force === 30
    && byId.get("driver")?.steering?.arrowId === "arrow");
check("a non-null preset switch resets stale emitter overrides",
  JSON.stringify(byId.get("embers")?.emitter) === JSON.stringify({ preset: "fireball", rate: 9 }),
  JSON.stringify(byId.get("embers")?.emitter));
check("dna patches merge the nested genome as well as the outer config",
  byId.get("grove")?.dna?.generation === 3
    && byId.get("grove")?.dna?.genome?.trunkLength === 0.78
    && byId.get("grove")?.dna?.genome?.lengthRatio === 0.69
    && byId.get("grove")?.dna?.genome?.depth === 5);
check("partial environment command retains untouched top-level fields and replaces the supplied block",
  valid.definition.environment.background === "#081018"
    && valid.definition.environment.sky === null
    && JSON.stringify(valid.definition.environment.ground) === JSON.stringify({ size: 72 }));
check("successful application leaves the caller's definition byte-identical", JSON.stringify(base) === baseBytes);

function rejectDefinitionWithoutMutation(name, definition, commands) {
  const before = JSON.stringify(definition);
  let error = null;
  try {
    applyCommands(definition, commands);
  } catch (caught) {
    error = caught;
  }
  check(`${name} is rejected`, error instanceof SceneCommandError, String(error));
  check(`${name} leaves the original definition byte-identical`, JSON.stringify(definition) === before);
}

function rejectWithoutMutation(name, commands) {
  rejectDefinitionWithoutMutation(name, base, commands);
}

const acceptedStringArrayBoundary = { revision: 17, document: structuredClone(base) };
const acceptedStringArrayBoundaryBefore = JSON.stringify(acceptedStringArrayBoundary);
const acceptedStringArrayResult = applyCommands(acceptedStringArrayBoundary.document, [
  { op: "update", id: "anchor", patch: { tags: ["x".repeat(128)] } },
]);
check("128-character string-array entry is accepted without caller document or revision mutation",
  acceptedStringArrayResult.definition.entities.find((entity) => entity.id === "anchor")?.tags?.[0]?.length === 128
    && JSON.stringify(acceptedStringArrayBoundary) === acceptedStringArrayBoundaryBefore);

const rejectedStringArrayBoundary = { revision: 17, document: structuredClone(base) };
const rejectedStringArrayBoundaryBefore = JSON.stringify(rejectedStringArrayBoundary);
let rejectedStringArrayBoundaryError = null;
try {
  applyCommands(rejectedStringArrayBoundary.document, [
    { op: "update", id: "anchor", patch: { tags: ["x".repeat(129)] } },
  ]);
} catch (caught) {
  rejectedStringArrayBoundaryError = caught;
}
check("129-character string-array entry is rejected without caller document or revision mutation",
  rejectedStringArrayBoundaryError instanceof SceneCommandError
    && rejectedStringArrayBoundaryError.message.includes("128 characters or fewer")
    && JSON.stringify(rejectedStringArrayBoundary) === rejectedStringArrayBoundaryBefore,
  String(rejectedStringArrayBoundaryError));

function rejectSharedValueWithoutMutation(name, value, assertion) {
  const before = JSON.stringify(value);
  let error = null;
  try {
    assertion(value);
  } catch (caught) {
    error = caught;
  }
  check(`${name} is rejected by the shared authored namespace policy`,
    error instanceof Error && error.message.includes("host-only entity namespace"), String(error));
  check(`${name} leaves its input byte-identical`, JSON.stringify(value) === before);
}

function rejectHostNamespaceDefinitionWithoutMutation(name, definition, commands) {
  const before = JSON.stringify(definition);
  let error = null;
  try {
    applyCommands(definition, commands);
  } catch (caught) {
    error = caught;
  }
  check(`${name} is rejected`,
    error instanceof SceneCommandError && error.message.includes("host-only entity namespace"), String(error));
  check(`${name} leaves the original definition byte-identical`, JSON.stringify(definition) === before);
}

function rejectHostNamespaceWithoutMutation(name, commands) {
  rejectHostNamespaceDefinitionWithoutMutation(name, base, commands);
}

rejectWithoutMutation("unsupported entity type", [
  { op: "spawn", entity: { id: "hostile-type", type: "totally-not-an-entity" } },
]);
rejectWithoutMutation("missing stable entity id", [
  { op: "spawn", entity: { type: "box" } },
]);
rejectWithoutMutation("missing stable behavior id", [
  { op: "spawn", entity: { id: "bad-behavior", type: "box", behaviors: [{ type: "spin" }] } },
]);
rejectWithoutMutation("missing stable interaction id", [
  { op: "update", id: "anchor", patch: { interactions: [{ type: "toggle-visibility", targetIds: ["root"] }] } },
]);

for (const prefix of HOST_ONLY_ENTITY_ID_PREFIXES) {
  rejectHostNamespaceWithoutMutation(`host-only entity prefix ${prefix}`, [
    { op: "spawn", entity: { id: `${prefix}authored-collision`, type: "box" } },
  ]);
}
rejectHostNamespaceWithoutMutation("whitespace-normalized host-only entity prefix", [
  { op: "spawn", entity: { id: "  live-agent:trimmed-collision  ", type: "box" } },
]);
rejectHostNamespaceWithoutMutation("host-only update target", [
  { op: "update", id: "live-mission:board", patch: { visible: false } },
]);
rejectHostNamespaceWithoutMutation("host-only parent reference", [
  { op: "spawn", entity: { id: "reserved-parent-child", type: "box", parentId: "live-agent:remote" } },
]);
rejectHostNamespaceWithoutMutation("host-only steering reference", [
  { op: "update", id: "driver", patch: { steering: { arrowId: "live-nestor:signal-ring" } } },
]);
rejectHostNamespaceWithoutMutation("host-only look-at reference", [
  {
    op: "spawn",
    entity: {
      id: "reserved-look-at",
      type: "box",
      behaviors: [{ id: "reserved-look", type: "look-at", targetId: "live-agent:remote" }],
    },
  },
]);
rejectHostNamespaceWithoutMutation("host-only spline reference", [
  {
    op: "spawn",
    entity: {
      id: "reserved-spline-follower",
      type: "box",
      behaviors: [{ id: "reserved-follow", type: "follow-spline", splineId: "live-mission:path" }],
    },
  },
]);
rejectHostNamespaceWithoutMutation("host-only interaction reference", [
  {
    op: "update",
    id: "anchor",
    patch: { interactions: [{ id: "reserved-target", type: "toggle-visibility", targetIds: ["live-nestor:signal-aura"] }] },
  },
]);
rejectHostNamespaceDefinitionWithoutMutation("host-only entity id in an incoming document", {
  ...base,
  entities: [...base.entities, { id: "live-mission:loaded-board", type: "group" }],
}, [{ op: "set-environment", environment: { background: "#101820" } }]);
rejectHostNamespaceDefinitionWithoutMutation("whitespace-normalized host-only id in an incoming document", {
  ...base,
  entities: [...base.entities, { id: "  live-nestor:loaded-effect  ", type: "torus" }],
}, [{ op: "set-environment", environment: { background: "#101820" } }]);
rejectHostNamespaceDefinitionWithoutMutation("host-only joint body reference", {
  ...base,
  joints: [{ id: "reserved-joint", type: "fixed", bodyA: "dynamic-ball", bodyB: "live-agent:remote" }],
}, [{ op: "set-environment", environment: { background: "#101820" } }]);
rejectHostNamespaceDefinitionWithoutMutation("host-only rules subject reference", {
  ...base,
  rules: {
    schema: "graphysx.agent-rules/v1",
    subjectId: "live-agent:remote",
    finish: { triggerId: "anchor" },
  },
}, [{ op: "set-environment", environment: { background: "#101820" } }]);

rejectSharedValueWithoutMutation("local prefab host-only id prefix", {
  op: "spawn-prefab",
  prefabId: "signal-beacon",
  options: { idPrefix: "live-agent:prefab" },
}, assertAuthoredSceneCommandNamespaces);
for (const prefix of HOST_ONLY_ENTITY_ID_PREFIXES) {
  const generatedPrefix = prefix.slice(0, -1);
  rejectSharedValueWithoutMutation(`local prefab-generated host-only id prefix ${generatedPrefix}`, {
    op: "spawn-prefab",
    prefabId: "signal-beacon",
    options: { idPrefix: generatedPrefix },
  }, assertAuthoredSceneCommandNamespaces);
}
rejectSharedValueWithoutMutation("local whole-document host-only id", {
  ...base,
  entities: [...base.entities, { id: "live-nestor:loaded-effect", type: "torus" }],
}, assertAuthoredWorldEntityNamespaces);

rejectWithoutMutation("non-finite transform", [
  { op: "spawn", entity: { id: "nan-box", type: "box", transform: { position: [0, Number.NaN, 0] } } },
]);
rejectWithoutMutation("malformed transform", [
  { op: "update", id: "anchor", patch: { transform: { scale: [1, 1] } } },
]);
rejectWithoutMutation("unknown update field", [
  { op: "update", id: "anchor", patch: { behaviors: [] } },
]);
rejectWithoutMutation("id/type update poisoning", [
  { op: "update", id: "anchor", patch: { id: "renamed", type: "not-a-real-type" } },
]);
rejectWithoutMutation("wrong entity/config combination", [
  { op: "update", id: "anchor", patch: { sound: { source: "/bad.ogg" } } },
]);
rejectWithoutMutation("wrong nested config value", [
  { op: "update", id: "speaker", patch: { sound: { volume: "loud" } } },
]);
rejectWithoutMutation("non-finite nested config", [
  { op: "update", id: "speaker", patch: { sound: { volume: Number.POSITIVE_INFINITY } } },
]);
rejectWithoutMutation("invalid agent profile", [
  { op: "spawn", entity: { id: "bad-agent", type: "agent", agent: { role: 42 } } },
]);
rejectWithoutMutation("invalid emitter preset", [
  { op: "spawn", entity: { id: "bad-emitter", type: "emitter", emitter: { preset: "bottomless-particles" } } },
]);
rejectWithoutMutation("invalid terrain field", [
  { op: "spawn", entity: { id: "bad-terrain", type: "terrain", terrain: { heights: [0, 1, 0] } } },
]);
rejectWithoutMutation("invalid water color", [
  { op: "spawn", entity: { id: "bad-water", type: "water", water: { color: "not-a-color" } } },
]);
rejectWithoutMutation("invalid flock color", [
  { op: "spawn", entity: { id: "bad-flock", type: "flock", flock: { color: "not-a-color" } } },
]);
rejectWithoutMutation("invalid crowd color", [
  { op: "spawn", entity: { id: "bad-crowd", type: "crowd", crowd: { wanderColor: "not-a-color" } } },
]);
rejectWithoutMutation("invalid formula kind", [
  { op: "spawn", entity: { id: "bad-formula", type: "formula-field", formula: { kind: "division-by-zero" } } },
]);
rejectWithoutMutation("invalid dna spacing", [
  { op: "spawn", entity: { id: "bad-dna", type: "dna-tree", dna: { spacing: [1] } } },
]);
rejectWithoutMutation("invalid force-field color", [
  { op: "spawn", entity: { id: "bad-field", type: "force-field", forceField: { color: "not-a-color" } } },
]);
rejectWithoutMutation("transient steering input in authored config", [
  { op: "update", id: "driver", patch: { steering: { thrust: 1 } } },
]);
rejectWithoutMutation("unknown parent reference", [
  { op: "spawn", entity: { id: "orphan", type: "box", parentId: "missing-parent" } },
]);
rejectWithoutMutation("parent cycle", [
  { op: "update", id: "root", patch: { parentId: "anchor" } },
]);
rejectWithoutMutation("forward parent reference in one operation", [
  { op: "update", id: "root", patch: { parentId: "future-parent" } },
  { op: "spawn", entity: { id: "future-parent", type: "group" } },
]);
rejectWithoutMutation("broken interaction reference", [
  { op: "update", id: "anchor", patch: { interactions: [{ id: "bad-target", type: "toggle-visibility", targetIds: ["missing"] }] } },
]);
rejectWithoutMutation("forward interaction reference in one operation", [
  { op: "update", id: "anchor", patch: { interactions: [{ id: "future-target", type: "toggle-visibility", targetIds: ["future-box"] }] } },
  { op: "spawn", entity: { id: "future-box", type: "box" } },
]);
rejectWithoutMutation("broken steering reference", [
  { op: "update", id: "driver", patch: { steering: { arrowId: "missing-arrow" } } },
]);
rejectWithoutMutation("removal that would dangle a steering reference", [
  { op: "remove", id: "arrow" },
]);
rejectWithoutMutation("broken look-at reference", [
  { op: "spawn", entity: { id: "watcher", type: "box", behaviors: [{ id: "watch", type: "look-at", targetId: "missing" }] } },
]);
rejectWithoutMutation("wrong follow-spline reference type", [
  { op: "spawn", entity: { id: "follower", type: "box", behaviors: [{ id: "follow", type: "follow-spline", splineId: "anchor" }] } },
]);
rejectWithoutMutation("invalid environment field", [
  { op: "set-environment", environment: { ground: { size: "huge" } } },
]);
rejectWithoutMutation("unknown environment key", [
  { op: "set-environment", environment: { mysteryFog: true } },
]);
rejectWithoutMutation("invalid environment envelope", [
  { op: "set-environment", environment: { envelope: { fogNear: 50, fogFar: 10, cameraFar: 100 } } },
]);

const entityCapacityDefinition = structuredClone(base);
while (entityCapacityDefinition.entities.length < 1_024) {
  const index = entityCapacityDefinition.entities.length;
  entityCapacityDefinition.entities.push({ id: `capacity-${index}`, type: "box" });
}
rejectDefinitionWithoutMutation("cumulative authored entity budget", entityCapacityDefinition, [
  { op: "spawn", entity: { id: "capacity-overflow", type: "box" } },
]);

const oversizedDefinition = { ...structuredClone(base), padding: "x".repeat(8 * 1024 * 1024) };
rejectDefinitionWithoutMutation("serialized document budget", oversizedDefinition, [
  { op: "update", id: "anchor", patch: { label: "Still too large" } },
]);

assert.equal(results.some((result) => !result.ok), false);
console.log(`\nPASS  scene command validation: ${results.length}/${results.length} checks passed`);
