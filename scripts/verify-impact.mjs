import { VERIFY_SMOKES } from "./verify-manifest.mjs";

const KIDX = VERIFY_SMOKES.filter((s) => /^(ev3-|kidx-)/.test(s.name)).map((s) => s.name);
const STORE = VERIFY_SMOKES.filter((s) => s.tier === "deep" && s.name !== "top20").map((s) => s.name);
const GAMES = ["ballz", "games", "archive-cup", "archive-levels", "spiral", "world1", "great-slide", "map1", "level1-2011", "suzanne-machinery", "suzanne1", "suzanne2", "level3", "ballz18-sky"];
const BASELINE = ["standalone", "product-assets", "asset-guard"];
const NODE_ONLY = new Set(["scene-command-validation", "product-assets", "asset-guard", "previews", "store-auth", "live-sessions", "live-sessions-security", "live-undo", "results", "dna"]);

function family(...prefixes) {
  return prefixes.flatMap((prefix) => {
    const checks = VERIFY_SMOKES.filter((smoke) => smoke.name === prefix || smoke.name.startsWith(`${prefix}-`)).map((smoke) => smoke.name);
    if (!checks.length) throw new Error(`Unknown impact family: ${prefix}`);
    return checks;
  });
}

// Narrow rules precede family rules. Unknown executable/shared files select the full
// suite. This is an explicit coverage map, not a guess based on import reachability.
const RULES = [
  { match: /^(?:(?!(?:src|public)\/).+\.md|test\/.*\.test\.mjs|\.gitignore|\.gitattributes)$/, checks: [], label: "documentation or Node tests", deploy: false },
  { match: /^scripts\/(?:verify(?:-[\w-]+)?|plan-verification|counts)\.(?:mjs|json)$/, checks: [], label: "verification tooling", deploy: false },
  { match: /^\.github\/workflows\/(?:ci|staging)\.yml$/, checks: [], label: "CI configuration", deploy: false },
  { match: /^(?:\.github\/workflows\/deploy\.yml|scripts\/(?:write-release-metadata|smoke-live-release)\.mjs|ops\/)/, checks: BASELINE, label: "deployment configuration", deploy: true },
  // Conversation changes affect opening/replay, corrected scene speech and profile
  // switching. The native renderer/host, schema and dependencies keep their broad rules.
  { match: /^(?:src\/llmx-(?:audio|conversation(?:-client)?|speech-queue|transport)\.ts|scripts\/(?:llmx-server|serve-llmx)\.mjs|server\/llmx-target\.(?:mjs|d\.mts))$/, checks: [...family("llmx-conversation"), "llmx-creation-actions", "llmx-creation-family", "llmx-world", "llmx"], label: "LLMx conversation and voice transport", deploy: true },
  // The face asset/pose/finish are also consumed by agent-world-face.ts, so include
  // native-world round trips and the external-agent journey, not only the room UI.
  { match: /^(?:src\/(?:llmx[-.]|agent-world-face\.ts$)|llmx-preview\.html$)/, checks: [...family("llmx"), "agent-mcp", "scene-command-validation", "roundtrip"], label: "LLMx room and voxel face", deploy: true },
  { match: /^src\/kidx-mission-guide\.ts$/, checks: family("kidx-guidance"), label: "KidX arrival guidance", deploy: true },
  { match: /^src\/kidx-(?:pdf-reader|library|document-catalog)\.(?:ts|json)$/, checks: family("kidx-workshop"), label: "KidX documents", deploy: true },
  { match: /^src\/kidx-code(?:-lab)?\.ts$/, checks: family("kidx-interactive", "kidx-challenges", "kidx-guidance"), label: "KidX code laboratory", deploy: true },
  { match: /^(?:src\/(?:kidx-|ev3-)|public\/assets\/kidx\/|scripts\/kidx-)/, checks: KIDX, label: "KidX workshop", deploy: true },
  { match: /^src\/(?:ballz-|archive-ballz-levels\.ts)/, checks: GAMES, label: "BallZ games", deploy: true },
  { match: /^(?:src\/results-client\.ts|server\/results-store\.mjs)$/, checks: ["results", "results-browser"], label: "results", deploy: true },
  { match: /^(?:server\/|src\/(?:live-|scene-store-))/, checks: [...STORE, "scene-command-validation", "media"], label: "store and collaboration", deploy: true },
];

export function selectVerification(changedFiles, { full = false } = {}) {
  const selected = new Set();
  const reasons = [];
  let deploy = false;
  for (const original of changedFiles) {
    const file = original.replaceAll("\\", "/");
    const smoke = VERIFY_SMOKES.find((s) => s.script === file);
    if (smoke) {
      selected.add(smoke.name);
      reasons.push({ file, rule: `changed check: ${smoke.name}` });
      continue;
    }
    // Split scenario wrappers import these shared harnesses. A harness change reruns
    // its complete family, while a wrapper-only change still selects just that wrapper.
    const harness = /^scripts\/smoke-(llmx-creation|llmx-conversation|ev3-lab|kidx-(?:missions|workshop|challenges|interactive|guidance|debrief))\.mjs$/.exec(file);
    if (harness) {
      for (const name of family(harness[1])) selected.add(name);
      reasons.push({ file, rule: `changed scenario family: ${harness[1]}` });
      continue;
    }
    const rule = RULES.find((candidate) => candidate.match.test(file));
    reasons.push({ file, rule: rule?.label ?? "shared or unclassified file: full suite" });
    if (!rule) full = true;
    deploy ||= rule?.deploy ?? true;
    for (const name of rule?.checks ?? []) selected.add(name);
  }
  if (deploy) for (const name of BASELINE) selected.add(name);
  for (const name of selected) {
    if (!VERIFY_SMOKES.some((smoke) => smoke.name === name)) throw new Error(`Unknown impact check: ${name}`);
  }
  const smokes = VERIFY_SMOKES.filter((smoke) => full || selected.has(smoke.name));
  return { mode: full ? "full" : smokes.length ? "targeted" : "static", deploy, smokes, reasons };
}

// Hosted CI executes only known Node contracts. Everything else stays in the local
// visual plan, including newly added checks; a full selection never opts into WebGL.
export function verificationExecution(smokes) {
  return {
    hosted: smokes.filter((smoke) => NODE_ONLY.has(smoke.name)),
    local: smokes.filter((smoke) => !NODE_ONLY.has(smoke.name)),
  };
}
