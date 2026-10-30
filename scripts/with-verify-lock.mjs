// Runs one heavy command under the machine-wide verify lock.
//
// The full gate software-rasterises WebGL on most of the cores, and so does any other
// headless Chromium job: a 4K capture, a render probe, a frame-rate measurement. Run beside a
// gate, both slow down and the gate starts losing smokes to transport errors. Measured on
// 2026-10-29: an unlocked 4K capture stretched a concurrent journey from 89 s to 133 s.
//
//   node scripts/with-verify-lock.mjs -- node output/probe/capture-4k.mjs
//   node scripts/with-verify-lock.mjs --no-wait -- node scripts/smoke-llmx.mjs
//
// By default it waits for a running gate, with the same limit as `npm run verify -- --wait`.
// The command's exit code is returned, and the lock is released however the command ends.
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { acquireVerifyLock, installSignalCleanup, killTree, machineVerifyLockPath } from "./verify-guard.mjs";

const USAGE = "usage: node scripts/with-verify-lock.mjs [--no-wait] -- <command> [args...]";

/** Splits our own options from the wrapped command, which always follows `--`. */
export function parseLockedCommand(argv) {
  const separator = argv.indexOf("--");
  if (separator < 0 || separator === argv.length - 1) throw new Error(USAGE);
  const options = argv.slice(0, separator);
  for (const option of options) {
    if (option !== "--no-wait") throw new Error(`unknown option ${option}\n${USAGE}`);
  }
  const [command, ...args] = argv.slice(separator + 1);
  return { wait: !options.includes("--no-wait"), command, args };
}

async function main() {
  let parsed;
  try {
    parsed = parseLockedCommand(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  let release;
  try {
    release = await acquireVerifyLock(machineVerifyLockPath(), { wait: parsed.wait });
  } catch (error) {
    if (error.code !== "EVERIFYLOCKED") throw error;
    console.error(error.message);
    process.exit(1);
  }
  const child = spawn(parsed.command, parsed.args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    // Own process group on POSIX, so killTree also reaches the Chromium the command starts.
    detached: process.platform !== "win32",
  });
  installSignalCleanup(() => [child], release);
  const code = await new Promise((resolve) => {
    child.on("error", (error) => { console.error(error.message); resolve(127); });
    child.on("exit", (exitCode, signal) => resolve(exitCode ?? (signal ? 1 : 0)));
  });
  killTree(child.pid);
  await release();
  process.exit(code);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
