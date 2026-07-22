// Graduate the recovered BallZ SlideLarge mesh into the ordinary v2 model vocabulary.
//
// The decoded geometry already lives in `src/legacy/slide-level.json`, but that legacy
// payload is not discoverable through `assets()` and cannot be used by an agent-world
// `model`. This deterministic vendor step changes only the container format; positions,
// UVs, indices, and bounds remain the recovered values.
//
// Usage: node scripts/vendor-slide-large.mjs
// Writes: public/assets/ports/archive-slide-large.json

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "src", "legacy", "slide-level.json");
const OUT_DIR = join(ROOT, "public", "assets", "ports");
const OUT = join(OUT_DIR, "archive-slide-large.json");

const sourceBytes = readFileSync(SOURCE);
const decoded = JSON.parse(sourceBytes.toString("utf8"));
const source = decoded.objects?.find((object) => object.source === "Media/SlideLarge.TVM");
if (!source) throw new Error("SlideLarge.TVM is missing from src/legacy/slide-level.json");
if (source.positions.length % 3 !== 0 || source.indices.length % 3 !== 0) {
  throw new Error("SlideLarge geometry is not triangle-aligned");
}

const bounds = {
  min: source.bounds.min,
  max: source.bounds.max,
  size: source.bounds.max.map((value, axis) => value - source.bounds.min[axis]),
};
const payload = {
  meshes: [{
    name: "SlideLarge",
    positions: source.positions,
    uvs: source.uvs,
    indices: source.indices,
    materials: [{
      name: "SlideLarge recovered geometry (material inferred)",
      color: [0.18, 0.34, 0.39, 1],
      specularPower: 24,
    }],
  }],
  bounds,
  provenance: {
    archiveSource: source.source,
    decodedCatalog: "src/legacy/slide-level.json",
    decodedCatalogSha256: createHash("sha256").update(sourceBytes).digest("hex"),
    vendoredBy: "scripts/vendor-slide-large.mjs",
    fidelity: {
      exact: "positions, UVs, indices, and bounds",
      inferred: "material color and specular power",
    },
  },
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, JSON.stringify(payload));
console.log(
  `archive-slide-large: ${source.positions.length / 3} vertices, ` +
    `${source.indices.length / 3} triangles, native span ${bounds.size.join(" x ")}`,
);
