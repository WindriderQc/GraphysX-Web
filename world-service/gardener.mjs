#!/usr/bin/env node
// A scripted gardener for the living island: no model, only the Clawblox HTTP protocol an agent
// uses (`/api.md`, `/join`, `/observe`, `/input`). It shows the forest mechanics end to end:
//
//   1. pick a ready tree by a fixed taste (bushiest, tallest or warmest leaves);
//   2. walk to it and GatherSeed;
//   3. walk to open ground nearby and Sow (the server decides what ground is);
//   4. NextGeneration on the parent tree;
//   5. with --wait-sapling, wait until the sapling is ready and advance it too.
//
// Its taste is the selection: the tree it likes is the one whose lineage continues.
//
//   node world-service/gardener.mjs --base http://127.0.0.1:18120 [--name Jardinier]
//        [--taste bushy|tall|warm] [--wait-sapling]

import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const flat = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const WARM = ["Red", "Orange", "Yellow", "Pink", "Purple", "Green", "Teal", "Blue"];

/** How the gardener ranks ready trees: higher is preferred. */
export const TASTES = {
  bushy: (tree) => tree.attributes.Branches,
  tall: (tree) => tree.attributes.Height,
  warm: (tree) => WARM.length - WARM.indexOf(tree.attributes.LeafColor),
};

export async function runGardener(base, options = {}) {
  const { name = "Jardinier", taste = "bushy", waitSapling = false, log = () => {}, moveTimeoutMs = 12_000, readyTimeoutMs = 60_000 } = options;
  const rank = TASTES[taste];
  if (!rank) throw new Error(`Unknown taste ${taste}: use ${Object.keys(TASTES).join(", ")}`);
  const url = base.replace(/\/+$/, "");
  const actions = [];
  let session = null;

  const request = async (method, path, body) => {
    const response = await fetch(`${url}${path}`, {
      method,
      headers: { ...(session ? { "x-session": session } : {}), ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`${method} ${path} answered ${response.status}: ${text}`);
    return path === "/api.md" ? text : JSON.parse(text);
  };
  const observe = () => request("GET", "/observe");
  const act = async (type, data) => {
    const observation = await request("POST", "/input", { type, data });
    const result = observation.player.attributes.LastActionResult;
    actions.push({ type, data, result });
    log(`${type} ${JSON.stringify(data)} -> ${result}`);
    return { observation, result };
  };
  const trees = (observation) => observation.world.entities.filter((entity) => entity.attributes?.RenderRole === "Tree");
  const root = (tree) => tree.attributes.Root.split(",").map(Number);
  /** Walk until within `reach` (horizontally) of `target`; MoveTo gives up after 8 s, so repeat. */
  const walkTo = async (target, reach = 1.5) => {
    const deadline = Date.now() + moveTimeoutMs;
    let observation = await observe();
    while (flat(observation.player.position, target) > reach) {
      if (Date.now() > deadline) throw new Error(`could not reach ${target.join(", ")}`);
      await act("MoveTo", { position: target });
      await sleep(250);
      observation = await observe();
    }
    return observation;
  };
  /** A point `gap` studs from `tree` towards `from`, where the gardener stands to reach it. */
  const beside = (target, from, gap = 2.5) => {
    const d = Math.max(1e-6, flat(target, from));
    return [target[0] + ((from[0] - target[0]) / d) * gap, from[1], target[2] + ((from[2] - target[2]) / d) * gap];
  };

  const api = await request("GET", "/api.md");
  if (!api.includes("GatherSeed")) throw new Error("This world has no living island (no GatherSeed in /api.md); start it with --world living-island");
  ({ session } = await request("POST", `/join?name=${encodeURIComponent(name)}`));

  // 1. Taste.
  let observation = await observe();
  const ready = trees(observation).filter((tree) => tree.attributes.Ready);
  if (!ready.length) throw new Error("no ready tree on the island");
  const parent = ready.reduce((best, tree) => (rank(tree) > rank(best) ? tree : best));
  const parentRoot = root(parent);
  log(`taste ${taste}: ${parent.name} (${parent.attributes.LeafColor}, ${parent.attributes.Branches} branches, ${parent.attributes.Height} tall)`);

  // 2. Gather.
  observation = await walkTo(beside(parentRoot, observation.player.position));
  const gathered = await act("GatherSeed", { position: parentRoot });
  if (gathered.result !== "GatherSeedSuccess") throw new Error(`GatherSeed failed: ${gathered.result}`);

  // 3. Sow on the first open ground around the parent, from 7 to 11 studs out.
  let sapling = null;
  for (let attempt = 0; attempt < 16 && !sapling; attempt += 1) {
    const angle = (attempt * 2.39996) % (Math.PI * 2);
    const radius = 7 + (attempt % 3) * 2;
    const spot = [parentRoot[0] + Math.cos(angle) * radius, 0, parentRoot[2] + Math.sin(angle) * radius];
    observation = await walkTo(beside(spot, observation.player.position, 2));
    const before = new Set(trees(observation).map((tree) => tree.name));
    const sown = await act("Sow", { position: spot });
    if (sown.result === "SowSuccess") sapling = trees(sown.observation).find((tree) => !before.has(tree.name)) ?? null;
    else if (!["SowFailed:NotGround", "SowFailed:TooClose"].includes(sown.result)) throw new Error(`Sow failed: ${sown.result}`);
  }
  if (!sapling) throw new Error("found no open ground to sow on");

  // 4. The parent's next generation.
  observation = await walkTo(beside(parentRoot, observation.player.position));
  const advanced = await act("NextGeneration", { position: parentRoot });
  if (advanced.result !== "NextGenerationSuccess") throw new Error(`NextGeneration failed: ${advanced.result}`);
  const parentAfter = trees(advanced.observation).find((tree) => tree.name === parent.name);

  // 5. Optionally, the sapling's own next generation once it is ready.
  let saplingAfter = null;
  if (waitSapling) {
    const saplingRoot = root(sapling);
    observation = await walkTo(beside(saplingRoot, observation.player.position));
    const deadline = Date.now() + readyTimeoutMs;
    while (!trees(observation).find((tree) => tree.name === sapling.name)?.attributes.Ready) {
      if (Date.now() > deadline) throw new Error(`${sapling.name} never became ready`);
      await sleep(500);
      observation = await observe();
    }
    const grown = await act("NextGeneration", { position: saplingRoot });
    if (grown.result !== "NextGenerationSuccess") throw new Error(`NextGeneration on the sapling failed: ${grown.result}`);
    saplingAfter = trees(grown.observation).find((tree) => tree.name === sapling.name);
  }

  return { session, parent, parentAfter, sapling, saplingAfter, actions };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { values } = parseArgs({ options: { base: { type: "string" }, name: { type: "string" }, taste: { type: "string" }, "wait-sapling": { type: "boolean" } } });
  const base = values.base ?? process.env.WORLD_BASE_URL ?? "http://127.0.0.1:18120";
  try {
    const summary = await runGardener(base, { name: values.name, taste: values.taste, waitSapling: values["wait-sapling"], log: (line) => console.log(line) });
    const { attributes: sown } = summary.sapling;
    console.log(`${summary.sapling.name} sown from ${sown.Parent}@${sown.ParentGeneration} (${sown.Lineage}); ${summary.parent.name} now generation ${summary.parentAfter.attributes.Generation}${summary.saplingAfter ? `; ${summary.sapling.name} now generation ${summary.saplingAfter.attributes.Generation}` : ""}`);
  } catch (error) {
    console.error(`gardener failed: ${error.message}`);
    process.exit(1);
  }
}
