# GraphysX world service: feasibility spike

Design and findings (French): [`docs/WORLD_SERVICE_DESIGN.md`](../../docs/WORLD_SERVICE_DESIGN.md).

A headless GraphysX world: the browser scene runtime (`AgentWorldRuntime` + Rapier WASM)
stepped at a fixed 1/60 s in Node, with a Clawblox-compatible character and action layer
(Mesa island rules) behind Clawblox's HTTP world protocol. Spike code: not wired into the
product build, `npm` scripts, hosted CI or deployment.

| File | Role |
|---|---|
| `mesa-island.ts` | Clawblox Mesa island as an `agent-world/v2` document + Clawblox names/attributes |
| `island-world.ts` | fixed tick, Rapier character controller, MoveTo/Jump/Stop/Pickup/Place/Throw, observation, pose frames |
| `runtime-access.ts` | **spike-only** casts into private runtime/adapter fields; each names the seam to add |
| `world-server.ts` | HTTP: `/join` `/observe` `/input` `/chat` `/chat/messages` `/api.md` `/snapshot` `/spectate` `/healthz` |
| `main.ts` | CLI; honours `WORLD_HOST/PORT/RECORD/RECORD_DIR/OPERATOR_TOKEN` |
| `world.toml`, `API.md` | lets `clawblox run` start this as an external world |
| `runtime-probe.ts`, `runtime-breadth-probe.ts` | does the scene runtime construct and step in Node? |
| `world-service.test.mjs` | 6 checks: shape vs a real Mesa observation, settling, walking, jump, carry/place/throw, HTTP + SSE |
| `bench.mjs` | ms per tick with N wandering agents, frame and observation sizes |
| `fixtures/mesa-island-observe.json` | real `GET /observe` from `clawblox run worlds/mesa-island` (2026-10-29) |

```bash
# from the repository root, after npm ci
node spike/world-service/build.mjs
node --test spike/world-service/world-service.test.mjs
node spike/world-service/bench.mjs 1 4 8 16
node spike/world-service/.build/main.js --port 18120 --record --record-dir /tmp/island-rec
clawblox run spike/world-service --port 18122
```

Type check (needs `@types/node`, which is not a repository dependency):

```bash
npm i --prefix /tmp/gxws-types @types/node@22
npx tsc -p spike/world-service/tsconfig.json --noEmit \
  --typeRoots /tmp/gxws-types/node_modules/@types,./node_modules/@types,./node_modules
```

The tests live here rather than in `test/` because they need the Vite bundle first, which
the hosted gate does not build.
