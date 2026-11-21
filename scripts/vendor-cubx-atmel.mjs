import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { decodeCubzActor, sourceHash } from "./cubz-source.mjs";
import { decodeTvmGeometry, webTvmMesh } from "./impreza-source.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const archive = path.resolve(root, process.argv.find(arg => arg.startsWith("--archive="))?.slice(10) || "../GraphysX");
const check = process.argv.includes("--check");
const pins = JSON.parse(await readFile(path.join(root, "src/content/cubx-atmel-sources.json"), "utf8"));
const bytes = new Map();
for (const pin of pins.records) {
  const value = await readFile(path.join(archive, pin.source));
  assert.equal(value.length, pin.bytes, pin.source + " size");
  assert.equal(sourceHash(value), pin.sha256, pin.source + " source hash");
  bytes.set(pin.source, value);
}
async function output(url, value) {
  const target = path.join(root, "public", url.slice(1));
  const data = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value) + "\n");
  if (check) {
    const actual = await readFile(target);
    assert.ok(Buffer.isBuffer(value) ? actual.equals(data) : actual.toString().replace(/\r\n/g, "\n") === data.toString(), url + " differs from pinned sources");
  } else { await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, data); }
}
const media = "Yanik C++ BCKUP/Media/", family = media + "CubXActor/";
const textureDirectory = "/assets/ports/cubx-atmel/textures/";
const textures = {};
for (const file of ["SystemIcon.jpg", "ToolsIcon.png", "Earth.jpg", "EarthGridXL.bmp", "gold_01.jpg", "marble10.jpg", "grass.bmp"]) {
  textures[file] = textureDirectory + file;
  await output(textures[file], bytes.get(media + "Models/" + file));
}
const actors = {}, studies = {};
for (const [source, value] of bytes) if (source.startsWith(family) && source.endsWith(".tva")) {
  const file = path.basename(source), actor = decodeCubzActor(value, source);
  const key = /^CubXGet([2-8])/.exec(file)?.[1];
  if (key) actors["get" + key] = actor;
  else if (file === "CubXOpen.tva") actors.open = actor;
  else studies[file.replace(/\.tva$/, "")] = actor;
}
assert.equal(Object.keys(actors).length, 8); assert.equal(Object.keys(studies).length, 8);
const clicks = Array.from({ length: 8 }, (_, i) => decodeTvmGeometry(bytes.get(family + `CubXBtn${i + 1}.tvm`), family + `CubXBtn${i + 1}.tvm`));
const models = {}, glyphs = {};
async function model(key, source, label, texture, category = "archive-prop") {
  const native = decodeTvmGeometry(bytes.get(source), source), mesh = webTvmMesh(native);
  if (category === "glyph") glyphs[key] = native;
  const id = "archive-cubx-atmel-" + key, url = `/assets/ports/${id}.json`;
  // Native origins stay intact, as in the car recovery: fitting bounds would recenter
  // each satellite, glyph and the closed actor independently and break the composition.
  await output(url, { catalog: { label, category }, sourceBounds: native.bounds, origin: "native",
    provenance: { archiveSource: source, sourceSha256: native.sha256, materialRecordVersion: native.materialRecordVersion,
      materialRecordSha256: native.materialRecordSha256, embeddedMaterialBoundary: "Native record retained by hash; the source host overrides its visible material/texture.",
      coordinateBoundary: "Reflect Z once on geometry/normals; winding follows authored normals; no recentering, fitting or UV rewriting." },
    meshes: [{ name: path.basename(source), positions: mesh.positions, normals: mesh.normals, uvs: mesh.uvs, indices: mesh.indices,
      materials: [{ name: texture ? path.basename(texture) + " · source host override" : "StdMat · source host override", ...(texture ? { textureUrl: texture, textureFlipY: false } : { color: category === "glyph" ? [0.08, 0.3, 1, 1] : [0.8, 0.8, 0.8, 1] }), ...(key === "domotics" ? { emissive: [.12, .08, .025] } : {}), specularPower: 20 }] }] });
  models[key] = { id, url, source, sourceSha256: native.sha256, vertexCount: native.vertexCount, triangleCount: native.triangleCount, sourceBounds: native.bounds };
}
await model("closed", family + "CubXMesh.tvm", "CubX · assemblage TVM d’origine");
await model("earth", media + "Models/Earth.TVM", "CubX · Terre d’origine", textures["Earth.jpg"]);
await model("grid", media + "Models/Sphere.tvm", "CubX · grille terrestre d’origine", textures["EarthGridXL.bmp"]);
await model("indicator", media + "Models/Sphere.tvm", "CubX · voyant Atmel d’origine", textures["gold_01.jpg"]);
await model("system", media + "Models/Box.tvm", "CubX · cube Système d’origine", textures["SystemIcon.jpg"]);
await model("tools", media + "Models/Box.tvm", "CubX · cube Outils d’origine", textures["ToolsIcon.png"]);
await model("arrow", media + "Models/fleche.TVM", "CubX · retour au menu d’origine", textures["marble10.jpg"]);
await model("domotics", media + "Models/MenuDomo.TVM", "CubX · panneau Atmel d’origine", textures["gold_01.jpg"]);
for (let i = 0; i < 10; i++) await model("digit-" + i, media + "Alphabet/" + i + ".tvm", "CubX · chiffre 3D " + i, undefined, "glyph");
const heightSource = media + "textures n else/Heightmaps/heightmapSplit.jpg";
const image = await loadImage(bytes.get(heightSource)), canvas = createCanvas(image.width, image.height), context = canvas.getContext("2d");
context.drawImage(image, 0, 0); const pixels = context.getImageData(0, 0, image.width, image.height).data;
const segments = 64, heights = [];
for (let z = 0; z <= segments; z++) for (let x = 0; x <= segments; x++) {
  const sx = Math.round(x / segments * (image.width - 1)), sz = Math.round((1 - z / segments) * (image.height - 1));
  heights.push(pixels[(sz * image.width + sx) * 4] / 255);
}
await output("/assets/ports/archive-cubx-atmel.json", {
  schema: "graphysx.cubx-atmel-source/v1", generator: "scripts/vendor-cubx-atmel.mjs", sourcePins: pins.records,
  coordinateBoundary: "Actors/click meshes retain raw native coordinates and passive keys. Published model files reflect Z once and preserve their native origin.",
  actors, studies, clicks, models, glyphs, textures,
  terrain: { source: heightSource, sourceSha256: sourceHash(bytes.get(heightSource)), sourceImageSize: [image.width, image.height], sourcePosition: [-2048, 0, -2048], size: 4096, heightScale: 255, segments, heights,
    adaptation: "Counted red-channel height samples, reversed Z and resampled to64segments. Native GenerateTerrain precision, default vertical scale and solver parity are not certified." },
  controller: { source: "AtmelCubx/AtmelCubx/CubX.cpp", directChoice: 1, nativeGetByChoice: [null, "get2", "get3", "get4", "get5", "get6", "get7", "get8"],
    correction: "Bind/endpoint geometry determines the spatial choice. Repair the original shifted array index and eighth uninitialized slot; keep native paths/timing as evidence." },
  missing: ["The distinct CubZ internal Media/CubXBtn/Btn1..32.tvm and BtnExit.tvm have not been recovered; these eight outer CubXActor click meshes are a different family.", "Native Atmel device transport, native TV3D/Newton render/solver parity and historical inner action labels are not asserted."]
});
console.log(JSON.stringify({ sourceFilesReadOnly: pins.records.length, playableActors: Object.keys(actors).length, preservedStudyActors: Object.keys(studies).length, originalClickMeshes: clicks.length, discoverableNativeModels: Object.keys(models).length, terrain: [image.width, image.height, segments], check }));
