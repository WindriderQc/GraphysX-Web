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
node world-service/replay.mjs recordings --port 18131   # replay a --record directory read-only
node --test test/world-service.test.mjs test/world-replay.test.mjs
```

View it in the island viewer (`?app=island`, docs/ISLAND_VIEW.md): `source=` names the world
or the replay server, for example `http://localhost:5173/?app=island&source=http://127.0.0.1:18120&agent=Eko`.

| File | Role |
|---|---|
| `mesa-island.ts` | the Mesa island as an `agent-world/v2` document, with Clawblox names, attributes and physical properties |
| `island-world.ts` | fixed tick, characters, MoveTo/Jump/Stop/Pickup/Place/Throw, carry, rock impacts, observation, pose frames, exact snapshot/resume |
| `index.ts` | the bundled world (rules + simulation, no I/O) |
| `server.mjs` | HTTP: `/join` `/observe` `/input` `/chat` `/chat/messages` `/api.md` `/snapshot` `/spectate` `/healthz` |
| `main.mjs` | CLI; honours `WORLD_HOST/PORT/RECORD/RECORD_DIR/RESUME_PATH/OPERATOR_TOKEN` and the image settings below; reads model payloads from `public/` |
| `image.mjs`, `image-sidecar.mjs` | the `/observe/image` contract, and the separate process that renders it in headless Chromium |
| `recording.mjs`, `replay.mjs` | a `--record` file as a seekable timeline, and the read-only replay server the viewer plays |
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
- `GET /spectate` also sends `action` (`{tick, agent, input, result}`) for every agent action.
  `/spectate` and `/healthz` answer any origin (`access-control-allow-origin: *`); the agent
  routes do not.
- `--record`: `graphysx-recording.ndjson` with the hello, frames, entity changes and every
  action with its `LastActionResult`. `node world-service/replay.mjs <dir> --port <p>` serves it
  read-only like `clawblox replay`: `/healthz`, `/spectate` (same events; a fresh `hello` after
  every seek), `/replay/info`, `/replay/actions`, and the shared transport `POST /replay/play`,
  `/pause`, `/seek?tick=`, `/speed?value=`, `/skip-idle?enabled=`. A resumed world appends a new
  hello to the same file; the replay follows the resumed timeline.

## First-person images (`GET /observe/image`)

Same contract as Clawblox: `X-Session`, optional `width`/`height` (default 1088x640, clamped to
64..1920 x 64..1080), the agent's eye (player + 2 studs) along its forward direction, 105°
horizontal field of view. The agent's own avatar is hidden (the eye is inside it).

The world process never loads a browser. It posts the camera to an image sidecar
(`image-sidecar.mjs`), a separate Node process that starts one headless Chromium on the first
request, shared by all agents, and keeps one camera page per world: the island viewer itself in
camera mode (`?app=island&embed=1&capture=1&source=<world>`), following `/spectate`. Between
captures that page's frame loop is suspended (`PlatformHost.setFramesSuspended`), so an idle
camera costs nothing; Chromium closes after 5 idle minutes.

| Setting | Effect |
|---|---|
| (default) | `main.mjs` starts the sidecar as a child on the first image request; it serves the built site (`npm run build` -> `dist/`) itself |
| `--image-viewer <url>` / `WORLD_IMAGE_VIEWER` | camera pages come from that GraphysX-Web (for example a Vite dev server) instead of `dist/` |
| `--image-sidecar <url>` / `WORLD_IMAGE_SIDECAR` | use an already running sidecar (`node world-service/image-sidecar.mjs --port <p>`), for example another container |
| `WORLD_IMAGE_SOURCE` | the world's address as the sidecar sees it (default: this process on loopback) |
| `--no-images` / `WORLD_IMAGES=0` | `/observe/image` answers 503 |

Measured on devX (8 vCPU, software WebGL), 2026-10-29: first request 9 to 15 s (Chromium and the
page start), then about 2.6 s and 14 CPU-seconds per 1088x640 image, 0.6 s and 3.4 CPU-seconds
at 320x180; 0.06 CPU-second per idle second; about 1 GB resident for the browser.

Agent-visible payloads only carry simulation time (chat timestamps count from 2000-01-01).

## Physics seams it relies on

The rules touch physics only through public seams, also usable by other hosts:
`AgentWorldRuntime.hostBody`, `hostRestoreClock`, `applyHostPoses` (for a viewer) and
`PhysicsEngine.setBodyMotion`, `setBodyCollision`, `writeKinematicTarget`, `overlapsBox`,
`readContacts`, `createCharacter`/`moveCharacter`, `saveState`/`stateId`/`restoreState`.
Without a page, canvas-drawn textures (particles, water, surfaces) become inert stand-ins
(`src/headless.ts`) and `setAgentWorldAssetFetch` lets model collision load from disk.
