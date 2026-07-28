// Publish the three decoded DirectX meshes embedded in the Suzanne 2 evidence record as
// ordinary spawnable v2 assets. The converter that produced the record kept source-space
// vertices, UVs, face groups, materials, hashes and animation census; this step only moves
// that data into the graphysx-mesh-json envelope the platform loader already consumes.
//
//   node scripts/vendor-suzanne2-meshes.mjs
//   node scripts/build-asset-catalog.mjs

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(ROOT, "src", "legacy", "suzanne2-ascii-scene.json");
const source = JSON.parse(await readFile(sourcePath, "utf8"));

const ASSETS = [
  ["airplane", "archive-suzanne2-airplane", "Suzanne 2 Airplane", "xml-airplane"],
  ["bonedGate", "archive-suzanne2-boned-gate", "Suzanne 2 Boned Gate", "xml-boned-gate"],
  ["playerCage", "archive-suzanne2-super-cage", "Suzanne 2 Super Cage", "player-cage"],
];

const textureUrl = (name) => name
  ? `/assets/textures/suzanne2/airplane/${path.basename(name).toUpperCase()}`
  : undefined;

if (source.id !== "suzanne2-ascii-arena" || source.grid?.width !== 40 || source.grid?.height !== 40) {
  throw new Error("Unexpected Suzanne 2 evidence record");
}

for (const [key, id, label, role] of ASSETS) {
  const asset = source.meshAssets?.[key];
  if (!asset?.source?.sha256 || !asset.meshes?.length) throw new Error(`Missing decoded Suzanne 2 asset: ${key}`);
  const meshes = asset.meshes.map((mesh) => ({
    name: mesh.name,
    vertexCount: mesh.vertexCount,
    faceCount: mesh.faceCount,
    triangleCount: mesh.triangleCount,
    positions: mesh.positions,
    uvs: mesh.uvs ?? [],
    indices: mesh.indices,
    groups: mesh.groups,
    materials: mesh.materials.map((material) => ({
      name: material.name,
      color: material.color,
      specularPower: material.specularPower,
      specular: material.specular,
      emissive: material.emissive,
      ...(material.texture ? { textureName: material.texture, textureUrl: textureUrl(material.texture) } : {}),
    })),
  }));
  const payload = {
    source: path.basename(asset.source.path),
    catalog: { label, category: "archive-prop", role },
    provenance: {
      archiveSource: asset.source.path,
      sourceSha256: asset.source.sha256,
      sourceBytes: asset.source.bytes,
      catalogSource: "src/legacy/suzanne2-ascii-scene.json",
      decodedBy: "tools/convert-suzanne2-ascii.mjs DirectX text .x parser; republished by scripts/vendor-suzanne2-meshes.mjs",
      geometryFidelity: "faithful — decoded source-space positions, UVs, indices and material groups copied without simplification; normals derived by the v2 loader",
      animationFidelity: asset.animation?.present
        ? `recorded but absent from v2 playback — ${asset.animation.tracks} tracks / ${asset.animation.lastAuthoredTick} authored ticks`
        : "source carries no animation set",
    },
    meshCount: asset.meshCount,
    vertexCount: asset.vertexCount,
    faceCount: asset.faceCount,
    triangleCount: asset.triangleCount,
    materialGroupCount: meshes.reduce((sum, mesh) => sum + mesh.groups.length, 0),
    normals: "derived",
    bounds: {
      min: asset.bounds.min,
      max: asset.bounds.max,
      size: asset.bounds.max.map((value, axis) => value - asset.bounds.min[axis]),
    },
    animation: asset.animation,
    meshes,
  };
  const outputPath = path.join(ROOT, "public", "assets", "ports", `${id}.json`);
  await writeFile(outputPath, JSON.stringify(payload));
  console.log(`wrote ${path.basename(outputPath)}: ${asset.vertexCount} vertices, ${asset.triangleCount} triangles`);
}
