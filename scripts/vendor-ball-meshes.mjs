// Vendor the recovered 2011 ball meshes — BallShell / BallCtrl / BallFire — from the legacy
// TVM catalog into ordinary v2 model assets. The fourth payload is not new geometry: it
// republishes BallCtrl verbatim with the ledger-recorded GridXL classic skin so the three
// source-era appearances can be selected as ordinary scene vocabulary.
//
// The original BallZ player was never a wireframe primitive: it is BallShell.tvm (the open
// cage the player sees) around an inner controller ball wearing FireArrow800.JPG — the
// arrow TEXTURE on the inner ball is the aim indicator. All three meshes were decoded long
// ago into `src/legacy/tvm-catalog.json` and used only by the legacy race path; this script
// re-publishes them as `graphysx-mesh-json` payloads under `public/assets/ports/`, where
// `build-asset-catalog.mjs` picks them up as spawnable, discoverable assets. Faithful
// recovery, not adaptation: positions, UVs and indices are copied verbatim (the loader
// derives creased normals exactly as it does for every recovered mesh).
//
//   node scripts/vendor-ball-meshes.mjs && node scripts/build-asset-catalog.mjs

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(await readFile(path.join(ROOT, "src", "legacy", "tvm-catalog.json"), "utf8"));
const ball = catalog.ball;
if (!ball?.shell?.positions?.length) throw new Error("tvm-catalog.json carries no ball meshes");

const PARTS = [
  {
    kind: "shell",
    file: "archive-ballshell.json",
    name: "BallShell",
    source: "BallZ 2011/Release/Media/Ball/BallShell.tvm",
    // The open cage. Untextured in the archive; its revival look (translucency) is a
    // recovered-PBR profile in agent-world-assets.ts, keyed by asset id — not baked here.
    material: { name: "ballshell", color: [0.85, 0.95, 0.97, 1] },
  },
  {
    kind: "ctrl",
    file: "archive-ballctrl.json",
    name: "BallCtrl",
    source: "BallZ 2011/Release/Media/Ball/BallCtrl.tvm",
    material: { name: "ballctrl", color: [1, 1, 1, 1], textureName: "FireArrow800.JPG", textureUrl: "/assets/textures/ball/FireArrow800.jpg" },
  },
  {
    kind: "ctrl",
    file: "archive-ballctrl-gridxl.json",
    name: "BallCtrlGridXL",
    source: "BallZ 2011/Release/Media/Ball/BallCtrl.tvm + Media/GridXL.bmp",
    material: { name: "ballctrl-gridxl", color: [1, 1, 1, 1], textureName: "GridXL.bmp", textureUrl: "/assets/textures/ball/GridXL.bmp" },
    fidelity: "faithful BallCtrl positions, UVs and indices copied unmodified; GridXL restored as the recorded classic skin",
  },
  {
    kind: "fire",
    file: "archive-ballfire.json",
    name: "BallFire",
    source: "BallZ 2011/Release/Media/Ball/BallFire.tvm",
    material: { name: "ballfire", color: [1, 1, 1, 1], textureName: "FireArrow800.JPG", textureUrl: "/assets/textures/ball/FireArrow800.jpg" },
  },
];

for (const part of PARTS) {
  const mesh = ball[part.kind];
  if (!mesh?.positions?.length) {
    console.warn(`skipping ${part.kind}: not in the catalog`);
    continue;
  }
  const vertexCount = mesh.positions.length / 3;
  const triangleCount = mesh.indices.length / 3;
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], size: [0, 0, 0] };
  for (let i = 0; i < mesh.positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      bounds.min[axis] = Math.min(bounds.min[axis], mesh.positions[i + axis]);
      bounds.max[axis] = Math.max(bounds.max[axis], mesh.positions[i + axis]);
    }
  }
  // `modelFit` scales by bounds.size — a payload without it fails to fit, not gracefully.
  bounds.size = bounds.max.map((value, axis) => value - bounds.min[axis]);
  const payload = {
    source: part.source,
    provenance: {
      archiveSource: part.source,
      decodedBy: "TVM decode into src/legacy/tvm-catalog.json; republished verbatim by scripts/vendor-ball-meshes.mjs",
      fidelity: part.fidelity ?? "faithful — positions, UVs and indices copied unmodified; normals derived by the loader",
    },
    meshCount: 1,
    vertexCount,
    faceCount: triangleCount,
    triangleCount,
    materialGroupCount: 1,
    normals: "derived",
    bounds,
    radius: mesh.radius,
    meshes: [
      {
        name: part.name,
        vertexCount,
        faceCount: triangleCount,
        triangleCount,
        positions: mesh.positions,
        uvs: mesh.uvs ?? [],
        indices: mesh.indices,
        groups: [{ start: 0, count: mesh.indices.length, materialIndex: 0 }],
        materials: [part.material],
      },
    ],
  };
  const file = path.join(ROOT, "public", "assets", "ports", part.file);
  await writeFile(file, JSON.stringify(payload));
  console.log(`wrote ${file} (${vertexCount} verts, ${triangleCount} tris, radius ${mesh.radius})`);
}
