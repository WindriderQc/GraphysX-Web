import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyCommands, validateStoredSceneDefinition } from "../server/scene-commands.mjs";
import { assertInlineMesh, assertInlinePixels, assertMeshSceneBudget, MESH_LIMITS } from "../server/inline-mesh.mjs";
import { buildWorldVocabulary } from "../server/world-vocabulary.mjs";

const pixels = () => ({ width: 2, height: 1, rgba: [255, 80, 20, 255, 20, 180, 240, 255] });
const mesh = () => ({ positions: [-2, 0, -2, 2, 0, -2, 2, 1, 2, -2, 1, 2], indices: [0, 2, 1, 0, 3, 2], uvs: [0, 0, 1, 0, 1, 1, 0, 1], groups: [{ start: 0, count: 3, materialIndex: 0 }, { start: 3, count: 3, materialIndex: 1 }], materials: [{ texture: { id: "inline", pixels: pixels() } }, { color: "#a86432" }] });
const world = () => ({ schema: "graphysx.agent-world/v2", id: "mesh-test", label: "Mesh test", entities: [] });

describe("portable authored mesh", () => {
  it("creates, replaces and serializes geometry, UVs, material groups and pixels without a store", () => {
    const initial = world();
    const created = applyCommands(initial, [{ op: "spawn", entity: { id: "sail", type: "mesh", mesh: mesh(), physics: { mode: "static", collider: "trimesh" } } }]).definition;
    validateStoredSceneDefinition(JSON.parse(JSON.stringify(created)));
    assert.equal(initial.entities.length, 0);
    const changed = mesh();
    changed.positions[7] = 2;
    const updated = applyCommands(created, [{ op: "update", id: "sail", patch: { mesh: changed } }]).definition;
    assert.deepEqual(updated.entities[0].mesh, changed);
    assert.equal(created.entities[0].mesh.positions[7], 1);
  });
  for (const [name, corrupt] of [
    ["missing buffers", m => { delete m.positions; }],
    ["nonfinite vertex", m => { m.positions[0] = Infinity; }],
    ["bad stride", m => m.positions.push(1)],
    ["negative index", m => { m.indices[0] = -1; }],
    ["fractional index", m => { m.indices[0] = 0.5; }],
    ["missing vertex", m => { m.indices[0] = 4; }],
    ["degenerate triangle", m => { m.indices[0] = m.indices[1]; }],
    ["UV cardinality", m => m.uvs.pop()],
    ["normal cardinality", m => { m.normals = [0, 1, 0]; }],
    ["zero normals", m => { m.normals = Array(12).fill(0); }],
    ["overlapping groups", m => { m.groups[1].start = 0; }],
    ["partial group", m => { m.groups[0].count = 2; }],
    ["unknown material", m => { m.groups[0].materialIndex = 2; }],
    ["uncovered triangles", m => m.groups.pop()],
    ["unknown property", m => { m.javascript = "arbitrary code"; }],
    ["material field", m => { m.materials[0].eval = "no"; }],
    ["material side", m => { m.materials[0].side = "inside-out"; }],
    ["invalid pixels", m => { m.materials[0].texture.pixels.rgba[0] = -1; }],
    ["curated texture with pixels", m => { m.materials[0].texture.id = "checker"; }],
    ["textured without UV", m => { delete m.uvs; }],
  ]) it(`refuses ${name} atomically`, () => {
    const source = world();
    const before = JSON.stringify(source);
    const bad = mesh(); corrupt(bad);
    assert.throws(() => applyCommands(source, [{ op: "spawn", entity: { id: "valid-first", type: "box" } }, { op: "spawn", entity: { id: "bad", type: "mesh", mesh: bad } }]));
    assert.equal(JSON.stringify(source), before);
  });
  it("bounds both individual buffers and aggregate scene cost", () => {
    assert.throws(() => assertInlineMesh({ ...mesh(), positions: Array((MESH_LIMITS.vertices + 1) * 3).fill(0) }));
    assert.throws(() => assertMeshSceneBudget(Array(9).fill({ type: "mesh", mesh: { positions: Array(MESH_LIMITS.vertices * 3), indices: [0, 1, 2] } })));
    assert.throws(() => assertInlinePixels({ width: 65, height: 1, rgba: [] }));
    assert.throws(() => assertInlinePixels({ width: 1, height: 1, rgba: [0.5, 1, 2, 255] }));
  });
  it("refuses distinct JSON vertices that collapse in the actual Float32 geometry", () => {
    assert.throws(() => assertInlineMesh({ positions: [9999, 0, 0, 9999.00001, 0, 0, 9999, 0.00001, 0], indices: [0, 1, 2] }), /Float32/);
    assert.throws(() => assertInlineMesh({ positions: [0, 0, 0, 1e-30, 0, 0, 0, 1e-30, 0], indices: [0, 1, 2] }), /Float32/);
  });
  it("keeps the server and runtime budget consistent at temporary batch peaks", () => {
    const positions = Array(MESH_LIMITS.vertices * 3).fill(0);
    positions[3] = 1; positions[7] = 1;
    const buffers = { positions, indices: [0, 1, 2] };
    const count = MESH_LIMITS.sceneVertices / MESH_LIMITS.vertices;
    const initial = { ...world(), entities: Array.from({ length: count }, (_, i) => ({ id: `full-${i}`, type: "mesh", mesh: buffers })) };
    const extra = { id: "replacement", type: "mesh", mesh: buffers };
    const before = JSON.stringify(initial);
    assert.throws(() => applyCommands(initial, [{ op: "spawn", entity: extra }, { op: "remove", id: "full-0" }]), /scene geometry budget/);
    assert.equal(JSON.stringify(initial), before);
    const accepted = applyCommands(initial, [{ op: "remove", id: "full-0" }, { op: "spawn", entity: extra }]);
    assert.equal(accepted.definition.entities.length, count);
    assert.doesNotThrow(() => validateStoredSceneDefinition(accepted.definition));
  });
  it("requires explicit collider intent and refuses moving triangle colliders", () => {
    for (const physics of [{ mode: "dynamic" }, { mode: "dynamic", collider: "trimesh" }, { mode: "kinematic", collider: "trimesh" }]) {
      assert.throws(() => applyCommands(world(), [{ op: "spawn", entity: { id: "bad", type: "mesh", mesh: mesh(), physics } }]));
    }
    assert.doesNotThrow(() => applyCommands(world(), [{ op: "spawn", entity: { id: "hull", type: "mesh", mesh: mesh(), physics: { mode: "dynamic", collider: "convex-hull" } } }]));
  });
  it("publishes the actual mesh and pixel limits to Core", () => {
    const vocabulary = buildWorldVocabulary();
    assert.deepEqual(vocabulary.entityTypes.mesh.requires, ["mesh"]);
    assert.deepEqual(vocabulary.limits.mesh, MESH_LIMITS);
    assert.deepEqual(vocabulary.fields.mesh.find(field => field.name === "uvs").range, [-MESH_LIMITS.uv, MESH_LIMITS.uv]);
    assert.deepEqual(vocabulary.fields.mesh.find(field => field.name === "normals").range, [-MESH_LIMITS.normalComponent, MESH_LIMITS.normalComponent]);
    assert.ok(vocabulary.fields.texture.some(entry => entry.name === "pixels"));
    assert.ok(vocabulary.rules.some(rule => rule.includes("original geometry")));
  });
});
