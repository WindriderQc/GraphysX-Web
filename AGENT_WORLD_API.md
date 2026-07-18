# GraphysX Agent World API v2

GraphysX exposes a renderer-independent scene contract at `window.__GRAPHYSX__`. An AI agent can create a world, place reusable 3D prefabs, edit with atomic command batches, collaborate through revision-guarded actor commits, inspect serializable state, control deterministic time, and persist snapshots without manipulating Three.js objects.

Open **Build With Agent World API** from the home screen, or call `window.__GRAPHYSX__.open()`.

## Human UI parity

The visible **World Editor** and `window.__GRAPHYSX__` are two interfaces over one runtime. A person can select entities from the outliner; create primitives, semantic agent participants, groups, lights, recovered models, and splines; add static, dynamic, or kinematic physics; choose recovered textures; edit transforms, materials, hierarchy, tags, interactions, and behaviors; remove entities; and save or restore named snapshots. Starter worlds, prefabs, pause, deterministic step, undo, and clear remain available as direct controls.

The **Advanced JSON Workbench** completes the parity surface. It accepts a full `graphysx.agent-world/v2` document, an atomic command array, or a revision-guarded actor change set. The editor does not keep a separate UI scene model: every button calls the same validated runtime method and produces the same revision, receipt, event, rollback, and error an agent receives.

Selection is shared too. A person can click an entity directly in the 3D viewport or its outliner row; an agent can call `gx.select(["entity-id"])`. The same stable selection opens the inspector and attaches snapped move, rotate, or scale handles. Dragging a handle commits an ordinary validated `update()` on release. Use W/E/R to switch tools and choose world or local space from the compact toolbar.

This means a collaboration can move in either direction without conversion:

```js
// A person creates or edits an entity in the World Editor.
const crate = gx.query({ ids: ["shared-crate"] })[0];

// An agent continues from the exact UI-authored revision.
gx.update(crate.id, { tags: [...crate.tags, "reviewed-by-agent"] });

// The outliner and inspector immediately show the agent's edit.
```

`query()`, `state()`, and `observe()` expose current transform, material, geometry, light intensity/distance, shadows, physics and velocity, path summary, model loading status, behaviors, interactions, hierarchy, tags, and visibility. Use `export()` when the full spline points or complete portable definition are needed.

## Portable world files

The visible editor's **Download JSON** button writes the complete current `graphysx.agent-world/v2` document as `<world-id>.graphysx.json`. **Import JSON / XML** reads that format or migrates an archived GraphysX serializer XML scene into the same validated v2 runtime. Unsupported custom meshes remain labeled visible proxies and the import reports conversion warnings instead of silently inventing assets. Files are limited to 5 MB in the browser UI.

The API equivalents are `gx.export()`, `gx.create(definition)` (or `gx.load(definition)`), and `gx.importLegacyXml(xml, options)`. This makes the file a straightforward handoff format between a person, an agent, source control, and another GraphysX session.

## External agent bridge

`window.__GRAPHYSX_AGENT_BRIDGE__` is a lightweight adapter for agent hosts that prefer discoverable async tools over direct calls. It wraps the exact same World API and named-level API; it is not a second runtime.

```js
const bridge = window.__GRAPHYSX_AGENT_BRIDGE__;
const manifest = bridge.manifest();

await bridge.call("levels.region", "moon-base", { x: 0, y: 0, width: 8, height: 8 });
await bridge.call("select", ["shared-crate"]);

const unsubscribe = bridge.subscribe((event) => {
  console.log(event.type, event.state.revision);
});
```

The manifest uses `graphysx.agent-tool-bridge/v1` and describes every callable path, whether it mutates state, positional-array arguments, schemas, coordinate convention, and available transports. `request()` accepts a structured request and always returns a structured success/error response.

Same-origin frames and browser integrations can also use `window.postMessage`:

```js
window.postMessage({
  schema: "graphysx.agent-tool-request/v1",
  id: "observe-1",
  method: "observe",
  args: [{ tag: "interactive" }]
}, window.location.origin);
```

