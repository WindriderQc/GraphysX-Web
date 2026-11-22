import assert from "node:assert/strict";
import { test } from "node:test";
import { BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial } from "three";
import { importBrowserModule } from "./support/import-browser-module.mjs";
const { visibleSceneBounds } = await importBrowserModule(new URL("../src/visible-scene-bounds.ts", import.meta.url));

test("scene framing respects hidden source ancestors and native translated/scaled model geometry", () => {
  const world = new Group(), visible = new Group(), hidden = new Group(); hidden.visible = false;
  const panel = new Mesh(new BoxGeometry(8, 4, 2), new MeshBasicMaterial()); panel.position.set(-50, 10, 2); visible.scale.setScalar(.5); visible.add(panel);
  hidden.add(new Mesh(new BoxGeometry(10000, 10000, 10000), new MeshBasicMaterial())); world.add(visible, hidden);
  const bounds = visibleSceneBounds([world]);
  assert.deepEqual(bounds.min.toArray(), [-27, 4, .5]); assert.deepEqual(bounds.max.toArray(), [-23, 6, 1.5]);
  visible.visible = false; assert.equal(visibleSceneBounds([world]).isEmpty(), true);
});

test("scene framing includes displaced instances rather than fitting only their base mesh", () => {
  const world = new Group(), instances = new InstancedMesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial(), 2);
  instances.setMatrixAt(0, new Matrix4().makeTranslation(-40, 0, 0)); instances.setMatrixAt(1, new Matrix4().makeTranslation(40, 0, 0)); world.add(instances);
  const bounds = visibleSceneBounds([world]); assert.equal(bounds.min.x, -41); assert.equal(bounds.max.x, 41);
  instances.setMatrixAt(1, new Matrix4().makeTranslation(70, 0, 0)); assert.equal(visibleSceneBounds([world]).max.x, 71, "a later framing request uses current instance transforms");
});

test("subject roots omit a large backdrop but include an authored floor with the same name", () => {
  const world = new Group(), backdrop = new Mesh(new BoxGeometry(10000, .1, 10000), new MeshBasicMaterial());
  const subject = new Mesh(new BoxGeometry(4, 4, 4), new MeshBasicMaterial()); subject.position.set(0, 4, 0);
  const authoredFloor = new Mesh(new BoxGeometry(30, .2, 30), new MeshBasicMaterial()); authoredFloor.name = "AgentWorldGround";
  world.add(backdrop, subject, authoredFloor);
  assert.deepEqual(visibleSceneBounds([subject]).min.toArray(), [-2, 2, -2]);
  const bounds = visibleSceneBounds([subject, authoredFloor]);
  assert.equal(bounds.min.x, -15); assert.equal(bounds.max.x, 15);
  assert.ok(Math.abs(bounds.min.y + .1) < 1e-6); assert.equal(bounds.max.y, 6);
  assert.equal(visibleSceneBounds([]).isEmpty(), true, "an empty document has no subject to reframe");
});

test("a subject below a hidden ancestor cannot attract the camera", () => {
  const hidden = new Group(), subject = new Mesh(new BoxGeometry(1000, 1000, 1000), new MeshBasicMaterial()); hidden.visible = false; hidden.add(subject);
  assert.equal(visibleSceneBounds([subject]).isEmpty(), true);
});
