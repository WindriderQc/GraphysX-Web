import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodeImprezaTvm, decodeImprezaBmp, decodeImprezaDxt1, sourceSha256, webTvmMesh } from "./impreza-source.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const archive = path.resolve(root, process.argv.find(value => value.startsWith("--archive="))?.slice(10) || "../GraphysX");
const check = process.argv.includes("--check");
const base = "/assets/ports/impreza";
const originals = [];
async function source(relative, expected) {
  const bytes = await readFile(path.join(archive, relative)), sha256 = sourceSha256(bytes);
  if (expected) assert.equal(sha256, expected, `Source pin changed: ${relative}`);
  originals.push({ source: relative, sha256, bytes: bytes.length }); return bytes;
}
async function output(url, value) {
  const filename = path.join(root, "public", url.slice(1));
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value) + "\n");
  if (check) {
    const committed = await readFile(filename);
    assert.ok(Buffer.isBuffer(value) ? committed.equals(bytes) : committed.toString("utf8").replace(/\r\n/g, "\n") === bytes.toString("utf8"), `Generated Impreza asset differs: ${url}`);
  } else { await mkdir(path.dirname(filename), { recursive: true }); await writeFile(filename, bytes); }
}

const media = "Yanik C++ BCKUP/Media/";
const textures = {};
for (const name of ["ChassisSTi.bmp", "Windows.bmp", "Undercarriage.bmp", "Wheel.bmp"]) {
  const bytes = await source(media + "Models/cars/" + name);
  const url = `${base}/textures/${name}`; await output(url, bytes); textures[name] = url;
}
const definitions = [
  ["chassis", "archive-impreza-native-chassis", "cars/chassis.TVM", "991061c6199e20ba5d3ee797dd6919c630e9ffb1704ccbd39deaf9e153410bc1"],
  ["leftWheel", "archive-impreza-native-wheel-left", "cars/wheel_l.TVM", "13f5f0737a2683d8b78a70ab4d3b323eba7144d92484c9bcacdcd0c5985fd2d8"],
  ["rightWheel", "archive-impreza-native-wheel-right", "cars/wheel_r.TVM", "f17d62d548ab59f65f5a4728980eed52d9b7f55886eaed4750f911b693f75449"],
  ["ring", "archive-racinx-ring", "ring.tvm", "e62514c60a98c1eaca96773332a06c95bc7586f86f9360faa07e17003b2cb372"],
];
const models = {};
for (const [key, id, filename, pin] of definitions) {
  const relative = media + "Models/" + filename;
  const decoded = decodeImprezaTvm(await source(relative, pin), relative), mesh = webTvmMesh(decoded);
  const materials = key === "chassis" ? [
    { name: "Material#1 (CHASIS.JPG) · native TVM body", textureUrl: textures["ChassisSTi.bmp"], textureFlipY: false, specularPower: 100 },
    { name: "Material#2 (VENTANAS.JPG) · native TVM glass", textureUrl: textures["Windows.bmp"], textureFlipY: false, specularPower: 10 },
    { name: "Material #3 (CHASIS_A.JPG) · native TVM undercarriage", textureUrl: textures["Undercarriage.bmp"], textureFlipY: false, specularPower: 12 },
  ] : key === "ring" ? [{ name: "Source yellow ring", color: [1, 1, 0, 1], specularPower: 18 }]
    : [{ name: "ruedas (RUEDAS.JPG) · native TVM wheel", textureUrl: textures["Wheel.bmp"], textureFlipY: false, specularPower: 100 }];
  assert.equal(materials.length, decoded.materialCount);
  const url = `${base}/models/${key}.json`;
  // Deliberately omit runtime `bounds`: modelFit already supports native-origin payloads.
  // Supplying fitting bounds would recenter every part and lose the source wheel pivots.
  await output(url, { sourceBounds: decoded.bounds, origin: "native", provenance: { source: relative, sourceSha256: decoded.sha256,
    coordinateBoundary: "Z reflection on positions/normals; winding follows exported normals; no origin recentering or UV rewriting", rewoundTriangles: mesh.rewoundTriangles },
    meshes: [{ name: key, positions: mesh.positions, normals: mesh.normals, uvs: mesh.uvs, indices: mesh.indices, groups: mesh.groups, materials }] });
  models[key] = { id, url, source: relative, sourceSha256: decoded.sha256, vertexCount: decoded.vertexCount, triangleCount: decoded.triangleCount,
    materialCount: decoded.materialCount, sourceBounds: decoded.bounds, preserveOrigin: true, trailerBytes: decoded.trailerBytes, trailerSha256: decoded.trailerSha256 };
}

