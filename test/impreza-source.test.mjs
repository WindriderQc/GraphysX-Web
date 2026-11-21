import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { decodeTvmGeometry, decodeImprezaTvm, decodeImprezaBmp, decodeImprezaDxt1, webTvmMesh, sourceSha256 } from "../scripts/impreza-source.mjs";
import { buildAssetCatalog } from "../scripts/build-asset-catalog.mjs";
import { productAssetManifest } from "../scripts/product-assets.mjs";

function meshFixture(materialTag = "MGR3", materialSize = 136) {
  const chunk = (tag, body) => { const header = Buffer.alloc(8); header.write(tag); header.writeUInt32LE(body.length, 4); return Buffer.concat([header, body]); };
  const header = Buffer.alloc(16); header.write("!Dd"); header.writeUInt32LE(16, 12);
  const stats = Buffer.alloc(28); [1, 1, 3, 0, 0, 0, 32].forEach((value, index) => stats.writeUInt32LE(value, index * 4));
  const vertices = Buffer.alloc(96);
  [[0, 0, 0], [1, 0, 0], [0, 1, 0]].forEach((position, index) => {
    position.forEach((value, axis) => vertices.writeFloatLE(value, index * 32 + axis * 4));
    vertices.writeFloatLE(1, index * 32 + 20); vertices.writeFloatLE(.25, index * 32 + 24); vertices.writeFloatLE(.75, index * 32 + 28);
  });
  const indices = Buffer.alloc(6); indices.writeUInt16LE(1, 2); indices.writeUInt16LE(2, 4);
  const groups = Buffer.alloc(16); groups.writeUInt32LE(3); groups.writeUInt32LE(1, 8);
  return Buffer.concat([header, chunk("MSTA", stats), chunk("MVER", vertices), chunk("MI16", indices), chunk("MATT", Buffer.alloc(4)), chunk("MGRO", groups), chunk(materialTag, Buffer.alloc(materialSize)), chunk("MEND", Buffer.alloc(0)), Buffer.from("preserved-trailer")]);
}

test("earlier MGRP geometry uses counted 416-byte materials without widening the vehicle format contract", () => {
  const bytes = meshFixture("MGRP", 416), decoded = decodeTvmGeometry(bytes, "earlier-menu.tvm");
  assert.equal(decoded.materialRecordVersion, "MGRP"); assert.equal(decoded.materialRecordSha256, sourceSha256(Buffer.alloc(416)));
  assert.deepEqual(decoded.positions, decodeImprezaTvm(meshFixture(), "vehicle.tvm").positions);
  assert.throws(() => decodeImprezaTvm(bytes, "not-a-vehicle.tvm"), /vehicle material/);
  for (const size of [0, 136, 415, 417, 832]) assert.throws(() => decodeTvmGeometry(meshFixture("MGRP", size), "bad-count.tvm"));
});

test("counted TVM decode keeps exact native vertices, normals, UVs, material faces, pivot coordinates and trailer identity", () => {
  const bytes = meshFixture(), model = decodeImprezaTvm(bytes, "fixture.tvm");
  assert.equal(model.sha256, sourceSha256(bytes)); assert.equal(model.vertexCount, 3); assert.equal(model.triangleCount, 1);
  assert.deepEqual(model.positions, [0, 0, 0, 1, 0, 0, 0, 1, 0]); assert.deepEqual(model.uvs, [.25, .75, .25, .75, .25, .75]);
  assert.deepEqual(model.normals, [0, 0, 1, 0, 0, 1, 0, 0, 1]); assert.deepEqual(model.faceMaterials, [0]);
  assert.deepEqual(model.groups, [{ materialIndex: 0, firstVertex: 0, vertexCount: 3, firstFace: 0, triangleCount: 1 }]);
  assert.equal(model.trailerSha256, sourceSha256(Buffer.from("preserved-trailer")));
  const web = webTvmMesh(model);
  assert.deepEqual(web.indices, [0, 2, 1], "reflection changes winding so exported normals remain outward");
  assert.deepEqual(web.uvs, model.uvs, "image orientation belongs to the material, not rewritten UVs");
  assert.equal(web.rewoundTriangles, 1);
});

test("TVM rejects truncated/count-mismatched data, corrupt indices/material ranges and nonfinite vertex data", () => {
  const at = (bytes, tag) => bytes.indexOf(Buffer.from(tag)) + 8;
  for (const mutate of [
    bytes => bytes.writeUInt32LE(0xffffffff, at(bytes, "MVER") - 4),
    bytes => bytes.writeUInt32LE(4, at(bytes, "MSTA") + 8),
    bytes => bytes.writeFloatLE(NaN, at(bytes, "MVER")),
    bytes => bytes.writeUInt16LE(3, at(bytes, "MI16")),
    bytes => bytes.writeUInt32LE(1, at(bytes, "MATT")),
    bytes => bytes.writeUInt32LE(2, at(bytes, "MGRO") + 12),
    bytes => bytes.writeUInt32LE(1, at(bytes, "MGRO") + 4),
  ]) { const bytes = meshFixture(); mutate(bytes); assert.throws(() => decodeImprezaTvm(bytes, "bad.tvm")); }
  const bytes = meshFixture(); assert.throws(() => decodeImprezaTvm(bytes.subarray(0, bytes.indexOf(Buffer.from("MEND"))), "no-end.tvm"), /Missing TVM end/);
});

