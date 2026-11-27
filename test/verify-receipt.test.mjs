import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { resolveVerifyOptions } from "../scripts/verify-manifest.mjs";
import { openVerifyReceipt, verifyIdentity } from "../scripts/verify-receipt.mjs";

const plan = ["build", "finished", "failed", "interrupted", "pending"].map((name) => ({ name }));
const identity = { sha: "fixture-sha", fingerprint: "fixture-inputs", scope: "partial verification", plan };

test("a resumed gate keeps durable passes and retries failures and interrupted checks", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "verify-receipt-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = path.join(root, "receipt.json");
  const dist = path.join(root, "dist");
  await mkdir(dist);
  await writeFile(path.join(dist, "index.html"), "fixture build");
  const receipt = await openVerifyReceipt(file, root, identity);
  const finished = { label: "finished", code: 0, retried: "ECONNRESET", elapsedMs: 192, deadlineMs: 1000 };
  for (const result of [{ label: "build", code: 0 }, finished, { label: "failed", code: 1 }]) {
    await receipt.start(result.label);
    await receipt.finish(result);
  }
  await receipt.start("interrupted");
  const previous = JSON.parse(await readFile(file, "utf8"));
  assert.equal(previous.activeCheck, "interrupted");

  const resumed = await openVerifyReceipt(file, root, identity, { resume: true });
  assert.deepEqual(resumed.passed("finished"), finished);
  for (const name of ["failed", "interrupted", "pending"]) assert.equal(resumed.passed(name), null);
  await resumed.start("interrupted");
  await resumed.finish({ label: "interrupted", code: 0 });

  const state = JSON.parse(await readFile(file, "utf8"));
  assert.equal(state.activeCheck, null);
  assert.deepEqual(state.checks.finished, previous.checks.finished);
  assert.equal(state.checks.interrupted.attempts, 2);
  assert.ok(Date.parse(state.checks.interrupted.finishedAt) >= Date.parse(state.checks.interrupted.startedAt));

  await assert.rejects(openVerifyReceipt(file, root, { ...identity, sha: "other-sha" }, { resume: true }), /does not match/);
  await writeFile(path.join(dist, "index.html"), "different build");
  await assert.rejects(openVerifyReceipt(file, root, identity, { resume: true }), /dist\/ changed/);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), state);
});

test("identity covers actual working changes, selection and verification environment", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "verify-inputs-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
  git("init", "-q");
  await writeFile(path.join(root, "source.js"), "initial");
  git("add", "source.js");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "-c", "commit.gpgsign=false", "commit", "-qm", "Fixture");
  const capture = (selection = plan, env = {}) => verifyIdentity(root, selection, identity.scope, env);
  const clean = await capture();
  assert.notEqual((await capture(plan.slice(1))).fingerprint, clean.fingerprint);
  assert.notEqual((await capture(plan, { SMOKE_TIMEOUT: "90000" })).fingerprint, clean.fingerprint);
  await writeFile(path.join(root, "source.js"), "edited");
  const edited = await capture();
  assert.equal(edited.sha, clean.sha);
  assert.notEqual(edited.fingerprint, clean.fingerprint);
  await writeFile(path.join(root, "new.js"), "first");
  const withUntracked = await capture();
  await writeFile(path.join(root, "new.js"), "other");
  assert.notEqual((await capture()).fingerprint, withUntracked.fingerprint);
});

test("resume is scoped to a local build", () => {
  assert.equal(resolveVerifyOptions(["--resume", "--checks=quest3"], {}).resume, true);
  assert.throws(() => resolveVerifyOptions(["--resume", "--no-build"], {}), /local verification/);
  assert.throws(() => resolveVerifyOptions(["--resume"], { SMOKE_BASE: "https://example.test" }), /local verification/);
  assert.throws(() => resolveVerifyOptions(["--resume"], { CI: "true" }), /local verification/);
});
