// The living island (world-service/living-island.ts): Mesa plus a Living Forest, a flock and a
// wind field, with the agent actions GatherSeed / Sow / NextGeneration. CPU only, no model, no
// browser. Like test/world-service.test.mjs, the world is bundled once into a temporary folder.

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { pathToFileURL } from "node:url";
import { build } from "vite";
import { startWorldServer } from "../world-service/server.mjs";
import { runGardener } from "../world-service/gardener.mjs";

const root = new URL("..", import.meta.url);
const mesaApi = readFileSync(new URL("world-service/API.md", root), "utf8");
/** Mesa's content hash on main before the living island existed (2026-10-29, 99a1186). */
const MESA_HASH = "187f609d63a3204b";
let outDir;
let m;

before(async () => {
  outDir = mkdtempSync(join(tmpdir(), "graphysx-living-island-"));
  await build({ configFile: new URL("vite.world-service.config.ts", root).pathname, root: root.pathname, build: { outDir, emptyOutDir: true }, logLevel: "silent" });
  m = await import(pathToFileURL(join(outDir, "world.js")).href);
});
after(() => { if (outDir) rmSync(outDir, { recursive: true, force: true }); });

const flat = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const living = () => new m.IslandWorld(undefined, { world: m.LIVING_WORLD_ID });
const trees = (observation) => observation.world.entities.filter((entity) => entity.attributes?.RenderRole === "Tree");
const tree = (observation, name) => trees(observation).find((entity) => entity.name === name);
const rootOf = (entity) => entity.attributes.Root.split(",").map(Number);
const GENES = ["TrunkLength", "LengthRatio", "BranchAngle", "RollTurns", "Depth", "SplitChance", "LeafHue", "LeafSize"];
const genes = (entity) => Object.fromEntries(GENES.map((key) => [key, entity.attributes[key]]));

function walkTo(world, session, target, maxSeconds = 8) {
  world.apply(session, { type: "MoveTo", data: { position: target } });
  for (let tick = 0; tick < maxSeconds * 60; tick += 1) {
    world.step();
    if (flat(world.observe(session).player.position, target) <= 0.6) return;
  }
  throw new Error(`did not reach ${target}`);
}

/** Gather from Tree_2 and sow at (-2, 0, 12), open ground beside the grove. */
function gatherAndSow(world, session) {
  walkTo(world, session, [-8, 2.55, 12.5]);
  assert.equal(world.apply(session, { type: "GatherSeed", data: { position: [-8, 0, 15] } }), "GatherSeedSuccess");
  walkTo(world, session, [-2, 2.55, 10]);
  assert.equal(world.apply(session, { type: "Sow", data: { position: [-2, 0, 12] } }), "SowSuccess");
}

