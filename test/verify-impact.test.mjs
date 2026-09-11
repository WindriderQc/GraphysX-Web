import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { VERIFY_SMOKES, resolveVerifyOptions } from "../scripts/verify-manifest.mjs";
import { selectVerification, verificationMatrix } from "../scripts/verify-impact.mjs";
import { findDeploymentBase } from "../scripts/plan-verification.mjs";

const names = (plan) => plan.smokes.map((smoke) => smoke.name);

describe("verification by changed area", () => {
  it("runs no 3D checks and does not deploy documentation or verification tooling", () => {
    const plan = selectVerification(["README.md", "docs/CI_PERFORMANCE.md", "CLAUDE.md", "test/README.md", "test/verify-impact.test.mjs", "scripts/verify.mjs", "scripts/verify-impact.mjs", "scripts/plan-verification.mjs", ".github/workflows/ci.yml"]);
    assert.equal(plan.mode, "static");
    assert.equal(plan.deploy, false);
    assert.deepEqual(names(plan), []);
    const matrix = verificationMatrix(plan.smokes);
    assert.deepEqual(matrix.include, [{ shard: 1, checks: "none", browser: false }]);
    const options = resolveVerifyOptions(["--checks=none"], {});
    assert.deepEqual(options.smokes, []);
    assert.equal(options.noBuild, false);
    assert.equal(options.fullRelease, false);
  });

  it("checks arrival guidance without testing every game or the collaboration system", () => {
    const plan = selectVerification(["src/kidx-mission-guide.ts"]);
    assert.equal(plan.mode, "targeted");
    assert.equal(plan.deploy, true);
    assert.deepEqual(new Set(names(plan)), new Set(["kidx-guidance", "standalone", "product-assets", "asset-guard"]));
  });

  it("limits broad KidX changes to KidX and the short integration checks", () => {
    const plan = selectVerification(["src/kidx-app.css", "src/ev3-mission-strip.ts", "public/assets/kidx/first-drive-mat.svg"]);
    assert.ok(names(plan).includes("kidx-interactive"));
    assert.ok(names(plan).includes("ev3-program-layout-compact"));
    assert.ok(!names(plan).includes("live-sessions-browser"));
    assert.ok(!names(plan).includes("world1"));
    assert.equal(plan.mode, "targeted");
  });

  it("unions mixed changes and includes collaboration only when that area changed", () => {
    const plan = selectVerification(["src/ballz-play.ts", "server/live-sessions.mjs"]);
    assert.ok(names(plan).includes("ballz"));
    assert.ok(names(plan).includes("live-sessions-browser"));
    assert.ok(!names(plan).includes("kidx-guidance"));
    assert.equal(new Set(names(plan)).size, plan.smokes.length);
  });

  it("runs the complete suite for shared engine, dependencies and unclassified executable files", () => {
    for (const file of ["src/platform-host.ts", "src/platform-theme.ts", "src/agent-world-runtime.ts", "package-lock.json", "vite.config.ts", "scripts/smoke-harness.mjs", "src/new-shared-module.ts"]) {
      const plan = selectVerification(["README.md", file]);
      assert.equal(plan.mode, "full", file);
      assert.deepEqual(plan.smokes, VERIFY_SMOKES, file);
    }
    assert.deepEqual(selectVerification(["README.md"], { full: true }).smokes, VERIFY_SMOKES);
  });

  it("reruns a changed smoke itself without deploying test-only changes", () => {
    const plan = selectVerification(["scripts/smoke-kidx-guidance.mjs"]);
    assert.deepEqual(names(plan), ["kidx-guidance"]);
    assert.equal(plan.deploy, false);
    const node = verificationMatrix(selectVerification(["scripts/smoke-results.mjs"]).smokes);
    assert.equal(node.include[0].browser, false);
  });

  it("requires the integration checks for deployment config changes", () => {
    const plan = selectVerification([".github/workflows/deploy.yml"]);
    assert.equal(plan.deploy, true);
    assert.ok(names(plan).includes("standalone"));
    assert.ok(!names(plan).includes("live-sessions-browser"));
  });

  it("partitions selected checks exactly once and passes their names through the real runner parser", () => {
    for (const files of [[], ["README.md"], ["src/kidx-mission-guide.ts"], ["src/kidx-app.ts"], ["src/platform-host.ts"]]) {
      const plan = selectVerification(files);
      const matrix = verificationMatrix(plan.smokes);
      assert.ok(matrix.include.length >= 1 && matrix.include.length <= 4);
      const executed = matrix.include.flatMap((job) => resolveVerifyOptions([`--checks=${job.checks}`], {}).smokes);
      assert.deepEqual(new Set(executed), new Set(plan.smokes));
      assert.equal(executed.length, plan.smokes.length);
    }
  });

  it("rejects misspelled check lists and conflicting filters before any check runs", () => {
    for (const value of ["", "none,standalone", "kidx-guidanc", "standalone,", "standalone,unknown"]) {
      assert.throws(() => resolveVerifyOptions([`--checks=${value}`], {}), /--checks/);
    }
    for (const other of ["--shard=1/4", "--tier=apps", "--base=https://example.com"]) {
      assert.throws(() => resolveVerifyOptions(["--checks=kidx-guidance", other], {}), /cannot be combined/);
    }
  });
});

