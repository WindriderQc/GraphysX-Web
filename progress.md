# GraphysX Web progress

Original prompt: "lets go then, lets make this happen!!"

## 2026-07-28 — `map-editor-race-r1` (complete)

- Re-verified the proposed archive-debt candidate against current `HEAD`: draw → store → play already shipped in the Levels workbench, so the live missing piece was authored race rules rather than another play path.
- Added transactional level vocabulary for 1–9 laps, required/optional rings, and required/optional halfway checkpoint. Old localStorage documents migrate to the established one-lap/all-rings/halfway behavior; create, duplicate, ASCII import/export, summaries, cloning, revision conflicts, undo, and the public human/agent API now carry the same rule block.
- Wired those settings into BallZ scene rules and the recovered mesh lap counter. The two archive levels still take their recorded three-lap facts as authority; newly painted levels now choose their own rules.
- Added human controls to the Levels workbench and expanded its browser smoke to prove UI authoring, invalid-rule rejection, ASCII round-trip, materialized world rules, and a three-digit recovered lap display. Typecheck, visual/game smoke, patch delivery, and production deployment are complete.
- Targeted QA is green: Levels workbench twice (including agent bridge parity and rule undo), BallZ materializer with the local scene store, and the required web-game client with arrow-key bursts. Inspected screenshots show the compact rule card fits cleanly beside the 20×20 grid; `render_game_to_text` agrees with the visible HUD (`lap 1 / 3`, one ordered checkpoint). The only first client console error was the documented optional `localhost:8788/scenes` probe while that local service was intentionally down; rerunning with it up produced zero console/page errors.
- Release verification built and exercised all 41 checks. The summary was 39/41 solely because Suzanne 1 and Level 3 each exhausted both ephemeral-server attempts at `page.goto` (`ERR_CONNECTION_TIMED_OUT`, before any assertion); both full scripts then passed against the same `dist/` on a stable local preview with zero console/page errors. Every changed surface passed inside the matrix, including Levels and BallZ.
- Completed next in `shader-ppl-r1` below. `Projection.fx` and BallZ's fluid-layer shader remain named source-only boundaries and must not receive invented bindings.

## 2026-07-28 — `shader-ppl-r1` (complete)

- Re-checked the shader register against `7519731`: `ppl.shade` and `Projection.fx` were both still absent from runtime vocabulary. Exact filename and parameter searches found active `ppl.shade` loaders in `Scene3D/Anneaux.cpp` and `EditorScreen.cpp`, but no `Projection.fx` loader or Fresnel-parameter host callsite. Projection remains source-only rather than receiving an invented binding.
- Selected the 2,876-byte StockRoom `ppl.shade` revision (SHA-256 `D6CE1C90…D8A4C1`) because it carries the explicit 0.03 source default; the second 2,853-byte revision omits that default. The active ring and editor bindings both override it to 0.025 and bind the exact 69,929-byte `ball_Normal.png` (SHA-256 `F4198F45…4C02B`).
- Implemented `archive-ppl` as round-trippable scene-material vocabulary plus a visible recovered ring lab: exact ZRing sphere binding, source-default and active-tuning specimens, exact vendored shader/normal inputs, and an explicit adapted active-scene light position. The shader is discoverable through `material.shader.archive-ppl`, the agent document contract and Browse Scenes.
- QA: typecheck, dedicated `smoke:ppl`, the pre-existing meshlight regression, revival-ledger audit, asset-manifest build, and the required web-game client all pass. The production-matrix `ppl` check passes with exact hashes, compiled parallax/normal/Lambert equations, live uniform patch, document round-trip and zero browser errors; its screenshot was inspected at `output/verify/ppl-lab.png`.
- Full verification completed 41/42. Media alone exhausted both fresh local-store attempts on Node `fetch failed` before any assertion during an unusually noisy loopback run; every other check passed (including ppl). `smoke:media` then passed in full against the same build on a stable host, covering server/API/editor imports with zero console/page errors. No assertion was weakened and no second full gate was launched.
- Next evidence boundary: `Projection.fx` is preserved but has no located loader or parameter binding, and BallZ's fluid-layer shader remains named legacy-only for the same reason. Do not manufacture either use. The only other 22-item register boundary is new legacy SceneNET XML output, which needs an explicit loss/duplicate policy before implementation.

- 2026-07-18: Created the standalone web-product repository from GraphysX restoration commit `36eac3d5a023e7a21f7b319e6e335d7ffca7d1d1`.
- 2026-07-18: Kept only the runtime source, curated browser assets, operational QA, and agent adapter. Historical archives and generated browser output remain in the source GraphysX repository.
- 2026-07-18: Added an atomic static release workflow for `graphysx.specialblend.ca`.
- 2026-07-18: Vendored the ten vehicle models/textures used at runtime and removed the final build-time dependency on the historical archive tree.
- 2026-07-18: `npm ci` and `npm run build` pass with the Linux-generated cross-platform lockfile; Vite emits the ten curated vehicle assets in the standalone release.
- 2026-07-18: Generic web-game smoke test produced synchronized canvas/text state with no console errors. Agent World API v2 passed 69 assertions with zero errors. The fresh restoration matrix visually verified both vendored vehicle packs and progressed through the remaining archive worlds until the local command wrapper's two-minute ceiling; the same source baseline previously passed the complete 293-assertion release matrix.
- 2026-07-18 (strategy pivot): Adopted `PRODUCT_SPEC.md` as the North Star. GraphysX Web is defined as a scene engine — a 3D + physics world studio humans and AI agents author and inhabit through one shared runtime — not a web edition of the archive player. The `GraphysX` repo is the upstream workshop (local dev only); games are **rebuilt on this platform**, inspired by the archives, never ported. Rewrote `README.md` to be honest about the in-transition state.
- 2026-07-18 (`foundation-r1`): First product-surface cut, all in `src/prototype-app.ts` (no `race-scene.ts` risk, generic `data-mode-id` dispatch only). `homeDestinations()` reduced from the four archive groups (~34 buttons) to a single platform home that opens the Scene Editor (`world-api-lab`). Home header/body/cards reframed to the platform; BallZ progression cards removed. Version text de-"Revival"-ed and set to `graphysx-web v0.1 · foundation-r1`. Archive modes remain in code but are no longer surfaced.
- 2026-07-18 verification: `npm run build` green after the cut. Foundation smoke (`scripts/smoke-foundation.mjs`, headless Chromium): home renders `GRAPHYSX WEB` with exactly one destination card (`world-api-lab`) and no "ballz" text; clicking it opens the Scene Editor with `window.__GRAPHYSX__` + `__GRAPHYSX_AGENT_BRIDGE__` live and a 16-entity demo world (revision 0); **zero console/page errors**.
- 2026-07-18 (`host-r1`, Phase 2 core): Added `src/platform-host.ts` (`PlatformHost`) — a standalone renderer/host for the `agent-world/v2` model with **zero `race-scene.ts` dependency**. Investigation confirmed `AgentWorldRuntime` already owns its Three.js scene-graph (`group`), physics world, behaviors, and deterministic `update(dt)`; `race-scene` only lent a renderer, camera, controls, and the frame loop. `PlatformHost` supplies exactly those: `WebGLRenderer` (matched race-scene config — SRGB, ACESFilmic 1.08, PCFSoft shadows), `PerspectiveCamera`, `OrbitControls` (damped), neutral `RoomEnvironment` PMREM IBL (no skybox assets needed), and one `setAnimationLoop` tick that calls `world.update(dt)` then renders.
- 2026-07-18: Wired `src/main.ts` so `?host=standalone` lazily boots `PlatformHost` (default app untouched; dynamic import keeps it off the default bundle path). Exposes `window.__GRAPHYSX_HOST__`.
- 2026-07-18 verification: `npm run build` green. `scripts/smoke-standalone.mjs` (headless Chromium) confirms canvas renders, the loop advances (frame 11→16), the runtime simulates a 16-entity world (revision 0), and **zero console/page errors**. Screenshot inspected: grid ground, physics spheres, cylinders, soft shadows, PBR shading — clean.
- 2026-07-18 (`host-r2`, Phase 2 agent parity): Added `src/agent-world-api.ts` — `createAgentWorldApi(runtime)` builds the complete `GraphysXAgentWorldApi` (`window.__GRAPHYSX__`) straight from the runtime, with **no PrototypeApp / race-scene dependency**. All world methods map to runtime methods; `levels` is backed by a self-contained `AgentLevelLibrary` (data ops live; `play()` honestly deferred to the future on-platform game surface); `importLegacyXml` reuses `convertLegacyGraphysXXml` + `runtime.load`. `AgentLevelLibrary` and the API types only touch race-scene as erased *type* imports, so the standalone bundle stays decoupled. `PlatformHost` now builds the API + `createGraphysXAgentToolBridge` and `main.ts` exposes `__GRAPHYSX__` + `__GRAPHYSX_AGENT_BRIDGE__` under `?host=standalone`.
- 2026-07-18 verification: `npm run build` green. Extended `scripts/smoke-standalone.mjs`: `__GRAPHYSX__.spawn()` grows the world 16→17, `assets()`=5, `textures()`=11, bridge `manifest().schema`=`graphysx.agent-tool-bridge/v1` with **47 tools**, `levels.create()` ok (levelCount 2), loop advancing, **zero console/page errors**.
- 2026-07-18 (`editor-r1`, Phase 2 human parity): Added `src/platform-editor.ts` (`PlatformEditor`) — the human editing layer on `PlatformHost`, self-contained (no race-scene, no PrototypeApp). Click-selection raycasts `world.group` and resolves via `world.findEntityId` (ported from the race-scene agent-world pick); the transform gizmo is `TransformControls` configured exactly like the reference (translate/rotate/scale, world space, 0.25/15°/0.1 snaps, r179 `getHelper()`), committing a rounded `api.update(id,{transform})` on release and freezing sim while dragging; a compact toolbar (Move/Rotate/Scale via W/E/R, add box/sphere/point-light, delete via Del, load-starter dropdown, pause/step) and a live outliner drive the same API agents use. Wired into `PlatformHost` (`interactive` option, default on).
- 2026-07-18 verification: `npm run build` green. Extended `scripts/smoke-standalone.mjs`: `.gx-ed-toolbar` + `.gx-ed-panel` present, a "+ Box" toolbar click grows the world 17→18, outliner reflects 18 rows, loop advancing, **zero console/page errors**. Screenshot inspected: toolbar, translate gizmo on the new box, outliner listing all entities.
- Phase 2 complete on `?host=standalone` (clean render host + full agent API/bridge + human editor).
- 2026-07-18 (`foundation-r2` + `showroom-r1`): **Flipped the default onto the clean host.** `src/main.ts` now boots `PlatformHost` by default; race-scene's `PrototypeApp` is retired to `?host=legacy` (dynamically imported, off the default bundle). `?host=editor`/`?host=standalone` open straight into the editor on the demo world. Added `src/showroom-scene.ts`: `composeShowroom(api)` builds the welcome scene from platform vocabulary only (glow-garden starter + a spin-behavior 8-cube CubX group + orbital-sculpture/portal-arch/luminous-tree prefabs); `mountWelcome()` overlays the title + "Enter Scene Editor". `PlatformHost` gained `autoOrbit` (idle screensaver orbit, stops on interaction), `editorVisible`, and `enterEditor()`; `PlatformEditor` gained `setVisible()`.
- 2026-07-18 verification: `npm run build` green. Three smokes pass with zero console/page errors — `smoke-showroom.mjs` (default: welcome present, editor hidden, 85 entities, auto-orbit, Enter reveals editor, welcome dismissed), `smoke-standalone.mjs` (`?host=standalone` editor + agent API), and `smoke-foundation.mjs` (now `?host=legacy`, PrototypeApp home intact). Showroom screenshots inspected.
- 2026-07-18 (`showroom-r2`): Deepened the welcome showroom toward the "boom." `composeShowroom` now builds a clean v2 scene with the flat grid hidden (`environment.ground.visible=false`) — a spinning 8-cube CubX group + orbital-sculpture/portal-arch/luminous-tree prefabs (59 entities). New `src/showroom-environment.ts` (`mountShowroomEnvironment`) adds host-level stage dressing: a CanvasTexture gradient sky, a warm directional sun + hemisphere fill, and gentle heightmap terrain (PlaneGeometry displaced with a radial center-flatten so composed objects stay grounded). `PlatformEditor.setVisible(false)` now also disables picking/gizmo so showroom clicks aren't hijacked by the hidden editor.
- 2026-07-18 efficiency: dropped the directional shadow map — nothing in the composed scene opts into `castShadow`, so a per-frame 2048² shadow render was pure cost (headless profiling showed the loop crawling). Removed it; real shadows return in a fidelity pass when casters opt in. Terrain tessellation trimmed to 96².
- 2026-07-18 verification: `npm run build` green; all three smokes pass with zero console/page errors — `smoke-showroom` (59 entities, gated hidden editor, auto-orbit via movement check, enter-editor), `smoke-standalone` (47-tool bridge), `smoke-foundation` (`?host=legacy`). Note: headless software-GL fps is low (~1–6 fps) and is NOT representative of GPU hardware; it only affected the smoke's movement threshold, which is now movement-based.
- Next (per `PRODUCT_SPEC.md` §14): showroom water/reflection + click-to-focus + opt-in shadows; editor inspector depth (materials/behaviors/interactions); Phase 4 living behaviors (flocking + tree-DNA); Phase 5 first on-platform BallZ level.
- ~~DEPLOY: live `graphysx.specialblend.ca` still serves the previously-deployed build because this session's work is uncommitted/unpushed... TODO: point DNS, run the nginx/TLS installer.~~ **RETRACTED 2026-07-18 — all three claims were false.** Verified: the work was committed and pushed (`28821c7`), the deploy workflow ran and succeeded (run `29658624933`), DNS already resolves `graphysx.specialblend.ca` → `103.54.59.80`, and TLS is active. Production was serving the current `main` the whole time — the deployed `index.html` references the identical asset hash a fresh local build produces, and the showroom smoke run against the live URL passed (59 entities, auto-orbit, editor gated, zero console/page errors). Lesson recorded: verify deploy state against the running system, not against assumptions.

## 2026-07-18 — `vocabulary-r1`: sky + particles graduated, editor made whole

- **The editor had lost most of its capability, and the library was invisible.** The clean-host rewrite reimplemented only outliner + gizmo + add-primitive + starter. Restored: an exit path (it was a one-way door — no way back to the showroom), the full curated library (5 prefabs, 5 recovered mesh assets, 11 archive textures — all already live in the API with no UI surfacing them), an inspector (colour, physics mode, spin/bob/pulse), and Undo. Fixed while driving it: model entities take `asset: { id }`, not a bare string, so every model spawn had been silently failing validation. Covered by `scripts/smoke-editor.mjs`.
- **Skyboxes graduated** (`agent-world-skies.ts`): 21 MB of correctly-oriented TV3D cube maps had been shipping in every release and were unreachable — `environment.background` was a single colour string. Six sets now selectable per scene, validated in `resolveEnvironment`, with the same cube map driving a PMREM probe so objects are lit by the sky they sit under. **Adaptation, not reimplementation**: `archive-skybox.ts` already solved the hard part (TV3D left-handed face order, quarter-turned poles) and is called as-is.
- **Particle emitters graduated** (`agent-world-particles.ts`): `emitter` is a v2 entity type with 8 presets derived from the decoded archive library (`legacy/particle-preset-library.json`) — spawn interval, lifetime, power, gravity, blend mode and keyframe ramps carried across, each preset citing source path + SHA-256 + emitter index, with departures listed in a machine-readable `deviations[]`. Budgeted at 600 particles/emitter, rate clamped to `maxParticles / lifetime`. Bridge went 47 → 49 tools. Honest gaps: the `.dds` sprites are *not* loaded (canvas textures synthesised instead; binding recorded), `energy-orb`'s ramp is invented because that archive record has no keyframes, and multi-emitter archive presets are represented by their single most legible emitter.
- **Two bugs found by looking rather than trusting reports.** (1) Particles initially rendered sub-pixel: archive keyframe sizes were scaled ×0.1, but the archive's 1.0 means ~1 world unit, so a brazier resolved to a 1.5-pixel dot — fidelity to the numbers producing a wrong result. (2) Selecting a sky killed the terrain fade, because `setSkyTexture` set `scene.fog = null` on the reasoning that "a sky reads as open space". Wrong: fog does not fight a skybox, fog of the *wrong colour* does. Sky descriptors now carry `horizonColor` and the fog is tinted rather than removed.
- **Fixed a flaky gate**, which matters more than it looks: `scripts/static-server.mjs` piped files with no stream lifecycle handling and Node's 5s `keepAliveTimeout`, so headless Chromium intermittently saw `ERR_CONNECTION_RESET` on the largest chunk. It presented as an unrelated smoke failure and was twice dismissed as noise. Streams now handle `error`/`close` and keep-alive is 72s. Verified by two consecutive clean `npm run verify` runs — one green run proves nothing about flakiness.
- **Welcome overlay stopped covering the scene it advertises** — moved from centred to lower-left over a bottom scrim, and out of `showroom-scene.ts` into `showroom-welcome.ts` (DOM chrome, not scene vocabulary).
- `PRODUCT_SPEC.md` §8.1 updated: particles are no longer in the "none graduated" column, and the next-graduation list is re-ordered (flocking → heightmap terrain → force fields → map-editor UI).

## 2026-07-18 — `pipeline-r1`: CI/CD, staging, and a foundation audit

- **Two independent audits** (engineering foundation + archive-vocabulary coverage) were run against the repo. Both found the code honest where it claimed decoupling, and the *documentation* dishonest about product completeness. Findings drive the items below.
- **Verification gate built.** `scripts/verify.mjs` is now one command that proves a release is shippable: typecheck → build → serve the built output on a dependency-free static server (`scripts/static-server.mjs`) → drive all three product routes in headless Chromium. `npm run verify`; `--no-build` reuses `dist/`; `--base <url>` smokes a live deployment instead. Works on Windows and Linux (the previous smokes wrote screenshots to `/tmp`, which silently littered `C:\tmp` on Windows; artifacts now land in `output/`).
- **The three real smokes were unwired and untested by CI.** They are now `npm run smoke:*`, and `smoke-foundation` gained a real exit assertion (it previously passed on a blank page as long as nothing errored).
- **CI added and production gated.** `.github/workflows/ci.yml` runs the full verify on every PR and non-main push; `deploy.yml` now `needs: verify` via `workflow_call`. Before this, the only gate on production was `tsc && vite build` — nothing verified the app rendered.
- **Staging on UGBrutal (192.168.2.12).** `.github/workflows/staging.yml` builds, verifies, publishes, then re-smokes the published URL. `scripts/staging-server.mjs` serves `C:\graphysx-staging` on `:8099` and re-reads a `current.txt` pointer per request, so releases swap atomically with no restart. Verified live end-to-end on this box: published a release, smoke passed against `http://127.0.0.1:8099/`, LAN-reachable at `http://192.168.2.12:8099/`. Runner registration is the one remaining manual step — see `ops/README-staging.md`.
- **First-load payload cut 823.4 KB → 747.7 KB** (measured over the wire, default route). `PlatformEditor` (and the TransformControls gizmo stack) is now a dynamic import loaded on `enterEditor()` — the showroom front door no longer downloads chrome it keeps hidden; `styles.css` (47 KB, 100% prototype-app selectors, zero `gx-` classes) moved onto the `?host=legacy` branch. Correction to an audit claim: the old 340 KB "TransformControls" chunk was mostly three.js's renderer half, not gizmo code — it is still required and merely renamed. The residual ~550 KB is three.js itself.
- **Decoupling made an invariant.** `verbatimModuleSyntax` is on, so the two type-only `race-scene` edges cannot silently become runtime imports. 20 legacy modules needed `type` keywords added; zero platform modules did.
- **Ops gap found and fixed in config: production serves uncompressed and uncached.** Verified against live: `Content-Encoding` empty, `Cache-Control` absent, so every visitor downloads ~750 KB raw every time. `ops/nginx/graphysx.specialblend.ca` now enables gzip and adds `immutable` caching for content-hashed `/assets/`, plus `no-cache` on the shell so a deploy is picked up immediately. **Not yet applied** — needs a deliberate re-run of `ops/install-nginx.sh` on the release server (infra step, not automated from here).

## 2026-07-19 — `shadows-r1`: the showroom gets shadows, and a commit-hygiene incident

- **Shadows landed — the deferral had simply expired.** Turning them off in `showroom-r2` was the
  right call at the time: nothing in the composed scene opted into `castShadow`, so a per-frame
  2048² map was pure cost. That stopped being true once the kinetic stack, trees, CubX assembly and
  flock arrived. The change is much smaller than the backlog implied, because the plumbing was
  already there: the runtime applies `castShadow`/`receiveShadow` to every `Mesh` in
  `applyResolvedEntity` (both defaulting to `true`), and `PlatformHost` has enabled
  `PCFSoftShadowMap` since `host-r1`. The only thing missing was that the showroom's host sun never
  opted in. One flag plus a shadow-camera setup in `showroom-environment.ts`.
- **The frustum is sized to the composition, not the world.** Props sit within ~±22 in x/z and the
  murmuration within ±13, so ±26 covers every caster at ~2.5 cm/texel. Stretching it over the full
  150-unit terrain would have spent 3× the texel footprint shadowing distant ground the fog already
  hides. Low sun → grazing incidence → the terrain is exactly the geometry that acnes worst, so the
  bias is mostly `normalBias` (0.03); a large constant bias would have peter-panned the stack's
  small boxes instead.
- **Which objects take part is not a host setting.** `castShadow`/`receiveShadow` are per-entity v2
  fields, so an agent or the inspector can pull anything out of the shadow pass with an ordinary
  `api.update`. The rig owns the light and the quality of its map, nothing else. Terrain receives
  but does not cast (`showroom-scene.ts` already set that).
- **Found while wiring it: reflective water was doubling the shadow cost.** `Water.js` renders the
  scene a second time each frame for its mirror pass, and with `shadowMap.autoUpdate` on, three
  rebuilds the entire shadow map for that nested pass — for a byte-identical result, since a shadow
  map is computed in light space and does not depend on the camera sampling it. `PlatformHost` now
  sets `autoUpdate = false` and arms `needsUpdate` once per frame in `tick()`; the mirror pass reuses
  what the main pass just rendered.