Responses use `graphysx.agent-tool-response/v1`. World changes are published as `graphysx.agent-tool-event/v1` messages and as the `graphysx:agent-world-state` DOM event. The message transport accepts same-origin callers only; direct `bridge.call()` is simplest for code already running inside GraphysX.

### External process / LLM tool host

`tools/graphysx-agent-stdio.mjs` is the small out-of-browser adapter. It launches one Playwright-hosted GraphysX page and forwards the same structured bridge requests over JSON Lines. `--stdio` keeps one agent-owned world session alive across many calls; there is no second scene model or server protocol.

```bash
# Discover tools from a running GraphysX development server.
npm run agent:manifest -- --url http://127.0.0.1:4177/

# Keep one world alive; send one request per stdin line.
npm run agent:stdio -- --url http://127.0.0.1:4177/
```

Each input line is a `graphysx.agent-tool-request/v1` object such as `{"id":"observe-1","method":"observe","args":[{"tag":"physics"}]}`. Each output line is the ordinary structured response, which is easy to wrap as an LLM tool, MCP server, shell process, or test harness.

## Fastest start

For a useful scene immediately, list the curated starter worlds and load one. A starter is only a convenient composition of regular v2 lights and prefabs, so every generated entity stays editable, queryable, and exportable.

```js
const gx = window.__GRAPHYSX__;

gx.starters();
gx.loadStarter("glow-garden");
```

Available starters are `prefab-plaza` (43 entities), `glow-garden` (45), `signal-outpost` (41), the playable `signal-trail` (45), and `physics-sketchbook` (16). The sketchbook demonstrates textured ramps, mass, restitution, collision, impulse interaction, coordinates, orbit, and a visible semantic agent. Pass `{ id, label }` as the optional second argument when the new world needs application-specific identity.

`gx.textures()` discovers the eleven stable recovered texture IDs, their source family, browser URL, usage guidance, and repeat defaults. A material stores the stable ID plus repeat, offset, and rotation so world files remain readable and portable.

```js
gx.spawn({
  id: "measured-ramp",
  type: "box",
  geometry: { width: 8, height: 0.4, depth: 3 },
  transform: { position: [0, 2, 0], rotationDegrees: [0, 0, -12] },
  material: {
    color: "#ffffff",
    roughness: 0.7,
    texture: { id: "checker", repeat: [4, 2], offset: [0, 0], rotationDegrees: 0 }
  },
  physics: { mode: "static", material: "ground" }
});
```

Stable texture IDs are `checker`, `green-grid`, `abstract-cubes`, `two-way`, `eroded-metal`, `rusted-metal`, `marble`, `wood-floor`, `worn-wood`, `earth`, and `spheres`.

## Primitives, agents, archive models, splines, and physics

The old XML-era GraphysX scene builder distinguished primitive/custom meshes from physical primitive/custom meshes and carried mass, Newton material, transform, and mesh-controlled state. The v2 agent contract keeps those meanings as optional properties on one JSON entity instead of restoring the old serializer classes.

`assets()` lists complex models that are already converted and loadable. A model may also use a same-origin `asset.url` with `format: "graphysx-mesh-json"`.

```js
gx.assets();

gx.spawn({
  id: "archive-cottage",
  type: "model",
  asset: { id: "port-cottage", fitSize: 5.5 },
  geometry: { width: 5, height: 4, depth: 4 }, // physics box
  transform: { position: [-4, 2, 0] },
  physics: { mode: "static", material: "wall" }
});

gx.spawn({
  id: "ball",
  type: "sphere",
  geometry: { radius: 0.6 },
  transform: { position: [3, 7, 0] },
  physics: {
    mode: "dynamic",
    mass: 1.4,
    material: "ball",
    restitution: 0.7,
    linearVelocity: [-1, 0, 0]
  }
});
```

Physics modes are `static`, `dynamic`, and `kinematic`, for primitives and complex models alike. Model rigid bodies use the agent-supplied `geometry.width/height/depth` as a predictable box collider. Materials are `default`, `wall`, `finish`, `ground`, `ball`, and `human`; friction and restitution can be overridden per entity. Set world gravity with `environment.physics.gravity`. Physics is real rigid-body simulation, and `query()`/`state()` report current velocity and sleep state. Physics entities stay at the world root so their transform has one unambiguous coordinate space.