describe("living island", () => {
  it("adds a forest, a flock and a wind field to Mesa without changing Mesa", () => {
    const mesa = new m.IslandWorld();
    assert.equal(mesa.snapshot().world.contentHash, MESA_HASH, "Mesa's world hash is unchanged");
    const mesaSession = mesa.join("Eko").session;
    assert.equal(mesa.observe(mesaSession).world.entities.filter((entity) => entity.attributes?.IsLiving).length, 0);
    assert.equal(mesa.apply(mesaSession, { type: "Sow", data: { position: [0, 0, 0] } }), "InvalidAction", "Mesa has no living actions");
    assert.equal(mesa.poseFrame().swarms, undefined, "Mesa frames are unchanged");

    const world = living();
    assert.equal(world.worldId, "living-island");
    const types = world.sceneHello().document.entities.map((entity) => entity.type);
    assert.equal(types.filter((type) => type === "dna-tree").length, 5);
    assert.equal(types.filter((type) => type === "flock").length, 1);
    assert.equal(types.filter((type) => type === "force-field").length, 6, "five tree perches and the wind");
    const session = world.join("Eko").session;
    world.advance(0.5);
    const observation = world.observe(session);
    assert.deepEqual(trees(observation).map((entity) => entity.name), ["Tree_1", "Tree_2", "Tree_3", "Tree_4", "Tree_5"]);
    assert.ok(trees(observation).every((entity) => entity.attributes.Ready && entity.attributes.Generation === 1 && entity.shape === "Tree"));
    assert.equal(new Set(trees(observation).map((entity) => entity.attributes.LeafColor)).size, 5, "five different founders");
    const flock = observation.world.entities.find((entity) => entity.name === "Flock_1");
    assert.equal(flock.attributes.Members, 28);
    assert.ok(flock.attributes.MeanSpeed > 1, "the birds fly");
    assert.ok(!observation.world.entities.some((entity) => /wind|perch/i.test(entity.name)), "the wind and perches are not listed");
    assert.equal(observation.player.attributes.HeldSeed, "");
    assert.throws(() => new m.IslandWorld(undefined, { world: "atlantis" }), /Unknown world/);
  });

  it("gathers a seed, sows a sapling that inherits its parent's genes, grows it and advances generations", () => {
    const world = living();
    const session = world.join("Eko").session;
    const parentBefore = tree(world.observe(session), "Tree_2");
    gatherAndSow(world, session);
    let observation = world.observe(session);
    assert.equal(observation.player.attributes.HeldSeed, "", "sowing spends the seed");
    const sapling = tree(observation, "Tree_6");
    assert.ok(sapling, "a sixth tree");
    assert.equal(sapling.attributes.Parent, "Tree_2");
    assert.equal(sapling.attributes.ParentGeneration, 1);
    assert.equal(sapling.attributes.Lineage, "Tree_2>Tree_6");
    assert.equal(sapling.attributes.SownBy, "Eko");
    assert.equal(sapling.attributes.Ready, false);
    assert.deepEqual(genes(sapling), genes(parentBefore), "the seed carries the parent's expressed genes");
    assert.ok(sapling.attributes.Height < parentBefore.attributes.Height, "a sapling starts small");
    const changes = world.drainChanges();
    assert.ok(changes.some((change) => change.added?.some(({ entity }) => entity.id === "tree_6" && entity.type === "dna-tree")), "viewers are told");

    world.advance(16);
    observation = world.observe(session);
    assert.ok(tree(observation, "Tree_6").attributes.Height > sapling.attributes.Height, "it grows a stage after 15 s");
    assert.ok(world.drainChanges().some((change) => change.added?.some(({ entity }) => entity.id === "tree_6")), "growth is re-sent");
    assert.equal(world.apply(session, { type: "NextGeneration", data: { position: [-2, 0, 12] } }), "NextGenerationFailed:NotReady");
    world.advance(15);
    observation = world.observe(session);
    const grown = tree(observation, "Tree_6");
    assert.equal(grown.attributes.Ready, true, "ready after 30 s");
    assert.equal(grown.attributes.ReadyIn, 0);

    assert.equal(world.apply(session, { type: "NextGeneration", data: { position: [-2, 0, 12] } }), "NextGenerationSuccess");
    const next = tree(world.observe(session), "Tree_6");
    assert.equal(next.attributes.Generation, 2);
    assert.notDeepEqual(genes(next), genes(grown), "the genes drift");
    assert.equal(next.attributes.Ready, false, "it rests after changing");
    assert.equal(world.apply(session, { type: "NextGeneration", data: { position: [-2, 0, 12] } }), "NextGenerationFailed:NotReady");

    // A grandchild: the lineage keeps every ancestor.
    world.advance(30);
    walkTo(world, session, [-2, 2.55, 9.5]);
    assert.equal(world.apply(session, { type: "GatherSeed", data: { position: [-2, 0, 12] } }), "GatherSeedSuccess");
    assert.equal(world.observe(session).player.attributes.HeldSeed, "Tree_6@2");
    walkTo(world, session, [3, 2.55, 6]);
    assert.equal(world.apply(session, { type: "Sow", data: { position: [3, 0, 8] } }), "SowSuccess");
    const grandchild = tree(world.observe(session), "Tree_7");
    assert.equal(grandchild.attributes.Lineage, "Tree_2>Tree_6>Tree_7");
    assert.deepEqual(genes(grandchild), genes(next));
  });

  it("refuses what the rules refuse, with a reason", () => {
    const world = living();
    const session = world.join("Eko").session;
    const act = (type, position) => world.apply(session, { type, data: { position } });
    assert.equal(act("Sow", [2, 0, 2]), "SowFailed:NoSeed");
    assert.equal(act("GatherSeed", [-8, 0, 15]), "GatherSeedFailed:OutOfRange");
    assert.equal(act("GatherSeed", [2, 0, 2]), "GatherSeedFailed:NoTree");
    assert.equal(world.apply(session, { type: "GatherSeed", data: {} }), "GatherSeedFailed:InvalidPosition");
    walkTo(world, session, [-8, 2.55, 12.5]);
    assert.equal(act("GatherSeed", [-8, 0, 15]), "GatherSeedSuccess");
    assert.equal(act("Sow", [-8, 0, 13]), "SowFailed:TooClose");
    assert.equal(act("Sow", [-8, 4, 10]), "SowFailed:NotGround", "not in the air");
    walkTo(world, session, [2.5, 2.55, 15]);
    assert.equal(act("Sow", [8, 2, 16]), "SowFailed:NotGround", "not on a mesa (LowStep)");
    assert.equal(act("Sow", [40, 0, 40]), "SowFailed:OutOfRange");
    assert.equal(world.observe(session).player.attributes.HeldSeed, "Tree_2@1", "a refused sowing keeps the seed");
  });

  it("has solid trunks that grow with their tree, and never sows under an agent", () => {
    const world = living();
    const session = world.join("Eko").session;
    // Walk straight at Tree_1's root: the trunk stops the capsule (radius 1) at its collider (0.35).
    world.apply(session, { type: "MoveTo", data: { position: [-14, 2.55, 10] } });
    world.advance(4);
    const stopped = flat(world.observe(session).player.position, [-14, 0, 10]);
    assert.ok(stopped > 1.2 && stopped < 1.6, `stopped by the trunk (${stopped.toFixed(2)} from the root)`);
    const trunks = world.sceneHello().document.entities.filter((entity) => entity.type === "cylinder" && entity.tags?.includes("trunk"));
    assert.equal(trunks.length, 5);
    assert.ok(trunks.every((entity) => entity.visible === false && entity.physics?.mode === "static"), "invisible, static");

    walkTo(world, session, [-8, 2.55, 12.5]);
    assert.equal(world.apply(session, { type: "GatherSeed", data: { position: [-8, 0, 15] } }), "GatherSeedSuccess");
    walkTo(world, session, [-2, 2.55, 12]);
    assert.equal(world.apply(session, { type: "Sow", data: { position: [-2, 0, 12.5] } }), "SowFailed:Occupied", "not where someone stands");
    assert.equal(world.apply(session, { type: "Sow", data: { position: [-2, 0, 15] } }), "SowSuccess");
    const trunkHeight = () => world.sceneHello().document.entities.find((entity) => entity.id === "tree_6-trunk").geometry.height;
    const small = trunkHeight();
    world.drainChanges();
    world.advance(31);
    assert.ok(trunkHeight() > small * 2, `the sapling's trunk grows with it (${small} -> ${trunkHeight()})`);
    assert.ok(world.drainChanges().some((change) => change.added?.some(({ entity }) => entity.id === "tree_6-trunk")), "viewers get the new trunk");
    const snapshot = JSON.parse(JSON.stringify(world.snapshot()));
    const resumed = new m.IslandWorld(snapshot);
    world.advance(2);
    resumed.advance(2);
    assert.deepEqual(resumed.poseFrame(), world.poseFrame(), "a rebuilt trunk resumes exactly");
  });

  it("makes the birds shy of agents", () => {
    // Same island, same seed, side by side for 40 s: one with an agent standing in the grove,
    // where the tree perches draw the birds. Count birds within 20 studs of the agent's head.
    // Swarm members are flock-local; the flock stands at [-4, 15, 6].
    const empty = living();
    const watched = living();
    const session = watched.join("Eko").session;
    walkTo(watched, session, [-12, 2.55, 15]);
    empty.advance(watched.simSeconds);
    const p = watched.observe(session).player.position;
    const head = [p[0], p[1] + 2, p[2]];
    const near = (world) => {
      const [, ...members] = world.poseFrame().swarms[0];
      let count = 0;
      for (let i = 0; i < members.length; i += 3) {
        if (Math.hypot(members[i] - 4 - head[0], members[i + 1] + 15 - head[1], members[i + 2] + 6 - head[2]) < 20) count += 1;
      }
      return count;
    };
    let alone = 0;
    let shy = 0;
    let startled = false;
    for (let sample = 0; sample < 160; sample += 1) {
      empty.advance(0.25);
      watched.advance(0.25);
      alone += near(empty) / 160;
      shy += near(watched) / 160;
      startled ||= watched.observe(session).world.entities.find((entity) => entity.name === "Flock_1").attributes.Startled;
    }
    assert.ok(alone > 3, `the perches draw birds over the grove (${alone.toFixed(2)} on average)`);
    assert.ok(shy < alone / 2, `birds keep away from an agent (${shy.toFixed(2)} within 20 studs, ${alone.toFixed(2)} without one)`);
    assert.equal(startled, true, "the flock reports being startled");
  });

  it("lets the wind carry a thrown block, and only inside the wind", () => {
    // Throw the same block the same way on Mesa and on the living island: outside the wind
    // both land on the same spot; inside it the living island's block drifts.
    const landing = (world, session, standAt, direction) => {
      walkTo(world, session, [14.8, 2.55, 2.5]);
      world.advance(1.5);
      const pile = world.observe(session).world.entities.filter((entity) => entity.name.startsWith("Block_")).sort((a, b) => b.position[1] - a.position[1]);
      const block = pile[0];
      assert.equal(world.apply(session, { type: "Pickup", data: { position: block.position } }), "PickupSuccess");
      walkTo(world, session, standAt, 10);
      assert.equal(world.apply(session, { type: "Throw", data: { direction, speed: 10 } }), "ThrowSuccess");
      world.advance(4);
      return world.observe(session).world.entities.find((entity) => entity.name === block.name).position;
    };
    const run = (worldId, standAt, direction) => {
      const world = new m.IslandWorld(undefined, { world: worldId });
      return landing(world, world.join("Eko").session, standAt, direction);
    };
    const outsideMesa = run("mesa-island", [8, 2.55, 6], [0, 0.7, 1]);
    const outsideLiving = run("living-island", [8, 2.55, 6], [0, 0.7, 1]);
    assert.ok(flat(outsideMesa, outsideLiving) < 1e-6, `outside the wind nothing changes (${outsideMesa} vs ${outsideLiving})`);
    const insideMesa = run("mesa-island", [22, 2.55, -16], [0, 0.7, -1]);
    const insideLiving = run("living-island", [22, 2.55, -16], [0, 0.7, -1]);
    assert.ok(flat(insideMesa, insideLiving) > 0.5, `the wind moves it (${insideMesa} vs ${insideLiving})`);
  });

  it("resumes exactly: trees, seeds and every bird", () => {
    const world = living();
    const session = world.join("Eko").session;
    gatherAndSow(world, session);
    walkTo(world, session, [-8, 2.55, 12.5]);
    assert.equal(world.apply(session, { type: "GatherSeed", data: { position: [-8, 0, 15] } }), "GatherSeedSuccess");
    world.apply(session, { type: "MoveTo", data: { position: [-14, 2.55, 4] } });
    world.advance(0.4);
    const snapshot = JSON.parse(JSON.stringify(world.snapshot()));
    assert.equal(snapshot.world.id, "living-island");
    assert.equal(snapshot.living.flock.positions.length, 28 * 3);
    const resumed = new m.IslandWorld(snapshot);
    assert.throws(() => new m.IslandWorld(snapshot, { world: "mesa-island" }), /not mesa-island/);
    for (let second = 0; second < 20; second += 1) {
      world.advance(1);
      resumed.advance(1);
      assert.deepEqual(resumed.poseFrame(), world.poseFrame(), `same poses and birds after ${second + 1} s`);
    }
    assert.deepEqual(resumed.observe(session), world.observe(session), "same observation, same session token");
    assert.equal(resumed.observe(session).player.attributes.HeldSeed, "Tree_2@1");
    const mesa = new m.IslandWorld().snapshot();
    assert.throws(() => new m.IslandWorld({ ...mesa, world: { ...mesa.world, id: "living-island" } }), /another world/);
  });

  it("streams the birds and tree changes to spectators and serves the living API", async () => {
    const running = await startWorldServer({ module: m, apiMarkdown: m.livingApiMarkdown(mesaApi), world: m.LIVING_WORLD_ID, port: 0, spectateHz: 10 });
    try {
      const api = await (await fetch(`${running.url}/api.md`)).text();
      assert.match(api, /^# Living Mesa World/);
      assert.match(api, /\| GatherSeed \|/);
      assert.match(api, /\| Throw \|/, "Mesa's actions are still there");
      assert.doesNotMatch(api, /wind/i, "the wind is for agents to discover");
      const controller = new AbortController();
      const stream = await fetch(`${running.url}/spectate`, { signal: controller.signal });
      const reader = stream.body.getReader();
      let text = "";
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline && (text.match(/event: frame/g) ?? []).length < 3) text += new TextDecoder().decode((await reader.read()).value);
      controller.abort();
      const hello = JSON.parse(text.split("\n").find((line) => line.startsWith("data: {\"format\"")).slice(6));
      const flockId = Number(Object.entries(hello.ids).find(([, id]) => id === "flock_1")[0]);
      const frames = text.split("\n").filter((line) => line.startsWith("data: {\"tick\"")).map((line) => JSON.parse(line.slice(6)));
      const swarm = frames.at(-1).swarms.find((entry) => entry[0] === flockId);
      assert.equal(swarm.length, 1 + 28 * 3, "every bird, every frame");
      assert.ok(frames.at(-1).swarms[0].slice(1).some((value, index) => value !== frames[0].swarms[0][index + 1]), "the birds move between frames");
    } finally {
      await running.close();
    }
  });

  it("switches worlds in place through the operator selector, with a fresh recording each time", async () => {
    const recordDir = join(outDir, "rec-selector");
    const running = await startWorldServer({
      module: m, apiMarkdown: (id) => (id === m.LIVING_WORLD_ID ? m.livingApiMarkdown(mesaApi) : mesaApi),
      port: 0, operatorToken: "op-test", recordDir,
    });
    const post = (body, token = "op-test") => fetch(`${running.url}/world`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { "x-operator-token": token } : {}) }, body: JSON.stringify(body) });
    try {
      assert.equal((await (await fetch(`${running.url}/healthz`)).json()).world, "mesa-island");
      assert.match(await (await fetch(`${running.url}/api.md`)).text(), /^# Mesa World/);
      assert.equal((await post({ world: "living-island" }, null)).status, 403, "operator only");
      assert.equal((await post({ world: "living-island" }, "wrong")).status, 403);
      assert.equal((await post({ world: "atlantis" })).status, 400);
      await fetch(`${running.url}/join?name=Eko`, { method: "POST" });
      assert.equal((await post({ world: "living-island" })).status, 409, "refused while an agent is on the island");

      const controller = new AbortController();
      const stream = await fetch(`${running.url}/spectate`, { signal: controller.signal });
      const reader = stream.body.getReader();
      const switched = await post({ world: "living-island", force: true });
      assert.equal(switched.status, 200);
      const body = await switched.json();
      assert.deepEqual([body.world, body.previous], ["living-island", "mesa-island"]);
      let text = "";
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline && !text.includes("\"id\":\"living-island\"")) text += new TextDecoder().decode((await reader.read()).value);
      controller.abort();
      assert.ok(text.includes("\"id\":\"living-island\""), "spectators get the new island's hello");
      assert.equal((await (await fetch(`${running.url}/healthz`)).json()).world, "living-island");
      assert.match(await (await fetch(`${running.url}/api.md`)).text(), /^# Living Mesa World/);
      assert.equal(running.world.agentCount, 0, "sessions ended with the old island");
      assert.equal((await fetch(`${running.url}/observe`, { headers: { "x-session": "anything" } })).status, 401);
      assert.ok(existsSync(join(`${recordDir}-1-living-island`, "graphysx-recording.ndjson")), "a new recording beside the first");
      assert.equal(body.recordDir, `${recordDir}-1-living-island`);

      assert.equal((await post({ world: "mesa-island" })).status, 200, "and back, with nobody joined");
      assert.equal(running.world.worldId, "mesa-island");
      assert.ok(existsSync(join(`${recordDir}-2-mesa-island`, "graphysx-recording.ndjson")));
    } finally {
      await running.close();
    }
  });

  it("plays the scripted gardener end to end over HTTP", async () => {
    const running = await startWorldServer({ module: m, apiMarkdown: m.livingApiMarkdown(mesaApi), world: m.LIVING_WORLD_ID, port: 0 });
    try {
      const summary = await runGardener(running.url, { taste: "bushy" });
      assert.equal(summary.parent.name, "Tree_4", "the bushiest founder");
      assert.equal(summary.sapling.attributes.Parent, "Tree_4");
      assert.equal(summary.parentAfter.attributes.Generation, 2);
      assert.deepEqual(summary.actions.filter((action) => action.type !== "MoveTo").map((action) => action.result).filter((result) => result.endsWith("Success")),
        ["GatherSeedSuccess", "SowSuccess", "NextGenerationSuccess"]);
      const mesa = await startWorldServer({ module: m, apiMarkdown: mesaApi, port: 0 });
      try {
        await assert.rejects(runGardener(mesa.url), /no living island/);
      } finally {
        await mesa.close();
      }
    } finally {
      await running.close();
    }
  });
});
