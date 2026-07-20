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