- **Verified by looking, not by asserting.** Three `npm run verify` runs with gaps; the last two were
  9/9 green. Screenshots inspected: long raking tree shadows, contact shadows under the plinth and
  stack, no acne on the terrain, frustum cutoff hidden by fog. One suspicion chased down rather than
  waved off — the murmuration renders as near-black silhouettes, which looked like a shadow
  regression. It is not: the `starlings` preset authors them dark (`color 2d3a46`, `emissive 0b1219`
  @ 0.25), confirmed by inspecting the live material in the browser. Shadow maps only darken surfaces
  facing *toward* the light, so backlit birds were always going to be silhouettes.
- **Two false alarms recorded so the next session doesn't re-chase them.** (1) `foundation` failed on
  the first run and passed on both reruns — the documented Chromium teardown contention, not a
  regression. (2) `scene-store` failed once with `EPERM ... rename '<tmp>' -> 'smoke-scene.json'` and
  passed on both reruns. That is a **real latent bug, not just flakiness**: `server/scene-store.mjs`
  does write-temp-then-`rename` for atomicity, and on Windows `rename` over an existing target throws
  `EPERM` whenever a scanner or indexer momentarily holds the file. It needs a bounded retry. Left
  unfixed here because it is outside this change and the file belongs to no session right now.
- **Commit-hygiene incident — the `git add -A` hazard fired again.** A concurrent session committed
  while this work was in the tree and swept `src/platform-host.ts` (+10) and
  `src/showroom-environment.ts` (+40) into `218d86c` *"feat(physics): trigger volumes"*, a commit
  about something else entirely. The shadow work is in `main` and functional, but its history is
  misleading. **Not rewritten**: `218d86c` was already pushed to a public repo with CI, and another
  session is actively committing on the same branch — rewriting shared history there would be
  destructive for a cosmetic gain. Recording it here is the honest remedy. The rule in the handoff is
  now twice-proven: **stage by explicit path, never `git add -A`.**

## 2026-07-19 — `levels-r1`: an authored grid becomes a playable scene

- **`levels.play()` stopped being a lie.** Since the clean-host rewrite it returned a hardcoded
  failure — *"Playable levels are rebuilt on the platform; not available in the standalone host
  yet"* — and an audit of `src/` confirmed why: **no code anywhere turned a grid into entities.**
  `agent-level-library.ts` is pure data, the workbench edits it through `api.levels.*`, and the only
  grid→3D materialiser in the repo was `race-scene.ts:7153`, which mutates the three.js scene graph
  directly and produces inspection geometry with no physics, no collision and no ball. So the
  workbench could author a layout nothing could ever run. `src/ballz-level-scene.ts` closes it.
- **A rebuild, not a port.** The legacy materialiser's *tile vocabulary* is worth keeping, so the
  palette carries across with its source lines cited; the mechanism is rewritten on v2. The whole
  module emits one `api.create` payload, which means a materialised level is an **ordinary scene** —
  selectable, inspectable, exportable, undoable. There is no second runtime holding game state, and
  the screenshot shows all 31 entities in the scene tree.
- **This could not have been built before trigger volumes.** A ring that notices the ball, a finish
  gate that fires once, a fire tile that launches — those are the gameplay verbs, and they arrived
  in `218d86c` a few hours earlier. A ring "collects" by toggling its own visibility, which needs no
  bespoke collection state and survives export→load because visibility is an ordinary entity field.
- **Deviations named, not silently applied.** Ice uses the `finish` physics preset (friction 0.16)
  because v2 has no ice material, and the tile's *attraction* is simply not modelled. Fire launches
  the ball **by id**, because a trigger's interactions fire its own set and carry no reference to
  whatever crossed it — a documented limit of the primitive rather than something worked around.
- **`scripts/smoke-ballz.mjs` asserts behaviour, not entity counts.** The ball comes to rest at
  0.468 — its exact radius on a floor top at y=0 — and rests at 2.08 on a wall (1.612 + 0.468),
  proving a wall *stops* it rather than being decoration it tunnels through. Crossing the gate fires
  `trigger.enter` exactly once and the ball ends up on the floor beneath it, so the trigger is
  proven not to resist. Driven by gravity plus `pause` + fixed `step`, never wall-clock — there is
  no impulse in the public API, impulses exist only as an entity's `apply-impulse` interaction.
- **Two of my own test bugs, worth recording because both produced *passing-looking* data.**
  `AgentWorldEntityState` exposes a **flat** `position`; writes use `transform.position` but reads
  do not. And `AgentWorldQuery` takes `tag?: string`, singular — a `{ tags: [...] }` filter is
  silently ignored and returns the entire world, so `query({tags:["collectible"]})[0]` cheerfully
  returned the ball. An assertion against the wrong entity is worse than a failing one.

### Three render defects found by looking at the result, not at the gate

- **`castShadow` on a v2 directional light was very nearly a no-op.** three defaults a directional
  light's shadow camera to a ±5 orthographic box, so a light that opted in cast only inside a 10×10
  window at the origin — most of the demo world, every starter and every level received nothing,
  while the flag read as honoured. Now ±38 at 2048² with `normalBias`. Deliberately generous rather
  than fitted to scene bounds: bounds change on every spawn, and a refitting frustum would make
  shadow quality flicker while an agent builds. Larger worlds still clip — a documented limit.
- **An agent-authored environment was stored but never rendered — the core invariant failing
  quietly.** `applyEnvironment()` was reachable from exactly three places: construction, the
  editor's own `onEnvironmentChanged`, and two manual calls in `main.ts`. A *human* picking a sky in
  the inspector saw it applied. An *agent* doing the identical thing through `api.create` /
  `api.load` / `levels.play()` got the sky written into the document, the inspector agreeing it was
  selected, and the viewport still showing the old one. `PlatformHost` now subscribes to
  `world.loaded` and re-applies, fixing every caller at once instead of asking each to remember.
- **A materialised level rendered flat**, which is what exposed the two above. With no sky the host
  falls back to a neutral `RoomEnvironment` IBL that lights every surface from every direction, and
  an enclosed arena under it loses its shadows to ambient. Levels now carry `sky: "lostvalley"` with
  a much lower fill — measured against all six sets, `clearblue` is 512 px and reads muddy brown at
  play angles. An ordinary per-scene field, so a level can be re-skied from the inspector.

**Closed straight after:** the Levels workbench now has a **Play** button, calling the same
`api.levels.play(id)` an agent calls — no privileged path, just a reachable one. Driving it turned up
a third parity bug of the same family: the Environment **sky dropdown was write-only**. It is built
exactly once, at panel construction, so it pushed a sky into the world and never read one back — it
went stale the moment anything *else* set the sky (a starter, a stored scene, an agent `api.create`,
or play), leaving the inspector reading "No sky" over a viewport plainly rendering one. `refresh()`
now re-syncs it, skipped while it has focus so a re-sync cannot yank the list out from under a
selection in progress. Covered by a `skyDropdownAgrees` assertion in `smoke-levels.mjs`.

**A self-inflicted bug worth recording**, because it argues for the strict-assertion rule: inserting
the Play button silently deleted the Close button's click handler (it was inside the edit's replaced
region). Nothing about the UI *looked* wrong — the button was still there, still styled, still
hit-testable. The existing smoke caught it within one run purely because it asserts the panel
actually closes rather than that a close button exists. The new Play assertions were then placed
**last** in that smoke, so the original sequence keeps exercising exactly what it always did; an
earlier placement reopened the panel mid-flow and broke the close assertion.

**Still open on this path:** camera framing after materialising is the host default rather than
fitted to the level — play a 44x30 level and the floor slab fills the viewport. No shader pass. Ice
models low friction but not the tile'"'"'s attraction. None of it is hidden behind a green gate.


### Gate finding: the verify harness resets connections, and it is NOT the product

`npm run verify` reported **8 of 8 smokes failing**, three separate times, interleaved with fully
green runs of the same `dist/`. That is the shape of a catastrophic regression, so it was chased
rather than waved off — the opposite mistake is recorded above in `vocabulary-r1`, where a genuinely
flaky gate was twice dismissed as noise.

**It is the harness.** Isolated to a single smoke against a single hand-started server, it
reproduces: run 1 green, run 2 fails with `net::ERR_CONNECTION_RESET` and a `waitForFunction`
timeout — the page never finishes loading its module graph, so every assertion after it is
meaningless. Ruled out along the way:

- **Not the product.** It fails `foundation` (`?host=legacy`) and `scene-store` identically to the
  rest — routes this session never touched — and the ballz assertions are byte-identical across
  every green run (`restY 0.468`, wall `2.08`).
- **Not the served files.** `curl` pulled the whole dist including every 3 MB skybox face and the
  3.2 MB village chunk at 200/full-length in single-digit milliseconds, against the very server the
  smoke then failed on.
- **Not socket exhaustion.** 19 TIME_WAIT against a 64511-port dynamic range.
- **Not concurrency** (an earlier draft of this entry blamed a concurrent `verify` from the other
  session and was wrong — it reproduces with one smoke and one server on an otherwise idle box).

`scripts/static-server.mjs` is already hardened against the two previously-found causes: explicit
`Content-Length` (no chunked framing), 72 s `keepAliveTimeout`, a polite `clientError` handler, a
1024 accept backlog, and swallowed socket errors. Something below that is still resetting
intermittently. **Left unfixed and unhidden**: it is a harness bug in a file the other session is
active in, and the honest state is that `npm run verify` currently needs re-running to trust a red
result. A red run whose failures are network-shaped and uniform across unrelated routes is this bug;
a red run that is structural and reproducible is real. CI runs on a clean runner and still gates
production, so a deploy is not exposed to it.

## 2026-07-19 — `levels-r2`: a level you can actually play

- **A level that renders but cannot be controlled is a diorama.** `levels-r1` materialised a grid
  into a physically real scene; nothing could move the ball. Two things close the loop: steering and
  feedback.
- **Steering lives ON the ball**, as four `apply-impulse` interactions. There is no impulse call in
  the public API — impulses exist *only* as an entity's interaction — so this is not a workaround,
  it is the only way to push anything. The consequence is the good part: the control scheme is scene
  data. It serialises, and a human's arrow key and an agent's `api.interact` are literally the same
  operation. Arrow keys rather than WASD, because the editor already binds W/E/R to gizmo modes.
- **`src/ballz-play.ts` is deliberately not a game engine.** It holds no scene state — rings collect
  themselves through their own trigger interaction and this layer only *observes* it. Delete the file
  and the level still simulates correctly, which is the test for whether a host layer has quietly
  become the product. Rules stop at a status line; laps, scoring and failure belong in a real rules
  layer, and §11 says a playground is not a game until that is deliberate.
- **Mounted by `PlatformHost` on `world.loaded`, keyed on a `player`-tagged entity — not by the Play
  button.** Keying on what the world *contains* rather than how it arrived means the human button, an
  agent's `levels.play()`, and a stored scene all produce the same playable result. Mounting it in
  the button would have handed agents a level nobody could control — the same parity asymmetry this
  session already fixed twice, and the first version of this change had exactly that bug.

### Two more defects found by looking at the screenshot, not the gate

- **The HUD was invisible.** It shipped at bottom-centre, where it sat in the DOM, correctly styled,
  and completely hidden behind the editor's Library panel. The assertion was `page.$(".gx-bz-hud")`
  — presence, not visibility — and it passed the whole time. Moved to top-centre; the smoke now
  hit-tests the status line's own centre and fails if anything opaque is stacked in front.
- **The editor's outliner never tracked API-driven change.** Every editor control called `refresh()`
  itself, so the panel was correct after a *human* edit and stale after everything else — an agent
  spawn, `api.load`, a stored scene, `levels.play()`. It was plainly visible once looked at: the
  viewport rendering a played level while the scene tree still listed the demo world at rev 0.
  `PlatformEditor` now subscribes to the runtime's event stream, coalesced onto one animation frame
  so a spawn burst rebuilds the DOM once rather than per event. Asserted in `smoke-ballz.mjs`: after
  an entirely API-driven sequence the tree shows `ballz-` entities, shows no demo-world entities, and
  its entity count agrees with `api.state()`.

**This is the fourth instance of one bug this session** — a surface that writes state without ever
reading it back. `castShadow` claimed without casting; an agent's sky stored but never applied; the
inspector's own dropdown never re-read; and now the outliner. Parity is not only about commits
landing in one history. It is about every surface reading the same world back.

**Still open:** camera framing after materialising is the host default rather than fitted to the
level. No shader pass. Ice models low friction but not the tile's attraction.

## 2026-07-19 — `modes-r1`: editing, viewing and playing are three surfaces

- **Playing was happening inside the editor.** The screenshot made it obvious: a game HUD sitting
  between a scene tree and a library palette, with the same chrome around a level you were playing
  as around a scene you were authoring. `PlatformMode` makes them exclusive — `scene` (the world
  alone: showroom, Browse Scenes), `editor` (authoring chrome), `play` (controls, HUD, a way back).
- **Each mode owns a definite answer for every piece of chrome.** That is the whole point: the bug
  it replaces existed because nothing was responsible for saying "playing means the authoring chrome
  is gone", so a HUD was simply added on top of whatever was already there.
- **Entering play is keyed on the world containing a `player` entity, not on who asked.** The human
  Play button, an agent's `levels.play()`, and a stored scene therefore land on the same surface —
  the same rule that fixed the earlier parity bugs, applied to gameplay.
- **Play is a place you can leave.** The HUD carries an exit returning to whichever mode you came
  from. Without it a page reload was the only way out, which makes a mode feel like a trap.

### Two bugs this surfaced, both found in the screenshot rather than the gate

- **A race between the mode and the editor's dynamic import.** The editor constructs visible and knew
  nothing about modes, so a level played before the chunk resolved had the authoring chrome pop in
  on top of the running game. It now applies whatever the mode is *when the load resolves*, and
  `setMode` re-checks on the other side too.
- **Replaying a level did not reset the HUD.** `setMode` early-returns when the mode has not changed,
  so the previous run's play layer stayed mounted and a brand new level opened reading
  `1 / 1 rings · FINISH`. A newly loaded world now always gets a fresh layer. Asserted directly:
  after a re-materialise the HUD must read `0 / 1` and must not say FINISH.

`scripts/smoke-ballz.mjs` asserts the surfaces are genuinely distinct — toolbar and panels hidden
with the HUD shown in play, restored with the HUD gone after exit — and captures both, so
`output/verify/ballz-play.png` and `ballz-level.png` are a side-by-side of the two surfaces.

**Still open:** `scene` mode is currently only the showroom; Browse Scenes and a Games & Apps shelf
are still the missing front-door routes (§8.1). Camera framing after materialising is the host
default. No shader pass.

### Amendment to the harness finding above

The other session landed two fixes for the same flakiness from a different angle: `f7c7124` gave the
smokes one shared deadline (their evidence: a run failed `waitForSelector` while Playwright's own log
said "locator resolved to visible" — the element was there, the clock ran out), and `2fdcab0` closes
smoke browsers on every exit path rather than only the happy one, which is very likely what was
leaving Chromium fleets alive and loading the box in the first place.

That is a better root cause than the one recorded above, and it probably explains the connection
resets rather than competing with them: an overloaded machine with several orphaned browser fleets
both expires deadlines and drops sockets. My `ERR_CONNECTION_RESET` observation was real and
reproducible, but treating it as *the* cause was reading one symptom as the whole. Flakiness has
still been seen since both fixes landed, so it is reduced rather than closed — keep re-running a red
run before believing it, and keep the discriminator: uniform, network-shaped failures across
unrelated routes are this; structural and reproducible failures are real.

## 2026-07-19 — `front-door-r1`: Games & Playgrounds, and a way back out

- **Two of the three surfaces existed; only one was reachable.** A playable level could be got at
  solely by opening the editor, opening the Levels workbench and pressing Play — so playing was a
  side door off authoring, which is the confusion `modes-r1` was supposed to end. The showroom now
  offers a second destination and the loop closes: showroom → Games & Playgrounds → a level you are
  playing → back to the showroom.
- **The shelf is a list, not a launcher framework.** Every row is `api.levels.play(id)`, the same
  call the workbench button and an agent make, and rows are read from the level library rather than
  a curated manifest — so anything a person or an agent authors appears with no second registration
  step. Rows state what they contain, and a layout with **no start tile says so** instead of
  offering a game that cannot begin.
- **One hand-authored course is seeded on first visit**, so the shelf does not open on the bare
  11×11 fallback. It goes in through `importAscii` like any painted level, lands in the same
  library, and can be opened and edited afterwards — deliberately not a special built-in. Seeding is
  skipped when it already exists, so a visitor who edits it keeps their version.
- **The return leg needed the real work.** Playing *replaces* the world, so "back" cannot mean
  un-hiding chrome: the showroom's entities are gone and its host-mounted set went with them.
  `PlatformHost` gained `onExitPlay` and `main.ts` recomposes the showroom from scratch — cheap,
  because the showroom is ordinary API calls rather than a retained scene. Without it you land in a
  chrome-less view of the level you just finished, with no way onward and nothing to notice it.
- **The Games button is added only when a caller supplies a handler**, so it cannot become a dead
  control. **Browse Scenes is deliberately still absent from the front door**: the scene browser
  mounts only when a scene store answers and the production deploy is static, so a button there
  would advertise a room that is not present. That is a gap, and it is named rather than papered
  over with a control that does nothing.
- `scripts/smoke-games.mjs` drives the whole loop and asserts the return specifically — showroom
  entities restored, level entities gone, HUD gone, welcome back — because that is the leg with no
  other witness.

**Still open:** Browse Scenes has no front-door route while production has no store. Camera framing
after materialising is the host default. The §14.5 shader pass is not done.

## 2026-07-19 — `forces-r1`: force fields graduated + a write-only-state round-trip sweep

- **Force fields graduated** (`agent-world-force-field.ts`) — the second Nature-of-Code system,
  after flocking. `force-field` is a v2 entity type with four kinds and five presets: `attractor`
  (p5 `attractor.js`, inverse-square, distance-clamped, mass-independent acceleration so a heavy
  crate and a light ball arrive together), `flow` (the forces-garden `flowAngle` field, carried
  over from `nature-lab.ts` unchanged bar a `scale` coefficient), `drag` (p5 `liquid.js`,
  magnitude = c·speed², inverse of velocity, inside a volume), and `vortex` (the sphere-flock
  swirl term, straightened around a world axis — the one kind with no p5 original, recorded as an
  extension). `path.js` deliberately not graduated: it is the existing `follow-spline` behavior.
- **Entity for identity, runtime pass for effect** — the honest answer to "entity or field?".
  Unlike a flock (whose object *is* the simulation), a force field's own `Object3D` is a
  visualiser only; deleting the gizmo changes no physics. So the entity carries the identity
  (position, radius, lifetime, serialisation, undo, tree place) while the *effect* is a pass in
  `updateSimulation`, run immediately before the physics step — the one place that sees rigid
  bodies, particle emitters and flocks at once. It applies `a·mass` to dynamic bodies (asleep
  ones woken), and installs a per-step `externalAcceleration` hook on flocks (`agent-world-flock.ts`)
  and emitters (`agent-world-particles.ts`) so neither module has to know force fields exist.
  Everything is sampled in the field's local space, so a rotated/scaled/parented field is exactly
  as correct as one at the origin. `state().forceField` reports `affectedCount` / `peakAcceleration`
  / `visualVectors` so a present-but-inert field (wrong radius, wrong tag filter) is distinguishable
  from a working one — the flock's `averageSpeed` lesson applied to a system whose job is invisible.
- **Budget (pillar 5):** measured ~0.52 ms/step for one attractor over 200 dynamic bodies + a
  240-member flock (particles opt-out, the default); ~1.24 ms/step with a 1500-particle emitter
  added to the pass. `affectsParticles` is off by default on every preset except `flow-garden`,
  because that is the one channel that samples thousands of points per step.
- Threaded through both `GraphysXAgentWorldApi` implementations (`agent-world-api.ts` **and**
  `prototype-app.ts`), the type union, `resolveEntity` (+guards: no rigid body on a field), the
  patch path, `createEntityObject`, `applyResolvedEntity`, `serializeEntity`, disposal,
  capabilities (`entity.force-field` / `force-field.list` / `simulation.force-fields`), and the
  editor's **Life** palette next to the flock.
