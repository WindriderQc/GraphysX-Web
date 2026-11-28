import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const git = promisify(execFile);
const SCHEMA = 1;
const RELEVANT_ENV = /^(?:CI$|SMOKE_|VERIFY_|PLAYWRIGHT_|VITE_|NODE_|GRAPHYSX_|LLMX_NATIVE_GPU$|ISLAND_SOURCES$|DISKX_EMBED_DEBUG$|WEB_GAME_CLIENT$)/i;
const BUILD_INPUTS = [".env", ".env.local", ".env.production", ".env.production.local", "node_modules/.package-lock.json"];

async function digestFiles(root, names, { allowMissing = false } = {}) {
  const digest = createHash("sha256");
  for (const name of names) {
    const content = createHash("sha256");
    let fingerprint = null;
    try {
      for await (const chunk of createReadStream(path.join(root, name))) content.update(chunk);
      fingerprint = content.digest("hex");
    } catch (error) {
      if (!allowMissing || error.code !== "ENOENT") throw error;
    }
    digest.update(JSON.stringify([name, fingerprint]));
  }
  return digest.digest("hex");
}

export async function verifyIdentity(root, plan, scope, env = process.env) {
  const readGit = async (args) => (await git("git", args, { cwd: root, maxBuffer: 8 * 1024 * 1024 })).stdout;
  const [revision, modified, untracked, status] = await Promise.all([
    readGit(["rev-parse", "HEAD"]),
    readGit(["diff", "--name-only", "--no-renames", "-z", "HEAD", "--"]),
    readGit(["ls-files", "--others", "--exclude-standard", "-z"]),
    readGit(["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
  ]);
  const inputs = [...new Set([...modified.split("\0"), ...untracked.split("\0"), ...BUILD_INPUTS])].filter(Boolean).sort();
  const files = await digestFiles(root, inputs, { allowMissing: true });
  const environment = Object.keys(env).filter((name) => RELEVANT_ENV.test(name)).sort().map((name) => [name, env[name]]);
  const sha = revision.trim();
  const fingerprint = createHash("sha256").update(JSON.stringify([
    sha, root, process.execPath, process.version, process.platform, process.arch, scope, plan, status, files, environment,
  ])).digest("hex");
  return { sha, fingerprint, scope, plan };
}

async function fingerprintBuild(root) {
  const dist = path.join(root, "dist");
  const entries = await readdir(dist, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => !entry.isDirectory()).map((entry) => path.relative(dist, path.join(entry.parentPath, entry.name))).sort();
  if (!files.includes("index.html")) throw new Error("dist/index.html is missing");
  return digestFiles(dist, files);
}

/** The machine-wide verify lock is held for every read and write of this receipt. */
export async function openVerifyReceipt(file, root, identity, { resume = false } = {}) {
  let state;
  const save = async () => {
    state.updatedAt = new Date().toISOString();
    const temporary = `${file}.tmp`;
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`);
    await rename(temporary, file);
  };

  if (resume) {
    try {
      state = JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT" || error instanceof SyntaxError) {
        throw new Error("No readable verification receipt. Start a new run without --resume.");
      }
      throw error;
    }
    if (state?.schema !== SCHEMA || state.fingerprint !== identity.fingerprint || state.sha !== identity.sha || !state.checks) {
      throw new Error("Verification receipt does not match the current revision, inputs or selection. Start a new run without --resume.");
    }
    if (state.checks.build?.status === "passed") {
      const currentBuild = await fingerprintBuild(root).catch(() => null);
      if (!currentBuild || currentBuild !== state.buildFingerprint) {
        throw new Error("The verified dist/ changed or is missing. Start a new run without --resume to rebuild it.");
      }
    }
  } else {
    state = {
      schema: SCHEMA,
      ...identity,
      startedAt: new Date().toISOString(),
      activeCheck: null,
      checks: Object.fromEntries(identity.plan.map(({ name, skip }) => [name, { status: skip ?? "pending", attempts: 0 }])),
    };
    await save();
  }

  return {
    passed(name) {
      const check = state.checks[name];
      return check?.status === "passed" && check.result?.code === 0 && check.result.label === name ? check.result : null;
    },
    async start(name) {
      state.activeCheck = name;
      state.checks[name] = { status: "running", attempts: state.checks[name].attempts + 1, startedAt: new Date().toISOString() };
      await save();
    },
    async finish(result) {
      if (result.label === "build" && result.code === 0) state.buildFingerprint = await fingerprintBuild(root);
      const check = state.checks[result.label];
      check.status = result.code === 0 ? "passed" : "failed";
      check.finishedAt = new Date().toISOString();
      check.result = result;
      state.activeCheck = null;
      await save();
    },
  };
}
