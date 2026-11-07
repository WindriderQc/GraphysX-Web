import assert from "node:assert/strict";
import { after, test } from "node:test";
import { Group, PerspectiveCamera } from "three";
import { installBallsySyntheticXr, bindBallsySyntheticXr } from "../scripts/fixtures/ballsy-synthetic-xr.mjs";

// QA fixture contract only. This is not evidence that product XR or a headset works.
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
after(() => {
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else delete globalThis.window;
  if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator); else delete globalThis.navigator;
});
async function setup(floorOffset = 0) {
  const rig = new Group(), group = new Group(); rig.position.y = floorOffset; rig.add(group);
  const slots = [0, 1].map(() => {
    const ray = new Group(), grip = new Group(), hand = new Group(), anchor = new Group(); hand.joints = {};
    const slot = { ray, grip, hand, anchor, source: null };
    ray.addEventListener("connected", event => { slot.source = event.data; });
    ray.addEventListener("disconnected", () => { slot.source = null; });
    group.add(ray, grip, hand, anchor); return slot;
  });
  const xr = { rig, camera: new PerspectiveCamera(), renderer: { xr: {} }, input: { group, slots }, session: { snapshot: { phase: "active" }, session: null } };
  rig.add(xr.camera); rig.updateMatrixWorld(true);
  Object.defineProperty(globalThis, "window", { configurable: true, value: { requestAnimationFrame() {}, __BALLSY_GIANT__: { xr } } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userActivation: { isActive: true } } });
  installBallsySyntheticXr(); bindBallsySyntheticXr();
  const fixture = window.__ballsyXR; fixture.reject = false;
  xr.session.session = await navigator.xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor", "hand-tracking"] });
  await xr.renderer.xr.setSession(xr.session.session);
  return { fixture, xr, slots };
}
const near = (actual, expected) => assert.ok(actual.every((value, index) => Math.abs(value - expected[index]) < 1e-8), `${actual} != ${expected}`);

test("Synthetic controller grip retains the real 8.5 cm balloon offset", async () => {
  const { fixture, slots } = await setup(); fixture.connect(0, "right"); fixture.move(0, [.2, 1.08, -.48]);
  near(slots[0].grip.position.toArray(), [.2, 1.08, -.395]);
  const native = fixture.frame.getPose(slots[0].source.gripSpace);
  near([native.transform.position.x, native.transform.position.y, native.transform.position.z], [.2, 1.08, -.395]);
  assert.equal(native.emulatedPosition, false);
  slots[0].grip.visible = false; assert.equal(fixture.frame.getPose(slots[0].source.gripSpace), null);
});

test("Synthetic controller local-only origin is converted exactly once", async () => {
  const { fixture, slots } = await setup(1.6); fixture.connect(1, "left"); fixture.move(1, [.2, 1.08, -.48]);
  near(slots[1].grip.position.toArray(), [.2, -.52, -.395]);
  assert.equal(fixture.session.inputSources[0].handedness, "left");
});

test("Synthetic pinch exposes supplied joints with no grip or target-ray requirement", async () => {
  const { fixture, slots } = await setup(1.6); fixture.connect(0, "right", "hand"); fixture.move(0, [.2, 1.08, -.48]);
  assert.equal(slots[0].source.gripSpace, undefined); assert.equal(slots[0].source.hand.size, 25);
  const joint = slots[0].source.hand.get("index-finger-tip"), native = fixture.frame.getJointPose(joint);
  near([native.transform.position.x, native.transform.position.y, native.transform.position.z], [.2, -.52, -.48]);
  slots[0].ray.visible = false; assert.equal(fixture.frame.getPose(slots[0].source.targetRaySpace), null);
  assert.ok(fixture.frame.getJointPose(joint));
  slots[0].hand.joints["index-finger-tip"].visible = false; assert.equal(fixture.frame.getJointPose(joint), null);
});

test("Synthetic binding marks emulated poses and retains session ownership", async () => {
  const { fixture, xr, slots } = await setup(); fixture.connect(0, "right"); fixture.emulated = true;
  assert.equal(fixture.frame.getPose(slots[0].source.gripSpace).emulatedPosition, true);
  assert.equal(xr.renderer.xr.getFrame().session, xr.session.session);
  assert.equal(xr.renderer.xr.getSession(), xr.session.session);
  await fixture.session.end(); assert.equal(slots[0].source, null);
  fixture.localOnly = true;
  await assert.rejects(fixture.session.requestReferenceSpace("local-floor"));
  assert.equal(await fixture.session.requestReferenceSpace("local"), fixture.reference);
});