- **A write-only-state round-trip sweep** (`scripts/smoke-roundtrip.mjs`, wired into `verify.mjs`
  and `npm run smoke:roundtrip`). For 63 settable properties across the v2 entity + environment
  schema it sets the value through the public API, then reads it back through **four** paths —
  `state()`, `exportDocument()`, a full reload from that export, and where observable the live
  Three.js / physics object — and asserts the world genuinely changed, not merely that the value
  was stored. 35 checks are object-verified (castShadow/receiveShadow on the actual mesh, transform
  on `object.position`, material on `mesh.material`, physics velocity off the rigid body, terrain
  `colliderVertices`, flock `averageSpeed`, the field actually pulling a probe body, ground mesh
  size/colour, gravity from a dropped body's acceleration). 28 round-trip through storage only, and
  the honest inventory of what is *not* object-observable (tags/label metadata, `body.mass`, the
  async sky texture, water's internal material colour) is recorded rather than skipped.
- **Bug found and fixed by the sweep:** an agent's `api.transaction([{ op: "set-environment" }])`
  updated the runtime's stored environment (and ground + gravity, which live in the runtime's own
  graph) but the host never re-read `background`/`fog`/`sky` — those live on `host.scene` and were
  only refreshed on `world.loaded`. Exactly the parity gap `world.loaded` closed for `create`/`load`,
  reopened by a different entry point: an agent set a new sky, `state()` and the document agreed it
  was selected, and the viewport kept the old one. Fixed at the source with a new `environment.changed`
  stream event that the host subscribes to (`agent-world-runtime.ts` + `platform-host.ts`). The
  sweep's object read of `host.scene.background` now passes.
- Two apparent failures the sweep flagged were harness mistakes, not product bugs, and are recorded:
  `geometry.radialSegments` is a per-primitive detail knob (a torus maps it to floor(n/2) radial +
  n tubular), so it is object-verified on a cylinder where it maps 1:1 and state-only on the torus;
  and the measured effective gravity sits a hair under the configured value because a rigid body
  carries a small default `linearDamping`, so that check asserts "close to new, clearly not old".

## 2026-07-19 — `play-framing`: a level opens framed

- **Play inherited whatever framing the previous surface left.** From the showroom that was its
  off-axis overview, tuned for the showroom composition, so a level opened at a coincidental angle —
  a large one overflowed the frame, a small one sat lost in it, and the ball was never the subject.
- **`frameOnPlay` eases the camera onto the level centre from one fixed game angle**, reusing the
  existing `focusMove` so it inherits the cubic ease. A *fixed* direction is the point: every level
  opens the same way, so the control scheme (up = away) always matches what the player sees.
- **Framed on `ballz-floor`, not the world's bounding box.** The floor slab is exactly the play
  footprint; the world also holds the terrain pad and the hills beyond it, and fitting those would
  pull the camera back until the maze was a detail. The host already reads the `player` tag to know
  it is in a game, so reading the floor is the same tier of knowledge rather than a new dependency.
- `smoke-games` asserts the orbit pivot lands on the level centre (near origin for a centred course,
  distinct from the showroom target) and that the ease has settled. `output/verify/games-playing.png`
  now shows the whole maze square in frame with all rings and the ball visible — the last named rough
  edge in the play loop, closed.

## 2026-07-19 — `win-state`: the game loop closes

- **The finish was a rubber stamp.** It appended "FINISH" to the HUD the instant the gate fired,
  regardless of rings — displayed, not earned. The level is now won only by collecting every ring
  and *then* reaching the finish. Crossing it early does not count, which is what makes the rings
  matter rather than being scenery you can ignore.
- **Collection is a `Set` of ring ids in the play layer**, so rolling back through a ring already
  taken cannot inflate the tally the way the old raw counter did — monotonic and unique by
  construction. This is *rules* state, not scene state: the runtime deliberately refuses to judge
  what a crossing means, and the play layer is the layer that does. The scene stays self-sufficient
  — rings still hide via their own trigger interaction, so deleting `ballz-play.ts` leaves a level
  that still simulates, just without a scorekeeper.
- **A completion panel** replaces the HUD on a win — "✓ Level Complete", with **Play again** (which
  re-materialises the same level) and **Back to games**. No caller threads the level id: the panel
  recovers it from the world id (`composeBallzLevel` names the world `ballz-level-<id>`), reading
  what it needs out of the scene it stands in.
- `smoke-ballz` proves the rule both ways — finish-with-rings-out does not win, rings-then-finish
  does — judged by the play layer's own poll, captured as `output/verify/ballz-win.png`.

**The game-loop ensemble is now complete:** front door → Games shelf → framed play with a HUD →
win panel → back to the showroom, every step an ordinary API call.

## 2026-07-19 — `overlay-r1`: the 2D layer exists now

- **The single biggest v1 gap, closed.** §8.1 called the 2D overlay "does not exist in any form. No
  layer concept in `AgentWorldDefinition`", and §13 hangs part of "v1 done" on "a 2D overlay renders
  over the 3D view." It ships now, graduated exactly the way skyboxes and emitters were: a small
  registry, a scene-serialisable field, reachable from the API and the editor.
- **`environment.overlay`** is the layer — off by default (a 2D layer must earn its frame budget,
  §4), one of three hand-written Canvas2D sketches (`agent-world-overlay.ts`): vignette, starfield,
  scanlines. New sketches inspired by the archive p5 work, not ports — labelled as such. p5 itself
  stays opt-in behind this (§4 keeps it optional; it is 900 KB).
- **The rule that shaped it (§5): never a second `requestAnimationFrame`.** The sketches do not run
  themselves — `PlatformHost` calls `draw(dt)` from its single `tick()`, in the same frame that
  renders the 3D scene, so the layers advance together by construction. `smoke-overlay.mjs` proves
  it the only way that actually holds: over an interval an active overlay advances by *exactly* as
  many frames as the 3D scene (`frameDelta === overlayDelta`). A second loop would drift; a shared
  one cannot.
- **Threaded minimally.** `overlay` is one optional field on `AgentWorldEnvironment`, validated in
  `resolveEnvironment`, carried by `environment.changed`, round-tripping through export→load like
  `sky`. It needed *no new API method* — it is set through an ordinary `api.load` — which kept the
  blast radius to the environment resolver. The editor gained a "2D overlay" dropdown beside Sky,
  synced on `refresh()` so it cannot go stale (the write-only-dropdown bug, not repeated).
- Verified: off by default draws nothing, one shared loop, real pixels over the 3D view (vignette
  darkens the corners while the centre stays transparent so the scene reads through), clears when
  turned off, survives export→load. `output/verify/overlay-vignette.png`.

**Deliberately deferred, named not hidden:** p5-to-texture (a 2D sketch mapped onto an in-world
surface), and multi-layer stacks — §4 lists both as "can also"/optional, and one overlay per scene
is the honest MVP of the layer concept.

## 2026-07-19 — `browse-r1`: the front door's third destination

- **§5 wants three destinations off the showroom; the third is now live.** Scene Editor and Games
  were there; **Browse Scenes** was missing because the store-backed browser only mounts when a
  scene store answers, and production is static. `browse-shelf.ts` adds the always-available half: a
  gallery of the curated starter scenes (`api.starters()` — real, complete v2 scenes an agent loads
  the same way), so "load an existing 3D scene" needs no server.
- **Browse opens a scene in the *editor*, Games enters *play*.** That is the distinction the mode
  split exists to keep — "load a scene to work on it" versus "play a level." Two focused shelves
  rather than one parameterised one, so each row's copy stays honest to what clicking it does.
- **Same no-dead-controls rule:** the Browse button is added only when a handler is wired. The
  store-backed `scene-browser.ts` still serves *saved* scenes when a store is reachable; this is the
  gallery of what ships in the static bundle.
- `smoke-games.mjs` now drives all three destinations and asserts Browse opens a curated scene into
  the editor (physics-sketchbook's `ramp-ball` present, showroom torn down, toolbar shown) —
  `output/verify/browse-scenes.png`, `browse-opened.png`.

**Milestone — §13 "v1 done" is essentially met.** Opens into the showroom ✓; reads as a
create-and-inhabit engine ✓; navigates to editor, games and a scene gallery ✓; a scene with physics
✓, a particle system ✓, and living Nature-of-Code behaviours (flock + force fields) ✓; a 2D overlay
over the 3D view ✓; an agent acts in the same scene a human is in ✓; save/load/export ✓; honest,
product-scoped version text ✓; no archive-player menu as a competing front door ✓; and a game
rebuilt on the platform, played to a win ✓. Remaining spec items (DNA/evolutionary entities, crowds,
the recovered CubX assembly, audio, a ballz shader pass, high-res skies) are enrichments beyond the
v1 bar, not gaps in it.

## 2026-07-19 — `cubx-r1`: the recovered assembly, graduated

- **It was never archive-blocked — just un-graduated.** §8.1 called the showroom's CubX "eight
  plain boxes… an homage rather than the recovered assembly", which read like a workshop→curate→
  import was owed. It was not: the assembly is fully decoded *in this repo*, in
  `src/legacy/cubx-actor-lineage.json` (hierarchy, world matrices, 23 mesh records) and
  `cubx-actor-inspection-geometry.json` (the actual vertex arrays). Worth remembering as a lesson —
  the ledger said "recovered material lives upstream" and the recovered material was already here.
- **`cubx-assembly` is a prefab, not showroom decoration.** Eight corner cubes joined by twelve
  edge struts, re-authored from the decoded `CubXOpen.tva` hierarchy. The record is in TV3D units
  where the cube module is 25; ÷25 gives the 1-unit module used here, so cubes sit on ±1 and each
  strut spans exactly the gap between two neighbours. Being a prefab makes it *vocabulary* — it
  appears in the editor's Prefabs palette and `api.spawnPrefab` like any other.
- **Labelled honestly, three ways.** FAITHFUL: part count and topology, the 25³ module, the strut
  proportions, the untextured grey StdMat as the default palette. INFERRED: exact pivot offsets —
  the archive's boxes carry a local centre of `[0, 12.5, 0]` and its struts sit on asymmetric world
  offsets; this places both symmetrically about the centre, which reads identically and keeps the
  prefab centred on its own origin like every other prefab. DELIBERATELY ABSENT: the eight
  `CubXBtn` click proxies and any click-index → BoxNN → actor mapping, because the audit's own
  `mappingAssessment` records that those three orderings **disagree in the source** and warns
  against inventing one. The unambiguous *shape* ships; the semantics wait for a real binding.
- The showroom nests it under the existing spinning cluster, so the rotation, the orbital swarm and
  the crown emitters keep working unchanged. Its cyan tint is a **declared** palette override — the
  recovered grey vanishes against the terrain at showroom framing — while the prefab's own defaults
  stay faithful to the record.

### The smoke caught a real consequence, and two process notes

- **`focusWorks` went false** and it was not a flake: the click-to-focus test clicks a scenery
  entity by id, and turning the placeholder cubes into a prefab renamed them
  (`showroom-cubx-cube-7` → `showroom-cubx-frame:cube-8`). The lookup returned nothing, so no click
  was issued. Retargeted; the assertion is unchanged and still demands a >0.75 focus move with the
  idle orbit re-armed. Exactly the kind of silent breakage a "does the element exist" test misses
  and a "did the behaviour happen" test catches.
- **A concurrent session's in-flight refactor briefly made the whole gate red** — 11/11 failing,
  all from eight typecheck errors in one file mid-rewrite. The discriminator that mattered: every
  error was in *their* file, none in mine, and their breakage was **uncommitted**, so a commit of
  only my paths pushed a clean tree. Verified by checking HEAD out into a throwaway `git worktree`
  and running the gate there — a way to prove a commit is sound without touching anyone's working
  copy, worth reaching for again.
- Final state after their rules work landed: **all 14 checks green**, including their new `rules`
  smoke.

## 2026-07-19 — `archive-r1`: the nostalgia starts coming back

Two agents worked recovered material in parallel on disjoint files while the lead integrated.

### Landed: two recovered BallZ arenas (`archive-ballz-levels.ts`)

- The 2015 StockRoom ASCII arenas — **Level 1's T course** and **Level 2's Z maze** — rebuilt as
  ordinary grid levels (`importAscii` → `composeBallzLevel`), so they are playable from the Games
  shelf and editable in the workbench. Level 2 ships at **100% authored cells**: its perimeter was
  already closed in the source, so not one cell is invented. Level 1 needed a containment frame
  because the archive's own boundary is *incomplete* (26 open perimeter cells — an engine that let
  you roll off the slab), and the frame is declared rather than hidden.
- **Honesty as data, not prose:** each level carries `faithful` / `inferred` /
  `deliberatelyAbsent` lists plus a machine-readable `deviations[]`. The real gameplay changes are
  named: the archive's finish and halfway are *lines* across the arena defined by post pairs and a
  grid gives one cell each; rings were a 10-second **bonus** and are now **required**; the handling
  is the platform's, not the archive's.
- **`ARCHIVE_BALLZ_NOT_REVIVED` records what was deliberately NOT revived and why** — five records,
  including Level 3, whose void-and-catwalk mechanic a grid cannot express (mapping its platforms to
  floor would preserve the drawing and delete the game), and the slide/track meshes, whose own audit
  says "no gameplay, spawn, physics or objectives are inferred". The record with the *strongest*
  provenance in the whole set (Suzanne 1, bytes in-repo with SHA) is among the ones skipped: 1,319
  of its 1,600 cells are empty floor. Playable is not the same as worth playing.
- Seeded on every platform-host route rather than only when the shelf opens, and published on
  `window.__GRAPHYSX_ARCHIVE__` — provenance is a feature (§11) and the platform is agent-native
  (§7), so what was recovered *and what was skipped* are discoverable.
- **The smoke was converted from a spawned vite dev server to the built output.** It needed dev only
  while the module was unbundled seed content; adding a vite-spawning smoke to a gate with known
  contention would have invited flakiness. It asserts behaviour, not validity: the ball rests at
  exactly its radius, a ball fired at 40 u/s into all four corners stays on the slab, a flood fill
  reaches all 22 objectives, and the level is *completed for real* through the rules layer with the
  finish proven not to count early. 13/13 green.

### Built and verified, NOT yet integrated: the vehicle garage

`archive-vehicles-scene.ts` + a vendored mesh pipeline are complete and pass their own harness (all
three models resolve, exact mesh/triangle counts, each resting on its plinth, the Impreza's seven
decoded textures). **Deliberately left unwired** rather than half-integrated at the end of a long
session: it needs the vehicle meshes registered in the asset catalog (production currently prunes
them out of `dist/`), the scene wired to a front-door row, and its bespoke harness smoke converted
to the standard dist-driven pattern the way the levels smoke was. Next session's first job.

### A real defect found in shared code, recorded not fixed

`loadAgentWorldModel` (`agent-world-assets.ts:228-234`) sets `position` and `scale` on the **same**
node. three composes T·R·S, so the recentring translation is applied in unscaled units while the
geometry is scaled: the model lands displaced from its entity origin by ~`center · (1 − scale)`.
Measured: a track mesh whose bounds centre sits 9.7 units above its base rendered **9.16 units
below** where it was placed. This affects essentially every `model` entity, since the default
`fitSize` is 4. **Not fixed here on purpose** — it changes the position of every model in every
existing scene, and some scenes may visually compensate for it, so it needs per-scene before/after
screenshots rather than a rushed edit. Spawned as its own task with both candidate fixes and the
regression assertion that would have caught it.

### The lesson that keeps repeating

"The recovered material lives upstream in the workshop" has now been **wrong three times** — CubX,
the BallZ arenas, and the vehicles were all already decoded *in this repo*, merely un-graduated. The
workshop is also simply present at `C:\Users\Yanik\codes\GraphysX`, so nothing is blocked. Check the
filesystem before believing a repo-roles table.

## 2026-07-20 — `vehicles-r1`: the Impreza reaches the front door

- **Archive Garage ships**, reachable from Browse Scenes: the recovered Impreza in its WRC livery
  and the Cobra on lit turntables, the Piste Ovale as a table model. Twenty-five entities, all v2
  vocabulary, all three meshes resolving. Fourth confirmation that "recovered material lives
  upstream" is wrong — the cars were decoded in `src/legacy/cars-catalog.json` all along, reachable
  only from `?host=legacy`, which builds three.js objects by hand. By §8.1's test, un-graduated.
- **The step that actually mattered was registration, and it was nearly missed.**
  `scripts/product-assets.mjs` derives the release manifest from the asset catalog, so an
  unregistered mesh — *and every texture it references* — is pruned out of `dist/`. The garage
  rendered perfectly in dev and would have **404'd in production**. Registering the three meshes
  makes them ship, and the manifest follows `textureUrl` out of each payload so the five car
  textures ship with them. Verified by listing `dist/` rather than trusting the build.
- `vehicle` is a new asset category rather than reusing `prop` — a car is not a prop, and the
  catalog is what agents discover through `api.assets()`.
- **Browse Scenes gained composed rows.** A recovered scene is built by a function that spawns
  entities, so it cannot be a static starter object. `main.ts` supplies the row because framing
  needs the host, which the shelf deliberately does not have — that keeps the shelf from having to
  know what a garage is.
- **The smoke was moved off the agent's bespoke vite harness** (its own config, html entry and
  mount module, all deleted) onto the real front-door path. The harness *could not have caught the
  pruning bug*: it never fetched from `dist`. The replacement asserts on 4xx responses and on
  `asset.status`, because a model that silently fails to load still exists as an entity — exactly
  the false pass an entity-count assertion waves through.
- **Not done, and named:** no drivable vehicle. Wheel joints and articulation are not v2
  vocabulary, so a "drivable car" here could only be a textured box.

### Two process notes

- **`roundtrip` failed in the full gate and passed alone.** A background verify was running
  concurrently — the documented two-fleet contention, not a regression. Confirmed by isolation
  before blaming it, which is the rule that keeps a real red run from hiding in the noise.
- **The `git add -A` hazard fired again, in the opposite direction.** My uncommitted one-line
  `vehicle` category addition to `agent-world-assets.ts` was swept into another session's unrelated
  commit (`0bc3f26 feat(envelope)`). Functionally fine — it is in `main` and the build is green —
  but it is now the *third* instance. Stage by explicit path; it does not protect you from someone
  else staging broadly.

## envelope-r1 — the scene decides how far you can see

- **`environment.envelope`** — `{ fogNear, fogFar, cameraFar }` or `null` for the host defaults —
  landed as scene vocabulary, consumed by `PlatformHost` the way `sky` already was, editable from a
  new Envelope row (checkbox = "host default" as a real state), swept by the roundtrip smoke with
  live-object reads off `scene.fog` and `camera.far`. This is what the four mesh-world ports were
  blocked on: bounds of 56–1135 units against fog pinned 34–130 and a far plane of 260.
- **The model recentring defect is fixed**, with the placement question answered by evidence rather
  than screenshots: `tools/port-dominus-village.mjs` computes every entity position *assuming* the
  loader centres a model on its bounds ("lifting by half of it puts the model's base on the
  ground") — the semantic the old code violated and the fix delivers. The showroom, prefabs and
  starters contain zero `model` entities; the garage loads at native span with centred bounds. So
  the only shipped model scene assumed the fixed behaviour all along, and production had been
  rendering it displaced.
- **`marker: false`** on point lights keeps the light and drops the lightbulb; serialises only when
  false, so existing documents are byte-identical.
- **The scene-store hang has a mechanism now**, not just a symptom: `close()` was a bare
  `server.close()`, which waits for the smoke's own undici keep-alive socket (up to the 72 s
  `keepAliveTimeout`, every run) and for any SSE stream a wedged tab never closed (forever) —
  compounding with an unbounded `browser.close()` under Chromium teardown contention. Fixed by
  severing connections before closing, alongside the bounded `EPERM` rename retry.
- **The cancelled-gate gap is closed at the root**: `deploy.yml` never cancelled anything — the
  *called* `ci.yml` did, its own concurrency group killing the previous main push's verify job
  mid-run. Four consecutive pushes deployed nothing while production sat a day behind.
  `cancel-in-progress` is now `github.ref != 'refs/heads/main'`: PR gates still cancel, main
  gates run to completion.
- **Gate evidence**: full verify in a throwaway worktree at `0bc3f26` — 14/15 with a concurrent
  `--no-build` verify running in the main tree (the CPU-contention condition HANDOFF warns
  about); the one red, `foundation`, passed cleanly in isolation on a quiet machine with zero
  console/page errors. CI runs the same gate on the push that carried these commits.
- **A staging lesson, third instance, refined**: explicit-path staging swept another session's
  uncommitted one-line edit into `0bc3f26`, because their hunk sat in the same file I had edited.
  Explicit paths are not enough in a shared tree — `git diff` the file for foreign hunks before
  staging it, or stage by hunk.

## 2026-07-20 — `playgrounds-r1`: the Nature Lab comes back

- **Flock Planet** and the **Forces & Flow Garden**, rebuilt from recovered `nature-lab` material as
  ordinary v2 scenes, reachable from Browse Scenes. The front door now lists nine scenes with the
  three recovered ones first.
- **Why these two:** their constants had *already* graduated. The `orbital-swarm` flock preset's
  provenance cites nature-lab's count 60 / radius 5.25 / maxForce 0.58 carried over unchanged, and
  `gravity-well` / `flow-garden` cite `attractor.js` / `flowfield.js` with the same lineage. For
  their central systems these scenes **are** the recovered numbers, addressed by preset id — so the
  smoke re-derives fidelity from the shipped registry rather than trusting a literal typed into the
  scene, which is a much stronger check.
- **Forces Garden ships with world gravity at zero** — faithful and load-bearing: the p5 sketch has
  no gravity, so the attractor is the only force. Six mass probes spanning a 2.45 mass range settle
  onto one orbit with a spread of **0.0007 units**. That mass-independence is the study's actual
  lesson, asserted as behaviour rather than as entity counts.
- **What was NOT revived is recorded as data beside what was** — seven candidates with verdicts.
  Physics Lab, because v2 has no constraint vocabulary and three of its four exhibits are joints (a
  pendulum on a `bob` behavior is a *picture* of a pendulum). Living Forest, because the recursion
  *is* the study and it needs an L-system primitive — a platform feature, not a scene. Six gallery
  modes, because their own records refuse to infer a composition, and rebuilding them would invent
  exactly what the archivists were careful not to. Voie Lactée is the near miss: it becomes an
  excellent scene the moment four textures are registered.
- **Three defects only screenshots caught**, all fixed: `nightsky` — recommended by its own
  descriptor "when the stars are the subject" — has a horizon silhouette and near-black down face,
  so a body at the origin sat against dark ground; one key light over a dark floor cast hard black
  ellipses that read as holes in it; and the mist clumped at the nozzle because of `energy-orb`'s
  archived 0.5 s lifetime, not its velocity. None of these are findable from assertions.
- The smoke now **joins the gate's server** instead of standing up a second one — two static servers
  in one run is precisely the multi-fleet contention that produces false reds.

**Gate: 15/15 green.** Four archive revivals have now landed in a day — two BallZ arenas, the
vehicle garage, and two Nature Lab playgrounds — plus the CubX assembly earlier.

**A field note worth passing on:** `flock.leadPosition` in `state()` is reported in the flock's own
**local** space while every other entity's `position` is a world position. It is the one field that
does not carry a parent transform, and it has now cost two people a failing assertion.

## 2026-07-20 — `math-r1`: the Math Game becomes vocabulary

- **`formula-field` is a v2 entity type.** The recovered Math Game (`Scene3D/MathGameScreen.cpp`,
  `Formulas.cpp`) was trapped in `race-scene.ts` on the `?host=legacy` route — reachable by neither
  the editor nor an agent, so by §8.1's own test it had not graduated. Now a human drags its
  coefficients in the inspector and an agent sets them with `api.update`, both landing in the same
  revision.
