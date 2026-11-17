import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import { importBrowserModule } from "./support/import-browser-module.mjs";
const { buildCubzMenu, cubzSequenceCommands, cubzSourceTrack } = await importBrowserModule(new URL("../src/cubz-menu-scene.ts", import.meta.url));
const { sampleKeyframeTrack } = await importBrowserModule(new URL("../src/agent-world-motion.ts", import.meta.url));
const data = JSON.parse(readFileSync(new URL("../public/assets/ports/archive-cubz-menu.json", import.meta.url)));
const reflection = new Matrix4().makeScale(1, 1, -1);

function poseMatrices(document, commands, elapsed) {
  const animated = new Map(commands.filter(command => command.op === "attach-behavior").map(command => [command.id, command.behavior]));
  const matrices = new Map();
  for (const entity of document.entities) {
    const p = new Vector3(...(entity.transform?.position ?? [0, 0, 0]));
    const q = new Quaternion().setFromEuler(new Euler(...(entity.transform?.rotationDegrees ?? [0, 0, 0]).map(value => value * Math.PI / 180)));
    const options = { scale: new Vector3(...(entity.transform?.scale ?? [1, 1, 1])), visible: entity.visible ?? true };
    if (animated.has(entity.id)) sampleKeyframeTrack(animated.get(entity.id), elapsed, p, q, options);
    const local = new Matrix4().compose(p, q, options.scale);
    matrices.set(entity.id, entity.parentId ? matrices.get(entity.parentId).clone().multiply(local) : local);
  }
  return matrices;
}

test("TVA animation starts on its independent authored bind matrices, including all cylinder and panel axes", () => {
  const document = buildCubzMenu(data), base = poseMatrices(document, [], 0);
  let maximumError = 0;
  for (const [id, actor] of Object.entries(data.actors)) {
    const commands = actor.tracks.map(track => ({ op: "attach-behavior", id: `cubz-${id}-n${track.nodeId}`,
      behavior: cubzSourceTrack(actor, track, id === "rotation" ? 1 : 0, 0, 0, false, 30) }));
    const matrices = poseMatrices(document, commands, 0);
    for (const node of actor.nodes) {
      const expected = base.get(`cubz-${id}-rig`).clone().multiply(reflection).multiply(new Matrix4().fromArray(node.worldMatrix)).multiply(reflection);
      const actual = matrices.get(`cubz-${id}-n${node.id}`);
      const error = Math.max(...expected.elements.map((value, index) => Math.abs(value - actual.elements[index])));
      maximumError = Math.max(maximumError, error);
      assert.ok(error < 1e-5, `${id}/${node.name || node.id}: animation must not jump from its bind matrix; error ${error}`);
    }
  }
  assert.ok(maximumError < 1e-5);
});

test("all source connectors and closed blocks remain one rigid assembly throughout every rotation", () => {
  const document = buildCubzMenu(data);
  const actor = data.actors.rotation;
  const objects = actor.nodes.filter(node => /^Box0[1-8]$|^Cylindre\d+$/.test(node.name));
  const base = poseMatrices(document, [], 0);
  const points = matrices => objects.flatMap(node => [new Vector3(0, 0, 0), new Vector3(0, /^Cylindre/.test(node.name) ? 50 : 22.5, 0)].map(point => point.applyMatrix4(matrices.get(`cubz-rotation-n${node.id}`))));
  const reference = points(base);
  for (let choice = 1; choice <= 7; choice++) {
    const commands = cubzSequenceCommands(data, document, "open", choice, 0);
    for (let frame = 0; frame <= 28; frame++) {
      const current = points(poseMatrices(document, commands, frame / 30));
      const pivot = new Vector3().setFromMatrixPosition(poseMatrices(document, commands, frame / 30).get("cubz-rotation-n1"));
      assert.ok(pivot.distanceTo(new Vector3().setFromMatrixPosition(base.get("cubz-rotation-n1"))) < 1e-5,
        "the complete assembly rotates around the original fixed central pivot");
      // Distances to every other endpoint catch a cylinder sliding/flipping away while
      // its centre alone still happens to lie on the right location.
      for (let i = 0; i < current.length; i++) for (let j = 0; j < i; j++) {
        assert.ok(Math.abs(current[i].distanceTo(current[j]) - reference[i].distanceTo(reference[j])) < 1e-5,
          `choice ${choice}, frame ${frame}, endpoint pair ${i}/${j} must remain connected`);
      }
    }
  }
});

