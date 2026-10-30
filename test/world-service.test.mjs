// GraphysX world service: the headless runtime, the physics host seams, the Mesa rules, exact
// save/resume and the Clawblox HTTP protocol. CPU only, no model, no browser.
//
// The world is TypeScript bundled by Vite (as `npm run build:world-service` does), built once
// here into a temporary directory so the suite never depends on a stale world-service/dist.

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { pathToFileURL } from "node:url";
import { build } from "vite";
import { startWorldServer } from "../world-service/server.mjs";
import { helloAt, parseRecording } from "../world-service/recording.mjs";

const root = new URL("..", import.meta.url);
const fixture = JSON.parse(readFileSync(new URL("fixtures/mesa-island-observe.json", import.meta.url), "utf8"));
const apiMarkdown = readFileSync(new URL("world-service/API.md", root), "utf8");
let outDir;
let m;

before(async () => {
  outDir = mkdtempSync(join(tmpdir(), "graphysx-world-service-"));
  await build({ configFile: new URL("vite.world-service.config.ts", root).pathname, root: root.pathname, build: { outDir, emptyOutDir: true }, logLevel: "silent" });
  m = await import(pathToFileURL(join(outDir, "world.js")).href);
});
after(() => { if (outDir) rmSync(outDir, { recursive: true, force: true }); });

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const flat = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const entity = (observation, name) => observation.world.entities.find((item) => item.name === name);

function walkTo(world, session, target, maxSeconds = 8) {
  world.apply(session, { type: "MoveTo", data: { position: target } });
  for (let tick = 0; tick < maxSeconds * 60; tick += 1) {
    world.step();
    if (flat(world.observe(session).player.position, target) <= 0.6) return;
  }
  throw new Error(`did not reach ${target}`);
}

