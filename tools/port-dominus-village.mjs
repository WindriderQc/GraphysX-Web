// Ports the Dominus village from the archive player into a v2 scene document.
//
// The village was built by `buildDominusVillage()` in race-scene.ts: a hand-authored
// placement table walked to produce meshes directly, reachable only through ?host=legacy.
// This turns it into an ordinary `graphysx.agent-world/v2` document — which means the
// editor can open it, an agent can edit it, and the scene store can hold it. No private
// code path; the village becomes content rather than code.
//
//   node tools/port-dominus-village.mjs            # writes scenes/dominus-village.json
//   node tools/port-dominus-village.mjs --seed     # ...and pushes it to the scene store
//
// The placement table is duplicated here from race-scene.ts on purpose: this runs once, and
// afterwards the emitted document is the source of truth. Re-running it would overwrite any
// edits made since, so it is a port tool, not a build step.

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { putScene } from "./graphysx-scene-agent.mjs";
import { buildAssetCatalog, publishedAssetId } from "../scripts/build-asset-catalog.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG = join(ROOT, "src", "legacy", "village-catalog.json");
const OUT_DIR = join(ROOT, "scenes");
const OUT = join(OUT_DIR, "dominus-village.json");

/** race-scene.ts:5163 — source units are ~22x metric, so everything is scaled down. */
const VILLAGE_SCALE = 0.045;

/** race-scene.ts:579. [assetId, x, z, rotationYRadians, scaleOverride?, solid?] */
const DOMINUS_LAYOUT = [
  // the waterfront
  ["port_maindocks", 0, 26, 0, undefined, true],
  ["port_smalldocks", 15, 27, 0.2, undefined, true],
  ["port_minidock", -15, 26.5, -0.15, undefined, true],
  ["port_lighthouse", 31, 30, 0, undefined, true],
  ["port_sunkship", -27, 34, 0.9],
  ["port_shippiece", 23, 36, -0.4],
  ["port_shipyard", -8, 31, 0, undefined, true],
  // the town
  ["port_cottage1", -18, 10, 0.4, undefined, true],
  ["port_cottage2", -6, 12, 0, undefined, true],
  ["port_cottage4", 6, 12, -0.2, undefined, true],
  ["port_cottage5", 18, 10, -0.5, undefined, true],
  ["port_inn01", -13, -2, 0.7, undefined, true],
  ["port_pub1", 0, -5, 0, undefined, true],
  ["port_market", 13, -2, -0.7, undefined, true],
  ["port_fishhouse", -23, 3, 1.2, undefined, true],
  ["port_shed1", 23, 3, -1.2, undefined, true],
  ["port_const1", -28, -9, 0.5, undefined, true],
  ["port_const2", 28, -9, -0.5, undefined, true],
  ["port_windmill", -33, -17, 0.9, undefined, true],
  ["port_weathervain", 0, -13, 0],
  ["port_hut", -20, -21, 0.6, undefined, true],
  ["port_hut01", -10, -23, 0.2, undefined, true],
  ["port_hut02", 0, -24, 0, undefined, true],
  ["port_hut03", 10, -23, -0.2, undefined, true],
  ["port_hut04", 20, -21, -0.6, undefined, true],
  ["port_hut05", 27, -17, -1.0, undefined, true],
  // the camp
  ["camp1_tent1", -9, -32, 0.4],
  ["camp1_tent2", 0, -34, 0],
  ["camp1_tent3", 9, -32, -0.4],
  ["camp1_post", 0, -29, 0],
  // greenery
  ["tree_green01", -30, 16, 0], ["tree_green02", -24, 19, 1], ["tree_green03", 26, 17, 2],
  ["tree_green04", 32, 12, 3], ["tree_green05", -35, -2, 4], ["tree_green06", 35, -3, 5],
  ["tree_green07", -30, -26, 6], ["tree_green01", 30, -27, 1.5], ["tree_green03", -16, 18, 2.5],
  ["tree_dead01", 36, -22, 0], ["tree_dead02", -37, -12, 1], ["tree_dead03", 15, 18, 2],
  ["bush_01", -9, 6, 0], ["bush_02", 9, 6, 1], ["bush_03", -18, -8, 2], ["bush_04", 18, -8, 3],
  ["grass_reed01", -4, 20, 0], ["grass_reed02", 4, 20, 1], ["grass_reed03", 0, 17, 2],
  ["grass_flower01", -7, -17, 0], ["grass_flower02", 7, -17, 1],
  // life — `woman` and the fish are in the archive catalog but were never converted to
  // standalone meshes, so they have no v2 asset to reference. Reported as skipped.
  ["woman", 2.4, -7.5, 2.6],
  ["fish1", -6, 33, 0.6], ["fish2", 5, 34, -1.2], ["fish3", 12, 32, 2.2],
];

/** race-scene.ts:5178 — the same set the archive treated as cut-out foliage. */
const FOLIAGE = /tree|bush|grass|flower|reed/;

