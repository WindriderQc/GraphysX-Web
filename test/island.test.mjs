import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importBrowserModule } from "./support/import-browser-module.mjs";

// The pure half of `?app=island`: Clawblox spectator stream → GraphysX entity definitions.
const feed = await importBrowserModule(new URL("../src/island-feed.ts", import.meta.url));
const fixture = JSON.parse(readFileSync(new URL("../src/island-fixture.json", import.meta.url), "utf8"));

const part = (id, role, extra = {}) => ({
  id, position: [0, 0, 0], size: [2, 2, 2],
  render: { role, primitive: "block", color: [0.5, 0.5, 0.5], static: true, visible: true },
  ...extra,
});

test("full observations, deltas and chat are materialised as Clawblox documents them", () => {
  const full = { tick: 10, players: [], entities: [part(1, "Mesa"), part(2, "PickupObject")] };
  const a = feed.applyClawMessage(null, full);
  assert.equal(a.kind, "full");
  assert.equal(feed.applyClawMessage(null, { type: "spectator_delta", tick: 11, entities: [] }).kind, "error", "no delta before a full state");
  const b = feed.applyClawMessage(a.state, {
    type: "spectator_delta", tick: 11, players: [{ id: "p", name: "Eko" }],
    entities: [{ id: 2, p: [1, 2, 3] }, { id: 1, rm: true }, { id: 3, add: part(3, "Rock") }, { id: 99, p: [9, 9, 9] }],
  });
  assert.equal(b.kind, "delta");
  assert.equal(b.state.tick, 11);
  assert.deepEqual(b.state.entities.map((e) => e.id), [2, 3], "rm removes, add inserts, a transform for an unknown id is ignored");
  assert.deepEqual(b.state.entities[0].position, [1, 2, 3]);
  assert.equal(b.state.entities[0].render.role, "PickupObject", "a transform-only change keeps every other field");
  assert.equal(b.state.players[0].name, "Eko");
  assert.equal(a.state.entities.length, 2, "the previous view is not mutated");
  const chat = feed.applyClawMessage(b.state, { type: "chat_message", id: "c1", agent_name: "Eko", content: "Bonjour" });
  assert.deepEqual(chat, { kind: "chat", chat: { id: "c1", agentName: "Eko", content: "Bonjour" } });
  assert.equal(feed.applyClawMessage(b.state, { type: "replay_camera_set" }).kind, "ignored");
});

test("the real capture composes every visible part once and skips the invisible walls", () => {
  const state = feed.applyClawMessage(null, fixture.full).state;
  const { definitions, placements } = feed.composeIsland(state);
  const kinds = placements.reduce((counts, p) => ({ ...counts, [p.kind]: (counts[p.kind] ?? 0) + 1 }), {});
  assert.deepEqual(kinds, { water: 1, ground: 5, mesa: 11, pickup: 12, ring: 1, rock: 1, agent: 1 });
  assert.equal(definitions.length, placements.length + 11, "each mesa carries a grass cap child");
  assert.ok(definitions.every((d) => d.ephemeral === true && d.tags.includes(feed.ISLAND_TAG)));
  assert.ok(definitions.every((d) => !("physics" in d)), "GraphysX physics never simulates Clawblox parts");
  assert.equal(new Set(definitions.map((d) => d.id)).size, definitions.length, "stable unique ids");
  const agent = definitions.find((d) => d.type === "agent");
  assert.equal(agent.label, "Eko");
  const agentPlacement = placements.find((p) => p.kind === "agent");
  assert.equal(agentPlacement.localOffset[1], -2.5, "the avatar stands on the base of the 5-unit Clawblox character");
  const water = definitions.find((d) => d.type === "water");
  assert.equal(water.water.size, 600 * feed.WATER_HORIZON);
  const grounds = placements.filter((p) => p.kind === "ground").map((p) => p.localOffset[1]).sort((x, y) => y - x);
  assert.deepEqual(grounds, [0, -0.04, -0.08, -0.12, -0.16], "smaller ground slabs step down so overlaps never z-fight");
});

