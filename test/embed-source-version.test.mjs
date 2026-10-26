import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { embedSourceVersion } from "../scripts/embed-source-version.mjs";

test("the displayed bundle identity changes with the actual source, including dirty inputs", async t => {
  const root = await mkdtemp(path.join(tmpdir(), "ecosystem-embed-version-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "src")); await mkdir(path.join(root, "scripts"));
  for (const file of ["package-lock.json", "vite.diskx.config.ts", "scripts/embed-source-version.mjs", "src/test.ts"])
    await writeFile(path.join(root, file), "original");
  const version = embedSourceVersion(root);
  assert.match(version, /^[a-f0-9]{64}$/); assert.equal(embedSourceVersion(root), version);
  await writeFile(path.join(root, "src/test.ts"), "modified without a commit");
  assert.notEqual(embedSourceVersion(root), version);
});
