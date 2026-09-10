// The numbers the docs used to pin by hand.
//
// "a 91-tool bridge" and "a 47-check gate" were true when written and became wrong the next
// time either grew. Documentation that carries a count carries a maintenance obligation
// nobody signed up for, so the docs now point here and this reads the real sources.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VERIFY_SMOKES, VERIFY_STATIC_CHECKS } from "./verify-manifest.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const read = (rel) => readFile(path.join(ROOT, rel), "utf8");

export async function projectCounts() {
  const bridge = await read("src/agent-world-bridge.ts");
  const toolBlock = bridge.split("const TOOL_PATHS = [")[1]?.split("] as const")[0] ?? "";
  const tools = [...toolBlock.matchAll(/"([^"]+)"/g)].map((match) => match[1]);

  const packageJson = JSON.parse(await read("package.json"));
  const smokeScripts = Object.keys(packageJson.scripts).filter((name) => name.startsWith("smoke:"));
  const audits = Object.keys(packageJson.scripts).filter((name) => name.startsWith("audit:"));

  return {
    bridgeTools: tools.length,
    gateChecks: VERIFY_SMOKES.length + Object.keys(VERIFY_STATIC_CHECKS).length,
    gateSmokes: VERIFY_SMOKES.length,
    smokeScripts: smokeScripts.length,
    audits: audits.length,
  };
}

if (process.argv[1]?.endsWith("counts.mjs")) {
  const counts = await projectCounts();
  console.log(`agent bridge paths:   ${counts.bridgeTools}`);
  console.log(`release gate checks:  ${counts.gateChecks} (${counts.gateSmokes} smokes/audits + ${Object.keys(VERIFY_STATIC_CHECKS).join(", ")})`);
  console.log(`smoke scripts:        ${counts.smokeScripts}`);
  console.log(`standalone audits:    ${counts.audits}`);
}
