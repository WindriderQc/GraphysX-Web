# GraphysX-Web — Feature & Fix Wave (2026-07-22)

Ten waves landed off the peer review and its follow-ups, plus one real bug found while verifying. Base: `643e184`
(applied cleanly onto your `78e1fe3`, which only adds `showroom-welcome.ts` — untouched here).
All changes typecheck (`tsc --noEmit` clean) and build (`vite build` green). Affected smokes were
run individually against a served `dist` and pass; every new smoke is registered in the gate.

---

## Wave 1 — Physics correctness (the headline fix)

**Files:** `src/agent-world-runtime.ts`, new `scripts/smoke-physics.mjs`

- **Contact materials are now live.** Each of the six surface presets (default/wall/finish/
  ground/ball/human) used one shared legacy-solver material, and the world registered all 21
  contact-material pairs on construction (`registerPhysicsContactMaterials`, ~:3213). Before
  this, every body minted a private material that never entered the world's contact table, so
  all collisions fell back to the solver defaults (friction 0.3, **restitution 0.0**) — nothing
  bounced, and the authored presets were inert. `world.defaultContactMaterial` is also set to the
  `default` preset for any unforeseen combo.
- **Combination rule:** friction = √(fA·fB), **restitution = √(rA·rB)** (geometric mean). I first
  tried `max()` for restitution (the obvious choice) and it broke resting contact — a `ball`
  (0.68) steamrolled every surface it touched and nothing ever settled; `smoke-world1`'s "ball
  rests" assertion caught it. Geometric mean respects authored *deadening*: a ball on lossy
  `ground` (√(0.68·0.05) ≈ 0.18) settles; a ball on a `ball` surface (0.68) stays lively.
- **Broadphase:** `SAPBroadphase` replaces the default `NaiveBroadphase` (O(n²) → sweep-and-prune),
  set right after world construction (~:1185).
- **Force-field pass is now allocation-free in steady state.** The per-step matrices, `Vec3`s, and
  the per-entity hook closures are hoisted to persistent scratch/`Map` state (`forceFieldScratch`,
  `forceFieldInverses`, `forceFieldHooks`), pruned when entities are removed. The stale
  "never allocates" comment is now true.
- **New smoke `smoke-physics`:** drops two identical `ball`-preset spheres onto two platforms — one
  `ball`-preset (bouncy), one `ground`-preset (dead) — driven deterministically via pause/step.
  Asserts the bouncy column rebounds ≥25% of drop height, the dead column stays ≤12%, and the
  bouncy clears the dead by 2× (proving the *pair table* resolves, not a global restitution).
  Measured: bouncy 0.368, dead 0.023.

## Wave 2 — Agent bridge parity

**Files:** `src/agent-world-bridge.ts`, `AGENT_WORLD_API.md`, `scripts/smoke-standalone.mjs`

- `TOOL_PATHS` grew from 52 → **81 paths** (38 mutating), now covering the full public API:
  `rules.*`, `media.*`, `sounds`, `flocks`, `crowds`, `forceFields`, `formulas`, `dna`,
  `levelSchema`, and the constant value paths. Out-of-browser agents (postMessage / Playwright /
  stdio) can now reach the rules engine and media import — previously API-only and unreachable.
- New `bridge.audit()` (`auditBridgeParity`) walks the live API and returns `{missing, extra}` vs
  the manifest; never throws. It's the machine guard against future drift.
- `AGENT_WORLD_API.md`'s "every callable path" claim is now true and quantified; the smoke
  `smoke-standalone` calls `bridge.audit()` and fails on any drift (currently `{missing:[],extra:[]}`).

## Wave 3 — Look & feel

**Files:** `src/platform-theme.ts`, `src/platform-host.ts`, `src/main.ts`, `src/scoreboard.ts`,
`src/ballz-play.ts`, `src/platform-editor.ts`, `src/scene-browser.ts`, `src/browse-shelf.ts`,
`src/games-shelf.ts`

- **The brand font actually loads now.** Added the missing 600 weight; the whole product path was
  silently rendering in system fonts. All `system-ui` stacks on the product path now use
  `var(--gx-font)`. Build emits the woff2 files.
