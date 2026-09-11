// Convert licensed LDraw geometry to native scene assets. No LDraw library is needed at runtime.
// Usage: node scripts/import-kidx-ldraw.mjs output/kidx/ldraw output/kidx/31313_-_mindstorms_ev3_-_track3r.mpd track3r
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { Box3, Matrix4, Vector3 } from "three";
import { LDrawLoader } from "three/addons/loaders/LDrawLoader.js";
import { LDrawConditionalLineMaterial } from "three/addons/materials/LDrawConditionalLineMaterial.js";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { serializeKidxGeometry } from "./kidx-mesh-geometry.mjs";

const [library, source, name = "track3r"] = process.argv.slice(2);
if (!library || !source) throw new Error("Supply the local LDraw library and source MPD paths");
const data = await readFile(source, "utf8");
const sections = new Map();
for (const section of data.split(/^0 FILE /m).slice(1)) {
  const newline = section.indexOf("\n");
  sections.set(section.slice(0, newline).trim().toLowerCase().replaceAll("\\", "/"), section.slice(newline + 1));
}
const rootName = `31313 - ${name}.ldr`;
if (!sections.has(rootName)) throw new Error(`Missing robot root ${rootName}`);
const packed = new Map();
const credits = [];
const resolving = new Set();
async function resolve(filename) {
  const key = filename.toLowerCase().replaceAll("\\", "/");
  if (resolving.has(key)) throw new Error(`Circular LDraw dependency: ${[...resolving, key].join(" -> ")}`);
  if (packed.has(key)) return;
  resolving.add(key);
  let text = sections.get(key);
  if (!text) {
    for (const prefix of ["parts", "p", "models", ""]) {
      try { text = await readFile(path.join(library, prefix, key), "utf8"); break; } catch { /* next library folder */ }
    }
  }
  if (!text) throw new Error(`Missing LDraw part: ${key}`);
  packed.set(key, text);
  credits.push({ file: key, author: /^0 Author: (.+)$/m.exec(text)?.[1]?.trim() ?? "LDraw contributors",
    license: /^0 !LICENSE (.+)$/m.exec(text)?.[1]?.trim() ?? "See source MPD" });
  for (const line of text.split(/\r?\n/)) {
    if (/^1\s/.test(line)) await resolve(line.trim().split(/\s+/).slice(14).join(" "));
  }
  resolving.delete(key);
}
await resolve(rootName);
const packedData = [...packed].map(([file, text]) => `0 FILE ${file}\n${text}`).join("\n");
console.log(`Resolved ${packed.size} LDraw files for ${name}`);
globalThis.ProgressEvent ??= class ProgressEvent { constructor(type, values) { this.type = type; Object.assign(this, values); } };
const loader = new LDrawLoader().setConditionalLineMaterial(LDrawConditionalLineMaterial);
loader.setFileMap(Object.fromEntries([...packed.keys()].map((key) => [key, key])));
await loader.preloadMaterials(`data:text/plain;base64,${Buffer.from(await readFile(path.join(library, "LDConfig.ldr"), "utf8")).toString("base64")}`);
const model = await new Promise((resolve, reject) => loader.parse(packedData, resolve, reject));
model.updateMatrixWorld(true);
const parts = [];
const visit = (object) => {
  // A generated cable contains thousands of rendering segments, not thousands of kit pieces.
  if (/ev3cable-studio-\d\.ldr$/i.test(object.userData.fileName ?? "") || /^(Unofficial_)?(Part|Shortcut)$/.test(object.userData.type ?? "")) parts.push(object);
  else for (const child of object.children) visit(child);
};
visit(model);
console.log(`Logical parts: ${parts.length}, construction groups: ${model.userData.numBuildingSteps}`);
await mkdir("output/kidx", { recursive: true });
await writeFile(`output/kidx/${name}-hierarchy.json`, JSON.stringify(parts.map((p) => ({ name: p.name, ...p.userData, children: p.children.length })), null, 2));
const rotation = new Matrix4().makeRotationX(Math.PI);
model.applyMatrix4(rotation); model.updateMatrixWorld(true);
const bounds = new Box3().setFromObject(model);
const size = bounds.getSize(new Vector3());
const center = bounds.getCenter(new Vector3());
const scale = 5.4 / Math.max(size.x, size.z);
const normalize = new Matrix4().makeScale(scale, scale, scale).multiply(new Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z));
const out = path.resolve(`public/assets/kidx/builds/${name}`);
await mkdir(out, { recursive: true });
const assemblies = new Map();
const nativeMeshes = (batches) => [...batches].map(([name, { material, geometries }]) => {
  const geometry = mergeVertices(mergeGeometries(geometries), .00001);
  return { name, ...serializeKidxGeometry(geometry), materials: [{ name: material.name,
    color: [material.color.r, material.color.g, material.color.b, material.opacity], specularPower: 45 }] };
});
// Native model assets are merged by construction step and color to keep draw calls bounded.
for (const part of parts) {
  const step = part.userData.buildingStep ?? 0;
  if (!assemblies.has(step)) assemblies.set(step, { pieces: [], geometry: new Map() });
  const assembly = assemblies.get(step);
  const pieceGeometry = new Map();
  const pieceCenter = new Box3().setFromObject(part).getCenter(new Vector3()).applyMatrix4(normalize);
  const pieceId = `piece-${parts.indexOf(part)}`;
  assembly.pieces.push({ file: part.userData.fileName, color: part.userData.colorCode,
    url: `/assets/kidx/builds/${name}/${pieceId}.json`, center: pieceCenter.toArray().map(v => Number(v.toFixed(6))),
    label: /ev3cable/i.test(part.name) ? "EV3 Cable" : packed.get(part.userData.fileName?.toLowerCase())?.split(/\r?\n/)[0].replace(/^0\s+/, "") ?? part.name });
  part.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    const transform = normalize.clone().multiply(mesh.matrixWorld);
    geometry.applyMatrix4(transform);
    geometry.deleteAttribute("uv");
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: geometry.attributes.position.count, materialIndex: 0 }];
    for (const group of groups) {
      const count = Math.min(group.count, geometry.attributes.position.count - group.start);
      if (count <= 0) continue;
      const material = materials[group.materialIndex];
      const key = `${material.color.getHexString()}-${material.opacity}`;
      if (!assembly.geometry.has(key)) assembly.geometry.set(key, { material, geometries: [] });
      const slice = geometry.clone();
      slice.clearGroups();
      slice.setAttribute("position", geometry.attributes.position.clone());
      slice.attributes.position.array = geometry.attributes.position.array.slice(group.start * 3, (group.start + count) * 3);
      slice.attributes.position.count = count;
      slice.attributes.normal.array = geometry.attributes.normal.array.slice(group.start * 3, (group.start + count) * 3);
      slice.attributes.normal.count = count;
      // LDraw can use reflected matrices; reverse triangle winding after reflection.
      if (transform.determinant() < 0) {
        for (const attribute of [slice.attributes.position, slice.attributes.normal]) {
          const values = attribute.array;
          for (let i = 0; i < values.length; i += 9) for (let axis = 0; axis < 3; axis++)
            [values[i + 3 + axis], values[i + 6 + axis]] = [values[i + 6 + axis], values[i + 3 + axis]];
        }
      }
      assembly.geometry.get(key).geometries.push(slice);
      if (!pieceGeometry.has(key)) pieceGeometry.set(key, { material, geometries: [] });
      pieceGeometry.get(key).geometries.push(slice.clone().translate(-pieceCenter.x, -pieceCenter.y, -pieceCenter.z));
    }
  });
  await writeFile(path.join(out, `${pieceId}.json`), JSON.stringify({ meshes: nativeMeshes(pieceGeometry) }));
}
const steps = [];
for (const [sourceStep, assembly] of assemblies) {
  const meshes = nativeMeshes(assembly.geometry);
  const id = `${name}-${steps.length + 1}`;
  const url = `/assets/kidx/builds/${name}/${id}.json`;
  await writeFile(path.join(out, `${id}.json`), JSON.stringify({ meshes }));
  steps.push({ sourceStep, url, pieces: assembly.pieces });
}
await writeFile(path.join(out, "credits.json"), JSON.stringify({ author: "Philippe Hurbain (Philo) and LDraw part authors", source: `https://www.brickshelf.com/gallery/Philo/SetModels/Set31313/31313_-_mindstorms_ev3_-_${name}.mpd`, licenseLinks: ["https://creativecommons.org/licenses/by/2.0/", "https://creativecommons.org/licenses/by/4.0/"], changes: "Converted to native meshes; authored normals retained; coordinate normalization; construction-step batching; conditional edges and texture-mapped stickers omitted", files: credits }, null, 2));
await writeFile(`src/kidx-${name}-build.json`, JSON.stringify({ id: name, label: name === "track3r" ? "TRACK3R" : "SPIK3R", height: size.y * scale, width: size.x * scale, depth: size.z * scale, steps }, null, 2));
console.log(`Exported ${steps.length} native assembly steps into ${out}`);
