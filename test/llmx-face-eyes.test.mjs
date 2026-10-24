import assert from "node:assert/strict";
import { test } from "node:test";
import { EYE_LOOK, gazeRotateInto, irisContrast, irisTone, lidEdgeY, lidShade, pickCatchlight } from "../src/llmx-face-eyes.ts";

const R = 0.152;
const cube = 0.024;

test("the iris is brightest at the pupil and darkest at its rim: a limbal ring", () => {
  const atPupil = irisTone({ x: R * 0.32, y: 0, z: R * 0.9 }, R);
  const mid = irisTone({ x: R * 0.48, y: 0, z: R * 0.9 }, R);
  const rim = irisTone({ x: R * 0.65, y: 0, z: R * 0.9 }, R);
  assert.ok(atPupil > mid && mid > rim, `${atPupil.toFixed(2)} > ${mid.toFixed(2)} > ${rim.toFixed(2)}`);
  assert.ok(rim < 0.5, `the rim is a dark ring (${rim.toFixed(2)})`);
  assert.ok(atPupil > 1.1, `the inner iris is brighter than the flat tone (${atPupil.toFixed(2)})`);
});

test("a coarse iris keeps its flat tone", () => {
  assert.equal(irisTone({ x: R * 0.65, y: 0, z: R }, R, 0), 1);
  assert.equal(irisContrast(6), 0, "mobile: six cubes per eye");
  assert.ok(irisContrast(33) > 0.6, "balanced: most of the look");
  assert.equal(irisContrast(162), 1, "high: all of it");
});

test("the lid's edge follows the lid: raised by attention, lowered by a blink", () => {
  const rest = lidEdgeY(R, -0.08);
  const alert = lidEdgeY(R, -0.33);
  const closing = lidEdgeY(R, 0.8);
  assert.ok(alert > rest && rest > closing, `${alert.toFixed(3)} > ${rest.toFixed(3)} > ${closing.toFixed(3)}`);
  assert.ok(Math.abs(lidEdgeY(R, 0) - R * 0.38) < 1e-9, "at rest angle the edge is the sculpt's lid line");
});

test("the lid shadows the top of the iris and leaves its lower half alone", () => {
  const edge = lidEdgeY(R, -0.08);
  assert.ok(lidShade(edge - 0.2 * cube, edge, cube) < 0.4, "right under the lid: deep shadow");
  assert.equal(lidShade(edge - 4 * cube, edge, cube), 1, "well below the lid: none");
  assert.ok(1 - EYE_LOOK.lidShadow > 0.25, "never fully black: the iris still reads under the lid");
});

test("gaze rotation turns an eye-local point as the rig turns the eyeball", () => {
  const out = new Float32Array(3);
  gazeRotateInto(Float32Array.of(0, 0, R), Math.PI / 2, 0, out);
  assert.ok(Math.abs(out[0] - R) < 1e-6 && Math.abs(out[2]) < 1e-6, "yaw +90 degrees sends the front to +x");
  gazeRotateInto(Float32Array.of(0, 0, R), 0, 0.3, out);
  assert.ok(out[1] < 0, "positive pitch sends the front down, as the rig's convention");
});

function frontIris(perSide) {
  // A disc of iris cubes on the front of the eye, on a grid.
  const pts = [];
  for (let gx = -6; gx <= 6; gx += 1) for (let gy = -6; gy <= 6; gy += 1) {
    const x = gx * cube;
    const y = gy * cube;
    const off = Math.hypot(x, y) / R;
    if (off < 0.3 || off > 0.66) continue;
    pts.push(x, y, Math.sqrt(R * R - x * x - y * y));
  }
  return Float32Array.from(pts.slice(0, perSide * 3));
}

test("the catchlight sits toward the light, moves across the iris as the eye turns, and skips a closed eye", () => {
  const rest = frontIris(200);
  const n = rest.length / 3;
  const members = Uint32Array.from({ length: n }, (_, k) => k);
  const posed = new Float32Array(rest.length);
  gazeRotateInto(rest, 0, 0, posed);
  const open = lidEdgeY(R, -0.08);
  const k = pickCatchlight(posed, members, R, open, cube);
  assert.ok(k >= 0);
  assert.ok(posed[k * 3] < 0 && posed[k * 3 + 1] > 0, "upper left, where the light is");
  // A cube buried inside the solid eyeball is never chosen, even when it points more nearly at
  // the light than any surface cube: this one is the cube the first version picked in the dock,
  // 2.6 cm behind the front of the iris.
  const withBuried = Float32Array.from([...posed, -0.038, 0.043, 0.107]);
  const all = Uint32Array.from({ length: n + 1 }, (_, i) => i);
  assert.notEqual(pickCatchlight(withBuried, all, R, open, cube), n, "the glint is on the surface, not inside the eye");
  // Turn the eye toward the light: the glint moves onto a different cube, nearer the pupil.
  gazeRotateInto(rest, -0.3, -0.2, posed);
  const turned = pickCatchlight(posed, members, R, open, cube);
  assert.notEqual(turned, k, "the glint stays with the light, not with the eye");
  assert.equal(pickCatchlight(posed, members, R, lidEdgeY(R, 1.5), cube), -1, "no glint on a closed eye");
  assert.equal(pickCatchlight(posed, members.subarray(0, 6), R, open, cube), -1, "no glint on a six-cube iris");
});