- **One theme layer.** The editor's mint (`#78f0d0`) is now canonical; the front-door modules'
  forked cyan family (`#37b6d3`/`#1c6a80`…) is gone. Tokens (`--gx-accent*`, `--gx-ink*`, `--gx-bg`,
  `--gx-font`…) inject once from `installPlatformTheme()` and cascade to editor + shelves + browser.
- **Post-processing on the product path (budget-gated).** RenderPass → UnrealBloom (strength 0.35,
  radius 0.4, threshold 0.85 — only emissives glow) → SMAA → OutputPass. **Off by default**; a
  scene's `environment.post` wins, else enable via `?post=bloom` or `host.setPostEnabled(true)`.
  One shared loop, one draw per tick, `composer.setSize` on resize, explicit pass disposal
  (fixed a pre-existing render-target leak).
- **Scoreboard win panel renders.** Finish time, medal (gold/silver/bronze from recovered
  `ScoreBest` times), best time, and delta-to-best now draw on level completion. Desynced runs are
  summarized but never recorded as a best. See it: front door → Games → play "Archive Level 1" → finish.

## Wave 4 — Store auth + hardening

**Files:** `server/scene-store.mjs`, `server/asset-store.mjs`, `tools/graphysx-scene-agent.mjs`,
`src/scene-store-client.ts`, `SCENE_STORE.md`, new `scripts/smoke-store-auth.mjs`

- **Opt-in bearer token** via `GRAPHYSX_STORE_TOKEN`. When set, every mutating route (PUT/POST/DELETE)
  and every `/datalake` route requires it (`Authorization: Bearer` or `x-graphysx-token`),
  constant-time compared. Reads stay open. When unset: exactly
  today's behavior + a loud `UNAUTHENTICATED MODE — LAN boundary only` startup warning. **Non-breaking
  by default.**
- **CORS allowlist** via `GRAPHYSX_STORE_ORIGIN` (comma-separated). Unset → today's `*`. Set → echo
  matching Origin only, `vary: origin`.
- **Datalake exposure closed:** the hardcoded `E:\Media\Datalake` fallback is removed;
  `GRAPHYSX_DATALAKE_DIR` is the only source, and unconfigured datalake routes return **503**.
- Node tool and browser clients both send the token. The browser consumes a one-time
  `#storeToken=` fragment into tab-scoped sessionStorage and never adds it to the public SSE URL.
- **New smoke `smoke-store-auth`** (node-only, no browser): 22 checks — 401 on no/wrong token, 2xx
  with token, reads open, preflight, datalake 401→503→200, tokenless compat mode, CORS echo+deny.
  All pass.

---

## Wave 5 — Rapier migration (completed follow-up)

**Files:** `src/physics/rapier-runtime.ts`, `src/physics/rapier-physics-engine.ts`,
`src/physics/rapier-race-primitives.ts`, `src/engine/physics-world.ts`, `src/race-scene.ts`

- AgentWorld now runs on the engine-neutral `PhysicsEngine` seam with Rapier behind opaque body
  handles. Surface presets preserve geometric-mean behavior through square-root collider
  coefficients and Rapier's `Multiply` rule; a deterministic 36-pair probe is part of `verify`.
- Heightfields and archive trimeshes use `FIX_INTERNAL_EDGES`, eliminating the recorded cell-seam
  kick. Primitive shapes, convex frustums, triggers, kinematics, sleeping, queries, impulses, and
  teardown all have native Rapier implementations.
- RaceScene's direct solver objects are gone. Grounding uses support contact normals, chase-camera
  collision uses filtered segment casts, moving platforms use position-based kinematics, and the
  physics lab uses spherical/revolute impulse joints.
- The archived car controller is now Rapier's `DynamicRayCastVehicleController`: one chassis with
  explicit body-origin centre of mass/inertia, four visual raycast wheels, front steering, rear
  drive, and defensive controller/body teardown.
- Adversarial review caught and fixed four subtle parity bugs before the gate: persistent Rapier
  user forces, fixed-step remainder loss, stale inertia after sphere resizing, and an offset
  chassis collider shifting the centre of mass. `cannon-es` and its adapter are removed.

---

## Wave 6 — Scene-native convex and trimesh colliders

