# GraphysX Web — Product Spec

**Status:** Draft v0.3 — 2026-07-18. North Star for splitting the deployed web product
from the archive-revival workshop, and for the scene-engine vision. Supersedes the
marketing claims in the old `README.md` until the re-architecture wave lands.
Foundation slice `foundation-r1` has landed: the app now boots into the platform home
(Scene Editor as the front door; archive-player menus off the product surface). Clean-host
core `host-r1` has landed too: `PlatformHost` renders the v2 world on its own
renderer/camera/controls/loop with zero `race-scene` dependency (reachable at
`?host=standalone`). `host-r2` adds full agent parity on that host — the complete
`window.__GRAPHYSX__` API + 47-tool bridge, wired straight to the runtime. `editor-r1`
adds the human editing layer (click-select, transform gizmo, outliner, add/delete/starter/
pause). **The default is now flipped onto the clean host** (`foundation-r2` / `showroom-r1`):
the app boots the welcome showroom on `PlatformHost`, and race-scene is retired to
`?host=legacy` (dynamically imported, off the default bundle). Phase 3 (showroom) has begun.

**Live target:** <https://graphysx.specialblend.ca> · **Source of record:** `WindriderQc/GraphysX-Web`

---

## 1. What GraphysX Web is

GraphysX Web is a **performant browser engine for generating 3D scenes and making them
interactive between humans and AI agents.** The scene is the whole product. A person or
an agent composes a scene from a deep vocabulary — physics, lights, particles, force
fields, flocks, autonomous and evolutionary entities, terrain, water, models — and then
that scene becomes a shared, living space that people and agents inhabit and act in
together.

Everything hangs off one shared runtime: the visible editor and `window.__GRAPHYSX__`
are two interfaces over the same validated scene. The twenty years of recovered GraphysX
and Nature-of-Code material is the *vocabulary* that fills this engine — not a menu of
old games. **Games that come to the web are rebuilt on this platform** — new scenes
inspired by the archives, authored on the v2 runtime — never old archive code ported
across. The archive's game screens are inspiration and evidence, not a shortcut into the
product.

One sentence: **an engine where people and agents co-create living 3D scenes in the
browser and then inhabit them together.**

## 2. Who it's for

- **Humans** composing and playing in 3D scenes with real physics and simulation, with no
  native toolchain — in a browser tab.
- **AI agents** (e.g. Hermes, OpenClaw) that build, inspect, reason about, and *act inside*
  a concrete, mutation-safe scene through direct calls, `postMessage`, or an out-of-browser
  adapter.
- **People and agents together, live** — the holy grail (§7): a scene one human, one AI,
  or several of each inhabit and change at the same time.

## 3. Product pillars

1. **The scene is the unit.** Not a document, not a game — a *live scene* (§4). 3D world +
   optional 2D layers + simulation systems + interaction/presence bindings.
2. **One runtime, many authors.** The editor and the agent API produce the identical
   revision, receipt, event, and error. Human, AI, and remote-human edits flow through one
   validated path with revision-guarded commits. Parity is an invariant.
3. **Living, not static.** Scenes simulate: rigid-body physics, particles, force fields,
   flocking/steering, autonomous crowds, evolutionary/DNA entities. Behavior is
   first-class vocabulary, not decoration.
4. **Layered rendering, cheaply.** A scene is a stack: the 3D viewport plus optional 2D
   layer(s). UI chrome (HUD, menus, inspector) is **DOM/HTML over the canvas — near-free**
   and the default. A **generative** 2D layer (hand-written canvas, or p5 for rich sketches)
   is **optional, opt-in per scene, and off by default**; p5-to-texture can also map a 2D
   sketch onto an in-world surface. Generative 2D must earn its frame budget or it isn't
   enabled.
5. **Performant by intent.** Rich scenes must stay smooth: instancing, LOD, budgeted
   particle/agent counts, deterministic step, and — a hard rule — **one shared
   `requestAnimationFrame` loop**. The 3D render and any 2D layer draw in the *same* tick;
   there is never a second independent p5/draw loop. Heavy 2D belongs in the 3D scene
   (sprites/shaders) unless a real p5 sketch clearly pays for itself.
