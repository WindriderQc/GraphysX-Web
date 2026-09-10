import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireVerifyLock } from "../scripts/verify-guard.mjs";

describe("machine verify lock", () => {
  let dir;
  let lock;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "graphysx-lock-test-"));
    lock = join(dir, "verify.lock");
  });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  const assertOneOwner = async (lockPath) => {
    const claims = await Promise.allSettled(Array.from({ length: 8 }, () => acquireVerifyLock(lockPath)));
    const acquired = claims.filter((claim) => claim.status === "fulfilled");
    try {
      assert.equal(acquired.length, 1);
      assert.ok(claims.filter((claim) => claim.status === "rejected").every((claim) => claim.reason.code === "EVERIFYLOCKED"));
    } finally {
      await Promise.all(acquired.map((claim) => claim.value()));
    }
  };

  it("admits only one simultaneous claimant", async () => { await assertOneOwner(lock); });
  it("admits only one claimant when reclaiming a dead owner", async () => {
    // Windows and POSIX cannot have this PID; it remains a valid positive PID value.
    await writeFile(lock, JSON.stringify({ pid: 2147483647, started: 1 }));
    await assertOneOwner(lock);
  });
  it("respects a live owner older than an hour", async () => {
    const held = JSON.stringify({ pid: process.pid, started: Date.now() - 2 * 60 * 60 * 1000 });
    await writeFile(lock, held);
    await assert.rejects(acquireVerifyLock(lock), { code: "EVERIFYLOCKED" });
    assert.equal(await readFile(lock, "utf8"), held);
  });
  it("does not steal an incomplete owner record", async () => {
    await writeFile(lock, "");
    await assert.rejects(acquireVerifyLock(lock), { code: "EVERIFYLOCKED" });
  });
  it("an old release cannot remove a replacement owner's claim", async () => {
    const releaseOld = await acquireVerifyLock(lock);
    const releaseNew = await acquireVerifyLock(lock, { force: true });
    const held = await readFile(lock, "utf8");
    await releaseOld();
    assert.equal(await readFile(lock, "utf8"), held);
    await releaseNew();
    await releaseNew();
    await assert.rejects(readFile(lock), { code: "ENOENT" });
  });
});
