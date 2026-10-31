# GraphysX world service

A headless GraphysX world: the scene runtime (`AgentWorldRuntime` + Rapier WASM) stepped at a
fixed 1/60 s in Node, behind the [Clawblox](https://github.com/nacloos/clawblox) HTTP world
protocol, so Clawblox agents (AgentX's Eko) live in a GraphysX world unchanged. Design and
measurements (French): [`docs/WORLD_SERVICE_DESIGN.md`](../docs/WORLD_SERVICE_DESIGN.md).

Not deployed anywhere. The first world is the Clawblox Mesa island; `--world living-island`
(or `WORLD_ID=living-island`) runs the **living island**: Mesa unchanged plus a Living Forest,
a flock and a wind field, with the agent actions `GatherSeed`, `Sow` and `NextGeneration`
(French: [`docs/LIVING_ISLAND.md`](../docs/LIVING_ISLAND.md)).

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
| `island-world.ts` | fixed tick, characters, MoveTo/Jump/Stop/Pickup/Place/Throw, carry, rock impacts, observation, pose frames, exact snapshot/resume; the world registry (`mesa-island`, `living-island`) |
| `living-island.ts` | the living island: five founder `dna-tree`s, a `flock` shy of agents and thrown blocks, an invisible `force-field` wind, the GatherSeed/Sow/NextGeneration rules, their observation, `swarms` in pose frames and the living part of snapshots |
| `gardener.mjs` | a scripted, model-free agent that gathers a seed, sows it and advances a generation over HTTP |
| `index.ts` | the bundled world (rules + simulation, no I/O) |
| `server.mjs` | HTTP: `/join` `/observe` `/input` `/chat` `/chat/messages` `/api.md` `/snapshot` `/spectate` `/healthz` |
| `main.mjs` | CLI; honours `WORLD_ID` (`--world`) and `WORLD_HOST/PORT/RECORD/RECORD_DIR/RESUME_PATH/OPERATOR_TOKEN` and the image settings below; reads model payloads from `public/` |
| `image.mjs`, `image-sidecar.mjs` | the `/observe/image` contract, and the separate process that renders it in headless Chromium |
| `recording.mjs`, `replay.mjs` | a `--record` file as a seekable timeline, and the read-only replay server the viewer plays |
| `world.toml`, `API.md` | the Clawblox world manifest and the agent-facing API |
| `bench.mjs` | CPU cost and stream sizes |

## Endpoints beyond the agent loop

- `POST /world` with `X-Operator-Token` and `{"world": "living-island" | "mesa-island", "force"?: true}`:
  the world selector. It replaces the running island with a fresh one in the same process,
  refuses (409) while agents are joined unless `force` is true (their sessions end), sends
  unbound spectators a new `hello`. Each fresh island gets an `instanceId` UUID and records
  in `<record-root>/instances/<instanceId>/graphysx-recording.ndjson`. `/healthz` includes
  `{ok, tick, world, instanceId, recordingId, recording, checkpoint}`; `/api.md` follows the world.
  Optional `runId` binds the preparation to one request: repeating it on the current world
  returns the existing identity. Operator callers reconcile lost replies by that identity.

- `GET /snapshot` with `X-Operator-Token: $WORLD_OPERATOR_TOKEN`: the whole state, including
  Rapier's serialised solver. `--resume <file>` (or `WORLD_RESUME_PATH`) continues it bit for
  bit; the same `X-Session` tokens keep working. A snapshot of another world or rules version
  is refused. `WORLD_SNAPSHOT_PATH` enables atomic fsync checkpoints every
  `WORLD_SNAPSHOT_EVERY_MS` (default 60000). They include physics, sessions, identity, journal
  tail and a SHA-256 envelope verified before resume. `/healthz.checkpoint.lastSaved` names
  the tick, identity, digest and successful write time. Corrupt checkpoints fail startup.
  Set `WORLD_START_MODE=resume` to restore this file on service restart; a missing file is
  startup refusal, so recovery cannot silently become a fresh world. Initialize explicitly
  with `fresh` (default) or an existing native snapshot.
  Explicit `--resume` / `WORLD_RESUME_PATH` must exist. Legacy snapshots remain readable.
  Experiment preparation stays a fresh `POST /world`, independently of crash recovery.
- `GET /spectate` (SSE, read only): `hello` (the current v2 document and numeric id → entity
  id), `frame` 10 times a second (`[id, x, y, z, qx, qy, qz, qw]` per moving thing; on the
  living island also `swarms`: `[id, x, y, z, …]` with every flock member in flock-local space),
  `entities` when something is added or removed (an entity re-added under its id replaces its
  definition: a tree that grew or changed generation). At most 32 viewers; slow ones are dropped.
- `GET /spectate` also sends `action` (`{tick, agent, input, result, id, sequence, instanceId}`).
  On connection it sends a bounded tail (200 actions and 256 KiB maximum) after `hello`,
  before the first frame. Resume with `Last-Event-ID` or `?after=<id>`. IDs are opaque;
  current form is `<instanceId>:<generation>:<sequence>`. Deduplicate by `action.id`.
  `hello.journal` reports `generation`, `oldest`, `latest`, `limit`, `truncated` and `reset`.
  A restart creates a new journal generation because checkpoints can precede received
  actions: clear local actions on generation change or `reset`, then rebuild from the tail.
  Same-generation reconnects send strictly newer actions; an expired cursor reports a gap.
  `?instance=<UUID>` (or the runner's `X-World-Instance`) fences all live requests.
  A changed instance returns 409, even for the same world type; a bound live SSE ends
  at replacement. World-level unbound spectators can follow intentional world switches.
- `POST /leave` with `X-Session` releases only that member, including a held block.
  Inspection `agents[].attributes.Presence` is `active` after an agent request within
  120 seconds, otherwise `idle`. Spectator traffic never refreshes it; restored sessions
  start idle. An avatar alone is not proof of an active process.
- Pose frames remain at 10 Hz. Full inspection is sent in `hello`, the first frame,
  and once per simulated second; intermediate frames omit it. Consumers retain the last
  inspection and use poses for motion. Recordings follow the same optional-field contract.
  `/spectate` and `/healthz` answer any origin (`access-control-allow-origin: *`); the agent
  routes do not.
- `--record`: `<record-root>/instances/<instanceId>/graphysx-recording.ndjson` with the hello, frames, entity changes and every
  action with its `LastActionResult`. `node world-service/replay.mjs <dir> --port <p>` serves it
  read-only like `clawblox replay`: `/healthz`, `/spectate` (same events; a fresh `hello` after
  every seek), `/replay/info`, `/replay/actions`, and the shared transport `POST /replay/play`,
  `/pause`, `/seek?tick=`, `/speed?value=`, `/skip-idle?enabled=`. A resumed world appends a new
  hello to the same file; the replay follows the resumed timeline. A torn final line is
  retained as skipped data before the resume hello. Old recordings without new fields
  remain supported by `replay.mjs`.
- `GET /recordings/<recordingId>/healthz`, `/spectate`, `/replay/*` serve the selected
  recording through the existing replay protocol. Only opaque UUIDs under the configured
  recording root are accepted; there is no HTTP file-path parameter and no agent routes.
  Replay transport controls change playback only. Deploy behind the same spectator access
  boundary. Up to four replays share a total NDJSON byte budget equal to the archive limit;
  idle replays are retired for capacity or after five minutes (429 when active capacity is full).
  A connected spectator prevents idle eviction.
  File reads are asynchronous and bounded by its byte limit. Recordings still being
  written are a frozen view at opening; close/expire before opening a newer view.
- Recording uses asynchronous ordered writes: 8 MiB pending bytes maximum and 256 MiB
  per archive by default (`WORLD_RECORD_MAX_BYTES` configures archive/replay size).
  Hitting either limit stops recording explicitly, retains existing data and reports
  `recording.error` plus `ok:false` in health; simulation continues. No archive is deleted.
  Checkpoints flush the accepted recording bytes before becoming durable. Provision replay
  memory for parsed data (several times NDJSON size); the instance template uses 2 GiB.
  These are safety ceilings, not long-campaign capacity measurements. Qualify/tune capacity
  before long experiments rather than assuming a 27-hour synthetic projection is measured use.

Old GraphysX archives can be registered explicitly on the recording host without copying
or deleting them:

```sh
node world-service/register-recording.mjs --root /configured/recordings --directory /configured/recordings/old-directory --id <UUID>
```

This local command verifies containment and writes an immutable byte-count/SHA-256 binding.
The HTTP router verifies it before reading and labels its identity `registered-legacy`.
An existing identity cannot be reassigned; changed archives refuse. Bind the returned IDs
into the owning run's report via its existing dispatch identity. A legacy directory receipt
alone never substitutes the current live world. Large legacy archives remain usable with
`replay.mjs` under an appropriately provisioned operator process.

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
As in Clawblox, `POST /join` with an `X-Session` the world already knows returns that same
session (a runner reconnecting), never a second avatar.

## Containers

Two images, built from the repository root (each Dockerfile has its own `*.dockerignore`):

| Image | Dockerfile | Contents | Size (2026-10-29) |
|---|---|---|---|
| `graphysx-world` | `world-service/Dockerfile` | Node 22 slim, `dist/world.js`, the server, replay and recording modules; no `node_modules`, no browser | 332 MB |
| `graphysx-world-images` | `world-service/Dockerfile.images` | the image sidecar: the built site, Playwright at the repository's version and its Chromium headless shell only | 1.55 GB |

```bash
docker build -f world-service/Dockerfile -t graphysx-world:<rev> .
docker build -f world-service/Dockerfile.images -t graphysx-world-images:<rev> .
WORLD_HOST_PORT=18150 docker compose -f world-service/compose.yaml up --build   # local test
```

- The world container uses the stable root `/data/recordings`, with a UUID directory per
  island; `WORLD_RECORD_DIR` overrides the root. A crash resume appends to that instance. It runs as uid 1000.
- Images are off unless `WORLD_IMAGES=1` with `WORLD_IMAGE_SIDECAR` (the sidecar's address)
  and `WORLD_IMAGE_SOURCE` (the world as the sidecar sees it), as `compose.yaml` sets them.
- Model payloads are not in the image (`publicDir: false`): Mesa needs none. A world with models
  would mount `public/` next to `world-service/`.
- Replay: `docker run … graphysx-world:<rev> node world-service/replay.mjs /recording --host 0.0.0.0 --port 18121`
  with a recording directory mounted read-only.
- The household deployment (UGFrank, behind Caddy) lives in agentx-home
  `instance/graphysx-world/`.

Measured on devX with `compose.yaml` (world `cpus: 1`, sidecar `cpus: 4`): the Clawblox kit's
model-free smoke (`integrations/island/smoke_island.py` in AgentX) passes; first image 11.8 s,
then 3.3 s per 1088x640 image and 0.5 s at 320x180; memory 101 MB (world) and 470 MB (sidecar).

## Physics seams it relies on

The rules touch physics only through public seams, also usable by other hosts:
`AgentWorldRuntime.hostBody`, `hostRestoreClock`, `applyHostPoses` (for a viewer) and
`PhysicsEngine.setBodyMotion`, `setBodyCollision`, `writeKinematicTarget`, `overlapsBox`,
`readContacts`, `createCharacter`/`moveCharacter`, `saveState`/`stateId`/`restoreState`.
Without a page, canvas-drawn textures (particles, water, surfaces) become inert stand-ins
(`src/headless.ts`) and `setAgentWorldAssetFetch` lets model collision load from disk.
