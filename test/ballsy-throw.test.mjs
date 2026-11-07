import { test } from "node:test";
import assert from "node:assert/strict";
import { importBrowserModule } from "./support/import-browser-module.mjs";

const { BallsyThrowGesture, canGrabBallsyBalloon, ballsyThrowInSpace, BALLSY_THROW_LIMITS } = await importBrowserModule(new URL("../src/ballsy-throw.ts", import.meta.url));
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test("a visible balloon must be within physical reach; no ray or autoaim grabs it", () => {
  assert.equal(canGrabBallsyBalloon([0, 1, 0], [0.1, 1, 0]), true);
  assert.equal(canGrabBallsyBalloon([0, 1, 0], [0.2, 1, 0]), false);
  assert.equal(canGrabBallsyBalloon([NaN, 1, 0], [0, 1, 0]), false);
});

test("synthetic timed hand poses produce the measured velocity and exactly one release", () => {
  const gesture = new BallsyThrowGesture();
  assert.equal(gesture.start("right", [0, 1, 0], 1000), true);
  for (let i = 1; i < 6; i++) gesture.sample("right", [0.02 * i, 1 + 0.01 * i, -0.04 * i], 1000 + i * 20);
  const thrown = gesture.release("right", [0.12, 1.06, -0.24], 1120);
  thrown.velocity.forEach((value, axis) => near(value, [1, 0.5, -2][axis]));
  assert.deepEqual(thrown.position, [0.12, 1.06, -0.24]);
  assert.equal(gesture.release("right", [0.12, 1.06, -0.24], 1140), null);
});

test("stationary release has no invented velocity or forward/upward boost", () => {
  const gesture = new BallsyThrowGesture();
  gesture.start("mouse", [2, 1, 3], 0);
  gesture.sample("mouse", [2, 1, 3], 40);
  const thrown = gesture.release("mouse", [2, 1, 3], 80);
  thrown.velocity.forEach(value => near(value, 0));
});

test("release speed is capped without changing direction", () => {
  const gesture = new BallsyThrowGesture();
  gesture.start("right", [0, 0, 0], 0);
  gesture.sample("right", [0.2, 0.2, 0], 20);
  const thrown = gesture.release("right", [0.4, 0.4, 0], 40);
  near(Math.hypot(...thrown.velocity), BALLSY_THROW_LIMITS.maximumSpeed);
  near(thrown.velocity[0], thrown.velocity[1]);
});

test("paused, hidden, disconnected, recentered and exited sessions cancel rather than release", () => {
  for (const reason of ["paused", "hidden", "disconnected", "recenter", "session-end", "pointercancel", "round-change"]) {
    const gesture = new BallsyThrowGesture();
    gesture.start("right", [0, 0, 0], 0); gesture.sample("right", [0.1, 0, 0], 40);
    gesture.cancel(reason);
    assert.equal(gesture.release("right", [0.2, 0, 0], 60), null);
    assert.equal(gesture.state().reason, reason);
  }
});

test("tracking gap, jump, invalid or reversed time cancels with no inherited momentum", () => {
  for (const [point, time] of [[[0.1, 0, 0], 100], [[4, 0, 0], 20], [[NaN, 0, 0], 20], [[0, 0, 0], -1]]) {
    const gesture = new BallsyThrowGesture();
    gesture.start("right", [0, 0, 0], 0);
    assert.equal(gesture.sample("right", point, time), false);
    assert.equal(gesture.release("right", [0.2, 0, 0], 120), null);
    assert.equal(gesture.state().held, false);
  }
});

test("other hands cannot steal or release a held balloon; an instant click is not a throw", () => {
  const gesture = new BallsyThrowGesture();
  gesture.start("right", [0, 0, 0], 0);
  assert.equal(gesture.start("left", [0, 0, 0], 20), false);
  assert.equal(gesture.release("left", [1, 0, 0], 30), null);
  assert.equal(gesture.isHeldBy("right"), true);
  assert.equal(gesture.release("right", [0, 0, 0], 10), null);
});

test("only recent movement contributes, a held still hand loses prior momentum", () => {
  const gesture = new BallsyThrowGesture();
  gesture.start("right", [0, 0, 0], 0);
  gesture.sample("right", [0.15, 0, 0], 30);
  for (let time = 60; time <= 240; time += 30) gesture.sample("right", [0.15, 0, 0], time);
  const thrown = gesture.release("right", [0.15, 0, 0], 250);
  thrown.velocity.forEach(value => near(value, 0));
});

test("a recentered, rotated 0.045 table converts real velocity without normalizing or boosting it", () => {
  // Inverse a 90 degree Y turn, the tabletop translation, and the physical miniature scale.
  const inverse = ([x, y, z]) => [(1 - z) / 0.045, (y - 0.82) / 0.045, (x - 2) / 0.045];
  const thrown = ballsyThrowInSpace({ position: [2, 1.08, 1], velocity: [0.45, 0.9, 0] }, inverse);
  thrown.position.forEach((value, axis) => near(value, [0, 0.26 / 0.045, 0][axis]));
  thrown.velocity.forEach((value, axis) => near(value, [0, 20, 10][axis]));
  const still = ballsyThrowInSpace({ position: [2, 1.08, 1], velocity: [0, 0, 0] }, inverse);
  assert.deepEqual(still.velocity, [0, 0, 0]);
});

test("two different positions with one timestamp cannot invent a release pose", () => {
  const gesture = new BallsyThrowGesture();
  gesture.start("right", [0, 0, 0], 0); gesture.sample("right", [0.1, 0, 0], 40);
  assert.equal(gesture.release("right", [1, 0, 0], 40), null);
  assert.equal(gesture.state().reason, "invalid-timestamp");
});
