import assert from "node:assert/strict";
import { test } from "node:test";
import { importBrowserModule } from "./support/import-browser-module.mjs";
import { applyCommands } from "../server/scene-commands.mjs";
import { buildLlmXMath } from "../src/llmx-math.ts";

const { validateLlmXCreationBounds } = await importBrowserModule(new URL("../src/llmx-action-bounds.ts", import.meta.url));
const { createLlmXForge } = await importBrowserModule(new URL("../src/llmx-environment.ts", import.meta.url));
const forge = createLlmXForge(), zone = forge.anchors.buildZone;
const entity = (type = "box", extra = {}) => ({ id: "llmx-created-shape", type,
  transform: { position: [4.6, 0.7, 3.4] }, ...extra });
const world = (...entities) => applyCommands(forge.document, entities.map(entity => ({ op: "spawn", entity }))).definition;
const check = (...entities) => validateLlmXCreationBounds(world(...entities), zone);

test("canonical Forge and ordinary primitives pass without counting the protected scenery", () => {
  const original = JSON.stringify(forge.document);
  assert.doesNotThrow(() => validateLlmXCreationBounds(forge.document, zone));
  for (const type of ["box", "sphere", "icosahedron", "cylinder", "cone", "torus", "plane", "point-light"]) {
    assert.doesNotThrow(() => check(entity(type)), type);
  }
  assert.equal(JSON.stringify(forge.document), original);
});

test("a three-box pyramid fits when unit-cube centers include the floor and half their height", () => {
  const pyramid = (floorCenter, topCenter) => [
    [zone.center[0] - 0.5, floorCenter, zone.center[2]],
    [zone.center[0] + 0.5, floorCenter, zone.center[2]],
    [zone.center[0], topCenter, zone.center[2]],
  ].map((position, index) => entity('box', { id: `llmx-created-pyramid-${index}`, transform: { position } }));
  // Real rejected turn used y=.315 with no geometry or scale: the default cube is 1m.
  assert.throws(() => check(...pyramid(0.315, 1.315)), /traverse le plancher/);
  const grounded = pyramid(zone.center[1] + 0.5, zone.center[1] + 1.5);
  assert.doesNotThrow(() => check(...grounded));
  assert.ok(Math.abs(grounded[0].transform.position[1] - 0.5 - zone.center[1]) < 1e-12);
  assert.equal(grounded[2].transform.position[1] - 0.5, grounded[0].transform.position[1] + 0.5);
});

test("geometry dimensions, tube thickness and final height must fit, even when centers do", () => {
  for (const [type, geometry] of [["box", { width: 10000 }], ["box", { height: 13 }], ["box", { depth: 10000 }],
    ["sphere", { radius: 4 }], ["icosahedron", { radius: 4 }], ["cylinder", { radius: 4 }],
    ["cone", { height: 13 }], ["torus", { tube: 4 }], ["plane", { depth: 10000 }]]) {
    assert.throws(() => check(entity(type, { geometry })), /espace de construction/, type);
  }
});

test("composed parent scales reject nested amplification before any native mutation", () => {
  const parent = entity("group", { id: "llmx-created-parent", transform: { position: [...zone.center], scale: [12, 12, 12] } });
  const child = entity("group", { id: "llmx-created-child", parentId: parent.id, transform: { scale: [12, 12, 12] } });
  const cube = entity("box", { parentId: child.id, transform: { position: [0, 0.5, 0] } });
  const document = world(parent, child, cube);
  document.entities.reverse(); // Bounds must not depend on persisted entity ordering.
  assert.throws(() => validateLlmXCreationBounds(document, zone), /espace de construction/);
});

