// Real public API + bridge + relay boundary + Rapier. No browser, server or port.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { after, before, test } from "node:test";
import { build } from "vite";
import { applyCommands, validateStoredSceneDefinition } from "../server/scene-commands.mjs";

let temporary, AgentWorldRuntime, createAgentWorldApi, createBridge, invoke, requestSchema, archiveWorlds, motionWorlds;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

before(async () => {
  temporary = mkdtempSync(join(tmpdir(), "graphysx-bridge-live-"));
  const root = fileURLToPath(new URL("../", import.meta.url));
  // One isolated SSR build of the actual modules, rather than copied API stubs or
  // a second hand-maintained list of tool names. Never writes the product dist/.
  await build({
    configFile: false, root, publicDir: false, logLevel: "silent",
    build: {
      ssr: true, target: "node22", outDir: temporary, emptyOutDir: true,
      rollupOptions: {
        input: {
          runtime: join(root, "src/agent-world-runtime.ts"),
          api: join(root, "src/agent-world-api.ts"),
          bridge: join(root, "src/agent-world-bridge.ts"),
          connection: join(root, "src/graphysx-agent-connection.ts"),
          archive: join(root, "src/archive-worlds.ts"),
          motion: join(root, "src/archive-world-motion.ts"),
        },
        output: { format: "es", entryFileNames: "[name].mjs", chunkFileNames: "chunks/[name]-[hash].mjs" },
      },
    },
    ssr: { noExternal: true },
  });
  const load = name => import(pathToFileURL(join(temporary, `${name}.mjs`)).href);
  ({ AgentWorldRuntime } = await load("runtime"));
  ({ createAgentWorldApi } = await load("api"));
  ({ createGraphysXAgentToolBridge: createBridge, GRAPHYSX_AGENT_TOOL_REQUEST_SCHEMA: requestSchema } = await load("bridge"));
  ({ invokeGraphysXAgentTool: invoke } = await load("connection"));
  archiveWorlds = await load("archive"); motionWorlds = await load("motion");
  // Only the window transport is substituted. The scene, validators, API factory,
  // tool manifest, dispatch and simulation are the production implementations.
  const window = Object.assign(new EventTarget(), {
    location: { origin: "http://bridge.test", search: "" },
    // Rapier reads the browser global clock during a physics step. Preserve the
    // actual Node clock when exposing a window-shaped transport to this test.
    performance: globalThis.performance,
    postMessage() {},
  });
  Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: window });
});

after(() => {
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else delete globalThis.window;
  if (!temporary) return;
  const target = resolve(temporary), inside = relative(resolve(tmpdir()), target);
  assert.ok(inside && !inside.startsWith("..") && !inside.includes(":"));
  rmSync(target, { recursive: true, force: true });
});

const scene = () => ({
  schema: "graphysx.agent-world/v2", id: "bridge-live-test", label: "Bridge live controls",
  environment: { physics: { gravity: [0, 0, 0] } },
  entities: [
    { id: "ball", type: "sphere", geometry: { radius: .65 }, transform: { position: [0, 20, 0] },
      physics: { mode: "dynamic", mass: 1.7, linearVelocity: [8, 3, 0], angularVelocity: [1, 2, 3] },
      steering: { force: 28, speedCap: 8, headingDegrees: 90 } },
    { id: "plain", type: "box", transform: { position: [20, 20, 0] } },
    { id: "static", type: "box", transform: { position: [30, 20, 0] }, physics: { mode: "static" } },
    { id: "finish", type: "box", transform: { position: [100, 20, 0] }, physics: { mode: "trigger" } },
  ],
  rules: { schema: "graphysx.agent-rules/v1", subjectId: "ball", spawn: { entityId: "ball", position: [0, 20, 0] }, finish: { triggerId: "finish" }, timer: {} },
});

function world(t) {
  const runtime = new AgentWorldRuntime(scene()), api = createAgentWorldApi(runtime), bridge = createBridge(api);
  t.after(() => { bridge.dispose(); runtime.dispose(); });
  return { runtime, api, bridge };
}

