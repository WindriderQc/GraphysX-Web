import { test } from "node:test";
import assert from "node:assert/strict";
import { importBrowserModule } from "./support/import-browser-module.mjs";
import fixture from "../src/diskx-fixture.json" with { type: "json" };

// The real browser modules, transpiled in place: the city's data half has no DOM or three.js.
const {
  buildDiskxTree,
  categoryForPath,
  categoryShares,
  DISKX_FREE_PATH_PREFIX,
  DISKX_REST_PATH,
  formatBytes,
  layoutDiskxCity,
  pathCrumbs,
  squarify,
  volumeForPath,
  volumeOccupancy,
} = await importBrowserModule(new URL("../src/diskx-data.ts", import.meta.url));
const { composeDiskxWorld, diskxPathOf, DISKX_DISTRICT_TAG, DISKX_FREE_TAG, DISKX_PATH_TAG_PREFIX } =
  await importBrowserModule(new URL("../src/diskx-scene.ts", import.meta.url));
const { parseBytes, parseDiskxVolumes, resolveDiskxVolumes } = await import("../scripts/diskx-server.mjs");

// AgentX Data reports only directories that directly hold files, with their own bytes. The
// city must still show a parent that holds nothing but folders, and must never show a total
// smaller than the sum of its parts — a treemap that lies about area is the bug this guards.
test("buildDiskxTree infers missing parents and rolls totals up", () => {
  const tree = buildDiskxTree(["/mnt/x"], [
    { path: "/mnt/x/Photos/2024", fileCount: 10, totalSize: 1000, largestFile: "/mnt/x/Photos/2024/a.jpg" },
    { path: "/mnt/x/Photos/2025/raw", fileCount: 3, totalSize: 5000, largestFile: "/mnt/x/Photos/2025/raw/b.cr2" },
    { path: "/mnt/x", fileCount: 2, totalSize: 40, largestFile: "/mnt/x/readme.txt" },
    { path: "/mnt/elsewhere/ignored", fileCount: 9, totalSize: 99999 },
  ]);
  const root = tree.roots[0];
  assert.equal(root.ownSize, 40);
  assert.equal(root.totalSize, 6040);
  assert.equal(root.totalFiles, 15);
  const photos = tree.byPath.get("/mnt/x/Photos");
  assert.ok(photos, "inferred parent exists");
  assert.equal(photos.reported, false);
  assert.equal(photos.totalSize, 6000);
  assert.equal(photos.category, "image", "parent takes the category of its largest child");
  assert.deepEqual(photos.children.map((child) => child.name), ["2025", "2024"], "children sorted by bytes");
  assert.equal(tree.byPath.has("/mnt/elsewhere/ignored"), false);
  assert.deepEqual(pathCrumbs(tree, tree.byPath.get("/mnt/x/Photos/2025/raw")).map((node) => node.name), ["x", "Photos", "2025", "raw"]);
});

test("categoryForPath reads extensions and content-addressed model blobs", () => {
  assert.equal(categoryForPath("/mnt/media/Movies/avatar.mkv"), "video");
  assert.equal(categoryForPath("/mnt/datalake/Photos/IMG_0001.CR2"), "image");
  assert.equal(categoryForPath("/mnt/datalake/LLMs/blobs/sha256-" + "a".repeat(64)), "model");
  assert.equal(categoryForPath("/mnt/datalake/ISO/Win11.iso"), "archive");
  assert.equal(categoryForPath("/mnt/datalake/VM/DevHQ/DevHQ.vdi"), "system");
  assert.equal(categoryForPath("/mnt/datalake/notes/plan.md"), "document");
  assert.equal(categoryForPath("/mnt/datalake/weird/noext"), "other");
  assert.equal(categoryForPath(null), "other");
});

test("formatBytes uses French short units", () => {
  assert.equal(formatBytes(0), "0 o");
  assert.equal(formatBytes(512), "512 o");
  assert.equal(formatBytes(1536), "1.5 Ko");
  assert.equal(formatBytes(2524931014064), "2.3 To");
  assert.equal(formatBytes(414614215947), "386 Go");
});

