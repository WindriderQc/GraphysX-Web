// Breadth probe: which scene features construct and step headless, and which need a DOM?
import { AgentWorldRuntime, GRAPHYSX_AGENT_DEMO_WORLD } from "../../src/agent-world-runtime";
import { GRAPHYSX_AGENT_WORLD_STARTERS } from "../../src/agent-world-starters";
import { readFileSync } from "node:fs";

const results: Record<string, unknown> = {};
function attempt(name: string, fn: () => unknown) {
  try { results[name] = { ok: true, detail: fn() }; }
  catch (error) { results[name] = { ok: false, error: String((error as Error)?.message ?? error).slice(0, 160) }; }
}

attempt("demo-world", () => { const r = new AgentWorldRuntime(GRAPHYSX_AGENT_DEMO_WORLD); r.step(2); return r.query({}).length; });
attempt("dominus-village(models)", () => {
  const def = JSON.parse(readFileSync("scenes/dominus-village.json", "utf8"));
  const r = new AgentWorldRuntime(def.definition ?? def.document ?? def); r.step(1); return r.query({}).length;
});
for (const starter of GRAPHYSX_AGENT_WORLD_STARTERS) {
  attempt(`starter:${starter.id}`, () => { const r = new AgentWorldRuntime(); const res = r.loadStarter(starter.id as never); if (!res.ok) throw new Error(JSON.stringify(res.error ?? res).slice(0, 160)); r.step(2); return r.query({}).length; });
}
console.log(JSON.stringify(results, null, 1));