const ball = ({ api }) => api.query({ ids: ["ball"] })[0];
const records = ({ runtime, api }) => structuredClone({
  revision: api.state().revision, history: runtime.history, redo: runtime.redoHistory, events: api.events(),
});
const snapshot = w => ({ ...records(w), state: w.api.state(), document: w.api.exportDocument(), exported: w.api.export() });
const request = (method, args) => ({ schema: requestSchema, id: "live-test", method, args });
const accepted = result => { assert.equal(result.ok, true, result.error); return result.value; };

test("the real public API has exact bridge parity and live mutations are discoverable", t => {
  const { bridge } = world(t);
  assert.deepEqual(bridge.audit(), { missing: [], extra: [] });
  const tools = bridge.manifest().tools;
  assert.equal(new Set(tools.map(tool => tool.path)).size, tools.length);
  for (const path of ["steerLive", "setSlowdownLive", "pilotLive"]) {
    const tool = tools.find(candidate => candidate.path === path);
    assert.ok(tool, path);
    assert.equal(tool.name, path);
    assert.equal(tool.mutates, true, "live input is still a mutation despite not advancing document revision");
    assert.equal(tool.arguments, "positional-array");
    assert.match(tool.summary, /transient|continuous/i);
    assert.match(tool.summary, /revision/);
  }
  assert.match(tools.find(tool => tool.path === "setSlowdownLive").summary, /0\.75\.\.1/);
  const copy = bridge.manifest();
  copy.tools.find(tool => tool.path === "steerLive").mutates = false;
  assert.equal(bridge.manifest().tools.find(tool => tool.path === "steerLive").mutates, true);
});

test("bridge dispatch matches native receipts, clamping and actual Rapier motion without rewriting history or redo", async t => {
  const remote = world(t), native = world(t);
  for (const w of [remote, native]) {
    accepted(w.api.spawn({ id: "undo-marker", type: "box", transform: { position: [50, 20, 0] } }));
    accepted(w.api.undo());
  }
  assert.ok(remote.runtime.redoHistory.length > 0, "exercise a nonempty redo branch");
  const initial = records(remote), body = remote.runtime.hostBody("ball");
  const input = { headingDegrees: -450, thrust: 3, turn: -3 };
  const receipt = accepted(await remote.bridge.call("steerLive", "ball", input));
  assert.deepEqual(receipt, accepted(native.api.steerLive("ball", input)));
  assert.equal(receipt.headingDegrees, 270);
  assert.equal(receipt.thrust, 1);
  assert.equal(receipt.turn, -1);
  assert.equal(receipt.kicked, 0);
  assert.equal(receipt.jumped, 0);
  assert.deepEqual(records(remote), initial);
  const document = remote.api.exportDocument();
  assert.deepEqual(await remote.bridge.call("setSlowdownLive", "ball", .75), native.api.setSlowdownLive("ball", .75));
  assert.deepEqual(remote.api.exportDocument(), document, "the factor is not authored content");
  assert.equal(remote.runtime.hostBody("ball"), body);
  for (let frame = 0; frame < 30; frame++) {
    const live = { headingDegrees: frame * 3, thrust: .7, turn: .2 };
    assert.deepEqual(await remote.bridge.call("steerLive", "ball", live), native.api.steerLive("ball", live));
    remote.api.step(1 / 60); native.api.step(1 / 60);
  }
  assert.deepEqual(remote.api.query({}), native.api.query({}));
  assert.notDeepEqual(ball(remote).position, [0, 20, 0]);
  assert.equal(remote.api.state().revision, initial.revision);
  assert.deepEqual(remote.runtime.history, initial.history);
  assert.deepEqual(remote.runtime.redoHistory, initial.redo);
  const revision = remote.api.state().revision;
  accepted(await remote.bridge.call("steer", "ball", { kick: .1 }));
  assert.equal(remote.api.state().revision, revision + 1, "existing steer remains transactional");
});

