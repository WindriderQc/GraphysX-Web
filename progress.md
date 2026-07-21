# GraphysX Web progress

Original prompt: "lets go then, lets make this happen!!"

- 2026-07-18: Created the standalone web-product repository from GraphysX restoration commit `36eac3d5a023e7a21f7b319e6e335d7ffca7d1d1`.
- 2026-07-18: Kept only the runtime source, curated browser assets, operational QA, and agent adapter. Historical archives and generated browser output remain in the source GraphysX repository.
- 2026-07-18: Added an atomic static release workflow for `graphysx.specialblend.ca`.
- 2026-07-18: Vendored the ten vehicle models/textures used at runtime and removed the final build-time dependency on the historical archive tree.
- 2026-07-18: `npm ci` and `npm run build` pass with the Linux-generated cross-platform lockfile; Vite emits the ten curated vehicle assets in the standalone release.
- 2026-07-18: Generic web-game smoke test produced synchronized canvas/text state with no console errors. Agent World API v2 passed 69 assertions with zero errors. The fresh restoration matrix visually verified both vendored vehicle packs and progressed through the remaining archive worlds until the local command wrapper's two-minute ceiling; the same source baseline previously passed the complete 293-assertion release matrix.
- 2026-07-18 (strategy pivot): Adopted `PRODUCT_SPEC.md` as the North Star. GraphysX Web is defined as a scene engine — a 3D + physics world studio humans and AI agents author and inhabit through one shared runtime — not a web edition of the archive player. The `GraphysX` repo is the upstream workshop (local dev only); games are **rebuilt on this platform**, inspired by the archives, never ported. Rewrote `README.md` to be honest about the in-transition state.
- 2026-07-18 (`foundation-r1`): First product-surface cut, all in `src/prototype-app.ts` (no `race-scene.ts` risk, generic `data-mode-id` dispatch only). `homeDestinations()` reduced from the four archive groups (~34 buttons) to a single platform home that opens the Scene Editor (`world-api-lab`). Home header/body/cards reframed to the platform; BallZ progression cards removed. Version text de-"Revival"-ed and set to `graphysx-web v0.1 · foundation-r1`. Archive modes remain in code but are no longer surfaced.
- 2026-07-18 verification: `npm run build` green after the cut. Foundation smoke (`scripts/smoke-foundation.mjs`, headless Chromium): home renders `GRAPHYSX WEB` with exactly one destination card (`world-api-lab`) and no "ballz" text; clicking it opens the Scene Editor with `window.__GRAPHYSX__` + `__GRAPHYSX_AGENT_BRIDGE__` live and a 16-entity demo world (revision 0); **zero console/page errors**.
- 2026-07-18 (`host-r1`, Phase 2 core): Added `src/platform-host.ts` (`PlatformHost`) — a standalone renderer/host for the `agent-world/v2` model with **zero `race-scene.ts` dependency**. Investigation confirmed `AgentWorldRuntime` already owns its Three.js scene-graph (`group`), cannon-es physics world, behaviors, and deterministic `update(dt)`; `race-scene` only lent a renderer, camera, controls, and the frame loop. `PlatformHost` supplies exactly those: `WebGLRenderer` (matched race-scene config — SRGB, ACESFilmic 1.08, PCFSoft shadows), `PerspectiveCamera`, `OrbitControls` (damped), neutral `RoomEnvironment` PMREM IBL (no skybox assets needed), and one `setAnimationLoop` tick that calls `world.update(dt)` then renders.
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
  `updateSimulation`, run immediately before the cannon step — the one place that sees rigid
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
  three.js / cannon object — and asserts the world genuinely changed, not merely that the value
  was stored. 35 checks are object-verified (castShadow/receiveShadow on the actual mesh, transform
  on `object.position`, material on `mesh.material`, physics velocity off the cannon body, terrain
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
  and the measured effective gravity sits a hair under the configured value because a cannon body
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