describe("headless scene runtime", () => {
  it("loads and steps every starter without a browser", () => {
    for (const starter of m.GRAPHYSX_AGENT_WORLD_STARTERS) {
      const runtime = new m.AgentWorldRuntime();
      const loaded = runtime.loadStarter(starter.id);
      assert.equal(loaded.ok, true, `${starter.id}: ${JSON.stringify(loaded.error ?? "")}`);
      runtime.step(1);
      assert.ok(runtime.query({}).length > 0, starter.id);
    }
  });

  it("builds model collision surfaces from disk", async () => {
    const publicRoot = new URL("public/", root);
    m.setAgentWorldAssetFetch(async (url) => new Response(await readFile(new URL(`.${url}`, publicRoot))));
    try {
      const runtime = new m.AgentWorldRuntime();
      assert.equal(runtime.loadStarter("archive-great-slide").ok, true);
      for (let wait = 0; wait < 50 && runtime.query({ ids: ["great-slide-terrain"] })[0].asset?.status !== "ready"; wait += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      runtime.step(4);
      // Without the trimesh the ball falls through the slide to y ~ -60.
      assert.ok(runtime.query({ ids: ["great-slide-ball"] })[0].position[1] > 0, "the ball rolls on the model");
    } finally {
      m.setAgentWorldAssetFetch(null);
    }
  });

  it("applies host poses without a revision or an event", () => {
    const runtime = new m.AgentWorldRuntime({
      schema: "graphysx.agent-world/v2", id: "poses", label: "Poses",
      entities: [{ id: "crate", type: "box", transform: { position: [0, 1, 0] }, physics: { mode: "dynamic" } }],
    });
    runtime.setPaused(true);
    const before = runtime.getState();
    const events = runtime.readEvents().events.length;
    assert.equal(runtime.applyHostPoses([{ id: "crate", position: [3, 4, 5], quaternion: [0, 0, 0, 1] }, { id: "ghost", position: [0, 0, 0], quaternion: [0, 0, 0, 1] }]), 1);
    assert.deepEqual(runtime.query({ ids: ["crate"] })[0].position, [3, 4, 5]);
    assert.equal(runtime.getState().revision, before.revision);
    assert.equal(runtime.readEvents().events.length, events);
  });
});

describe("physics host seams", () => {
  const box = (engine, mode, position, half = [0.5, 0.5, 0.5]) => engine.createBody({
    mode, mass: 1, transform: { position: { x: position[0], y: position[1], z: position[2] }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
    shapes: [{ kind: "box", halfExtents: { x: half[0], y: half[1], z: half[2] } }],
  });
  const identity = { x: 0, y: 0, z: 0, w: 1 };

  it("answers overlaps, ignoring sensors and excluded bodies", () => {
    const engine = new m.RapierPhysicsEngine();
    const floor = box(engine, "static", [0, -0.5, 0], [10, 0.5, 10]);
    const crate = box(engine, "dynamic", [0, 0.5, 0]);
    const trigger = box(engine, "trigger", [5, 0.5, 0]);
    engine.step(1 / 60);
    assert.equal(engine.overlapsBox({ x: 0, y: 0.5, z: 0 }, { x: 0.4, y: 0.4, z: 0.4 }, identity), true);
    assert.equal(engine.overlapsBox({ x: 0, y: 0.5, z: 0 }, { x: 0.4, y: 0.4, z: 0.4 }, identity, [crate]), false);
    assert.equal(engine.overlapsBox({ x: 5, y: 0.5, z: 0 }, { x: 0.4, y: 0.4, z: 0.4 }, identity), false, "triggers are sensors");
    engine.setBodyCollision(crate, false);
    engine.setBodyCollision(trigger, true);
    engine.step(1 / 60);
    assert.equal(engine.overlapsBox({ x: 0, y: 0.5, z: 0 }, { x: 0.4, y: 0.4, z: 0.4 }, identity), false, "collision off");
    assert.equal(engine.overlapsBox({ x: 5, y: 0.5, z: 0 }, { x: 0.4, y: 0.4, z: 0.4 }, identity), false, "a trigger stays a sensor");
    void floor;
  });

  it("carries a body kinematically and hands it back", () => {
    const engine = new m.RapierPhysicsEngine();
    box(engine, "static", [0, -0.5, 0], [10, 0.5, 10]);
    const crate = box(engine, "dynamic", [0, 3, 0]);
    engine.setBodyMotion(crate, "kinematic");
    const out = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } };
    for (let tick = 0; tick < 30; tick += 1) {
      engine.writeKinematicTarget(crate, { position: { x: tick * 0.1, y: 3, z: 0 }, rotation: identity });
      engine.step(1 / 60);
    }
    engine.readTransform(crate, out);
    assert.ok(Math.abs(out.position.y - 3) < 1e-6 && Math.abs(out.position.x - 2.9) < 1e-6, "follows its target, no gravity");
    engine.setBodyMotion(crate, "dynamic");
    // It keeps the velocity it was carried with (6 m/s here); a host that sets it down stops it.
    const carried = { x: 0, y: 0, z: 0 };
    engine.readLinearVelocity(crate, carried);
    assert.ok(Math.abs(carried.x - 6) < 0.01, `carried velocity ${carried.x}`);
    engine.writeLinearVelocity(crate, { x: 0, y: 0, z: 0 });
    for (let tick = 0; tick < 120; tick += 1) engine.step(1 / 60);
    engine.readTransform(crate, out);
    assert.ok(Math.abs(out.position.y - 0.5) < 0.02 && Math.hypot(out.position.x - 2.9, out.position.z) < 0.2, `falls straight down and rests: ${JSON.stringify(out.position)}`);
    assert.throws(() => engine.writeKinematicTarget(crate, { position: { x: 0, y: 0, z: 0 }, rotation: identity }));
  });

  it("walks a character, blocks it at walls and reports contacts", () => {
    const engine = new m.RapierPhysicsEngine();
    const floor = box(engine, "static", [0, -0.5, 0], [10, 0.5, 10]);
    box(engine, "static", [3, 1, 0], [0.5, 1, 2]);
    const crate = box(engine, "dynamic", [0, 0.5, 3]);
    const walker = engine.createCharacter({ position: { x: 0, y: 1.2, z: 0 }, radius: 0.5, halfHeight: 0.5, snapToGround: 0.2 });
    const move = { movement: { x: 0, y: 0, z: 0 }, grounded: false };
    const at = { x: 0, y: 0, z: 0 };
    for (let tick = 0; tick < 120; tick += 1) {
      engine.moveCharacter(walker, { x: 0.1, y: -0.2, z: 0 }, move);
      engine.step(1 / 60);
    }
    engine.readCharacterPosition(walker, at);
    assert.ok(at.x < 2.5 && at.x > 1.9, `stopped by the wall at x ${at.x}`);
    assert.equal(move.grounded, true);
    for (let tick = 0; tick < 60; tick += 1) engine.step(1 / 60);
    const touching = [];
    engine.readContacts(crate, touching);
    assert.deepEqual(touching, [floor]);
    engine.writeCharacterPosition(walker, { x: -4, y: 1, z: -4 });
    engine.step(1 / 60);
    engine.readCharacterPosition(walker, at);
    assert.deepEqual([Math.round(at.x), Math.round(at.z)], [-4, -4]);
  });

  it("restores a saved world bit for bit and refuses partial bindings", () => {
    const make = () => {
      const engine = new m.RapierPhysicsEngine();
      const floor = box(engine, "static", [0, -0.5, 0], [10, 0.5, 10]);
      const crates = [0, 1, 2].map((index) => box(engine, "dynamic", [index * 0.3, 2 + index * 1.1, 0]));
      return { engine, handles: [floor, ...crates] };
    };
    const a = make();
    for (let tick = 0; tick < 50; tick += 1) a.engine.step(1 / 60);
    const state = a.engine.saveState();
    const ids = a.handles.map((handle) => a.engine.stateId(handle));
    const b = make();
    assert.throws(() => b.engine.restoreState(state, b.handles.slice(1).map((handle, index) => [handle, ids[index + 1]])), /must be bound/);
    b.engine.restoreState(state, b.handles.map((handle, index) => [handle, ids[index]]));
    const read = ({ engine, handles }) => handles.map((handle) => {
      const out = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } };
      engine.readTransform(handle, out);
      return [out.position.x, out.position.y, out.position.z, out.rotation.x, out.rotation.y, out.rotation.z, out.rotation.w];
    });
    for (let tick = 0; tick < 90; tick += 1) { a.engine.step(1 / 60); b.engine.step(1 / 60); }
    assert.deepEqual(read(b), read(a));
  });
});