test("invalid live steering is rejected atomically through bridge call and request", async t => {
  const w = world(t);
  for (const input of [null, undefined, [], "drive", 1,
    { headingDegrees: 45, thrust: NaN }, { headingDegrees: 90, turn: Infinity },
    { headingDegrees: 45, thrust: "1" }, { headingDegrees: -Infinity },
    { headingDegrees: 45, kick: 1 }, { headingDegrees: 45, jump: 1 },
    { headingDegrees: 45, speedCap: 20 }, { headingDegrees: 45, thrust: undefined }]) {
    const before = snapshot(w);
    const expected = w.api.steerLive("ball", input);
    assert.equal(expected.ok, false);
    assert.deepEqual(snapshot(w), before);
    assert.deepEqual(await w.bridge.call("steerLive", "ball", input), expected);
    const response = await w.bridge.request(request("steerLive", ["ball", input]));
    assert.equal(response.ok, true, "transport succeeds; native result rejects");
    assert.deepEqual(response.value, expected);
    assert.deepEqual(snapshot(w), before);
  }
  for (const id of [null, undefined, "", " ", 1, "missing", "plain", "static"]) {
    const before = snapshot(w), result = await w.bridge.call("steerLive", id, { headingDegrees: 90 });
    assert.equal(result.ok, false);
    assert.deepEqual(result, w.api.steerLive(id, { headingDegrees: 90 }));
    assert.deepEqual(snapshot(w), before);
  }
});

test("invalid slowdown factors and targets preserve observable state and the existing delayed damping", async t => {
  const w = world(t), control = world(t);
  accepted(await w.bridge.call("setSlowdownLive", "ball", .8));
  accepted(control.api.setSlowdownLive("ball", .8));
  for (const factor of [0, .749, 1.001, NaN, Infinity, -Infinity, ".75", null, {}, undefined]) {
    const before = snapshot(w), expected = w.api.setSlowdownLive("ball", factor);
    assert.equal(expected.ok, false);
    assert.deepEqual(await w.bridge.call("setSlowdownLive", "ball", factor), expected);
    const response = await w.bridge.request(request("setSlowdownLive", ["ball", factor]));
    assert.equal(response.ok, true);
    assert.deepEqual(response.value, expected);
    assert.deepEqual(snapshot(w), before);
  }
  for (const id of [null, undefined, "", " ", 1, "missing", "plain", "static"]) {
    const before = snapshot(w), result = await w.bridge.call("setSlowdownLive", id, .75);
    assert.equal(result.ok, false);
    assert.deepEqual(result, w.api.setSlowdownLive(id, .75));
    assert.deepEqual(snapshot(w), before);
  }
  for (let i = 0; i < 10; i++) { w.api.step(1 / 60); control.api.step(1 / 60); }
  assert.deepEqual(ball(w), ball(control), "invalid calls must not replace the active transient factor");
});

test("bridge live inputs cannot cross reserved namespaces or host-owned transient scopes", async t => {
  const w = world(t);
  const ids = ["live-agent:test", "live-mission:test", "live-nestor:test", "ordinary-transient"];
  accepted(w.runtime.reconcileTransientEntities("bridge-live-test", ids.map((id, index) => ({
    id, type: "sphere", ephemeral: true, transform: { position: [index * 4, 40, 0] },
    physics: { mode: "dynamic" }, steering: { force: 28 },
  }))));
  for (const id of [...ids, "live-agent:missing", "live-mission:missing", "live-nestor:missing"]) {
    for (const [method, input] of [["steerLive", { headingDegrees: 45, thrust: 1 }], ["setSlowdownLive", .75], ["pilotLive", { thrust: 1 }]]) {
      const before = snapshot(w), result = await w.bridge.call(method, id, input);
      assert.equal(result.ok, false, `${method}(${id})`);
      assert.match(result.error, /host-only entity namespace|host-owned transient/i);
      assert.deepEqual(result, w.api[method](id, input));
      assert.deepEqual(snapshot(w), before);
    }
  }
});

