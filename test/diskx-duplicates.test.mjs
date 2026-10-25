import { test } from "node:test";
import assert from "node:assert/strict";
import { importBrowserModule } from "./support/import-browser-module.mjs";

const { planDuplicateView, anchorDuplicates, duplicateLinks, folderOf, DUPLICATE_ALL_SCOPE } =
  await importBrowserModule(new URL("../src/diskx-duplicates.ts", import.meta.url));

const ROOTS = ["/mnt/datalake", "/mnt/media"];
const known = new Set(["/mnt/datalake", "/mnt/media", "/mnt/datalake/ISO", "/mnt/datalake/Shared", "/mnt/datalake/Shared/Games", "/mnt/media/Movies"]);
const exists = (path) => known.has(path);
const group = (files, survivor, extra = {}) => ({
  sha256: "a".repeat(64), proof: "sha256-current-metadata", size: 1000, count: files.length, provenSavingsBytes: 1000 * (files.length - 1),
  files: files.map((path) => ({ path })), filesOmitted: 0, policySurvivorPath: survivor, review: null, ...extra,
});

test("copies in two folders of one disk: that disk is the level, keep and extra are its districts", () => {
  const view = planDuplicateView(group(["/mnt/datalake/Shared/Games/x.iso", "/mnt/datalake/ISO/x.iso"], "/mnt/datalake/ISO/x.iso"), ROOTS, exists);
  assert.equal(view.scope, "/mnt/datalake");
  assert.equal(view.keepPath, "/mnt/datalake/ISO/x.iso");
  assert.equal(view.freedBytes, 1000, "one extra copy frees its size, logically");
  const { anchors, outside } = anchorDuplicates(view, ["/mnt/datalake/ISO", "/mnt/datalake/Shared"]);
  assert.deepEqual(outside, []);
  assert.deepEqual(anchors.map((a) => [a.district, a.role, a.freedBytes]), [["/mnt/datalake/Shared", "extra", 1000], ["/mnt/datalake/ISO", "keep", 0]]);
  assert.deepEqual(duplicateLinks(anchors), [{ from: "/mnt/datalake/Shared", to: "/mnt/datalake/ISO" }]);
});

test("copies on both disks show the disks; copies in one folder show that folder as a district", () => {
  const across = planDuplicateView(group(["/mnt/media/Movies/a.mkv", "/mnt/datalake/ISO/a.mkv"], "/mnt/media/Movies/a.mkv"), ROOTS, exists);
  assert.equal(across.scope, DUPLICATE_ALL_SCOPE);
  assert.equal(anchorDuplicates(across, ROOTS).anchors.length, 2);
  const together = planDuplicateView(group(["/mnt/datalake/ISO/a.iso", "/mnt/datalake/ISO/a (1).iso"], "/mnt/datalake/ISO/a.iso"), ROOTS, exists);
  assert.equal(together.scope, "/mnt/datalake");
  const { anchors } = anchorDuplicates(together, ["/mnt/datalake/ISO"]);
  assert.equal(anchors.length, 1);
  assert.equal(anchors[0].role, "keep", "a district holding the kept copy stays keep, even with an extra beside it");
  assert.equal(anchors[0].freedBytes, 1000);
  assert.deepEqual(duplicateLinks(anchors), [], "no arc inside one district");
});

test("a copy in the level folder itself climbs one level; unknown folders climb to a known one", () => {
  const nested = planDuplicateView(group(["/mnt/datalake/Shared/a.zip", "/mnt/datalake/Shared/Games/a.zip"], "/mnt/datalake/Shared/a.zip"), ROOTS, exists);
  assert.equal(nested.scope, "/mnt/datalake", "Shared holds a copy directly, so Shared must be a district");
  const truncated = planDuplicateView(group(["/mnt/datalake/Deep/One/a", "/mnt/datalake/Deep/Two/a"], "/mnt/datalake/Deep/One/a"), ROOTS, exists);
  assert.equal(truncated.scope, "/mnt/datalake", "the index does not know Deep yet: show the disk");
});

test("no survivor named: copies stay unresolved, nothing is claimed as freed, no arc", () => {
  const view = planDuplicateView(group(["/mnt/datalake/ISO/a", "/mnt/datalake/Shared/a"], null), ROOTS, exists);
  assert.equal(view.keepPath, null);
  assert.equal(view.freedBytes, 0);
  assert.ok(view.copies.every((copy) => copy.role === "unresolved"));
  const { anchors } = anchorDuplicates(view, ["/mnt/datalake/ISO", "/mnt/datalake/Shared"]);
  assert.deepEqual(duplicateLinks(anchors), []);
  const stale = planDuplicateView(group(["/mnt/datalake/ISO/a", "/mnt/datalake/Shared/a"], "/elsewhere/a"), ROOTS, exists);
  assert.equal(stale.keepPath, null, "a survivor path that is not one of the copies is not trusted");
});

test("copies outside the visible districts are reported, omitted copies are carried, folderOf is exact", () => {
  const view = planDuplicateView(group(["/mnt/datalake/ISO/a", "/mnt/datalake/Shared/a"], "/mnt/datalake/ISO/a", { filesOmitted: 3 }), ROOTS, exists);
  assert.equal(view.omitted, 3);
  const { anchors, outside } = anchorDuplicates(view, ["/mnt/datalake/ISO"]);
  assert.equal(anchors.length, 1);
  assert.deepEqual(outside.map((copy) => copy.path), ["/mnt/datalake/Shared/a"]);
  assert.equal(anchorDuplicates(view, ["/mnt/datalake/IS"]).anchors.length, 0, "prefix neighbours are not parents");
  assert.equal(folderOf("/mnt/a/b.txt"), "/mnt/a");
  assert.equal(folderOf("/b.txt"), "/");
});
