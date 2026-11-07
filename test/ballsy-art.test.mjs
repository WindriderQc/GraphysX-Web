import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Mesh, BufferGeometry, MeshStandardMaterial } from "three";
import { importBrowserModule } from "./support/import-browser-module.mjs";
import { assertWorldDefinition } from "../server/scene-document.mjs";
import { assertInlineMesh, assertMeshSceneBudget } from "../server/inline-mesh.mjs";

const { composeBallsyCourse } = await importBrowserModule(new URL("../src/ballsy-scene.ts", import.meta.url));
const { ballsySlimeEntities, projectBallsySlime } = await importBrowserModule(new URL("../src/ballsy-slime-scene.ts", import.meta.url));
const { createBallsySlime } = await importBrowserModule(new URL("../src/ballsy-slime.ts", import.meta.url));
const { createEarth, earthMesh } = await importBrowserModule(new URL("../src/ballsy-earth.ts", import.meta.url));

// Recorded from the pre-art f00c01c composition, excluding presentation/material fields.
const originalPhysics = {
  "ballsy-road-main": "2690cf025a4a288e0080396f371062cf64e2dc147d5724064f9d74a877265d7e",
  "ballsy-road-bridge": "71a42a79aeee5baccaf7ee11a5fb9d303da1836b1bde806bcaeea41590792b6a",
  "ballsy-rail-main--1": "d917ffa6b53a1fbfc50c26b601bedb370dad8fd74a67c4e2b7f698b6c58a3d35",
  "ballsy-rail-main-1": "cd57fb532ac16e2891fef601a8fcc61a7efa8f335d1532748547abae477802af",
  "ballsy-rail-bridge--1": "bf7e40394962d3f9c41b4fca212f6b6ffe14e5b6d8182e12633808db1aeb0564",
  "ballsy-rail-bridge-1": "5eaae43dac37f6e0314b48ef88776bf1d7a5cedd0dba9efe1b9055ef6e1db69c",
  "volcano-earth": "f8b3710f6ab40e1d1e94c6171ae388656af6b71c21a13b8ae1cff9992874adf9",
  "ballsy-p1": "2a4f54a8b0e3708b623e1e25a61643494efe8de1285885d441aac48886582fb3",
  "ballsy-p2": "ada6720432db31d08365abf73a216fa798736f031931d97b1ccffb03f2b488d9",
};

test("diorama changes no collider, road sample, spawn, ball dimension or steering", () => {
  const physical = composeBallsyCourse({ volcano: true }).entities.filter(e => e.physics);
  const hashes = Object.fromEntries(physical.map(e => [e.id, createHash("sha256").update(JSON.stringify({
    type: e.type, transform: e.transform, geometry: e.geometry, positions: e.mesh?.positions,
    indices: e.mesh?.indices, physics: e.physics, steering: e.steering,
  })).digest("hex")]));
  assert.deepEqual(hashes, originalPhysics);
});

test("complete diorama plus maximum slime pool stays inside native document and mesh budgets", () => {
  const scene = composeBallsyCourse({ volcano: true });
  scene.entities.push(...ballsySlimeEntities());
  assertWorldDefinition(scene); assertMeshSceneBudget(scene.entities);
  let vertices = 0, triangles = 0;
  for (const entity of scene.entities) if (entity.mesh) {
    assertInlineMesh(entity.mesh);
    vertices += entity.mesh.positions.length / 3; triangles += entity.mesh.indices.length / 3;
  }
  assert.ok(scene.entities.length <= 100);
  assert.ok(vertices < 30000, `Native inline vertices: ${vertices}`);
  // The live lava can legally fill all 4096 vertices of one native mesh. Reserve
  // that maximum, not merely the three-vertex empty placeholder at composition.
  const emptyLavaVertices = scene.entities.find(e => e.id === "volcano-earth-lava").mesh.positions.length / 3;
  assert.ok(vertices - emptyLavaVertices + 4096 <= 32768, "Reserve the maximum live lava plus every slime object");
  assert.ok(triangles - 1 + 8192 <= 65536, "Reserve maximum live lava triangles too");
  assert.ok(triangles < 45000, `Native inline triangles: ${triangles}`);
  assert.equal(scene.entities.filter(e => e.type.endsWith("light")).length, 2, "No extra shadow/light passes");
  assert.equal(scene.entities.filter(e => e.tags?.includes("transient")).length, 20);
  const earth = createEarth(); earth.lava = earth.lava.map((_, i) => i % 2 ? .1 : 0);
  scene.entities.find(e => e.id === "volcano-earth-lava").mesh = earthMesh(earth, true);
  assertWorldDefinition(scene); assertMeshSceneBudget(scene.entities);
});

