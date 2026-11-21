// Real public API + bridge + relay boundary + Rapier. No browser, server or port.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { after, before, test } from "node:test";
import { build } from "vite";
import { applyCommands, validateStoredSceneDefinition } from "../server/scene-commands.mjs";

let temporary, AgentWorldRuntime, createAgentWorldApi, createBridge, invoke, requestSchema, archiveWorlds, motionWorlds, dnaCreation, cubz, motion, flightx, flightxCourses, flightxRecords;
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
          dnaCreation: join(root, "src/dna-creation-scene.ts"),
          cubz: join(root, "src/cubz-menu-scene.ts"),
          motionSampler: join(root, "src/agent-world-motion.ts"),
          flightx: join(root, "src/flightx-revival.ts"),
          flightxCourses: join(root, "src/flightx-courses.ts"),
          flightxRecords: join(root, "src/flightx-records.ts"),
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
  dnaCreation = await load("dnaCreation");
  cubz = await load("cubz"); motion = await load("motionSampler");
  flightx = await load("flightx");
  flightxCourses = await load("flightxCourses");
  flightxRecords = await load("flightxRecords");
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

test("the runtime rejects intensity modulation on boxes without applying any part of a batch", t => {
  const w = world(t);
  const invalid = { id: "fade", type: "modulate", property: "intensity" };
  const error = /modulate.*intensity.*light entity.*plain.*box/i;
  const before = snapshot(w);
  const object = w.runtime.getEntityObject("plain");
  const failed = w.api.transaction([
    { op: "update", id: "plain", patch: { transform: { position: [1, 2, 3] } } },
    { op: "attach-behavior", id: "plain", behavior: invalid },
  ]);
  assert.equal(failed.ok, false);
  assert.match(failed.error, error);
  assert.equal(w.api.spawn({ id: "another-box", type: "box", behaviors: [invalid] }).ok, false);
  const document = w.api.exportDocument();
  document.entities.find(entity => entity.id === "plain").behaviors = [invalid];
  const rejectedCreate = w.api.create(document);
  assert.equal(rejectedCreate.ok, false);
  assert.match(rejectedCreate.error, error);
  assert.deepEqual(w.api.exportDocument(), before.document);
  assert.equal(w.api.state().revision, before.revision);
  assert.deepEqual(w.runtime.history, before.history);
  assert.equal(w.runtime.getEntityObject("plain"), object);
});

test("the runtime opens old documents with an explicit warning and can remove the ignored modulation", t => {
  const { api } = world(t);
  const legacy = scene();
  const invalid = { id: "fade", type: "modulate", property: "intensity" };
  legacy.entities.find(entity => entity.id === "plain").behaviors = [invalid];
  const loaded = accepted(api.load(legacy));
  assert.ok(loaded.recentEvents.some(event => event.type === "behavior.ignored" && /intensity.*plain.*box/.test(event.message)));
  assert.deepEqual(api.exportDocument().entities.find(entity => entity.id === "plain").behaviors, [invalid]);
  accepted(api.update("plain", { label: "Existing box" }));
  accepted(api.detachBehavior("plain", "fade"));
  accepted(api.create(api.exportDocument()));
});

test("FlightX modern courses use real kinematic crossings and ordered shared rules for all four modes", t => {
  for (const mode of ["free", "gates", "time", "laps"]) {
    const definition = flightxCourses.buildFlightxCourse(mode);
    assert.doesNotThrow(() => validateStoredSceneDefinition(definition));
    const w = world(t); accepted(w.api.create(definition));
    assert.equal(w.api.rules.get()?.subjectId ?? null, mode === "free" ? null : "flight-plane");
    const input = mode === "time" || mode === "laps" ? { thrust: 1, pitch: -1 } : { thrust: 1 };
    accepted(w.api.pilotLive("flight-plane", input));
    const steps = mode === "laps" ? 1900 : mode === "free" ? 120 : 680;
    for (let i = 0; i < steps; i++) accepted(w.api.step(1 / 60));
    const run = w.api.rules.status();
    if (mode === "free") { assert.equal(run, null); assert.ok(w.api.query({ ids: ["flight-plane"] })[0].position[2] < -30); }
    else {
      assert.equal(run.phase, "complete", mode + ": " + JSON.stringify(run));
      assert.equal(run.lap, mode === "laps" ? 3 : 1);
      assert.equal(run.desynced, false);
      assert.ok(w.api.events().events.some(event => event.type === "trigger.enter" && event.entityIds.includes("flight-plane")));
    }
  }
});

