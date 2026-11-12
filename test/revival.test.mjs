import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CONTENT_COLLECTIONS, sceneCollection, gameCollection } from "../src/content-collections.ts";
import { buildNativeIntro, buildArchiveCuisine, CUISINE_PROVENANCE, NATIVE_INTRO_PROVENANCE } from "../src/archive-revival-scenes.ts";

test("unknown prototypes cannot silently graduate into curated creations", () => {
  assert.equal(sceneCollection("glow-garden"), "creations");
  assert.equal(sceneCollection("archive-cuisine"), "archive");
  assert.equal(sceneCollection("physics-sketchbook"), "lab");
  assert.equal(sceneCollection("future-experiment"), "lab");
  assert.equal(gameCollection("ballsy-slime"), "creations");
  assert.equal(gameCollection("archive-level3-v2"), "archive");
  assert.equal(gameCollection("first-course"), "lab");
  assert.equal(new Set(CONTENT_COLLECTIONS.map((entry) => entry.id)).size, CONTENT_COLLECTIONS.length);
});

test("native C# intro uses source cylinder dimensions and both distinct placement/mass families", () => {
  const scene = buildNativeIntro();
  const cylinders = scene.entities.filter((entity) => entity.type === "cylinder");
  assert.equal(cylinders.length, 20);
  for (let index = 0; index < 10; index++) {
    const copper = cylinders.find((entity) => entity.id === `intro-cylinder-0-${index}`);
    const small = cylinders.find((entity) => entity.id === `intro-cylinder-1-${index}`);
    assert.deepEqual(copper.transform.position, [10, 0.5 + index, 10]);
    assert.deepEqual(small.transform.position, [5, 0.5 + index * 0.75, 7.5]);
    assert.equal(copper.geometry.radius, 0.5); assert.equal(copper.geometry.height, 0.25);
    assert.equal(small.geometry.radius, 0.2); assert.equal(small.geometry.height, 0.5);
    assert.equal(copper.physics.mass, 0.1); assert.equal(small.physics.mass, 0.05);
  }
  assert.ok(NATIVE_INTRO_PROVENANCE.absent.some((line) => line.includes("Coke.jpg")));
});

test("complete Cuisine conversion retains named meshes, material slots and valid normals/triangles", () => {
  const asset = JSON.parse(readFileSync(new URL("../public/assets/ports/archive-cuisine.json", import.meta.url)));
  assert.equal(asset.meshes.length, 76);
  assert.equal(asset.provenance.sha256, CUISINE_PROVENANCE.sourceSha256);
  assert.ok(asset.bounds.size[2] > 9 && asset.bounds.size[2] < 10, "centimetres were converted to metres");
  for (const mesh of asset.meshes) {
    assert.ok(mesh.name && mesh.positions.length);
    assert.equal(mesh.normals.length, mesh.positions.length);
    assert.ok(mesh.positions.every(Number.isFinite));
    assert.equal(mesh.indices.length % 3, 0);
    assert.ok(mesh.indices.every((index) => Number.isInteger(index) && index >= 0 && index < mesh.positions.length / 3));
    assert.ok(mesh.materials.length > 0);
  }
  assert.equal(buildArchiveCuisine().entities.find((entity) => entity.type === "model").asset.id, "archive-cuisine");
  assert.ok(CUISINE_PROVENANCE.absent.length > 0);
});
