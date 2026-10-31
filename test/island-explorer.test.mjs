import { test } from "node:test";
import assert from "node:assert/strict";
import { importBrowserModule } from "./support/import-browser-module.mjs";
const data = await importBrowserModule(new URL("../src/island-explorer-data.ts", import.meta.url));
const { parseIslandInspection } = await importBrowserModule(new URL("../src/island-inspection.ts", import.meta.url));
const feed = await importBrowserModule(new URL("../src/island-world-feed.ts", import.meta.url));
const hello = { format: feed.WORLD_STREAM_FORMAT, tick: 60, tickHz: 60, replay: false, ids: { 1: "tree_1", 2: "tree_2", 3: "flock_1" }, document: {
  id: "living-island", label: "Living island", entities: [
    { id: "agent-1", type: "agent", label: "Eko", transform: { position: [0, 2, 0] } },
    { id: "tree_1", type: "dna-tree", label: "Tree_1", dna: { generation: 2, seed: 11 } },
    { id: "tree_2", type: "dna-tree", label: "Tree_2", dna: { generation: 1, seed: 22 } },
    { id: "tree_1-perch", type: "force-field", forceField: { kind: "attractor", affectsFlocks: true, visualize: false } },
    { id: "tree_1-trunk", type: "cylinder", tags: ["trunk"], visible: false },
    { id: "flock_1", type: "flock", transform: { position: [10, 15, 0] } },
    { id: "block_1", label: "Block_1", type: "box", tags: ["pickup"] },
    { id: "ocean", type: "water" }, { id: "sun", type: "directional-light" },
  ] }, inspection: { worldId: "living-island", entities: [
    { id: "tree_1", name: "Tree_1", attributes: { Generation: 2, Ready: false, ReadyIn: 12, TrunkLength: 0.7 } },
    { id: "tree_2", name: "Tree_2", attributes: { Parent: "Tree_1", Lineage: "Tree_1>Tree_2", SownBy: "Eko" } },
  ], agents: [{ id: "agent-1", name: "Eko", attributes: { HeldSeed: "Tree_1@2", HeldObject: "block_1" } }] } };
const make = (override = {}) => data.buildIslandExplorer({ world: feed.worldSceneFromHello(hello), claw: null, mode: "live", connected: true, actions: [],
  swarms: [{ id: "flock_1", positions: [1, 2, 3, -1, -2, -3], velocities: [1, 0, 0, 0, 0, 2] }], ...override });

test("every category and bird can be reached without creating another simulation", () => {
  const model = make();
  assert.equal(model.label, "Île vivante");
  assert.equal(model.items.length, 11);
  assert.deepEqual(model.counts, { agents: 1, objects: 1, trees: 2, birds: 3, terrain: 1, forces: 1, decor: 1, technical: 1 });
  const bird = model.items.find(row => row.id === "flock_1:bird:0");
  assert.deepEqual(bird.position, [11, 17, 3]);
  assert.equal(bird.parent, "flock_1");
  assert.equal(bird.entityId, "flock_1");
  assert.equal(bird.properties.find(p => p.label === "Vitesse").value, "1");
});

test("lineage, sower, seed and physical relationships link to real entities", () => {
  const model = make();
  const byId = id => model.items.find(item => item.id === id);
  for (const [from, to, label] of [["tree_2", "tree_1", "Parent"], ["tree_2", "agent-1", "Semé par"], ["tree_1", "tree_2", "Descendant"],
    ["tree_1", "tree_1-trunk", "Collision du tronc"], ["agent-1", "tree_1", "Graine de"], ["agent-1", "block_1", "Objet porté"]]) {
    assert.ok(byId(from).relations.some(r => r.id === to && r.label === label), `${from} → ${label} → ${to}`);
  }
  assert.ok(byId("tree_1").properties.some(p => p.group === "Gènes exprimés" && p.value.includes("0,7")));
});