test("the selected block reaches the front slot and the three petals open outward with fixed hinges", () => {
  const document = buildCubzMenu(data), base = poseMatrices(document, [], 0);
  const actor = data.actors.open;
  const petals = actor.tracks.filter(track => track.rotations.length > 1).map(track => actor.nodes[track.nodeId]);
  assert.deepEqual(petals.map(node => node.name).sort(), ["Left08", "Right08", "Top08"]);
  const core = new Vector3(0, 22.5, 0).applyMatrix4(base.get("cubz-open-n33"));
  const frontSlot = new Vector3(0, 22.5, 0).applyMatrix4(base.get("cubz-rotation-n2"));
  assert.ok(core.distanceTo(frontSlot) < 1e-5, "the opening actor occupies the front slot of the idle assembly");
  for (let choice = 1; choice <= 7; choice++) {
    const commands = cubzSequenceCommands(data, document, "open", choice, 0);
    const end = poseMatrices(document, commands, 28 / 30);
    const node = data.actors.rotation.nodes.find(node => node.name === `Box0${choice + 1}`);
    const selected = new Vector3(0, 22.5, 0).applyMatrix4(end.get(`cubz-rotation-n${node.id}`));
    // The stored ranges stop up to 3.60 native units before their cardinal pose.
    // This bound records that source residue; it does not permit another cube slot.
    assert.ok(selected.distanceTo(frontSlot) < 0.15, `selection ${choice + 1} arrives at the front slot`);
  }
  const commands = cubzSequenceCommands(data, document, "open", 0, 0);
  const fixed = actor.nodes.filter(node => /^Box0[1-8]$|^Cylindre\d+$/.test(node.name));
  for (let frame = 0; frame <= 50; frame++) {
    const matrices = poseMatrices(document, commands, frame / 30);
    for (const node of fixed) {
      const before = base.get(`cubz-open-n${node.id}`), after = matrices.get(`cubz-open-n${node.id}`);
      assert.ok(Math.max(...before.elements.map((value, index) => Math.abs(value - after.elements[index]))) < 1e-5,
        `${node.name} cannot move while only its petals are opening`);
    }
    for (const node of petals) {
      const pivot = new Vector3().setFromMatrixPosition(matrices.get(`cubz-open-n${node.id}`));
      assert.ok(pivot.distanceTo(new Vector3().setFromMatrixPosition(base.get(`cubz-open-n${node.id}`))) < 1e-5, `${node.name} keeps its hinge attached`);
      const mesh = actor.meshes.find(mesh => actor.nodes[mesh.nodeId].parent === node.id);
      const minimum = [Infinity, Infinity, Infinity], maximum = [-Infinity, -Infinity, -Infinity];
      mesh.positions.forEach((value, index) => { minimum[index % 3] = Math.min(minimum[index % 3], value); maximum[index % 3] = Math.max(maximum[index % 3], value); });
      const local = new Vector3(...minimum.map((value, index) => (value + maximum[index]) / 2));
      const closed = local.clone().applyMatrix4(base.get(`cubz-open-n${mesh.nodeId}`));
      const opened = local.clone().applyMatrix4(matrices.get(`cubz-open-n${mesh.nodeId}`));
      const outward = closed.clone().sub(core).normalize();
      assert.ok(opened.clone().sub(closed).dot(outward) >= -1e-5, `${node.name} opens outward, never through the block`);
      if (frame === 50) assert.ok(opened.clone().sub(closed).dot(outward) > 0.4, `${node.name} unfolds as an external petal`);
    }
  }
});
