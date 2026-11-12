import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Box3 } from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const archive = path.resolve(process.argv[2] || path.join(root, "..", "GraphysX"));
const source = "web-prototype/public/assets/arena-archive/Arena.obj";
const bytes = await readFile(path.join(archive, source));
const sha256 = createHash("sha256").update(bytes).digest("hex");
if (sha256 !== "ae582845ac6eab09c65430eed51e866ad40e787cbf4b652de0b4a9dbe620be45") throw new Error("Arena source changed");
const object = new OBJLoader().parse(bytes.toString("utf8"));
const bounds = new Box3().setFromObject(object);
const meshes = [];
object.traverse((child) => {
  if (!child.isMesh) return;
  const p = child.geometry.attributes.position, n = child.geometry.attributes.normal, uv = child.geometry.attributes.uv;
  const positions = [], normals = [], uvs = [], indices = [];
  for (let i = 0; i < p.count; i++) {
    positions.push(p.getX(i), p.getY(i), -p.getZ(i));
    normals.push(n.getX(i), n.getY(i), -n.getZ(i));
    uvs.push(uv.getX(i), uv.getY(i));
  }
  for (let i = 0; i < p.count; i += 3) indices.push(i, i + 2, i + 1);
  meshes.push({ name: child.name, positions, normals, uvs, indices,
    materials: [{ name: "Unity Standard arena", diffuse: [1, 1, 1], opacity: 1, textureUrl: "/assets/arena-archive/arena.png" }] });
});
const min = [bounds.min.x, bounds.min.y, -bounds.max.z], max = [bounds.max.x, bounds.max.y, -bounds.min.z];
await writeFile(path.join(root, "public/assets/ports/archive-unity-arena.json"), JSON.stringify({
  catalog: { label: "Unity Arena", category: "archive-prop" }, meshes,
  bounds: { min, max, size: min.map((value, axis) => max[axis] - value) },
  provenance: { archiveSource: "Unity Arena/Arena.obj", sha256, faithful: ["Complete source OBJ normals, UVs and hand-painted atlas"],
    adapted: ["Right-handed geometry encoded into the legacy model payload", "Lighting and material translation in the v2 composition"], absent: ["No source gameplay scripts exist"] },
}));
console.log(`Converted Unity Arena: ${meshes.length} mesh, ${meshes.reduce((sum, mesh) => sum + mesh.indices.length / 3, 0)} triangles`);
