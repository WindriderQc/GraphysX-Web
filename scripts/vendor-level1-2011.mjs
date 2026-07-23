// Graduate the recovered BallZ 2011 Level1 mega-world mesh into the v2 model vocabulary.
//
// The decoded geometry lives in `src/legacy/level1-2011-level.json` — one terrain object,
// proven complete two ways: the legacy RaceScene drives a ball down it (`level1-2011-race`,
// `?host=legacy`), and the richer inspection decode (`src/legacy/ballz2011-level1.json`)
// audits the same 828 vertices as two adjacent closed two-manifold solids with a 0.018-unit
// seam. This deterministic vendor step changes only the container format; positions, UVs,
// indices, and bounds remain the recovered values.
//
// The 1135-unit span is the reason this world was the LAST port: it could not even be
// rendered inside the host's old fixed far plane. `environment.envelope` removed that
// limit; scene-native trimesh colliders removed the collision one. What no decode recovers
// is gameplay — no archived runtime source loads Level1.TVM, so spawn, rules, camera and
// finish semantics are all inventions of the composition, labelled there, not here.
//
// Usage: node scripts/vendor-level1-2011.mjs
// Writes: public/assets/ports/archive-level1-2011.json

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "src", "legacy", "level1-2011-level.json");
const OUT_DIR = join(ROOT, "public", "assets", "ports");
const OUT = join(OUT_DIR, "archive-level1-2011.json");

const sourceBytes = readFileSync(SOURCE);
const decoded = JSON.parse(sourceBytes.toString("utf8"));
const source = decoded.objects?.find((object) => object.source?.endsWith("Media/Level1.TVM"));
if (!source) throw new Error("Level1.TVM is missing from src/legacy/level1-2011-level.json");
if (source.positions.length % 3 !== 0 || source.indices.length % 3 !== 0) {
  throw new Error("Level1 geometry is not triangle-aligned");
}

const bounds = {
  min: source.bounds.min,
  max: source.bounds.max,
  size: source.bounds.max.map((value, axis) => value - source.bounds.min[axis]),
};
const payload = {
  meshes: [{
    name: "Level1",
    positions: source.positions,
    uvs: source.uvs,
    indices: source.indices,
    materials: [{
      // The TVM carries one material slot with no usable UV map or texture names (the
      // inspection decode is explicit about this), so any colour is necessarily inferred.
      // A cool slate reads as the "narrow canyon run" the legacy race made of this world.
      name: "Level1 recovered geometry (material inferred)",
      color: [0.3, 0.33, 0.4, 1],
      specularPower: 16,
    }],
  }],
  bounds,
  provenance: {
    archiveSource: source.source,
    decodedCatalog: "src/legacy/level1-2011-level.json",
    decodedCatalogSha256: createHash("sha256").update(sourceBytes).digest("hex"),
    vendoredBy: "scripts/vendor-level1-2011.mjs",
    fidelity: {
      exact: "positions, UVs, indices, and bounds",
      inferred: "material color and specular power; no archived runtime loads this mesh, so all gameplay is composed, not recovered",
    },
  },
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, JSON.stringify(payload));
console.log(
  `archive-level1-2011: ${source.positions.length / 3} vertices, ` +
    `${source.indices.length / 3} triangles, native span ${bounds.size.map((v) => v.toFixed(1)).join(" x ")}`,
);