test("parent rotation moves local positions; descendants inherit full rotation and nonuniform scale", () => {
  const parent = entity("group", { id: "llmx-created-parent", transform: { position: [...zone.center], rotationDegrees: [0, 90, 0] } });
  const cube = entity("box", { parentId: parent.id, transform: { position: [2, 0.7, 0] }, geometry: { width: 0.5, height: 0.5, depth: 0.5 } });
  assert.doesNotThrow(() => check(parent, cube));
  const tilted = { ...parent, transform: { ...parent.transform, rotationDegrees: [0, 0, -90] } };
  assert.throws(() => check(tilted, cube), /espace de construction/, "rotated local x goes below the floor");
  const scaled = { ...parent, transform: { ...parent.transform, scale: [2, 1, 1] } };
  assert.throws(() => check(scaled, cube), /espace de construction/, "parent scale must also affect child translation");
});

test("rotated boxes use their transformed corners rather than unrotated scale components", () => {
  const cube = entity("box", { geometry: { width: 4, height: 0.2, depth: 4 }, transform: { position: [4.6, 1, 3.4] } });
  assert.doesNotThrow(() => check(cube));
  assert.throws(() => check({ ...cube, transform: { ...cube.transform, rotationDegrees: [0, 45, 0] } }), /espace de construction/);
});

test("planes use the runtime XZ orientation; empty groups add no geometry; hidden geometry remains bounded", () => {
  assert.doesNotThrow(() => check(entity("plane", { geometry: { width: 2, depth: 3 }, transform: { position: [...zone.center] } })));
  assert.doesNotThrow(() => check(entity("group", { transform: { position: [50, 50, 50], scale: [12, 12, 12] } })));
  assert.throws(() => check(entity("box", { visible: false, geometry: { width: 10000 } })), /espace de construction/);
  assert.throws(() => check(entity("point-light", { marker: false, transform: { position: [50, 0.7, 3.4] } })), /espace de construction/);
});

test("bounds include exact horizontal and vertical faces with a small numerical tolerance", () => {
  const at = position => entity("box", { transform: { position } });
  assert.doesNotThrow(() => check(at([zone.center[0] + zone.radius - 0.5, zone.center[1] + 0.35, zone.center[2]])));
  assert.doesNotThrow(() => check(at([zone.center[0], zone.center[1] + 5.5, zone.center[2]])));
  assert.throws(() => check(at([zone.center[0] + zone.radius - 0.49, 0.7, zone.center[2]])), /espace de construction/);
  assert.throws(() => check(at([zone.center[0], zone.center[1] + 5.51, zone.center[2]])), /espace de construction/);
  assert.throws(() => check(at([zone.center[0], zone.center[1] + 0.34, zone.center[2]])), /espace de construction/);
});

test("real arithmetic roots, boards, glyphs and twenty units fit at the beginning and end of each lesson", () => {
  for (const config of [{ operation: "count", left: 20, right: 0 }, { operation: "add", left: 8, right: 12 },
    { operation: "subtract", left: 20, right: 20 }, { operation: "count", left: 0, right: 0 }]) {
    const last = config.operation === "count" ? config.left : config.right;
    for (const step of new Set([0, Math.floor(last / 2), last])) {
      const lesson = buildLlmXMath({ ...config, step }, zone);
      const document = applyCommands(forge.document, lesson.commands).definition;
      assert.doesNotThrow(() => validateLlmXCreationBounds(document, zone), JSON.stringify({ ...config, step }));
    }
  }
});

test("malformed transforms, missing parents and cycles throw a useful error instead of bypassing bounds", () => {
  const base = world(entity());
  const target = base.entities.at(-1);
  for (const patch of [{ parentId: "absent" }, { parentId: target.id }, { transform: { scale: [NaN, 1, 1] } },
    { transform: { position: [Infinity, 0, 0] } }, { geometry: { width: -1 } }, { type: "agent" }]) {
    const changed = structuredClone(base); Object.assign(changed.entities.at(-1), patch);
    assert.throws(() => validateLlmXCreationBounds(changed, zone), /invalides/);
  }
  assert.throws(() => validateLlmXCreationBounds(base, { ...zone, radius: NaN }), /invalides/);
});
