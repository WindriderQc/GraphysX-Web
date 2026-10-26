import { test } from "node:test";
import assert from "node:assert/strict";

// The browser-side source under Node's own type stripping (as diskx-embed.test.mjs reads it).
// `volumes()` and its summary read are covered by test/diskx-observation.test.mjs; this file
// holds the delta: the root filter and `filesystemType` in `sanitiseVolumes`.
const { createLiveSource, createFixtureSource, sanitiseVolumes } = await import("../src/diskx-source.ts");

const envelope = (data) => new Response(JSON.stringify({ status: "success", data }));
const dataVolume = {
  id: "ugfrank:media/media", label: "Media/Media", host: "UGFrank", roots: ["/mnt/datalake", "/mnt/media"],
  capacityBytes: 7380881637376, freeBytes: 4923225800704, source: "measured", method: "statfs",
  measuredAt: "2026-10-26T02:29:35.289Z", filesystem: { type: "zfs", mountSource: "Media/Media", mountPoint: "/Media/Media", device: "0:42" },
  scannerIds: ["ugfrank-storage"], note: "ZFS statfs reports this dataset's used plus available space, not the pool size.",
};

test("a volume holding none of the city's roots is dropped, so a free tile always sits beside a disk it serves", async () => {
  const published = [dataVolume, { ...dataVolume, id: "ugfrank:rpool", label: "rpool", roots: ["/"], filesystem: { type: "zfs" } }];
  const live = createLiveSource(async () => envelope({ totalFiles: 1, totalSize: 1, volumes: published }), ["/mnt/media"], "LAN");
  assert.deepEqual((await live.volumes()).map((volume) => volume.id), ["ugfrank:media/media"]);
  const elsewhere = createLiveSource(async () => envelope({ totalFiles: 1, totalSize: 1, volumes: published }), ["/srv"], "LAN");
  assert.deepEqual(await elsewhere.volumes(), [], "no shared root: unknown capacity, not someone else's disk");
  assert.equal(sanitiseVolumes(published).length, 2, "without roots nothing is filtered");
  assert.deepEqual(sanitiseVolumes(published, ["/mnt/datalake"]).map((volume) => volume.id), ["ugfrank:media/media"]);
});

test("filesystemType comes from filesystem.type and degrades to null; nothing else is completed", () => {
  const kept = sanitiseVolumes([dataVolume])[0];
  assert.equal(kept.filesystemType, "zfs");
  assert.equal(kept.host, "UGFrank");
  assert.equal(kept.method, "statfs");
  for (const filesystem of [undefined, null, {}, { type: "" }, { type: 42 }, "zfs"]) {
    assert.equal(sanitiseVolumes([{ ...dataVolume, filesystem }])[0].filesystemType, null, JSON.stringify(filesystem));
  }
  assert.deepEqual(sanitiseVolumes([{ ...dataVolume, capacityBytes: 0 }]), []);
  assert.deepEqual(sanitiseVolumes([{ ...dataVolume, source: "guessed" }]), []);
  assert.deepEqual(sanitiseVolumes({ volumes: [dataVolume] }), [], "an object is not a list");
});

test("the fixture's declared demo volume holds the fixture's roots and says it is fictitious", async () => {
  const volumes = await createFixtureSource().volumes();
  assert.equal(volumes.length, 1);
  assert.equal(volumes[0].source, "declared");
  assert.equal(volumes[0].filesystemType, null);
  assert.match(volumes[0].note, /fictives|non mesur/i);
});