**Files:** `src/physics/rapier-mesh-primitives.ts`, `src/physics/physics-engine.ts`,
`src/physics/rapier-physics-engine.ts`, `src/agent-world-assets.ts`,
`src/agent-world-runtime.ts`, `src/platform-editor.ts`, `src/agent-world-starters.ts`,
`scripts/vendor-slide-large.mjs`, `scripts/smoke-mesh-colliders.mjs`

- Model entities can author `physics.collider: "convex-hull" | "trimesh"`; omitted/`auto`
  preserves the existing primitive/box behavior. Trimeshes are static-only, while convex hulls
  support moving models. The engine-neutral physics seam now carries both shapes.
- Collision vertices come from the registered model payload after the exact same fit, recenter,
  handedness, and authored scale as the rendered model. Scene documents name the asset and policy
  instead of embedding raw arrays. State reports requested/effective kind and mesh statistics;
  exact intent survives export/reload.
- Payload positions and indices are validated; exact colliders are capped at 100k vertices/100k
  triangles and convex hull inputs at 8192 vertices. Rapier trimeshes enable internal-edge repair,
  duplicate merge, and degenerate-triangle removal.
- The main editor exposes a model collider selector and prevents a trimesh/dynamic mismatch.
  Existing spawn/update/bridge paths carry the field without a bespoke tool.
- Recovered `Media/SlideLarge.TVM` geometry (100 vertices, 92 triangles) is deterministically
  vendored and catalogued as `archive-slide-large`. The new **Great Slide** Browse Scenes starter
  is a real v2 composition with a static exact trimesh and a live ball descending its concave slope.
- `smoke-mesh-colliders` proves built-output asset resolution, 13.7-unit slope travel while the
  ball remains above the slide's lower surface (ruling out free fall), exact 100/92 state,
  document round-trip, rejection of moving trimeshes, a bridge-spawned dynamic
  convex hull, finite motion, zero failed responses/errors, and a screenshot.
- The proposed P3 cleanup was audited before editing: touched-body Sets, vehicle-controller
  teardown, and gravity copy-by-value were already present in the deployed Rapier code, so no
  duplicate churn was introduced.

## Wave 7 — Great Slide game + composed-play parity

**Files:** `src/agent-world-starters.ts`, `src/ballz-play.ts`, `src/platform-host.ts`,
`src/main.ts`, `src/games-shelf.ts`, `src/browse-shelf.ts`, `src/archive-skybox-spiral.ts`,
new `scripts/smoke-great-slide.mjs`, `scripts/smoke-games.mjs`

- **Great Slide is now a game, not a collider diorama.** The exact recovered SlideLarge mesh
  carries an adapted two-gate gravity run, finish, scene-native rules, player controls, bloom,
  results, replay, and return. It is the first Games row and the featured Browse card.
- **The fidelity boundary is visible.** The card calls out exact mesh/static trimesh/modern run
  and states that scale, material, spawn, checkpoints, lighting, and gameplay are adaptations.
  The same disclosure remains visible at a 390px phone viewport.
- **Composed games reached play parity.** The play layer resolves its subject from the rules
  document rather than hard-coding `ballz-ball`, so Great Slide, Skybox Spiral, and World 1 get
  the same HUD, keyboard input, results, best time, replay, and return contract as grid levels.
- **Replay is a real reset.** Composed games reload their pristine exported scene, including
  hidden pickups and rules. Exact model colliders pause simulation until their asynchronous
  trimesh is ready, preventing gravity from outrunning the floor.
- **Launch failure is transactional.** If a composed course or exact asset rejects after world
  replacement, the showroom is restored behind the still-actionable Games shelf; no mixed
  environment, orphan HUD, paused runtime, or dead-end chrome survives. The smoke aborts the
  SlideLarge request deliberately and guards the rollback.
- **Framing is scene-native.** A hidden `playfield` footprint gives composed games deliberate
  camera framing; wide courses now fit against horizontal FOV instead of shrinking against the
  vertical axis.
- **Agent-native game inspection shipped.** `render_game_to_text()` projects mode, world, rules,
  and player state; `advanceTime(ms)` advances deterministic simulation for browser drivers.
