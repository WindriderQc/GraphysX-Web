import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer } from "./static-server.mjs";

// One command that proves a release is shippable: typecheck, build, then drive the
// built output in a real headless browser through every product route.
//
//   npm run verify              full gate (typecheck + build + smokes)
//   npm run verify -- --no-build   reuse the existing dist/
//   npm run verify -- --base https://graphysx.specialblend.ca/   smoke a live deploy
//
// This is the same gate CI runs before production deploys, so a green local run means
// a green pipeline.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACTS = path.join(ROOT, "output", "verify");
const PORT = Number(process.env.VERIFY_PORT || 4188);

const argv = process.argv.slice(2);
const noBuild = argv.includes("--no-build");
const baseArgIndex = argv.indexOf("--base");
const externalBase = baseArgIndex >= 0 ? argv[baseArgIndex + 1] : process.env.SMOKE_BASE;

const SMOKES = [
  { name: "showroom", script: "scripts/smoke-showroom.mjs", covers: "default route: welcome showroom, gated editor, auto-orbit" },
  { name: "editor", script: "scripts/smoke-editor.mjs", covers: "editor: library palette, model + texture + behaviour, exit path" },
  { name: "standalone", script: "scripts/smoke-standalone.mjs", covers: "?host=standalone: agent API, tool bridge, human editor" },
  { name: "levels", script: "scripts/smoke-levels.mjs", covers: "levels workbench: paint, fill, ASCII round trip, undo, create" },
  { name: "foundation", script: "scripts/smoke-foundation.mjs", covers: "?host=legacy: archive player still boots" },
];

function run(command, args, label) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      shell: process.platform === "win32",
      stdio: "inherit",
      env: { ...process.env },
    });
    child.on("close", (code) => resolve({ label, code: code ?? 1 }));
    child.on("error", (err) => {
      console.error(`${label}: ${err.message}`);
      resolve({ label, code: 1 });
    });
  });
}

function runSmoke(smoke, base) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [smoke.script], {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env, SMOKE_BASE: base, SMOKE_ARTIFACTS: ARTIFACTS },
    });
    child.on("close", (code) => resolve({ label: smoke.name, code: code ?? 1 }));
    child.on("error", (err) => {
      console.error(`${smoke.name}: ${err.message}`);
      resolve({ label: smoke.name, code: 1 });
    });
  });
}

const results = [];
let server = null;

try {
  await rm(ARTIFACTS, { recursive: true, force: true });
  await mkdir(ARTIFACTS, { recursive: true });

  if (!externalBase && !noBuild) {
    console.log("\n=== typecheck ===");
    results.push(await run("npx", ["tsc", "--noEmit"], "typecheck"));

    console.log("\n=== build ===");
    results.push(await run("npx", ["vite", "build"], "build"));
  }

  // Only smoke if we have something to smoke.
  const buildFailed = results.some((r) => r.code !== 0);
  if (buildFailed) {
    console.error("\nSkipping smokes — typecheck/build failed.");
  } else {
    let base = externalBase;
    if (!base) {
      server = await startStaticServer({ root: path.join(ROOT, "dist"), port: PORT });
      base = server.url;
    }
    console.log(`\n=== smokes against ${base} ===`);
    for (const smoke of SMOKES) {
      console.log(`\n--- ${smoke.name}: ${smoke.covers} ---`);
      results.push(await runSmoke(smoke, base));
    }
  }
} finally {
  if (server) await server.close();
}

const failed = results.filter((r) => r.code !== 0);
console.log("\n=== verify summary ===");
for (const r of results) console.log(`${r.code === 0 ? "PASS" : "FAIL"}  ${r.label}`);
if (failed.length) {
  console.error(`\n${failed.length} check(s) failed: ${failed.map((f) => f.label).join(", ")}`);
  process.exit(1);
}
console.log(`\nAll ${results.length} checks passed. Screenshots: ${ARTIFACTS}`);