test("structure changes rebuild; transform-only changes do not", () => {
  const state = feed.applyClawMessage(null, fixture.full).state;
  const key = feed.islandStructureKey(state);
  const moved = feed.applyClawMessage(state, fixture.deltas.find((d) => d.entities.length)).state;
  assert.equal(feed.islandStructureKey(moved), key);
  const recoloured = { ...state, entities: state.entities.map((e, i) => (i === 0 ? { ...e, render: { ...e.render, color: [1, 0, 0] } } : e)) };
  assert.notEqual(feed.islandStructureKey(recoloured), key);
});

test("rotation matrices become unit quaternions, and the pose buffer interpolates and resets", () => {
  assert.deepEqual(feed.matrixToQuat(null), [0, 0, 0, 1]);
  const yaw90 = feed.matrixToQuat([[0, 0, 1], [0, 1, 0], [-1, 0, 0]]);
  assert.ok(Math.abs(yaw90[1] - Math.SQRT1_2) < 1e-9 && Math.abs(yaw90[3] - Math.SQRT1_2) < 1e-9);
  const half = feed.slerpQuat([0, 0, 0, 1], yaw90, 0.5);
  assert.ok(Math.abs(Math.hypot(...half) - 1) < 1e-9);

  const buffer = new feed.IslandPoseBuffer(100);
  const at = (tick, x) => ({ tick, players: [], entities: [{ id: 7, position: [x, 0, 0] }] });
  buffer.push(at(100, 0), 1000);
  buffer.push(at(102, 10), 1100);
  assert.equal(buffer.sample(7, 1150).p[0], 5, "halfway between the two arrivals, 100 ms behind");
  assert.equal(buffer.sample(7, 2000).p[0], 10, "past the newest snapshot: hold the newest pose");
  assert.equal(buffer.push(at(50, 3), 1200), true, "a backwards tick (seek) resets");
  assert.equal(buffer.sample(7, 1250).p[0], 3);
  assert.equal(buffer.sample(8, 1250), null);
});

test("the agent log reads as conversation, by tick", () => {
  const timeline = { enabled: true, messages: [
    { id: "a", role: "user", tick: 1, blocks: [{ type: "text", text: "<environment_context>…</environment_context>" }] },
    { id: "b", role: "user", tick: 2, blocks: [{ type: "text", text: "Begin." }] },
    { id: "c", role: "assistant", tick: 600, blocks: [{ type: "text", text: "Je lis mon espace." }, { type: "tool_use", name: "exec_command", summary: "ls -la" }] },
    { id: "d", role: "assistant", tick: 9000, blocks: [{ type: "text", text: "x".repeat(400) }] },
  ] };
  const messages = feed.islandMessages(timeline);
  assert.deepEqual(messages.map((m) => [m.role, m.tick]), [["user", 2], ["agent", 600], ["tool", 600], ["agent", 9000]]);
  assert.equal(messages[2].text, "exec_command · ls -la");
  assert.ok(messages[3].text.length <= 280 && messages[3].text.endsWith("…"));
  assert.deepEqual(feed.islandMessagesAt(messages, 700).map((m) => m.tick), [2, 600, 600]);
  assert.deepEqual(feed.islandMessages(null), []);
});

test("sources, clock and agent wording", () => {
  assert.deepEqual(feed.parseIslandSource("http://devx:18090/"), { http: "http://devx:18090", ws: "ws://devx:18090" });
  assert.deepEqual(feed.parseIslandSource("https://h.example/island"), { http: "https://h.example/island", ws: "wss://h.example/island" });
  assert.equal(feed.parseIslandSource("javascript:alert(1)"), null);
  assert.equal(feed.parseIslandSource("not a url"), null);
  assert.equal(feed.formatClock(195755, 60), "54:22");
  assert.equal(feed.formatClock(60 * 3725, 60), "1:02:05");
  assert.deepEqual(feed.describeAgent({ id: "p", name: "Eko", humanoid_state: "Running", attributes: { LastActionResult: "PickupSuccess" } }),
    { name: "Eko", state: "se déplace", action: "PickupSuccess" });
  assert.equal(feed.describeAgent(undefined).state, "absent");
  assert.equal(feed.agentPossessive("Eko"), "d'Eko");
  assert.equal(feed.agentPossessive("Nestor"), "de Nestor");
  assert.equal(feed.agentPossessive("  "), null);
});