test("pause blocks physics but accepts aim and inputs; explicit bridge steps run the same simulation", async t => {
  const remote = world(t), native = world(t);
  for (const w of [remote, native]) accepted(w.api.pause(true));
  const initial = records(remote), physics = ball(remote).physics, position = ball(remote).position;
  for (const [method, input] of [["steerLive", { headingDegrees: 180, thrust: .5, turn: .3 }], ["setSlowdownLive", .75]]) {
    assert.deepEqual(await remote.bridge.call(method, "ball", input), native.api[method]("ball", input));
  }
  assert.equal(ball(remote).steering.headingDegrees, 180, "absolute aim is immediate even when paused");
  assert.deepEqual(records(remote), initial);
  remote.runtime.update(1 / 60); native.runtime.update(1 / 60);
  assert.deepEqual(ball(remote).physics, physics);
  assert.deepEqual(ball(remote).position, position);
  assert.deepEqual(await remote.bridge.call("step", 1 / 60), native.api.step(1 / 60));
  assert.deepEqual(ball(remote), ball(native));
  assert.notDeepEqual(ball(remote).position, position);
  assert.equal(remote.api.state().paused, true);
});

test("slowdown damps only horizontal motion and clearing/reload/reset restore ordinary behavior", async t => {
  const slow = world(t), control = world(t);
  accepted(await slow.bridge.call("setSlowdownLive", "ball", .75));
  slow.api.step(1 / 60); control.api.step(1 / 60);
  assert.ok(ball(slow).physics.linearVelocity[0] < ball(control).physics.linearVelocity[0]);
  assert.equal(ball(slow).physics.linearVelocity[1], ball(control).physics.linearVelocity[1]);
  assert.deepEqual(ball(slow).physics.angularVelocity, ball(control).physics.angularVelocity);
  const physics = ball(slow).physics, body = slow.runtime.hostBody("ball");
  accepted(await slow.bridge.call("setSlowdownLive", "ball", 1));
  assert.deepEqual(ball(slow).physics, physics, "clearing cannot add an impulse");
  assert.equal(slow.runtime.hostBody("ball"), body);
  for (const reset of ["create", "rules.reset"]) {
    accepted(await slow.bridge.call("setSlowdownLive", "ball", .75));
    if (reset === "create") {
      accepted(await slow.bridge.call(reset, scene())); accepted(control.api.create(scene()));
    } else {
      accepted(await slow.bridge.call(reset)); accepted(control.api.rules.reset());
    }
    accepted(await slow.bridge.call("steerLive", "ball", { headingDegrees: 90, thrust: 1 }));
    accepted(control.api.steerLive("ball", { headingDegrees: 90, thrust: 1 }));
    for (let i = 0; i < 120; i++) { slow.api.step(1 / 60); control.api.step(1 / 60); }
    assert.deepEqual(ball(slow), ball(control), `${reset} clears the transient slowdown`);
    assert.ok(ball(slow).physics.linearVelocity[0] > 7.8);
  }
});

test("the relay enforces edit/revision guards and propagates native validation for both live methods", async t => {
  const w = world(t), revision = w.api.state().revision;
  for (const [method, input] of [["steerLive", { thrust: .5 }], ["setSlowdownLive", .75]]) {
    const args = ["ball", input], before = snapshot(w);
    await assert.rejects(invoke(w, { kind: "read", method, args }), /Use read for observations and edit for changes/);
    await assert.rejects(invoke(w, { kind: "edit", method, args }), /Revision conflict/);
    await assert.rejects(invoke(w, { kind: "edit", method, args, expectedRevision: revision + 1 }), /Revision conflict/);
    assert.deepEqual(snapshot(w), before);
    const result = await invoke(w, { kind: "edit", method, args, expectedRevision: revision });
    assert.equal(result.result.ok, true);
    assert.equal(result.revision, revision);
  }
  const before = snapshot(w);
  await assert.rejects(invoke(w, { kind: "edit", method: "steerLive", args: ["ball", { kick: 1 }], expectedRevision: revision }), /Unsupported live steering field/);
  await assert.rejects(invoke(w, { kind: "edit", method: "setSlowdownLive", args: ["ball", .5], expectedRevision: revision }), /Slowdown factor/);
  assert.deepEqual(snapshot(w), before);
});