function bmpFixture() {
  const bytes = Buffer.alloc(70); bytes.write("BM"); bytes.writeUInt32LE(54, 2); bytes.writeUInt32LE(54, 10); bytes.writeUInt32LE(40, 14); bytes.writeInt32LE(2, 18); bytes.writeInt32LE(2, 22); bytes.writeUInt16LE(1, 26); bytes.writeUInt16LE(24, 28);
  bytes.set([0, 0, 255, 0, 255, 0], 54); bytes.set([255, 0, 0, 255, 255, 255], 62);
  return bytes;
}

test("BMP reads actual pixel bounds despite the archive's understated file-size field and keeps row/channel orientation", () => {
  const bytes = bmpFixture(), image = decodeImprezaBmp(bytes);
  assert.equal(image.width, 2); assert.equal(image.height, 2); assert.equal(image.declaredFileSize, 54); assert.equal(image.actualFileSize, 70);
  assert.deepEqual([...image.rgba], [0, 0, 255, 255, 255, 255, 255, 255, 255, 0, 0, 255, 0, 255, 0, 255]);
  assert.throws(() => decodeImprezaBmp(bytes.subarray(0, -1)), /Truncated BMP pixels/);
});

test("DXT1 distinguishes both interpolation modes and transparent code while keeping block pixel order", () => {
  const bytes = Buffer.alloc(136); bytes.write("DDS "); bytes.writeUInt32LE(124, 4); bytes.writeUInt32LE(4, 12); bytes.writeUInt32LE(4, 16); bytes.write("DXT1", 84);
  bytes.writeUInt16LE(0xffff, 128); bytes.writeUInt16LE(0, 130); bytes.writeUInt32LE(0b11100100, 132);
  assert.deepEqual([...decodeImprezaDxt1(bytes).rgba.slice(0, 16)], [255, 255, 255, 255, 0, 0, 0, 255, 170, 170, 170, 255, 85, 85, 85, 255]);
  bytes.writeUInt16LE(0, 128); bytes.writeUInt16LE(0xffff, 130);
  assert.deepEqual([...decodeImprezaDxt1(bytes).rgba.slice(0, 16)], [0, 0, 0, 255, 255, 255, 255, 255, 128, 128, 128, 255, 0, 0, 0, 0]);
  assert.throws(() => decodeImprezaDxt1(bytes.subarray(0, -1)), /Truncated DXT1 blocks/);
});

test("native model origins, source worlds and textures are discoverable and ship without registering source-record blobs as models", async () => {
  const manifest = JSON.parse(readFileSync(new URL("../public/assets/ports/impreza/manifest.json", import.meta.url)));
  const expected = { chassis: [1883, 2436, 3], leftWheel: [674, 690, 1], rightWheel: [674, 690, 1], ring: [325, 576, 1] };
  const catalog = await buildAssetCatalog(), release = await productAssetManifest();
  assert.equal(catalog.some(entry => entry.id === "archive-cubz-menu"), false, "TVA source-record JSON cannot become a broken palette model");
  assert.ok(release.files.includes("/assets/ports/archive-cubz-menu.json"), "source records still ship through their actual owner");
  assert.ok(release.files.includes("/assets/ports/impreza/manifest.json"));
  for (const [key, record] of Object.entries(manifest.models)) {
    assert.deepEqual([record.vertexCount, record.triangleCount, record.materialCount], expected[key]);
    assert.equal(catalog.filter(entry => entry.id === record.id).length, 1);
    const payload = JSON.parse(readFileSync(new URL("../public" + record.url, import.meta.url)));
    assert.equal(payload.bounds, undefined, "native origins must not enter the generic model-fitting path");
    assert.equal(payload.origin, "native"); assert.equal(payload.provenance.sourceSha256, record.sourceSha256);
    const mesh = payload.meshes[0];
    assert.equal(mesh.positions.length, record.vertexCount * 3); assert.equal(mesh.normals.length, mesh.positions.length); assert.equal(mesh.uvs.length, record.vertexCount * 2);
    assert.equal(mesh.indices.length, record.triangleCount * 3); assert.equal(mesh.materials.length, record.materialCount);
    assert.ok(release.files.includes(record.url));
    for (const material of mesh.materials) if (material.textureUrl) assert.ok(release.files.includes(material.textureUrl));
  }
  assert.deepEqual(manifest.worlds.atmel.terrain.nativeSize, [1024, 1024]);
  assert.deepEqual(manifest.worlds.atmel.terrain.heights, [0, 0, 0, 0]);
  assert.equal(manifest.worlds.atmel.opponents.length, 3);
  assert.equal(manifest.worlds.racinx.terrain.heights.length, 512 * 512);
  assert.equal(manifest.worlds.racinx.terrain.heights.every(value => value >= 0 && value <= 25 / 255), true);
  assert.equal(manifest.worlds.racinx.rings.length, 100);
  assert.deepEqual(manifest.worlds.racinx.rings.at(-1).sourcePosition, [990, -397, 990]);
  assert.equal(manifest.worlds.racinx.experimentalWater.height, 85, "the shared water class's surprising source value is preserved");
});
