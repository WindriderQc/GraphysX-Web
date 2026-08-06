import assert from "node:assert/strict";
import { readFile, mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";

import { createAssetStore } from "../server/asset-store.mjs";

async function withAssetStore(run) {
  const dir = await mkdtemp(join(tmpdir(), "graphysx-asset-store-test-"));
  try {
    const store = createAssetStore({ dir, datalakeDir: null });
    await store.list();
    return await run(store, dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("a rejected upload removes only the empty candidate directory it created", async () => {
  await withAssetStore(async (store, dir) => {
    await assert.rejects(
      store.upload({ id: "fresh", fileName: "fresh.bin" }, Readable.from([])),
      /requires a request body/,
    );
    await assert.rejects(stat(join(dir, "files", "fresh")), { code: "ENOENT" });

    const existing = join(dir, "files", "existing");
    await mkdir(existing, { recursive: true });
    await writeFile(join(existing, "sentinel.txt"), "keep me", "utf8");
    await assert.rejects(
      store.upload({ id: "existing", fileName: "existing.bin" }, Readable.from([])),
      /requires a request body/,
    );
    assert.deepEqual(await readdir(existing), ["sentinel.txt"]);
    assert.equal(await readFile(join(existing, "sentinel.txt"), "utf8"), "keep me");
  });
});

test("programmatic uploads still accept Buffer, string, and TypedArray bodies", async () => {
  await withAssetStore(async (store, dir) => {
    const cases = [
      { id: "buffer", body: Buffer.from([0, 1, 2, 255]), expected: Buffer.from([0, 1, 2, 255]) },
      { id: "string", body: "héllo", expected: Buffer.from("héllo") },
      { id: "typed", body: new Uint8Array([4, 5, 6]), expected: Buffer.from([4, 5, 6]) },
    ];

    for (const fixture of cases) {
      const record = await store.upload({ id: fixture.id, fileName: `${fixture.id}.bin` }, fixture.body);
      assert.equal(record.bytes, fixture.expected.byteLength);
      assert.deepEqual(await readFile(join(dir, "files", fixture.id, `${fixture.id}.bin`)), fixture.expected);
    }
  });
});

test("manifest cache results cannot be mutated through list callers", async () => {
  await withAssetStore(async (store) => {
    await store.upload(
      { id: "cached", fileName: "cached.bin", meta: { nested: { value: "on disk" } } },
      Buffer.from("asset"),
    );

    const first = await store.list();
    first[0].id = "poisoned";
    first[0].meta.nested.value = "poisoned";

    const second = await store.list();
    assert.equal(second[0].id, "cached");
    assert.equal(second[0].meta.nested.value, "on disk");
    assert.notEqual(await store.storedFile("cached", "cached.bin"), null);
  });
});
