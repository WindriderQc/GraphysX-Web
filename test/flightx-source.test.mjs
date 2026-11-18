import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { decodeFlightxTvm } from "../scripts/flightx-source.mjs";
import { sourceSha256 } from "../scripts/impreza-source.mjs";
import { buildAssetCatalog } from "../scripts/build-asset-catalog.mjs";
import { productAssetManifest } from "../scripts/product-assets.mjs";
import { validateStoredSceneDefinition } from "../server/scene-commands.mjs";

function fixture(textured = true) {
  const chunk = (tag, body) => { const header = Buffer.alloc(8); header.write(tag); header.writeUInt32LE(body.length, 4); return Buffer.concat([header, body]); };
  const header = Buffer.alloc(16); header.write("!Dd"); header.writeUInt32LE(16, 12);
  const stats = Buffer.alloc(28); [1, 1, 3, 0, 0, 0, 32].forEach((value, i) => stats.writeUInt32LE(value, i * 4));
  const vertices = Buffer.alloc(96);
  [[2, 3, 4], [3, 3, 4], [2, 4, 4]].forEach((point, i) => { point.forEach((n, axis) => vertices.writeFloatLE(n, i * 32 + axis * 4)); vertices.writeFloatLE(1, i * 32 + 20); });
  const indices = Buffer.alloc(6); indices.writeUInt16LE(1, 2); indices.writeUInt16LE(2, 4);
  const groups = Buffer.alloc(16); groups.writeUInt32LE(3); groups.writeUInt32LE(1, 8);
  const material = Buffer.alloc(172); material.writeUInt32LE(Number(textured), 4); material.writeUInt32LE(Number(textured), 68);
  [.2, .4, .6, .25].forEach((n, i) => material.writeFloatLE(n, 84 + i * 4));
  [.1, .2, .3].forEach((n, i) => material.writeFloatLE(n, 116 + i * 4));
  [.3, .2, .1].forEach((n, i) => material.writeFloatLE(n, 132 + i * 4)); material.writeFloatLE(40, 148);
  const table = Buffer.alloc(textured ? 29 : 12); table.writeUInt32LE(12, 8);
  if (textured) { table.writeUInt32LE(1); table.writeUInt32LE(20, 4); table.writeUInt32LE(8, 16); table.write("WING.BMP", 20); }
  return Buffer.concat([header, chunk("MSTA", stats), chunk("MVER", vertices), chunk("MI16", indices), chunk("MATT", Buffer.alloc(4)), chunk("MGRO", groups), chunk("MGR4", material), chunk("MEND", Buffer.alloc(0)), table]);
}

test("FlightX reads counted one-based texture references and separate native surface channels, including empty pipe tables", () => {
  const decoded = decodeFlightxTvm(fixture(), "fixture.tvm");
  assert.deepEqual(decoded.textures, ["WING.BMP"]);
  assert.deepEqual(decoded.positions.slice(0, 3), [2, 3, 4], "Native export origin is not recentered");
  const surface = decoded.surfaces[0];
  assert.equal(surface.texture, "WING.BMP"); assert.equal(surface.textureIndex, 1);
  assert.equal(surface.color[3], .25); assert.equal(surface.specularPower, 40);
  assert.ok(Math.abs(surface.color[1] - .4) < 1e-7);
  assert.ok(Math.abs(surface.specular[2] - .3) < 1e-7); assert.ok(Math.abs(surface.emissive[0] - .3) < 1e-7);
  const empty = decodeFlightxTvm(fixture(false), "pipe.tvm");
  assert.deepEqual(empty.textures, []); assert.equal(empty.surfaces[0].texture, null);
});

