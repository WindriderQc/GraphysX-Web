import test from "node:test";
import assert from "node:assert/strict";
import { BoxGeometry, DirectionalLight, Group, Mesh, MeshStandardMaterial, Scene, Vector3 } from "three";
import { importBrowserModule } from "./support/import-browser-module.mjs";
const { createBallsyShadowRefresh, fitBallsyTableShadows } = await importBrowserModule(new URL("../src/ballsy-lighting.ts", import.meta.url));

test("miniature sun targets the translated rotated board and retains the native light direction", () => {
  const room = new Group(), table = new Group(), world = new Group(), sun = new DirectionalLight();
  room.add(table); table.add(world); world.add(sun);
  world.scale.setScalar(.045); world.position.set(0, .82, -1.05); sun.position.set(-30, 36, 18);
  const mapSize = sun.shadow.mapSize.clone();
  assert.equal(fitBallsyTableShadows(world, sun), true);
  assert.equal(sun.target.parent, world); assert.deepEqual(sun.shadow.mapSize.toArray(), mapSize.toArray());
  const checkDirection = () => {
    room.updateMatrixWorld(true);
    assert.ok(sun.target.getWorldPosition(new Vector3()).distanceTo(world.getWorldPosition(new Vector3())) < 1e-10);
    const actual = sun.getWorldPosition(new Vector3()).sub(sun.target.getWorldPosition(new Vector3())).normalize();
    const expected = new Vector3(-30, 36, 18).transformDirection(world.matrixWorld);
    assert.ok(actual.distanceTo(expected) < 1e-10);
  };
  checkDirection();
  table.position.set(2, -.2, 4); table.rotation.y = 1.1;
  checkDirection();
  assert.equal(fitBallsyTableShadows(world, sun), false, "No projection rebuild for translation/yaw-only recenter");
});

test("shadow frustum and normal bias scale once with the tabletop, retaining contact resolution", () => {
  const world = new Group(), sun = new DirectionalLight(); world.add(sun); world.scale.setScalar(.045);
  fitBallsyTableShadows(world, sun);
  const camera = sun.shadow.camera;
  assert.equal(camera.right, 38 * .045); assert.equal(camera.left, -38 * .045);
  assert.equal(camera.near, .5 * .045); assert.equal(camera.far, 110 * .045);
  assert.equal(sun.shadow.normalBias, .03 * .045); assert.equal(sun.shadow.bias, -.0004);
  assert.equal(fitBallsyTableShadows(world, sun), false);
  world.scale.setScalar(.08); assert.equal(fitBallsyTableShadows(world, sun), true);
  assert.equal(camera.right, 38 * .08); assert.equal(camera.far, 110 * .08);
  assert.equal(world.children.filter(child => child === sun.target).length, 1);
  assert.equal(fitBallsyTableShadows(world, null), false);
});

test("the giant shadow map is redrawn only when a shadow caster or the sun changes", () => {
  const scene = new Scene(), sun = new DirectionalLight(), ball = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  const decal = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  sun.castShadow = true; ball.castShadow = true; decal.castShadow = false;
  scene.add(sun, ball, decal);
  const changed = createBallsyShadowRefresh(scene);
  assert.equal(changed(), true, "the first frame draws the map");
  assert.equal(changed(), false, "a still table reuses it");
  decal.position.x = 2;
  assert.equal(changed(), false, "a mesh that casts no shadow does not matter");
  ball.position.x = .01;
  assert.equal(changed(), true, "a caster that moved");
  assert.equal(changed(), false);
  ball.geometry.attributes.position.needsUpdate = true;
  assert.equal(changed(), true, "a caster whose shape changed in place");
  ball.geometry = new BoxGeometry(2, 1, 1);
  assert.equal(changed(), true, "a caster whose geometry was replaced");
  ball.visible = false;
  assert.equal(changed(), true, "a caster that disappeared");
  ball.visible = true; changed();
  sun.position.y = 10;
  assert.equal(changed(), true, "the sun moved");
  sun.shadow.camera.left = -7;
  assert.equal(changed(), true, "the shadow bounds were refitted");
  assert.equal(changed(), false);
});
