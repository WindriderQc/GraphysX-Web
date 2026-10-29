import { test } from "node:test";
import assert from "node:assert/strict";
import { importBrowserModule } from "./support/import-browser-module.mjs";

// The pure half of `?app=island` for a GraphysX world service: its /spectate SSE stream
// (hello, frame, entities, action) → transient scene, poses and panel lines.
const feed = await importBrowserModule(new URL("../src/island-world-feed.ts", import.meta.url));

const document = {
  schema: "graphysx.agent-world/v2", id: "mesa-island", label: "Mesa island",
  environment: { background: "#9fd3ec", sky: null, lighting: null, envelope: null, ground: { visible: false }, physics: { gravity: [0, -30, 0] } },
  entities: [
    { id: "sun", type: "directional-light", intensity: 2.4 },
    { id: "groundcenter", label: "GroundCenter", type: "box", transform: { position: [-2, -5, 0], scale: [96, 10, 100] }, physics: { mode: "static" } },
    { id: "boundarynorth", label: "BoundaryNorth", type: "box", visible: false, transform: { position: [0, 40, 83], scale: [160, 80, 6] }, physics: { mode: "static" } },
    { id: "block_1", label: "Block_1", type: "box", transform: { position: [14, 5, -2], scale: [0.75, 0.75, 0.75] }, physics: { mode: "dynamic", mass: 1 }, tags: ["pickup"] },
    { id: "agent-43", label: "Eko", type: "agent", transform: { position: [0, 2.55, 0] } },
  ],
};
const hello = { format: "graphysx-world-stream/v1", tickHz: 60, tick: 120, document, ids: { 9: "groundcenter", 29: "block_1", 43: "agent-43" } };
const sse = (event, payload) => [event, JSON.stringify(payload)];

test("hello, frame, entities and action events parse; malformed ones never throw", () => {
  const parsed = feed.parseWorldEvent(...sse("hello", hello));
  assert.equal(parsed.kind, "hello");
  assert.equal(parsed.hello.replay, false, "a live world's hello");
  assert.equal(feed.parseWorldEvent(...sse("hello", { ...hello, replay: true })).hello.replay, true, "the replay server's hello");
  assert.equal(feed.parseWorldEvent(...sse("hello", { ...hello, format: "other/v9" })).kind, "error");
  assert.equal(feed.parseWorldEvent("hello", "{not json").kind, "error");
  const frame = feed.parseWorldEvent(...sse("frame", { tick: 126, t: 2.1, poses: [[29, 1, 2, 3, 0, 0, 0, 1], [43, 0, 2.55, 0, 0, 0, 0, 1], [99, "x"]] }));
  assert.equal(frame.kind, "frame");
  assert.equal(frame.frame.poses.length, 2, "a malformed pose row is dropped");
  const entities = feed.parseWorldEvent(...sse("entities", { tick: 130, added: [{ entity: { id: "impactblock_1", type: "box" }, numericId: 50 }, { entity: {} }], removed: [29, "x"] }));
  assert.deepEqual(entities.change, { tick: 130, added: [{ entity: { id: "impactblock_1", type: "box" }, numericId: 50 }], removed: [29] });
  const action = feed.parseWorldEvent(...sse("action", { tick: 131, agent: "Eko", input: { type: "Pickup", data: { position: [14, 0.4, -2] } }, result: "PickupSuccess" }));
  assert.equal(action.kind, "action");
  assert.equal(action.action.result, "PickupSuccess");
  assert.equal(feed.parseWorldEvent("ping", "{}").kind, "ignored");
  assert.equal(feed.parseWorldEvent("action", "{bad").kind, "ignored");
});

