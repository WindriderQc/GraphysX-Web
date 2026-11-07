import { test } from "node:test";
import assert from "node:assert/strict";
import { Group } from "three";
import { importBrowserModule } from "./support/import-browser-module.mjs";

const { readGiantXrPose, giantXrWorldPoint, freshGiantXrRelease, observeGiantXrSelect, GIANT_XR_FRESH_MS } = await importBrowserModule(new URL("../src/ballsy-giant-xr.ts", import.meta.url));
const { BallsyThrowGesture } = await importBrowserModule(new URL("../src/ballsy-throw.ts", import.meta.url));
const reference = {};
const pose = (position = [0, 1, 0], emulatedPosition = false) => ({ emulatedPosition,
  transform: { position: Object.fromEntries(["x", "y", "z"].map((key, i) => [key, position[i]])), orientation: { x: 0, y: 0, z: 0, w: 1 } } });
function fixture(hand = false) {
  const source = { targetRaySpace: {}, gripSpace: {} };
  if (hand) source.hand = new Map([["index-finger-tip", {}], ["thumb-tip", {}]]);
  const poses = new Map([[source.targetRaySpace, pose()], [source.gripSpace, pose()]]);
  if (hand) {
    poses.set(source.hand.get("index-finger-tip"), pose([.02, 1.1, -.5]));
    poses.set(source.hand.get("thumb-tip"), pose([-.02, 1.1, -.5]));
  }
  const frame = { getPose: space => poses.get(space) ?? null, getJointPose: space => poses.get(space) ?? null };
  return { source, poses, frame };
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test("native select diagnostics count both edges once, exclude squeeze, and detach across sessions", () => {
  const sessions = [new EventTarget(), new EventTarget()], events = [];
  const emit = (session, ...types) => types.forEach(type => session.dispatchEvent(new Event(type)));
  const detach = observeGiantXrSelect(sessions[0], phase => events.push(phase));
  emit(sessions[0], "selectstart", "squeezestart", "squeezeend", "selectend");
  assert.deepEqual(events, ["start", "end"]);
  detach(); detach();
  const detachNext = observeGiantXrSelect(sessions[1], phase => events.push(phase));
  emit(sessions[0], "selectstart", "selectend");
  emit(sessions[1], "selectstart", "selectend");
  assert.deepEqual(events, ["start", "end", "start", "end"]);
  detachNext();
  const detachReentry = observeGiantXrSelect(sessions[0], phase => events.push(phase));
  emit(sessions[0], "selectstart", "selectend");
  assert.deepEqual(events, ["start", "end", "start", "end", "start", "end"]);
  detachReentry();
  for (const session of sessions) emit(session, "selectstart", "selectend");
  assert.equal(events.length, 6, "disposed observers retain no listeners");
});

test("giant uses the real grip and requires its native ray pose for controllers", () => {
  const { source, poses, frame } = fixture();
  assert.deepEqual(readGiantXrPose(frame, reference, source), { kind: "controller", position: [0, 1, 0], orientation: [0, 0, 0, 1], rayTracked: true });
  poses.delete(source.targetRaySpace);
  assert.equal(readGiantXrPose(frame, reference, source), null);
});

test("emulated, missing, malformed and inactive native frames never authorize a throw", () => {
  for (const spaceName of ["gripSpace", "targetRaySpace"]) {
    for (const invalid of [null, pose([0, 1, 0], true), pose([NaN, 1, 0]), { ...pose(), transform: { ...pose().transform, orientation: { x: 0, y: 0, z: 0, w: 0 } } }]) {
      const { source, poses, frame } = fixture();
      poses.set(source[spaceName], invalid);
      assert.equal(readGiantXrPose(frame, reference, source), null);
    }
  }
  const { source } = fixture();
  assert.equal(readGiantXrPose({ getPose() { throw new Error("inactive frame"); } }, reference, source), null);
});

test("tracked pinch uses the fingertip midpoint even without a ray or grip", () => {
  const { source, poses, frame } = fixture(true);
  poses.delete(source.targetRaySpace); poses.delete(source.gripSpace);
  assert.deepEqual(readGiantXrPose(frame, reference, source), { kind: "hand", position: [0, 1.1, -.5], orientation: [0, 0, 0, 1], rayTracked: false });
  for (const name of ["index-finger-tip", "thumb-tip"]) {
    const joint = source.hand.get(name), original = poses.get(joint);
    poses.set(joint, pose([0, 1, 0], true));
    assert.equal(readGiantXrPose(frame, reference, source), null);
    poses.delete(joint);
    assert.equal(readGiantXrPose(frame, reference, source), null);
    poses.set(joint, original);
  }
});

test("physical world point preserves the controller offset, rig transform and local-only height", () => {
  const { source, frame } = fixture();
  const rig = new Group(); rig.position.set(2, 1.6, 3); rig.rotation.y = Math.PI / 2;
  const result = giantXrWorldPoint(readGiantXrPose(frame, reference, source), rig, [0, 0, -.085]);
  result.toArray().forEach((value, i) => near(value, [1.915, 2.6, 3][i]));
  const hand = fixture(true);
  const midpoint = giantXrWorldPoint(readGiantXrPose(hand.frame, reference, hand.source), rig, [0, 0, -.085]);
  midpoint.toArray().forEach((value, i) => near(value, [1.5, 2.7, 3][i]));
});

test("pending release needs a following fresh frame and the identical input source", () => {
  const source = {}, release = { source, index: 0, at: 100, frame: 12 };
  assert.equal(freshGiantXrRelease(release, source, 100, 12), false);
  assert.equal(freshGiantXrRelease(release, source, 116, 13), true);
  assert.equal(freshGiantXrRelease(release, source, 100 + GIANT_XR_FRESH_MS, 13), true);
  for (const now of [99, 151, NaN, Infinity]) assert.equal(freshGiantXrRelease(release, source, now, 13), false);
  assert.equal(freshGiantXrRelease(release, {}, 116, 13), false);
});

test("fresh stationary poses drop with zero impulse while emulation cancels history", () => {
  for (const emulate of [false, true]) {
    const { source, poses, frame } = fixture();
    const gesture = new BallsyThrowGesture(), rig = new Group();
    const point = () => {
      const pose = readGiantXrPose(frame, reference, source);
      return pose ? giantXrWorldPoint(pose, rig, [0, 0, -.085]).toArray() : null;
    };
    gesture.start(source, point(), 0); gesture.sample(source, point(), 30);
    const release = { source, index: 0, at: 40, frame: 2 };
    if (emulate) poses.set(source.gripSpace, pose([0, 1, 0], true));
    const finalPoint = point();
    if (!finalPoint || !freshGiantXrRelease(release, source, 60, 3)) gesture.cancel("tracking-lost");
    const thrown = gesture.release(source, finalPoint ?? [0, 0, 0], 60);
    if (emulate) assert.equal(thrown, null);
    else thrown.velocity.forEach(value => near(value, 0));
  }
});
