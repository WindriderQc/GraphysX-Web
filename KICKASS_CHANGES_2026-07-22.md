# GraphysX-Web — Feature & Fix Wave (2026-07-22)

Six waves landed off the peer review and its follow-ups, plus one real bug found while verifying. Base: `643e184`
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
  and every `/datalake` route requires it (`Authorization: Bearer`, or `x-graphysx-token`, or
  `?token=` for the SSE stream only), constant-time compared. Reads stay open. When unset: exactly
  today's behavior + a loud `UNAUTHENTICATED MODE — LAN boundary only` startup warning. **Non-breaking
  by default.**
- **CORS allowlist** via `GRAPHYSX_STORE_ORIGIN` (comma-separated). Unset → today's `*`. Set → echo
  matching Origin only, `vary: origin`.
- **Datalake exposure closed:** the hardcoded `E:\Media\Datalake` fallback is removed;
  `GRAPHYSX_DATALAKE_DIR` is the only source, and unconfigured datalake routes return **503**.
- Node tool and browser client both send the token (the browser client picks up `?storeToken=`
  with no `main.ts` change). SSE token-in-URL log-leak caveat is documented.
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
- `smoke:store-auth` — token gate, CORS, tokenless compat (node-only, cheapest in the list)
- `smoke:dna` — was authored but never registered; now in the gate (node-only, deterministic)

## Verification run in this session (served `dist`, swiftshader)

Final `npm run verify` completed in 596 seconds: **all 29 checks passed** — typecheck, production
build, both Rapier probes, every browser/node smoke, the new mesh-collider proof, Piste race, store
auth, and DNA. `showroom`, `triggers`, and `rapier-race` each hit one transient first-attempt local
server timeout; the gate's isolated fresh-server retry passed all three, with no remaining product
assertion failure. Screenshots are in `output/verify`.

## Remaining follow-ups

- The `environment.post` field already exists in the runtime — a scene-authored bloom flag is wired;
  consider surfacing it in the editor inspector.
- `_to_delete/graphysx-kickass.tgz` was the delivery bundle to remove; `_to_delete/` is no longer
  present in this working tree.
