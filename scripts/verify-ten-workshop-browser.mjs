/** Targeted local browser checks. This does NOT replace the full release gate. */
import { spawn } from "node:child_process";
import { startStaticServer } from "./static-server.mjs";
import { acquireVerifyLock, machineVerifyLockPath, installSignalCleanup, withDeadline } from "./verify-guard.mjs";
const release = await acquireVerifyLock(machineVerifyLockPath(), { wait: true });
const children = new Set();
installSignalCleanup(() => [...children], release);
let failed = false;
try {
  for (const name of ["ten-workshop", "math-lab", "first-creation", "vr-lab", "editor"]) {
    const server = await startStaticServer({ root: "dist", port: 0 });
    try {
      console.log(`\n=== ${name} ===`);
      const child = spawn(process.execPath, [`scripts/smoke-${name}.mjs`], { stdio: "inherit", env: { ...process.env, SMOKE_BASE: server.url } });
      children.add(child);
      const deadline = withDeadline(child, 10 * 60 * 1000, name);
      const code = await new Promise((resolve, reject) => { child.once("close", resolve); child.once("error", reject); });
      deadline.clear(); children.delete(child);
      console.log(`${code === 0 ? "PASS" : "FAIL"} ${name}`);
      failed ||= code !== 0;
    } finally { await server.close(); }
  }
} finally { await release(); }
console.log("Scope: five local browser journeys only, not a full release gate.");
process.exitCode = failed ? 1 : 0;