- **Faithful:** the formulas verbatim from `Formulas::moleculesUpdate` (PARABOLA `y = a·x² + b·x + c`,
  SLOPE `y = m·x + b`, evaluated at `x + xOffset`); the display mapping
  `clamp(2.2 + value·0.34, 0.1, 7.4)` that keeps a steep curve on the board; the molecule field from
  `moleculesCreate` (lane grid at 0.13 spacing, blue→red along z, the archive's full 100×100
  available as the `archive-molecules` preset); and the A/B/C/M/X control set with its recovered
  −5..5 range. **Inferred:** material response only. Verified before writing a line of runtime code
  by reproducing the legacy `getMathSurfaceY` output at seven sample points.
- **Why it can afford 10,000 where a flock caps at 240:** there is no neighbour test. Every
  molecule's height is a pure function of its own x, so the field is one instanced draw call that
  rebuilds only when the config actually changes — a static field costs nothing per frame.
  §11 holds: it visualises, it does not score.

### Two bugs that only driving it could find

- **`isEntityType` is a separate array from the TypeScript union.** Adding `"formula-field"` to the
  union left the runtime guard rejecting it, so `api.spawn` failed with *"Unsupported entity type"*
  while typecheck and build were both green. The handoff's checklist says "resolveEntity **(+guards)**"
  and this is why.
- **The patch path was missing**, so `api.update(id, { formula })` silently did nothing: the
  coefficient reverted to the preset default on round-trip. Found by asserting the value **came
  back** (`roundTripA: 3.5`) rather than that the call returned `ok` — the write-only-state class of
  bug this project keeps rediscovering, now on its fifth instance.

**Gate: 17/17 green**, verified at the committed HEAD in a throwaway worktree because a concurrent
agent's in-flight file had the shared tree failing typecheck. That trick has now paid for itself
twice.

## 2026-07-20 — `media-r1`: the library gets a runtime import path

- **The datalake is reachable from inside the product.** Until now the asset library was two
  build-time arrays: adding one texture meant offline conversion, regenerating a source file, and
  a rebuild — so 251 MB of recovered media (`E:\Media\Datalake`, StockRoom and friends: ~750 files,
  359 PNGs, 64 TVMs, cubemap skies, heightmaps, sounds) sat unreachable. The store server now
  fronts an **asset store** (`server/asset-store.mjs`, mounted into `scene-store.mjs`, same port):
  browse the datalake (`GRAPHYSX_DATALAKE_DIR`), import files into `.graphysx-store/assets/` with
  a persisted manifest, accept raw uploads, serve the binaries with CORS. Path traversal is
  refused by prefix check; manifest writes ride the same atomic-rename-with-EPERM-retry the scene
  store earned the hard way.
- **`api.media.*` on both API implementations** (the invariant held: `agent-world-api.ts` AND
  `prototype-app.ts`). `status/list` are sync mirrors; `refresh/browse/import/register/remove`
  are async store calls. A refresh registers every import into the SAME registries the curated
  vocabulary lives in — so `textures()`/`assets()` list them, `texture: { id }` / `asset: { id }`
  resolve them from scene documents, and the editor library shows them. The curated arrays stay
  untouched, which keeps `product-assets.mjs`'s release-manifest scrape honest: imports live on
  the store, never in `dist/`.