const atmelPath = "AtmelCubx/AtmelCubx/CarScene.cpp", racinxPath = "Yanik C++ BCKUP/RacinX/CarScene.cpp";
await source(atmelPath, "8d549904d76b0600990eb181eacc61e287eca05203a00ec04d5ef48a92c007ea");
await source("AtmelCubx/AtmelCubx/CarScene.h", "db4a00c2ee1b94086b32521dcc0a891f3dd0b4d03ca2795e54e92e39b4792f3e");
await source(racinxPath, "a5913d74c88bf0aaf397c2e148ef48ae41b6e76cabaa8a4402a6f525792a9eaa");
await source("AtmelCubx/AtmelCubx/Vehicule.cpp", "bf74e4b916e3544cddc7e7f37a23dca872df5ddacfe63483dc569034324d61f4");
await source("AtmelCubx/AtmelCubx/Land.cpp", "4f9a1c724e89e76f4e1ec246bf1f01d143a5e566f8ca6eb083ea6f4bb79713d6");
await source("Yanik C++ BCKUP/RacinX/Atmosphere.cpp", "ef7b2feb8de158a42dce761a3498e73ca30c1e9539608ef39bfc1314aec6df71");
await source("Yanik C++ BCKUP/RacinX/Anneau.cpp", "08207e1590a9770412b3a9003a4d1bc6ecadf03cd1cf304cf063aa67c4c83fe8");
const flatPath = media + "textures n else/Heightmaps/CarHeightmap.bmp";
const flatBytes = await source(flatPath, "e7c3678ce42c48bda56dc15046aa94c31c6ee8f7958dbe40c707e244bb4e7c83"), flat = decodeImprezaBmp(flatBytes);
assert.ok(flat.rgba.every((value, index) => index % 4 === 3 ? value === 255 : value === 0), "CarHeightmap is no longer entirely black");
const fieldPath = media + "textures n else/Heightmaps/RecTrack5.dds";
const fieldBytes = await source(fieldPath, "7a490bfad5c9efda585668c8aa109054861aeccaff6d58927b66767d12da7cc1"), field = decodeImprezaDxt1(fieldBytes);
assert.equal(field.width, field.height); assert.equal(field.width, 512);
const heights = Array.from({ length: field.width * field.height }, (_, index) => {
  const x = index % field.width, y = Math.floor(index / field.width);
  return field.rgba[((field.height - 1 - y) * field.width + x) * 4] / 255;
});
const result = {
  schema: "graphysx.impreza-source/v1", generator: "scripts/vendor-impreza-worlds.mjs", originals, models,
  coordinateBoundary: "Native LH metres to Web RH metres: [x,y,-z]. Model payloads preserve native origins; terrain rows reverse along Z. No scene-scale normalization.",
  vehicle: { source: "AtmelCubx/AtmelCubx/Vehicule.cpp", mass: 1500, wheelMass: 25, enginePower: 3000,
    tireSizeArguments: [.5, .372], tireArgumentMeaning: "SDK declaration unavailable; original argument order retained without asserting width/radius labels",
    suspensionSource: { height: .5, length: 1, shock: 40, spring: 300 }, centreOfMassCall: [0, -1, 10],
    wheels: [
      { id: "fl", model: "leftWheel", sourcePosition: [-.8, -.5, 1.25], steering: true, driven: false },
      { id: "fr", model: "rightWheel", sourcePosition: [.8, -.5, 1.25], steering: true, driven: false },
      { id: "rl", model: "leftWheel", sourcePosition: [-.8, -.5, -1.425], steering: false, driven: true },
      { id: "rr", model: "rightWheel", sourcePosition: [.8, -.5, -1.425], steering: false, driven: true },
    ], steeringDegreesPerSourceFrame: 10, maximumSteerDegrees: 45, rearHandbrakeForce: 2000, setPositionYOffset: .2,
    materialAdapter: "Use intended body/glass/undercarriage bindings; the native LoadTextures call misorders its string arguments. BMP maps read top row first, with original TVM UVs unchanged." },
  worlds: {
    atmel: { source: atmelPath, terrain: { source: flatPath, nativeSize: [flat.width, flat.height], heights: [0, 0, 0, 0], nativeAllPixelsBlack: true,
      size: 512, heightScale: 255, sourceOrigin: [-256, -400, -256], note: "Exact constant field compressed to2x2; extent interpreted from C++ fWidth*256, not image pixel count." },
    player: { id: 666, sourcePosition: [0, -300, 0] }, opponents: [0, 1, 2].map(id => ({ id, sourcePosition: [0, -300, id * 10] })),
    limitations: ["Opponent0 overlaps the player in source; any separation must be labelled as an adapter", "CarsManager is used before initialization; native startup/network is not certified"] },
    racinx: { source: racinxPath, terrain: { source: fieldPath, nativeSize: [field.width, field.height], heights, size: 512, heightScale: 255, sourceOrigin: [-256, -400, -256],
      note: "Full512x512 DXT1 red-channel heights retained; row reversal is the coordinate boundary. Runtime mesh/collider sampling is an explicit resolution adapter." },
    player: { id: 666, sourcePosition: [50, -350, 0] }, opponents: [], sky: "winter", ringScale: .25,
    rings: Array.from({ length: 100 }, (_, id) => ({ id, sourcePosition: [id * 10, -397, id * 10] })),
    experimentalWater: { source: "Yanik C++ BCKUP/RacinX/Atmosphere.cpp", height: 85, size: 4096, bumpSpeed: [.5, .5], reflectionBackground: [0, 0, .1906],
      note: "Shared water class places its plane485units above the terrain; preserve this source value and disclose any visibility/height adapter." },
    limitations: ["Opponents are commented out in this branch", "Most authored rings lie beyond the terrain; no completed race/progression binding is established", "Native water/render-surface and closed-engine tire fidelity are not certified"] },
  },
  adapters: ["PBR/material response, web lighting and camera are current adapters", "No native network client or historic executable is run", "The modern oval/hillclimb and orphan cars are separate from these source worlds"],
};
await output(`${base}/manifest.json`, result);
console.log(JSON.stringify({ models: Object.fromEntries(Object.entries(models).map(([id, model]) => [id, { vertices: model.vertexCount, triangles: model.triangleCount, sourceSha256: model.sourceSha256 }])), nativeFlatSize: [flat.width, flat.height], racinxHeightSize: field.width, ringCount: result.worlds.racinx.rings.length, sourceFilesReadOnly: originals.length, check }));
