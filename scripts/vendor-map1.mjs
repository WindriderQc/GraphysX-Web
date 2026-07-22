// Graduate the recovered BallZ 2011 Map1 mesh into the ordinary v2 model vocabulary.
//
// The decoded geometry already lives in `src/legacy/map1-level.json` — a single terrain
// object proven complete by the legacy RaceScene, which drives a ball down it at
// `?host=legacy` (race `map1-2011`). That payload is not discoverable through `assets()`
// and cannot be used by an agent-world `model`. This deterministic vendor step changes
// only the container format; positions, UVs, indices, and bounds remain the recovered
// values. Same shape as `vendor-slide-large.mjs`, which is the newer of the two port
// vendor conventions (fidelity block rather than a bare sha).
//
// Usage: node scripts/vendor-map1.mjs
// Writes: public/assets/ports/archive-map1.json

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "src", "legacy", "map1-level.json");
const OUT_DIR = join(ROOT, "public", "assets", "ports");
const OUT = join(OUT_DIR, "archive-map1.json");

const sourceBytes = readFileSync(SOURCE);
const decoded = JSON.parse(sourceBytes.toString("utf8"));
const source = decoded.objects?.find((object) => object.source?.endsWith("Media/Map1.TVM"));
if (!source) throw new Error("Map1.TVM is missing from src/legacy/map1-level.json");
if (source.positions.length % 3 !== 0 || source.indices.length % 3 !== 0) {
  throw new Error("Map1 geometry is not triangle-aligned");
}

const bounds = {
  min: source.bounds.min,
  max: source.bounds.max,
  size: source.bounds.max.map((value, axis) => value - source.bounds.min[axis]),
};
const payload = {
  meshes: [{
    name: "Map1",
    positions: source.positions,
    uvs: source.uvs,
    indices: source.indices,
    materials: [{
      // The TVM records no usable material; a dry canyon-rock tone fits the "vertical
      // descent" reading the legacy race gave this world, and is labelled inferred below.
      name: "Map1 recovered geometry (material inferred)",
      color: [0.36, 0.3, 0.24, 1],
      specularPower: 12,
    }],
  }],
  bounds,
  provenance: {
    archiveSource: source.source,
    decodedCatalog: "src/legacy/map1-level.json",
    decodedCatalogSha256: createHash("sha256").update(sourceBytes).digest("hex"),
    vendoredBy: "scripts/vendor-map1.mjs",
    fidelity: {
      exact: "positions, UVs, indices, and bounds",
      inferred: "material color and specular power",
    },
  },
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, JSON.stringify(payload));
console.log(
  `archive-map1: ${source.positions.length / 3} vertices, ` +
    `${source.indices.length / 3} triangles, native span ${bounds.size.join(" x ")}`,
);
