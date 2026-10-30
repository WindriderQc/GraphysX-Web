import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { parseLockedCommand } from "../scripts/with-verify-lock.mjs";

describe("with-verify-lock", () => {
  it("waits by default and passes the command through untouched", () => {
    assert.deepEqual(parseLockedCommand(["--", "node", "capture.mjs", "--", "x"]),
      { wait: true, command: "node", args: ["capture.mjs", "--", "x"] });
    assert.deepEqual(parseLockedCommand(["--no-wait", "--", "node"]), { wait: false, command: "node", args: [] });
  });

  it("refuses a missing command or an unknown option", () => {
    assert.throws(() => parseLockedCommand(["node", "capture.mjs"]), /usage/);
    assert.throws(() => parseLockedCommand(["--"]), /usage/);
    assert.throws(() => parseLockedCommand(["--force", "--", "node"]), /unknown option --force/);
  });

  // Windows spawns through a shell, which would need quoting for an execPath with spaces.
  describe("against a private lock directory", { skip: process.platform === "win32" && "POSIX spawn only" }, () => {
    // machineVerifyLockPath() honours LOCALAPPDATA, so the real machine lock is never touched.
    let dir;
    let env;
    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), "graphysx-with-lock-"));
      env = { ...process.env, LOCALAPPDATA: dir };
    });
    afterEach(async () => { await rm(dir, { recursive: true, force: true }); });
    const lockFile = () => join(dir, "graphysx", "verify.lock");
    const runLocked = (...argv) => spawnSync(process.execPath, ["scripts/with-verify-lock.mjs", ...argv], { env, encoding: "utf8" });

    it("holds the lock while the command runs, returns its exit code and releases", () => {
      const probe = `process.exit(require("node:fs").existsSync(${JSON.stringify(lockFile())}) ? 7 : 3)`;
      const result = runLocked("--", process.execPath, "-e", probe);
      assert.equal(result.status, 7, result.stderr);
      assert.equal(existsSync(lockFile()), false);
    });

    it("does not run the command while a live owner holds the lock", async () => {
      await mkdir(join(dir, "graphysx"), { recursive: true });
      await writeFile(lockFile(), JSON.stringify({ pid: process.pid, started: Date.now() }));
      const result = runLocked("--no-wait", "--", process.execPath, "-e", "console.log('ran')");
      assert.equal(result.status, 1);
      assert.doesNotMatch(result.stdout, /ran/);
      assert.match(result.stderr, /verify lock is held/);
      assert.equal(existsSync(lockFile()), true, "another owner's lock is left in place");
    });
  });
});
