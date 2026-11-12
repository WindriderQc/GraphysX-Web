// Convert the already recovered Blender FBX into the ordinary v2 model payload.
// Offline, deterministic, source-hash locked; no Datalake or Blender install is required.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Box3, LoadingManager, Texture } from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const archive = path.resolve(process.argv[2] || path.join(root, "..", "GraphysX"));
const variant = process.argv[3] || "cuisine";
if (variant !== "cuisine" && variant !== "maison") throw new Error("Expected cuisine or maison");
const house = variant === "maison";
const source = `web-prototype/public/assets/maison-explorer/${house ? "maison" : "cuisine"}-best.fbx`;
const bytes = await readFile(path.join(archive, source));
const sha256 = createHash("sha256").update(bytes).digest("hex");
const expectedHash = house ? "43cb7e5206f56d71ed6bf7986662b3eb504634616fdda1ed7bfa8875427f8db7" : "24846d8ec083477f87e91f46ed31da952a575b7f7cd3b234b6d11a4603b5b14e";
if (sha256 !== expectedHash) throw new Error(`${variant} source hash changed`);
const manager = new LoadingManager();
// The one external photograph was already absent in the original revival. Preserve that
// boundary instead of fetching an arbitrary file or inventing a replacement texture.
manager.addHandler(/.*/, { load: () => new Texture() });
// FBXLoader uses viewport dimensions when parsing an embedded camera. Its camera is
// inspection metadata only here; the product uses the saved Blender camera record.
globalThis.window = { innerWidth: 1600, innerHeight: 900 };
const scene = new FBXLoader(manager).parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
// The earlier revival explicitly inverted Blender FBX centimetres by 0.01.
scene.scale.setScalar(0.01);
scene.updateMatrixWorld(true);
const bounds = new Box3().setFromObject(scene);
const rhMin = bounds.min.toArray(), rhMax = bounds.max.toArray();
const min = [rhMin[0], rhMin[1], -rhMax[2]], max = [rhMax[0], rhMax[1], -rhMin[2]];
const meshes = [];
scene.traverse((object) => {
  if (!object.isMesh) return;
  const transformed = object.geometry.clone().applyMatrix4(object.matrixWorld);
  const geometry = mergeVertices(transformed, 1e-7);
  transformed.dispose();
  if (!geometry.index) geometry.setIndex(Array.from({ length: geometry.attributes.position.count }, (_, i) => i));
  const positions = [], normals = [], uvs = [];
  const p = geometry.attributes.position, n = geometry.attributes.normal, uv = geometry.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    positions.push(p.getX(i), p.getY(i), -p.getZ(i));
    if (n) normals.push(n.getX(i), n.getY(i), -n.getZ(i));
    if (uv) uvs.push(uv.getX(i), uv.getY(i));
  }
  const indices = [];
  // Mirrored object transforms and the payload's handedness change both affect winding.
  const reverse = object.matrixWorld.determinant() > 0;
  for (let i = 0; i < geometry.index.count; i += 3) indices.push(geometry.index.getX(i), geometry.index.getX(i + (reverse ? 2 : 1)), geometry.index.getX(i + (reverse ? 1 : 2)));
  const materials = (Array.isArray(object.material) ? object.material : [object.material]).map((material) => ({
    name: material.name, diffuse: material.color?.toArray() ?? [0.8, 0.8, 0.8],
    opacity: material.opacity, emissive: material.emissive?.toArray() ?? [0, 0, 0],
    specular: material.specular?.toArray() ?? [0.067, 0.067, 0.067], specularPower: material.shininess ?? 18,
  }));
  meshes.push({ name: object.name, positions, normals, uvs: uv ? uvs : null, indices,
    groups: geometry.groups.map((group) => ({ start: group.start, count: group.count, materialIndex: group.materialIndex ?? 0 })), materials });
  geometry.dispose();
});
if (meshes.length !== (house ? 24 : 76)) throw new Error(`Unexpected ${variant} mesh count: ${meshes.length}`);
const payload = {
  catalog: { label: `${house ? "Maison" : "Cuisine"} · complete Blender archive`, category: "archive-prop" },
  bounds: { min, max, size: min.map((value, axis) => max[axis] - value) }, meshes,
  provenance: { archiveSource: house ? "blenderModel/Maison/maison.blend → maison-best.fbx" : "blenderModel/Maison/Cuisine.blend → cuisine-best.fbx", source, sha256,
    faithful: [`All ${house ? 24 : 76} meshes with world transforms, normals, UVs, material groups and source colours`],
    adapted: ["Hierarchy baked into named model meshes", "Blender lighting translated by the scene composer"],
    absent: house ? [] : ["Unpacked Desktop JPG already missing in the recovered Blender file"] },
};
await writeFile(path.join(root, `public/assets/ports/archive-${variant}.json`), JSON.stringify(payload,
  (_key, value) => typeof value === "number" ? Number(value.toFixed(7)) : value));
console.log(JSON.stringify({ meshes: meshes.length, vertices: meshes.reduce((n, mesh) => n + mesh.positions.length / 3, 0), bounds: payload.bounds }));
