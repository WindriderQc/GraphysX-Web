// Graduate the decoded Suzanne 1 machinery from RaceScene-only JSON into ordinary v2 assets.
//
// `src/legacy/suzanne1-level.json` contains the exact decoded vertices, indices, UVs, source
// colours and bounds for the complete eight-part 2015 scene. Nothing needs a speculative GLB
// conversion: the v2 loader already consumes this `graphysx-mesh-json` shape. Each output keeps
// source-space positions byte-for-value; scene composition uses native `fitSize` and the source
// bounds centre to reconstruct the shared placement after the loader recentres each asset.
//
//   node scripts/vendor-suzanne-machinery.mjs
//   node scripts/build-asset-catalog.mjs

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(ROOT, "src", "legacy", "suzanne1-level.json");
const source = JSON.parse(await readFile(sourcePath, "utf8"));

const EXPECTED = [
  ["Suzanne1.blend.x", "level"],
  ["Suzanne1.PistonStand.x", "piston-stand"],
  ["Suzanne1.PistonTrigger.x", "piston-trigger"],
  ["Suzanne1.FinishLine.x", "finish-line"],
  ["Suzanne1.DoorGate.x", "door-gate"],
  ["Suzanne1.Piston.x", "piston"],
  ["Suzanne1.Rotator.x", "rotator"],
  ["Suzanne1.RotatorCube.x", "rotator-cube"],
];

if (source.source !== "Archive/bckup/BallZ2015.bckup/Media") {
  throw new Error(`Unexpected Suzanne source root: ${String(source.source)}`);
}
if (source.objects?.length !== EXPECTED.length) {
  throw new Error(`Expected ${EXPECTED.length} Suzanne objects, found ${source.objects?.length ?? 0}`);
}

const TEXTURES = {
  "Suzanne1UV.png": "/assets/textures/Suzanne1UV.png",
  "twoway.jpg": "/assets/textures/archive/twoway.jpg",
};

const LABELS = {
  level: "Suzanne Machinery Arena",
  "piston-stand": "Suzanne Piston Stand",
  "piston-trigger": "Suzanne Piston Trigger",
  "finish-line": "Suzanne Finish Line",
  "door-gate": "Suzanne Door Gate",
  piston: "Suzanne Piston",
  rotator: "Suzanne Rotator",
  "rotator-cube": "Suzanne Rotator Cube",
};

for (const [index, [expectedSource, expectedRole]] of EXPECTED.entries()) {
  const object = source.objects[index];
  if (object.source !== expectedSource || object.role !== expectedRole) {
    throw new Error(`Suzanne object ${index} drifted: ${object.source}/${object.role}`);
  }
  if (!object.bounds?.min || !object.bounds?.max || object.meshes?.length < 1) {
    throw new Error(`Suzanne object ${object.source} is missing decoded geometry or bounds`);
  }

  let vertexCount = 0;
  let triangleCount = 0;
  const meshes = object.meshes.map((mesh) => {
    const vertices = mesh.positions.length / 3;
    const triangles = mesh.indices.length / 3;
    if (!Number.isInteger(vertices) || !Number.isInteger(triangles)) {
      throw new Error(`${object.source}/${mesh.name} has malformed geometry`);
    }
    if ((mesh.uvs?.length ?? 0) !== 0 && mesh.uvs.length !== vertices * 2) {
      throw new Error(`${object.source}/${mesh.name} has malformed UVs`);
    }
    vertexCount += vertices;
    triangleCount += triangles;
    const material = {
      name: `${expectedRole}-source-material`,
      color: [...(mesh.color ?? [0.64, 0.64, 0.64]), 1],
      ...(mesh.texture && TEXTURES[mesh.texture]
        ? { textureName: mesh.texture, textureUrl: TEXTURES[mesh.texture] }
        : {}),
    };
    return {
      name: mesh.name,
      vertexCount: vertices,
      faceCount: triangles,
      triangleCount: triangles,
      positions: mesh.positions,
      uvs: mesh.uvs ?? [],
      indices: mesh.indices,
      groups: [{ start: 0, count: mesh.indices.length, materialIndex: 0 }],
      materials: [material],
    };
  });

  const bounds = {
    min: object.bounds.min,
    max: object.bounds.max,
    size: object.bounds.max.map((value, axis) => value - object.bounds.min[axis]),
  };
  const archiveSource = `${source.source}/${object.source}`;
  const payload = {
    source: object.source,
    catalog: {
      label: LABELS[expectedRole],
      category: "archive-machinery",
      role: expectedRole,
    },
    provenance: {
      archiveSource,
      catalogSource: "src/legacy/suzanne1-level.json",
      decodedBy: "DirectX .x decode preserved in src/legacy/suzanne1-level.json; republished by scripts/vendor-suzanne-machinery.mjs",
      geometryFidelity: "faithful — source-space positions, UVs and indices copied unmodified; normals derived by the v2 loader",
      materialFidelity: "faithful where recorded — decoded source colour and recorded texture binding retained; no unrecorded texture inferred",
      sourcePhysicsRole: object.physics,
    },
    meshCount: meshes.length,
    vertexCount,
    faceCount: triangleCount,
    triangleCount,
    materialGroupCount: meshes.length,
    normals: "derived",
    bounds,
    meshes,
  };
  const file = `archive-suzanne-${expectedRole}.json`;
  await writeFile(path.join(ROOT, "public", "assets", "ports", file), JSON.stringify(payload));
  console.log(`wrote ${file}: ${vertexCount} vertices, ${triangleCount} triangles`);
}