const area = (rect) => rect.width * rect.depth;
const overlaps = (a, b) => a.x < b.x + b.width - 1e-6 && b.x < a.x + a.width - 1e-6 && a.z < b.z + b.depth - 1e-6 && b.z < a.z + a.depth - 1e-6;

test("squarify keeps areas proportional, inside the bounds and disjoint", () => {
  const weights = [600, 300, 100, 50, 25, 25, 10, 5, 3, 2];
  const bounds = { x: -20, z: -20, width: 40, depth: 40 };
  const tiles = squarify(weights, (weight) => weight, bounds);
  assert.equal(tiles.length, weights.length);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  for (const tile of tiles) {
    assert.ok(Math.abs(area(tile.rect) / area(bounds) - tile.item / total) < 1e-9, `area of ${tile.item} is proportional`);
    assert.ok(tile.rect.x >= bounds.x - 1e-9 && tile.rect.z >= bounds.z - 1e-9);
    assert.ok(tile.rect.x + tile.rect.width <= bounds.x + bounds.width + 1e-9);
    assert.ok(tile.rect.z + tile.rect.depth <= bounds.z + bounds.depth + 1e-9);
  }
  for (let i = 0; i < tiles.length; i += 1) {
    for (let j = i + 1; j < tiles.length; j += 1) assert.equal(overlaps(tiles[i].rect, tiles[j].rect), false, `tiles ${i} and ${j} overlap`);
  }
  // The point of squarifying: rows lie along the shorter side, so the largest tile takes a
  // 21.4-wide vertical strip of the 40x40 square (aspect 1.87) rather than a full-width slice,
  // and the whole layout stays far from slice-and-dice. A sliced layout passed every
  // assertion above — this is the one that caught the first version drawing 30x0.05 pickets.
  const first = tiles[0].rect;
  assert.ok(Math.abs(first.width - 600 / 1120 * 40) < 1e-9 && Math.abs(first.depth - 40) < 1e-9, `first tile ${first.width}x${first.depth}`);
  const aspects = tiles.map((tile) => Math.max(tile.rect.width, tile.rect.depth) / Math.min(tile.rect.width, tile.rect.depth));
  assert.ok(Math.max(...aspects) < 3.2, `worst aspect ${Math.max(...aspects)}`);
  assert.ok(aspects.reduce((sum, value) => sum + value, 0) / aspects.length < 1.9, `mean aspect ${aspects.reduce((sum, value) => sum + value, 0) / aspects.length}`);
  assert.deepEqual(squarify([0, 0], (weight) => weight, bounds), []);
});

test("layoutDiskxCity folds the long tail, previews roofs and keeps blocks on the plaza", () => {
  const rows = [];
  for (let i = 0; i < 60; i += 1) {
    rows.push({ path: `/r/folder-${String(i).padStart(2, "0")}`, fileCount: 1, totalSize: 10 ** 9 / (i + 1), largestFile: `/r/folder-${i}/f.mp4` });
    rows.push({ path: `/r/folder-${String(i).padStart(2, "0")}/sub`, fileCount: 1, totalSize: 10 ** 8 / (i + 1), largestFile: `/r/folder-${i}/sub/g.jpg` });
  }
  rows.push({ path: "/r", fileCount: 7, totalSize: 10 ** 8, largestFile: "/r/own.pdf" });
  const tree = buildDiskxTree(["/r"], rows);
  const layout = layoutDiskxCity(tree.roots[0], { size: 40, maxDistricts: 48 });
  const districts = layout.blocks.filter((block) => block.level === 0);
  const rest = districts.find((block) => block.node.path === DISKX_REST_PATH);
  assert.equal(districts.length, 49, "48 districts plus the folded remainder");
  assert.ok(rest, "the remainder is one tile");
  assert.equal(rest.node.children.length, 12);
  assert.ok(layout.plaza && layout.plaza.files === 7, "own files become the plaza tile");
  assert.ok(layout.blocks.some((block) => block.level === 1), "large districts preview their children on the roof");
  for (const block of layout.blocks) {
    assert.ok(block.height > 0 && block.height <= 7);
    assert.ok(block.rect.x >= -20 && block.rect.x + block.rect.width <= 20 + 1e-9);
    assert.ok(block.rect.z >= -20 && block.rect.z + block.rect.depth <= 20 + 1e-9);
    if (block.level === 1) {
      const parent = districts.find((district) => district.node === block.parent);
      assert.ok(parent, "a roof building knows its district");
      assert.ok(block.rect.x >= parent.rect.x - 1e-9 && block.rect.x + block.rect.width <= parent.rect.x + parent.rect.width + 1e-9, "roof building stays on its district");
    }
  }
  // Taller for more bytes, within a level.
  assert.ok(districts[0].height >= districts[1].height);
});

