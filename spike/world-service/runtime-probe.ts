// Headless probe: can the browser scene runtime (AgentWorldRuntime) construct and step in Node?
import { AgentWorldRuntime } from "../../src/agent-world-runtime";

const island = {
  schema: "graphysx.agent-world/v2",
  id: "probe-island",
  label: "Probe island",
  environment: { ground: { visible: false } },
  entities: [
    { id: "ground", type: "box", transform: { position: [0, -5, 0], scale: [60, 10, 60] }, physics: { mode: "static" } },
    { id: "block-red", type: "box", transform: { position: [4, 3, 0], scale: [0.75, 0.75, 0.75] }, physics: { mode: "dynamic", mass: 1 } },
    { id: "rock", type: "sphere", geometry: { radius: 1 }, transform: { position: [-4, 6, 2] }, physics: { mode: "dynamic", mass: 5 } },
    { id: "eko", type: "agent", transform: { position: [0, 1, 0] } },
  ],
};

const t0 = performance.now();
const runtime = new AgentWorldRuntime(island as never);
const t1 = performance.now();
const r = runtime.step(3);
const t2 = performance.now();
const state = runtime.query({ ids: ["block-red", "rock", "eko"] });
console.log(JSON.stringify({ constructMs: +(t1 - t0).toFixed(1), step3sMs: +(t2 - t1).toFixed(1), stepOk: r.ok, entities: state.map((e: any) => ({ id: e.id, position: e.transform?.position ?? e.position })) }, null, 1));