describe("Mesa island rules", () => {
  it("keeps the Clawblox observation shape", () => {
    const world = new m.IslandWorld();
    const { session } = world.join("Shape");
    world.advance(1);
    const observation = world.observe(session);
    assert.deepEqual(Object.keys(observation).sort(), Object.keys(fixture).sort());
    assert.deepEqual(Object.keys(observation.player).sort(), Object.keys(fixture.player).sort());
    assert.deepEqual(Object.keys(observation.player.attributes).sort(), Object.keys(fixture.player.attributes).sort());
    const names = (o) => o.world.entities.map((item) => item.name).sort();
    assert.deepEqual(names(observation), names(fixture));
    for (const key of Object.keys(entity(fixture, "Block_1"))) assert.ok(key in entity(observation, "Block_1"), `entity field ${key}`);
    assert.equal(observation.game_status, fixture.game_status);
    // Clawblox's boundary walls are fully transparent: agents see that, viewers draw nothing.
    for (const wall of fixture.world.entities.filter((item) => item.name.startsWith("Boundary"))) {
      assert.equal(entity(observation, wall.name).transparency, wall.transparency, `${wall.name} transparency`);
    }
    const walls = world.runtime.exportDefinition().entities.filter((item) => item.label?.startsWith("Boundary"));
    assert.equal(walls.length, 4);
    assert.ok(walls.every((item) => item.visible === false && item.physics?.mode === "static"), "invisible, still solid");
  });

  it("settles the pile and stands the character where Clawblox does", () => {
    const world = new m.IslandWorld();
    const { session } = world.join("Settle");
    world.advance(4);
    const observation = world.observe(session);
    // Clawblox reports a resting player at y = 2.55 on Mesa ground (measured 2026-10-29).
    assert.ok(Math.abs(observation.player.position[1] - 2.55) < 0.1, `player y ${observation.player.position[1]}`);
    const blocks = observation.world.entities.filter((item) => item.name.startsWith("Block_"));
    assert.equal(blocks.length, 12);
    for (const block of blocks) assert.ok(block.position[1] > 0.2 && block.position[1] < 6, `${block.name} y ${block.position[1]}`);
    assert.ok(Math.abs(entity(observation, "Rock_1").position[1] - 3.05) < 0.1, "the rock rests on SmallPlateau");
  });

  it("walks at Clawblox speed, stops within 0.5 and jumps about two studs", () => {
    const world = new m.IslandWorld();
    const { session } = world.join("Walker");
    world.advance(1);
    const start = world.observe(session).player.position;
    // West along z = 0 is open ground; the settled block pile lies east of spawn.
    const target = [start[0] - 16, start[1], start[2]];
    world.apply(session, { type: "MoveTo", data: { position: target } });
    world.advance(0.5);
    assert.ok(Math.abs(flat(world.observe(session).player.position, start) - 8) < 0.5, "16 studs per second");
    world.advance(1);
    const end = world.observe(session).player.position;
    assert.ok(flat(end, target) <= 0.55, `stopped ${flat(end, target)} from target`);
    world.apply(session, { type: "Jump" });
    let apex = end[1];
    for (let tick = 0; tick < 60; tick += 1) { world.step(); apex = Math.max(apex, world.observe(session).player.position[1]); }
    assert.ok(apex - end[1] > 1.6 && apex - end[1] < 2.6, `apex ${apex - end[1]}`);
  });

  it("picks up, carries, places and throws like Mesa", () => {
    const world = new m.IslandWorld();
    const { session } = world.join("Builder");
    world.advance(4);
    const block = entity(world.observe(session), "Block_1");
    const approach = [block.position[0] - 2.5, 2.5, block.position[2]];
    walkTo(world, session, approach);
    assert.equal(world.apply(session, { type: "Place", data: { position: [0, 1, 0] } }), "PlaceFailed:EmptyHands");
    assert.equal(world.apply(session, { type: "Throw", data: { direction: [1, 0, 0] } }), "ThrowFailed:EmptyHands");
    assert.equal(world.apply(session, { type: "Pickup", data: { position: [40, 1, 40] } }), "PickupFailed:OutOfRange");
    const current = entity(world.observe(session), "Block_1").position;
    assert.equal(world.apply(session, { type: "Pickup", data: { position: current } }), "PickupSuccess");
    assert.equal(world.apply(session, { type: "Pickup", data: { position: current } }), "PickupFailed:AlreadyHolding");

    walkTo(world, session, [approach[0] - 6, 2.5, approach[2] + 3]);
    let observation = world.observe(session);
    const player = observation.player.position;
    assert.ok(dist(entity(observation, "Block_1").position, [player[0], player[1] + 3.5, player[2]]) < 0.4, "rides 3.5 above the carrier");

    const spot = [player[0] + 2, 0.375, player[2]];
    assert.equal(world.apply(session, { type: "Place", data: { position: spot, rotation: { yaw: 45 } } }), "PlaceSuccess");
    world.advance(1);
    const placed = entity(world.observe(session), "Block_1");
    assert.ok(dist(placed.position, spot) < 0.05, `placed at ${placed.position}`);
    assert.equal(placed.anchored, false);
    assert.ok(Math.abs(placed.rotation[0][0] - Math.cos(Math.PI / 4)) < 0.02, "yaw 45 applied");

    // Clawblox placement rule (measured 2026-10-29): flush contact is free, overlap is not.
    assert.equal(world.apply(session, { type: "Pickup", data: { position: placed.position } }), "PickupSuccess");
    world.advance(0.2);
    const side = [player[0], 0, player[2] - 2.5];
    assert.equal(world.apply(session, { type: "Place", data: { position: [side[0], 0.374, side[2]] } }), "PlaceFailed:Occupied");
    assert.equal(world.apply(session, { type: "Place", data: { position: [side[0], 0.375, side[2]] } }), "PlaceSuccess");
    world.advance(1);
    const flush = entity(world.observe(session), "Block_1").position;
    assert.equal(world.apply(session, { type: "Pickup", data: { position: flush } }), "PickupSuccess");
    world.advance(0.2);
    assert.equal(world.apply(session, { type: "Place", data: { position: [player[0], 0.375, player[2]] } }), "PlaceFailed:Occupied", "not inside the carrier");
    assert.equal(world.apply(session, { type: "Throw", data: { direction: [0, 0, 0] } }), "ThrowFailed:InvalidDirection");
    assert.equal(world.apply(session, { type: "Throw", data: { direction: [1, 0, 0], speed: 99 } }), "ThrowSuccess");
    world.advance(2);
    observation = world.observe(session);
    const thrown = entity(observation, "Block_1").position;
    assert.ok(thrown[0] - observation.player.position[0] > 5 && thrown[1] < 1, `thrown to ${thrown}`);
    assert.equal(world.apply(session, { type: "Fly" }), "InvalidAction");
  });

  it("bursts the rock into slate cubes when it lands hard", () => {
    const world = new m.IslandWorld();
    const { session } = world.join("Thrower");
    world.advance(4);
    const rock = entity(world.observe(session), "Rock_1").position;
    // SmallPlateau is 2 high (above autostep); the rock is in reach from the ground south of it.
    walkTo(world, session, [rock[0], 2.5, 22.8]);
    assert.equal(world.apply(session, { type: "Pickup", data: { position: rock } }), "PickupSuccess");
    world.advance(0.5);
    assert.deepEqual(world.drainChanges().filter((change) => change.added?.some((item) => item.entity.id.startsWith("impactblock"))), []);
    assert.equal(world.apply(session, { type: "Throw", data: { direction: [0, 0, -1], speed: 10 } }), "ThrowSuccess");
    world.advance(3);
    const cubes = world.observe(session).world.entities.filter((item) => item.name.startsWith("ImpactBlock_"));
    assert.ok(cubes.length >= 1 && cubes.length <= 8, `${cubes.length} impact cubes`);
    assert.equal(cubes[0].attributes.IsPickupObject, true);
    const added = world.drainChanges().flatMap((change) => change.added ?? []);
    assert.ok(added.some((item) => item.entity.label === cubes[0].name), "viewers are told about new cubes");
  });

  it("spawns later joiners apart and keeps the tick cheap", () => {
    const world = new m.IslandWorld();
    const sessions = Array.from({ length: 8 }, (_, index) => world.join(`agent-${index}`).session);
    world.advance(1);
    const started = performance.now();
    world.advance(5);
    const msPerTick = (performance.now() - started) / 300;
    const positions = sessions.map((session) => world.observe(session).player.position);
    for (let i = 0; i < positions.length; i += 1) for (let j = i + 1; j < positions.length; j += 1) assert.ok(flat(positions[i], positions[j]) > 1.9, "no two capsules overlap");
    // Measured ~0.3 ms; overlapping capsules made it 20x worse. Generous for shared machines.
    assert.ok(msPerTick < 4, `${msPerTick.toFixed(2)} ms per tick with 8 agents`);
  });
});