- **Foreign models convert IN THE BROWSER.** OBJ/GLTF/GLB/FBX/STL/3DS are fetched from the
  datalake, parsed with three's own loaders, and baked to `graphysx-mesh-json` — the runtime keeps
  exactly one model format and the server stays a dependency-free file store that never parses
  geometry. Two sign conventions are deliberate: Z is negated (and winding reversed) because
  `loadAgentWorldModel` applies the TV3D left-handed flip, and GLTF's `flipY:false` UV convention
  gets V inverted. Texture maps the loaders resolve (a 3DS naming its BMPs, rewritten through the
  store's datalake endpoint by a `LoadingManager` URL modifier) are re-encoded to PNG and stored
  as their own library files — the airplane.3ds comes through with all six of its BMPs. Positions
  trim to 4 decimals (a raw-scan STL went 62 MB → ~24 MB). `.tvm`/`.x` stay offline-decode.
- **The editor grew the human half**: a **Media** tab (thumbnails, apply/spawn/preview per kind,
  per-card remove) and an **Import media** dialog — folder navigation, multi-select file grid
  with image thumbnails, per-file convertibility flags, sequential import with truthful progress,
  and drag-drop upload for files that never lived in the datalake. Textures tab upgraded from
  text chips to swatches (the image IS the affordance).
- **Editor usability pass in the same breath**: snapping surfaced (toggle + 0.1/0.25/1.0 steps —
  it was hardcoded always-on), gizmo World/Local space toggle, **Duplicate** (Ctrl+D, through the
  document not the scene graph), **F** frames the selection, Ctrl+Z undo, Esc closes
  most-modal-first, per-row visibility dots in the scene tree (an ordinary `update({visible})`),
  a live toolbar status readout (entities · rev · sim time · paused), and a `?` shortcuts card
  rendered from the same table the key handler implements.

### Found while driving it

- **A day-long cache header served a stale model.** Stored asset files were sent with
  `max-age=86400` on the theory that an id's content never changes — but remove-then-reimport
  legitimately frees and reuses an id at the same URL, and the runtime kept rendering the OLD
  payload (no baked textures) while the store held the new one. Asset files now go out `no-cache`;
  the store has no ETags, so revalidate means refetch, which is the right trade on a LAN store
  against silently stale geometry. The hour lost here was misdiagnosed twice (as a bake-timing
  race, then as a register failure) before an instrumented fetch trace showed six successful
  uploads feeding a payload the browser refused to re-read.
- **`?store=` is honoured by the media module at load, not only via main.ts's async probe.** The
  smoke called `media.refresh()` right after boot and raced the probe's `configureAgentWorldMedia`,
  landing on the default port — where the dev box's REAL store answered, so the smoke read ten of
  yesterday's imports instead of its one fixture. Synchronous truth from the URL param fixed it;
  the race was only visible because a second live store existed to catch the miss.
- **Smoke #18: `media`** (`scripts/smoke-media.mjs`) — builds its own two-file datalake in a temp
  dir (CI must not know about `E:\`), asserts the server path (browse, import, traversal refusal,
  serving), the API path (refresh→register→apply texture, OBJ→convert→spawn→`asset.status:
  "ready"`), and the GUI path (Media tab cards, dialog listing, click-select, import button,
  status line) in one flow.

## 2026-07-20 — `archive-r2`: Math screen, Voie Lactée, Maison

Three more revivals, integrated by the lead from parallel agents.

- **Math Game screen** (`archive-math-lab.ts`) — `formula-field` graduated the *system*; this
  rebuilds the *screen* from `buildMathLabPreview`: the instrument board at its recovered
  15 × 7 / (0, 3.7, −8.4), the 2-unit grid across ±6, the three axes at their recovered colours,
  and surface curves sampled every 1.5 in z with z = 0 highlighted. §11 holds: the A/B/C/M/X slider
  panel is deliberately absent because the coefficients are already editable in the inspector and
  through `api.update` — that *is* the platform's answer to it — and there is no scoring loop.
- **Voie Lactée** (`archive-milkyway.ts`) — the agent **refused three things the brief assumed**,
  correctly: there is no sun, no barycentre and no heliocentric orbit in the record (the Moon's is
  the only orbit in twenty years of this material), and no scale compression is needed because the
  archive is already a 74-unit vignette. Giving Mars and Venus orbits would have shipped a solar
  system under the name of a record whose census entry exists to say it is not one.
- **Maison** (`archive-buildings.ts`) — **a prior verdict overturned on evidence.**
  `archive-playgrounds.ts` had grouped `maison-explorer` with the mesh galleries "whose whole
  content is geometry this vocabulary cannot author". True of every other candidate on that list;
  false here — the record is 24 meshes totalling 216 vertices, 20 of them exactly 8-vertex boxes.
  It is a Blender *massing model*, and a v2 `box` is what those objects already were. The module
  imports the inspection JSON directly so there is no transcription to drift.

### The asset-registration trap, three times in one day

Vehicles, then the planet maps, then the Math board: each shipped in `public/` from the beginning,
each unregistered, and therefore each **pruned out of `dist/` by the release manifest** — working
perfectly in dev and 404-ing in production. It is systemic enough that it wants a guard (a check
that every URL referenced by a shipped scene is claimed by a registry), not vigilance.

### Field notes from the agents, worth keeping

- **`state()` mixes reference frames.** `position` is a *world* position from `getWorldPosition()`,
  while `rotationDegrees` and `scale` are *local*, all rounded. A correctly-grounded house reported
  as floating 0.33 units and cost three false failures. Separately, `flock.leadPosition` is in the
  flock's own local space while every other entity's position is world.
- **`toggle-visibility` flips the flag on its target only.** Children of a hidden group keep
  reporting `visible: true` even though three.js hides the subtree — assert on the group.
- **Unverified, surfaced not chased:** `arena.mat`'s locked SHA-256 in
  `arena-archive-environment.ts` reportedly does not reproduce from the committed blob under any
  line-ending interpretation, and that const block's `faces: 44` / `dimensions: [40,2,40]` disagree
  with the OBJ (42 face records, Y span 2.047). Both are surfaced in the legacy UI.

### Gate

17 of 19 green. `media` fails only under contention and passes alone. **`spiral` is a genuine
failure and is why nothing is pushed:** `collectedAfterRings = 16` but `hiddenRings = 12`, because a
ring collects by calling `toggle-visibility` **on itself** and toggle is not idempotent — rolling
back through a collected ring makes it reappear. That trade-off was taken knowingly when the win
state landed (it keeps the scene self-sufficient without the play layer); the spiral course is where
the bill arrived. A fix is in flight in its own session.

### media-r1 addendum: imported images are landforms too

- **`api.media.terrainHeights(id, samples?)`** decodes any imported image into a normalized
  heights grid (luminance, stretched min→0 max→1 because archive heightmaps rarely span the full
  byte range; canvas-resampled so a 1222px scan box-filters instead of aliasing into collider
  spikes). It feeds terrain's existing inline `heights` field — no registry involved, the
  landform travels with the document, and `heightmap` nulls on export exactly as that contract
  promises. The editor's Media tab exposes it as a ⛰ action on texture cards. Driven against the
  real `StockRoom/Heightmaps/HEIGHT.JPG`: 129² grid, full 0–1 range, 9409-vertex collider,
  document round-trip green. The `media` smoke now asserts decode → spawn → terrain state.

## 2026-07-20 — `audio-r1`: scenes can make noise

- **`sound` is a v2 entity type** — the enrichment HANDOFF listed as "Audio (19 sounds
  upstream, 4 vendored)" is now vocabulary. A placed source with
  `sound: { source, volume, loop, autoplay, positional, refDistance }` in the document, a
  selectable wireframe marker (reusing the point-light marker flag, so `marker:false` hides
  the glyph without silencing it), no rigid body, threaded through every seam the entity
  checklist names — including both API implementations (`sounds()`) and the editor
  (♪ chips in Effects, a Sound inspector section, media sound cards place-on-click with a
  ▶ corner preview).
- **Entity for identity, host pass for effect** — the same split force fields and the 2D
  overlay use, because audio needs exactly what the runtime must not know about: the
  camera's `AudioListener` and the gesture-gated `AudioContext`. `agent-world-audio.ts`
  reconciles sound entities event-driven (a boolean check per frame when idle), attaches
  `PositionalAudio` to the entity's own object so parents and behaviours carry the sound,
  mutes hidden entities, defers autoplay until the first click resumes the context, and
  treats a failed decode as a silent entity rather than a crashed layer.
- **The four archive samples finally ship.** `agent-world-sounds.ts` registers coin/jump/
  ready-beep/go-beep (the samples with surviving callsites) and `product-assets.mjs` now
  scrapes the module — until this, all four 404'd in production because nothing claimed
  them. Media-library sound imports join the same registry on refresh, so
  `StockRoom/Sounds/*.wav` is one import away from being scene ambience.
- Driven live before gating: curated + imported sources both spawn, decode, and PLAY
  (`playingCount: 2`), patch and document round-trips hold, physics and wrong-type guards
  reject. The `media` smoke grew a WAV fixture and a sound block (import → `sounds()` →
  spawn → patch round-trip → document → host layer tracking; playback itself stays
  gesture-gated, so "tracked" is the honest headless assertion).

## 2026-07-20 — `dna-r1`: the Living Forest genome, built but not yet threaded

- **`src/agent-world-dna.ts` graduates §14 phase 4's remaining item.** `dna-tree` grows a forest
  from a seeded genome, carrying the growth rule, leaf-fall motion, hue rule, grove layout, both
  slider ranges and the PRNG verbatim from `nature-lab.ts::buildLivingForest`.
- **The recovered genome is COLOUR ONLY.** `baseHue` drifts with generation; the *form* is seeded
  once and never mutates — the archive's own lesson text says "leaf color mutates between
  generations". Structural mutation is therefore labelled **inferred**, not faithful, because an
  evolving tree whose silhouette never changes is evolutionary in name only. `mutationRate: 0`
  reproduces record-exact behaviour, so the departure is switchable off.
- **There is no fitness function in the record and none was invented.** Selection was a human
  pressing "next generation" (`performForestAction` is literally `this.generation += 1`), so what
  ships is the *mechanism*: `generation` is ordinary scene data an inspector or `api.update` moves.
  The archive's auto-advance timer is **deliberately absent** — a timer that mutates the generation
  makes it runtime state that cannot survive export→load.
- **The budget answers the earlier Living Forest rejection.** `archive-playgrounds.ts` rejected it
  because "the recursion *is* the study" and depth-6 × 13 trees is thousands of entities. Two
  `InstancedMesh` draw calls and a 4000-segment cap resolve that: the recovered grove measures
  2596/1465 and fits untruncated. Growth is breadth-first so a cap drops outermost twigs across the
  whole forest rather than amputating limbs — an over-budget 64-tree depth-8 genome still leaves
  every tree a trunk. Note this is **not** an L-system primitive; it solves this recursion, not
  arbitrary rewrite grammars, and a real L-system remains unbuilt.
- **Determinism is load-bearing and asserted as such:** two systems from one config produce
  byte-identical 41,536-float buffers, export→load regrows identically, and 240 fixed steps land on
  the same frame after a round trip. 88 checks green in Node.

**Deliberately NOT threaded, and deliberately without a screenshot.** Threading touches
`agent-world-runtime.ts` and `agent-world-api.ts`, which another session is editing right now. The
module carries an exact 20-point integration map, and it has no screenshot because the type cannot
reach a browser until step 3 of that map lands — building a showcase scene first would mean shipping
something unseen, which the progress log repeatedly shows is exactly how lighting, scale and sky
defects survive. **Next session: thread it, then screenshot immediately.** Composition note from the
author: the archive trunk is 0.78, so `archive-grove` is short trees over a wide plot and will want
`single-specimen` or a raised `trunkLength` to read as a subject — it was not silently rescaled.

**Still blocked from pushing:** `spiral` remains red (`collectedAfterRings 16` / `hiddenRings 12`).
Twelve commits are held behind that one ring-toggle fix, which is in flight in its own session.

### media-r1 addendum 2: DDS decodes on the way in, and folders import in one click

- **`.dds` imports convert to PNG in-browser** (`src/dds-decode.ts`): a ~150-line CPU DXT1/
  DXT3/DXT5 + uncompressed-masks reader, deliberately not three's DDSLoader — that hands back
  still-compressed mipmaps for the GPU, exactly what a PNG re-encode cannot use. Top mip only;
  an import wants the image, not the pyramid. Driven against the real
  `StockRoom/Sky/Clouds_PosX.dds` (512² sky face, plausible cloud pixels, applies as an
  ordinary texture) and gated with a hand-packed one-block DXT1 fixture asserting the decoded
  pixels are exactly the encoded red.
- **"Select all" in the import dialog** toggles every importable file in the folder — a
  141-file Stockroom sweep is now two clicks (select all, import), with the same sequential
  truthful progress line.

## 2026-07-21 — `spiral-r1` + `dna-r2`: the gate goes green, the backlog ships, the forest is real

### The spiral fix — three causes stacked, one of them a real scene bug

`collectedAfterRings 16 / hiddenRings 12` was not one defect:

- **The sky-rotator was collecting rings.** The port lowered the rings from the legacy flying
  line (y 1.5–2.1) to rolling height but left the rotator verbatim at 1.35 — where the spinning
  bar's swept AABB grazes the tops of rings 7, 8 and 12 by centimetres (bar bottom 1.20, ring
  top 1.27). Triggers respond to ANY mover — *deliberately*: the rules smoke drives a kinematic
  subject and says so in a comment, so gating interactions to dynamic bodies (tried first)
  broke `rules` and was reverted. The scene fix is the honest one: the bar rides at 1.6,
  recorded as an adaptation beside the ring-lowering that caused it. Found by dumping
  `trigger.enter` events: `spiral-ring-12 <- sky-rotator @0.383` names the culprit outright.
- **The harness parked inside ring 1's box** (the in-flight park fix, carried) and **crossed
  ring 1 twice** — once legitimately at settle (the authored spawn sits inside its box), once
  in the collection loop — and its halfway probe at the gate's centre grazed ring 10's box half
  a unit behind the gate. A rolling ball crosses each ring once; the harness now does too, and
  a new assertion pins `hiddenAfterSettle === 1` so scenery collecting anything is a red.

### The deploy pipeline was broken at `npm ci`, and had been for a day

Every main push since `math-r1` deployed **nothing**: CI's npm 10 refuses the lock with
"Missing: @emnapi/core@1.11.2" while npm 11 locally calls the same file complete —
`@napi-rs/wasm-runtime` declares the pair as peers, npm 10 wants top-level lock entries for
them, npm 11's resolver doesn't write them. `npx npm@10 install --package-lock-only` plus an
npm 10 `ci --dry-run` to prove it. The failure mode rhymes with the cancelled-gate gap
`envelope-r1` closed: the gate being green locally means nothing if the deploy in front of it
dies in second fifteen. Check `gh run list` after pushing, not just the local gate.

### `dna-tree` is threaded, and the forest was looked at

All twenty points of the integration map, including the two that bit `formula-field`: the
`isEntityType` guard array beside the union, and the patch path — in the two-arg **merge**
form, `{ dna: { generation: 4 } }` keeps the genome, and the roundtrip smoke now proves it
(`dna.keepsGenome` pins the single-specimen trunk at 1.6, exactly the value a replace-form
patch would reset). `dna()` is on BOTH API implementations; growth ticks inside
`updateSimulation` so pause/step freeze and advance it; the editor grew a ♣ glyph and one
Life-palette chip per genome preset. Screenshotted immediately (`output/dna-shoot/`): the
specimen reads as a subject, the grove is short trees over a wide plot exactly as its author
recorded, the per-tree hue families are visible across the row, trees grounded, nothing
floating, no sky or lighting defects. The composition note held word for word.

### Gate evidence

Full verify in a throwaway worktree at the spiral-fix commit: 19/20, the one red (`games`)
passed in isolation — the documented contention pattern, confirmed before believing it. The
concurrent session's push carried the fix out with the whole archive-revival backlog. A second
full worktree run gates the dna threading commit before its push.

## 2026-07-21 — `sky-r1`: the sky vocabulary opens to imports

- **`api.media.importSky(folder)` turns a datalake folder of six cube faces into a sky set**
  usable through `environment.sky`, registered into the SAME lookup the curated sets use.
  Follows the dynamic-registry pattern the other media kinds already use (`DYNAMIC_SKIES` +
  `registerAgentWorldSkies` + `allAgentWorldSkies`, curated id always wins), so
  `resolveAgentWorldSky` gained a dynamic arm and the runtime's existing `environment.sky`
  validation started accepting imports without being touched. An unknown id is still refused,
  and the error now lists imports too — with a store running, "use one of <the curated six>"
  was a lie that sends the reader hunting a typo in an id that is genuinely registered.
- **The brief's premise was wrong and is worth recording.** `StockRoom/Sky`'s six folders
  (ClearBlue/ClearNight/LostValley/NightSky/SkyX/Winter) are *already* the curated vocabulary
  — the same six ids, already vendored under `public/assets/sky/`. Importing them adds
  nothing. The only un-curated set in there is the one the brief did not mention: the loose
  `Clouds_*.dds` files at the folder root. So the value here is the mechanism, and `Clouds` is
  its one honest proof case — conveniently also the DDS case.
- **Two on-disk conventions, and they do NOT map the same way.** A *directional* set
  (`left/right/up/down/front/back`) applies the archive's left/right axis swap, which is what
  `archiveSkyboxUrls` has always done for curated sets; an *axial* set (`*_PosX`..`*_NegZ`) is
  already named by WebGL axis and maps straight through. Matching is case-insensitive (the
  real datalake ships `Back.jpg` beside `back.bmp` and `Back.JPG`) and ignores `Thumbs.db`. A
  folder missing any of the six is refused up front rather than registering a sky that would
  fail later inside `CubeTextureLoader`.
- **Imports are structurally incapable of leaking into the release manifest.** Curated sets
  carry `basePath` + `extension`; imported sets carry an explicit six-URL face tuple, because
  the store re-slugs filenames and the datalake's names are inconsistent anyway.
  `scripts/product-assets.mjs` scrapes `basePath:` literals out of `agent-world-skies.ts` — an
  imported set has no such field and never appears in that file, so the guarantee does not
  depend on anyone remembering it. The smoke asserts `basePath === undefined` for imports.
- **Faces are stored as ordinary texture records** tagged with set metadata, so a sky costs the
  asset store no new kind, a single face is still applicable as a plain image, and an
  interrupted import leaves usable textures rather than a half-registered sky.
- **The host's sky cache was keyed by id, which is a stale-serve waiting to happen.** The asset
  store reuses a freed id (`uniqueId`), so remove-then-reimport legitimately puts different
  pixels behind the same sky id — and an id-keyed `Map<string, CubeTexture>` would then render
  the old cubemap for the life of the tab. This is the in-memory instance of the exact defect
  `media-r1` paid for at the HTTP layer with `max-age=86400`. Now keyed on the joined face
  URLs. Also `setCrossOrigin("anonymous")`: store-served faces are cross-origin, and
  `orientArchiveCubeTexture` rotates the poles through a 2D canvas, which a tainted canvas
  refuses.
- **Both API implementations, and the human half.** `media` is one module singleton, so
  `importSky` reached both surfaces for free; `skies()` did *not* — `prototype-app.ts` read the
  curated array directly, so the legacy host would never have seen an import. Fixed. The
  editor's Sky dropdown is built exactly once at construction, which would have made an
  imported set agent-visible and human-invisible at the same desk; it now repopulates from the
  live registry, guarded by an id signature because `refresh()` runs constantly and a
  `<select>` rebuilt every frame cannot be clicked. The `sky: skyId as never` cast that existed
  only to silence the old static union is gone.

### Driven live before gating

`media.importSky("StockRoom/Sky")` against the real datalake: axial convention detected, six
DDS faces CPU-decoded to PNG, horizon sampled `#51618a`, registered as `clouds`, applied
through `environment.sky`, rendered, and the editor dropdown read "Clouds". It survived a fresh
page load — the set came back from the manifest via `refresh()`, not from the import call.
Screenshots in `output/sky-shoot/`.

### Defects found in my own work while driving it

- **A comment that was simply false.** I justified duplicating the face-URL builder with "this
  module is imported by the runtime, which stays renderer-free". The runtime imports three at
  line 44. Duplication deleted, real builder imported, drift risk gone.
- **The horizon tint was write-only.** The first cut sampled it *after* registration and
  returned a patched copy, so `api.skies()` would have held a different tint than the call
  returned, and it would have reset on reload. It is sampled before the import now, so it rides
  in the face metadata and persists. Precisely the class `smoke-roundtrip` exists to catch,
  reintroduced by hand in a new place.
- **Two "pole" screenshots that never looked at a pole.** `controls.update()` re-derives the
  camera from its target every frame in the host's one loop, so a bare `camera.lookAt` is
  overwritten before the next paint — four camera poses produced identical images. Aim through
  `controls.target` instead. This nearly became "the poles look fine" recorded from evidence of
  nothing.
- **Mis-staged another session's work.** Staged `platform-host.ts` hunks by numbers from a stale
  listing after changing the differ's context width, which pulled in the bloom session's
  `EffectComposer` imports. Caught by grepping the staged diff for foreign markers.

### Not verified, and not claimed

**Whether the TV3D pole quarter-turn is correct for an *axially*-named set is unknown.** Both
pole views of `Clouds` render continuously with no visible seam, but its pole faces are a
near-radial cloud glow, in which a wrong 90° rotation would be close to invisible. The
directional mapping IS asserted in the smoke (slot 0 comes from `left`, slot 1 from `right`),
and the axial *slot* mapping is asserted too — but the *rotation* is not. A set with
directional detail at its poles would settle it.

### Gate

`media` (#19) grew a sky block covering both conventions in one flow: import → register →
`environment.sky` → export/load round trip → a bad id still refused → curated set intact →
`basePath` absent → DDS faces converted → the editor dropdown listing both imports. Full
`npm run verify`: **all 21 checks passed** (19 smokes + typecheck + build). The first run
reported `FAIL archive-levels`; it passes alone with every assertion green and passed on the
clean re-run — the documented contention pattern, confirmed rather than assumed. Note the first
run's exit code was misread as success because the command was piped into `tail`, so the `0`
belonged to `tail`; the summary line, not the exit status, is what to read.

**Bookkeeping for whoever is next.** The SMOKES array is **19** entries and `media` is #19 —
the handoff brief says #21 and the `media-r1` entry says #18. Count the array; never quote a
remembered number. And the working tree is currently shared with a **bloom/post-processing**
session whose uncommitted work sits in four of the files this workstream touches
(`agent-world-runtime.ts`, `platform-host.ts`, `platform-editor.ts`, plus `smoke-roundtrip.mjs`
and `archive-skybox-spiral.ts`, which are entirely theirs). This commit was staged hunk by hunk
and checked two ways: a grep for foreign markers in the staged diff, and a standalone `tsc`
over the extracted index, so it is self-consistent on its own rather than only inside a tree
that also contains their work.

**Not done:** `play-sound` interactions and the showroom media pass. The interaction seams are
mapped. The highest-risk one is that `interactInternal` handles `toggle-visibility` and then
*falls through* to apply-impulse with no guard — though adding a union member makes that a type
error rather than a silent misfire, so the build catches it. Two design conclusions worth
carrying: the runtime must emit an event for `agent-world-audio.ts` to play (the runtime cannot
own audio — the `AudioListener` and the gesture-gated context are host-only, the same split
sound entities already use), and `targetIds` should become optional for `play-sound`
specifically, so a BallZ ring can chime *itself* without naming a target.

## 2026-07-21 — the revival wave is live

- **Gate 19/19 green; everything shipped.** The 14 held commits reached `origin/main` (a concurrent
  session pushed the shared branch, carrying them with its own), CI is green, and the deploy ran.
- **Verified against the running system, not the build.** `smoke-vehicles` driven at
  `https://graphysx.specialblend.ca/` passes: the Archive Garage is reachable from the production
  front door, 25 entities, all three recovered meshes `ready`, **zero 4xx**. Spot-checked live:
  `/assets/vehicles/archive-impreza.json`, `/assets/archives/milky-way/mars.jpg` and
  `/assets/textures/classic/Checkerboard.png` all 200 — that last one is the exact texture the
  release manifest was pruning, so the trap is confirmed fixed in production rather than in theory.
- **`spiral` is fixed** (`hiddenRings` 16/16) and `dna-tree` was threaded by a concurrent session
  (`dna-r2`), so both items this session was blocked on have landed.
- **The two gate failures on the first run were contention, and the isolation rule caught it.**
  `roundtrip` and `spiral` failed together, both passed alone, and a re-run after a gap was clean.
  Worth restating because it cuts both ways: earlier in this arc a *genuine* spiral failure was
  correctly held back on exactly the same evidence pattern, distinguished only by reproducing alone.

**What is live from this arc:** the recovered CubX assembly · two BallZ arenas · the Impreza,
Cobra and Piste Ovale in the Archive Garage · Flock Planet and the Forces & Flow Garden · the Voie
Lactée · the Math Game as both an entity type and a screen · the Maison massing model · the 2D
overlay layer · shadows · the win state · Browse Scenes and Games & Playgrounds on the front door.

**Still open:** crowds/populations (the last unbuilt Nature-of-Code system), high-res skies, a real
L-system primitive (the DNA module solved *its* recursion by instancing; that does not generalise to
rewrite grammars), and the asset-URL build guard, which is still in flight and remains the standing
fix for a trap that fired four times in one day.

## 2026-07-21 — `audio-r2`: sounds fire from scene data

- **`play-sound` is the third interaction type.** `{ type: "play-sound", sound, volume?,
  positional?, refDistance?, targetIds? }` on any entity, so a click or a trigger crossing
  sounds a source named by the document. A BallZ ring can now chime because the scene says
  so rather than because play-layer code says so — which was the point: the vocabulary, not
  a special case wired into one game.
- **`targetIds` is optional here and on no other type.** The overwhelmingly common case is a
  pickup or gate sounding at its own position, and making it name itself as its own target
  would be ceremony. Empty resolves to the entity carrying the interaction; naming targets
  plays one overlapping one-shot at each. The other two types stay exactly as strict, and the
  smoke asserts that explicitly (`toggle-visibility` and `apply-impulse` with an empty
  `targetIds` are still rejected) so this could not quietly become a general loosening.
- **The runtime still does not touch audio.** It validates and emits `interaction.sound`;
  `agent-world-audio.ts`, which already subscribed to the event stream for entity
  reconciliation, turns that into a one-shot. Same entity-for-identity /
  host-pass-for-effect split as `sound` entities and force fields, for the same reason —
  the `AudioListener` and the gesture-gated `AudioContext` are exactly what the runtime must
  not know about. `interactInternal` returns before the target walk, because a sound is the
  one interaction that reports on its targets without mutating them.
- **One-shots are deliberately NOT tracked in the entity map.** That map is one node per
  entity id, and ten rings collected in a second must produce ten overlapping chimes — a
  keyed map cannot express that, the eleventh would evict the tenth mid-decay. Nodes
  self-detach on `onEnded`, or a ring chimed 200 times leaves 200 parented dead nodes.
- **The source resolves at PLAY time, not at validation** — matching how a model's asset id
  resolves when the loader runs. A document may reference an imported sound before
  `media.refresh()` has landed, so the smoke fires an interaction using the *imported*
  fixture sound rather than only the curated four.
- Threaded through every seam the entity/interaction checklist names: the union, validation,
  `interactInternal`, `resolveInteractions` normalisation (defaults are materialised into
  the stored form, so volume reads back instead of being write-only), the **explicit**
  `getEntityState` projection, the structural `AgentWorldEntityState.interactions` type, the
  receipt, the capability manifest (`interaction.sound`), the stream-event union, and the
  editor's interaction row + type dropdown + sound field.

### Driven live before gating

Real browser, real gesture (the autoplay policy means a click is load-bearing): two clicked
interactions produced `oneShotCount` +2 — actual playback, not merely an accepted document —
and a ball dropped through a trigger volume produced `firedByTrigger: 1`. Self-targeting
resolved to `["chime"]`, an aimed one to `["bell"]`, visibility was untouched by both,
document round-trip carried the sound and its normalised volume, and the guards rejected a
missing source and an out-of-range volume.

### Field notes on a tree with three sessions in it

- **A build failure that was not real.** `npm run build` failed on
  `src/agent-world-crowd.ts` — an untracked file a *third* session was writing at that
  moment (Crowds, next on the handoff's remaining list). Re-running passed with the file
  byte-identical: the build had read it **mid-write** (build started ~09:02:30, the file's
  write completed 09:02:32). Before "fixing" a compile error in a file you do not own, check
  whether you simply compiled someone's half-written save.
- **The base moved mid-session.** The bloom session committed `aad0305` on top of this
  workstream's `97ddb19` while it was in progress; both survived intact, which is the
  evidence that the hunk-by-hunk staging in `sky-r1` actually worked rather than merely
  appearing to.
- Because of the above, the gate for this change was run in a throwaway `git worktree` at
  HEAD with only this diff applied — the main tree cannot be trusted to build while another
  session is mid-write in it.
- Corrected a comment in `archive-playgrounds.ts` asserting that `toggle-visibility` and
  `apply-impulse` "are the only interaction types". True when written, false as of this
  change; the flock-count reasoning it supports still holds and is restated.

### Gate

`media` (#19) grew a `play-sound` block: state projection, self-targeting, aimed targeting,
receipt shape, no-mutation, document round trip, all four guards, and a trigger crossing
emitting `interaction.sound`. **Playback itself is not asserted headlessly** — it is
gesture-gated, so the honest assertion is that the event fired and the layer accepted it,
the same reasoning the sound-entity block uses for `tracked` rather than `playing`. Audible
playback was confirmed interactively instead.

**Final: all 21 checks passed** — but it took four runs to get an honest answer, and the
detour is the most useful thing in this entry.

- Run A failed `games` + `archive-levels`; run C failed `showroom` + `scene-store`. Different
  smokes each time, every one passing alone.
- **The cause: `verify`'s lock is per-CHECKOUT, so running in a worktree defeats it.** Another
  session was running the gate in the main tree the whole time; the two runs starved each
  other on a 16-core box (the handoff already measures one run at ~70% of it). Moving to a
  worktree to isolate from concurrent *edits* is exactly what disabled the guard against
  concurrent *runs*. Checking machine-wide for `node.*verify|smoke` processes — not just for
  the lock file — is the check that actually tells you. With the machine quiet, the identical
  code went 21/21.
- **Run B was NOT contention, and nearly got dismissed as more of it.** `media` failed because
  an assertion of mine was racy: it read the editor's Sky dropdown synchronously, but the
  dropdown repopulates inside the editor's `refresh()` tick, so it lands a frame later. It had
  passed twice before failing. Now it waits for the condition with a timeout — still hard
  (`skyDropdownFound` is its own check), just no longer dependent on which side of a frame
  boundary the evaluate lands — and was confirmed with three consecutive clean runs.

The rule that falls out, worth more than the fix: **wandering failures mean contention; a
failure that stays in the same smoke across runs is probably real.** And a smoke you wrote
five minutes ago deserves suspicion of your own code before the harness gets blamed. Note
`scene-store` appearing in that list is independently unsurprising — it is the known
`EPERM`-on-`rename` defect the handoff lists as the one real outstanding bug, still unowned.

**Not done:** the showroom media pass (ambient sound + an imported-media showpiece), which is
the natural next step now that both halves exist — an imported sky and a sound that fires
from scene data are exactly what a front-door demo would show.

## 2026-07-21 — `crowd-r1`: the last legacy system graduates, and the backlog was lying

### Three of the register's bugs were already fixed

Before writing anything, every entry in `ROADMAP.md`'s "Defect register (real bugs, not
wishes)" was checked against HEAD. **All three were already fixed and none had been struck
off.** The `scene-store` `rename` retry — described for weeks as "the only long-standing known
bug; owned by nobody" — landed in `0bc3f26` as a drive-by inside `feat(envelope)`, an unrelated
commit. The model-recentring bug and the point-light marker opt-out were likewise done. That is
how a fixed bug survives on a backlog: nobody greps the register when they fix something in
passing. A session was minutes from re-fixing a solved problem.

The claim is sticky, too — the entry immediately above this one, written the same day by
another session, still calls `EPERM`-on-`rename` "the one real outstanding bug, still unowned".
It has a bounded retry at `scene-store.mjs:92`. **Check a register entry against HEAD before
spending anything on it**; that instruction is now in the handoff, the roadmap and the spec.

The same sweep found `environment.post` (bloom) fully implemented while `ROADMAP.md` still
listed post-processing as unstarted Horizon 3 work. The first grep for `EffectComposer` returned
only legacy hits and nearly caused a rebuild of a shipped feature; it was a bad invocation,
caught only because the runtime already exported an `AgentWorldPost` type. **Two methods before
believing an absence.**

### The design call: entity for identity, rules for the game

"Crowds" was never a symbol — it is a roadmap label for the NPC population in `race-scene.ts`
(~207 lines). The roadmap's caveat that "the v2 shape needs a target concept before the port is
honest" was correct, and a mechanical lift would not have worked: the recovered system is a
*zombie-infection game mechanic* welded to physics bodies, the player's position, audio cues and
the race win condition.

What shipped graduates the **population and its steering** only. `setRole`/`getRole`/
`memberPosition` are the seam a rules pass drives to express infection, so "what contact means"
stays in the rules vocabulary instead of being hard-coded into core scene vocabulary. This is
the `force-field` precedent — entity for identity, pass for effect — applied a second time.
Consequence worth knowing: **nothing calls `setRole` yet.** That half is a seam, not a feature,
and a reader expecting zombies out of the box will not find them.

### Separation is an adaptation, and it failed the first way it was written

The recovered NPCs never separated. Each was a dynamic physics sphere, so inter-agent spacing was
a *free side effect of solver sphere-sphere collisions* — there is no separation rule in
`updateNpcs` to port. Dropping physics deletes spacing silently.

The first implementation added separation as a steering *aim*, borrowing the flock module's
1/distance weighting. A Node probe measured it doing **nothing**: min spacing 0.189 with it on
versus 0.201 with it off. The cause is structural — members move at a fixed speed with a
rate-limited turn, so a directional push cannot stop two of them converging. What the solver
actually did was resolve overlap *positionally*, so the fix does too: one relaxation pass moving
each overlapping pair apart by half the overlap. 0.839 vs 0.201.

It is labelled an adaptation in the module header, the spec and the commit, because the rest of
the module is faithful and someone will otherwise read this as recovered too.

### `isColor` validates nothing, in three shipped modules

The probe also caught `wanderColor: "not-a-color"` passing validation. `new Color(bad)` does
**not** throw — three logs a warning and returns an unmodified colour, so the try/catch idiom
around it accepts every string. The same helper ships today in `agent-world-flock.ts`,
`agent-world-force-field.ts` and `agent-world-water.ts`: a bad colour passes validation and is
then silently dropped at render. Fixed here by parsing into two sentinels and comparing; the
other three are spun out rather than widening this change.

### Gate evidence, and an honest gap

Three full runs. The one real defect was **in the new test, not the feature**: `crd1` was added
to the post-reload comparison sample but not to the `beforeReload` capture list, so it compared
`undefined` against a real value and reported the crowd as failing to serialise. It reads
exactly like a broken `serializeEntity`, and reading how `reloadFailures` is computed — rather
than trusting the failure's name — is what pointed at the real cause.

After that fix: run 2 was 20/21 (`playgrounds`), run 3 was 20/21 (`media`). Both reds are the
same transport failure — `net::ERR_CONNECTION_RESET` on a **content-hashed** `/assets/` bundle,
followed by a `waitForFunction` timeout that is a consequence, not a cause. It lands on a
different smoke each run and every victim passes in isolation. That is the `net::ERR_*` class
`HANDOFF.md` already documents with two prior transport-level fixes; it is spun out.

**Not done, and stated rather than implied:** the harness flake was *not* attributed to base
versus this diff by running the gate at HEAD. The reasoning is strong — the failures land on
smokes that never touch `crowd`, on asset transport — but it is reasoning, not measurement.
Attribution needs a separate worktree; `git stash` is wrong here because several sessions share
this tree. One such session committed `agent-world-runtime.ts` and `prototype-app.ts`
mid-session; both changesets survived because both staged by explicit path.

Two process errors worth recording, because either would have produced a confident false
report: `npm run verify | tail -60` returns **tail's** exit code, which was 0 while the gate was
reporting three failures; and that same pipe truncated away every failure detail, costing an
isolation run per smoke to recover. Redirect to a file and read the summary text.

## 2026-07-21 — `showroom-r2`: the front door makes a sound

- **A chime ring in the showroom.** A torus trigger volume on the block stack's flight path
  whose interaction is `play-sound "coin"`: knock the stack, the blocks fly through it, it
  chimes. This is `play-sound` demonstrated as *scene vocabulary* on the front door — the
  showroom's response to being crossed lives in the document, not in host code — and it is
  literally the BallZ ring the sample was recovered from, which closes that loop.
- A trigger has no collision response, so the ring never deflects the block that sounds it,
  and the welcome hint now names it so the behaviour is discoverable rather than a secret.

### Two halves of the brief deliberately NOT built

- **No imported-media showpiece.** Imported media lives in the asset store and **production
  has no store**, so an imported texture, model or sky on the front door would 404 in
  production — exactly the asset-registration trap this log records biting three times in a
  single day. The smoke now asserts the ring's sound is a *curated* one (`source ===
  "BallZ 2015 archive"`), so a later edit cannot quietly reintroduce it. The import pipeline
  is demonstrated where it actually works: the editor's Media tab and import dialog.
- **No ambient sound.** All four shipping samples are short effect blips — coin, jump, and two
  countdown beeps. None of them is ambience, and looping a coin chime would be worse than
  silence. Recorded rather than faked, the same way `archive-milkyway` refused to invent
  orbits that were not in the record. A genuine ambient bed needs a vendored loop that does
  not exist yet.

### The assertion that could not see the bug

The ring shipped in its first draft with `rotationDegrees: [90, 0, 0]`, which lays a torus
**flat** like a horizontal hoop. A torus is authored in the XY plane with its hole along Z —
which is the exact axis the blocks travel — so the correct answer was no rotation at all.

**Every assertion passed in both versions.** A torus's collider is an axis-aligned box
(`[diameter, tube*2, diameter]`), so `trigger.enter` and `interaction.sound` fired identically
whether the ring stood up or lay flat; the flat one simply read as an edge-on line that nothing
passed through. Only the screenshot could tell them apart. This is the sharpest case yet for
the rule this log keeps restating: photograph the thing, because a green assertion is evidence
about the collider, not about what a visitor sees.

### Headless measurement lies about this scene, three ways

All three produced confident false readings before being caught:

- **The scene was still loading** when a baseline event sequence was captured — 109
  `entity.spawned` events and two `world.loaded` arrived *after* it, so the interactions were
  fired at entities that were then replaced. Wait for the entity count to go stable, not for a
  guessed duration.
- **rAF advances ~0.3s of simulation per 2.5s of wall clock** here: 92 entities with terrain
  and water under software WebGL. Real-time waiting measures the renderer, not the simulation,
  and reports zero crossings for a ring that works. Step deterministically with `api.step()`.
- **The first play of a sound needs ~600ms** to fetch and decode (`coin.wav` is 419 KB), so a
  1200ms settle read zero one-shots for audio that fires correctly at 3500ms.

Verified after fixing all three: six blocks knocked → **6 trigger crossings → 6
`interaction.sound` events → 6 actual overlapping one-shots**. That last number is also the
evidence for `audio-r2`'s decision not to key one-shots by entity id — six chimes at once, none
evicting another.

### Gate

Full `npm run verify`: **all 22 checks passed** (20 smokes + typecheck + build — the array grew again mid-session, `world1` landed while this was in flight). `showroom` grew a `chimeRing` block: the entity is present and a trigger, its interaction is
`play-sound` on a curated sound, and knocking the stack produces at least one crossing and one
sound event — stepped deterministically, with the reason written beside it so the next person
does not "fix" it back into a real-time wait.

## 2026-07-22 — Rapier RaceScene migration

- Replaced RaceScene's remaining direct `cannon-es` world with a Rapier-native race physics
  boundary. Primitive and archive trimesh bodies, position-based kinematic movers, explicit
  transform/velocity/force operations, grounded contact normals, camera segment casts, and
  spherical/revolute physics-lab joints now run through `src/engine/physics-world.ts`.
- Replaced Cannon `RigidVehicle` (four physical sphere wheels and hinge constraints) with
  Rapier `DynamicRayCastVehicleController`: one dynamic chassis, four visual-only ray wheels,
  rear engine force, front steering, controller update on every fixed substep, and explicit
  controller/body teardown.
- Added `src/physics/rapier-race-primitives.ts` for validated typed trimeshes with internal-edge
  correction, convex hulls, filtered/backface-aware ray casts, support-contact normalization,
  vehicle configuration/sampling, and joint descriptors.
- Verification so far: typecheck green, production build green, built-output foundation smoke
  green with zero console/page errors. Full verify remains the release gate.

## 2026-07-22 — Scene-native mesh colliders and Great Slide

- Extended the engine-neutral physics shape vocabulary and the AgentWorld model contract with
  `physics.collider: "convex-hull" | "trimesh"`; `auto` remains the compatibility default.
  Trimeshes are static-only. Dynamic, kinematic, and trigger models use convex hulls.
- Model collision data is derived at asset load from the same payload and fit/recenter/Z-mirror
  transform as the visual. Entity scale is applied before collider construction. State exposes requested/effective kind plus
  shape/vertex/triangle counts; export/reload keeps exact intent.
- Factored shared Rapier typed-mesh validation and descriptor construction into
  `src/physics/rapier-mesh-primitives.ts`. RaceScene continues to re-export those helpers while
  its raycast, joint, and vehicle details stay isolated.
- Added editor authoring for model collider policy, validation/caps (100k vertices, 100k triangles,
  8192 convex input vertices), and explicit static-only guidance.
- Graduated exact recovered `Media/SlideLarge.TVM` geometry from
  `src/legacy/slide-level.json` into catalogued `archive-slide-large` without inventing geometry.
  Positions, UVs, indices, and bounds are faithful; only the display material and staging are
  inferred. The **Great Slide** starter makes it reachable from Browse Scenes.
- New built-output `smoke-mesh-colliders` passes: asset resolves, static collider reports exact
  100 vertices / 92 triangles, the ball travels from x=20 to x=6.3 down the slope, export/reload
  preserves `trimesh`, moving-trimesh authoring is rejected, and a convex model spawned through
  the bridge falls with finite state. The motion trace also stays above y=1.5 throughout, ruling
  out the free-fall path to the catch basin. Screenshot visually inspected.
- P3 audit found the proposed touched-body Set, vehicle-controller teardown, and copied gravity
  hardening already deployed. They were verified rather than reimplemented.
- Final release gate: `npm run verify` passed all 29 checks in 596 seconds. The gate's isolated
  retry recovered first-attempt local server timeouts in showroom, triggers, and Rapier race;
  every final result was green, including the new mesh-collider smoke.

## 2026-07-22 — Great Slide Gravity Run and composed-play parity

- **The largest visible archive follow-up is playable.** Great Slide is the first Games row and
  an above-fold Browse feature. Its exact 100-vertex/92-triangle recovered SlideLarge mesh is the
  course for a modern two-checkpoint gravity run with live controls, HUD, finish, results, best
  time, replay, and return. The Browse card explicitly separates faithful mesh from adapted scale,
  material, spawn, checkpoints, lighting, and gameplay.
- **Composed games no longer fall through the play layer.** `ballz-play.ts` resolves the controlled
  subject from `rules.subjectId`/spawn/player rather than hard-coding `ballz-ball`; Great Slide,
  Skybox Spiral, and World 1 therefore share the grid games' keyboard/HUD/results contract.
  Composed replay restores a pristine scene document and waits for exact colliders before resuming.
  Composed launch is transactional too: an intentionally aborted SlideLarge request restores the
  showroom behind the open error-bearing shelf, clears the partial game/HUD, and resumes the host.
- **Presentation pass.** A scene-native hidden `playfield` footprint frames wide courses using both
  horizontal and vertical FOV. The Great Slide catch basin is invisible, gate/finish markers are
  legible, and the glass HUD/results treatment stays clear over the recovered sky. The featured
  card has no horizontal overflow at 390×844 and keeps its complete fidelity disclosure visible.
- **Deterministic browser hooks.** The product route exposes `render_game_to_text()` and
  `advanceTime(ms)` for synchronized visual/state inspection. The web-game harness observed a live
  Great Slide run at `[16.284, 5.371, 0]` with finite velocity and no errors.
- **Evidence.** New `smoke-great-slide` passed discovery → exact collider ready → real ArrowLeft
  input → two gates → complete → results → replay → showroom return. Focused `games`, `ballz`,
  `world1`, `spiral`, and `mesh-colliders` smokes passed. Final `npm run verify`: **all 30 checks
  passed**; `overlay` recovered one transient isolated-server reset on the built-in fresh-server
  retry, with no product assertion failure. Screenshots: `output/verify/great-slide-gameplay.png`,
  `output/verify/great-slide-gravity-run.png`, `output/verify/browse-mobile.png`.
- **Map 1 groundwork.** The recovered Map1.TVM payload is now a catalogued scene-native model
  asset (699 vertices/1456 triangles) with exact geometry provenance and an inferred material.
  `smoke-standalone` fetches and validates it; the actual Map 1 game composition remains open.

## 2026-07-22 — Production activation proof and rollback

- The deploy artifact is stamped with `dist/release.json` (`graphysx.release/v1`, exact SHA, run id)
  before packaging. The post-activation job refuses to continue until the public hostname serves
  that exact revision, so a cached or still-active prior release cannot satisfy the canary.
- `smoke:live-release` then runs the focused Great Slide end-to-end proof against production and
  retains its screenshots/results as a 14-day Actions artifact. This covers nginx/TLS/routing,
  split chunks, shelf images, the pruned SlideLarge asset, WebGL/Rapier, rules, results, and replay.
- The activation step records a strictly validated previous-release symlink. A failed live canary
  makes the workflow red and atomically restores that release; retention keeps current + previous.
- Local acceptance: exact-SHA mismatch failed before browser launch; exact-SHA match passed the
  complete Great Slide canary with zero failed responses, console errors, or page errors.

## 2026-07-22 — Environment look controls and Map 1 gravity descent

- Replaced the editor's cryptic bloom checkbox/three unlabeled boxes with a compact authored-look
  card: Subtle, Cinematic, and Neon presets plus visible Power/Knee/Spread controls, state, hint,
  accessible names, and stable smoke selectors. Visual inspection confirmed it fits the 296px rail.
- Environment edits now merge the complete environment through an atomic `set-environment`
  transaction. The editor smoke proves a selected model and its live Three object survive the look
  change while the EffectComposer takes the exact values; off tears the composer down. The
  round-trip sweep is 86/86 and now proves radius plus composer recreation after reload.
- Closed the host-side look resource leak found in final review. One owned PMREM generator now
  produces and caches one render target per exact six-face sky key; repeated bloom/envelope edits
  preserve the environment texture by identity, pending sky loads are deduplicated and race-safe,
  and every cube map/target plus the temporary RoomEnvironment is disposed by its owner. The editor
  smoke also proves an out-of-range typed bloom value is rejected without rebuilding the world.
- Added **Map 1: Gravity Descent** to Games. Its exact 699-vertex/1,456-triangle recovered mesh is
  both render geometry and Rapier trimesh; one modern halfway gate, controls, HUD, results, replay,
  return, lighting, safety floor, and framing are explicitly adaptations. The original materials,
  controller, spawn, checkpoint intent, camera, timing, and rules remain absent.
- `smoke:map1` drives real ArrowUp and natural 60Hz motion across the collider: halfway at about
  step 780, finish at step 949, finite throughout, exact replay collider, clean showroom return,
  and zero failed responses/console/page errors. Screenshot inspection caught the inherited 46-unit
  camera cap landing inside the 72-unit course; the host focus API now permits an explicit larger
  course cap while retaining 46 as the showroom default.
- Scene-authored IBL controls are complete: Automatic/Sky/Studio source, intensity, aligned yaw,
  backdrop intensity/blur, Natural/Soft/Hero editor looks, bounded PMREM reuse, async-source race
  safety, and renderer/export/reload coverage. Next: a licensed 1K HDRI and focused
  Physical-material migration for recovered Phong meshes.
- Final release-candidate `npm run verify`: **31/31 passed**. The Games smoke used one isolated
  fresh-server retry after a localhost connection reset; all product assertions and browser error
  checks passed. Map 1, editor PMREM identity/invalid-input coverage, and the hardened 22-check
  store-auth smoke are part of that full gate.

## 2026-07-23 — `level1-r1`: the mega-world at 1:1, and the third pin

The fifth and last archive mesh-world port (`0b31c5d`). "Level1 2011: The Long Canyon" is on
the Games shelf: the recovered 828-vertex / 1648-triangle Level1.TVM at its native 1135-unit
span, exact trimesh collider from the same vendored payload, two gates and a finish down the
descent, results panel, replay, showroom return. Full gate 32/32.

### The third pin

The roadmap's old claim was that Level1 2011 "cannot currently be rendered at all" because of
the fixed far plane. That was pin one (fixed by `environment.envelope`); mesh collision was pin
two (fixed by scene-native trimesh). Landing the port found a **third**: `asset.fitSize` capped
at 1000 in `agent-world-assets.ts`, written before any asset that large existed. This mesh was
the first thing to ever hit the line — compose failed outright with a validator error. The cap
is now 10000 with the reasoning recorded at the site. The lesson generalises: a capability
unblocked by two fixes can still be blocked by a third stale limit nobody has hit yet, and only
actually composing the thing finds it.

### Derive, fail, measure

The first composition placed spawn and gates from the decoded vertex height profile. The spawn
missed the start plateau's edge and the ball fell past the entire world — to y −11,863 — also
tunnelling through a 2-unit-thick catch floor at fall speeds of ~2 units per fixed step (now 30
thick; at mega-world speeds a thin floor is a coin flip per step). The fix was not better
arithmetic: a **19-probe physics drop-grid** over the composed scene (probes spawned through
the public API, stepped deterministically, catch floor removed so only the mesh answers) mapped
where the floor actually is. It found what no derivation would have: a hole near z −260 that
plumb drops thread, and the mesh simply *ending* before z −560 — the first finish had been
placed off the edge of the world. Every gameplay coordinate now comes from that measurement,
and the provenance record says so: gate placement started under `faithful` ("follows the
decoded profile") and was moved to `adapted`, where it always belonged.

### Deterministic to the step, and the screenshot rule pays again

Two independent smoke runs finish at exactly **step 2245** — 37 simulated seconds, spawn → rim
gate → deep gate → canyon mouth. And the framing took two captured frames to get right, both
times with every gameplay assertion green: a 1135-unit world subtends the entire frame end-on,
so no focus distance helps until the approach direction is broadside — `focusOn` derives its
direction from camera-minus-orbit-target at call time, and the orbit target is still the
showroom's when the framing helper runs. Commented in the helper. The terrain materialises as
`MeshPhongMaterial` via the vendored-materials path; the smoke records the type and asserts
lit-ness rather than guessing a class that belongs to the PBR-finish pass's own coverage.

## 2026-07-23 — Wave 12 material-slot authoring

- Added stable, renderer-neutral model material-slot state and sparse
  `modelMaterialOverrides` authoring. Exact Archive Garage inventory is 7 Impreza assignments,
  5 Cobra assignments, and 1 Piste Ovale assignment; no unsupported source material was invented.
- Added property-aware Phong/Standard/Physical validation, local per-assignment clone overrides,
  source restoration, repeated-source metadata, two-level patch/transaction/store merges, bridge
  parity through existing generic tools, and portable export/load with empty resets omitted.
- Rebuilt the model Materials inspector as compact slot disclosures with supported controls only,
  source/type/map/status context, accessible labels, presets, and one/all reset. Primitive material
  controls remain unchanged.
- Hardened ownership and async behavior: failed multi-texture loads dispose every successful
  sibling; retired override clones never dispose shared source maps; teardown deduplicates owned
  materials/textures and includes detached sources; stale or disposed model loads cannot mutate a
  replacement runtime.
- Extended vehicles, editor, and scene-store smokes for exact identities, isolation, disposal
  cycles, transparent glass, remote sparse merges, late-load reset/replacement races, round trips,
  and human-editor persistence.
- Hardened isolated-server teardown after the full gate exposed a real harness wedge: when a
  Chromium attempt died during a localhost reset, `server.close()` could wait forever on its
  half-open socket because request timeouts are intentionally disabled. Teardown now stops accepts
  and closes the departed child's remaining connections before retrying on the fresh server.
- Final local release gate: **31/31 passed** (typecheck, build, two Rapier probes, and all 27
  browser/node smokes). Overlay used one isolated fresh-server retry after a localhost connection
  reset; the retry passed, the teardown returned immediately, and no product assertion failed.

## 2026-07-23 — Wave 13: five authored light worlds, one stable scene field

- Expanded the reflection-lighting registry from one proof asset to five intentionally different
  Poly Haven 1K HDR environments: Studio Small 08, Studio Garden, Overcast Soil, Lilienstein,
  and Vignaioli Night. All binaries are vendored and their exact source, author, CC0 license, size,
  and MD5 stay beside them in `public/assets/hdri/README.md`.
- Kept the scene contract small: `environment.lighting` still stores `source: "hdri"` plus one
  stable ID. No URL, loader state, texture, or PMREM target enters a document. API/bridge/store and
  old-scene compatibility therefore reuse the Wave 11 path unchanged.
- Removed the editor's hard-coded `studio-small-08` readback. The selected registry ID now drives
  both the document and renderer, while the compact lighting card shows the look description and
  an explicit CC0/author Poly Haven link. The visible cube sky remains independent.
- Evidence: typecheck and production build green; release manifest contains all
  five HDR files; standalone enumerates the exact catalog at 82 tools with zero parity drift;
  99/99 round-trip properties pass using `vignaioli-night`; the editor decodes all five real HDRs,
  caps its PMREM cache at four, evicts Studio Small, preserves the active Rainy Night target and
  backdrop, fits the 296px rail, and reports zero HTTP/console/page errors.
- Full `npm run verify`: **32/32 passed**. Games, Milky Way, Maison, and Rapier Race each used one
  isolated fresh-server retry after a localhost transport reset/timeout; all final attempts and
  every product assertion were green.

## 2026-07-24 — Wave 14: the BallZ look becomes scene data

- Rechecked the remaining handoff against HEAD before coding. Audio was already complete in
  `audio-r1/r2`; GitHub had no open issues or PRs; production still served the Wave 13 merge.
  The first real unfinished enrichment was §14.5's BallZ shader/look pass.
- The old deferral was correct when written but obsolete now that authored bloom and curated HDRI
  lighting exist. Materialized grid levels opt into Golden Meadow reflections and restrained
  bloom while the Lost Valley cube stays the visible backdrop. No schema, API, bridge, or
  BallZ-private renderer was added.
- Focused built-output smoke is green: real HDR decode + PMREM, exact composer values, independent
  cube backdrop, export/load survival, ice surface semantics, controls, collision, rings, finish,
  HUD, win/replay, and no console/page errors. The web-game client also exercised the production
  game route and emitted synchronized `render_game_to_text` state without errors.
- Full release gate attempt one passed 28/32; BallZ, Overlay, Media, and Level1 2011 failed only
  before assertions on localhost page/store reachability. Each passed immediately against a stable
  isolated server. With no worktree-owned process left behind, the complete gate was rerun from a
  clean build and passed **32/32** with no timeout changes or weakened assertions.

## 2026-07-24 — `quarantine-r1`: the crowd conversion gets a browsable home

The `crowd.conversion` mechanic (`4af96fa`, "contact conversion") existed only in tests —
`setRole` had a caller, but nothing a visitor could open. "The Quarantine" (`b554d1b`) is that home: a Browse
starter beside Living Systems. A 90-member ground crowd on the `pursuit` preset (which carries
the recovered 0.85-contact / 3s-grace infection verbatim), three seed pursuers, a containment
beacon at the crowd's focus point. Open it in the editor and the population flips as you watch.
The recovered zombie-hunt as ordinary scene data: no player, no scripting, no invented win
condition — which is exactly the entity/rules split the crowd graduation chose.

**A behavioural probe caught three defects `tsc` could not**, and this is the entry's real
lesson: a starter that typechecks is not a starter that composes.

- The beacon carried a `pulse` behaviour on `static` physics; the runtime rejects transform
  behaviours on non-kinematic bodies. Dropped the collider — a crowd is steered, nothing
  collides with it, so the body was never needed.
- The `pulse` shape written first (`property`/`amplitude`) does not exist; the real one is
  scale-based (`minimumScale`/`maximumScale`). Guessing a vocabulary shape from memory instead
  of reading the type is how it slipped in.
- The descriptor claimed 6 entities; `starterLights` returns 2, so it is 4.

Verified through the real runtime, not asserted: `loadStarter` composes 4 entities, the infection
spreads 3→11 pursuers over 12 simulated seconds, each conversion fires a `crowd.converted` stream
event, zero errors, screenshotted twice. The shelf-thumbnail settle time is bumped to 7s because
the 3s conversion grace means a shorter shot catches an all-pale crowd and misses the whole
subject — commented at the capture site.

**The concurrency guard proved itself, twice, unprompted.** The `quarantine` gate hit another
session's running verify and was cleanly *refused* by the now-machine-global lock (`f6dccdb`);
`npm run verify -- --wait` queued it and it took the lock automatically the moment the other
finished. The exact scenario that produced five-of-six unreadable runs on 2026-07-21 was a
non-event. Its two reds (`triggers`, `media`) were the documented `net::ERR_*` / `fetch failed`
transport flake under the loaded box — both confirmed passing in isolation, neither touching a
Browse starter, per the check now written into `CLAUDE.md`.

## 2026-07-27 — `ballz-finished-r1`: the two-body player, the chase camera, and `api.steer`

The finished BallZ game per `BALLZ_GAME_DESIGN`: the author's original control model —
a **fire-arrow** the player aims and a **caged ball** that is the only physics body —
rebuilt as ordinary v2 vocabulary. Provenance stays honest: the layouts are `faithful`
recoveries; this control/camera/feel layer is the author's design intent, recorded as
`adapted`, never claimed as recovered bytes.

### Steering as scene vocabulary, not play-layer code

A dynamic entity can now carry a `steering` block (heading, thrust/turn inputs, force,
per-direction speed cap, turn rate, kick impulse, `arrowId`), integrated by the runtime
inside the deterministic simulation step — so `pause`/`step` drive it exactly like an
emitter, which is what makes an agent's game *replayable*. One new API call, `steer(id,
{ headingDegrees?, thrust?, turn?, kick? })`, on **both** implementations and the bridge
manifest (`control.steer` capability). Inputs land on edges (keydown/keyup, a throttled
pointer move), never per frame; the continuous work happens in the step. The per-direction
cap lesson from the held-key patch is honoured at the vocabulary level: a push is
suppressed only when the body is already fast along that push's own direction, so the
brake and a turned heading keep authority at the cap.

The runtime also anchors the arrow entity at the subject every step (x/z from the body,
its own authored y, yaw = heading), written to the arrow's definition as well as its
object so `state()`, `export()`, and the screen never disagree. Serialisation carries
pose + tuning and deliberately drops the transient inputs — a saved scene must not reload
with a phantom key held down.

### The two-body player in the materialiser

`ballz-ball` is now the **cage**: a 12-segment wireframe sphere at exactly its physics
radius (the struts the player sees are the surface that touches the world), with a solid
checkered core parented inside — a child of a dynamic body inherits its quaternion, so
both roll as one and the checker still tells rolling from sliding. The fire-arrow is a
`group` with an emissive shaft + cone head above the bloom threshold. The four grid push
interactions remain on the ball, deliberately: serialised control vocabulary a smoke or
an agent can still fire.

Ratios per the design doc: mass 1.7, friction 0.55 (the sphere genuinely rolls on wood),
restitution 0.5 (lively-but-settles; multiply-combine against the walls' 0.08 keeps arena
hits absorbed), thrust reaching the cap in ~0.4 s, kick ≈ 5.5 m/s at full power.

### Both control schemes, chosen by the scene

The play layer picks by what the subject carries: a `steering` block gets ←/→ aim, ↑/↓
thrust/brake, Space kick, mouse point-to-aim (host raycasts the play plane; the layer
only calls `api.steer`) and click / drag-for-power launch. A subject without one — the
composed courses' balls — keeps the held-key per-axis pushes unchanged.

### The chase camera, in the one shared loop

Play mode with a steerable subject runs a follow camera in `tick()`: behind-and-above at
~38° (screenshot-verified against the 30° first cut, where a spawn beside an arena wall
was occluded and the arrow hid behind the ball), yaw following the arrow with exponential
damping, replacing `controls.update()` for the frame so the orbit spherical state cannot
fight it. The orbit target stays synced to the ball, so leaving play is seamless. No
subject → the fixed play framing, exactly as the play layer falls back.

### Laps, honestly

`composeBallzLevel` now reads the archive's `levelListFacts.laps`, so the classic levels
run their `nbrTour` = 3 tours and the recorded `laps-reduced-to-one` deviation is retired
(the entry in `archive-ballz-levels.ts` says so rather than silently vanishing).

### Verified

`smoke-ballz` extended: steering block + arrow + core exist and round-trip (inputs
excluded), aim receipt, thrust accelerates along the heading with zero lateral drift,
per-direction cap holds (7.18 measured vs 7.02 cap + solver overshoot), brake bites at
the cap, kick imparts 5.5 m/s, arrow anchored within 0.05 of the moving ball, chase
camera behind/above with the ball frame-centred and the orbit target synced, archive
level arms 3 laps, keyboard drives the ball through a real held keydown, win flow
intact. Two harness fixes that are not assertion weakenings: waits on the HUD's own
repaint / the runtime's own phase instead of wall-clock guesses, because the software-GL
main thread starves timers — the 600 ms that used to be enough saw a mount-time snapshot
of the previous run.

### Full-gate follow-up (same day)

The 2-core sandbox gate surfaced two smokes still asserting the pre-`ballz-finished-r1`
truths, updated to the new semantics rather than weakened: `smoke-archive-levels` now HOLDS
ArrowUp across the deterministic steps (an instant press is zero applied force under
continuous thrust, by design) and completes the classic level over its honoured three tours
(lap banked after tour one without winning, rings staying collected across laps);
`smoke-games` asserts the chase camera — orbit target synced onto the ball, camera
behind-and-above — instead of the old fixed play framing it replaced. Two other gate reds
(`editor`, `vehicles`) were proven environmental on the starved box: the vehicles failure
set is byte-identical on a tree without any of this work (models never reach `ready` under
load), and the editor red is the documented slow-first-paint timeout. CI is the authority
for both.

## 2026-07-27 — `agent-play-r1`: an agent wins BallZ, and races become per-subject runs

Rung 1 and rung 2's engine half of the AgentX arc (BALLZ_AGENTX_MULTIPLAYER_PLAN), same day
as `ballz-finished-r1` because the steering vocabulary was built to make them cheap.

**`tools/ballz-agent-driver.mjs` — an agent plays the game.** A policy loop that speaks ONLY
the discoverable bridge (`query` / `rules.status` / `steer` / `step`; never `__GRAPHYSX__`
directly), with a deterministic pause+step game loop deciding at ~6 Hz of simulated time.
Naive greedy pursuit measured itself into Level 1's central diamond (10/20 rings, then 400
simulated seconds pushing a wall), so the agent pathfinds — over the authored grid it reads
through `levels.get`, the same discoverable data the materialiser builds walls from. BFS,
line-of-sight waypoint smoothing, stuck-kick backstop. Baseline on `archive-ballz-level1`:
**20/20 rings, 3 laps, complete in 123.7 simulated seconds, zero kicks** — the number a
model-driven (AgentX/Ollama) policy gets to beat. Win-panel screenshot in the session record.

**Per-subject runs (`rules.subjects`).** A rules block can now name its racers; each gets its
OWN run — laps, ordered gates, clock — advanced from the same trigger stream, attributed by
who crossed. `subjectId` stays the primary and `status()` keeps answering with it, so every
existing consumer (HUD, win panel, chase camera) is correct unmodified. Collectibles are
deliberately SHARED in a race: a taken ring hides itself for everyone, so requiring each
racer to personally cross every ring would make all runs but one unwinnable — rings are
co-op world state, the race is the laps. New `rules.standings()` (both impls + bridge)
returns the ranked board: finished first by time, then laps/gates/pickups; ranking is a pure
function (`rankSubjectRuns`) so a HUD and an out-of-process spectator rank identically.
`rules.reset()` returns every racer to its mark, not just the primary.

Verified in `smoke-ballz`: a spawned rival driven ring → halfway → finish completes ITS run
while the primary's stays running (strict gate attribution), the ring banks in BOTH runs
(shared), standings rank the rival first, and `subjects` round-trips through the document.
`smoke-rules` re-run green — the solo path is byte-compatible (the per-subject branch only
exists when `subjects` is declared).

## 2026-07-27 — Wave 16 groundwork: the sky pipeline, and a defect that was already dead

**`scripts/vendor-sky-from-hdri.mjs`.** The "genuinely high-res skies" item split honestly in
two: pixels and provenance need a 4k/8k panorama this sandbox cannot download (Poly Haven
403s from here), but the missing *tool* is done — equirect Radiance HDR → six faces in the
archive file convention (`left|right|up|down|front|back.jpg`), with the loader's TV3D
quarter-turns pre-baked inversely into up/down so `orientArchiveCubeTexture` lands them
exactly right. Radiance RLE decoder in ~60 lines, pure-math cube projection, ACES+sRGB tone
mapping, Chromium as the JPEG encoder per the `vendor-sky-jpeg.mjs` precedent — zero new
dependencies. Verified: a 512² set from the bundled 1k lilienstein, horizon-ring montage
seamless across all four side faces.

**The `--verify` lesson cost three attempts and is worth recording.** Per-texel comparison of
the reprojected set against the source scored ~20/255 on a KNOWN-good projection — grass and
canopy at the source's own Nyquist disagree with themselves by ~14/255 under a quarter-degree
jitter, and the error was invariant with face resolution, so it was never going to average
out. The working design compares the WRITTEN FILES (decoded, loader-turns applied,
box-reduced to 16²) against the pre-bake reference reduced identically: texture phase
cancels exactly, JPEG noise floors at ~1/255, and a swapped file, missing quarter-turn or
flipped axis scores tens to hundreds. Measured result on the test set: 0.16/255 overall.

**Water-grey-at-grazing was already fixed** — the ledger lagged a third time (the CLAUDE.md
check-against-HEAD rule keeps earning its place). `agent-world-water.ts` carries rf0 as a
uniform at the physical 0.02, distance tinting, and adjustable specular; screenshot at a
deliberately grazing camera shows the surface mirroring the actual skyline with no pale
wash. Ledger updated with the evidence rather than silently.

## 2026-07-27 — `ballz-game-r1`: the RECOVERED ball, the title screen, and the race start

Yanik's correction landed and was right: the two-body ball was never an invented wireframe —
the archive holds it. `BallShell.tvm` (the cage), `BallCtrl.tvm`/`BallFire.tvm` (the inner
controller wearing `FireArrow800.JPG` — the arrow TEXTURE is the aim indicator), all decoded
long ago into the legacy tvm-catalog and used only by the legacy path. `vendor-ball-meshes.mjs`
republishes them verbatim as curated `graphysx-mesh-json` assets (faithful provenance); the
materialiser now spawns the shell parented to the invisible collider sphere and the FireArrow
ball as the steering-anchored aim (full-position anchoring + `arrowLift`, since the aim rides
the subject's centre and follows a jump). Shell translucency is a recovered-PBR profile.
Lesson recorded: a payload without `bounds.size` fails `modelFit`, and the failure hides as a
forever-"loading" asset.

Controls corrected to the original: **Space jumps straight UP** (`steer.jump` + `jumpImpulse`
tuning — aiming is the arrow's job), and the **mouse HOLDS to roll**: pointer aims, held
button is the accelerator, release coasts (the click/drag-kick scheme is gone; `kick` remains
API vocabulary).

The game got its front door: a branded **BallZ hero card** on the Games shelf (fire-gradient
wordmark) opening a **title screen** (`ballz-menu.ts`: Start Game + the course roster —
First Course, Level 1 T Course, Level 2 Z Maze; those ids no longer listed generically), and
a **3 · 2 · 1 · GO race start** in the play layer: controls locked (except when the world is
paused — a deterministic harness is never held by presentation), `rules.reset()` at GO so the
clock measures driving. Cancellation is the design: any programmatic activity (revision bump
or pause) dismisses it, so every smoke and the agent driver keep exact prior behaviour. The
revision baseline is taken at the first TICK, not at mount — mount happens inside the
`world.loaded` dispatch, before `create()` bumps the revision, and a mount-time baseline made
the countdown self-cancel flakily.

Verified: smoke-ballz green (recovered-model assertions replace the wireframe ones),
smoke-games green through the full ceremony (hero → title screen → countdown → chase →
exit), screenshots of the shell + FireArrow ball in the arena.

## 2026-07-27 — `revival-debt-r1`: the TVM catalog becomes scene vocabulary

Fresh-clone debt sweep, verified against `2625643` before implementation. The surviving
`tvm-catalog.json` contains exactly **14 non-ball assets** and **36 alphabet assets** — not
anonymous blobs after all. `CubXScene.cpp::LoadLettersAndNumbers` in the workshop supplies
the missing identity/provenance for the latter (`Media/alphabet/A.tvm` through `Z.tvm`, then
`0.tvm` through `9.tvm`). `scripts/vendor-tvm-meshes.mjs` now republishes all 50 payloads as
curated `graphysx-mesh-json` assets with source bounds/materials, disclosed neutral PBR
adaptations, and catalog roles. The generated public catalog exposes 14 `archive-prop` and
36 `glyph` assets to agents and the editor.

The first headline use is live. BallZ's CSS countdown is now only a compatibility fallback:
ordinary scene groups display recovered 3D meshes for **3 · 2 · 1 · GO**, while archive
levels carry a recovered mesh **LAP 1/2/3** display beside the finish. The play layer changes
only entity visibility, mirroring the rules lap; export/load and agent edits therefore keep
working. A dedicated screenshot caught the source transform's handedness trap: archive
`RotateX(-90)` came from a left-handed renderer and rendered the Three.js label upside-down,
so the faithful right-handed presentation uses +90. Final screenshots show upright LAP 1
and GO, with no DOM countdown stacked over it.

Verified: `npm run build`; `smoke-ballz` (51 materialised entities on the small test level,
36 glyph + 14 archive-prop catalog records, 4 countdown stages, archive Level 1 = 3 laps,
counter = LAP + three switchable digits, export/load and all gameplay checks green);
`smoke-games` (hero → title → recovered mesh countdown → play → exit/browse, no console or
page errors); and the required `web_game_playwright_client.js` loop (menu clicks, countdown,
ArrowUp input, play-state text capture, no error artifact). Visual artifacts:
`output/smoke/games-ballz-countdown-3d.png`, `output/smoke/ballz-lap-counter-3d.png`, and
`output/web-game-revival/shot-0.png`.

Next ranked work: GridXL/classic + fire/revival ball preset vocabulary, the recorded classic
level floor/sky/companion-post deviations, then Suzanne moving parts and the remaining
player-visible ledger audits.

## 2026-07-27 — `revival-debt-r2`: three recovered balls + faithful classic course bindings

The BallZ title screen now exposes **Revival / Classic / Fire** before starting a course.
The choice persists and materialises as scene data (preset tags + explicit model assets), not
as a renderer-side recolour. The combinations follow the recovered selector vocabulary:
Revival = BallShell + BallFire controller; Classic = BallShell + a faithful BallCtrl geometry
variant wearing the archived **GridXL** skin; Fire = full-size BallFire + BallCtrl controller.
All three are also discoverable `api.prefabs()` / editor chips, with dynamic ball physics and
the same steer/aim contract as the in-game player. `scripts/vendor-ball-meshes.mjs` remains the
single provenance-bearing vendor and now emits the GridXL BallCtrl variant.

The three recorded classic-course presentation deviations are retired. Archive Level 1 now
owns ClearBlue + Alien01 diffuse **and normal** (10×10) + directional-arrow walls; Level 2 owns
LostValley + Checkerboard (20×20) + Wood03 walls. This required graduating normal maps into
the v2 material vocabulary: `normalTexture` and `normalScale` resolve, serialize, apply in
linear colour space, restore correctly on patches, and dispose with the entity. The lowercase
`f` / `h` cells remain floor in the editable grid but materialise as source-scaled, static
0.2-radius / 2-unit companion cylinders at their exact archived coordinates. The trigger is
still local to uppercase F/H, so `gate-line-collapsed-to-cell` remains honestly recorded.

Verified: build green; `smoke-archive-levels` passes both complete courses (census, translation,
containment, steering, 20 rings, three laps, export/load) and additionally proves exact sky,
floor, normal, wall and two physical companion bindings plus the actual renderer map names;
`smoke-ballz` proves all three preset descriptors and instantiates Classic as a 3-entity prefab;
`smoke-games` selects Classic through the human menu and proves the resulting scene carries
BallShell + `archive-ballctrl-gridxl`. No console/page errors. Screenshot inspection:
`output/smoke/ballz-ball-presets.png` (three distinct recovered appearances),
`output/smoke/games-ballz-menu.png`, and `output/verify/archive-ballz-level{1,2}.png`.

Next ranked work: Suzanne moving parts as genuine course obstacles, then the five remaining
NOT_REVIVED and 22 preview/pipeline records re-audited against HEAD.

## 2026-07-27 — `revival-debt-r3`: Suzanne's decoded machinery becomes a playable course

The asset ledger's “source models need GLB conversion” was stale. `suzanne1-level.json`
already held exact decoded geometry for all eight `Suzanne1.*.x` objects: **38,646 vertices,
20,036 triangles**, source bounds, UVs, colours and the recorded Suzanne1UV/twoway bindings.
`scripts/vendor-suzanne-machinery.mjs` now republishes every object as a provenance-bearing
`graphysx-mesh-json` asset, retaining source-space values byte-for-value. Native `fitSize`
plus each source bounds centre reconstructs the shared placement after the v2 loader's
documented handedness conversion. No unrecorded RotatorUV assignment was invented.

They are no longer gallery-only evidence. **Suzanne Machinery Run** is a Games-shelf course
using the exact recovered arena, piston stand/trigger, finish line, door gate, piston,
rotator and rotator cube. The piston, lifting door and rotator cube are kinematic convex-hull
obstacles; the arena and stationary machinery use exact trimeshes. Their disclosed timings
retain the prior restoration's values because the decoded roles prove movement but no complete
2015 timing loop survives. The twelve exact `ringPath` X/Z coordinates become eleven ordered
checkpoints and a final ring, driven by the recovered Classic/GridXL ball.

Verified: build green; `smoke-suzanne-machinery` launches through the human Games path, resolves
all eight assets, proves the 8,208-vertex / 4,116-triangle arena collider and three moving
convex colliders, observes piston/door/rotator motion, traverses all twelve source path points,
and reaches the win state with no HTTP, console or page errors. Screenshot inspected at
`output/smoke/suzanne-machinery-gameplay.png`; the recovered monkey/arena, machinery, rings and
classic player are visible together. The required `web_game_playwright_client.js` human-path
loop also turned east, rolled through Ring 1, and left the player finite on the exact arena at
[-1.706, 0.289, -2.377]; its screenshot and concise state are under
`output/web-game-suzanne/`, with no error artifact.

Next ranked work: re-check the five `*_NOT_REVIVED` inventories and all 22 preview/pipeline
records against HEAD, graduate the remaining player-visible archive content, then run the full
release gate and emit format-patches.

## 2026-07-27 — `revival-debt-r4`: stale debt ledgers reconciled against HEAD

All five `*_NOT_REVIVED` inventories were re-read against the current player-visible product,
not treated as authoritative to-do lists. Three building entries, six BallZ entries and seven
playground entries were stale: the Unity Arena, Maison/Cuisine interiors, exact Archive Level 3,
the 2011 Long Canyon, Great Slide and its gallery, XML/Blender visits, Suzanne arenas, Living
Forest, Orbital Observatory, Physics Lab, Three.js Playground, asset galleries, Input Lab and
Voie Lactée already have faithful destinations. Their verdicts now point to those destinations
and retain the honest reason each item is not duplicated or flattened into less-faithful v2
primitives. The Math hardware screen and four Milky Way alternatives remain named limitations;
inventing a composition, shader, host scene or physics behaviour would exceed the record.

The mission's exact 22 preview/pipeline rows are now pinned by
`scripts/audit-revival-debt.mjs`. Twenty were stale and are marked ported with their concrete
runtime descendant. Two remain intentionally open: writing *new* legacy SceneNET XML has no
specified loss/duplicate mapping, and the untranslated proprietary TV3D shader remainder has no
faithful browser equivalent. Exact legacy XML evidence, v2 JSON export, haze, water and shadow
descendants are already live, so those boundaries do not hide player-visible work.

Verified: the Games/Browse human-path regression is green with three BallZ presets, recovered
mesh GO, classic GridXL play, all shelf destinations loaded, no console/page errors and no
mobile horizontal overflow. The final `npm run verify -- --wait` release gate rebuilt from
source and passed all **35/35** checks, including the 22-row/five-ledger audit, both complete
classic levels and Suzanne's eight assets/three movers/twelve-point route. Final screenshots
were inspected for the mesh countdown, 3D lap counter, all three ball presets, both restored
level treatments, and Suzanne gameplay/results; all are legible, framed and artifact-free.

Delivery: emit the four ordered git format-patches into the requested repository folder.

## 2026-07-28 — `revival-r2`: two sweeps meet, and the delta reconciles them

Two sessions ran the REVIVAL_DEBT_SWEEP in parallel without knowing it: the four commits
above (`b9a4365`…`3b15306`) landed while this session built the same ranked plan against the
same base. On discovery, this session's seven-commit series was NOT rebased wholesale — it
was re-derived as a delta, keeping upstream wherever the two implementations covered the
same ground (glyph vendoring with the richer catalog envelope, the in-scene countdown/lap
stages, the preset mechanism and its prefabs, the scene-document `normalTexture` vocabulary,
the broader ledger reconcile and its `audit-revival-debt` gate) and porting only what the
other sweep did not have:

- **`clearblue-hd`** — Level 1's binding shipped on the recovered 512 px ClearBlue, which
  reads muddy brown at play angles (the recorded reason the binding was once deviated away).
  `vendor-sky-clearblue-hd.mjs` derives a disclosed 2× clarity pass (unsharp + mild tone
  lift, 682 KB at q0.9 — the nightsky q1.0 rule is about pixel-scale chroma this set lacks);
  the style record keeps the archive's own binding name and presentation maps it to the HD
  set. Required companion: `smoke-media`'s curated-sky check re-keyed on identity — it
  counted skies whose source string was exactly "GraphysX archive", which any honestly-
  provenanced derived set breaks.
- **Level 2's humans** — `iNumHuman` = 10 honoured as a wandering crowd (possible since
  crowd-r1, recorded as impossible ever since); deviation renamed
  `humans-placed-not-positioned` because the archived scatter/seed is unrecoverable. The
  `best-time-not-shown` deviation corrected to `best-time-as-medal-reference` (the medal
  scale judges against ScoreBest since the scoreboard landed).
- **Suzanne 1, the 40×40 ASCII arena** — the machinery run revived the `.x` study; this
  composes the OTHER record (`Suzanne1.ASCII`, in-repo bytes `64ec6746…`), which the ledger
  already described as playing. Now it does: 208 dynamic walls in their recorded per-symbol
  textures, the three archived pistons as kinematic movers at recorded cells/orientations
  (±0.5 travel; constant-speed drive disclosed adapted), 45 chain stands, 15 ZRing pickups
  at the archived 0.1°/ms, LINE gates spanning the archived post pairs including the full
  halfway diagonal, laps 3. `smoke-suzanne1` gates it; the Suzanne texture set (objet39,
  Podium, GrassSample, ZRing) and concrete join the registry.
- **A provenance correction** — the gridxl payload claimed GridXL as "the recorded classic
  skin"; no record binds it (the decode kept no material assignment; the ctrl's recovered
  binding is FireArrow800). The claim is now the honest split: geometry faithful, binding
  adapted.

Deliberately DROPPED from this session's original series, superseded by upstream: its glyph
vendoring (same decoded geometry, thinner envelope), its camera-attached glyph marquee (the
in-scene countdown stages + lap display cover the same words; two systems for one job is
clutter — the marquee survives on branch `revival-r1-prev` if camera-anchored words are ever
wanted), its shell-based GridXL look and remove+spawn look mechanism, its registry-level
normal maps (the scene-document vocabulary is strictly richer), and ~14 ledger edits the
upstream reconcile already covered more broadly.

Lesson, recorded because it will happen again: the check-against-HEAD rule applies to
*upstream* too. Verify `origin/main` immediately before generating a patch series, not only
when a session starts — four commits landed mid-session and the first delivery attempt
conflicted on thirteen files.

## 2026-07-28 — `revival-next-r1`: Suzanne 2 becomes a source-shaped v2 game

The next-candidate list was checked against `origin/main` before building. Map-editor race
conversion was already complete (`levels.play()` materialises the Rapier course and
`smoke-levels` covers paint/fill/ASCII/undo/create/play). Rotator and RotatorCube were also
already faithfully vendored and moving in Suzanne Machinery Run. Archive call-site review
found both meshes only under Suzanne 1 backup XML/code; Suzanne 2 never places them, so no
placement was invented.

The remaining Suzanne 2 gap is closed. `archive-suzanne2-scene.ts` composes the exact 40×40
ASCII/XML record as an ordinary v2 game: 313 #/Z/z dynamic walls plus two dynamic effect
walls, 15 rings, three three-body chain stands, three archived pistons with moving plates,
four posts and both LINE gates, the finish board, source spawn/player, and all three XML
objects. Airplane, BonedGate and SuperCage decoded geometry is now republished as three
faithful `graphysx-mesh-json` assets with source SHA/bytes and catalog provenance. BonedGate
uses its exact dynamic convex hull; the 29,298-vertex airplane exceeds v2's safe hull ceiling,
so its exact render mesh uses a disclosed source-bounds dynamic box collider.

The apparent rule conflict was adjudicated in favour of active shipped code, not repaired:
`GamePlayScreen.cpp` advances at `getScore() == 2` while the ASCII authors 15 rings. Rules now
support `collectibles.targetCount`, including collectible-only completion, so *any* two of
the fifteen end Suzanne 2. A runtime fix ensures only the declared player/racers can fire a
rules-bound pickup interaction; dynamic archive walls still report overlaps but can no longer
consume rings.

Verified: `npm run build`, `smoke-rules`, and `smoke-suzanne2` green. The latter proves all
315 walls remain dynamic, the archive census, a piston moves, a deliberately non-adjacent
ring pair completes at 2/15, all three meshes load, and the 371-entity document round-trips.
Screenshots inspected at `output/smoke/suzanne2-arena.png` and
`output/web-game/suzanne2-play/shot-{0,1}.png`: overview and chase views show the grass arena,
source wall textures, moving machinery, rings, posts, player and HUD. The required web-game
client drove the human Games shelf, rolled/turned/jumped the ball from
[-24, 0.669, -33.6] to [-29.072, 0.719, -12.453], and `render_game_to_text` stayed consistent
with the visuals (0/2 of 15 placed, finite position/velocity, no console-error artifact).

Next ranked work: verify and graduate a scene-native day/night rig over the shipped sky/HDRI
stack; then translate `meshlight.shade`; then compose Level 3 as a v2 scene.

## 2026-07-28 — `revival-next-r2`: archived Day/Night becomes scene vocabulary

The race player already carried a private descendant of `Sky.cpp`/`Atmosphere.cpp`; the
remaining gap was authored v2 scenes. `environment.dayNight` now round-trips a cycle duration,
phase offset, and explicit day/night sky + lighting + background endpoints. The host advances
the recovered phase, sun-height, daylight ramp, logistic brightness and horizon-warmth curves
on simulation time, switches the endpoint sky/HDRI only at the source visibility threshold,
and continuously drives sun, moon, hemisphere light, fog, image-light intensity and the
archived sun sprite. Pause freezes it; deterministic `api.step()` advances it.

`archive-day-night-scene.ts` makes that vocabulary player-visible as a 23-entity editable
celestial observatory. The observatory is explicitly a modern inspection set, not a recovered
level. Its ClearBlue HD + Lilienstein day and NightSky + Vignaioli night bindings are likewise
marked adapted because the old atmosphere code did not record image endpoints. Browse lists
the scene first among composed archive visits, and `render_game_to_text` exposes its concise
live atmosphere state.

Verified: `npm run build` and `smoke-day-night` green. The smoke fixes noon at source phase
0.5, steps exactly six seconds to midnight, proves the two sky/HDRI bindings, verifies pause
and document round-trip, and captures `day-night-noon.png` / `day-night-midnight.png`. Both
captures were inspected: the observatory, instrument rings and eight hour beacons remain
readable in the bright mountain day and the restrained black/blue night, with no browser
errors. The required web-game client also took the human front-door → Browse → first archive
scene path, advanced 120 rendered frames, and matched the visible day scene to
`render_game_to_text` (phase 0.7299, ClearBlue HD/Lilienstein, no error artifact).

Next ranked work: translate `meshlight.shade` as a scene-native material with faithful source
semantics and a visible comparison; then compose Archive Level 3 as a v2 game.

## 2026-07-28 — `revival-next-r3`: meshlight.shade translated, vendored, selectable

The 9,298-byte StockRoom source was re-read before implementation (SHA-256
`AE1ECFC…BFF05`). Its source text now ships at
`/assets/shaders/archive-meshlight.shade`; line endings alone are normalized CRLF→LF and the
vendored byte hash (`0EE6F3…5A1C`) is recorded and gated. The release asset manifest claims
the source explicitly, so production no longer prunes a locally visible archive artifact.

`material.shader.id = "archive-meshlight"` is new v2 document vocabulary. It preserves the
normal-map-alpha single-sample parallax offset, `CalculateLyon` half-vector difference
equation and ×60/pow3 shape, independent red-channel specular sampler, `SpecMP`, light
position/colour and the source's +0.15 diffuse floor. Settings patch live and round-trip.
The old 25-offset TV3D cubic shadow-map sampler is the one deliberate renderer adaptation:
the translated result takes Three's point-shadow PCF visibility, preserving shadows without
a second cube render. Room 2 now runs the translation over its exact `tv3dlogo_d.dds` and
`tv3dlogo_n.dds`. Since room2.tvm and the #23 host bind only those two maps although the HLSL
declares `SpecMap`, diffuse red is reused as a visibly disclosed demonstration mask rather
than inventing a recovered third texture.

The six-entity Browse lab compares platform PBR, the shader's red/default `pStrength=.04` +
`SpecMP=5`, and EditorScreen's recorded commented halogen/`.25` tuning. `smoke-meshlight`
proves both translated programs compile without WebGL errors, exact DDS inputs and the
independent spec sampler load, source equations are present in the compiled fragment shader,
live `.11`/`7` patching reaches uniforms, the document round-trips, and the vendored source
ships with its expected markers/hash. `npm run build` and the focused smoke are green;
`meshlight-lab.png` was inspected. The required web-game client used the human Browse card,
advanced 120 frames and matched the visible comparison to world `archive-meshlight-lab`
without an error artifact.

Next ranked work: compose Archive Level 3's exact ASCII record as an ordinary v2 game, then
run the full gate and deliver the complete new-wave patch series.

## 2026-07-28 — `revival-next-r4`: Archive Level 3 composed, replay HUD repaired

The Datalake source was checked again before implementation. `Level3_base.ASCII` is exactly
20×19 (`02CE8ECB…CD34`): 157 `M`, 20 `r`, one `$`, four gate endpoints and 198 `.`.
`levelList.xml` resolves two stale assumptions: it says `bAddFloor=true` and
`SkyDay=NightSky`. The source screenshot shows what that means—178 raised yellow two-way
catwalk cells with purple Alien02 sides over a lower purple Alien02 catch floor, not a
bottomless void. The legacy metadata's `clearnight` binding is corrected to `nightsky`.

`archive-level3-scene.ts` shares one exported canonical row constant with the legacy race and
composes the source structure as 389 ordinary v2 entities: 178 collision platforms plus 178
thin arrow tops, Alien02 diffuse+normal catch floor, 20 elevated checkpoint triggers, the
four individual F/f/H/h posts, full f–F and H–h LINE triggers, the authored `$` spawn and
0.3-radius selected recovered BallZ preset, plus the source-position/adapted-exposure lights.
Rules require every checkpoint, the halfway LINE, the finish LINE, and three laps. Alien02
diffuse and normal are now reusable registered scene textures. The Games shelf headlines the
composition, and the archive API exposes it with source hashes, exact census, archived
158507.313 ms best and faithful/adapted split. That reference also feeds the shared finish
board's medal calculation instead of surviving only as provenance text.

`smoke-level3` proves 178/20/4/2 census, exact texture and normal bindings, NightSky, source
spawn/radius, a real fall from an empty cell to the lower catch floor, reset, all checkpoints,
the ordered LINE gates over three laps, document round-trip and composed replay. Its first
screenshot exposed a shared replay bug: scene state restarted but the HUD stayed frozen on
20/20 and lap 3/3 because the play layer remounted synchronously before load() armed the new
rules. The host now defers that remount one microtask; the smoke pins both fresh state and the
visible `0 / 20 · lap 1 / 3` HUD. `archive-level3-v2.png` was inspected against the archived
screenshot. The required web-game client also used the human Showroom → Games → first card
route, drove forward, turned and jumped; `render_game_to_text` reported the same running
Level 3 world, finite motion from z=6 to z=-0.262, 0/20, lap 0/3, and no error artifact.

Focused verification: `npm run build` and `npm run smoke:level3` green. Next: run the full
release gate, re-check origin/main immediately before packaging, and deliver the new-wave
format-patch series with one-command-per-line PowerShell apply steps.

The first full release-gate pass reached all 40 checks and passed 38. It found one stale
smoke assumption rather than a product regression: `recoveredTvmAssets` counted every
`archive-prop`, so Suzanne 2's three recovered `.x` props changed the supposed 14-item TVM
census to 17. The census is now scoped to the `archive-tvm-*` source family, preserving the
original 14-asset contract while allowing other faithfully vendored prop families to grow.
The other failed check exhausted its retry on local preview-server connection resets after
its product assertions had passed; no Games behavior failed. A clean full-gate rerun follows.

That rerun passed all 39 product/browser checks, but the final node-only store-auth probe
hit the same Windows loopback churn twice before its first HTTP assertion. Its existing
readiness backoff covered under two seconds—shorter than the observed recovery window after
the long browser matrix. The bounded readiness probe now allows twelve attempts capped at
one second (about 8.5 seconds total); auth statuses and every tested contract are unchanged.

Final release verification: `npm run verify -- --wait` passed all 40 checks from a fresh
typecheck and production build. The complete browser/archive matrix, revival-debt audit,
Rapier probes, store-auth's 22 assertions and node-only DNA suite are green. Screenshots are
under `output/verify`; the focused human-route captures remain under `output/web-game`.

## 2026-07-28 — `archive-cup-r1`: the recovered courses become a campaign

The Games shelf now promotes Archive Cup as a first-class nine-round tour: BallZ Levels 1–3,
Great Slide, Map 1, Level1 2011, Suzanne Machinery, Suzanne 1 and Suzanne 2. Round 1 starts
unlocked; each verified clear in the existing `graphysx-level-records-v1` store unlocks the
next. Returning players retain their clears, best times and medals without a migration. The
three courses with recovered ScoreBest values use the existing faithful medal scale; the six
without source times show completion and best time without inventing a medal reference.
Legacy `Level.cs` medal points (100/75/50) are summed separately from the cleared-round count.

Every rules-backed course now records a bounded 150 ms trajectory for a verified personal
best. On replay it materialises as `personal-best-ghost`: a translucent cyan, non-physical,
ephemeral scene entity moved through ordinary `api.update` calls. It is excluded from authored
exports, never starts before the 3·2·1·GO gate, never records a desynchronised finish, and an
older board time cannot be mislabeled by a later/slower first trace. Campaign and ghost state
are both included in `render_game_to_text`. Exiting a Cup race returns directly to refreshed
standings; ordinary Games/BallZ play still returns to the showroom.

Focused verification is green: production build, the pre-existing Games journey, and the new
Archive Cup smoke. The new smoke proves the 1-of-9 fresh unlock, restored 2/9 progress, 175
medal points, round-3 unlock, personal-ghost playback/ephemeral/no-physics contract, text
projection, and race→standings return. `archive-cup-standings.png` and
`archive-cup-personal-ghost.png` were inspected at 1280×800; no clipping or browser errors.
The required web-game client also opened the human Showroom→Games route, advanced rendered
frames, captured the new Cup/BallZ shelf, and matched its scene-mode text projection.

The expanded full release gate passed 39/41 checks in one sweep. Its two misses were audited:
Rapier Race never reached either ephemeral preview server (`ERR_CONNECTION_TIMED_OUT`) and
passed immediately against the stable preview; meshlight's behavior was green but its
byte-identity check exposed that Windows had converted the 9,036-byte LF-normalized vendored
shader to 9,300 CRLF bytes. `*.shade text eol=lf` now makes that provenance contract stable
across checkouts; after rebuilding, the exact `0EE6F3…5A1C` SHA, meshlight smoke and Rapier
Race smoke are green. Together the matrix plus isolated reruns cover all 41 checks.

Next: merge the campaign commit to main, push, and confirm its production deployment.

## 2026-07-28 — `functional-media-parity-r1`: archive revival reconciled to evidence

Started from a fresh clone of `origin/main` at `2ff08fa` and re-read the workshop, Datalake,
registries, not-revived registers and historical SceneNET/EntityNET sources. The new reproducible
parity ledger classifies all 8,823 media paths (5,949 unique hashes; 2,874 duplicate paths;
5,688,234,500 bytes) and 71 functionality records. Final media dispositions are 545 REVIVED,
2,870 ALIASED, 3,421 SOURCE-ONLY, 1,982 OUT OF SCOPE and 5 explicit zero-byte UNRECOVERABLE;
functionality is 66 REVIVED, 3 SOURCE-ONLY, 1 SUPERSEDED and 1 OUT OF SCOPE. Its generator and
audit cannot accept self-evidence or silently stale checked-in output.

Three real gaps closed. Fixed, revolute and rope constraints are now validated, serializable,
patchable v2 vocabulary across Rapier, transactions, undo, export/load, editor, API, bridge and
`render_game_to_text`; the Physics Sketchbook is an ordinary 9-entity/3-joint scene. The exact
authored 2048² BallZ18 Clear Sky faces now ship byte-identically with Unity provenance and correct
native cubemap orientation; no surviving scene binds the material, so current Day/Night use is
labelled adapted. SceneNET now has warning-first deterministic flat v1.2 XML export in both APIs,
the 90-tool bridge and both human authoring surfaces, alongside expanded import compatibility for
the surviving schema families. JSON remains canonical; unsupported entity/material/environment,
rule and joint loss is structured, while duplicates and hierarchy are rejected.

Two old gap claims were stale before this work: the player-visible Piste Ovale–Impreza route
already used the real Rapier raycast vehicle, and primitive entities already carried a live,
single-loop CanvasTexture `surface`. Both dedicated smokes are green. The static Archive Garage
still has no invented drive binding, and multi-overlay composition remains deliberately out of
scope. Remaining source-only functionality is limited to the unbound Projection effect, the
unbound BallZ fluid-layer shader and the physical Arduino panel without a browser-device binding;
five zero-byte files remain explicitly unrecoverable.

Focused QA is green across joints, Rapier race, surfaces, sky/day-night, SceneNET XML, archive
levels, bridge parity, 99/99 round-trip, typecheck, build and both strict audits. Inspected captures
are under `output/smoke`, `output/verify` and `output/web-game`, including the joint workshop,
Piste race, plasma surface, BallZ18 sky and SceneNET export. The generic web-game client exercised
human routes, rendered frames, inspected `render_game_to_text` and found no surviving product
console/page errors. The final full-gate result is appended after the single authorized combined
run; patch delivery stays local and nothing is pushed.

Final combined verification used the required full command exactly once. Its matrix was 45/46:
every type/build/audit/node check and 42 of 43 browser smokes passed; Rapier Race's two ephemeral
preview hosts both timed out at navigation before an assertion. The unchanged affected smoke then
passed in full against the same `dist/` on a health-checked stable preview, covering chassis
motion, drive, suspension, steering, finite state, screenshot and zero browser errors. No gate or
assertion was weakened, and the full matrix was not rerun.

## 2026-07-29 — top-20 production improvements: editor/API foundation

The user expanded the next production package from ten to twenty improvements. The first coherent
slice is now implemented on `codex/top-20-improvements`: bounded redo complements undo across the
runtime, public API, legacy debug API and 91-tool bridge; fresh mutations invalidate redo history.
The human editor adds crash-safe draft autosave/recovery, explicit dirty/saved state, named local
scene slots, local GraphysX JSON and SceneNET XML import, one-click JSON clipboard export, and a
keyboard-accessible Ctrl+K command palette. Toolbar status is an ARIA live region and the shortcut
reference now documents redo and the palette.

`npm run typecheck` is green. The develop-web-game browser client opened the real showroom/editor,
advanced rendered frames, captured `output/web-game/editor-slice/shot-0.png`, and reported the
expected editor-mode `render_game_to_text`; the inspected frame shows the new Redo and Import
controls integrated without obscuring the viewport. The existing exhaustive editor smoke is still
running under software WebGL before its targeted assertions are extended for this slice.

## 2026-07-29 — top-20 production improvements: discovery, play, accessibility

The remaining release slices are implemented. Browse and Games now share local search with live
counts, persistent favorites, recent ordering, preference reset and a useful empty state. Play adds
edge-driven gamepad input, mobile touch arrows/jump, a persistent control-mode hint, a real pause
dialog (resume/restart/exit), and fullscreen. Global Display settings persist high contrast and
system/forced reduced motion. The new controls continue to call the public `steer`/interaction,
pause and level APIs rather than introducing private gameplay state.

The dedicated `smoke-top20.mjs` proves all twenty improvements in one production-build journey:
draft recovery across reload, redo branch invalidation, 91-tool bridge parity, Ctrl+K, named save,
JSON/XML import, clipboard copy, accessibility persistence, both shelf helpers, pause/resume,
touch and mocked gamepad API revisions, fullscreen and stored control preference. It caught and
fixed one real initialization bug: Restart's handler read its closure before initialization,
leaving a partial HUD. The built-artifact run is now green with zero console/page errors. The
unchanged full Games/Browse smoke also passes against `dist/`, including desktop/mobile layouts,
full countdown, play/return and editor entry. Inspected captures are `output/smoke/top20-editor.png`,
`top20-play.png`, and `top20-browse-search.png`.

## 2026-07-29 — top-20 production improvements: release gate

The single full release invocation completed 46/47 on its first diagnostic pass. All Top-20
assertions, legacy gameplay/editor routes, archive fidelity audits, physics, persistence, build
and type checks passed. The only failure was a real UI timing regression: crash-safe draft status
replaced the existing SceneNET XML export receipt before its smoke could observe it. Export
receipts now remain visible for three seconds while autosave continues in the background.

After that targeted fix, `npm run typecheck`, `npm run build`, `npm run smoke:scenenet-xml` and
`npm run smoke:top20` all pass against the rebuilt production bundle. The XML smoke observes
`XML 2/2 · 5 warnings`; the Top-20 smoke again proves every new path with zero console or page
errors. Per release protocol, the expensive full matrix was not restarted after a single isolated
failure; only the affected check, the consolidated feature check and static build checks were
repeated.

## 2026-07-30 — Live Sessions r1: authenticated collaboration core

The next milestone is a session layer over the scene store: two humans and an agent in one
live scene, sharing one revision line. Reconnaissance first established that a collaboration
layer already existed — `scene-store-client.ts` applies SSE deltas through `api.transaction`,
and `api.commit` already carries actor, intent and `expectedRevision`. So this slice is
identity and hardening on top of that, not a second mechanism beside it.

`server/live-sessions.mjs` adds sessions, members, invitations, roles, incremental
operations and presence. Every accepted operation applies through `applyCommands` — the same
validated document path `PUT /scenes` and `/changes` already use, so no actor has a private
mutation path. Credentials are 32 CSPRNG bytes stored only as sha256 digests, compared with
`timingSafeEqual`, and shaped `<id>.<secret>` so verification is one compare rather than a
scan over members. Invitations are a separate, short-lived, revocable, use-capped secret;
they are exchanged once for a scoped credential and the browser scrubs them out of the
address bar with `replaceState`. Roles (owner/editor/viewer/agent) are enforced by a
server-side table, agents additionally by an explicit operation-path capability list, and the
operation `path` is an allowlist rather than a namespace walk.

Transport stayed HTTP + SSE. The traffic is deltas down and operations up over ordinary POST,
which is the half of WebSockets we would actually use, and it needs no nginx upgrade block on
the existing deploy. Because `EventSource` cannot set headers, the stream authenticates with
a single-use 30-second ticket instead of a credential in the query string.

The layer fails closed: with no `GRAPHYSX_STORE_TOKEN` the store runs in its tokenless LAN
mode, and session routes answer 503 rather than inherit it. `/health` reports it.

`server/http-util.mjs` was extracted on the way through — `send` and `readJsonBody` existed
twice and the CORS allow-headers list was written out twice, so adding `x-graphysx-session`
would have been a two-file edit with a cross-origin-only failure if either was missed.

Three real defects were found by the assertions and fixed rather than argued with. A client
resuming from a sequence *ahead* of the server was told it was up to date; it is
desynchronised and now gets a resync. Semantic operation rejections inherited
`SceneCommandError`'s 400 and were indistinguishable from a malformed envelope; they are 422
with `code: "operation-rejected"`. A 413 path destroyed the request socket before the status
could be written, so the client saw a bare "fetch failed". Operations are also now serialised
per session, because two members submitting in the same tick were both reading revision R and
the loser took a 409 it did nothing to deserve.

Verification is 137 assertions across three permanent smokes. `smoke-live-sessions` (64)
drives owner, remote editor and agent over real HTTP and SSE: incremental attributed
operations, role rejection, agent capability scoping, duplicate-`opId` idempotency, structured
conflicts, disconnect → resume → replay, dropped history → honest `mustResync`, membership
revocation, and a teardown that leaves nothing online. `smoke-live-sessions-security` (41)
covers fail-closed configuration, cross-session and forged credentials, expired and revoked
invitations, indistinguishable auth failures, origin rejection, ticket replay, payload and
rate caps, a 20-operation concurrent burst with no lost update, and a credential audit across
console, response bodies, activity and disk. `smoke-live-sessions-browser` (32) runs the built
bundle: two browsers plus an external agent, live mutation both directions without a reload,
presence and remote selection, attributed activity, viewer refusal, offline state, rejoin and
catch-up, and zero console/page/request errors.

Two of those browser assertions were vacuous before the screenshot was read. `api.query`
filters on `ids: string[]`; `{ id }` is not a query field, so it was silently ignored and the
assertions were reading entity[0] — the anchor. Two selectors were also unscoped and matched
the scene browser's `data-role="live"` and `data-role="dot"` instead of this panel's. And the
screenshot itself caught what all 29 green assertions missed: the live panel and the scene
browser both dock top-right and were stacked on top of each other. The panel now measures the
scene browser's rect and stacks below it — `offsetParent` was the wrong visibility test, since
it is always null for a `position: fixed` element — and a geometry assertion now guards it.

`docs/LIVE_SESSIONS.md` records the protocol, the transport tradeoff and the threat model,
including six named limitations: sessions are in-memory and die with the store, rate limits
are per member rather than per IP, `actorId` is chosen by whoever redeems an invitation,
store reads stay open, there is no end-to-end encryption, and undo is a boundary rather than
actor-aware undo. Genuine per-actor undo needs inverse operations the runtime does not have.

Typecheck and production build are green. Not started in this slice: persistent best times,
leaderboards, ghost sharing, and the five adjacent debt items.

## 2026-07-30 — Live Sessions r1: results, leaderboards and shared ghosts

`server/results-store.mjs` adds the store-side results concept: persistent personal bests,
bounded leaderboards and shared ghost recordings, keyed by `(recordId, courseVersion,
rulesVersion)`. Reconnaissance first established the existing vocabulary so this reuses it
rather than growing a parallel one — `recordId` from `raceRecordIdForWorld`, `bestMs` as
integer milliseconds, `medal`, `completedAt`, and the ghost trace shape `src/level-ghosts.ts`
already persists, so a downloaded ghost plays back through the existing interpolator with no
conversion.

Two decisions are load-bearing. The layer is **client-attested and says so** on every read
surface, with a smoke assertion that fails if any response starts implying a time was
server-verified; verifying one would mean running the physics here and replaying input, which
is a different product. And results are **separated by compatibility, never compared across
it**: a board is keyed on a hash of the course and rules versions, so a time set on a
different version of a course lands on its own board instead of beating one it was never
racing. `rulesVersion` may be omitted and fingerprinted from the submitted rules block —
a fingerprint, not a version counter, because `agent-world-rules.ts` records a decision that
the rules definition must not carry its own revision and that decision stands.

The desync invariant carries to the server: a desynced run is refused outright, as are
incomplete runs, non-integer times, times below a 250ms floor or beyond six hours, times under
a course's declared `floorMs`, unknown medals and traversal-shaped ids. Ghost validation is
deliberately stricter than the client's on one point — sample times must strictly ascend. The
client never checked, because its playback binary-searches a trace its own recorder produced
in order; a trace arriving over HTTP has no such guarantee and an unsorted one interpolates to
silent nonsense.

Four real defects, all found by assertions and fixed rather than argued with. `rankResults`
sorted on `elapsedMs` while stored entries carry `bestMs`, so every comparison was `NaN` — a
sort comparator treats that as "leave them alone", and the leaderboard silently stayed in
insertion order while the retention pass kept arbitrary entries. Both looked plausible. The
results directory defaulted to a *sibling* of the scenes directory, which resolves to
`/tmp/results` for a store pointed at a temp dir, so every test run inherited the previous
run's board; it is now nested inside the store dir and isolation follows automatically. A 413
was answered on a keep-alive connection while the client was still uploading, so the unread
body was handed to the next request on that socket and surfaced as a bare "fetch failed" on
the request *after* the oversized one; 413 now closes the connection. And `courseVersion`
needed its own pattern — `@` is legitimate in a version token, and unlike `recordId` a version
never reaches the filesystem because only its hash does.

`scripts/smoke-results.mjs` is 47 assertions covering personal-best replacement, refusal
classes, ghost validation and round-trip, compatibility separation across both course and
rules versions, deterministic ordering with stable tiebreaks, bounds, the trust labels,
survival across a store restart, and a parity check that reads the client's `MAX_SAMPLES` out
of `src/level-ghosts.ts` and asserts the server's cap matches. `docs/RESULTS.md` records the
API, the trust model and four limitations.

Not done: browser integration. Nothing in `ballz-play.ts` submits a result and no UI reads a
leaderboard. The constraint that slice must meet is recorded in the doc — `smoke-archive-cup`
asserts zero console errors and its harness runs with no store, so any call on the finish path
must fail completely silently.