test("composeDiskxWorld emits a valid-looking v2 document whose blocks name their folders", () => {
  const tree = buildDiskxTree(fixture.roots, fixture.directories);
  const datalake = tree.byPath.get("/mnt/datalake");
  const layout = layoutDiskxCity(datalake);
  const world = composeDiskxWorld(layout, { motes: false });
  assert.equal(world.schema, "graphysx.agent-world/v2");
  assert.ok(world.environment.post.bloom.strength > 0, "the city blooms");
  assert.equal(world.environment.sky, "clearnight", "the GraphysX app keeps its skybox");
  assert.equal("sky" in composeDiskxWorld(layout, { motes: false, sky: false }).environment, false, "the embed asks for no skybox files");
  const ids = new Set();
  for (const entity of world.entities) {
    assert.ok(entity.id && !ids.has(entity.id), `unique id ${entity.id}`);
    ids.add(entity.id);
    if (entity.parentId) assert.ok(ids.has(entity.parentId), `parent ${entity.parentId} declared before child`);
  }
  const districts = world.entities.filter((entity) => entity.tags?.includes(DISKX_DISTRICT_TAG));
  assert.ok(districts.length >= 10);
  const iso = districts.find((entity) => diskxPathOf(entity.tags) === "/mnt/datalake/ISO");
  assert.ok(iso, "the ISO folder is a district");
  assert.equal(iso.type, "box");
  assert.ok(iso.tags.includes(`${DISKX_PATH_TAG_PREFIX}/mnt/datalake/ISO`));
  // Roof buildings stand on their district, never inside it.
  const districtTop = new Map(districts.map((entity) => [entity.id, entity.transform.position[1] + entity.geometry.height / 2]));
  const buildings = world.entities.filter((entity) => entity.tags?.includes("diskx-building"));
  assert.ok(buildings.length > 0);
  for (const building of buildings) {
    const bottom = building.transform.position[1] - building.geometry.height / 2;
    const parentPath = diskxPathOf(building.tags).slice(0, diskxPathOf(building.tags).lastIndexOf("/"));
    const district = districts.find((entity) => diskxPathOf(entity.tags) === parentPath);
    assert.ok(district, `building ${building.id} has a district`);
    assert.ok(bottom >= districtTop.get(district.id) - 1e-6, `building ${building.id} stands on its roof`);
  }
  assert.equal(diskxPathOf(["x", "y"]), null);
});

test("the recorded fixture is coherent with its summary", () => {
  const tree = buildDiskxTree(fixture.roots, fixture.directories);
  assert.equal(tree.roots.length, 2);
  const total = tree.roots.reduce((sum, root) => sum + root.totalSize, 0);
  assert.equal(fixture.synthetic, true);
  assert.equal(fixture.complete, true);
  assert.equal(total, fixture.summary.totalSize);
  assert.equal(tree.roots.reduce((sum, root) => sum + root.totalFiles, 0), fixture.summary.totalFiles);
  const shares = categoryShares(tree.roots.find((root) => root.path === "/mnt/media"));
  assert.equal(shares[0].category, "video");
});

