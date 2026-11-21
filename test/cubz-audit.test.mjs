import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

test("archive audit rejects direct and symlinked output paths before modifying its input", () => {
  const temporary = mkdtempSync(path.join(tmpdir(), "cubz-audit-custody-")), archive = path.join(temporary, "archive"), alias = path.join(temporary, "alias");
  mkdirSync(archive); writeFileSync(path.join(archive, "keep.txt"), "original bytes");
  try {
    symlinkSync(archive, alias, process.platform === "win32" ? "junction" : "dir");
    for (const output of [path.join(archive, "new", "audit.json"), path.join(alias, "audit.json")]) {
      assert.throws(() => execFileSync(process.execPath, ["scripts/audit-cubz-buttons.mjs", `--archive=${archive}`, `--output=${output}`], { stdio: ["ignore", "pipe", "pipe"] }), error => /must be outside the original archive/.test(String(error.stderr)));
      assert.deepEqual(readdirSync(archive), ["keep.txt"]);
      assert.equal(readFileSync(path.join(archive, "keep.txt"), "utf8"), "original bytes");
    }
    mkdirSync(path.join(temporary, "output"));
    symlinkSync(archive, path.join(temporary, "output", "nested-audit"), process.platform === "win32" ? "junction" : "dir");
    assert.throws(() => execFileSync(process.execPath, ["scripts/audit-cubz-buttons.mjs", `--archive=${archive}`, `--output=${path.join(temporary, "output", "audit.json")}`], { stdio: ["ignore", "pipe", "pipe"] }), error => /must be outside the original archive/.test(String(error.stderr)));
    assert.deepEqual(readdirSync(archive), ["keep.txt"]);
  } finally {
    assert.ok(path.resolve(temporary).startsWith(path.resolve(tmpdir()) + path.sep));
    rmSync(temporary, { recursive: true, force: true });
  }
});
