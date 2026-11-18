import assert from "node:assert/strict";
import { decodeImprezaTvm } from "./impreza-source.mjs";

/** Counted MGR4 surface records and the post-MEND texture string table used by FlightX. */
export function decodeFlightxTvm(bytes, source) {
  const mesh = decodeImprezaTvm(bytes, source);
  assert.equal(mesh.materialRecordVersion, "MGR4");
  let at = 16, records, trailerStart;
  while (at + 8 <= bytes.length) {
    const tag = bytes.toString("latin1", at, at + 4), size = bytes.readUInt32LE(at + 4);
    if (tag === "MGR4") records = at + 8;
    at += 8 + size;
    if (tag === "MEND") { trailerStart = at; break; }
  }
  assert.ok(records && trailerStart);
  const trailer = bytes.subarray(trailerStart);
  assert.ok(trailer.length >= 12, "Missing texture table header");
  const count = trailer.readUInt32LE(0), stringsStart = trailer.readUInt32LE(4), entriesStart = trailer.readUInt32LE(8);
  if (count === 0) assert.ok(trailer.length === 12 && stringsStart === 0 && entriesStart === 12, "Invalid empty texture table");
  else assert.ok(count <= 256 && entriesStart === 12 && stringsStart === entriesStart + count * 8 && stringsStart <= trailer.length, "Invalid counted texture table");
  const textures = Array.from({ length: count }, (_, i) => {
    const offset = trailer.readUInt32LE(entriesStart + i * 8), length = trailer.readUInt32LE(entriesStart + i * 8 + 4);
    const begin = stringsStart + offset, end = begin + length;
    assert.ok(length > 0 && end < trailer.length && trailer[end] === 0, "Texture name outside string table");
    const name = trailer.toString("ascii", begin, end);
    assert.match(name, /^[A-Z0-9_]+\.BMP$/, "Unexpected FlightX texture path");
    return name;
  });
  const surfaces = mesh.groups.map((group, i) => {
    const begin = records + i * 172;
    const textureIndex = bytes.readUInt32LE(begin + 4), textured = bytes.readUInt32LE(begin + 68);
    assert.ok(textureIndex <= textures.length && textured === Number(textureIndex > 0), "Texture reference outside table or inconsistent enable flag");
    const color = Array.from({ length: 4 }, (_, channel) => bytes.readFloatLE(begin + 84 + channel * 4));
    const specular = Array.from({ length: 3 }, (_, channel) => bytes.readFloatLE(begin + 116 + channel * 4));
    const emissive = Array.from({ length: 3 }, (_, channel) => bytes.readFloatLE(begin + 132 + channel * 4));
    const specularPower = bytes.readFloatLE(begin + 148);
    assert.ok([...color, ...specular, ...emissive, specularPower].every(Number.isFinite), "Non-finite material");
    assert.ok(color.every(value => value >= 0 && value <= 1.001) && specularPower >= 0);
    return { ...group, textureIndex, texture: textureIndex ? textures[textureIndex - 1] : null, color, specular, emissive, specularPower };
  });
  return { ...mesh, textures, surfaces };
}
