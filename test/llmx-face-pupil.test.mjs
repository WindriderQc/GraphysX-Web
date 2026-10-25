import assert from "node:assert/strict";
import { test } from "node:test";
import { importBrowserModule } from "./support/import-browser-module.mjs";

const { AgentWorldVoxelFace, resolveAgentWorldFace } = await importBrowserModule(new URL("../src/agent-world-face.ts", import.meta.url));
const { inPupil, pickCatchlight, pupilAxis, pupilRadius, pupilSeenAt, PUPIL_EDGE } = await importBrowserModule(new URL("../src/llmx-face-eyes.ts", import.meta.url));
const { Matrix4, Vector3, Quaternion, Color } = await import("three");

function boxes(mesh) {
  const m = new Matrix4();
  const p = new Vector3();
  const q = new Quaternion();
  const s = new Vector3();
  const c = new Color();
  const half = mesh.geometry.parameters.width / 2;
  const out = [];
  for (let k = 0; k < mesh.count; k += 1) {
    mesh.getMatrixAt(k, m);
    m.decompose(p, q, s);
    let luminance = 1;
    if (mesh.instanceColor) {
      mesh.getColorAt(k, c);
      luminance = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    }
    out.push({ x: p.x, y: p.y, z: p.z, h: half * s.x, luminance, mesh: mesh.name });
  }
  return out;
}

/**
 * What a viewer straight in front sees of the right eye's pupil, sampled at an eighth of a cube:
 * at each point, the frontmost cube of the assembled rig decides. A dark eyeball cube is pupil
 * (how the pupil used to be drawn); an iris cube is pupil where the iris shader's disc covers
 * it (`pupilSeenAt` and `inPupil` are its JS twin, fed the material's live uniforms, for a
 * viewer far in front); anything else is not.
 * Returns the outline's radius in 72 directions from the dark region's centroid.
 */
function pupilOutline(face) {
  const meshes = Object.fromEntries(face.object.children.filter((c) => c.isInstancedMesh && c.visible).map((c) => [c.name, c]));
  const { eye } = face.weights.anchors;
  const cube = face.weights.level.cube;
  const all = ["VoxelFaceIris", "VoxelFaceEyeball", "VoxelFaceAnimated", "VoxelFaceStatic", "VoxelFaceLiner", "VoxelFaceMaw"]
    .filter((name) => meshes[name])
    .flatMap((name) => boxes(meshes[name]))
    .filter((b) => Math.abs(b.x - eye.x) < eye.radius && Math.abs(b.y - eye.y) < eye.radius);
  // The eyeball's ordinary cubes are a dark metal (shade 0.42); the old pupil cubes were 0.06 of it.
  const ball = all.filter((b) => b.mesh === "VoxelFaceEyeball").map((b) => b.luminance).sort((a, b) => a - b);
  const pupilDark = ball[Math.floor(ball.length * 0.9)] * 0.3;
  const uniforms = meshes.VoxelFaceIris.material.userData.gxPupilUniforms;
  const axis = uniforms ? [uniforms.gxPupilAxis.value.x, uniforms.gxPupilAxis.value.y, uniforms.gxPupilAxis.value.z] : null;
  const step = Math.min(cube / 8, eye.radius / 60);
  const reach = eye.radius * 0.75;
  const n = Math.ceil((2 * reach) / step);
  const dark = new Uint8Array(n * n);
  let sx = 0;
  let sy = 0;
  let count = 0;
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const x = eye.x - reach + (i + 0.5) * step;
      const y = eye.y - reach + (j + 0.5) * step;
      let front = null;
      for (const b of all) {
        if (Math.abs(b.x - x) < b.h && Math.abs(b.y - y) < b.h && (!front || b.z + b.h > front.z + front.h)) front = b;
      }
      if (!front) continue;
      let isDark = false;
      if (front.mesh === "VoxelFaceEyeball") isDark = front.luminance < pupilDark;
      if (front.mesh === "VoxelFaceIris" && axis) {
        const seen = pupilSeenAt([x - eye.x, y - eye.y, 50], [x - eye.x, y - eye.y, front.z + front.h - eye.z], eye.radius);
        isDark = seen !== null && inPupil(seen[0], seen[1], seen[2], axis, uniforms.gxPupilRadius.value, eye.radius);
      }
      if (!isDark) continue;
      dark[j * n + i] = 1;
      sx += i;
      sy += j;
      count += 1;
    }
  }
  assert.ok(count > 0, "the eye has a pupil");
  if (process.env.PUPIL_MAP) for (let j = n - 1; j >= 0; j -= 2) console.log(Array.from({ length: n }, (_, i) => (dark[j * n + i] ? "#" : ".")).join(""));
  const cx = sx / count;
  const cy = sy / count;
  const radii = [];
  for (let a = 0; a < 72; a += 1) {
    const t = (a / 72) * Math.PI * 2;
    let r = 0;
    for (;;) {
      const i = Math.round(cx + Math.cos(t) * (r + 0.5));
      const j = Math.round(cy + Math.sin(t) * (r + 0.5));
      if (i < 0 || j < 0 || i >= n || j >= n || !dark[j * n + i]) break;
      r += 0.5;
    }
    radii.push(r * step);
  }
  const mean = radii.reduce((p, q) => p + q, 0) / radii.length;
  return {
    mean,
    roundness: Math.min(...radii) / Math.max(...radii),
    offset: Math.hypot(eye.x - reach + (cx + 0.5) * step - eye.x, eye.y - reach + (cy + 0.5) * step - eye.y),
  };
}

