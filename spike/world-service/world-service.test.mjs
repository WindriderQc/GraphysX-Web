// Spike checks: deterministic world logic plus the HTTP protocol, CPU only, no model.
// Run from the repository root after `node spike/world-service/build.mjs`:
//   node --test spike/world-service/world-service.test.mjs
// Kept outside test/ on purpose: the hosted gate does not build the spike bundle.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { IslandWorld, startWorldServer } from "./.build/index.js";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/mesa-island-observe.json", import.meta.url), "utf8"));
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
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

test("observation keeps the Clawblox Mesa shape", () => {
  const world = new IslandWorld();
  const { session } = world.join("Shape");
  world.advance(1);
  const observation = world.observe(session);
  assert.deepEqual(Object.keys(observation).sort(), Object.keys(fixture).sort());
  assert.deepEqual(Object.keys(observation.player).sort(), Object.keys(fixture.player).sort());
  assert.deepEqual(Object.keys(observation.player.attributes).sort(), Object.keys(fixture.player.attributes).sort());
  const names = (o) => o.world.entities.map((item) => item.name).sort();
  assert.deepEqual(names(observation), names(fixture));
  const fixtureBlock = entity(fixture, "Block_1");
  for (const key of Object.keys(fixtureBlock)) assert.ok(key in entity(observation, "Block_1"), `entity field ${key}`);
  assert.equal(observation.game_status, fixture.game_status);
});

test("blocks settle and the character stands where Clawblox's does", () => {
  const world = new IslandWorld();
  const { session } = world.join("Settle");
  world.advance(4);
  const observation = world.observe(session);
  // Clawblox reports a resting player at y = 2.55 on Mesa ground (measured 2026-10-29).
  assert.ok(Math.abs(observation.player.position[1] - 2.55) < 0.1, `player y ${observation.player.position[1]}`);
  const blocks = observation.world.entities.filter((item) => item.name.startsWith("Block_"));
  assert.equal(blocks.length, 12);
  for (const block of blocks) assert.ok(block.position[1] > 0.2 && block.position[1] < 6, `${block.name} y ${block.position[1]}`);
  assert.ok(Math.abs(entity(observation, "Rock_1").position[1] - 3.05) < 0.1, "rock rests on SmallPlateau");
});

test("MoveTo walks at Clawblox speed and stops within 0.5 studs", () => {
  const world = new IslandWorld();
  const { session } = world.join("Walker");
  world.advance(1);
  const start = world.observe(session).player.position;
  // West along z = 0 is open ground; the settled block pile lies east of spawn.
  const target = [start[0] - 16, start[1], start[2]];
  world.apply(session, { type: "MoveTo", data: { position: target } });
  world.advance(0.5);
  const halfway = world.observe(session).player.position;
  assert.ok(Math.abs(flat(halfway, start) - 8) < 0.5, `moved ${flat(halfway, start)} in 0.5 s`);
  world.advance(1);
  const end = world.observe(session).player.position;
  assert.ok(flat(end, target) <= 0.55, `stopped ${flat(end, target)} from target`);
  world.advance(0.5);
  assert.ok(flat(world.observe(session).player.position, end) < 0.01, "stays put after arrival");
});

test("Jump lifts the character about two studs and lands", () => {
  const world = new IslandWorld();
  const { session } = world.join("Jumper");
  world.advance(1);
  const ground = world.observe(session).player.position[1];
  world.apply(session, { type: "Jump" });
  let apex = ground;
  for (let tick = 0; tick < 60; tick += 1) { world.step(); apex = Math.max(apex, world.observe(session).player.position[1]); }
  assert.ok(apex - ground > 1.6 && apex - ground < 2.6, `apex ${apex - ground}`);
  assert.ok(Math.abs(world.observe(session).player.position[1] - ground) < 0.1, "back on the ground");
});