test("the scene becomes transient definitions without physics, and changes rebuild it", () => {
  const scene = feed.worldSceneFromHello(feed.parseWorldEvent(...sse("hello", hello)).hello);
  assert.equal(scene.ids.get(29), "block_1");
  const definitions = feed.worldTransientDefinitions(scene);
  assert.equal(definitions.length, 5);
  assert.ok(definitions.every((d) => d.ephemeral === true && !("physics" in d) && d.tags.includes(feed.WORLD_TAG)), "ephemeral, tagged, never simulated here");
  assert.equal(definitions.find((d) => d.id === "boundarynorth").visible, false, "the document's own visibility is kept");
  assert.deepEqual(definitions.find((d) => d.id === "block_1").tags, ["pickup", feed.WORLD_TAG]);
  assert.ok("physics" in document.entities[3], "the hello document is not mutated");

  const key = feed.worldStructureKey(scene);
  const changed = feed.applyWorldEntities(scene, { tick: 130, added: [{ entity: { id: "impactblock_1", label: "ImpactBlock_1", type: "box" }, numericId: 50 }], removed: [29] });
  assert.deepEqual(changed.entities.map((e) => e.id), ["sun", "groundcenter", "boundarynorth", "agent-43", "impactblock_1"], "a fallen block leaves, a rock-impact cube arrives last");
  assert.equal(changed.ids.get(50), "impactblock_1");
  assert.equal(changed.ids.has(29), false);
  assert.notEqual(feed.worldStructureKey(changed), key, "a structural change is visible in the key");
  assert.equal(scene.entities.length, 5, "the previous scene is not mutated");

  const withChild = feed.applyWorldEntities(scene, { tick: 131, added: [{ entity: { id: "hat", type: "box", parentId: "agent-43" }, numericId: 51 }] });
  const orphaned = feed.applyWorldEntities(withChild, { tick: 132, removed: [43] });
  assert.deepEqual(orphaned.entities.map((e) => e.id), ["sun", "groundcenter", "boundarynorth", "block_1"], "a removed parent takes its children");
});

test("the shell keeps the world's own look and fills only what it leaves unsaid", () => {
  const scene = feed.worldSceneFromHello(hello);
  const shell = feed.worldShellDocument(scene, { sky: "clearblue", background: "#000000", envelope: { fogFar: 1500 }, physics: { gravity: [0, -9.81, 0] } });
  assert.deepEqual(shell.entities, []);
  assert.equal(shell.environment.sky, "clearblue", "an exported null means unsaid");
  assert.deepEqual(shell.environment.envelope, { fogFar: 1500 });
  assert.equal(shell.environment.background, "#9fd3ec", "the document's own setting wins");
  assert.deepEqual(shell.environment.physics, { gravity: [0, -30, 0] });
});

test("agents: &agent= picks the newest session of that name, else the first to join", () => {
  const scene = feed.applyWorldEntities(feed.worldSceneFromHello(hello), {
    tick: 140, added: [{ entity: { id: "agent-60", label: "Nestor", type: "agent" }, numericId: 60 }, { entity: { id: "agent-61", label: "Eko", type: "agent" }, numericId: 61 }],
  });
  const agents = feed.worldAgents(scene);
  assert.deepEqual(agents.map((a) => [a.entityId, a.numericId, a.name]), [["agent-43", 43, "Eko"], ["agent-60", 60, "Nestor"], ["agent-61", 61, "Eko"]]);
  assert.equal(feed.pickWorldAgent(agents, "eko").entityId, "agent-61");
  assert.equal(feed.pickWorldAgent(agents, "Nestor").entityId, "agent-60");
  assert.equal(feed.pickWorldAgent(agents, "Absent").entityId, "agent-43");
  assert.equal(feed.pickWorldAgent(agents, null).entityId, "agent-43");
  assert.equal(feed.pickWorldAgent([], "Eko"), null);
});

