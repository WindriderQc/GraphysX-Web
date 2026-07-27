// Graduate the decoded TrueVision3D catalog into ordinary v2 model assets.
//
// `src/legacy/tvm-catalog.json` already contains exact positions, indices and UVs for
// fourteen recovered props/course pieces plus the complete 0-9 / A-Z mesh alphabet. The
// legacy host could draw them, but the editor, agent API and production asset manifest could
// not discover them. This script republishes those decoded bytes as
// `graphysx-mesh-json`, following `vendor-ball-meshes.mjs`.
//
// Geometry is faithful. The neutral materials are explicitly adapted presentation because
// the compact catalog preserved no material groups for these entries. Provenance rides in
// every payload instead of depending on this comment.
//
//   node scripts/vendor-tvm-meshes.mjs
//   node scripts/build-asset-catalog.mjs

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(ROOT, "src", "legacy", "tvm-catalog.json");
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));

if (catalog.assets?.length !== 14) {
  throw new Error(`Expected 14 decoded TVM assets, found ${catalog.assets?.length ?? 0}`);
}
if (Object.keys(catalog.alphabet ?? {}).length !== 36) {
  throw new Error(`Expected 36 decoded alphabet meshes, found ${Object.keys(catalog.alphabet ?? {}).length}`);
}
const IDENTIFICATION = {
  cubx: "closed CubX actor assembly",
  "cubx-btn1": "CubX button/control mesh revision 1",
  "cubx-btn2": "CubX button/control mesh revision 2",
  "ring-tvm": "BallZ checkpoint ring",
  fleche: "direction arrow (flèche)",
  prisme: "prism prop/toy",
  "invert-sphere": "inside-facing sphere/skydome component",
  slide1: "BallZ slide/course component",
  "ballz-track1": "BallZ track/course component",
  corridor: "course corridor component",
  "finish-tvm": "BallZ finish plate",
  "90right": "90-degree right course turn",
  "half-empty-ball": "open hemispherical prop/obstacle",
  pipe1: "FlightX pipe course component",
};

const presentation = {
  prop: { name: "revival-neutral", color: [0.56, 0.72, 0.8, 1], emissive: [0.015, 0.035, 0.05] },
  glyph: { name: "archive-font-gold", color: [1, 0.82, 0.25, 1], emissive: [0.22, 0.12, 0.01] },
};

function boundsOf(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], positions[index + axis]);
      max[axis] = Math.max(max[axis], positions[index + axis]);
    }
  }
  return { min, max, size: max.map((value, axis) => value - min[axis]) };
}

function payloadFor(mesh, options) {
  const vertexCount = mesh.positions.length / 3;
  const triangleCount = mesh.indices.length / 3;
  const bounds = boundsOf(mesh.positions);
  return {
    source: options.archiveSource,
    catalog: {
      label: options.label,
      category: options.category,
      role: options.role,
    },
    provenance: {
      archiveSource: options.archiveSource,
      catalogSource: "src/legacy/tvm-catalog.json",
      decodedBy: "TrueVision3D TVM decode preserved in src/legacy/tvm-catalog.json; republished by scripts/vendor-tvm-meshes.mjs",
      geometryFidelity: "faithful — positions, UVs and indices copied unmodified; normals derived by the v2 loader",
      presentationFidelity: "adapted — the compact decoded catalog preserved no material groups, so the vendored mesh carries a disclosed neutral material",
    },
    meshCount: 1,
    vertexCount,
    faceCount: triangleCount,
    triangleCount,
    materialGroupCount: 1,
    normals: "derived",
    bounds,
    meshes: [{
      name: options.label,
      vertexCount,
      faceCount: triangleCount,
      triangleCount,
      positions: mesh.positions,
      uvs: mesh.uvs ?? [],
      indices: mesh.indices,
      groups: [{ start: 0, count: mesh.indices.length, materialIndex: 0 }],
      materials: [options.material],
    }],
  };
}

for (const asset of catalog.assets) {
  const file = `archive-tvm-${asset.id}.json`;
  const archiveSource = asset.source;
  const payload = payloadFor(asset, {
    archiveSource,
    label: asset.label,
    category: "archive-prop",
    role: IDENTIFICATION[asset.id] ?? "unclassified decoded TVM asset",
    material: presentation.prop,
  });
  await writeFile(path.join(ROOT, "public", "assets", "ports", file), JSON.stringify(payload));
  console.log(`wrote ${file}: ${IDENTIFICATION[asset.id] ?? asset.label}`);
}

for (const [glyph, mesh] of Object.entries(catalog.alphabet)) {
  const upper = glyph.toUpperCase();
  const file = `archive-glyph-${glyph}.json`;
  const payload = payloadFor(mesh, {
    archiveSource: `Media/alphabet/${upper}.tvm`,
    label: `Archive Glyph ${upper}`,
    category: "glyph",
    role: `recovered 3D ${/\d/.test(glyph) ? "number" : "letter"} mesh`,
    material: presentation.glyph,
  });
  await writeFile(path.join(ROOT, "public", "assets", "ports", file), JSON.stringify(payload));
  console.log(`wrote ${file}`);
}