test("FlightX cannot finish by skipping gates, and the timed mode expires on simulation time", t => {
  const w = world(t); accepted(w.api.create(flightxCourses.buildFlightxCourse("gates")));
  accepted(w.api.update("flight-plane", { transform: { position: [0, 16, -105] } }));
  accepted(w.api.step(.1)); assert.equal(w.api.rules.status().lap, 0); assert.equal(w.api.rules.status().phase, "running");
  accepted(w.api.create(flightxCourses.buildFlightxCourse("time")));
  accepted(w.api.step(30)); accepted(w.api.step(6));
  assert.equal(w.api.rules.status().phase, "expired"); assert.equal(w.api.rules.status().outcome, "timeout");
  assert.equal(w.api.rules.status().lap, 0);
});

test("FlightX passage volumes accept a short throttle lead before a looping without relying on torus collision orientation", t => {
  const w = world(t); accepted(w.api.create(flightxCourses.buildFlightxCourse("time")));
  accepted(w.api.pilotLive("flight-plane", { thrust: 1 })); accepted(w.api.step(.12));
  accepted(w.api.pilotLive("flight-plane", { pitch: -1 }));
  for (let i = 0; i < 44; i++) accepted(w.api.step(.25));
  assert.equal(w.api.rules.status().phase, "complete");
  const definition = w.api.exportDocument();
  assert.equal(definition.entities.find(entity => entity.id === "flightx-gate-2").type, "box");
  assert.equal(definition.entities.find(entity => entity.id === "flightx-gate-ring-2").physics, undefined);
});

test("FlightX mode changes preserve authored models and additions, and rotate new gates with the departure", t => {
  const w = world(t); accepted(w.api.create(flightx.buildRecoveredFlightX()));
  accepted(w.api.update("flight-plane", { transform: { position: [12, 32, 5], rotationDegrees: [0, 90, 0] } }));
  accepted(w.api.update("flight-plane-model", { label: "My restored biplane" }));
  accepted(w.api.spawn({ id: "my-flight-addition", type: "box", material: { color: "#ee7835" }, transform: { position: [25, 14, 12] } }));
  const definition = flightxCourses.buildFlightxCourse("gates", w.api.exportDocument());
  assert.doesNotThrow(() => validateStoredSceneDefinition(definition));
  accepted(w.api.create(definition)); accepted(w.api.pilotLive("flight-plane", { thrust: 1 }));
  for (let i = 0; i < 420; i++) accepted(w.api.step(1 / 60));
  assert.equal(w.api.rules.status().phase, "complete");
  assert.equal(w.api.query({ ids: ["flight-plane-model"] })[0].label, "My restored biplane");
  assert.equal(w.api.query({ ids: ["my-flight-addition"] })[0].material.color, "#ee7835");
  const free = flightxCourses.buildFlightxCourse("free", w.api.exportDocument());
  assert.equal(free.rules, undefined); assert.equal(free.entities.some(entity => entity.id === "my-flight-addition"), true);
});

