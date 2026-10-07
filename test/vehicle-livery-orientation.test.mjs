import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The Impreza livery is one 512x512 atlas. These are regions of that image, in pixels from
// the top-left corner, read off the recovered ChassisSTi map: [x0, y0, x1, y1].
const LIVERY_SIZE = 512;
const NOSE_REGIONS = {
  grilleAndEmblem: [319, 174, 447, 205],
  radiator: [296, 211, 466, 251],
  leftStiMark: [260, 225, 295, 249],
  rightStiMark: [478, 225, 512, 249],
};
const TAIL_REGIONS = {
  rearLamp: [184, 106, 342, 159],
  rearNumberPlate: [337, 357, 427, 392],
};

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const payload = JSON.parse(readFileSync(join(root, "public", "assets", "vehicles", "archive-impreza.json"), "utf8"));
const chassis = payload.meshes.find((mesh) => mesh.name === "chasis");
const liveryIndex = chassis.materials.findIndex((material) => /ChassisSTi/.test(material.textureUrl ?? ""));
const livery = chassis.materials[liveryIndex];
const liveryGroup = chassis.groups.find((group) => group.materialIndex === liveryIndex);

/** Mean model-space z of the livery faces whose UV centroid lands in an image region. */
function meanZOfFacesReading([x0, y0, x1, y1], flipY) {
  let sum = 0;
  let count = 0;
  for (let offset = liveryGroup.start; offset < liveryGroup.start + liveryGroup.count; offset += 3) {
    const corners = [0, 1, 2].map((corner) => chassis.indices[offset + corner]);
    const u = corners.reduce((total, vertex) => total + chassis.uvs[vertex * 2], 0) / 3;
    const v = corners.reduce((total, vertex) => total + chassis.uvs[vertex * 2 + 1], 0) / 3;
    const fraction = (value) => value - Math.floor(value);
    const column = fraction(u) * LIVERY_SIZE;
    // flipY true (three's default) puts v=0 on the bottom image row; false puts it on the top.
    const row = (flipY ? 1 - fraction(v) : fraction(v)) * LIVERY_SIZE;
    if (column < x0 || column >= x1 || row < y0 || row >= y1) continue;
    sum += corners.reduce((total, vertex) => total + chassis.positions[vertex * 3 + 2], 0) / 3;
    count += 1;
  }
  return { count, z: count ? sum / count : Number.NaN };
}

const halfLength = payload.bounds.size[2] / 2;

test("the Impreza livery declares the orientation that puts its nose and tail markings on the right ends", () => {
  assert.equal(livery.textureFlipY, false, "the livery must be read top row first");
  const flipY = livery.textureFlipY !== false;
  const nose = Object.entries(NOSE_REGIONS).map(([name, region]) => [name, meanZOfFacesReading(region, flipY)]);
  const tail = Object.entries(TAIL_REGIONS).map(([name, region]) => [name, meanZOfFacesReading(region, flipY)]);
  for (const [name, { count }] of [...nose, ...tail]) assert.ok(count > 0, `${name} is read by at least one face`);
  const noseSide = Math.sign(nose[0][1].z);
  for (const [name, { z }] of nose) {
    assert.equal(Math.sign(z), noseSide, `${name} is on the same end as the grille`);
    assert.ok(Math.abs(z) > halfLength * 0.8, `${name} is at the end of the car, not along it (z ${z.toFixed(2)})`);
  }
  for (const [name, { z }] of tail) {
    assert.equal(Math.sign(z), -noseSide, `${name} is on the end opposite the grille`);
    assert.ok(Math.abs(z) > halfLength * 0.8, `${name} is at the end of the car, not along it (z ${z.toFixed(2)})`);
  }
});

test("three's default orientation scatters the same markings, which is why the flag exists", () => {
  const grille = meanZOfFacesReading(NOSE_REGIONS.grilleAndEmblem, true);
  const radiator = meanZOfFacesReading(NOSE_REGIONS.radiator, true);
  const rearLamp = meanZOfFacesReading(TAIL_REGIONS.rearLamp, true);
  assert.notEqual(Math.sign(grille.z), Math.sign(radiator.z), "grille and radiator land on opposite ends");
  assert.ok(Math.abs(rearLamp.z) < halfLength * 0.5, "the rear lamp lands along the car instead of on its tail");
});

test("the other Impreza maps keep the default orientation until their content settles it", () => {
  const others = payload.meshes.flatMap((mesh) => mesh.materials ?? []).filter((material) => material !== livery);
  assert.ok(others.length >= 6);
  for (const material of others) assert.equal(material.textureFlipY, undefined, material.name);
});
