import { test } from "node:test";
import assert from "node:assert/strict";
import { createBallsyRooms } from "../server/ballsy-rooms.mjs";
import { parseGiantCommand, isBallsySnapshot } from "../server/ballsy-protocol.mjs";
import { importBrowserModule } from "./support/import-browser-module.mjs";
const { createVolcano } = await importBrowserModule(new URL("../src/ballsy-volcano.ts", import.meta.url));
const snapshot = (roundId = "round-aaaaaaaaaaaaaaaa") => ({ roundId, phase: "racing", ally: 0, volcano: createVolcano("help"),
  players: [0, 1].map((i) => ({ id: `ballsy-p${i + 1}`, position: [-4, 0.7, 8 + i * 2], lap: 0, finished: false })) });
function setup() {
  let clock = 1000;
  const rooms = createBallsyRooms({ now: () => clock });
  const host = rooms.create(), state = snapshot();
  rooms.publish(host.roomId, host.hostToken, { snapshot: state, ack: 0 });
  const guest = rooms.join(host.code);
  return { rooms, host, guest, state, advance: (t) => { clock += t; } };
}

test("separate host/giant roles and one live giant; the relay cannot author scene changes", () => {
  const { rooms, host, guest } = setup();
  assert.throws(() => rooms.publish(host.roomId, guest.guestToken, { snapshot: snapshot(), ack: 0 }), { status: 403 });
  assert.throws(() => rooms.read(host.roomId, host.hostToken), { status: 403 });
  assert.throws(() => rooms.join(host.code), { status: 409 });
  assert.equal(rooms.read(host.roomId, guest.guestToken).hostLive, true);
  for (const command of [{ type: "steer", id: "ballsy-p1", thrust: 1 }, { type: "route", route: "divert", charges: 999 }, { type: "dig", point: 4 }]) assert.equal(parseGiantCommand(command), null);
});

test("retries are deduplicated and acknowledgements cannot replay a paid action", () => {
  const { rooms, host, guest, state } = setup();
  const packet = { id: "command-11111111", roundId: state.roundId, command: { type: "route", route: "divert" } };
  const first = rooms.command(host.roomId, guest.guestToken, packet);
  assert.deepEqual(rooms.command(host.roomId, guest.guestToken, packet), first);
  const poll = rooms.publish(host.roomId, host.hostToken, { snapshot: state, ack: 0 });
  assert.equal(poll.commands.length, 1);
  assert.equal(rooms.publish(host.roomId, host.hostToken, { snapshot: state, ack: first.sequence }).commands.length, 0);
  assert.equal(rooms.command(host.roomId, guest.guestToken, packet).sequence, first.sequence);
  assert.equal(rooms.publish(host.roomId, host.hostToken, { snapshot: state, ack: first.sequence }).commands.length, 0);
});

test("old-round and paused commands do not cross into a rematch, and a stale screen rejects actions", () => {
  const { rooms, host, guest, state, advance } = setup();
  const command = { id: "command-22222222", roundId: state.roundId, command: { type: "dig", point: 0 } };
  rooms.command(host.roomId, guest.guestToken, command);
  const next = snapshot("round-bbbbbbbbbbbbbbbb");
  assert.deepEqual(rooms.publish(host.roomId, host.hostToken, { snapshot: next, ack: 0 }).commands, []);
  assert.equal(rooms.command(host.roomId, guest.guestToken, command).accepted, false);
  next.phase = "paused";
  rooms.publish(host.roomId, host.hostToken, { snapshot: next, ack: 0 });
  assert.equal(rooms.command(host.roomId, guest.guestToken, { ...command, id: "command-33333333", roundId: next.roundId }).accepted, false);
  next.phase = "racing";
  rooms.publish(host.roomId, host.hostToken, { snapshot: next, ack: 0 });
  advance(1600);
  assert.equal(rooms.command(host.roomId, guest.guestToken, { ...command, id: "command-44444444", roundId: next.roundId }).accepted, false);
});

test("disconnect expires the giant lease and a replacement gets a fresh token and empty queue", () => {
  const { rooms, host, guest, state, advance } = setup();
  rooms.command(host.roomId, guest.guestToken, { id: "command-55555555", roundId: state.roundId, command: { type: "dig", point: 0 } });
  advance(2600);
  assert.equal(rooms.publish(host.roomId, host.hostToken, { snapshot: state, ack: 0 }).guestConnected, false);
  const replacement = rooms.join(host.code);
  assert.notEqual(replacement.guestToken, guest.guestToken);
  assert.throws(() => rooms.read(host.roomId, guest.guestToken), { status: 403 });
  assert.deepEqual(rooms.publish(host.roomId, host.hostToken, { snapshot: state, ack: 0 }).commands, []);
});

test("snapshot shape, conservation and resource bounds are checked; rooms and command queues are bounded", () => {
  assert.equal(isBallsySnapshot(snapshot()), true);
  const bad = snapshot(); bad.volcano.source = 2;
  assert.equal(isBallsySnapshot(bad), false);
  const invalid = snapshot(); invalid.players[0].position[0] = NaN;
  assert.equal(isBallsySnapshot(invalid), false);
  const { rooms, host, guest, state } = setup();
  let accepted = 0;
  for (let i = 0; i < 100; i++) if (rooms.command(host.roomId, guest.guestToken, { id: `command-${String(i).padStart(8, "0")}`, roundId: state.roundId, command: { type: "release" } }).accepted) accepted++;
  assert.equal(accepted, 25);
  for (let i = 0; i < 7; i++) rooms.create();
  assert.throws(() => rooms.create(), { status: 429 });
});