An entity with `type: "agent"` is a visible participant with a serializable role, status, perception radius, and semantic capability list. This describes who or what is present in a shared spatial explanation; it does not run arbitrary scripts or create a second AI runtime.

Splines are visible, queryable entities. A `follow-spline` behavior references one by stable ID; entities driven by both a path and physics use `kinematic` mode—the modern equivalent of the archived mesh-controlled flag.

```js
gx.transaction([
  { op: "spawn", entity: {
    id: "flight-path",
    type: "spline",
    path: {
      points: [[-6, 2, 4], [-3, 4, -4], [3, 3, -5], [6, 2, 4]],
      closed: true,
      tension: 0.5
    },
    material: { color: "#55e9ff" }
  } },
  { op: "spawn", entity: {
    id: "path-sword",
    type: "model",
    asset: { id: "zoksword", fitSize: 2 },
    geometry: { width: 2, height: 0.4, depth: 0.6 },
    physics: { mode: "kinematic", material: "wall" },
    behaviors: [{
      type: "follow-spline",
      splineId: "flight-path",
      speed: 3,
      loop: true,
      orientToPath: true
    }]
  } }
]);

gx.pause(true);
gx.step(1); // deterministic spline and rigid-body advance
```

### Play Signal Trail

Signal Trail is a tiny experience built only from normal v2 entities, tags, prefabs, and interactions. Three beacon lenses begin dormant; awaken all three to stabilize the portal. Humans click them in 3D while agents discover and operate the same controls semantically.

```js
gx.loadStarter("signal-trail");

const signals = gx.query({ tag: "signal-node" });
signals.forEach((signal) => gx.interact(signal.id));

const powered = gx.query({ tag: "signal-energy" })
  .filter((entity) => entity.visible);
```

The Studio derives its `0 / 3` through `3 / 3` objective display from those ordinary visibility states; there is no hidden quest state or special script.

## Manage many playable levels

`gx.levels` exposes the BallZ map editor as a named, revisioned level library. ASCII is a compact import/export adapter; the canonical `graphysx.agent-level/v1` document keeps semantic tiles, dimensions, cell size, and revision independently of any one text encoding.

The library includes **The Funny Zigzagger** as a complete editable example. It uses ordinary `fire` and `ice` tiles: fire repels and launches the player, while ice attracts the player and preserves ground momentum. Both the vocabulary and its meaning are discoverable at runtime.

```js
gx.levels.tiles;
// ["floor", "wall", "start", "ring", "half", "finish", "hazard", "fire", "ice"]

gx.levels.tileSemantics.fire;
// "Repulsive force that launches upward"

gx.levels.open("funny-zigzagger"); // inspect or paint it in the shared editor
gx.levels.play("funny-zigzagger"); // play the exact same level document
```

```js
gx.levels.create({
  id: "moon-base",
  label: "Moon Base",
  width: 24,
  height: 18,
  cellSize: 2.8
});

gx.levels.transaction("moon-base", [
  { op: "fill", rect: { x: 0, y: 0, width: 24, height: 1 }, tile: "wall" },
  { op: "patch", changes: [
    { x: 12, y: 16, tile: "start" },
    { x: 12, y: 2, tile: "half" },
    { x: 12, y: 17, tile: "finish" },
    { x: 7, y: 9, tile: "ring" }
  ] }
]);

gx.levels.open("moon-base"); // the human editor shows the same revision
gx.levels.play("moon-base"); // compile through the existing playable race path
```

Large edits do not require retransmitting a whole map. An agent can observe and modify only the relevant region, with an optional optimistic revision guard:

```js
const area = gx.levels.region("moon-base", { x: 8, y: 6, width: 8, height: 6 });

gx.levels.patch("moon-base", [
  { x: 10, y: 8, tile: "hazard" },
  { x: 11, y: 8, tile: "ring" },
  { x: 12, y: 8, tile: "fire" },
  { x: 13, y: 8, tile: "ice" }
], { expectedRevision: area.revision });
```

