# Scene store — sharing a scene with an agent

Milestone A of the shared-scene ladder: a scene lives on a server instead of in one
browser's localStorage, so an agent on another machine can change what you are looking at.

```
Telegram ──▶ Hermes ──▶ scene store (HTTP)  ◀──poll── browser tab (?scene=…)
                         whole v2 documents                 Quest later
                         + a revision
```

## Running it

```bash
npm run serve:scenes     # store on :8788, scenes in .graphysx-store/scenes
npm run dev              # then open http://localhost:5173/?scene=welcome
```

`?scene=<name>` opens a stored scene and polls it every 2s. `?store=<url>` points at a
store other than `http://localhost:8788`. A one-time `#storeToken=<token>` fragment gives
the tab a token when the store requires one (see Auth below).

The showroom still composes first, so if the store is down or the scene is missing you get
the normal welcome scene and a console warning rather than an empty world.

## The scene browser

When a store answers, a panel mounts in the top-right listing every stored scene with its
object count, revision and who last touched it. Click a row to open that scene, **Save to
store** to push what you have, **Revert** to take the store's copy back.

It only mounts when the store actually responds — the production deploy is static with no
store behind it, and a permanently offline panel on the front door would be noise.

When someone else writes to the scene you are standing in, the panel says who and what:

> **hermes** added a red cube · rev 2

That line is the reason attribution exists. With Hermes, OpenClaw and AgentX sharing a
scene, "revision 14" tells you nothing; the actor does.

A save that collides with an agent's write reports the conflict in those terms — *someone
else changed this scene* — rather than a generic failure.

## Putting a scene in the store

Use **Save to store** in the panel, or from a file:

```bash
npm run scene -- seed welcome --from my-scene.json
```

The panel's API is also on `window.__GRAPHYSX_SCENE_BROWSER__` (`open`, `save`, `refresh`,
`session()`) for driving it from the console.

## The agent surface

`tools/graphysx-scene-agent.mjs` is what Hermes calls — as a CLI or as a library.

```bash
npm run scene -- list
npm run scene -- spawn welcome --type box --id hermes-cube --at 1.6,6,0 --color '#ff5470' --mass 1.1 --actor hermes
npm run scene -- remove welcome hermes-cube --actor hermes
npm run scene -- edit welcome '[{"op":"spawn","entity":{"type":"sphere","id":"ball","physics":{"mode":"dynamic","mass":1}}}]' --actor hermes --intent 'dropped a ball'
```

```js
import { editScene } from "./tools/graphysx-scene-agent.mjs";

await editScene(
  "http://localhost:8788",
  "welcome",
  [{ op: "spawn", entity: { id: "panel", type: "box", transform: { position: [0, 2, 0] } } }],
  { actor: "hermes", intent: "added a status panel" },
);
```

Pass `actor` (and optionally `intent`) on every write — it is what the browser puts on
screen. Without it, writes show up as `agent`.

`edit` is the real agent entry point: raw `AgentWorldCommand` JSON, which an LLM can emit
directly. Supported ops are `spawn`, `update`, `remove`, `set-environment` — the subset that
means something to a document with no simulation running. `interact` and the behavior ops
need a live world and stay on the in-page bridge (`__GRAPHYSX_AGENT_BRIDGE__`).

## Living a scene vs. authoring one

These are different acts and the code now says so.

- **Authoring** — the editor, and anything an agent writes to the store. Persists.
- **Living** — inhabiting a scene: throwing a ball, clicking the stack. Session-only.

An entity spawned while living carries `ephemeral: true`. It is fully real at runtime —
physics, interactions, undo all treat it normally — but `exportDocument()` drops it, so it
never reaches a save or the store, and it is gone on the next load.

```js
api.spawn({ type: "sphere", ephemeral: true, physics: { mode: "dynamic", mass: 1 } })

api.export()          // runtime snapshot — includes it
api.exportDocument()  // the scene document — does not
api.save(name)        // stores the document
```

The welcome showroom is the clearest case: its dropped balls are ephemeral, so the scene
you return to is the one that was authored, not the one the last visitor left behind.

Two guards keep the invariant from drifting:

- The store rejects any document containing `ephemeral` entities (400) — a client that
  pushes `export()` where it meant `exportDocument()` gets told, rather than silently
  polluting the scene.