test("Pickup, carry, Place and Throw follow Mesa rules", () => {
  const world = new IslandWorld();
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

  // Carry: the block rides 3.5 studs above the carrier while it walks.
  walkTo(world, session, [approach[0] - 6, 2.5, approach[2] + 3]);
  let observation = world.observe(session);
  const held = entity(observation, "Block_1").position;
  const player = observation.player.position;
  assert.ok(distance(held, [player[0], player[1] + 3.5, player[2]]) < 0.4, `held ${held} vs player ${player}`);

  // Place two studs ahead on the ground; it eases in, then becomes a dynamic block again.
  const spot = [player[0] + 2, 0.375, player[2]];
  assert.equal(world.apply(session, { type: "Place", data: { position: spot, rotation: { yaw: 45 } } }), "PlaceSuccess");
  world.advance(1);
  observation = world.observe(session);
  const placed = entity(observation, "Block_1");
  assert.ok(distance(placed.position, spot) < 0.05, `placed at ${placed.position}`);
  assert.equal(placed.anchored, false);
  assert.ok(Math.abs(placed.rotation[0][0] - Math.cos(Math.PI / 4)) < 0.02, "yaw 45 applied");

  // A second block cannot be placed into the first one.
  assert.equal(world.apply(session, { type: "Pickup", data: { position: placed.position } }), "PickupSuccess");
  world.advance(0.2);
  assert.equal(world.apply(session, { type: "Place", data: { position: [player[0], 0.375, player[2]] } }), "PlaceFailed:Occupied");
  assert.equal(world.apply(session, { type: "Throw", data: { direction: [0, 0, 0] } }), "ThrowFailed:InvalidDirection");

  // Throw: speed clamps to 10, plus 6 up; the block lands well away from the thrower.
  assert.equal(world.apply(session, { type: "Throw", data: { direction: [1, 0, 0], speed: 99 } }), "ThrowSuccess");
  world.advance(2);
  observation = world.observe(session);
  const thrown = entity(observation, "Block_1").position;
  assert.ok(thrown[0] - observation.player.position[0] > 5, `thrown to ${thrown}`);
  assert.ok(thrown[1] < 1, "thrown block came down");
  assert.equal(world.apply(session, { type: "Fly" }), "InvalidAction");
});

test("HTTP: join, observe, input, chat, snapshot and spectate", async () => {
  const running = await startWorldServer({ port: 0, operatorToken: "op-test", spectateHz: 10 });
  try {
    const call = async (method, path, body, headers = {}) => {
      const response = await fetch(running.url + path, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
      const type = response.headers.get("content-type") ?? "";
      return { status: response.status, body: type.includes("json") ? await response.json() : await response.text() };
    };
    assert.equal((await call("GET", "/api.md")).status, 200);
    assert.equal((await call("GET", "/observe")).status, 401);
    const joined = await call("POST", "/join?name=HttpAgent");
    assert.equal(joined.status, 200);
    assert.ok(joined.body.session && joined.body.agent_id);
    const auth = { "x-session": joined.body.session };
    const before = await call("GET", "/observe", undefined, auth);
    const acted = await call("POST", "/input", { type: "Jump", data: {} }, auth);
    assert.equal(acted.status, 200);
    assert.ok(acted.body.tick > before.body.tick, "input answers after a fresh tick");
    assert.equal((await call("POST", "/input", { type: "MoveTo", data: {} }, auth)).status, 400);
    const chat = await call("POST", "/chat", { content: "hello island" }, auth);
    assert.match(chat.body.created_at, /^2000-01-01T/, "chat clock is simulation time");
    const messages = await call("GET", "/chat/messages?limit=5", undefined, auth);
    assert.equal(messages.body.messages.at(-1).content, "hello island");
    assert.equal((await call("GET", "/snapshot")).status, 403);
    const snapshot = await call("GET", "/snapshot", undefined, { "x-operator-token": "op-test" });
    assert.equal(snapshot.body.format, "graphysx-world-snapshot/v0");
    assert.ok(snapshot.body.rapierStateBytes > 0);

    const controller = new AbortController();
    const stream = await fetch(`${running.url}/spectate`, { signal: controller.signal });
    const reader = stream.body.getReader();
    let text = "";
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline && (text.match(/event: frame/g) ?? []).length < 3) text += new TextDecoder().decode((await reader.read()).value);
    controller.abort();
    assert.match(text, /event: hello/);
    const frames = text.split("\n").filter((line) => line.startsWith("data: {\"tick\"")).map((line) => JSON.parse(line.slice(6)));
    assert.ok(frames.length >= 2, "pose frames stream");
    assert.ok(frames.at(-1).tick > frames[0].tick);
    assert.ok(frames[0].poses.length >= 15, "blocks, rock, ring and the character");
  } finally {
    await running.close();
  }
});