6. **Portable + provenance-tracked.** The `graphysx.agent-world/v2` JSON is the canonical
   scene file (export / save / load / import, plus legacy-XML migration). Recovered assets
   and behaviors carry source lineage.
7. **Agent-native.** A self-describing manifest exposes every callable path, schema,
   mutation flag, and coordinate convention. Unauthenticated server-side mutation stays
   **off** until an authenticated session relay exists.

## 4. The scene model

A GraphysX scene is a **stack of layers plus a live simulation**, not a single canvas:

- **3D world** — the existing `graphysx.agent-world/v2`: entities, groups, lights,
  materials, textures, models, splines, prefabs, environment + sky, and physics
  (static / dynamic / kinematic; materials; impulses; gravity; deterministic pause/step).
- **2D overlay layer(s)** — optional transparent layers composited over the 3D viewport,
  all driven by the single shared frame loop (never a second loop). UI chrome uses
  **DOM/HTML** (near-free, default). An optional **generative** layer (canvas, or p5 for
  rich sketches) is off by default and only enabled when it earns its cost; it can also be
  *drawn to a texture* mapped onto in-world surfaces (screens, billboards, portals). If a
  scene's generative 2D isn't worth the frame budget, it simply isn't used.
- **Simulation systems** — particles/emitters, force fields, flocking/boids and steering,
  autonomous crowds (humans, zombies), evolutionary/DNA entities, spline followers. These
  are entities and behaviors in the same scene, queryable and editable.
- **Interaction + presence bindings** — which entities are interactive; who may act (local
  human pointer/keyboard, AI agent via bridge/relay, remote human); live multi-actor
  presence and selection.
- **Metadata** — provenance, sky ownership (per-scene, not global), version, and scene
  kind (showroom / editor scene / app).

A 2D-only "set" is just a scene whose 3D world is empty or minimal and whose content lives
in the 2D layer — so top menus and 2D effects use the same model.

## 5. Front door & navigation

- **Welcome showroom scene loads first** — the "boom" scene: warm sunlight, a CubX
  assembly rotating over heightmap terrain, trees with water reflection, a slow cinematic
  idle/screensaver orbit. It exists to *show the engine's capabilities at a glance*, not to
  be an index. Clicking focuses the camera (the recovered CubX behavior).
- **CubX assembly / side menu is the spatial navigator** → **Scene Editor** · **Browse
  Scenes** (load an existing 3D scene) · **Games & Apps** (a small, *expandable* category;
  seeded with a few of the strongest recovered experiences) · *(later: multiplayer rooms,
  more apps)*.
- The menu is expandable by design — "Games & Apps" grows over time without changing the
  front door.

## 6. Vocabulary from the archives (minimums, not limits)

The recovered material graduates into the engine as **behavioral** vocabulary, provenance
tagged:

- **Particles & FX** — particle effects and the preset library.
- **Nature of Code systems** — flocking/boids, force fields and vector fields, autonomous
  movers, evolutionary/DNA entities that adapt over time.
- **Populations** — humans, zombies, crowds with steering/movement behaviors.
- **Environment** — lights, heightmap terrain, water with reflection, skyboxes (scoped
  ownership), reusable CubX/CubZ assemblies.
- **Physics & objects** — rigid bodies, materials, impulses, vehicles, props, splines.
- **2D** — generative p5 sketches as overlays or in-world textures.

These are the *floor*. The intent is an open environment where new systems compose with the
recovered ones.

## 7. The holy grail — live human/AI interaction

An interactive scene is a **shared runtime with multiple actors**:

- **Local human** — pointer, keyboard, gamepad.
- **AI agents** — Hermes, OpenClaw, or any bridge/stdio client — discover the scene, act in
  it, and respond to humans, through the same validated operations.
- **Remote humans** — join the same scene (human↔human collaboration falls out of the same
  presence + commit model).

Revision-guarded commits, actor-attributed history, and presence make a scene genuinely
co-inhabited. This is the product's differentiator: not "an agent that generates a scene,"
but **a scene that a human and an AI are inside of, together, changing it live.**