- The agent tool refuses to spawn an ephemeral entity into the store. Throwing something
  into a scene someone is *living* in has no document to land in; that is a live-channel
  act and arrives with milestone B.

`export()` stays full-fidelity because `transaction()` and `undo()` snapshot through it —
filtering there would make undo delete every ball in flight.

## Concurrency

Every write is guarded by `expectedRevision`; a stale write gets a 409 with the current
revision rather than clobbering. `editScene()` re-reads and retries up to 3 times, so two
agents editing the same scene converge instead of fighting. This mirrors the runtime's own
in-page check (`agent-world-runtime.ts:835`).

## Auth

Two modes, chosen by whether `GRAPHYSX_STORE_TOKEN` is set when the store starts.

**Open (default).** No token, no auth — exactly the store as it has always run. The server
says so at startup (`UNAUTHENTICATED MODE … LAN boundary only`) so nobody discovers it by
accident. Run it behind the same boundary as any other LAN service and never port-forward
it in this mode.

**Token.** Set `GRAPHYSX_STORE_TOKEN=<secret>` and every mutating route (`PUT /scenes/:name`,
`POST /scenes/:name/changes`, `POST /assets/import`, `POST /assets/upload`,
`DELETE /assets/:id`) and everything under `/datalake` requires it. Read-only scene and
asset GETs stay open in both modes — a stored scene is the shareable artifact. The datalake
is personal media, so even listing it is guarded.

Two HTTP headers present the token:

- `Authorization: Bearer <token>` — what `tools/graphysx-scene-agent.mjs` sends when the
  same env var is set on the client side.
- `x-graphysx-token: <token>` — what the browser clients send. Bootstrap a tab with
  `#storeToken=<token>`, or hand `{ token }` to `createSceneStoreClient`. The fragment is
  never sent in HTTP or Referer headers; the app moves it into tab-scoped sessionStorage
  and scrubs it from the visible URL. The public scene event stream receives no token.

A missing or wrong token gets a `401` with a JSON error body. Comparison is constant-time.

```bash
# open mode — as before
curl -X PUT localhost:8788/scenes/welcome -d @scene.json

# token mode
export GRAPHYSX_STORE_TOKEN=s3cret
node server/scene-store.mjs                     # server side
curl -H "Authorization: Bearer s3cret" -X PUT localhost:8788/scenes/welcome -d @scene.json
npm run scene -- list                           # the tool reads the env var itself
```

**CORS.** Unset, every response carries `access-control-allow-origin: *` — compat with
today. Set `GRAPHYSX_STORE_ORIGIN` to a comma-separated allowlist
(`GRAPHYSX_STORE_ORIGIN=http://localhost:5173,https://graphysx.example`) and the store
echoes the request's Origin only when it matches, sends no allow-origin header when it
does not, and adds `vary: origin`. Note the browser sends `*`-mode requests fine today
precisely because nothing needs credentials; if you set a token for a browser client,
set the allowlist too.

**Datalake.** The root comes from `GRAPHYSX_DATALAKE_DIR` and nowhere else — the old
hardcoded `E:\Media\Datalake` fallback is gone. Unset, `/datalake`, `/datalake/file` and
`/assets/import` answer `503 {"error":"datalake not configured (set GRAPHYSX_DATALAKE_DIR)"}`.

## What this deliberately is not

Reloading the whole document on every remote change drops physics state — a ball mid-flight
restarts. That is fine while the human and the agent are not acting in the same second, and
it is exactly what milestone B (a relay with live deltas) and C (shared physics authority)
fix. This rung exists to make the Telegram → Hermes → visible change loop real before any of
that gets built.

The token is one shared secret, not accounts: it says "allowed to write", not "who".
Attribution stays on `actor`, which remains self-reported. Transport is plain HTTP — on
anything wider than a LAN, put TLS in front or the token travels in the clear.

## Verified by

`npm run smoke:scene-store` (also in `npm run verify`) drives the whole loop: seed a scene,
open it in a headless browser, have an out-of-process agent spawn an entity, and assert it
appears in the tab — then remove it and assert it disappears.

`node scripts/smoke-store-auth.mjs` covers the auth section above, node-only: 401 without
or with a wrong token, writes with either header, reads staying open, the datalake gate,
the CORS allowlist, the 503 when no datalake is configured, and that a tokenless store
still behaves exactly as before.
