// KidX's wheeled teaching chassis uses licensed, correctly proportioned LDraw parts.
// Original chassis layout, not an exact reproduction of the Education PDF.
// Usage: node scripts/build-ev3-assets.mjs output/kidx/ldraw
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Box3, CatmullRomCurve3, Color, Euler, Matrix4, PlaneGeometry, TubeGeometry, Vector3 } from "three";
import { LDrawLoader } from "three/addons/loaders/LDrawLoader.js";
import { LDrawConditionalLineMaterial } from "three/addons/materials/LDrawConditionalLineMaterial.js";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { serializeKidxGeometry } from "./kidx-mesh-geometry.mjs";

const library = path.resolve(process.argv[2] ?? "output/kidx/ldraw");
const directory = new URL("../public/assets/kidx/", import.meta.url);
await mkdir(directory, { recursive: true });
const unit = .013; // One pin pitch (20 LDU) = .26 world units; preserve part proportions.
const placements = [];
function part(file, color, position, degrees = [0, 0, 0]) {
  const e = new Matrix4().makeRotationFromEuler(new Euler(...degrees.map((v) => v * Math.PI / 180))).elements;
  placements.push({ file, color, position, degrees, line: `1 ${color} ${position.map((v) => v / unit).join(" ")} ${[e[0], e[4], e[8], e[1], e[5], e[9], e[2], e[6], e[10]].join(" ")} ${file}` });
}
// Moulded ports, speaker grille, printed legends, LCD and button cluster.
part("95646.dat", 15, [0, 2.0, .15], [180, 0, 0]);
for (const sign of [-1, 1]) {
  part("95658.dat", 15, [sign * 1.43, .13, -.7], [180, 0, 0]);
  // Matching 56 mm street tyre and six-spoke rim with hollow spokes, axle and pin holes.
  part("41897.dat", 256, [sign * 2.02, .13, -.7], [0, sign * 90, 0]);
  part("41896.dat", 72, [sign * 2.02, .13, -.7], [0, -sign * 90, 0]);
  part("3705.dat", 0, [sign * 1.83, .13, -.7]);
  part("32525.dat", 0, [sign * 1.04, .55, .15], [0, 0, 90]);
  part("32525.dat", 71, [sign * 1.04, .81, .15], [0, 0, 90]);
  for (const z of [-.89, .15, 1.19]) part("6558.dat", 1, [sign * 1.17, .55, z], [0, 0, 90]);
}
part("64179.dat", 71, [0, .03, .75]);
part("32525.dat", 4, [0, .13, -1.35], [90, 90, 0]);
part("32525.dat", 71, [0, -.13, 1.97], [90, 90, 0]);
part("99948.dat", 494, [0, -.4875, 2.05]);
part("92911.dat", 71, [0, -.4875, 2.05], [-90, 0, 0]);