test("the bridge validates request envelopes and keeps internal/prototype paths unreachable", async t => {
  const w = world(t), before = snapshot(w);
  for (const method of ["steerInternal", "runtime.steerLive", "__proto__.constructor", "constructor", "rules.__proto__", "unknown"]) {
    await assert.rejects(w.bridge.call(method), /Unknown GraphysX agent tool/);
    const response = await w.bridge.request(request(method, []));
    assert.equal(response.ok, false);
    assert.match(response.error, /Unknown GraphysX agent tool/);
  }
  for (const method of ["steerLive", "setSlowdownLive"]) {
    const malformed = await w.bridge.request(request(method, { id: "ball" }));
    assert.equal(malformed.ok, false);
    assert.match(malformed.error, /args must be an array/);
    assert.equal((await w.bridge.request({ ...request(method, []), schema: "wrong" })).ok, false);
    const missing = await w.bridge.request(request(method, []));
    assert.equal(missing.ok, true);
    assert.equal(missing.value.ok, false);
  }
  assert.deepEqual(snapshot(w), before);
});

test("source keyframes interpolate on the shared clock, hold, reverse and survive document validation", t => {
  const w = world(t);
  accepted(w.api.spawn({ id: "track", type: "box", behaviors: [{ id: "clip", type: "keyframes", durationSeconds: 2,
    positions: [[0, 0, 0, 0], [2, 8, 4, -2]], rotations: [[0, 0, 0, 0, 1], [2, 0, 1, 0, 0]] }] }));
  accepted(w.api.pause(true));
  const initial = w.api.query({ ids: ["track"] })[0].position;
  w.runtime.update(1);
  assert.deepEqual(w.api.query({ ids: ["track"] })[0].position, initial);
  accepted(w.api.step(1));
  const middle = w.api.query({ ids: ["track"] })[0];
  assert.ok(Math.abs(middle.position[0] - 4) < 1e-5);
  const quaternion = w.runtime.getEntityObject("track").quaternion;
  assert.ok(Math.abs(quaternion.y - Math.SQRT1_2) < 1e-5);
  accepted(w.api.step(5));
  assert.deepEqual(w.api.query({ ids: ["track"] })[0].position, [8, 4, -2]);
  const exported = w.api.exportDocument();
  assert.doesNotThrow(() => validateStoredSceneDefinition(exported));
  const fresh = new AgentWorldRuntime(exported); t.after(() => fresh.dispose());
  const sortedEntities = document => ({ ...document, entities: [...document.entities].sort((a, b) => a.id.localeCompare(b.id)) });
  assert.deepEqual(sortedEntities(fresh.exportDocument()), sortedEntities(exported));
  accepted(w.api.create(motionWorlds.buildCubzTracks()));
  motionWorlds.playCubzTrack(w.api, "open", 1);
  accepted(w.api.step(2));
  const opened = w.runtime.getEntityObject("cubz-Right08").quaternion.clone();
  assert.ok(Math.abs(opened.y) > .7);
  motionWorlds.playCubzTrack(w.api, "open", 1, true);
  accepted(w.api.step(2));
  assert.ok(w.runtime.getEntityObject("cubz-Right08").quaternion.angleTo(opened) > 1);
  assert.ok(Math.abs(w.runtime.getEntityObject("cubz-Right08").quaternion.w - 1) < 1e-5);
});

