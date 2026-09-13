import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createForgeWorld,
  forgeCameraAt,
  forgeIntroAt,
  FORGE_INTRO,
  LLMX_FACE_ANCHOR_ID,
  LLMX_FORGE_TAG,
  LLMX_RIB_TAG,
} from "../src/llmx-forge.ts";

// The Forge is a document, so its invariants are checked as data. Loading it into the runtime
// (Three + Rapier) is a browser smoke; what a retune must not break is pinned here.

test("the template is a v2 document with unique ids and every entity tagged as template", () => {
  const { document } = createForgeWorld();
  assert.equal(document.schema, "graphysx.agent-world/v2");
  assert.equal(document.id, "llmx-nocturnal-forge");
  const ids = document.entities.map((entity) => entity.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate entity id");
  for (const entity of document.entities) {
    assert.ok(entity.id && entity.type, `entity without id/type: ${JSON.stringify(entity)}`);
    assert.ok(entity.tags?.includes(LLMX_FORGE_TAG), `${entity.id} is not tagged ${LLMX_FORGE_TAG}`);
  }
  // A personal copy takes its own id and label without touching the entities.
  const copy = createForgeWorld({ id: "llmx-yanik-1", label: "Ma forge" });
  assert.equal(copy.document.id, "llmx-yanik-1");
  assert.equal(copy.document.label, "Ma forge");
  assert.deepEqual(copy.document.entities, document.entities);
});

test("budgets: one floor collider, one shadow-casting light, particles under the rest budget", () => {
  const { document } = createForgeWorld();
  const withPhysics = document.entities.filter((entity) => entity.physics);
  // The plate is the floor collider; the socket is the only other body, so a created object
  // dropped on it lands rather than passing through.
  assert.deepEqual(withPhysics.map((entity) => entity.id).sort(), ["forge-plate", "forge-socket"]);
  assert.ok(withPhysics.every((entity) => entity.physics.mode === "static"));

  const shadowLights = document.entities.filter((entity) => entity.type.endsWith("-light") && entity.castShadow);
  assert.deepEqual(shadowLights.map((entity) => entity.id), ["forge-key"]);

  const emitters = document.entities.filter((entity) => entity.type === "emitter");
  const restBudget = emitters.reduce((sum, entity) => sum + entity.emitter.maxParticles, 0);
  assert.ok(emitters.length >= 2, "the Forge is meant to breathe: smoke and sparks at least");
  assert.ok(restBudget <= 600, `rest particle budget ${restBudget} exceeds 600`);
  assert.ok(emitters.every((entity) => entity.emitter.maxParticles <= 600));

  // Silhouettes are scenery in the fog: they must not join the shadow pass.
  const silhouettes = document.entities.filter((entity) => entity.tags.includes("silhouette"));
  assert.ok(silhouettes.length >= 8);
  assert.ok(silhouettes.every((entity) => entity.castShadow === false && !entity.physics));

  // Point lights are lights, not lightbulbs: no marker spheres in a composed scene.
  const points = document.entities.filter((entity) => entity.type === "point-light");
  assert.ok(points.length >= 2);
  assert.ok(points.every((entity) => entity.marker === false));
});

test("the floor is a plateau of tiles around one apron, all under the plateau's edge", () => {
  const { document } = createForgeWorld();
  const tiles = document.entities.filter((entity) => entity.tags.includes("tile"));
  // 10 × 10 minus the four centre tiles replaced by the apron.
  assert.equal(tiles.length, 96);
  for (const tile of tiles) {
    const [x, , z] = tile.transform.position;
    assert.ok(Math.abs(x) + tile.geometry.width / 2 <= 16.01, `${tile.id} overhangs in x`);
    assert.ok(Math.abs(z) + tile.geometry.depth / 2 <= 16.01, `${tile.id} overhangs in z`);
    assert.ok(!tile.physics, `${tile.id} carries a needless collider`);
  }
  assert.ok(document.entities.some((entity) => entity.id === "forge-apron"));
});

test("anchors agree with the document: the face hangs above the socket, the camera looks at it", () => {
  const { document, anchors } = createForgeWorld();
  const anchor = document.entities.find((entity) => entity.id === LLMX_FACE_ANCHOR_ID);
  assert.ok(anchor, "face anchor entity missing");
  assert.equal(anchor.type, "group");
  assert.deepEqual(anchor.transform.position, anchors.faceCenter);

  const socketTopY = anchors.socketTop[1];
  const maskBottom = anchors.faceCenter[1] - anchors.faceHeight / 2;
  assert.ok(maskBottom > socketTopY + 0.5, `mask bottom ${maskBottom} is not clearly above the socket top ${socketTopY}`);

  // Both camera poses aim at the socket column, and the rest pose looks at the mask's height.
  for (const pose of [anchors.cameraRest, anchors.cameraEntry]) {
    assert.ok(Math.abs(pose.target[0]) < 0.01 && Math.abs(pose.target[2]) < 0.01);
    assert.ok(pose.position[2] > 0, "the visitor arrives from +Z");
  }
  assert.deepEqual(anchors.cameraRest.target, anchors.gazeTarget);
  assert.ok(anchors.gazeTarget[1] > anchors.faceCenter[1], "the gaze target is the eyes, above the origin");
  const restDistance = Math.hypot(...anchors.cameraRest.position.map((value, index) => value - anchors.cameraRest.target[index]));
  assert.ok(restDistance > 5 && restDistance < 10, `rest distance ${restDistance} is outside the readable band`);

  // The ribs the presentation layer lights are the ribs in the document, and they start at the socket.
  const ribs = document.entities.filter((entity) => entity.tags.includes(LLMX_RIB_TAG));
  assert.equal(ribs.length, anchors.ribs.length);
  for (const run of anchors.ribs) {
    assert.ok(Math.hypot(run.from[0], run.from[2]) < 2.2, "rib does not start at the socket");
    assert.ok(Math.hypot(run.to[0], run.to[2]) > 10, "rib is too short to read as a circuit");
  }

  // The build zone is inside the plateau and out of the socket.
  const zone = anchors.buildZone;
  assert.ok(Math.hypot(zone.center[0], zone.center[2]) > 2.5 + zone.radius * 0.5);
  assert.ok(Math.abs(zone.center[0]) + zone.radius < 16 && Math.abs(zone.center[2]) + zone.radius < 16);
});

test("the intro timeline is monotonic, bounded, ordered, and compresses under reduced motion", () => {
  let previous = forgeIntroAt(-1);
  assert.deepEqual(previous, { circuit: 0, approach: 0, assembly: 0, wake: 0, done: false });
  for (let t = 0; t <= FORGE_INTRO.seconds + 1; t += 0.05) {
    const frame = forgeIntroAt(t);
    for (const key of ["circuit", "approach", "assembly", "wake"]) {
      assert.ok(frame[key] >= 0 && frame[key] <= 1, `${key} out of bounds at ${t}`);
      assert.ok(frame[key] >= previous[key] - 1e-12, `${key} went backwards at ${t}`);
    }
    previous = frame;
  }
  assert.equal(previous.done, true);
  // Ordering the choreography promises: the circuit is lit before the mask starts building,
  // and the mask is complete before the eyes open.
  assert.ok(FORGE_INTRO.circuit.end <= FORGE_INTRO.assembly.start);
  assert.ok(FORGE_INTRO.assembly.end <= FORGE_INTRO.wake.start);
  // Non-finite time is the start, not a crash or a jump to the end.
  assert.deepEqual(forgeIntroAt(Number.NaN), forgeIntroAt(-1));

  // Reduced motion compresses the whole timeline into `reducedSeconds`; the full timeline is not
  // done at that time.
  assert.equal(forgeIntroAt(FORGE_INTRO.reducedSeconds).done, false);
  assert.equal(forgeIntroAt(FORGE_INTRO.reducedSeconds, true).done, true);
  assert.equal(forgeIntroAt(FORGE_INTRO.reducedSeconds * 0.5, true).done, false);
  assert.equal(forgeIntroAt(FORGE_INTRO.reducedSeconds, true).done, true);
});

test("the camera path starts at entry, ends at rest and never leaves the segment", () => {
  const { anchors } = createForgeWorld();
  assert.deepEqual(forgeCameraAt(anchors, 0), { position: anchors.cameraEntry.position, target: anchors.cameraEntry.target });
  assert.deepEqual(forgeCameraAt(anchors, 1), { position: anchors.cameraRest.position, target: anchors.cameraRest.target });
  const mid = forgeCameraAt(anchors, 0.5);
  for (let axis = 0; axis < 3; axis += 1) {
    const lo = Math.min(anchors.cameraEntry.position[axis], anchors.cameraRest.position[axis]);
    const hi = Math.max(anchors.cameraEntry.position[axis], anchors.cameraRest.position[axis]);
    assert.ok(mid.position[axis] >= lo - 1e-9 && mid.position[axis] <= hi + 1e-9);
  }
  // Out-of-range samples clamp instead of overshooting past the rest pose.
  assert.deepEqual(forgeCameraAt(anchors, 2), forgeCameraAt(anchors, 1));
});