describe("exact save and resume", () => {
  it("continues bit for bit mid-walk, mid-carry, mid-place and mid-throw", () => {
    const a = new m.IslandWorld();
    const walker = a.join("Walker").session;
    const builder = a.join("Builder").session;
    a.advance(4);
    const block = entity(a.observe(builder), "Block_2").position;
    walkTo(a, builder, [block[0] - 2.5, 2.5, block[2]]);
    assert.equal(a.apply(builder, { type: "Pickup", data: { position: entity(a.observe(builder), "Block_2").position } }), "PickupSuccess");
    a.apply(walker, { type: "MoveTo", data: { position: [-20, 2.5, 10] } });
    a.advance(0.4);
    a.apply(builder, { type: "Throw", data: { direction: [0, 0, 1], speed: 8 } });
    a.advance(0.05);
    a.postChat(walker, "hello");
    const snapshot = JSON.parse(JSON.stringify(a.snapshot()));
    assert.equal(snapshot.format, m.SNAPSHOT_FORMAT);
    const b = new m.IslandWorld(snapshot);
    for (const world of [a, b]) {
      world.advance(1);
      world.apply(walker, { type: "Jump" });
      world.advance(1.5);
    }
    assert.deepEqual(b.poseFrame(), a.poseFrame());
    assert.deepEqual(b.observe(walker), a.observe(walker));
    assert.deepEqual(b.observe(builder), a.observe(builder));
    assert.deepEqual(b.chatMessages(null, 10), a.chatMessages(null, 10));
  });

  it("refuses a snapshot of another world", () => {
    const world = new m.IslandWorld();
    world.join("x");
    const snapshot = JSON.parse(JSON.stringify(world.snapshot()));
    snapshot.world.contentHash = "0000000000000000";
    assert.throws(() => new m.IslandWorld(snapshot), /another world/);
  });
});

