# GraphysX world service

A headless GraphysX world: the scene runtime (`AgentWorldRuntime` + Rapier WASM) stepped at a
fixed 1/60 s in Node, behind the [Clawblox](https://github.com/nacloos/clawblox) HTTP world
protocol, so Clawblox agents (AgentX's Eko) live in a GraphysX world unchanged. Design and
measurements (French): [`docs/WORLD_SERVICE_DESIGN.md`](../docs/WORLD_SERVICE_DESIGN.md).

Not deployed anywhere. The first world is the Clawblox Mesa island.

```bash
npm run build:world-service            # world-service/dist/world.js
npm run serve:world -- --port 18120    # or: node world-service/main.mjs --port 18120
clawblox run world-service --port 18122  # Clawblox starts it as an external world
node world-service/bench.mjs 1 4 8 16  # ms per tick, frame/observation/snapshot sizes
node --test test/world-service.test.mjs
```

| File | Role |
|---|---|
| `mesa-island.ts` | the Mesa island as an `agent-world/v2` document, with Clawblox names, attributes and physical properties |
| `island-world.ts` | fixed tick, characters, MoveTo/Jump/Stop/Pickup/Place/Throw, carry, rock impacts, observation, pose frames, exact snapshot/resume |
| `index.ts` | the bundled world (rules + simulation, no I/O) |
| `server.mjs` | HTTP: `/join` `/observe` `/input` `/chat` `/chat/messages` `/api.md` `/snapshot` `/spectate` `/healthz` |
| `main.mjs` | CLI; honours `WORLD_HOST/PORT/RECORD/RECORD_DIR/RESUME_PATH/OPERATOR_TOKEN`; reads model payloads from `public/` |
| `world.toml`, `API.md` | the Clawblox world manifest and the agent-facing API |
| `bench.mjs` | CPU cost and stream sizes |

## Endpoints beyond the agent loop

- `GET /snapshot` with `X-Operator-Token: $WORLD_OPERATOR_TOKEN`: the whole state, including
  Rapier's serialised solver. `--resume <file>` (or `WORLD_RESUME_PATH`) continues it bit for
  bit; the same `X-Session` tokens keep working. A snapshot of another world or rules version
  is refused.
- `GET /spectate` (SSE, read only): `hello` (the current v2 document and numeric id → entity
  id), `frame` 10 times a second (`[id, x, y, z, qx, qy, qz, qw]` per moving thing), `entities`
  when something is added or removed. At most 32 viewers; slow ones are dropped.
- `--record`: `graphysx-recording.ndjson` with the hello, frames, entity changes and every
  action with its `LastActionResult`.

Agent-visible payloads only carry simulation time (chat timestamps count from 2000-01-01).

## Physics seams it relies on

The rules touch physics only through public seams, also usable by other hosts:
`AgentWorldRuntime.hostBody`, `hostRestoreClock`, `applyHostPoses` (for a viewer) and
`PhysicsEngine.setBodyMotion`, `setBodyCollision`, `writeKinematicTarget`, `overlapsBox`,
`readContacts`, `createCharacter`/`moveCharacter`, `saveState`/`stateId`/`restoreState`.
Without a page, canvas-drawn textures (particles, water, surfaces) become inert stand-ins
(`src/headless.ts`) and `setAgentWorldAssetFetch` lets model collision load from disk.