test("frames are drawn about 150 ms behind, interpolated, and reset on a backwards jump", () => {
  const buffer = new feed.WorldPoseBuffer(150);
  const frame = (tick, x, yaw = 0) => ({ tick, t: tick / 60, poses: [[43, x, 2.55, 0, 0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)]] });
  assert.equal(buffer.sample(43, 0), null);
  buffer.push(frame(120, 0), 1000);
  buffer.push(frame(126, 1, Math.PI / 2), 1100);
  assert.deepEqual(buffer.sample(43, 1200).p, [0.5, 2.55, 0], "halfway between the two frames at now - 150 ms");
  const q = buffer.sample(43, 1200).q;
  assert.ok(Math.abs(q[1] - Math.sin(Math.PI / 8)) < 1e-9, "rotation is slerped too");
  assert.deepEqual(buffer.sample(43, 5000).p, [1, 2.55, 0], "past the newest frame: the newest pose");
  assert.deepEqual(buffer.velocity(43).map((v) => Math.round(v)), [10, 0, 0], "10 units per simulated second");
  assert.equal(feed.worldAgentState(buffer.velocity(43)), "Running");
  assert.equal(feed.worldAgentState([0, 5, 0]), "Jumping");
  assert.equal(feed.worldAgentState([0, -5, 0]), "Freefall");
  assert.equal(feed.worldAgentState(null), "Idle");
  const poses = feed.worldHostPoses(buffer, new Map([[43, "agent-43"]]), 5000);
  assert.deepEqual(poses, [{ id: "agent-43", position: [1, 2.55, 0], quaternion: frame(126, 1, Math.PI / 2).poses[0].slice(4) }]);
  assert.equal(buffer.push(frame(60, 5), 1200), true, "a replay seek backwards clears the buffer");
  assert.equal(buffer.size, 1);
  assert.equal(new feed.WorldPoseBuffer(0).sample(43, 0), null);
});

test("actions read as panel lines; a stale LastActionResult is not shown beside moves", () => {
  const actions = [
    { tick: 200, agent: "Eko", input: { type: "MoveTo", data: { position: [11.71, 2.5, -2.06] } }, result: "Ready" },
    { tick: 260, agent: "Eko", input: { type: "Pickup", data: { position: [14.2, 0.37, -2.06] } }, result: "PickupSuccess" },
    { tick: 300, agent: "Eko", input: { type: "Jump", data: {} }, result: "PickupSuccess" },
    { tick: 340, agent: "Nestor", input: { type: "Throw", data: { direction: [0, 0, -1], speed: 10 } }, result: "ThrowFailed:EmptyHands" },
    { tick: 350, agent: "Eko", input: { type: "Fly", data: null }, result: "InvalidAction" },
  ];
  assert.equal(feed.describeWorldAction(actions[0]), "MoveTo (11.7, 2.5, -2.1)");
  assert.equal(feed.describeWorldAction(actions[1]), "Pickup (14.2, 0.4, -2.1) → PickupSuccess");
  assert.equal(feed.describeWorldAction(actions[2]), "Jump");
  assert.equal(feed.describeWorldAction(actions[3]), "Throw (0, 0, -1) à 10 → ThrowFailed:EmptyHands");
  assert.equal(feed.describeWorldAction(actions[4]), "Fly → InvalidAction");
  const lines = feed.worldActionMessages(actions, true);
  assert.equal(lines.length, 5);
  assert.equal(lines[3].text, "Nestor · Throw (0, 0, -1) à 10 → ThrowFailed:EmptyHands");
  assert.ok(lines.every((line) => line.role === "tool"));
  assert.equal(feed.lastWorldAction(actions, "Eko", 320).input.type, "Jump");
  assert.equal(feed.lastWorldAction(actions, "Eko", 100), null);
  const card = feed.worldAgentPlayer({ entityId: "agent-43", numericId: 43, name: "Eko" }, actions[1], [3, 0, 0]);
  assert.deepEqual(card, { id: "agent-43", name: "Eko", humanoid_state: "Running", attributes: { LastActionResult: "PickupSuccess" } });
  assert.equal(feed.worldAgentPlayer(null, null, null), undefined);
});

test("source detection and the opening overview", () => {
  assert.equal(feed.isWorldServiceHealth({ ok: true, tick: 12 }), true);
  assert.equal(feed.isWorldServiceHealth({ ok: true }), false);
  assert.equal(feed.isWorldServiceHealth(null), false);
  assert.equal(feed.isEventStream("text/event-stream; charset=utf-8"), true);
  assert.equal(feed.isEventStream("text/html"), false);
  assert.equal(feed.isEventStream(null), false);
  const bounds = feed.worldBounds(feed.worldSceneFromHello(hello));
  assert.deepEqual(bounds, { center: [-2, 0, 0], radius: 50 }, "the visible land (static bodies, not the invisible wall) frames the overview");
  assert.deepEqual(feed.worldBounds(feed.worldSceneFromHello({ ...hello, document: { entities: [] } })), { center: [0, 0, 0], radius: 40 });
});