for (const level of ["high", "balanced", "mobile"]) {
  test(`${level}: the pupil reads as a round disc centred on the eye`, () => {
    const face = new AgentWorldVoxelFace(resolveAgentWorldFace({ level }));
    try {
      face.snapDrivers({ build: 1, blink: 0, gazeX: 0, gazeY: 0, attention: 0.25, think: 0, warmth: 0, speak: 0 });
      face.update(0);
      const { eye } = face.weights.anchors;
      const outline = pupilOutline(face);
      // A square's inscribed-to-circumscribed ratio is 0.71; the cube-made pupil was a square, a
      // cross or a little house depending on how the grid fell across the eye.
      assert.ok(outline.roundness > 0.85, `${level}: outline min/max radius ${outline.roundness.toFixed(2)}`);
      assert.ok(outline.offset < eye.radius * 0.06, `${level}: centred within ${(outline.offset * 100).toFixed(2)} cm`);
      assert.ok(Math.abs(outline.mean - PUPIL_EDGE * eye.radius * 0.975) < face.weights.level.cube * 0.25, `${level}: radius ${(outline.mean * 100).toFixed(2)} cm`);
    } finally {
      face.dispose();
    }
  });
}

test("the pupil dilates with attention and narrows with thought, as a radius", () => {
  const face = new AgentWorldVoxelFace(resolveAgentWorldFace({ level: "high" }));
  try {
    const radiusFor = (drivers) => {
      face.snapDrivers({ build: 1, blink: 0, gazeX: 0, gazeY: 0, attention: 0, think: 0, warmth: 0, speak: 0, ...drivers });
      face.update(0);
      return face.object.children.find((c) => c.name === "VoxelFaceIris").material.userData.gxPupilUniforms.gxPupilRadius.value;
    };
    const rest = radiusFor({});
    assert.ok(radiusFor({ attention: 1 }) > rest * 1.3);
    assert.ok(radiusFor({ think: 1 }) < rest * 0.9);
    // Pupil cubes are drawn by the disc now; none is left in the dark eyeball mesh.
    const ball = face.object.children.find((c) => c.name === "VoxelFaceEyeball");
    const shades = boxes(ball).map((b) => b.luminance).sort((a, b) => a - b);
    const dark = shades.filter((v) => v < shades[Math.floor(shades.length * 0.9)] * 0.3).length;
    assert.equal(dark, 0, "no cube-made pupil left in the eyeball");
  } finally {
    face.dispose();
  }
});

test("the gaze axis turns the way the rig turns the eye, and the disc is a cylinder about it", () => {
  assert.deepEqual(pupilAxis(0, 0).map((v) => +v.toFixed(6)), [0, 0, 1]);
  assert.ok(pupilAxis(0.3, 0)[0] > 0.29, "a positive yaw turns the eye toward +x");
  assert.ok(pupilAxis(0, 0.3)[1] < -0.29, "a positive pitch sends the front of the eye down");
  const axis = pupilAxis(0, 0);
  const r = pupilRadius(0.15, 1);
  assert.equal(r, 0.15 * PUPIL_EDGE);
  assert.equal(inPupil(r * 0.9, 0, 0.15, axis, r, 0.15), true);
  assert.equal(inPupil(r * 1.1, 0, 0.15, axis, r, 0.15), false);
  assert.equal(inPupil(0, 0, -0.15, axis, r, 0.15), false, "only the front of the eye");
  // A ray from far in front lands on the sphere's front, whatever depth the cube face it crosses.
  const hit = pupilSeenAt([0.01, 0.02, 10], [0.01, 0.02, 0.2], 0.15);
  assert.ok(Math.abs(Math.hypot(...hit) - 0.15) < 1e-9 && hit[2] > 0);
  assert.equal(pupilSeenAt([0.2, 0, 10], [0.2, 0, 0], 0.15), null, "a ray past the eyeball misses it");
});

test("the catchlight is never picked on the pupil disc", () => {
  // Iris cubes on the front of the eye: one toward the light but reaching into the disc, one clear
  // of it on the far side, one clear of it on the light's side.
  const radius = 0.15;
  const cube = 0.024;
  const front = (x, y) => [x, y, Math.sqrt(radius * radius - x * x - y * y)];
  const posed = Float32Array.from([...front(-0.0314, 0.0389), ...front(0.0503, -0.0623)]);
  const members = Array.from({ length: 30 }, (_, k) => k % 2);
  const axis = pupilAxis(0, 0);
  assert.equal(members[pickCatchlight(posed, members, radius, radius, cube)], 0);
  // The light is up and to the left: a cube clear of the disc on the right gets no glint.
  const both = Float32Array.from([...front(-0.0314, 0.0389), ...front(0.0503, -0.0623), ...front(-0.06, 0.07)]);
  const three = Array.from({ length: 30 }, (_, k) => k % 3);
  assert.equal(members[pickCatchlight(posed, members, radius, radius, cube, { axis, radius: pupilRadius(radius, 1) })], undefined, "no glint on the far side");
  assert.equal(three[pickCatchlight(both, three, radius, radius, cube, { axis, radius: pupilRadius(radius, 1) })], 2, "the light's side, clear of the disc");
});