- New `smoke-great-slide` proves Games discovery, exact 100/92 collider readiness, real keyboard
  control of `great-slide-ball`, both ordered checkpoints, completion, results, replay with the
  collider rebuilt, showroom return, and zero browser/network errors. `smoke-games` now guards
  the featured desktop and mobile Browse presentation.
- **Map 1 asset groundwork is explicit.** Its recovered mesh is now deterministically vendored
  and catalogued (699 vertices/1456 triangles, exact positions/UVs/indices/bounds; inferred
  material). The standalone smoke fetches and verifies it. The game composition remains roadmap.

## Wave 8 — Revision-aware production activation

**Files:** `.github/workflows/deploy.yml`, new `scripts/write-release-metadata.mjs`, new
`scripts/smoke-live-release.mjs`, `package.json`, `HANDOFF.md`

- Production artifacts now contain `release.json` with the exact Git SHA and Actions run id.
- After the atomic symlink activation, CI polls the public hostname until that exact SHA is
  authoritative, then runs the focused Great Slide canary against the live site. A healthy old
  release can no longer make a new deployment look green.
- The canary covers the public front door, code-split shelves, thumbnail and recovered mesh assets,
  exact Rapier trimesh, controls, rules, results, replay, and return. Evidence is retained for 14 days.
- Activation records a validated pointer to the prior release. If the exact-revision canary fails,
  the workflow stays red and atomically flips `current` back to that known release.
- Local acceptance covered both paths: a mismatched SHA failed before browser launch; a matching
  manifest completed the full Great Slide canary with zero failed responses/console/page errors.

## Wave 9 — Human-authored looks + Map 1 gravity descent

**Files:** `src/platform-editor.ts`, `src/platform-host.ts`, new `src/archive-map1-scene.ts`,
`src/main.ts`, new `scripts/smoke-map1.mjs`, editor/round-trip smokes and shelf thumbnail plumbing

- Bloom authoring is now a deliberate editor surface: Subtle/Cinematic/Neon presets, visible
  Power/Knee/Spread fields, accessible names, live on/off state, and a compact layout that fits the
  inspector rail. Environment edits use one atomic `set-environment` transaction instead of
  export/reloading the whole scene, so selection, physics state, object identity, Undo, and agents'
  event path stay intact. Repeated look edits reuse one cached PMREM target per sky instead of
  regenerating image-based lighting; host teardown now disposes the cube maps, render targets,
  neutral RoomEnvironment target, and generator it owns.
- Map 1 is a real Games route. The exact recovered 699-vertex/1,456-triangle payload drives both the
  rendered course and Rapier trimesh. A modern one-gate gravity descent adds controls, HUD, finish,
  results, replay, return, a scene-native camera footprint, and explicit faithful/adapted/absent
  provenance rather than claiming unrecovered 2011 rules.
- The Map 1 smoke uses real ArrowUp input and natural fixed-step motion over the collider. It crosses
  halfway near step 780 and completes near step 949 with finite state; replay rebuilds the exact
  collider and returning restores the showroom.

## Wave 10 — Scene-authored image lighting

**Files:** `src/agent-world-runtime.ts`, `src/platform-host.ts`, `src/platform-editor.ts`,
editor/round-trip smokes

- Scenes can now author image-lighting source (selected sky or neutral studio), reflection
  intensity, aligned environment/background yaw, backdrop intensity, and backdrop blur. `null`
  remains the compatibility default: existing scenes still use sky IBL when a sky exists and the
  RoomEnvironment otherwise, with neutral 1/0/1/0 tuning.
- The editor presents Automatic/Sky/Studio source choices plus Natural/Soft/Hero looks and compact,
  accessible Light/Yaw/Backdrop/Blur fields. Explicit Sky safely reports and renders a Studio
  fallback until a sky exists; invalid programmatic values are restored before they can trigger a
  transaction rollback.
- Visible backdrop and reflections are independent. Studio can light PBR surfaces behind a selected
  cube sky, while Sky reuses its cached PMREM. Intensity/yaw/blur edits are native Three Scene
  properties and never regenerate the PMREM; late sky loads consult the latest lighting source.
  The GPU cache is capped at eight LRU entries without evicting the active sky, and preparation
  failures dispose their cube texture while leaving the neutral Studio fallback live and retryable.