test("FlightX rejects corrupt texture tables, out-of-range bindings, invalid flags/names and nonfinite material values", () => {
  const at = (bytes, tag) => bytes.indexOf(Buffer.from(tag)) + 8;
  for (const mutate of [
    bytes => bytes.writeUInt32LE(2, at(bytes, "MGR4") + 4),
    bytes => bytes.writeUInt32LE(0, at(bytes, "MGR4") + 68),
    bytes => bytes.writeFloatLE(NaN, at(bytes, "MGR4") + 84),
    bytes => bytes.writeUInt32LE(100, at(bytes, "MEND") + 4),
    bytes => bytes.writeUInt32LE(40, at(bytes, "MEND") + 16),
    bytes => bytes.write("../A.BMP", at(bytes, "MEND") + 20),
    bytes => bytes.writeUInt8(42, bytes.length - 1),
  ]) { const bytes = fixture(); mutate(bytes); assert.throws(() => decodeFlightxTvm(bytes, "corrupt.tvm")); }
});

test("full native FlightX meshes, all 51 surface groups and six original BMPs remain discoverable, byte-identified and published", async () => {
  const source = JSON.parse(readFileSync(new URL("../src/content/flightx-source.json", import.meta.url)));
  const catalog = await buildAssetCatalog(), release = await productAssetManifest();
  assert.equal(source.originals.length, 28);
  assert.equal(source.sourceControls.signature, "MoveRelative(fForward, fUp, fRight)");
  assert.equal(source.originals.filter(file => /FlightXScene\.(cpp|h)$/.test(file.source)).length, 12);
  assert.deepEqual(source.sourceVariants.map(variant => [variant.id, variant.planeScale, variant.pipeScale]), [["atmel", 1, 5], ["racinx", 1, 5], ["ballz2011", .1, 5]]);
  for (const [key, expected] of [["airplane", [10261, 11168, 48]], ["pipe", [1432, 2160, 3]]]) {
    const model = source.models[key], payload = JSON.parse(readFileSync(new URL("../public" + model.url, import.meta.url)));
    assert.deepEqual([model.vertices, model.triangles, model.groups], expected);
    assert.equal(payload.bounds, undefined); assert.equal(payload.origin, "native"); assert.equal(payload.provenance.sourceSha256, model.sha256);
    const mesh = payload.meshes[0];
    assert.equal(mesh.positions.length, model.vertices * 3); assert.equal(mesh.normals.length, mesh.positions.length);
    assert.equal(mesh.uvs.length, model.vertices * 2); assert.equal(mesh.indices.length, model.triangles * 3);
    assert.equal(mesh.groups.length, model.groups); assert.equal(mesh.materials.length, model.groups);
    assert.equal(mesh.groups.reduce((n, group) => n + group.count, 0), mesh.indices.length);
    assert.equal(catalog.filter(entry => entry.id === model.id).length, 1); assert.ok(release.files.includes(model.url));
    assert.doesNotThrow(() => validateStoredSceneDefinition({ schema: "graphysx.agent-world/v2", id: "flightx-asset", label: "Curated FlightX asset",
      entities: [{ id: "original", type: "model", asset: { id: model.id } }] }), "Published curated IDs must work without a URL workaround");
    model.surfaces.forEach((surface, i) => {
      assert.deepEqual(mesh.groups[i], { start: surface.firstFace * 3, count: surface.triangleCount * 3, materialIndex: i });
      assert.equal(mesh.materials[i].textureName ?? null, surface.texture);
    });
  }
  const airplane = JSON.parse(readFileSync(new URL("../public" + source.models.airplane.url, import.meta.url))).meshes[0];
  assert.equal(airplane.materials[8].color[3], .25); assert.equal(airplane.materials[0].textureName, "VTAIL.BMP");
  assert.equal(airplane.materials[17].textureName, "FUS.BMP"); assert.equal(airplane.materials[39].textureName, "WING.BMP");
  const textures = source.originals.filter(file => file.source.endsWith(".BMP"));
  assert.equal(textures.length, 6);
  for (const texture of textures) {
    const url = "/assets/textures/flightx/" + texture.source.split("/").at(-1);
    assert.equal(sourceSha256(readFileSync(new URL("../public" + url, import.meta.url))), texture.sha256);
    assert.ok(release.files.includes(url));
  }
});
