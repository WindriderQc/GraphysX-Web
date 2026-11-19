import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sourceSha256, webTvmMesh } from "./impreza-source.mjs";
import { decodeFlightxTvm } from "./flightx-source.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const archive = path.resolve(root, process.argv.find(value => value.startsWith("--archive="))?.slice(10) || "../GraphysX");
const check = process.argv.includes("--check"), originals = [];
async function source(relative, pin) {
  const bytes = await readFile(path.join(archive, relative)), sha256 = sourceSha256(bytes);
  if (pin) assert.equal(sha256, pin, "Source pin changed: " + relative);
  originals.push({ source: relative, sha256, bytes: bytes.length }); return bytes;
}
async function output(file, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value) + "\n"), target = path.join(root, file);
  if (check) {
    const actual = await readFile(target);
    assert.ok(Buffer.isBuffer(value) ? bytes.equals(actual) : bytes.toString() === actual.toString().replace(/\r\n/g, "\n"), "Generated FlightX file differs: " + file);
  } else { await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, bytes); }
}
const media = "Yanik C++ BCKUP/Media/Models/";
const models = {}, textures = new Set();
for (const [key, filename, sha256] of [
  ["airplane", "Airplane/Airplane.tvm", "22ad7811b6d39b8bd503c159c424877db8940965e64545aeb61f2bbc23638738"],
  ["pipe", "pipe1.tvm", "36c0b46c8daa424a252b7de0d46a74e65b8807122a7dcb21f44b8ec25de7284a"],
]) {
  const relative = media + filename, bytes = await source(relative, sha256), decoded = decodeFlightxTvm(bytes, relative), mesh = webTvmMesh(decoded);
  const materials = decoded.surfaces.map((surface, i) => {
    if (surface.texture) textures.add(surface.texture);
    return { name: "TVM " + (i + 1) + (surface.texture ? " · " + surface.texture : surface.color[3] < 1 ? " · canopy" : " · untextured"),
      color: surface.color, specular: surface.specular, emissive: surface.emissive, specularPower: surface.specularPower,
      ...(surface.texture ? { textureName: surface.texture, textureUrl: "/assets/textures/flightx/" + surface.texture, textureFlipY: false } : {}) };
  });
  const id = "archive-flightx-" + key, url = "/assets/ports/" + id + ".json";
  await output("public" + url, {
    source: filename, catalog: { label: key === "airplane" ? "FlightX · avion TVM original" : "FlightX · pipe TVM original", category: key === "airplane" ? "vehicle" : "archive-prop", role: "FlightX native-origin " + key },
    origin: "native", sourceBounds: decoded.bounds,
    provenance: { archiveSource: relative, sourceSha256: decoded.sha256, sourceBytes: bytes.length, decodedBy: "scripts/flightx-source.mjs + scripts/impreza-source.mjs",
      geometryFidelity: "Source positions/normals/UVs, all counted faces and all MGR4 groups. Explicit Z reflection, winding follows exported normals; no recentering or fitting bounds.",
      materialFidelity: "Counted one-based TVM texture references and original BMP bytes; MGR4 color/specular/alpha retained. PBR translation is adapted; C++ StdMat override and historical lighting are not certified.",
      rewoundTriangles: mesh.rewoundTriangles },
    meshCount: 1, vertexCount: decoded.vertexCount, triangleCount: decoded.triangleCount, materialGroupCount: materials.length,
    meshes: [{ name: "FlightX " + key, positions: mesh.positions, normals: mesh.normals, uvs: mesh.uvs, indices: mesh.indices, groups: mesh.groups, materials }],
  });
  models[key] = { id, url, source: relative, sha256, vertices: decoded.vertexCount, triangles: decoded.triangleCount, groups: materials.length,
    sourceBounds: decoded.bounds, textures: decoded.textures, surfaces: decoded.surfaces.map(({ firstVertex, vertexCount, firstFace, triangleCount, textureIndex, texture }) => ({ firstVertex, vertexCount, firstFace, triangleCount, textureIndex, texture })) };
}
for (const name of [...textures].sort()) await output("public/assets/textures/flightx/" + name, await source(media + "Airplane/" + name));
for (const file of ["FlightXScene.cpp", "FlightXScene.h", "3DObject.cpp", "SlideObject.cpp", "Simulation.cpp", "TV3DMoteur.cpp"]) await source("AtmelCubx/AtmelCubx/" + file);
const sourceVariants = [
  { id: "atmel", source: "AtmelCubx/AtmelCubx/FlightXScene.cpp", sha256: "8989a978e2f91fe71e0c2469d4ba11c798bb254bbaf109a0f6a7579f7cdfb8a5", planeScale: 1, pipeScale: 5 },
  { id: "racinx", source: "Yanik C++ BCKUP/RacinX/FlightXScene.cpp", sha256: "bf88670e0da456f01299895643d2068d0a79f2f2e39ec5b87285e7bfb763eebf", planeScale: 1, pipeScale: 5 },
  { id: "ballz2011", source: "Yanik C++ BCKUP/BallZ 2011/FlightXScene.cpp", sha256: "799885bb519dd59babfcc5b93b6f6bc4ad8423334abfd2820a64036a9effa67c", planeScale: .1, pipeScale: 5 },
];
for (const [folder, pin] of [
  ["RacinX", sourceVariants[1].sha256], ["AtmelCubxCar", sourceVariants[0].sha256], ["BallZ 2011", sourceVariants[2].sha256],
  ["AtmelCubx", sourceVariants[0].sha256], ["AtmelCubx 1", sourceVariants[0].sha256],
]) {
  await source("Yanik C++ BCKUP/" + folder + "/FlightXScene.cpp", pin);
  await source("Yanik C++ BCKUP/" + folder + "/FlightXScene.h", "8b10dfb398917251c15ab6b938388c595f3cd4f558c68f61d5c6b8174b136754");
}
await source("Yanik C++ BCKUP/BallZ 2011/Release/Media/Airplane/Airplane.tvm", models.airplane.sha256);
await source("Yanik C++ BCKUP/BallZ 2011/Release/Media/pipe1.tvm", models.pipe.sha256);
const meshSdk = await source("Archive/GNet/Deps/Include/TV3D65/CTVMesh.h");
assert.ok(meshSdk.toString().includes("void MoveRelative(float fForward, float fUp, float fRight);"), "FlightX motion must follow the SDK signature, not inferred argument coordinates");
const object2011 = await source("Yanik C++ BCKUP/BallZ 2011/3DObject.cpp");
assert.ok(object2011.toString().includes("Mesh->SetScale(Scale.x, Scale.y, Scale.z)"), "The 2011 vector must be a scale, not an inferred rotation or position");
await output("src/content/flightx-source.json", {
  schema: "graphysx.flightx-source/v1", generator: "scripts/vendor-flightx.mjs", originals, models, sourceVariants,
  sourceComposition: { plane: { position: [0, 0, 0], scale: 1 }, pipe: { position: [0, -500, 0], scale: 5 } },
  sourceControls: { translationAxis: "native forward (+Z), reflected to Web -Z", signature: "MoveRelative(fForward, fUp, fRight)", sdkSource: "Archive/GNet/Deps/Include/TV3D65/CTVMesh.h",
    axisEvidence: "SDK argument names plus source TVM nose/tail orientation; native engine execution remains uncertified",
    rollAxis: "local Z", pitchAxis: "local X", rollFactor: .9, pitchUpFactor: .4, pitchDownFactor: .5, spaceDownAddition: .1, thrustPerElapsedUnit: 1,
    resetCall: "SetMatrix(identity) and TVQuaternionIdentity; Web attitude reset and return-to-start are separate controls" },
  presentation: { worldScale: .01, liftY: 16, coordinateBoundary: "[x,y,-z]; native origins retained", pilot: "v2 kinematic control uses the reflected native forward (-Z), moderated Web speed/rates and separate attitude/start reset; no exact native timestep or aerodynamics claim",
    modelYawDegrees: 0, modelYawEvidence: "Native orientation retained. SDK MoveRelative receives forward/up/right, not X/Y/Z; vertical tail occupies native negative Z.",
    markers: "Eight modern visit markers, not source gates or racing rules", absent: ["authored racing layout", "native collision response", "exact TV3D material/light parity", "certified SDK timestep/handling", "four historical flight modes"] },
});
console.log(JSON.stringify({ models: Object.fromEntries(Object.entries(models).map(([key, model]) => [key, { vertices: model.vertices, triangles: model.triangles, groups: model.groups }])), textures: textures.size, sourceFilesReadOnly: originals.length, check }));