test("asphalt has portable micro-materials with UVs but no network image dependency", () => {
  const scene = composeBallsyCourse({ volcano: true });
  for (const name of ["main", "bridge"]) {
    const road = scene.entities.find(e => e.id === `ballsy-road-${name}`);
    assert.equal(road.mesh.uvs.length, road.mesh.positions.length / 3 * 2);
    assert.equal(road.material.texture.id, "inline"); assert.equal(road.material.normalTexture.id, "inline");
    assert.equal(road.material.texture.pixels.width, 16); assert.equal(road.material.texture.pixels.height, 16);
    assert.deepEqual(road.material.texture.repeat, [6, 6]);
    assert.equal(road.material.normalScale, .3);
    assert.ok(scene.entities.find(e => e.id === `ballsy-kerbs-${name}`));
    assert.ok(scene.entities.find(e => e.id === `ballsy-reflectors-${name}`));
  }
  assert.equal(scene.environment.lighting.intensity, .3, "Studio fill must not wash out contact and facets");
  for (const id of ["ballsy-p1", "ballsy-p2"]) {
    const ball = scene.entities.find(e => e.id === id);
    assert.equal(ball.castShadow, true); assert.equal(ball.receiveShadow, true);
    assert.equal(ball.material.emissiveIntensity, undefined, "Balls are lit solids, not self-lit floating sprites");
  }
});

test("splash relief and velocity stretch reuse fixed objects without writing authoritative state", () => {
  const definitions = ballsySlimeEntities();
  const objects = new Map(definitions.map(d => [d.id, new Mesh(new BufferGeometry(), new MeshStandardMaterial())]));
  const originalGeometry = [...objects.values()].map(object => object.geometry);
  const splat = definitions.find(d => d.id === "ballsy-slime-splat-0");
  assert.ok(Math.max(...splat.mesh.positions.filter((_, i) => i % 3 === 1)) > .2, "Real relief, not a flat decal");
  const state = createBallsySlime();
  state.projectiles = [{ id: "test-flight", position: [0, 8, 0], velocity: [25, 12, -4], bornAt: 0 }];
  state.splats = [{ id: "test-splash", position: [0, 1, 0], normal: [0, 1, 0], radius: 2, bornAt: 0, player: null }];
  state.time = .1;
  const before = JSON.stringify(state);
  for (let i = 0; i < 600; i++) projectBallsySlime(state, id => objects.get(id), .1);
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual([...objects.values()].map(object => object.geometry), originalGeometry);
  const balloon = objects.get("ballsy-slime-ball-0"), splash = objects.get("ballsy-slime-splat-0");
  assert.ok(balloon.scale.y > 1 && balloon.scale.y <= 1.28);
  assert.ok(Math.abs(balloon.scale.x * balloon.scale.y * balloon.scale.z - 1) < 1e-9);
  assert.ok(splash.scale.y > splash.scale.x);
  projectBallsySlime(createBallsySlime(), id => objects.get(id));
  assert.ok([...objects.values()].every(object => !object.visible));
  for (const object of objects.values()) { object.geometry.dispose(); object.material.dispose(); }
});

test("direct hits are compact brief bursts, while road puddles and two-second coats remain unchanged", () => {
  const objects = new Map(ballsySlimeEntities().map(d => [d.id, new Mesh(new BufferGeometry(), new MeshStandardMaterial())]));
  const state = createBallsySlime();
  const splat = { id: "direct", position: [0, 1, 0], normal: [1, 0, 0], radius: 2, bornAt: 0, player: 0 };
  state.splats = [splat, { ...splat, id: "road", normal: [0, 1, 0], player: null }];
  state.slowUntil = [2, 0]; state.time = .1;
  const direct = objects.get("ballsy-slime-splat-0"), road = objects.get("ballsy-slime-splat-1"), coat = objects.get("ballsy-slime-coat-0");
  const project = () => {
    const before = JSON.stringify(state); projectBallsySlime(state, id => objects.get(id));
    assert.equal(JSON.stringify(state), before, "Presentation must not shorten the network model");
  };
  project(); assert.ok(direct.visible && road.visible && coat.visible);
  assert.ok(Math.abs(direct.scale.x / road.scale.x - .55) < 1e-10);
  assert.ok(direct.material.opacity < road.material.opacity);
  state.time = .46; project(); assert.equal(direct.visible, false); assert.ok(road.visible && coat.visible);
  state.time = 1.99; project(); assert.ok(road.visible && coat.visible);
  state.time = 2; project(); assert.equal(coat.visible, false); assert.ok(road.visible);
  state.time = 2.75; project(); assert.ok(road.visible); assert.ok(Math.abs(road.material.opacity - .47) < 1e-10);
  for (const object of objects.values()) { object.geometry.dispose(); object.material.dispose(); }
});
