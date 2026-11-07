import { test } from "node:test";
import assert from "node:assert/strict";
import { Ray, Vector3, Matrix4 } from "three";
import { importBrowserModule } from "./support/import-browser-module.mjs";
const { bridgeOcclusionDistance } = await importBrowserModule(new URL("../src/ballsy-picking.ts", import.meta.url));
const { COURSE_SHORTCUT } = await importBrowserModule(new URL("../src/ballsy-course.ts", import.meta.url));
const p = COURSE_SHORTCUT[Math.floor((COURSE_SHORTCUT.length - 1) / 2)];
assert.ok(p);
test("bridge deck hides earth below it from a downward pointer ray", () => {
  const ray = new Ray(new Vector3(p.x, p.y + 10, p.z), new Vector3(0, -1, 0));
  assert.ok(Math.abs(bridgeOcclusionDistance(ray) - 10) < .002);
});
test("visible earth beside the bridge remains selectable", () => {
  const ray = new Ray(new Vector3(6, 20, 0), new Vector3(0, -1, 0));
  assert.equal(bridgeOcclusionDistance(ray), Infinity);
});
test("a ray already beneath the deck is not blocked by its footprint", () => {
  const ray = new Ray(new Vector3(p.x, p.y - 1, p.z), new Vector3(0, -1, 0));
  assert.equal(bridgeOcclusionDistance(ray), Infinity);
});
test("oblique pointer rays hit the actual bridge even when their earth target is beside it", () => {
  const origin = new Vector3(p.x + 8, p.y + 10, p.z);
  const deckPoint = new Vector3(p.x, p.y, p.z);
  const ray = new Ray(origin, deckPoint.clone().sub(origin).normalize());
  assert.ok(Math.abs(bridgeOcclusionDistance(ray) - origin.distanceTo(deckPoint)) < .005);
});
test("giant model ray gives the same occlusion after inverse table placement and scale", () => {
  const model = new Matrix4().makeRotationY(.7).scale(new Vector3(.045,.045,.045));
  model.setPosition(.3,.82,-1.05);
  const ray = new Ray(new Vector3(p.x,p.y+10,p.z),new Vector3(0,-1,0));
  const physicalRay = ray.clone().applyMatrix4(model);
  const localRay = physicalRay.applyMatrix4(model.clone().invert());
  assert.ok(Math.abs(bridgeOcclusionDistance(localRay) - 10) < .002);
});
test("distant fitted camera rays retain bridge occlusion beyond the old 100 metre cap", () => {
  const ray = new Ray(new Vector3(p.x, p.y + 200, p.z), new Vector3(0, -1, 0));
  assert.ok(Math.abs(bridgeOcclusionDistance(ray) - 200) < .002);
});