Use `list()`, `get(id)`, `create()`, `remove()`, `open()`, `region()`, `patch()`, `fill()`, `resize()`, `transaction()`, `undo()`, `importAscii()`, `exportAscii()`, and `play()`. The current browser editor accepts up to 64 named levels and 4,096 cells per level (maximum 64 on either axis). Transactions are atomic, and `start`, `half`, and `finish` remain single-instance semantic tiles. ASCII exports use `^` for fire and `~` for ice; `render_game_to_text()` reports the active `forceZone` and `forceZonesTotal` during play.

```js
const portable = gx.levels.exportAscii("moon-base").value;

gx.levels.importAscii({
  id: "tiny-trial",
  rows: [
    "#######",
    "#..H..#",
    "#.o!..#",
    "#..S..#",
    "###F###"
  ]
});
```

## Simple interactions

Entities can expose a labeled `toggle-visibility` or `apply-impulse` interaction. A person clicking the 3D object, its accessible Studio control, and an agent calling `interact()` all use the same atomic runtime path. Impulse targets must be dynamic rigid bodies, and receipts expose their resulting velocity.

```js
gx.loadStarter("glow-garden");

gx.interact("garden-heart:core", "toggle-power");
```

The receipt lists every target and its resulting visibility. Interactions also work as `{ op: "interact", id, interactionId? }` commands inside transactions or revision-guarded commits.

```js
{
  id: "power-button",
  type: "icosahedron",
  interactions: [{
    id: "toggle-lights",
    label: "Toggle room lights",
    type: "toggle-visibility",
    targetIds: ["light-left", "light-right"]
  }]
}
```

```js
gx.spawn({
  id: "launch-pad",
  type: "box",
  interactions: [{
    id: "launch-ball",
    label: "Launch the test ball",
    type: "apply-impulse",
    targetIds: ["ball"],
    impulse: [7, 5, 0]
  }]
});

gx.interact("launch-pad", "launch-ball");
gx.query({ ids: ["ball"] })[0].physics.linearVelocity;
```

## First world

```js
const gx = window.__GRAPHYSX__;

gx.create({
  schema: "graphysx.agent-world/v2",
  id: "ai-garden",
  label: "AI Garden",
  environment: {
    background: "#061521",
    ground: { visible: true, size: 32, color: "#102b2d", grid: true, gridColor: "#4bd6c8" }
  },
  entities: []
});

gx.transaction([
  { op: "spawn", entity: {
    id: "ambient", type: "ambient-light", intensity: 0.8,
    material: { color: "#9ed8ff" }
  } },
  { op: "spawn", entity: {
    id: "sun", type: "directional-light", intensity: 3,
    transform: { position: [8, 14, 6] },
    material: { color: "#fff1cf" }
  } },
  { op: "spawn", entity: {
    id: "seed", label: "Living Seed", type: "icosahedron",
    transform: { position: [0, 2.5, 0], scale: [1.4, 1.4, 1.4] },
    material: { color: "#7dffc4", emissive: "#176b4b", emissiveIntensity: 1.2 },
    tags: ["living", "focus"],
    behaviors: [
      { id: "seed-spin", type: "spin", axis: "y", speedDegrees: 24 },
      { id: "seed-pulse", type: "pulse", minimumScale: 0.9, maximumScale: 1.12, frequencyHz: 0.4 }
    ]
  } }
]);

gx.observe({ tag: "living" });
```

## Easy prefab composition

`prefabs()` returns the five built-in recipe descriptors and their exact expansion counts. `spawnPrefab()` is convenient for one placement; `spawn-prefab` is also a transaction command, so a whole composition remains atomic.

```js
gx.prefabs();

gx.spawnPrefab("luminous-tree", {
  position: [-4, 0, 2],
  palette: { primary: "#5de7ae", accent: "#ffd486" },
  tags: ["garden", "meeting-place"]
});
```

