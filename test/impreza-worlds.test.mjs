import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { importBrowserModule } from "./support/import-browser-module.mjs";
import { assertWorldDefinition } from "../server/scene-document.mjs";
import { sceneCollection } from "../src/content-collections.ts";
import { validateStoredSceneDefinition, SceneCommandError } from "../server/scene-commands.mjs";

const { buildImprezaWorld, imprezaVehicle, IMPREZA_PLAYER } = await importBrowserModule(new URL("../src/impreza-scene.ts", import.meta.url));
const source = JSON.parse(readFileSync(new URL("../public/assets/ports/impreza/manifest.json", import.meta.url), "utf8"));
test("two native CarScene generations remain distinct, portable archive worlds", () => {
  for (const id of ["atmel", "racinx"]) {
    const world = buildImprezaWorld(source, id); assertWorldDefinition(world);
    validateStoredSceneDefinition(world);
    assert.equal(sceneCollection(world.id), "archive");
    const cars = world.entities.filter(e => e.tags?.includes("impreza-car"));
    assert.equal(cars.length, id === "atmel" ? 4 : 1);
    assert.equal(world.entities.filter(e => e.tags?.includes("impreza-wheel")).length, cars.length * 4);
    assert.equal(world.entities.filter(e => e.tags?.includes("impreza-source-ring")).length, id === "racinx" ? 100 : 0);
    const terrain = world.entities.find(e => e.type === "terrain");
    assert.deepEqual(terrain.terrain.heights, source.worlds[id].terrain.heights);
    assert.equal(terrain.terrain.size, 512); assert.equal(terrain.terrain.heightScale, 255);
    assert.equal(world.rules, undefined, "Source has no certified completed race binding");
    assert.equal(world.environment.sky, id === "racinx" ? "winter" : null);
  }
  const later = buildImprezaWorld(source, "racinx");
  assert.deepEqual(later.entities.find(e => e.id === "impreza-ring-99").transform.position, [990, 3, -990]);
  const water = later.entities.find(e => e.type === "water");
  assert.deepEqual(water.transform.position, [0, 485, 0]); assert.equal(water.visible, false);
});

test("invalid vehicle documents use the same bounded storage error contract", () => {
  const world = buildImprezaWorld(source, "atmel");
  world.entities.find(e => e.id === IMPREZA_PLAYER).steering.vehicle.steeringSpeedFactor = Infinity;
  assert.throws(() => validateStoredSceneDefinition(world), SceneCommandError);
});
test("native wheel centres and independent TVM origins survive the suspension/coordinate boundary", () => {
  const world = buildImprezaWorld(source, "atmel"), car = world.entities.find(e => e.id === IMPREZA_PLAYER);
  const rig = imprezaVehicle(source, IMPREZA_PLAYER);
  for (const [index, wheel] of source.vehicle.wheels.entries()) {
    const visual = world.entities.find(e => e.id === `${IMPREZA_PLAYER}-${wheel.id}`);
    assert.equal(visual.asset.id, source.models[wheel.model].id); assert.equal(visual.asset.fitSize, undefined);
    const centre = rig.wheels[index].connection.map((n, axis) => n - (axis === 1 ? rig.suspensionRestLength : 0));
    assert.deepEqual(centre, [wheel.sourcePosition[0], wheel.sourcePosition[1], -wheel.sourcePosition[2]]);
    assert.deepEqual(visual.transform.position, centre.map((n, axis) => n + car.transform.position[axis]));
    assert.equal(rig.wheels[index].driven, !wheel.steering); assert.equal(rig.wheels[index].brake, !wheel.steering);
  }
  assert.equal(car.physics.mass, 1500); assert.equal(car.physics.collider, "convex-hull");
  assert.equal(rig.engineForce, 3000); assert.equal(rig.maxSteerDegrees, 45);
});
test("settled start and source-height drop are explicit adapters, never an invented source coordinate", () => {
  for (const [id, expectedHeight] of [["atmel", 100.2], ["racinx", 50.2]]) {
    const sourceHeight = buildImprezaWorld(source, id, true).entities.find(e => e.id === IMPREZA_PLAYER);
    assert.ok(Math.abs(sourceHeight.transform.position[1] - expectedHeight) < 1e-10);
    const ready = buildImprezaWorld(source, id).entities.find(e => e.id === IMPREZA_PLAYER);
    assert.ok(ready.transform.position[1] < 2);
  }
  const cars = buildImprezaWorld(source, "atmel").entities.filter(e => e.tags?.includes("impreza-car"));
  assert.equal(cars[1].transform.position[0], -6);
  assert.ok(cars[1].tags.includes("spawn-separation-adapter"));
  assert.deepEqual(source.worlds.atmel.opponents[0].sourcePosition, [0, -300, 0]);
});