test("FlightX local records reject malformed values and report storage failure without losing the session result", () => {
  let value = JSON.stringify({ gates: 9.8, time: "2", laps: -4, free: 2 });
  const storage = { getItem: () => value, setItem: (key, next) => { assert.equal(key, "graphysx.flightx.best.v1"); value = next; } };
  assert.deepEqual(flightxRecords.readFlightxBest(storage), { best: { gates: 9.8 }, available: true });
  const saved = flightxRecords.saveFlightxBest("gates", 8.2, { gates: 9.8 }, storage);
  assert.equal(saved.stored, true); assert.equal(saved.improved, true); assert.deepEqual(JSON.parse(value), { gates: 8.2 });
  const quota = { getItem: storage.getItem, setItem: () => { throw new Error("Quota exceeded"); } };
  const failed = flightxRecords.saveFlightxBest("gates", 7.1, saved.best, quota);
  assert.equal(failed.stored, false); assert.equal(failed.best.gates, 7.1); assert.equal(JSON.parse(value).gates, 8.2);
  value = JSON.stringify({ gates: 5.2, laps: 31 });
  const anotherTab = flightxRecords.saveFlightxBest("time", 10.5, { gates: 8.2 }, storage);
  assert.equal(anotherTab.best.gates, 5.2); assert.equal(anotherTab.best.laps, 31);
  value = "{bad json"; assert.deepEqual(flightxRecords.readFlightxBest(storage), { best: {}, available: false });
  assert.equal(flightxRecords.saveFlightxBest("free", 3, {}, storage).stored, false);
});

test("DNA mutations cross browser/storage validation and reload identical geometry with one changed gene", t => {
  const { composeDnaCreation, DNA_MUTATIONS, dnaMutationCommands, dnaCreationCanTune, dnaCreationMeasurements } = dnaCreation;
  const initial = composeDnaCreation();
  assert.doesNotThrow(() => validateStoredSceneDefinition(initial));
  const runtime = new AgentWorldRuntime(initial), api = createAgentWorldApi(runtime);
  t.after(() => runtime.dispose());
  const original = api.exportDocument(), reference = original.entities.find(entity => entity.id === "dna-reference");
  const matrices = world => {
    const values = [];
    world.getEntityObject("dna-variant").traverse(object => { if (object.isInstancedMesh) values.push([...object.instanceMatrix.array]); });
    return values;
  };
  const originalMatrices = matrices(runtime);
  for (const mutation of DNA_MUTATIONS) {
    const commands = dnaMutationCommands(mutation);
    assert.doesNotThrow(() => applyCommands(api.exportDocument(), commands));
    accepted(api.transaction(commands));
    const document = api.exportDocument();
    assert.doesNotThrow(() => validateStoredSceneDefinition(document));
    assert.equal(dnaCreationCanTune(document), true);
    assert.deepEqual(document.entities.find(entity => entity.id === "dna-reference"), reference);
    const variant = document.entities.find(entity => entity.id === "dna-variant");
    assert.deepEqual(Object.keys(variant.dna.genome).filter(gene => variant.dna.genome[gene] !== reference.dna.genome[gene]), [mutation.gene]);
    assert.notDeepEqual(matrices(runtime), originalMatrices, mutation.id + " changes rendered geometry");
    const restored = new AgentWorldRuntime(structuredClone(document));
    assert.deepEqual(matrices(restored), matrices(runtime), mutation.id + " survives an exact document reload");
    restored.dispose();
    assert.equal(dnaCreationMeasurements(document).variant.truncated, false);
  }
  const edited = api.exportDocument();
  edited.entities.find(entity => entity.id === "dna-variant").transform.position[0] += 1;
  assert.equal(dnaCreationCanTune(edited), false, "Studio transforms disable template helpers");
  const scaledPad = structuredClone(original);
  scaledPad.entities.find(entity => entity.id === "dna-pad-variant").transform.scale = [1, 2, 1];
  assert.equal(dnaCreationCanTune(scaledPad), false, "changed platforms cannot silently falsify the comparison");
  for (const [id, field, value] of [
    ["dna-pad-variant", "restitution", 0.93], ["dna-pad-reference", "friction", 0.7],
  ]) {
    const changed = structuredClone(original);
    changed.entities.find(entity => entity.id === id).physics[field] = value;
    assert.doesNotThrow(() => validateStoredSceneDefinition(changed));
    const before = structuredClone(changed);
    assert.equal(dnaCreationCanTune(changed), false, "changed " + field + " disables the identical-condition experiment");
    assert.deepEqual(changed, before, "checking compatibility never rewrites the edited document");
  }
  for (const id of ["dna-reference", "dna-seed-variant", "dna-pad-reference"]) {
    const hidden = structuredClone(original);
    hidden.entities.find(entity => entity.id === id).visible = false;
    assert.equal(dnaCreationCanTune(hidden), false, "hidden " + id + " disables the visual experiment");
  }
  const steered = structuredClone(original);
  steered.entities.find(entity => entity.id === "dna-seed-variant").steering = { force: 30, speedCap: 4 };
  assert.doesNotThrow(() => validateStoredSceneDefinition(steered));
  assert.equal(dnaCreationCanTune(steered), false, "custom seed steering disables the free-fall comparison");
  const interactive = structuredClone(original);
  interactive.entities.find(entity => entity.id === "dna-pad-reference").interactions = [{ id: "studio-seed-kick", type: "apply-impulse", targetIds: ["dna-seed-variant"], impulse: [3, 0, 0] }];
  assert.doesNotThrow(() => validateStoredSceneDefinition(interactive));
  assert.equal(dnaCreationCanTune(interactive), false, "custom experiment interactions stay under Studio control");
});