*Reality boundary:* local human + in-browser/stdio agent works today. Real-time *remote*
presence (remote humans, an external agent bound to one human's live browser scene) needs
the authenticated, session-scoped relay — roadmap, not v1. Say so; don't fake it.

## 8. Deployed surface (v1 MVP)

**In — ships at graphysx.specialblend.ca:**

- The **welcome showroom scene** as the front door, with CubX/side-menu navigation.
- The **Scene Editor** (outliner, inspector, viewport gizmos, create/edit/group/delete,
  physics, materials/textures, behaviors, interactions, tags, undo, pause, step) + the
  **Advanced JSON Workbench** parity surface.
- The **Agent World API** + external bridge (`__GRAPHYSX__`, `__GRAPHYSX_AGENT_BRIDGE__`,
  `postMessage`, Playwright/stdio). See [`AGENT_WORLD_API.md`](AGENT_WORLD_API.md).
- The **curated vocabulary**: assets/models, textures, prefabs, and a first set of
  simulation systems (particles + at least one Nature-of-Code system) as editor entities.
- **Browse Scenes** + **Games & Apps** seeded with 2–4 strong recovered experiences loaded
  as ordinary editable v2 scenes.
- **2D overlay** capability in the scene model — DOM HUD/menu (near-free, default). An
  optional generative layer (canvas/p5) is opt-in, single-loop, and off by default.
- **Save / load / export / import** (v2 JSON + legacy-XML migration); named-level library
  where it is genuine platform vocabulary.
- **Live local interaction** (human click + in-browser/stdio agent on the same scene);
  honest version text (desktop + mobile); atomic static-release deploy.

**Out — stays in the `GraphysX` workshop repo:**

- The archive as a **player** — the 54-scene census and BallZ/CubX/FlightX/Dominus/lab
  *menus* as the product's identity. Individual experiences may reappear under Games & Apps;
  the monolithic archive shell does not ship.
- Raw archives, evidence ledgers, restoration QA matrices, per-scene fidelity work.

### 8.1 Reality check — what §8 describes vs. what ships today

*Added 2026-07-18 after an inventory audit. §8 above is the **v1 target**, not current state.
Tenet §11 is "honesty over theatre," so the gap is recorded rather than implied.*

The decisive test for "graduated" is whether a capability is expressible in the
`graphysx.agent-world/v2` model — reachable by the editor *and* the agent API. A behavior
locked inside a legacy environment module (`?host=legacy` only) has **not** graduated.

| §8 claim | Actual status |
| --- | --- |
| Welcome showroom as front door | **Ships.** |
| Agent World API + 47-tool bridge | **Ships.** |
| Save / load / export / import (v2 JSON + legacy XML) | **Real, API-only.** No UI on the default host. |
| Scene Editor: outliner, gizmo, create/delete, pause/step | **Ships.** |
| Scene Editor: inspector, materials/textures, behaviors, interactions, tags, undo, JSON Workbench | **Not on the default host.** That list describes the *legacy* prototype-app panel. |
| Simulation systems (particles + ≥1 Nature-of-Code system) as editor entities | **Ships.** `emitter` is a v2 entity type (`agent-world-particles.ts`) with 8 presets derived from the decoded TV3D archive library, spawnable from the editor's Effects palette and via `api.emitters()`, budgeted at 600 particles/emitter. `flock` (`agent-world-flock.ts`) is now a v2 entity type too, with 3 presets, an editor Life palette and `api.flocks()`. Force fields and DNA/evolutionary entities are still legacy-only in `nature-lab.ts`. |
| Curated vocabulary: assets, models, textures, prefabs | **Partial.** 5 mesh assets + 11 textures + 5 prefabs reachable from v2, against ~120 MB vendored. Prefabs exist in the API but are absent from the editor UI. |
| Browse Scenes + Games & Apps | **Not implemented.** |
| 2D overlay capability in the scene model | **Does not exist** in any form. No layer concept in `AgentWorldDefinition`. |
| Live local interaction (human + in-browser agent, one scene) | **Ships.** |
| Atomic static-release deploy | **Ships**, now gated on CI (`ci.yml` → `deploy.yml`), with staging on UGBrutal. |

Related corrections elsewhere in this spec:

- **§3 pillar 3 ("behavior is first-class, not decoration")** — ~~the six shipped behaviors
  are decoration and a *steering/flocking* behavior is the missing proof.~~ **Earned.** The six
  transform behaviors (spin, bob, orbit, pulse, look-at, follow-spline) remain decoration, but
  particle emitters and now **flocking** are genuine simulation entities. `flock` graduates the
  Reynolds separation/alignment/cohesion steering from the p5 `Nature of Code/flock` sketches
  and the 3D adaptation from `nature-lab.ts` — both `sphere` (the recovered sphere-tangent
  constraint) and `box` bounds, instanced in one draw call, capped at 240 members, ticked
  inside `updateSimulation` so it inherits pause/step, and reported in `state()` with live
  `memberCount` / `leadPosition` / `averageSpeed` so a stalled flock is visible to an agent.
  Two flocks fly in the showroom and are asserted to move and to survive export→load.
- **§4 scene model** — of the listed simulation systems, spline followers, particles/emitters
  and flocking are real. Force fields, crowds and evolutionary entities are not.
- **§5 showroom** — ~~the terrain is procedural sine displacement mounted as *host decoration*~~
  **Corrected.** Terrain and water are now v2 entity types (`agent-world-terrain.ts`,
  `agent-world-water.ts`), and the showroom's ground is an ordinary `terrain` entity on a
  recovered archive heightmap. The old host terrain was not merely dishonest, it was broken:
  the flat ground plane was hidden and nothing replaced its collider, so anything dropped in
  the showroom fell through the world forever. Terrain now carries a static cannon-es
  `Heightfield`, and `scripts/smoke-showroom.mjs` asserts a dropped sphere comes to *rest*
  rather than merely existing. ~~Click-to-focus is still not implemented.~~ **Implemented.** Clicking non-interactive scenery
  eases both the orbit pivot and the camera position onto the clicked subject's bounding sphere
  over 1.5 s (cubic in-out, distance derived from subject size, viewing direction preserved),
  then re-arms the idle orbit around the new subject. Water and emitters are pointer
  pass-through — a 150-unit plane and a `Points` cloud with a one-metre raycast threshold are
  not click targets. `Water.js`'s hard-coded Fresnel F0 of 0.3 was also corrected to water's
  actual ~0.02, which is what stopped the lake reading as wet rock at grazing incidence.
- **§5 CubX navigator** — the showroom's CubX is eight plain boxes with a spin behavior, an
  homage rather than the recovered assembly. There is no side menu or scene browser.
- **§6 skyboxes** — 21 MB of correctly-oriented cube maps ship and are unreachable from the
  default route; v2 `environment.background` is a single color string. The "sky ownership is
  scoped" tenet (§11) currently has no v2 mechanism to be scoped *with*.

**Graduated since this audit:** `skybox` in `environment` (six archive sets, per-scene); the
particle `emitter` entity type (eight archive-derived presets); and the `terrain` and `water`
entity types. Terrain is heightmap-backed with a static heightfield collider and five curated
fields — three decoded from workshop BMPs by `scripts/vendor-heightmaps.mjs` with source path,
SHA-256 and native dimensions recorded, the recovered CarX field, and one procedural fallback
labelled as such. Water is `three/examples/jsm/objects/Water.js` with a procedurally
synthesised normal map, and its planar reflection is an opt-out flag on the entity at a
budgeted 256² target. Both are reachable from `api.spawn`, listed by `api.heightmaps()`,
placeable from the editor's Terrain palette, and survive export→load. The editor also gained an
inspector, a prefab/model/texture/effects/terrain palette, and an exit path.

**Highest-value next graduations** (in order): a force-field behavior, which composes with both
particles and flocking; tree-DNA / evolutionary entities (§14 phase 4, still legacy-only); then
map-editor UI on the default host (its data model already graduated into
`agent-level-library.ts` and is reachable via `api.levels`).

**Known defect, not addressed here:** the `terrain` heightfield collider and its visual mesh
disagree near the edge of a `flattenRadius` pad by roughly one cell. A dynamic body that lands
inside the pad rests correctly, but one that lands within about a cell of the rim is deflected
down the landform instead of onto flat ground. Measurable with a radial drop sweep; the
showroom works around it by keeping props and the ball-drop test point well inside the pad.

## 9. Repo roles

| Repo | Role | Deploys? |
| --- | --- | --- |
| `WindriderQc/GraphysX` | Provenance archive + restoration workshop (full `web-prototype`, raw archives, ledgers, fidelity QA). **Local dev only.** | No |
| `WindriderQc/GraphysX-Web` | The product: scene engine + editor + agent runtime, curated assets/systems, showroom, ops QA, deploy. | **Yes → graphysx.specialblend.ca** |
| `SBQC` | Catalog + external launcher; advertises the agent bridge. Does not build, vendor, or serve the app. | Serves SBQC only |

## 10. Archive → app pipeline

One direction, deliberately: **restore** in the workshop → **curate** the single best
version (complete-best-version rule; hash duplicates; keep provenance) → **convert** to a
stable asset/system ID or a complete v2 scene, carrying lineage → **import** into
`GraphysX-Web` as vocabulary. Behaviors (a flock, a force field, an emitter) graduate the
same way assets do. Loose, unproven, tutorial, backup, or fixture material is never promoted
into a distinct product surface without host/layout evidence. Nothing modifies or
reorganizes the archive or the Datalake.

## 11. Design tenets (from Yanik's authoritative intent)

- **Honesty over theatre** — don't claim finished because it renders; label adapters,
  inferred cameras, collision assists, reconstructions; keep `RESTORED` vs `PARTIAL`
  discipline. Unfinished things simply aren't headline destinations.
- **Provenance is a feature** — curated assets and behaviors keep lineage.
- **A playground is not a game** — the Math surface stays exploratory visualization: no
  lives, scores, failure, or fake progression.
- **Sky ownership is scoped** — showroom selection, predetermined world skies, per-scene
  editor assignment are three things; never one global sky; don't upscale low-res skies into
  pixelated walls.
- **Multiplayer, multi-car, remote presence are intended future scope** — kept honest as
  roadmap until real bindings/networking exist.
- **Audio only with explicit scope + provenance** — no guessed universal soundtrack.
- **Name surfaces by purpose** — editor, workbench, library, showroom, app.

## 12. Open decisions

1. **Showroom composition** — exact "boom" scene content (CubX + heightmap + trees + water
   reflection + sunlight) and how much is real vs. staged for v1.
2. **Games & Apps seed** — which 2–4 recovered experiences appear first, and which ship as
   editable scenes vs. lightly-playable apps.
3. **First Nature-of-Code system to graduate** — flocking, force fields, or evolutionary/DNA
   entities as the reference "living" behavior in v1. (Leaning flocking + a force field:
   most visually legible, composes with physics.)
4. **2D overlay stack** — settled: DOM for UI chrome (default, cheap); generative 2D
   (canvas/p5) optional, opt-in, single shared loop, off by default and dropped if it
   doesn't earn its frame budget. Open only: is a generative-2D layer wanted in v1 at all,
   or deferred until a scene needs it?
5. **Named-level / grid-level play** — ships as a platform-native "level tool," or moves to
   the workshop? (Leaning keep, reframed as a tool, not "BallZ.")
6. **Product version line** — adopt `graphysx-web v0.x` so version text stops advertising the
   restoration cadence (`revival-...-rNN`).
7. **Remote presence / auth relay** — future authenticated session-scoped relay for remote
   humans and externally-hosted agents joining a specific live scene. Out of v1.
8. **Ops TODO (carried)** — point DNS for `graphysx.specialblend.ca` → `103.54.59.80`, then
   run the staged one-time nginx/TLS installer.

## 13. What "v1 done" means

The site opens **into the welcome showroom**, a first-time visitor immediately reads it as a
create-and-inhabit 3D engine (not an archive index), CubX/menu navigates to the editor and
scene browser (no Games & Apps shelf ships until a game is rebuilt on-platform). A person builds a scene with physics, a
particle system, and at least one living Nature-of-Code behavior; a 2D overlay renders over
the 3D view; an agent discovers the bridge and acts in the same scene a human is in; scenes
save/load/export; version text is honest and product-scoped; and no archive-player menu ships
as a competing front door. The `GraphysX` workshop stays the untouched source of everything
that graduated in.

## 14. Phased build order

Foundation before flourish. Each phase is shippable and course-correctable.

1. **Foundation** *(done — `foundation-r1` + default flipped)* — reframe the product surface
   onto the platform: the app boots into a platform home with the Scene Editor as the front
   door; the archive-player menus are off the product surface; version text is product-scoped.
   Still ships on the current renderer. Verified: build green, editor opens, agent runtime +
   bridge live, zero console/page errors.
2. **Clean host** *(core landed — `host-r1`)* — `src/platform-host.ts` (`PlatformHost`) renders
   the `agent-world/v2` model on its own `WebGLRenderer`, camera, `OrbitControls`, neutral
   `RoomEnvironment` IBL, and a single animation loop, with **zero `race-scene.ts` dependency**.
   The runtime already owned its Three.js `group`, cannon physics, and `update(dt)`; the host
   just lends the four things race-scene used to. Verified at `?host=standalone`: canvas renders,
   loop advances, 16-entity world simulates, zero errors. `host-r2` then wired **full agent
   parity** onto the host — `src/agent-world-api.ts` builds the entire `window.__GRAPHYSX__`
   API + discoverable bridge straight from the runtime (no PrototypeApp, no race-scene). Smoke
   drives spawn (16→17 entities), asset/texture discovery, a 47-tool bridge manifest, and level
   authoring, zero errors. `editor-r1` delivered exactly that:
   `src/platform-editor.ts` (`PlatformEditor`) adds click-selection (via `world.findEntityId`),
   the transform gizmo with commit-on-release, a toolbar (Move/Rotate/Scale, add box/sphere/light,
   delete, load starter, pause/step), and a live outliner — every control an ordinary API call, so
   human and agent edits share one revision history. Smoke: a toolbar action grows the world, the
   outliner reflects 18 entities, zero errors. **Phase 2 is functionally complete on
   `?host=standalone`.** Remaining is a product decision: flip the default onto the host (with the
   compact editor) now, vs. first deepen the inspector (materials/behaviors/interactions) to full
   parity with the legacy panel.
3. **Showroom** *(r2 landed — the default front door)* — `src/showroom-scene.ts` composes the
   welcome scene from platform vocabulary (a spinning 8-cube CubX assembly + orbital-sculpture /
   portal-arch / luminous-tree prefabs) with the flat grid hidden; `src/showroom-environment.ts`
   adds the host-level stage — a gradient sky, a warm sun, and gentle heightmap terrain (flat near
   center so objects stay grounded). Idle screensaver orbit + a welcome overlay whose "Enter Scene
   Editor" reveals the editor (the hidden editor is now interaction-gated so showroom clicks aren't
   hijacked). ~~Shadows deliberately deferred (no casters yet → pure cost).~~ **Shadows landed.**
   The deferral was correct while nothing opted into `castShadow`; the kinetic stack, trees, CubX
   assembly and flock are casters now, so the same low sun that lays the lake's glitter path also
   throws the raking shadows that seat the props on the ground. The key light casts at 2048², with
   the ortho frustum sized to the *composition* (±26, ~2.5 cm/texel) rather than to the 150-unit
   terrain, whose far reaches are fogged out anyway. Which objects take part is not a host setting:
   `castShadow`/`receiveShadow` are per-entity v2 fields the runtime applies to every mesh, so an
   agent or the inspector can pull anything out of the shadow pass with an ordinary `api.update` —
   the terrain receives but does not cast. `PlatformHost` also moved shadow updates off `autoUpdate`
   onto one arm-per-frame in `tick()`, because reflective water renders the scene a second time each
   frame and was rebuilding the whole shadow map for a byte-identical, camera-independent result.
   Verified: 59 entities, auto-orbit, enter-editor, zero errors. Evolutive — water/reflection,
   richer CubX, click-to-focus.
4. **Living behaviors** — graduate flocking + tree-DNA from `nature-lab` into reusable
   on-platform scene behaviors (they exist and need polish).
5. **First on-platform game** — one new, elegant BallZ-inspired level authored as a v2 scene,
   to the BallZ18 aesthetic bar, with a shader pass — **rebuilt on the platform, not ported.**
   (Note: a true 2048 "Clear Sky" set is not in this repo; `clearblue` is 512 px. A high-res
   sky would be a deliberate workshop→curate→import, not a pointer.)