// AgentX Data has no capacity, so free space arrives as volumes from elsewhere. It is drawn
// once, beside the disks, at the same bytes-to-area scale, never inside a folder.
test("free space is one honest tile per volume at the disks level, and a gauge everywhere", () => {
  const tree = buildDiskxTree(fixture.roots, fixture.directories);
  const all = { path: "diskx://all", name: "Tous", depth: -1, ownSize: 0, ownFiles: 0, totalSize: tree.roots.reduce((s, r) => s + r.totalSize, 0), totalFiles: 0, largestFile: null, category: "other", children: tree.roots, reported: false };
  const volume = fixture.volumes[0];
  const layout = layoutDiskxCity(all, { size: 40, freeVolumes: [volume] });
  const free = layout.blocks.filter((block) => block.kind === "free");
  assert.equal(free.length, 1);
  assert.equal(free[0].node.path, `${DISKX_FREE_PATH_PREFIX}${volume.id}`);
  assert.ok(free[0].height < 0.5, "emptiness is flat");
  const used = layout.blocks.filter((block) => block.level === 0 && block.kind === "folder").reduce((s, b) => s + b.rect.width * b.rect.depth, 0);
  const freeArea = free[0].rect.width * free[0].rect.depth;
  const expected = volume.freeBytes / all.totalSize;
  // Street gaps are subtracted from every tile alike, so the two big disk tiles lose a little
  // more area than the one free tile; the exact proportionality is asserted on `squarify` above.
  assert.ok(Math.abs(freeArea / used - expected) / expected < 0.12, `free/used area ${freeArea / used} vs bytes ${expected}`);
  const inside = layoutDiskxCity(tree.roots[0], { size: 40, freeVolumes: [] });
  assert.equal(inside.blocks.filter((block) => block.kind === "free").length, 0);
  const world = composeDiskxWorld(layout, { motes: false });
  const tile = world.entities.find((entity) => entity.tags?.includes(DISKX_FREE_TAG));
  assert.ok(tile && tile.type === "box" && tile.material.opacity < 1, "the free tile is a translucent box");
  assert.equal(volumeForPath([volume], "/mnt/datalake/ISO").id, volume.id);
  assert.equal(volumeForPath([volume], "/elsewhere"), null);
  const occupancy = volumeOccupancy(volume, tree);
  assert.equal(occupancy.capacity, volume.capacityBytes);
  assert.equal(occupancy.used, volume.capacityBytes - volume.freeBytes);
  assert.equal(occupancy.usedShare, 0.5, "synthetic volume is exactly half used");
});

test("DISKX_VOLUMES parses declared sizes and measures mounts through statfs", async () => {
  assert.equal(parseBytes("7.27 TiB"), Math.round(7.27 * 2 ** 40));
  assert.equal(parseBytes("4.6 TB"), 4.6e12);
  assert.equal(parseBytes(42), 42);
  assert.throws(() => parseBytes("beaucoup"));
  assert.throws(() => parseDiskxVolumes("{"));
  assert.throws(() => parseDiskxVolumes(JSON.stringify([{ id: "x" }])), /roots/);
  assert.deepEqual(parseDiskxVolumes(""), []);
  const declared = parseDiskxVolumes(JSON.stringify([
    { id: "pool", label: "pool Media", roots: ["/mnt/media"], capacity: "10 TB", free: "4 TB", note: "n" },
    { id: "local", roots: ["/mnt/x"], path: "/fake" },
    { id: "gone", roots: ["/mnt/y"], path: "/missing" },
  ]));
  const fakeStatfs = async (path) => { if (path === "/fake") return { blocks: 1000, bsize: 4096, bavail: 250 }; throw new Error("ENOENT"); };
  const volumes = await resolveDiskxVolumes(declared, fakeStatfs, () => "2026-10-24T00:00:00Z");
  assert.deepEqual(volumes.map((v) => [v.id, v.capacityBytes, v.freeBytes, v.source]), [["pool", 1e13, 4e12, "declared"], ["local", 4096000, 1024000, "measured"]]);
  assert.equal(volumes[0].note, "n");
});