test("FlightX bridge input moves real scene objects without document revisions or saved held keys", async t => {
  const w = world(t);
  accepted(w.api.spawn({ id: "plane", type: "group", transform: { position: [0, 10, 0] }, behaviors: [{ id: "pilot", type: "flight", speed: 10 }] }));
  accepted(w.api.pause(true));
  const before = records(w), exported = w.api.exportDocument();
  const receipt = accepted(await w.bridge.call("pilotLive", "plane", { thrust: 3 }));
  assert.equal(receipt.input.thrust, 1);
  w.runtime.update(1);
  assert.deepEqual(w.api.query({ ids: ["plane"] })[0].position, [0, 10, 0]);
  accepted(w.api.step(1));
  const flying = w.api.query({ ids: ["plane"] })[0];
  assert.ok(Math.abs(flying.position[0] - 10) < 1e-5);
  assert.deepEqual(records(w), before);
  assert.deepEqual(w.api.exportDocument(), exported);
  accepted(await w.bridge.call("pilotLive", "plane", { roll: .5, pitch: -.3, airbrake: true }));
  accepted(w.api.step(.5));
  const moved = w.api.query({ ids: ["plane"] })[0].position;
  accepted(await w.bridge.call("pilotLive", "plane", { reset: true, thrust: 0, roll: 0, pitch: 0 }));
  assert.deepEqual(w.api.query({ ids: ["plane"] })[0].position, moved, "R restores orientation without teleportation");
  assert.ok(w.runtime.getEntityObject("plane").quaternion.w > .99999);
  for (const input of [{ thrust: NaN }, { pitch: Infinity }, { roll: "1" }, { airbrake: 1 }, { reset: true, unknown: 1 }]) {
    const checkpoint = snapshot(w);
    assert.equal((await w.bridge.call("pilotLive", "plane", input)).ok, false);
    assert.deepEqual(snapshot(w), checkpoint);
  }
  const reloaded = new AgentWorldRuntime(exported); t.after(() => reloaded.dispose());
  reloaded.step(1);
  assert.deepEqual(reloaded.query({ ids: ["plane"] })[0].position, [0, 10, 0]);
  accepted(w.api.update("plane", { transform: { position: [25, 30, 0] } }));
  accepted(w.api.step(.1));
  assert.deepEqual(w.api.query({ ids: ["plane"] })[0].position, [25, 30, 0], "authored repositioning resets live pose and controls");
});

test("all recovered worlds and TVA ranges cross the actual storage validator; malformed motion is atomic", t => {
  for (const id of ["maison", "arena", "common-room", "notes", "cubz", "flightx"]) {
    const definition = archiveWorlds.buildArchiveWorld(id);
    assert.doesNotThrow(() => validateStoredSceneDefinition(definition), id);
  }
  for (let selection = 1; selection <= 7; selection++) for (const reverse of [false, true]) {
    const track = motionWorlds.cubzTrack("rotation", selection, "GlobalCube", 0, reverse);
    const definition = { schema: "graphysx.agent-world/v2", id: "keys", label: "Keys", entities: [{ id: "track", type: "box", behaviors: [track] }] };
    assert.doesNotThrow(() => validateStoredSceneDefinition(definition));
  }
  const w = world(t);
  for (const behavior of [
    { type: "flight", speed: -1 }, { type: "flight", speed: Infinity },
    { type: "keyframes", durationSeconds: 0, positions: [[0, 0, 0, 0]] },
    { type: "keyframes", durationSeconds: 2, positions: [[1, 0, 0, 0], [1, 2, 0, 0]] },
    { type: "keyframes", durationSeconds: 2, rotations: [[0, 0, 0, 0, 0]] },
    { type: "keyframes", durationSeconds: 2, positions: [[0, 10001, 0, 0]] },
  ]) {
    const before = snapshot(w);
    assert.equal(w.api.attachBehavior("plain", { id: "bad", ...behavior }).ok, false);
    assert.deepEqual(w.api.exportDocument(), before.document);
    assert.equal(w.api.state().revision, before.revision);
    assert.deepEqual(w.runtime.history, before.history);
    assert.throws(() => applyCommands(w.api.exportDocument(), [{ op: "attach-behavior", id: "plain", behavior: { id: "bad", ...behavior } }]));
  }
  assert.equal(w.api.attachBehavior("ball", { id: "wrong-mode", type: "flight" }).ok, false);
});