test("DNA height drives real identical-body Rapier bounce while authored launch poses stay stable", t => {
  const runtime = new AgentWorldRuntime(dnaCreation.composeDnaCreation()), api = createAgentWorldApi(runtime);
  t.after(() => runtime.dispose());
  accepted(api.transaction(dnaCreation.dnaMutationCommands(dnaCreation.DNA_MUTATIONS[0])));
  const document = api.exportDocument();
  const seeds = document.entities.filter(entity => entity.id.startsWith("dna-seed-"));
  assert.deepEqual(seeds[0].physics, seeds[1].physics);
  const measured = dnaCreation.dnaCreationMeasurements(document);
  for (const side of dnaCreation.DNA_SIDES) {
    assert.equal(document.entities.find(entity => entity.id === "dna-seed-" + side).transform.position[1], dnaCreation.DNA_PAD_TOP + measured[side].height);
  }
  const peaks = [0, 0], bounced = [false, false];
  for (let frame = 0; frame < 210; frame++) {
    accepted(api.step(1 / 60));
    const states = api.query({ ids: ["dna-seed-reference", "dna-seed-variant"] });
    dnaCreation.DNA_SIDES.forEach((side, index) => {
      const seed = states.find(entity => entity.id === "dna-seed-" + side);
      if (seed.physics.linearVelocity[1] > 0.1) bounced[index] = true;
      if (bounced[index]) peaks[index] = Math.max(peaks[index], seed.position[1] - dnaCreation.DNA_PAD_TOP - dnaCreation.DNA_SEED_RADIUS);
    });
  }
  assert.deepEqual(bounced, [true, true]);
  assert.ok(peaks[1] > peaks[0] * 1.45, JSON.stringify(peaks));
  assert.deepEqual(api.exportDocument(), document);
  accepted(api.transaction(dnaCreation.dnaSeedResetCommands(document)));
  assert.deepEqual(api.exportDocument(), document);
});

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

test("visibility and scale keyframes share clock, exact boundaries, loop, detach and stored document", t => {
  const w = world(t);
  const step = w.api.step(1 / 60);
  assert.equal(w.api.state().elapsedSeconds, step.value, "public clock retains the exact shared simulation time");
  accepted(w.api.create(scene()));
  const behavior = { id: "reveal", type: "keyframes", durationSeconds: 2, scales: [[0, 1, 1, 1], [2, 3, 5, -1]], visibility: [[0, true], [1, false], [2, true]] };
  accepted(w.api.spawn({ id: "reveal-box", type: "box", visible: false, behaviors: [behavior] }));
  const object = w.runtime.getEntityObject("reveal-box");
  for (const [seconds, expected] of [[0, true], [.999, true], [1, false], [1.5, false], [2, true], [7, true]]) {
    motion.sampleKeyframeTrack(behavior, seconds, object.position, object.quaternion, object);
    assert.equal(object.visible, expected, `exact discrete boundary at ${seconds}`);
  }
  motion.sampleKeyframeTrack({ ...behavior, loop: true }, 3, object.position, object.quaternion, object);
  assert.equal(object.visible, false);
  motion.sampleKeyframeTrack({ ...behavior, loop: true }, 4, object.position, object.quaternion, object);
  assert.equal(object.visible, true);
  accepted(w.api.pause(true));
  const authored = w.api.exportDocument(), revision = w.api.state().revision;
  accepted(w.api.step(1));
  assert.equal(object.visible, false);
  assert.ok(object.scale.distanceTo({ x: 2, y: 3, z: 0 }) < 1e-5);
  w.runtime.update(1); assert.equal(object.visible, false, "paused host does not advance tracks");
  accepted(w.api.step(3)); assert.equal(object.visible, true);
  assert.deepEqual(w.api.exportDocument(), authored); assert.equal(w.api.state().revision, revision);
  assert.doesNotThrow(() => validateStoredSceneDefinition(authored));
  accepted(w.api.detachBehavior("reveal-box", "reveal"));
  assert.equal(object.visible, false, "detaching visibility immediately restores authored visibility");
  accepted(w.api.undo());
  assert.equal(w.api.query({ ids: ["reveal-box"] })[0].behaviors[0].id, "reveal");
  const fresh = new AgentWorldRuntime(authored); t.after(() => fresh.dispose());
  fresh.step(3); assert.equal(fresh.getEntityObject("reveal-box").visible, true);
});

