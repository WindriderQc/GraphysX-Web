import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import { importBrowserModule } from "./support/import-browser-module.mjs";
import { productAssetManifest } from "../scripts/product-assets.mjs";
const { buildCubxAtmel, atmelSequence, atmelState, atmelStudioPose, atmelClock, updateAtmelClock, ATMEL_MACHINE } = await importBrowserModule(new URL("../src/cubx-atmel-scene.ts", import.meta.url));
const { sampleKeyframeTrack } = await importBrowserModule(new URL("../src/agent-world-motion.ts", import.meta.url));
const data = JSON.parse(readFileSync(new URL("../public/assets/ports/archive-cubx-atmel.json", import.meta.url)));
const reflection = new Matrix4().makeScale(1, 1, -1);
function commandsOn(document, commands) {
  const copy = structuredClone(document);
  for (const command of commands) {
    const e = copy.entities.find(e => e.id === command.id);
    if (command.op === "update") Object.assign(e, command.patch);
    if (command.op === "detach-behavior") e.behaviors = e.behaviors?.filter(b => b.id !== command.behaviorId);
    if (command.op === "attach-behavior") (e.behaviors ??= []).push(command.behavior);
  }
  return copy;
}
function poses(document, elapsed) {
  const result = new Map();
  for (const e of document.entities) {
    const p = new Vector3(...(e.transform?.position ?? [0, 0, 0]));
    const q = new Quaternion().setFromEuler(new Euler(...(e.transform?.rotationDegrees ?? [0, 0, 0]).map(v => v * Math.PI / 180)));
    const options = { scale: new Vector3(...(e.transform?.scale ?? [1, 1, 1])), visible: e.visible ?? true };
    for (const behavior of e.behaviors ?? []) if (behavior.type === "keyframes") sampleKeyframeTrack(behavior, elapsed, p, q, options);
    const local = new Matrix4().compose(p, q, options.scale), parent = result.get(e.parentId);
    result.set(e.id, { matrix: parent ? parent.matrix.clone().multiply(local) : local, visible: options.visible && (parent?.visible ?? true) });
  }
  return result;
}
const matrixError = (a, b) => Math.max(...a.elements.map((v, i) => Math.abs(v - b.elements[i])));
function endpoints(actor, id, pose) {
  return actor.meshes.flatMap(mesh => {
    const min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < mesh.positions.length; i += 3) { const v = new Vector3(mesh.positions[i], mesh.positions[i + 1], -mesh.positions[i + 2]); min.min(v); max.max(v); }
    return [min, max].map(v => v.applyMatrix4(pose.get(`atmel-${id}-n${mesh.nodeId}`).matrix));
  });
}

test("Atmel recovery ships independently pinned actors, native click meshes, source-origin models and terrain", async () => {
  const pins = JSON.parse(readFileSync(new URL("../src/content/cubx-atmel-sources.json", import.meta.url)));
  assert.deepEqual(data.sourcePins, pins.records); assert.equal(pins.records.length, 54);
  assert.equal(Object.keys(data.actors).length, 8); assert.equal(Object.keys(data.studies).length, 8); assert.equal(data.clicks.length, 8);
  for (const [id, actor] of Object.entries(data.actors)) {
    assert.equal(actor.meshes.length, 23); assert.equal(actor.ranges[0].end, 100);
    assert.equal(actor.sha256, pins.records.find(pin => pin.source === actor.source).sha256, id);
  }
  assert.equal(data.models.domotics.vertexCount, 14422); assert.equal(data.models.domotics.triangleCount, 28524);
  assert.equal(data.models.closed.vertexCount, 2264); assert.equal(data.models.closed.triangleCount, 2750);
  assert.equal(data.terrain.heights.length, 65 ** 2); assert.ok(data.terrain.heights.every(h => h >= 0 && h <= 1));
  const shipped = new Set((await productAssetManifest()).files);
  assert.ok(shipped.has("/assets/ports/archive-cubx-atmel.json"));
  for (const descriptor of Object.values(data.models)) {
    const model = JSON.parse(readFileSync(new URL("../public" + descriptor.url, import.meta.url)));
    assert.equal(model.bounds, undefined, "independent fitting must not destroy native origins");
    assert.equal(model.provenance.sourceSha256, descriptor.sourceSha256); assert.ok(shipped.has(descriptor.url));
    for (const mesh of model.meshes) for (const material of mesh.materials) if (material.textureUrl) assert.ok(shipped.has(material.textureUrl));
  }
});

test("every Atmel first key agrees with independent bind matrices, including passive cylinder quaternions", () => {
  const document = buildCubxAtmel(data), base = poses(document, 0);
  for (const [id, actor] of Object.entries(data.actors)) {
    const choice = id === "open" ? 1 : Number(id.slice(3));
    const posed = poses(commandsOn(document, atmelSequence(data, document, "open", choice, 0)), 0);
    for (const node of actor.nodes) {
      const expected = base.get(`atmel-rig-${id}`).matrix.clone().multiply(reflection).multiply(new Matrix4().fromArray(node.worldMatrix)).multiply(reflection);
      assert.ok(matrixError(expected, posed.get(`atmel-${id}-n${node.id}`).matrix) < 1e-5, `${id}/${node.name} must start on its source pivot`);
    }
  }
});

