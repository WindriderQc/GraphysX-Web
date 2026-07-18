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
store other than `http://localhost:8788`.

The showroom still composes first, so if the store is down or the scene is missing you get
the normal welcome scene and a console warning rather than an empty world.

## Putting a scene in the store

From a tab that has one open (console):

```js
__GRAPHYSX_SCENE_STORE__.session.push()      // push what is on screen
__GRAPHYSX_SCENE_STORE__.session.pull()      // discard local, take the store's copy
```

Or from a file:

```bash
npm run scene -- seed welcome --from my-scene.json
```

## The agent surface

`tools/graphysx-scene-agent.mjs` is what Hermes calls — as a CLI or as a library.

```bash
npm run scene -- list
npm run scene -- spawn welcome --type box --id hermes-cube --at 1.6,6,0 --color '#ff5470' --mass 1.1
npm run scene -- remove welcome hermes-cube
npm run scene -- edit welcome '[{"op":"spawn","entity":{"type":"sphere","id":"ball","physics":{"mode":"dynamic","mass":1}}}]'
```

```js
import { editScene } from "./tools/graphysx-scene-agent.mjs";

await editScene("http://localhost:8788", "welcome", [
  { op: "spawn", entity: { id: "panel", type: "box", transform: { position: [0, 2, 0] } } },
]);
```

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

## What this deliberately is not

Reloading the whole document on every remote change drops physics state — a ball mid-flight
restarts. That is fine while the human and the agent are not acting in the same second, and
it is exactly what milestone B (a relay with live deltas) and C (shared physics authority)
fix. This rung exists to make the Telegram → Hermes → visible change loop real before any of
that gets built.

There is no auth. Run it behind the same boundary as any other LAN service.

## Verified by

`npm run smoke:scene-store` (also in `npm run verify`) drives the whole loop: seed a scene,
open it in a headless browser, have an out-of-process agent spawn an entity, and assert it
appears in the tab — then remove it and assert it disappears.