test("CubZ pose helper preserves an unrelated document and returns an independent copy", () => {
  const authored = scene(), copy = cubz.cubzStudioPose(authored, 17.123456);
  assert.deepEqual(copy, authored);
  assert.notEqual(copy, authored); copy.entities[0].label = "Copy only";
  assert.notDeepEqual(copy, authored);
});

test("complete CubZ actors use source meshes and one authored cycle for every choice, including direct zero and reverse seven", t => {
  const data = JSON.parse(readFileSync(new URL("../public/assets/ports/archive-cubz-menu.json", import.meta.url), "utf8"));
  const w = world(t);
  accepted(w.api.create(cubz.buildCubzMenu(data))); accepted(w.api.pause(true));
  accepted(w.api.spawn({ id: "user-child", type: "box", parentId: "cubz-screensaver-n1", visible: false, transform: { rotationDegrees: [400, 10, 0] }, behaviors: [{ id: "cubz-user-spin", type: "spin", speedDegrees: 5 }] }));
  const sourceCount = w.api.query({ tag: "cubz-source-mesh" }).length;
  assert.equal(sourceCount, 132);
  for (const actor of cubz.CUBZ_ACTORS) {
    const rig = w.runtime.getEntityObject(`cubz-${actor}-rig`);
    rig.updateWorldMatrix(true, true);
    const reflection = rig.matrix.clone().makeScale(1, 1, -1);
    for (const node of data.actors[actor].nodes) {
      const expected = rig.matrixWorld.clone().multiply(reflection).multiply(rig.matrix.clone().fromArray(node.worldMatrix)).multiply(reflection);
      const actual = w.runtime.getEntityObject(`cubz-${actor}-n${node.id}`).matrixWorld;
      assert.ok(Math.max(...expected.elements.map((value, i) => Math.abs(value - actual.elements[i]))) < 1e-5, `${actor}/${node.name}: source hierarchy/world matrix agrees after one reflection`);
    }
    const meshes = w.api.query({ tag: "cubz-source-mesh" }).filter(entity => entity.id.startsWith(`cubz-${actor}-`));
    assert.equal(meshes.reduce((sum, entity) => sum + entity.mesh.vertexCount, 0), 2968);
    assert.equal(meshes.reduce((sum, entity) => sum + entity.mesh.triangleCount, 0), 3136);
  }
  const initial = w.runtime.getEntityObject("cubz-rotation-n1").quaternion.clone();
  for (let choice = 0; choice < 8; choice++) {
    accepted(w.api.transaction(cubz.cubzSequenceCommands(data, w.api.exportDocument(), "open", choice, w.api.state().elapsedSeconds)));
    assert.equal(cubz.cubzMenuState(w.api.exportDocument(), w.api.state().elapsedSeconds).phase, choice ? "rotating" : "opening");
    const authored = w.api.exportDocument(), revision = w.api.state().revision;
    accepted(w.api.step(3));
    assert.equal(cubz.cubzMenuState(authored, w.api.state().elapsedSeconds).phase, "opened");
    assert.equal(w.runtime.getEntityObject("cubz-open-rig").visible, true);
    assert.equal(w.runtime.getEntityObject("cubz-rotation-rig").visible, false);
    assert.equal(w.runtime.getEntityObject(`cubz-menu-${choice}`).visible, true);
    assert.equal(w.api.state().revision, revision); assert.deepEqual(w.api.exportDocument(), authored);
    assert.doesNotThrow(() => validateStoredSceneDefinition(authored));
    const pose = cubz.cubzStudioPose(authored, w.api.state().elapsedSeconds);
    assert.equal(pose.entities.filter(entity => entity.tags?.includes("cubz-source-mesh")).length, 132);
    assert.ok(pose.entities.some(entity => entity.id === "user-child"), "a user child under a hidden source actor is preserved");
    assert.equal(pose.entities.some(entity => entity.behaviors?.some(behavior => behavior.id === "cubz-source" || behavior.id === "cubz-visibility" || behavior.id.startsWith("cubz-program-"))), false);
    assert.equal(pose.entities.find(entity => entity.id === "user-child").behaviors[0].id, "cubz-user-spin", "foreign behavior with a similar prefix survives");
    assert.deepEqual(pose.entities.find(entity => entity.id === "user-child"), authored.entities.find(entity => entity.id === "user-child"), "foreign authored fields are not normalized or baked");
    assert.doesNotThrow(() => validateStoredSceneDefinition(pose));
    if (choice === 7) {
      const fresh = new AgentWorldRuntime(authored); t.after(() => fresh.dispose());
      fresh.step(Math.min(30, w.api.state().elapsedSeconds));
      // Stored data includes the program and all 3 rigs, not a host callback state machine.
      assert.equal(fresh.exportDocument().entities.filter(entity => entity.tags?.includes("cubz-source-mesh")).length, 132);
    }
    accepted(w.api.transaction(cubz.cubzSequenceCommands(data, authored, "return", choice, w.api.state().elapsedSeconds)));
    accepted(w.api.step(3));
    assert.equal(cubz.cubzMenuState(w.api.exportDocument(), w.api.state().elapsedSeconds).phase, "idle");
    assert.equal(w.runtime.getEntityObject("cubz-open-rig").visible, false);
    assert.equal(w.runtime.getEntityObject("cubz-rotation-rig").visible, true);
    assert.ok(w.runtime.getEntityObject("cubz-rotation-n1").quaternion.angleTo(initial) < 1e-4, `choice ${choice} returns along its own source range`);
  }
  accepted(w.api.transaction(cubz.cubzSequenceCommands(data, w.api.exportDocument(), "saver", 0, w.api.state().elapsedSeconds)));
  accepted(w.api.step(12.5));
  assert.equal(w.runtime.getEntityObject("cubz-screensaver-rig").visible, true);
  const halfway = w.runtime.getEntityObject("cubz-screensaver-n1").quaternion.clone();
  accepted(w.api.step(25));
  assert.ok(w.runtime.getEntityObject("cubz-screensaver-n1").quaternion.angleTo(halfway) < 1e-4, "751 source-frame loop repeats on the shared clock");
  accepted(w.api.transaction(cubz.cubzResetCommands(w.api.exportDocument())));
  assert.equal(w.runtime.getEntityObject("cubz-screensaver-rig").visible, false);
  assert.equal(w.runtime.getEntityObject("cubz-rotation-rig").visible, true);
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

test("native forward flight uses reflected -Z, respects orientation and round-trips while existing +X documents retain their motion", t => {
  const w = world(t);
  accepted(w.api.spawn({ id: "native-plane", type: "group", transform: { position: [2, 5, 7] }, behaviors: [{ id: "native-pilot", type: "flight", speed: 10, forwardAxis: "-z" }] }));
  accepted(w.api.pause(true)); const authored = w.api.exportDocument();
  accepted(w.api.pilotLive("native-plane", { thrust: 1 })); accepted(w.api.step(1));
  assert.deepEqual(w.api.query({ ids: ["native-plane"] })[0].position, [2, 5, -3]);
  assert.deepEqual(w.api.exportDocument(), authored);
  accepted(w.api.update("native-plane", { transform: { position: [2, 5, 7], rotationDegrees: [0, 90, 0] } }));
  accepted(w.api.pilotLive("native-plane", { thrust: 1 })); accepted(w.api.step(1));
  assert.ok(w.api.query({ ids: ["native-plane"] })[0].position.every((n, i) => Math.abs(n - [-8, 5, 7][i]) < 1e-8));
  const exported = w.api.exportDocument(); validateStoredSceneDefinition(exported);
  const reloaded = new AgentWorldRuntime(exported); t.after(() => reloaded.dispose()); reloaded.step(1);
  assert.deepEqual(reloaded.query({ ids: ["native-plane"] })[0].position, [2, 5, 7], "Held native throttle is not serialized");
  for (const axis of [null, "z", "-x", 0, Infinity]) {
    const authoring = () => structuredClone({ document: w.api.exportDocument(), revision: w.api.state().revision,
      history: w.runtime.history, redo: w.runtime.redoHistory, position: w.api.query({ ids: ["native-plane"] })[0].position });
    const checkpoint = authoring();
    assert.equal(w.api.attachBehavior("native-plane", { id: "invalid-axis", type: "flight", forwardAxis: axis }).ok, false);
    assert.deepEqual(authoring(), checkpoint);
    assert.equal(w.api.state().recentEvents.at(-1).type, "transaction.rejected");
    const invalid = structuredClone(exported);
    invalid.entities.find(e => e.id === "native-plane").behaviors[0].forwardAxis = axis;
    assert.throws(() => validateStoredSceneDefinition(invalid), /forwardAxis/);
  }
});

test("FlightX native pose is undoable and preserves authored edits while stopping transient flight at the source start", t => {
  const w = world(t), definition = flightx.buildRecoveredFlightX();
  validateStoredSceneDefinition(definition); accepted(w.api.create(definition)); accepted(w.api.pause(true));
  accepted(w.api.update("flight-plane-model", { label: "My restored airplane" }));
  accepted(w.api.spawn({ id: "my-flight-marker", type: "box", material: { color: "#f5f4f0" }, transform: { position: [3, 8, 2] } }));
  const authored = w.api.exportDocument();
  accepted(w.api.pilotLive("flight-plane", { thrust: 1 })); accepted(w.api.step(.5));
  assert.ok(w.api.query({ ids: ["flight-plane"] })[0].position[2] < -8.99);
  accepted(flightx.applyFlightxPose(w.api, true));
  assert.deepEqual(w.api.query({ ids: ["flight-plane"] })[0].position, [0, 16, 0]);
  const native = w.api.exportDocument(), model = native.entities.find(e => e.id === "flight-plane-model");
  assert.deepEqual(model.transform.rotationDegrees, [0, 0, 0]);
  assert.equal(model.label, "My restored airplane");
  assert.equal(native.entities.find(e => e.id === "my-flight-marker").material.color, "#f5f4f0");
  assert.equal(native.entities.filter(e => e.id.startsWith("flight-guide-")).every(e => e.visible === false), true);
  accepted(w.api.step(.5));
  assert.deepEqual(w.api.query({ ids: ["flight-plane"] })[0].position, [0, 16, 0], "Pose change cannot retain held throttle");
  const canonical = document => ({ ...document, entities: [...document.entities].sort((a, b) => a.id.localeCompare(b.id)) });
  accepted(w.api.undo()); assert.deepEqual(canonical(w.api.exportDocument()), canonical(authored));
  accepted(w.api.redo()); assert.deepEqual(canonical(w.api.exportDocument()), canonical(native));
  accepted(flightx.applyFlightxPose(w.api, false));
  assert.deepEqual(w.api.exportDocument().entities.find(e => e.id === "flight-plane-model").transform.rotationDegrees, [0, 0, 0]);
  assert.equal(w.api.query({ tag: "adapted-inspection-marker" }).every(e => e.visible), true);
  assert.equal(w.api.query({ ids: ["my-flight-marker"] }).length, 1);
  accepted(flightx.applyFlightxPose(w.api, true, "ballz2011"));
  assert.deepEqual(w.api.exportDocument().entities.find(e => e.id === "flight-plane-model").transform.scale, [.001, .001, .001]);
  assert.deepEqual(w.api.exportDocument().entities.find(e => e.id === "flight-source-pipe").transform.scale, [.05, .05, .05]);
});

test("FlightX source pipe composition retains its exported offset, source scale ratio and non-racing status", () => {
  const definition = flightx.buildRecoveredFlightX();
  const plane = definition.entities.find(e => e.id === "flight-plane-model"), pipe = definition.entities.find(e => e.id === "flight-source-pipe");
  assert.deepEqual(plane.transform.scale, [.01, .01, .01]); assert.deepEqual(pipe.transform.scale, [.05, .05, .05]);
  assert.deepEqual(pipe.transform.position, [0, 11, 0]); assert.equal(plane.asset.fitSize, undefined); assert.equal(pipe.asset.fitSize, undefined);
  assert.equal(plane.asset.id, "archive-flightx-airplane"); assert.equal(pipe.asset.id, "archive-flightx-pipe");
  assert.equal(definition.entities.find(e => e.id === "flight-plane").behaviors[0].forwardAxis, "-z");
  assert.deepEqual(definition.environment.envelope, { cameraFar: 600, fogNear: 300, fogFar: 550 });
  assert.equal(definition.rules, undefined);
  assert.equal(definition.entities.filter(e => e.tags?.includes("no-source-race-layout")).length, 8);
});

test("FlightX native assets advertised by the palette spawn through the real API by curated ID alone", t => {
  const w = world(t);
  for (const [index, id] of ["archive-flightx-airplane", "archive-flightx-pipe"].entries()) {
    accepted(w.api.spawn({ id: "original-" + index, type: "model", asset: { id } }));
    assert.equal(w.api.query({ ids: ["original-" + index] })[0].asset.id, id);
  }
  validateStoredSceneDefinition(w.api.exportDocument());
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
    { type: "flight", acceleration: 1 },
    { id: "bad behavior id", type: "flight" },
    { type: "keyframes", durationSeconds: 2, rotations: [[0, 0, 0, 0, 1]], mystery: true },
    { type: "keyframes", durationSeconds: 0, positions: [[0, 0, 0, 0]] },
    { type: "keyframes", durationSeconds: 2, positions: [[1, 0, 0, 0], [1, 2, 0, 0]] },
    { type: "keyframes", durationSeconds: 2, rotations: [[0, 0, 0, 0, 0]] },
    { type: "keyframes", durationSeconds: 2, positions: [[0, 10001, 0, 0]] },
    { type: "keyframes", durationSeconds: 2, visibility: [[0, 1]] },
    { type: "keyframes", durationSeconds: 2, visibility: [[1, true], [1, false]] },
    { type: "keyframes", durationSeconds: 2, visibility: [[3, false]] },
    { type: "keyframes", durationSeconds: 2, visibility: [] },
    { type: "keyframes", durationSeconds: 2, scales: [[0, 1001, 1, 1]] },
    { type: "keyframes", durationSeconds: 2, scales: [[0, 1, NaN, 1]] },
    { type: "keyframes", durationSeconds: 2, visibility: Array.from({ length: 1025 }, (_, i) => [i / 1024, true]) },
  ]) {
    const before = snapshot(w);
    assert.equal(w.api.attachBehavior("plain", { id: "bad", ...behavior }).ok, false);
    assert.deepEqual(w.api.exportDocument(), before.document);
    assert.equal(w.api.state().revision, before.revision);
    assert.deepEqual(w.runtime.history, before.history);
    assert.throws(() => applyCommands(w.api.exportDocument(), [{ op: "attach-behavior", id: "plain", behavior: { id: "bad", ...behavior } }]), { name: "SceneCommandError", status: 400 });
  }
  assert.equal(w.api.attachBehavior("ball", { id: "wrong-mode", type: "flight" }).ok, false);
});