test("all seven Get actors keep 23 meshes rigid and bring their own native corner to the direct opening slot", () => {
  const document = buildCubxAtmel(data);
  for (let choice = 2; choice <= 8; choice++) {
    const id = "get" + choice, actor = data.actors[id], animated = commandsOn(document, atmelSequence(data, document, "open", choice, 0));
    const start = poses(animated, 0), points = endpoints(actor, id, start);
    for (let frame = 0; frame <= 100; frame += 5) {
      const current = endpoints(actor, id, poses(animated, frame / 30));
      for (let a = 0; a < points.length; a++) for (let b = 0; b < a; b++) assert.ok(Math.abs(current[a].distanceTo(current[b]) - points[a].distanceTo(points[b])) < 1e-5, `choice ${choice}, frame ${frame}: connectors cannot slide or flip`);
    }
    const group = actor.nodes.find(n => n.name === "Group01"), groupId = `atmel-${id}-n${group.id}`;
    const delta = poses(animated, 100 / 30).get(groupId).matrix.clone().multiply(start.get(groupId).matrix.clone().invert());
    const raw = data.clicks[choice - 1].bounds, nativeCorner = new Vector3(...raw.min.map((v, i) => Math.sign((v + raw.max[i]) / 2) * 25 * (i === 2 ? -1 : 1)));
    const root = start.get(ATMEL_MACHINE).matrix;
    const arrived = nativeCorner.applyMatrix4(root).applyMatrix4(delta), openingSlot = new Vector3(25, 25, 25).applyMatrix4(root);
    assert.ok(arrived.distanceTo(openingSlot) < .003, `Get${choice} brings its own selection volume to the opening corner`);
  }
});

test("native petals open outward around fixed hinges while the rest of the Atmel actor stays still", () => {
  const document = buildCubxAtmel(data), animated = commandsOn(document, atmelSequence(data, document, "open", 1, 0)), start = poses(animated, 0);
  const actor = data.actors.open, petals = actor.nodes.filter(n => ["Left", "Top", "Right"].includes(n.name));
  assert.equal(petals.length, 3);
  const core = new Vector3(25, 25, 25).applyMatrix4(start.get(ATMEL_MACHINE).matrix);
  const moving = new Set(petals.flatMap(node => [node.id, ...actor.nodes.filter(n => n.parent === node.id).map(n => n.id)]));
  for (let frame = 0; frame <= 100; frame += 5) {
    const now = poses(animated, frame / 30);
    for (const node of actor.nodes.filter(n => !moving.has(n.id))) assert.ok(matrixError(start.get(`atmel-open-n${node.id}`).matrix, now.get(`atmel-open-n${node.id}`).matrix) < 1e-5, `${node.name} stays fixed during opening`);
    for (const node of petals) {
      const id = `atmel-open-n${node.id}`;
      assert.ok(new Vector3().setFromMatrixPosition(start.get(id).matrix).distanceTo(new Vector3().setFromMatrixPosition(now.get(id).matrix)) < 1e-5, `${node.name} keeps its hinge`);
      const mesh = actor.meshes.find(m => actor.nodes[m.nodeId].parent === node.id || m.nodeId === node.id);
      const centre = new Vector3(); for (let i = 0; i < mesh.positions.length; i += 3) centre.add(new Vector3(mesh.positions[i], mesh.positions[i + 1], -mesh.positions[i + 2])); centre.multiplyScalar(3 / mesh.positions.length);
      const before = centre.clone().applyMatrix4(start.get(`atmel-open-n${mesh.nodeId}`).matrix), after = centre.clone().applyMatrix4(now.get(`atmel-open-n${mesh.nodeId}`).matrix);
      const travel = after.sub(before).dot(before.clone().sub(core).normalize());
      assert.ok(travel >= -1e-5, `${node.name} opens away from the cube`); if (frame === 100) assert.ok(travel > .15);
    }
  }
});

test("eight complete cycles keep exactly one visible rig at switches, including large steps and the direct first choice", () => {
  const document = buildCubxAtmel(data);
  const visibleRigs = (doc, time) => [...poses(doc, time)].filter(([id, p]) => id.startsWith("atmel-rig-") && p.visible).map(([id]) => id);
  for (let choice = 1; choice <= 8; choice++) {
    const opened = commandsOn(document, atmelSequence(data, document, "open", choice, 12)), duration = choice === 1 ? 100 / 30 : 200 / 30;
    for (const time of [12, 12 + 100 / 30 - 1e-7, 12 + 100 / 30, 12 + duration, 300]) assert.equal(visibleRigs(opened, time).length, 1);
    assert.equal(atmelState(opened, 12 + duration).phase, "opened");
    const returned = commandsOn(opened, atmelSequence(data, opened, "return", choice, 50));
    for (const time of [50, 50 + 100 / 30, 50 + duration, 300]) assert.equal(visibleRigs(returned, time).length, 1);
    assert.equal(atmelState(returned, 50 + duration).phase, "idle"); assert.deepEqual(visibleRigs(returned, 300), ["atmel-rig-closed"]);
    const ending = poses(returned, 300), beginning = poses(document, 0);
    for (const node of data.actors.open.nodes) assert.ok(matrixError(ending.get(`atmel-open-n${node.id}`).matrix, beginning.get(`atmel-open-n${node.id}`).matrix) < 1e-5);
  }
});

