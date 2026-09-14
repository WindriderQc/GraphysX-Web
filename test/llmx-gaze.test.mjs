import { test } from "node:test";
import assert from "node:assert/strict";
import { PerspectiveCamera, Vector3 } from "three";
import { cameraGazePoint, gazeDriversToward, pointerGazePoint } from "../src/llmx-gaze.ts";

const face = [0, 3.2, 0];

function camera() {
  const cam = new PerspectiveCamera(50, 16 / 9, 0.1, 100);
  cam.position.set(1.4, 3.25, 7.4);
  cam.lookAt(new Vector3(0, 3.3, 0));
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
}

test("a pointer on the mask resolves to a point at the mask's depth and counts as over the face", () => {
  const cam = camera();
  // Project the face centre to find where it sits on screen, then point exactly there.
  const ndc = new Vector3(...face).project(cam);
  const focus = pointerGazePoint(cam, ndc.x, ndc.y, face, 1.2);
  assert.equal(focus.source, "pointer");
  assert.ok(focus.overFace, "pointing at the centre of the mask is over the face");
  // Halfway between camera and mask, on the line of sight to the mask's centre.
  const mid = [(1.4 + face[0]) / 2, (3.25 + face[1]) / 2, (7.4 + face[2]) / 2];
  assert.ok(Math.hypot(focus.point[0] - mid[0], focus.point[1] - mid[1], focus.point[2] - mid[2]) < 0.1);
});

test("a pointer beside the mask resolves beside it, at the same depth, and is not over the face", () => {
  const cam = camera();
  const ndc = new Vector3(face[0] + 3, face[1], face[2]).project(cam);
  const focus = pointerGazePoint(cam, ndc.x, ndc.y, face, 1.2);
  assert.ok(!focus.overFace);
  assert.ok(focus.point[0] > face[0] + 1.2, "the point is to the mask's right, where the pointer is");
  assert.ok(focus.point[2] > 2.5 && focus.point[2] < 5, "halfway to the visitor, not on the mask's plane");
});

test("gaze drivers point toward a local point and saturate at the rig's limit", () => {
  const limit = 0.34;
  const ahead = gazeDriversToward({ x: 0, y: 0.1, z: 5 }, 0.1, limit);
  assert.deepEqual(ahead, { gazeX: 0, gazeY: 0 });
  const right = gazeDriversToward({ x: 1.4, y: 0.1, z: 7.4 }, 0.1, limit);
  assert.ok(Math.abs(right.gazeX - 0.55) < 0.01, `camera-rest yaw is 0.55, got ${right.gazeX}`);
  const farRight = gazeDriversToward({ x: 50, y: 0.1, z: 1 }, 0.1, limit);
  assert.equal(farRight.gazeX, 1);
  const up = gazeDriversToward({ x: 0, y: 3, z: 1 }, 0.1, limit);
  assert.equal(up.gazeY, 1, "above the eyes is up: gazeY > 0 raises the gaze");
});

test("the camera focus is the camera's own position", () => {
  const cam = camera();
  const focus = cameraGazePoint(cam);
  assert.deepEqual(focus.point.map((v) => Number(v.toFixed(3))), [1.4, 3.25, 7.4]);
  assert.equal(focus.source, "camera");
});