const degrees = (radians) => Number(((radians * 180) / Math.PI).toFixed(2));
const round = (value) => Number(value.toFixed(3));

const catalog = JSON.parse(await readFile(CATALOG, "utf8"));
const sizes = new Map(catalog.assets.map((asset) => [asset.id, asset.size]));

// What the runtime can actually resolve. The archive layout references `woman` and three
// fish that were never converted to standalone meshes — emitting them would produce a
// document that throws "Unknown model asset" the moment anyone opened it.
const published = new Set((await buildAssetCatalog()).map((entry) => entry.id));
const assetIdFor = publishedAssetId;

const entities = [
  {
    id: "village-sun",
    label: "Afternoon Sun",
    type: "directional-light",
    intensity: 2.1,
    transform: { position: [-28, 40, 26] },
    material: { color: "#fff2d8" },
    castShadow: true,
  },
  {
    id: "village-fill",
    label: "Sky Fill",
    type: "ambient-light",
    intensity: 0.85,
    material: { color: "#cfe4ff" },
  },
];

const skipped = [];
const counts = new Map();

for (const [catalogId, x, z, rotationY, scaleOverride, solid] of DOMINUS_LAYOUT) {
  const size = sizes.get(catalogId);
  if (!size || !published.has(assetIdFor(catalogId))) {
    skipped.push(catalogId);
    continue;
  }

  // The archive scaled raw source positions; v2 models are fitted to a target size instead.
  // Deriving fitSize from the source bounds reproduces the same proportions — a uniform
  // fitSize would make a lighthouse and a bush the same height.
  const scale = scaleOverride ?? VILLAGE_SCALE;
  const fitSize = round(Math.max(...size) * scale);
  if (fitSize <= 0) {
    skipped.push(catalogId);
    continue;
  }

  // Repeat placements of the same asset need distinct entity ids.
  const seen = (counts.get(catalogId) ?? 0) + 1;
  counts.set(catalogId, seen);
  const id = seen === 1 ? assetIdFor(catalogId) : `${assetIdFor(catalogId)}-${seen}`;

  // `fitSize` centres a model on its bounds, so an entity placed at ground level ends up
  // half-buried — or, for a tall mast, floating. The archive kept the source origin instead.
  // Fitting is uniform, so the fitted height is the source height times the same scale, and
  // lifting by half of it puts the model's base on the ground where it was authored.
  const fittedHeight = size[1] * scale;
  const groundY = round(0.12 + fittedHeight / 2);

  const entity = {
    id,
    label: catalogId.replace(/_/g, " "),
    type: "model",
    transform: {
      position: [x, groundY, z],
      rotationDegrees: [0, degrees(rotationY), 0],
    },
    // Foliage is flat quads painted with a magenta key colour — these textures predate
    // alpha channels, so the key is punched out at load and then cut with alphaTest.
    asset: {
      id: assetIdFor(catalogId),
      fitSize,
      ...(FOLIAGE.test(catalogId) ? { colorKey: "#ff00ff", colorKeyTolerance: 0.2, alphaTest: 0.45 } : {}),
    },
    tags: ["dominus", "village"],
    // Grass is trodden on, not lit from below; matching the archive's shadow choices.
    castShadow: !catalogId.startsWith("grass"),
    receiveShadow: true,
  };

  // `solid` marked the buildings you cannot walk through. v2 derives a model's collider from
  // the entity's `geometry` box, so a fitted cube stands in for the building's footprint —
  // crude next to the real silhouette, but it makes the village physically real rather than
  // scenery you fall through.
  if (solid) {
    entity.physics = { mode: "static", material: "wall" };
    entity.geometry = { width: fitSize * 0.8, height: fitSize, depth: fitSize * 0.8 };
  }

  entities.push(entity);
}

const definition = {
  schema: "graphysx.agent-world/v2",
  id: "dominus-village",
  label: "Dominus Village",
  environment: {
    background: "#8fb6d6",
    sky: "clearblue",
    ground: { visible: true, size: 130, color: "#6f7d55", grid: false, gridColor: "#59684a" },
    physics: { gravity: [0, -9.82, 0] },
  },
  entities,
};

await mkdir(OUT_DIR, { recursive: true });
await writeFile(OUT, `${JSON.stringify(definition, null, 2)}\n`, "utf8");

console.log(`wrote ${entities.length} entities to ${OUT}`);
if (skipped.length > 0) {
  console.log(`skipped ${skipped.length} placements with no converted mesh: ${skipped.join(", ")}`);
}

if (process.argv.includes("--seed")) {
  const store = process.env.GRAPHYSX_STORE_URL ?? "http://localhost:8788";
  const result = await putScene(store, "dominus-village", definition, undefined, {
    actor: "port-tool",
    intent: "ported the Dominus village from the archive",
  });
  console.log(`seeded to ${store} → revision ${result.revision}`);
}