Available prefabs: `luminous-tree`, `signal-beacon`, `portal-arch`, `orbital-sculpture`, and `habitat-pod`. Each expands to ordinary stable-ID v2 entities; agents can query, update, reparent, animate, or remove every generated part afterward.

## Collaboration commits

Use `commit()` when multiple agents may edit the same world. `expectedRevision` is an optimistic concurrency guard: a stale observation is rejected without changing entities, revision, or accepted commit history.

```js
const observedRevision = gx.state().revision;

gx.commit({
  actor: { id: "garden-agent", label: "Garden Agent", kind: "agent" },
  intent: "Create a luminous gathering place",
  expectedRevision: observedRevision,
  commands: [
    { op: "spawn-prefab", prefabId: "luminous-tree", options: { position: [-4, 0, 2] } },
    { op: "spawn-prefab", prefabId: "portal-arch", options: { position: [4, 0, 2] } }
  ]
});

gx.history(observedRevision);
```

Accepted commit summaries record commit ID, world ID, actor, intent, revision, command count, and simulation time. `state().recentCommits` and actor-attributed conflict events make the same collaboration history visible to people and agents.

## Public surface

| Method | Purpose |
| --- | --- |
| `open()`, `demo()` | Open the studio or restore the built-in API-created demonstration. |
| `assets()` | Discover recovered complex models that can be spawned by stable asset ID. |
| `textures()` | Discover stable semantic textures, previews, descriptions, and repeat defaults. |
| `importLegacyXml(xml, options?)` | Migrate archived GraphysX `Object3D` XML into a validated v2 world with warnings. |
| `create(definition)`, `clear(id?, label?)` | Replace the current world from a complete v2 definition. |
| `spawn(entity)`, `update(id, patch)`, `remove(id)` | Perform a single entity edit. |
| `attachBehavior(id, behavior)`, `detachBehavior(id, behaviorId)` | Change simulation behavior without replacing an entity. |
| `interact(id, interactionId?)` | Trigger the same atomic labeled action used by 3D clicks and accessible Studio controls. |
| `starters()`, `loadStarter(id, options?)` | Discover or load complete, lit, editable starter worlds in one call. |
| `prefabs()`, `spawnPrefab(id, options?)` | Discover or place reusable multi-entity 3D recipes. |
| `transaction(commands)` | Commit a multi-object edit atomically; any invalid command rolls the whole batch back. |
| `commit(changeSet)`, `history(sinceRevision?)` | Apply actor-aware revision-guarded edits and inspect accepted collaboration history. |
| `select(ids)` | Share stable entity selection with viewport picking, the outliner, inspector, and transform gizmo. |
| `query(filter)`, `observe(filter?)`, `state()` | Read entities or a complete serializable world state. |
| `pause(boolean)`, `step(seconds)` | Control deterministic simulation time. |
| `undo()` | Restore the definition before the most recent successful edit. |
| `export()`, `save(name)`, `load(nameOrDefinition)` | Move worlds between JSON, memory, and local browser storage. |
| `levels.*` | Manage, region-edit, ASCII-import/export, open, and play a persistent library of semantic grid levels. |

Every mutating method returns `{ ok, revision, value?, error? }`. Entity IDs are stable and revisions change only after a successful edit.

## Scene vocabulary

Entity types: `group`, `agent`, `box`, `sphere`, `icosahedron`, `cylinder`, `cone`, `torus`, `plane`, `spline`, `model`, `ambient-light`, `directional-light`, and `point-light`.

Behaviors: `spin`, `bob`, `orbit`, `pulse`, `look-at`, and `follow-spline`. Interaction types: `toggle-visibility` and `apply-impulse`.

Queries can filter by `ids`, `type`, `tag`, case-insensitive `labelIncludes`, or a world-space `within: { center, radius }` test. Transactions and collaborative commits accept `spawn`, `spawn-prefab`, `update`, `remove`, `attach-behavior`, `detach-behavior`, `interact`, `set-environment`, and `select` commands.

The current contract intentionally stays above Three.js. Future renderers can implement the same world schema while agents keep using the same tools.
