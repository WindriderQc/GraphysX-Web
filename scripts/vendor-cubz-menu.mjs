import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodeCubzActor, sourceHash } from "./cubz-source.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const archive = path.resolve(root, process.argv.find((value) => value.startsWith("--archive="))?.slice(10) || "../GraphysX");
const sourceDirectory = "Yanik C++ BCKUP/Media/PartSys/Animations/";
const actors = Object.fromEntries([["rotation", "CubeRot.tva"], ["open", "CubeOpen.tva"], ["screensaver", "CubXScreensaver.tva"]].map(([id, filename]) => {
  const source = sourceDirectory + filename;
  return [id, decodeCubzActor(readFileSync(path.join(archive, source)), source)];
}));
// Pin the two previously audited files, rather than silently choosing a duplicate family.
assert.equal(actors.rotation.sha256, "8adba22a2103a6edac9b173474b1a4599db04b21c7df4418412ea35903ae7b4b");
assert.equal(actors.open.sha256, "ccb1ed3bb77919509e2b501663fb34bfd7e64c34e95f01e003e6d553160ca27b");
assert.equal(actors.screensaver.sha256, "2aecb7774e672b125cab7c0a175b1e3bc01d69fb4914cb4e2ee8f074e83de18f");
const source = "Yanik C++ BCKUP/CubZ (2).cpp";
const hostHash = sourceHash(readFileSync(path.join(archive, source)));
assert.equal(hostHash, "1337ae604176b7b31e664f74b9eb02f926dc1da9f018e9a6d6bc618288ca28f6");
const result = {
  schema: "graphysx.cubz-menu-source/v1", generator: "scripts/vendor-cubz-menu.mjs",
  host: { source, sha256: hostHash },
  coordinateBoundary: "Raw TV3D vertices, normals, matrices and quaternion keys; web conversion is explicit in the scene builder.",
  actors,
  missing: ["Media/CubXBtn/Btn1.tvm through Btn32.tvm", "Media/CubXBtn/BtnExit.tvm", "Historical internal action/category mapping"],
};
const serialized = JSON.stringify(result) + "\n";
const target = path.join(root, "public/assets/ports/archive-cubz-menu.json");
if (process.argv.includes("--check")) assert.ok(readFileSync(target, "utf8").replace(/\r\n/g, "\n") === serialized, "Committed CubZ data differs from pinned source; regenerate with vendor-cubz-menu.mjs");
else writeFileSync(target, serialized);
console.log(JSON.stringify(Object.fromEntries(Object.entries(actors).map(([id, actor]) => [id, {
  nodes: actor.nodes.length, meshes: actor.meshes.length,
  vertices: actor.meshes.reduce((sum, mesh) => sum + mesh.vertexCount, 0),
  triangles: actor.meshes.reduce((sum, mesh) => sum + mesh.triangleCount, 0), tracks: actor.tracks.length, sha256: actor.sha256,
}]))));