describe("HTTP protocol", () => {
  const call = async (base, method, path, body, headers = {}) => {
    const response = await fetch(base + path, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const type = response.headers.get("content-type") ?? "";
    return { status: response.status, body: type.includes("json") ? await response.json() : await response.text() };
  };

  it("serves join, observe, input, chat, snapshot and spectate, then resumes sessions", async () => {
    const running = await startWorldServer({ module: m, apiMarkdown, port: 0, operatorToken: "op-test", spectateHz: 10 });
    let snapshot;
    let session;
    try {
      const base = running.url;
      assert.match((await call(base, "GET", "/api.md")).body, /# Mesa World/);
      assert.equal((await call(base, "GET", "/observe")).status, 401);
      const joined = await call(base, "POST", "/join?name=HttpAgent");
      session = joined.body.session;
      const auth = { "x-session": session };
      for (const body of [null, [], false]) {
        assert.equal((await call(base, "POST", "/chat", body, auth)).status, 400, "non-object JSON is a client error");
        assert.equal((await call(base, "POST", "/input", body, auth)).status, 400);
      }
      // Clawblox's /join contract: a known X-Session rejoins (same session, no second avatar);
      // an unknown one is ignored and a new session is made.
      const rejoined = await call(base, "POST", "/join?name=HttpAgent", undefined, auth);
      assert.deepEqual(rejoined.body, joined.body, "a known X-Session rejoins");
      const fresh = await call(base, "POST", "/join?name=Other", undefined, { "x-session": "not-a-session" });
      assert.notEqual(fresh.body.session, session, "an unknown X-Session gets a new session");
      assert.equal(running.world.observe(session).other_players.length, 1, "one avatar per session: HttpAgent and Other");
      const before = await call(base, "GET", "/observe", undefined, auth);
      const acted = await call(base, "POST", "/input", { type: "Jump", data: {} }, auth);
      assert.ok(acted.body.tick > before.body.tick, "input answers after a fresh tick");
      assert.equal((await call(base, "POST", "/input", { type: "MoveTo", data: {} }, auth)).status, 400);
      assert.match((await call(base, "POST", "/chat", { content: "hello island" }, auth)).body.created_at, /^2000-01-01T/, "simulation clock");
      assert.equal((await call(base, "GET", "/chat/messages?limit=5", undefined, auth)).body.messages.at(-1).content, "hello island");
      assert.equal((await call(base, "GET", "/snapshot")).status, 403);
      snapshot = (await call(base, "GET", "/snapshot", undefined, { "x-operator-token": "op-test" })).body;
      assert.equal(snapshot.format, m.SNAPSHOT_FORMAT);

      const controller = new AbortController();
      const stream = await fetch(`${base}/spectate`, { signal: controller.signal });
      const reader = stream.body.getReader();
      let text = "";
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline && (text.match(/event: frame/g) ?? []).length < 3) text += new TextDecoder().decode((await reader.read()).value);
      controller.abort();
      const hello = JSON.parse(text.split("\n").find((line) => line.startsWith("data: {\"format\"")).slice(6));
      assert.ok(hello.document.entities.some((item) => item.type === "agent" && item.label === "HttpAgent"), "the avatar is in the document");
      const frames = text.split("\n").filter((line) => line.startsWith("data: {\"tick\"")).map((line) => JSON.parse(line.slice(6)));
      assert.ok(frames.length >= 2 && frames.at(-1).tick > frames[0].tick, "pose frames stream");
    } finally {
      await running.close();
    }
    const resumed = await startWorldServer({ module: m, apiMarkdown, port: 0, snapshot, realtime: false });
    try {
      const observed = await call(resumed.url, "GET", "/observe", undefined, { "x-session": session });
      assert.equal(observed.status, 200, "the same X-Session works after resume");
      assert.equal(observed.body.tick, snapshot.tick);
    } finally {
      await resumed.close();
    }
  });
});

describe("world shutdown", () => {
  it("drains an accepted input before disabling the tick loop and closing HTTP", { timeout: 5000 }, async () => {
    const running = await startWorldServer({ module: m, apiMarkdown, port: 0 });
    const { session } = running.world.join("Agent");
    const enqueue = running.world.enqueue.bind(running.world);
    let closed;
    running.world.enqueue = (...args) => {
      const pending = enqueue(...args);
      closed = running.close();
      return pending;
    };
    try {
      const response = await fetch(`${running.url}/input`, { method: "POST", headers: { "x-session": session, "content-type": "application/json" }, body: JSON.stringify({ type: "Jump" }) });
      assert.equal(response.status, 200);
      await response.json();
      assert.equal(running.world.actions.length, 1);
      assert.equal(running.close(), closed, "shutdown is idempotent");
      await closed;
    } finally { await running.close(); }
  });
});

describe("viewers and first-person images (phase 3)", () => {
  const call = async (base, method, path, headers = {}) => {
    const response = await fetch(base + path, { method, headers });
    const type = response.headers.get("content-type") ?? "";
    return {
      status: response.status,
      headers: response.headers,
      body: type.includes("json") ? await response.json() : Buffer.from(await response.arrayBuffer()),
    };
  };

  it("serves GET /observe/image through its renderer, with Clawblox's sizes and camera", async () => {
    const requests = [];
    let fail = false;
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const renderImage = async (request) => {
      requests.push(request);
      if (fail) throw new Error("browser gone");
      return png;
    };
    const running = await startWorldServer({ module: m, apiMarkdown, port: 0, realtime: false, renderImage });
    const off = await startWorldServer({ module: m, apiMarkdown, port: 0, realtime: false });
    try {
      assert.equal((await call(running.url, "GET", "/observe/image")).status, 401, "X-Session required");
      const { session } = running.world.join("Viewer");
      running.world.advance(1);
      const auth = { "x-session": session };
      const image = await call(running.url, "GET", "/observe/image", auth);
      assert.equal(image.status, 200);
      assert.equal(image.headers.get("content-type"), "image/png");
      assert.equal(image.headers.get("cache-control"), "no-store");
      assert.deepEqual(image.body, png);
      const [request] = requests;
      const player = running.world.observe(session).player.position;
      assert.deepEqual([request.width, request.height, request.fovDeg], [1088, 640, 105]);
      assert.ok(dist(request.position, [player[0], player[1] + 2, player[2]]) < 0.01, "eye = player + 2");
      assert.deepEqual(request.forward, [0, 0, -1]);
      assert.match(request.entityId, /^agent-\d+$/, "the avatar to hide");
      assert.equal(request.tick, running.world.tick);

      assert.equal((await call(running.url, "GET", "/observe/image?width=320&height=180", auth)).status, 200);
      assert.deepEqual([requests[1].width, requests[1].height], [320, 180]);
      assert.deepEqual([(await call(running.url, "GET", "/observe/image?width=99999&height=1", auth)).status, requests[2].width, requests[2].height], [200, 1920, 64]);
      const bad = await call(running.url, "GET", "/observe/image?width=wide", auth);
      assert.equal(bad.status, 400);
      assert.match(bad.body.error, /whole number/);
      assert.equal(requests.length, 3, "a refused size never reaches the renderer");

      fail = true;
      const down = await call(running.url, "GET", "/observe/image", auth);
      assert.equal(down.status, 503);
      assert.equal(down.headers.get("retry-after"), "5");
      assert.match(down.body.error, /browser gone/);

      const { session: other } = off.world.join("Blind");
      const disabled = await call(off.url, "GET", "/observe/image", { "x-session": other });
      assert.equal(disabled.status, 503);
      assert.match(disabled.body.error, /turned off/);
    } finally {
      await running.close();
      await off.close();
    }
  });

  it("streams actions to spectators, answers any origin on read-only routes, and records a replayable file", async () => {
    const recordDir = mkdtempSync(join(tmpdir(), "graphysx-world-record-"));
    const running = await startWorldServer({ module: m, apiMarkdown, port: 0, spectateHz: 10, recordDir });
    try {
      const health = await call(running.url, "GET", "/healthz", { origin: "http://viewer.test" });
      assert.equal(health.headers.get("access-control-allow-origin"), "*");
      assert.equal(typeof health.body.tick, "number");
      const joined = await call(running.url, "POST", "/join?name=Streamer");
      assert.equal(joined.headers.get("access-control-allow-origin"), null, "agent routes stay same-origin");

      const controller = new AbortController();
      const stream = await fetch(`${running.url}/spectate`, { signal: controller.signal, headers: { origin: "http://viewer.test" } });
      assert.equal(stream.headers.get("access-control-allow-origin"), "*");
      const reader = stream.body.getReader();
      let text = "";
      const auth = { "content-type": "application/json", "x-session": joined.body.session };
      const acted = fetch(`${running.url}/input`, { method: "POST", headers: auth, body: JSON.stringify({ type: "Pickup", data: { position: [40, 1, 40] } }) });
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline && !text.includes("event: action")) text += new TextDecoder().decode((await reader.read()).value);
      controller.abort();
      await acted;
      const block = text.split("\n\n").find((item) => item.startsWith("event: action"));
      assert.ok(block, "an action event reaches spectators");
      const action = JSON.parse(block.split("\n").find((item) => item.startsWith("data: ")).slice(6));
      assert.deepEqual([action.agent, action.input.type, action.result], ["Streamer", "Pickup", "PickupFailed:OutOfRange"]);
    } finally {
      await running.close();
    }
    const recording = parseRecording(readFileSync(join(recordDir, "graphysx-recording.ndjson"), "utf8"));
    rmSync(recordDir, { recursive: true, force: true });
    assert.equal(recording.actions.at(-1).result, "PickupFailed:OutOfRange");
    const hello = helloAt(recording, recording.lastTick);
    assert.ok(hello.document.entities.some((item) => item.type === "agent" && item.label === "Streamer"), "the join is replayed into the document");
    assert.equal(recording.lastTick, Math.max(recording.actions.at(-1).tick, recording.frames.at(-1)?.tick ?? 0, recording.changes.at(-1).tick));
  });
});