test("accent-insensitive search covers attributes; removal cannot leave a stale entity", () => {
  const model = make(); model.items[0].name = "Éko";
  assert.equal(data.filterExplorerItems(model, null, "eko")[0].name, "Éko");
  assert.equal(data.filterExplorerItems(model, "trees", "ReadyIn").length, 1);
  assert.equal(data.filterExplorerItems(model, null, "arbre").length, 2);
  assert.equal(data.filterExplorerItems(model, null, "graine portée")[0].name, "Éko");
  assert.equal(data.filterExplorerItems(model, "forces", "Tree_2").length, 0);
  const world = feed.applyWorldEntities(feed.worldSceneFromHello(hello), { tick: 120, removed: [1] });
  assert.equal(make({ world }).items.some(row => row.id === "tree_1"), false);
});

test("old recordings expose geometry without inventing missing lineage or readiness", () => {
  const model = make({ world: feed.worldSceneFromHello({ ...hello, inspection: undefined }), mode: "replay", connected: false });
  assert.equal(model.mode, "Relecture"); assert.equal(model.metadata, false); assert.equal(model.connected, false);
  const tree = model.items.find(row => row.id === "tree_2");
  assert.equal(tree.attributes.Ready, undefined);
  assert.equal(tree.relations.some(r => r.label === "Parent"), false);
  assert.equal(model.counts.trees, 2);
  assert.equal(model.items.find(row => row.id === 'tree_1-perch').visible, false);
});

test("Clawblox shares navigation and retains its native player and entity identities", () => {
  const claw = { tick: 42, players: [{ id: "eko", name: "Eko", root_part_id: 9, attributes: { LastActionResult: "PickupSuccess" } }],
    entities: [{ id: 9, name: "HumanoidRootPart", position: [1, 2, 3] }, { id: 10, name: "Block_1", position: [4, 5, 6], render: { role: "PickupObject" } }] };
  const model = make({ world: null, claw, mode: "fixture" });
  assert.equal(model.mode, "Démonstration");
  assert.equal(model.items.find(row => row.name === "Eko").entityId, "island-e9");
  assert.equal(model.counts.objects, 1);
});

test("optional metadata is validated separately from poses and retains no session fields", () => {
  const raw = { ...hello.inspection, agents: [{ id: "agent-1", name: "Eko", session: "private-token", attributes: { HeldSeed: "Tree_1@2", bad: { session: "private" } } }] };
  const parsed = parseIslandInspection(raw);
  assert.equal(parsed.agents[0].session, undefined); assert.equal(parsed.agents[0].attributes.bad, undefined);
  assert.equal(parseIslandInspection({ worldId: "x", agents: [] }), undefined);
  const frame = feed.parseWorldEvent("frame", JSON.stringify({ tick: 5, poses: [], inspection: raw }));
  assert.equal(frame.frame.inspection.worldId, "living-island");
  const malformed = feed.parseWorldEvent("frame", JSON.stringify({ tick: 5, poses: [], inspection: "wrong" }));
  assert.equal(malformed.kind, "frame"); assert.equal(malformed.frame.inspection, undefined);
});

test("dashboard links refuse scripts and credentials and preserve the exact run", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  assert.equal(data.islandDashboardLink("https://dashboard.lan/benchmark/island", id), `https://dashboard.lan/benchmark/island#memory=${id}`);
  for (const url of ["javascript:alert(1)", "https://u:p@host/", "/relative", null]) assert.equal(data.islandDashboardLink(url, id), null);
});

test("bird properties stay structurally stable when a velocity sample is missing", () => {
  const sampled = make().items.find(row => row.kind === 'bird');
  const missing = make({ swarms: [{ id: 'flock_1', positions: [1, 2, 3], velocities: null }] }).items.find(row => row.kind === 'bird');
  assert.deepEqual(missing.properties.map(p => p.label), sampled.properties.map(p => p.label));
  assert.equal(missing.properties.find(p => p.label === 'Vitesse').value, 'Non renseigné');
});