test("waiting rotates the complete closed machine and aligns from its actual pose before selecting", () => {
  const document = buildCubxAtmel(data), waiting = commandsOn(document, atmelSequence(data, document, "saver", 1, 0));
  const begin = poses(waiting, 0), later = poses(waiting, 1.7);
  const native = data.clicks.map(m => new Vector3(...m.bounds.min.map((v, i) => (v + m.bounds.max[i]) / 2 * (i === 2 ? -1 : 1))));
  const a = native.map(v => v.clone().applyMatrix4(begin.get(ATMEL_MACHINE).matrix)), b = native.map(v => v.clone().applyMatrix4(later.get(ATMEL_MACHINE).matrix));
  assert.ok(a[0].distanceTo(b[0]) > .2);
  for (let i = 0; i < 8; i++) for (let j = 0; j < i; j++) assert.ok(Math.abs(a[i].distanceTo(a[j]) - b[i].distanceTo(b[j])) < 1e-8);
  const q = new Quaternion(), p = new Vector3(), s = new Vector3(); later.get(ATMEL_MACHINE).matrix.decompose(p, q, s);
  const rotation = new Euler().setFromQuaternion(q).toArray().slice(0, 3).map(v => v * 180 / Math.PI);
  const aligned = commandsOn(waiting, atmelSequence(data, waiting, "open", 8, 1.7, rotation));
  assert.equal(atmelState(aligned, 1.7).phase, "aligning");
  assert.ok(matrixError(poses(aligned, 1.7).get(ATMEL_MACHINE).matrix, later.get(ATMEL_MACHINE).matrix) < 1e-8, "alignment must not snap to the default pose");
  assert.equal(atmelState(aligned, 1.7 + .45).phase, "rotating");
});

test("clock edits preserve glyph transforms, materials, children and foreign tags, while rejecting invalid hours", () => {
  const document = buildCubxAtmel(data, "23:59"), digit = document.entities.find(e => e.id === "atmel-time-light-on-0");
  digit.tags.push("owner-edit"); digit.material.color = "#ff5500";
  document.entities.push({ id: "owner-child", type: "box", parentId: digit.id });
  assert.equal(atmelClock(document, "main"), "23:59");
  const edited = commandsOn(document, updateAtmelClock(data, document, "light-on", "06:45"));
  assert.equal(atmelClock(edited, "light-on"), "06:45");
  assert.deepEqual(edited.entities.find(e => e.id === digit.id).transform, digit.transform);
  assert.equal(edited.entities.find(e => e.id === digit.id).material.color, "#ff5500");
  assert.ok(edited.entities.find(e => e.id === digit.id).tags.includes("owner-edit"));
  assert.equal(edited.entities.find(e => e.id === "owner-child").parentId, digit.id);
  for (const value of ["24:00", "12:60", "1:11", "-1:00", "", "12:30:00"]) assert.throws(() => updateAtmelClock(data, document, "light-on", value));
  assert.throws(() => buildCubxAtmel(data, "99:99"));
  assert.ok(document.entities.find(e => e.id === "atmel-time-light-on-0").transform.position[1] < document.entities.find(e => e.id === "atmel-time-light-off-0").transform.position[1], "editable light schedules match MenuDomo's engraved OFF/ON labels");
  assert.throws(() => updateAtmelClock(data, document, "unknown", "11:11"));
});

test("Studio freezes the visible pose and keeps foreign edits and hidden native actors through JSON", () => {
  const document = buildCubxAtmel(data), animated = commandsOn(document, atmelSequence(data, document, "open", 8, 0));
  animated.entities.push({ id: "owner-cube", type: "box", parentId: ATMEL_MACHINE, behaviors: [{ id: "owner-pulse", type: "spin", axis: "y", speed: 4 }] });
  const pose = atmelStudioPose(animated, 4.2);
  assert.equal(pose.entities.length, animated.entities.length);
  assert.deepEqual(pose.entities.find(e => e.id === "owner-cube"), animated.entities.find(e => e.id === "owner-cube"));
  const before = poses(animated, 4.2), after = poses(JSON.parse(JSON.stringify(pose)), 0);
  for (const e of animated.entities) { assert.equal(after.get(e.id).visible, before.get(e.id).visible); assert.ok(matrixError(after.get(e.id).matrix, before.get(e.id).matrix) < 1e-8, e.id); }
  const foreign = { ...document, id: "owner-world", label: "Owner's scene" };
  assert.equal(atmelState(foreign, 0).phase, "unavailable"); assert.deepEqual(atmelStudioPose(foreign, 99), foreign);
  assert.throws(() => atmelSequence(data, foreign, "open", 1, 0));
});