part("3647.dat", 7, [0, 0, 0]);
part("3648.dat", 7, [0, 0, 0]);
const packed = new Map();
const credits = [];
async function resolve(filename) {
  const key = filename.toLowerCase().replaceAll("\\", "/");
  if (packed.has(key)) return;
  let source;
  for (const prefix of ["parts", "p", "models", ""]) {
    try { source = await readFile(path.join(library, prefix, key), "utf8"); break; } catch { /* next library directory */ }
  }
  if (!source) throw new Error(`Missing LDraw part ${key}; supply an extracted complete library`);
  packed.set(key, source);
  credits.push({ file: key, author: /^0 Author: (.+)$/m.exec(source)?.[1]?.trim() ?? "LDraw contributors",
    license: /^0 !LICENSE (.+)$/m.exec(source)?.[1]?.trim() ?? "See LDraw CAreadme.txt" });
  for (const line of source.split(/\r?\n/)) if (/^1\s/.test(line)) await resolve(line.trim().split(/\s+/).slice(14).join(" "));
}
for (const placement of placements) await resolve(placement.file);
for (const variant of ["base", "wheel-left", "wheel-right", "gear-8", "gear-24"]) {
const wheel = variant.startsWith("wheel-");
const gearFile = variant === "gear-8" ? "3647.dat" : variant === "gear-24" ? "3648.dat" : null;
const sign = variant === "wheel-left" ? -1 : 1;
const selected = placements.filter(p => gearFile ? p.file === gearFile : wheel ? ["41897.dat", "41896.dat"].includes(p.file) && Math.sign(p.position[0]) === sign : !["41897.dat", "41896.dat", "3647.dat", "3648.dat"].includes(p.file));
const source = `0 FILE kidx-driving-base.ldr\n0 KidX wheeled EV3 teaching chassis\n${selected.map((item) => item.line).join("\n")}\n`
  + [...packed].map(([file, text]) => `0 FILE ${file}\n${text}`).join("\n");
globalThis.ProgressEvent ??= class ProgressEvent { constructor(type, values) { this.type = type; Object.assign(this, values); } };
const loader = new LDrawLoader().setConditionalLineMaterial(LDrawConditionalLineMaterial);
loader.setFileMap(Object.fromEntries([...packed.keys()].map((key) => [key, key])));
await loader.preloadMaterials(`data:text/plain;base64,${Buffer.from(await readFile(path.join(library, "LDConfig.ldr"), "utf8")).toString("base64")}`);
const model = await new Promise((resolve, reject) => loader.parse(source, resolve, reject));
model.scale.setScalar(unit); model.updateMatrixWorld(true);
const batches = new Map();
function batch(geometry, material) {
  // Rubber and plastic can share a colour but need distinct surface finishes.
  const key = `${material.name}-${material.color.getHexString()}-${material.opacity}`;
  if (!batches.has(key)) batches.set(key, { material, geometries: [] });
  batches.get(key).geometries.push(geometry);
}
model.traverse((mesh) => {
  if (!mesh.isMesh) return;
  const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  geometry.applyMatrix4(mesh.matrixWorld);
  if (wheel) geometry.translate(-sign * 2.02, -.13, .7);
  geometry.deleteAttribute("uv");
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: geometry.attributes.position.count, materialIndex: 0 }];
  for (const group of groups) {
    const count = Math.min(group.count, geometry.attributes.position.count - group.start);
    if (!count) continue;
    const slice = geometry.clone(); slice.clearGroups();
    for (const attribute of ["position", "normal"]) {
      slice.attributes[attribute].array = geometry.attributes[attribute].array.slice(group.start * 3, (group.start + count) * 3);
      slice.attributes[attribute].count = count;
    }
    if (mesh.matrixWorld.determinant() < 0) {
      for (const attribute of ["position", "normal"]) {
        const values = slice.attributes[attribute].array;
        for (let i = 0; i < values.length; i += 9) for (let axis = 0; axis < 3; axis++)
          [values[i + 3 + axis], values[i + 6 + axis]] = [values[i + 6 + axis], values[i + 3 + axis]];
      }
    }
    batch(slice, materials[group.materialIndex]);
  }
});
if (variant === "base") {
// Original flexible motor leads; the moulded EV3 sockets are part of the licensed CAD.
for (const sign of [-1, 1]) {
  const curve = new CatmullRomCurve3([
    new Vector3(sign * 1.43, .676, 2.44), new Vector3(sign * 1.43, .95, 2.85),
    new Vector3(sign * .8, 1.55, 2.86), new Vector3(sign * .247, 1.545, 2.05),
  ]);
  const geometry = new TubeGeometry(curve, 32, .043, 8, false).toNonIndexed();
  geometry.deleteAttribute("uv");
  batch(geometry, { name: "Cable_Rubber", color: new Color("#16191c"), opacity: 1 });
}
}
const meshes = [...batches.values()].map(({ material, geometries }) => {
  const geometry = mergeVertices(mergeGeometries(geometries), .00001);
  return { name: material.name, ...serializeKidxGeometry(geometry),
    materials: [{ name: material.name, color: [material.color.r, material.color.g, material.color.b, material.opacity], specularPower: 45 }] };
});
// Powered LCD artwork sits within the CAD screen bezel; preserve its texture coordinates.
if (variant === "base") {
const screen = new PlaneGeometry(1.4, .88).rotateX(-Math.PI / 2).translate(0, 2.25, -.864);
meshes.push({ name: "LCD", positions: Array.from(screen.attributes.position.array), normals: Array.from(screen.attributes.normal.array),
  uvs: Array.from(screen.attributes.uv.array), indices: Array.from(screen.index.array),
  materials: [{ name: "LCD", textureUrl: "/assets/kidx/ev3-lcd.svg" }] });
}
const provenance = { source: "LDraw official parts library; original KidX chassis layout and motor cables",
  reference: "https://education.lego.com/en-us/product-resources/mindstorms-ev3/downloads/building-instructions/",
  representation: "Real part geometry; adapted wheeled assembly, not a validated Education building instruction or hardware simulation",
  licenseLinks: ["https://creativecommons.org/licenses/by/4.0/", "https://creativecommons.org/licenses/by/2.0/"],
  changes: "Original part placement; native mesh conversion with authored normals and degenerate-face cleanup; batching by material; conditional edge lines omitted",
  parts: selected.map(({ line, ...placement }) => placement), files: credits };
await writeFile(new URL(`ev3-driving-${variant}.json`, directory), JSON.stringify({
  catalog: { label: variant === "base" ? "EV3 Technic Driving Base" : `EV3 ${variant}`, category: "vehicle" }, provenance, meshes,
}));
const bounds = new Box3().setFromObject(model);
console.log(JSON.stringify({ batches: meshes.length, triangles: meshes.reduce((n, mesh) => n + mesh.indices.length / 3, 0),
  bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, sourceFiles: credits.length }));

}