describe("production comparison baseline", () => {
  it("ignores successful docs-only workflows, failures, other branches and non-ancestors", async () => {
    const sha = (digit) => digit.repeat(40);
    const runs = [
      { id: 6, head_sha: sha("6"), head_branch: "main", conclusion: "success" },
      { id: 5, head_sha: sha("5"), head_branch: "main", conclusion: "success" },
      { id: 4, head_sha: sha("4"), head_branch: "main", conclusion: "failure" },
      { id: 3, head_sha: sha("3"), head_branch: "feature", conclusion: "success" },
      { id: 2, head_sha: sha("2"), head_branch: "main", conclusion: "success" },
      { id: 1, head_sha: sha("1"), head_branch: "main", conclusion: "success" },
    ];
    const requests = [];
    const result = await findDeploymentBase({ runId: 6, ancestor: (value) => value !== sha("2"), request: async (url) => {
      requests.push(url);
      if (url.startsWith("/actions/workflows")) return { workflow_runs: runs };
      if (url.includes("/5/")) return { jobs: [{ name: "deploy", conclusion: "skipped" }] };
      assert.ok(url.includes("/1/"), "only a prior real deployment may be selected");
      return { jobs: [{ name: "deploy", conclusion: "success" }] };
    } });
    assert.equal(result, sha("1"));
    assert.equal(requests.length, 3);
  });

  it("returns no baseline when none of the recent successful workflows activated production", async () => {
    const base = await findDeploymentBase({ runId: 2, ancestor: () => true, request: async (url) => url.startsWith("/actions/workflows")
      ? { workflow_runs: [{ id: 1, head_sha: "a".repeat(40), head_branch: "main", conclusion: "success" }] }
      : { jobs: [{ name: "deploy", conclusion: "skipped" }] } });
    assert.equal(base, null);
  });

  it("includes both sides of renames and all accumulated commits since the baseline", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "graphysx-impact-"));
    const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    try {
      git("init"); git("config", "user.name", "Impact test"); git("config", "user.email", "impact@example.invalid");
      mkdirSync(path.join(dir, "src")); mkdirSync(path.join(dir, "docs"));
      writeFileSync(path.join(dir, "src/platform-host.ts"), "original\n");
      git("add", "."); git("commit", "-m", "baseline");
      const base = git("rev-parse", "HEAD");
      git("mv", "src/platform-host.ts", "docs/moved.md"); git("commit", "-m", "unshipped change");
      writeFileSync(path.join(dir, "README.md"), "later docs\n");
      git("add", "README.md"); git("commit", "-m", "later change");
      const head = git("rev-parse", "HEAD");
      const moduleUrl = new URL("../scripts/plan-verification.mjs", import.meta.url).href;
      const output = execFileSync(process.execPath, ["--input-type=module", "-e", `import { changedFilesSince } from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify(changedFilesSince(${JSON.stringify(base)}, ${JSON.stringify(head)})));`], { cwd: dir, encoding: "utf8" });
      const files = JSON.parse(output);
      assert.deepEqual(new Set(files), new Set(["src/platform-host.ts", "docs/moved.md", "README.md"]));
      assert.equal(selectVerification(files).mode, "full");
    } finally {
      assert.equal(path.dirname(path.resolve(dir)), path.resolve(tmpdir()));
      assert.match(path.basename(dir), /^graphysx-impact-/);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
