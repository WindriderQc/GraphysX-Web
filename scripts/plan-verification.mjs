import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { selectVerification, verificationMatrix } from "./verify-impact.mjs";

const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const isSha = (value) => typeof value === "string" && /^[0-9a-f]{40}$/.test(value);

// A successful docs-only workflow has a skipped deploy job and is NOT a new
// production baseline. Failed/cancelled releases must not hide unshipped changes.
export async function findDeploymentBase({ request, ancestor, runId }) {
  const { workflow_runs: runs } = await request("/actions/workflows/deploy.yml/runs?branch=main&status=success&per_page=20");
  // Rerunning an older release can make it the latest activation despite its older id.
  runs.sort((a, b) => (Date.parse(b.updated_at) || 0) - (Date.parse(a.updated_at) || 0));
  for (const run of runs) {
    if (String(run.id) === String(runId) || run.head_branch !== "main" || run.conclusion !== "success" || !isSha(run.head_sha)) continue;
    if (!ancestor(run.head_sha)) continue;
    const { jobs } = await request(`/actions/runs/${run.id}/jobs?filter=latest&per_page=100`);
    if (jobs.some((job) => job.name === "deploy" && job.conclusion === "success")) return run.head_sha;
  }
  return null;
}

export function changedFilesSince(base, head) {
  if (!isSha(base) || !isSha(head)) throw new Error("The verification diff requires complete commit SHAs.");
  // --no-renames includes both sides of a move; -z preserves spaces and unusual names.
  return git("diff", "--name-only", "--no-renames", "-z", base, head, "--").split("\0").filter(Boolean);
}

export async function planFromGitHub(env = process.env) {
  const head = git("rev-parse", "HEAD").trim();
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
  let base = null;
  let fallback = null;
  const forceFull = env.VERIFY_FULL === "true";
  try {
    if (event.pull_request) {
      if (!isSha(event.pull_request.base.sha)) throw new Error("Missing pull request base SHA");
      base = git("merge-base", head, event.pull_request.base.sha).trim();
    } else if (env.GITHUB_REF === "refs/heads/main") {
      if (!/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY ?? "")) throw new Error("Missing repository identity");
      const request = async (suffix) => {
        const response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}${suffix}`, {
          headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${env.GITHUB_TOKEN}`, "X-GitHub-Api-Version": "2022-11-28" },
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw new Error(`GitHub baseline lookup failed (${response.status})`);
        return response.json();
      };
      base = await findDeploymentBase({ request, runId: env.GITHUB_RUN_ID, ancestor: (sha) => {
        try { git("merge-base", "--is-ancestor", sha, head); return true; } catch { return false; }
      } });
    } else {
      base = git("merge-base", head, "origin/main").trim();
    }
  } catch {
    // Missing history/API access may increase testing, never silently reduce it.
    fallback = "Could not establish the comparison base; running the full suite.";
  }
  const files = base ? changedFilesSince(base, head) : [];
  const plan = selectVerification(files, { full: forceFull || !base });
  // A forced/manual redeploy or an unknown baseline still ships and gets the public smoke.
  plan.deploy ||= !base || (env.GITHUB_EVENT_NAME === "workflow_dispatch" && env.GITHUB_REF === "refs/heads/main");
  return { ...plan, base, head, fallback, matrix: verificationMatrix(plan.smokes) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plan = await planFromGitHub();
  const summary = [
    `Verification: ${plan.mode}; ${plan.smokes.length} selected smokes; ${plan.matrix.include.length} runner(s).`,
    `Comparison: ${plan.base ?? "unavailable (full fallback)"} -> ${plan.head}.`,
    `Deploy: ${plan.deploy}.`,
    plan.fallback ?? "",
    ...plan.reasons.map(({ file, rule }) => `${JSON.stringify(file)}: ${rule}`),
    `Checks: ${plan.smokes.map((smoke) => smoke.name).join(", ") || "static checks only"}`,
  ].filter(Boolean).join("\n");
  console.log(summary);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${JSON.stringify(plan.matrix)}\ndeploy=${plan.deploy}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary.replaceAll("\n", "  \n")}\n`);
}