- Editor coverage proves exact live Three values, sky/studio switching, PMREM identity reuse,
  selection/live-object preservation, accessibility, compact layout, invalid-input rejection, and
  Automatic reset. Round-trip coverage proves all fields through export/reload and renderer state.
- The focused editor harness now enters through the real showroom flow and swaps to a small
  deterministic authoring lab before its broad assertions, avoiding minutes of irrelevant
  SwiftShader work on the 96-actor showroom.
- Scope remains honest: scene IBL affects Standard/Physical materials. Recovered Phong headline
  meshes need the planned focused Physical-material pass before they receive the full benefit.

## Wave 11 — Licensed HDRI and recovered PBR showpieces

**Files:** `src/agent-world-hdris.ts`, `src/platform-host.ts`, `src/agent-world-assets.ts`,
scene/editor/API/bridge manifests and focused smokes

- Added Poly Haven's Studio Small 08 1K HDR as a bundled, traceable CC0 reflection environment.
  Its registry descriptor exposes author/source/license metadata through `api.hdris()` and the
  agent bridge; the production manifest derives the binary URL from that registry. The vendored
  file is 1,508,872 bytes with MD5 `de3ba64222895aca876b1d1c2e0cf81a`.
- `environment.lighting` now accepts `{ source: "hdri", hdri: "studio-small-08", ... }` without
  changing existing Sky, Studio, or `null` documents. HDRI is deliberately reflection-only: a
  scene's selected cube sky remains its backdrop and fog horizon.
- The host loads RGBE lazily, converts it once to a PMREM, releases the raw HDR texture, caches a
  bounded four-entry LRU, and guards every async completion. Backdrop and reflection ownership are
  tracked separately, so a late cube sky cannot overwrite HDRI and a late HDRI cannot overwrite a
  newer Studio/Sky request.
- The Archive Garage now uses the studio HDRI and its Impreza/Cobra hero surfaces are intentional
  Physical clearcoat materials; tires, wheels, undercarriage, and Piste Ovale are rough Standard
  materials. Great Slide receives restrained coated composite and Map 1 a rough Standard terrain.
  Source texture maps, sRGB handling, material groups, geometry, and collision payloads are
  unchanged. Every asset outside this focused list retains its legacy Phong path.
- Recovered PBR materials are source-owned and locked against the generic entity default, avoiding
  the latent teal-overwrite trap. The inspector now says “Source materials” for multi-slot models
  instead of offering sliders that only changed exported state while leaving pixels untouched.
  Disposal now deduplicates and releases maps for Phong, Standard, and Physical materials alike.
- Garage, Great Slide, Map 1, editor, standalone bridge, production-manifest, and 99-property
  round-trip coverage inspect the live Three material/environment objects, not only serialized
  state. The editor smoke also delays the real HDR response to prove HDRI→Studio race safety.

---

## Bug found & fixed while verifying

**Trigger re-collection under live restitution** (`src/agent-world-runtime.ts`, `updateTriggers`
~:2377). Once balls actually bounced (Wave 1), a bouncing ball could re-cross a *collected* ring and
its `toggle-visibility` interaction would flip it **back** into the world — un-collecting it. Fix: a
hidden trigger's own interaction is now suppressed (`visible !== false`), while its enter/exit events
still fire (occupancy is real). `smoke-ballz`'s ring-collection assertion caught this and now passes.

## New env vars (store)

| Var | Unset (default) | Set |
| --- | --- | --- |
| `GRAPHYSX_STORE_TOKEN` | open LAN mode + warning | bearer token required on writes + `/datalake` |
| `GRAPHYSX_STORE_ORIGIN` | `access-control-allow-origin: *` | echo allowlisted Origin only, `vary: origin` |
| `GRAPHYSX_DATALAKE_DIR` | `/datalake*` + `/assets/import` → 503 | datalake root |

## New gate entries (in `scripts/verify.mjs` + `package.json`)

