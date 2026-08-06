import assert from "node:assert/strict";
import { mkdtemp, readdir, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { createResultsStore } from "../server/results-store.mjs";
import { createSceneStore } from "../server/scene-store.mjs";
import { encodeStoreName, legacyStoreNameCandidates } from "../server/store-paths.mjs";

const dirs = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const temporary = async (label) => {
  const dir = await mkdtemp(join(tmpdir(), `graphysx-${label}-`));
  dirs.push(dir);
  return dir;
};

const definition = (id) => ({
  schema: "graphysx.agent-world/v2",
  id,
  label: id,
  entities: [],
});

const result = (recordId, actorId) => ({
  recordId,
  actorId,
  elapsedMs: actorId === "ada" ? 5_000 : 4_000,
  courseVersion: "course-v1",
  rulesVersion: "rules-v1",
  outcome: "complete",
});

describe("store path migration", () => {
  it("reads a raw legacy scene, writes the bounded path, and lists it once", async () => {
    const dir = await temporary("scene-migration");
    const name = "legacy_scene";
    const first = createSceneStore({ dir });
    await first.put(name, definition("legacy-scene-document"));
    const [encoded] = (await readdir(dir)).filter((file) => file.endsWith(".json"));
    await rename(join(dir, encoded), join(dir, `${name}.json`));

    const reopened = createSceneStore({ dir });
    assert.equal((await reopened.get(name)).revision, 1);
    await reopened.put(name, definition("legacy-scene-updated"), 1);
    const listed = await reopened.list();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].name, name);
    assert.equal(listed[0].revision, 2);
    assert.equal((await readdir(dir)).filter((file) => file.endsWith(".json")).length, 2);
  });

  it("reads a raw legacy results board and counts old/new copies as one board", async () => {
    const dir = await temporary("results-migration");
    const recordId = "legacy_board";
    const first = createResultsStore({ dir });
    const written = await first.submit(result(recordId, "ada"));
    const [encoded] = (await readdir(dir)).filter((file) => file.endsWith(".json"));
    await rename(join(dir, encoded), join(dir, `${recordId}__${written.compatibility}.json`));

    const reopened = createResultsStore({ dir });
    assert.equal((await reopened.leaderboard(recordId, {
      courseVersion: "course-v1",
      rulesVersion: "rules-v1",
    })).entries[0].actorId, "ada");
    await reopened.submit(result(recordId, "bob"));
    assert.equal(await reopened.count(), 1);
  });

  it("prefers a newer percent-era scene when the raw predecessor also exists", async () => {
    const dir = await temporary("scene-percent-precedence");
    const name = "legacy_scene";
    const currentFile = `${encodeStoreName(name)}.json`;
    const first = createSceneStore({ dir });
    await first.put(name, definition("raw-scene-document"));
    await rename(join(dir, currentFile), join(dir, `${name}.json`));

    const second = createSceneStore({ dir });
    await second.put(name, definition("percent-scene-document"), 1);
    const [percentName] = legacyStoreNameCandidates(name, { suffixBytes: Buffer.byteLength(".json") });
    assert.notEqual(percentName, name);
    await rename(join(dir, currentFile), join(dir, `${percentName}.json`));

    const reopened = createSceneStore({ dir });
    const record = await reopened.get(name);
    assert.equal(record.revision, 2);
    assert.equal(record.definition.id, "percent-scene-document");
    assert.equal((await reopened.list())[0].revision, 2);
  });

  it("prefers a newer percent-era results board when the raw predecessor also exists", async () => {
    const dir = await temporary("results-percent-precedence");
    const recordId = "legacy_board";
    const first = createResultsStore({ dir });
    const initial = await first.submit(result(recordId, "ada"));
    const suffix = `__${initial.compatibility}.json`;
    const currentFile = `${encodeStoreName(recordId)}${suffix}`;
    await rename(join(dir, currentFile), join(dir, `${recordId}${suffix}`));

    const second = createResultsStore({ dir });
    await second.submit(result(recordId, "bob"));
    const [percentName] = legacyStoreNameCandidates(recordId, { suffixBytes: Buffer.byteLength(suffix) });
    assert.notEqual(percentName, recordId);
    await rename(join(dir, currentFile), join(dir, `${percentName}${suffix}`));

    const reopened = createResultsStore({ dir });
    const board = await reopened.leaderboard(recordId, {
      courseVersion: "course-v1",
      rulesVersion: "rules-v1",
    });
    assert.deepEqual(board.entries.map((entry) => entry.actorId), ["bob", "ada"]);
  });

  it("reads a maximum-length raw POSIX results id before its impossible percent fallback", {
    skip: process.platform === "win32",
  }, async () => {
    const dir = await temporary("results-max-legacy");
    const recordId = `a${":".repeat(79)}`;
    const first = createResultsStore({ dir });
    const written = await first.submit(result(recordId, "ada"));
    const [encoded] = (await readdir(dir)).filter((file) => file.endsWith(".json"));
    await rename(join(dir, encoded), join(dir, `${recordId}__${written.compatibility}.json`));

    const reopened = createResultsStore({ dir });
    const board = await reopened.leaderboard(recordId, {
      courseVersion: "course-v1",
      rulesVersion: "rules-v1",
    });
    assert.equal(board.entries[0].actorId, "ada");
  });

  it("persists maximum legal ids without oversized path components", async () => {
    const sceneDir = await temporary("scene-max-id");
    const resultDir = await temporary("result-max-id");
    const maximum = `a${":".repeat(79)}`;
    const scenes = createSceneStore({ dir: sceneDir });
    await scenes.put(maximum, definition("maximum-id-document"));
    assert.equal((await scenes.get(maximum)).name, maximum);
    const results = createResultsStore({ dir: resultDir });
    await results.submit(result(maximum, "ada"));
    for (const file of [...await readdir(sceneDir), ...await readdir(resultDir)]) {
      assert.ok(Buffer.byteLength(file) < 255, `${file.length}-byte component`);
    }
  });
});