- `smoke:physics` — contact materials live, pair table differentiates
- `probe:rapier-heightfield` — internal-edge seam regression, deterministic and node-only
- `probe:rapier-materials` — all 36 surface pairs, sleep/wake, and teardown determinism
- `smoke:rapier-race` — Piste vehicle contact, drive, steering, finite state, screenshot, errors
- `smoke:mesh-colliders` — Great Slide exact trimesh, dynamic convex hull, rejection + round-trip
- `smoke:great-slide` — Games launch, exact-collider gate, subject controls, results, replay + return
- `smoke:map1` — exact recovered collider, real-input natural descent, halfway, win, replay + return
- `smoke:store-auth` — token gate, CORS, tokenless compat (node-only, cheapest in the list)
- `smoke:dna` — was authored but never registered; now in the gate (node-only, deterministic)

## Verification run in this session (served `dist`, swiftshader)

Release-gate components are **all green** — typecheck, production build, both Rapier probes, and all
27 browser/node smokes, including the new image-lighting editor/bridge/round-trip coverage, Great
Slide and Map 1 complete play/replay proofs, Piste race, store auth, and DNA. The aggregate Windows
passes exhausted their retries on transient localhost resets before Games/World 1/Store Auth could
start and once during an Editor sky request; each affected smoke then passed against the same built
`dist` bundle in stable-base or focused mode, with no product assertion failure. Screenshots are in
`output/verify`.

## Remaining follow-ups

- ~~Surface scene-authored bloom in the editor.~~ **Done in Wave 9**, including named presets,
  readable tuning, selection-preserving transactions, and browser/persistence coverage.
- ~~Add scene-authored IBL intensity/rotation/background controls.~~ **Done in Wave 10**, including
  sky/studio source separation, named looks, PMREM reuse, async-race safety, and renderer/persistence
  coverage.
- ~~Add a licensed 1K HDRI and focused recovered Physical-material pass.~~ **Done in Wave 11**,
  including CC0 provenance, reflection/backdrop race isolation, hero-scene activation, selective
  Physical/Standard profiles, source-material inspector honesty, and live-object coverage. Next:
  slot-aware model material overrides and a larger curated HDRI library.
- `_to_delete/graphysx-kickass.tgz` was the delivery bundle to remove; `_to_delete/` is no longer
  present in this working tree.

## Wave 12 — Recovered material-slot authoring

- Models now expose one stable slot per exact mesh/material assignment. Archive Garage proves
  the recovered inventory without flattening it: Impreza has seven assignments, Cobra five, and
  Piste Ovale one explicitly unresolved/inferred surface. Repeated wheel/tire sources are related
  in state but stay locally editable.
- `modelMaterialOverrides` is sparse scene data and uses two-level merge semantics across the
  runtime, transactions, bridge, export/load, and the document-side scene store. `null` restores
  one slot or the complete model; empty maps do not serialize. Generic model `material` patches
  are rejected so source-owned materials cannot be accidentally painted as one homogeneous mesh.
- The editor replaces the old read-only source-material notice with compact disclosure cards,
  exact stable IDs, source-map/type/status metadata, supported-property controls only, accessible
  names, one/all reset, and focused presets for Impreza, Cobra, and the inferred Piste surface.
- Each active override owns exactly one clone. Reset/replacement disposes only that clone, never
  its shared recovered map; whole-entity teardown deduplicates materials/textures and also retires
  detached source materials. Multi-texture load failure uses all-settled cleanup, and late model
  completion checks disposed/runtime identity before it can affect a replacement entity.
- `smoke-vehicles` covers exact slot IDs/types/maps, local isolation, bridge edits, transparent
  glass depth behavior, reset cycles and disposal counts, unsupported-property rejection,
  export/reload, reset-all, rapid pre-load override/reset, and remove/re-spawn stale-load races.
  `smoke-editor` covers the 296px inspector, disclosure/accessibility, supported controls, presets,
  and editor leave/re-entry persistence; the scene-store smoke covers sparse remote merges.
- The gate's isolated static server now force-retires connections owned by an exited Chromium
  child after stopping accepts. This closes the `server.close()` wedge exposed when a transport
  reset killed a smoke while request timeouts were intentionally disabled.
- Final local release gate: **31/31 passed**. The Wave 12 editor, vehicle, and scene-store paths
  are in that complete gate; Overlay recovered one transport reset on its built-in fresh-server
  retry, with no product assertion failure.
