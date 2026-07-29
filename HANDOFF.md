# GraphysX Web — session handoff

Orientation for whoever picks this up next. Read `PRODUCT_SPEC.md` (especially **§8.1
Reality check**, the honest status table) and `progress.md` first. §8 describes the v1
*target*; §8.1 is what is actually true.

## What this is

A browser 3D scene engine where humans and AI agents co-author **one validated scene**.
The editor and `window.__GRAPHYSX__` are two interfaces over the same runtime.
Deploys to <https://graphysx.specialblend.ca> on push to `main`, gated by `npm run verify`.
After the atomic activation, production must serve a matching `release.json` and pass the focused
Great Slide browser canary. A failed canary makes the workflow red and atomically restores the
validated previous release; screenshots/results remain attached to the workflow run.

## The invariant that matters most

Every editor control and every showroom interaction is an ordinary API call
(`api.spawn` / `update` / `interact` / `levels.*`). No bespoke host code holding scene
state. Human and agent edits land in the same revision history.

If you find yourself mutating the three.js scene graph directly to get something done,
you are breaking the product, not taking a shortcut. The archive modules do exactly that,
which is why they are legacy-only and unreachable from the editor and the agent API.

## Architecture

| File | Role |
| --- | --- |
| `src/platform-host.ts` | Renderer, camera, OrbitControls, ONE animation loop. Zero race-scene dependency. |
| `src/agent-world-runtime.ts` | The v2 runtime: entities, Rapier physics, behaviours, deterministic `update(dt)`. |
| `src/agent-world-api.ts` **and** `src/prototype-app.ts` | **Both** implement `GraphysXAgentWorldApi`. A new API method must be added to both or the build breaks. |
| `src/platform-editor.ts` | Top bar, left scene tree, right inspector, bottom tabbed library, Levels workbench, media import dialog. |
| `server/asset-store.mjs` + `src/agent-world-media.ts` | Runtime media imports: datalake browse/import/upload on the store server; browser side converts foreign models to `graphysx-mesh-json` and registers imports into the curated registries (`api.media.*`). |

`verbatimModuleSyntax` is on specifically so the two remaining type-only `race-scene`
edges cannot silently become runtime imports and drag the 1.4 MB monolith onto the
default bundle with a green build.

**Adding an entity type** — thread it through: the type union, `resolveEntity` (+guards),
`createEntityObject`, `rebuildPhysicsBody`, `updateSimulation`, `applyResolvedEntity`, the
patch path, `serializeEntity`, disposal, capabilities, **both** API implementations, and
the editor palette. Follow how `emitter`, `terrain`, `water` and `flock` did it.

## Verification — read before running anything

`npm run verify` = typecheck + `vite build` + headless-Chromium smokes driven against the
**built** output. Same gate CI runs before a production deploy. Screenshots land in
`output/verify/` — for any visual change, actually look at them.

- **Never run two verifies at once — the gate now refuses to.** A run software-rasterises
  WebGL (Playwright launches Chromium with `--use-angle=swiftshader-webgl`), so every 3D
  smoke renders on the CPU. Measured: **one** run took ~70% of a 16-core box — 113
  CPU-seconds in a 10-second window. Two do not go twice as fast, they starve the machine,
  including whatever browser someone is using to look at the product. `scripts/verify-guard.mjs`
  holds a lock in `output/.verify.lock`; a second run exits 1 with a message. Override with
  `npm run verify -- --force-lock` only when you are certain the holder is dead.
- **If the app freezes while you work, check for a running gate before suspecting the app.**
  A whole session was spent hunting a "lag" that was a concurrent verify. The tell: the
  freeze is a *total* stall — camera, animation, everything resumes together — and a CPU
  profile shows V8 getting a fraction of the samples it is owed, with `(idle)` on top. That
  is the OS descheduling the tab, not the product. The showroom's median frame is 13.3 ms.
- **Runs used to be able to hang forever.** `runSmoke` awaited `close` with nothing bounding
  it, so a wedged smoke wedged the run: two verify parents were found alive **9.5 and 7.7
  hours** after launch, still holding Chromium trees. There are now deadlines (5 min/smoke,
  10 min/build, `VERIFY_SMOKE_TIMEOUT_MS` / `VERIFY_BUILD_TIMEOUT_MS`) and signal cleanup, so
  Ctrl-C kills the tree instead of orphaning it. **The one caught hanging was `scene-store`** —
  the same smoke as the `EPERM` entry below. It does not only fail intermittently, it can hang.
- **Run it 2–3 times with ~20 second gaps.** Back-to-back runs cause Chromium teardown
  contention and produce false failures. Measured: 2/4 fail with no gap, 0/4 with a gap.
  Do not "fix" a product because of this.
- **`dist/` is shared, and the lock does not cover it.** A verify racing a bare `npm run
  build` from another session fails with `ENOTEMPTY: dist\assets` — observed. The lock stops
  two *verifies*; nothing stops a build alongside one.
- **Never weaken an assertion to make it pass.** Three real bugs were caught only because
  strict assertions were kept: objects falling through the world, dead clicks on scenery,
  and a console error on every production page load.
- **If a smoke fails with `net::ERR_*` or a bare `fetch failed`, suspect the harness.**
  Two such bugs are fixed and both were transport-level: a static server using chunked
  encoding with no `Content-Length` (reset on the largest chunk), and servers not setting
  `keepAliveTimeout`, so undici reused sockets Node had closed after 5s.

## Landed

Clean `PlatformHost`; full agent API + tool bridge; rebuilt editor (scene tree, deep
inspector, tabbed library, Save/Load/Export); ASCII/grid level workbench with lossless
round-trip; graduated vocabulary — skyboxes (6 archive sets), particle emitters (8
archive-derived presets), heightmap terrain with a Rapier heightfield collider,
reflective water, flocking (entity type, 0.228 ms/step for 116 members), **force fields**
(4 kinds / 5 presets, entity for identity + runtime pass for effect), a **2D overlay layer**
(`environment.overlay`, 3 Canvas2D sketches, drawn in the one shared `tick()`); showroom with
kinetic physics, click-to-drop, click-to-focus, **shadows**; CI gating production; scene store
+ scene browser; trigger volumes; typed event stream; asset split (`dist` 140 MB → ~65 MB);
**media library** (`media-r1`) — runtime imports from the datalake through the store server,
in-browser model conversion, editor Media tab + import dialog, `api.media.*` on both impls.

**Scene-native model colliders** are now ordinary v2 vocabulary. `physics.collider` accepts
`auto`, `convex-hull`, or static-only `trimesh`; exact meshes are derived from the same fitted,
recentered registered asset geometry the visitor sees. The editor exposes the choice, state reports
effective mesh statistics, and export/reload preserves it. The recovered 100-vertex / 92-triangle
BallZ SlideLarge is reachable as the **Great Slide** starter and is guarded by
`smoke-mesh-colliders` (slope motion, bridge-spawned dynamic convex hull, invalid moving-trimesh
rejection, and round-trip). Shared Rapier mesh construction lives in
`src/physics/rapier-mesh-primitives.ts`; race-only raycast/vehicle/joint code stays separate.

**The three front-door destinations (§5) are all live.** Showroom → **Games & Playgrounds**
(`games-shelf.ts`, every row `api.levels.play(id)`) → framed play with a HUD → **win panel** →
back to the showroom. **Browse Scenes** (`browse-shelf.ts`) is the third: a gallery of curated
starters (`api.starters()`) that open in the *editor* — Browse loads a scene to work on, Games
enters play. No store required for either.

**§13 "v1 done" is essentially met** — see the milestone note at the end of `progress.md`. The
one game rebuilt *on* the platform (BallZ, `ballz-play.ts`) is won by collecting every ring and
*then* reaching the finish; crossing early does not count.

**BallZ is a finished game** (`ballz-finished-r1`): the original two-body control model —
fire-arrow aim + caged physics ball — as scene vocabulary. A dynamic entity can carry a
`steering` block integrated in the deterministic step; `api.steer` (both impls + bridge) sets
heading/thrust/turn/kick, the runtime anchors the arrow entity to the subject, and the host
runs a chase camera in the one shared tick while play has a steerable subject. Keyboard
(←/→ aim, ↑/↓ thrust/brake, Space kick) and mouse (point-to-aim, click / drag-for-power)
drive the same call an agent makes; classic levels run their archived `nbrTour` = 3 laps.
Subjects without steering (composed courses) keep the per-axis push scheme.

**Round-trip sweep** (`scripts/smoke-roundtrip.mjs`, in `verify.mjs`). 97 property and rejection checks
set through the public API and read back through four paths — `state()`, `exportDocument()`, a
reload from that export, and where observable the live Three.js/physics object. It exists because
the same bug kept recurring in different clothes: **a surface that writes state without ever
reading it back**. Four instances found and fixed that way. Run it after adding any settable
field, and prefer an object-verified check over a storage round-trip where one is possible.

**Terrain pad + collider correctness.** Two defects behind the old "collider disagrees with
the mesh near the flatten rim" entry, both fixed in `agent-world-terrain.ts`:

- `flattenRadius` was applied *per vertex*, so the cell straddling the radius had flat inner
  corners and an un-flattened outer one and therefore ramped. The pad was level only out to
  the last grid ring inside the radius — r≈10.2, not 12, on the showroom field. The blend now
  starts one cell diagonal further out, so `flattenRadius` is a guarantee.
- The collider was the *opposite triangulation* of the same corner heights. `PlaneGeometry`
  and the collider split each quad on the same diagonal in index space, but the old single-axis
  index flip mirrored one axis and turned it into the other diagonal in world space — exact at
  every vertex, up to 0.35 units out mid-quad. Mapping the shape's x index along world Z (a
  plain transpose) lands them on top of each other: max |collider − mesh| 0.349 → 0.000.

`npm run probe:terrain` is now a radial sweep (20 radii × 8 bearings, isolated terrain, rest
asserted on position *and* velocity) rather than one drop. Run it after touching terrain.

**`nightsky` BMP → JPEG.** 18.00 MB → 1.18 MB via `scripts/vendor-sky-jpeg.mjs`; product
asset payload 44.2 MB → 27.3 MB, `dist` 66 MB → 49 MB. Encoded at quality **1.0** on purpose:
Chromium only uses 4:4:4 chroma at 1.0, and below it 4:2:0 averages each 2×2 chroma block,
which greys out the one- and two-pixel coloured stars this set is made of (max channel error
44/255 at q0.98 vs 5/255 at q1.0). The extra 0.79 MB buys that back.

## Remaining, in priority order

### Latest revival: `shader-ppl-r1` (2026-07-28)

BallZ2015's active `ppl.shade` path is scene-native now. The exact StockRoom HLSL and
`ball_Normal.png` are vendored with SHA guards; `material.shader.archive-ppl` preserves its
normal-alpha parallax and tangent-Lambert equations, plus distinct 0.03 source-default and
0.025 active `Anneaux.cpp` tuning. Browse Scenes exposes a ZRing-on-sphere comparison lab.
`smoke:ppl` covers source/asset hashes, GLSL compile, active bindings, live patch and document
round-trip; the prior meshlight smoke remains green. `Projection.fx` was searched by exact
filename and by its Fresnel parameters, with no loader/binding found, so it remains source-only.

Delivery note: the full gate was 41/42 only because Media's two ephemeral local stores both
failed their first Node health fetch during heavy loopback churn; the complete Media smoke
passed immediately afterward on a stable host with zero browser errors. Do not misreport that
transport failure as a shader or media assertion failure.

The v1 bar is met, so what follows are **enrichments beyond it**, not gaps in it. Nothing
here blocks a release; pick by value rather than by order.

1. ~~**`server/scene-store.mjs:89` needs a bounded retry on `rename`.**~~ **Done** — and it
   had been done for a while without this list noticing. The retry landed as a drive-by inside
   `0bc3f26` (`feat(envelope)`), an unrelated commit — which is exactly how a fixed bug stays
   on a backlog: nobody greps the register when they fix something in passing. Five attempts,
   `EPERM`/`EACCES`/`EBUSY`, backoff, temp cleaned up (`scene-store.mjs:92`). **Every entry in
   this list is now checked against HEAD — three of them were already fixed when checked.**
2. ~~**Evolutionary / DNA entities** (§14 phase 4)~~ — **Done**: `dna-r2` threaded `dna-tree`
   through all twenty integration points and screenshotted it. This entry stayed stale for a
   full session after the work shipped.
3. ~~**Crowds** — welded inside `race-scene.ts`~~ — **Done**, `crowd-r1`; see the note below.
4. ~~Prefabs are in the API but absent from the editor UI~~ — done: the library's Prefabs
   tab (the default tab) spawns through the same `spawnPrefab` an agent calls.
5. ~~Audio~~ — done in `audio-r1/r2`: the four samples with surviving callsites are vendored,
   placed sources and interaction one-shots are scene vocabulary, and the other upstream files
   were not promoted without scope/provenance. ~~CubX recovered geometry (still 8 plain boxes)~~
   — done, `cubx-r1` graduated the recovered assembly into a prefab. ~~The §14.5 BallZ shader
   pass~~ — done in Wave 14 through authored HDRI + bloom scene data, not a private renderer.
   Remaining optional enrichments: high-res skies — **the tooling half is done**:
   `scripts/vendor-sky-from-hdri.mjs` converts any equirect Radiance HDR (a 4k/8k Poly Haven
   panorama, a datalake capture) into a correctly oriented six-face set in the archive file
   convention, with a coarse-reprojection `--verify` that catches naming/orientation/encoding
   faults against a ~1/255 JPEG floor. What remains is curation: download the panoramas
   (blocked from the build sandbox), run the tool per set, and add registry entries with real
   provenance to `agent-world-skies.ts`; p5-to-texture and multi-layer overlay stacks
   (both named as deferred in `overlay-r1`, both optional in §4).

## Known defects — recorded, not hidden

- ~~**Spheres landing within ~0.1 units of a heightfield cell seam get a lateral kick.**~~
  **Fixed by the Rapier migration.** The legacy solver represented cells as closed triangular
  prisms, so a penetrating sphere could catch a neighbouring rim and receive a tilted contact
  normal. Rapier heightfields use `FIX_INTERNAL_EDGES`; the deterministic seam probe now guards
  against that lateral impulse on a perfectly flat field.
- ~~**Water reads grey at grazing angles.**~~ **Fixed, and the ledger lagged again** — checked
  against HEAD 2026-07-27 per the CLAUDE.md rule: `agent-world-water.ts` already carries the
  full remedy (Fresnel `rf0` as a uniform defaulting to the physical 0.02, distance tint
  attenuation, adjustable sun specular). Screenshot-verified at a deliberately grazing camera
  (1.6 units over a 240-unit sea): the surface mirrors the actual skyline, the near field
  tints, no pale wash. The "still mirrors a pale sky" tail of the old entry described the
  pre-tint state.
- **Ball drop retuned 9 m/0.52 → 6 m/0.34** partly for test stability. Real justification,
  mixed motive.
- ~~**A runtime rollback raises an uncaught error** when a rejected transaction leaves the
  gizmo attached to a destroyed object.~~ **Fixed** in `13aba57`: every `world.loaded`
  synchronously rebinds or detaches the gizmo, with a second guard before editor render.
- **`?host=legacy` in a production build shows missing archive textures/meshes.** Deliberate
  — it is a reference fallback, fully intact in `vite dev`, and was costing ~76 MB per push.

## Ops

- Production nginx has **gzip + immutable caching applied manually** (measured 3.65× on the
  largest chunk). `ops/nginx/graphysx.specialblend.ca` has drifted from the live config —
  re-running `ops/install-nginx.sh` **will overwrite it**.
- Prototyping on UGBrutal: `npm run dev -- --host` → <http://192.168.2.12:4173/>. The
  staging workflow is manual-only by design; a self-hosted runner was overkill.
- **The repo is PUBLIC.** Never add a `pull_request:` trigger to `staging.yml` while a
  self-hosted runner is registered — a fork's PR would execute code on UGBrutal.

## Working style that paid off

- **Verify claims against the running system, not the docs.** This ledger has been wrong:
  it once claimed work was unpushed and DNS unconfigured; all three claims were false.
- **Adapt recovered archive code, don't rewrite it.** `archive-skybox.ts` already solved
  TV3D face reordering; `nature-lab.ts` already had working boids. The pivot's mistake was
  reading "not v2-expressible" as "rebuild from zero" instead of "wrap behind a v2
  interface".
- **Stage commits by explicit path. Never `git add -A`.** Several sessions have shared this
  tree concurrently, and a broad add has already swept one session's work into another's
  commit under an unrelated message — twice.

## 2026-07-28 — archive/media parity reconciliation (`functional-media-parity-r1`)

This section supersedes stale counts and open-gap claims above without rewriting the historical
record. At baseline `2ff08fa`, four things were genuinely missing: a reproducible whole-archive
media/functionality census, scene-serializable physics constraints, the exact authored BallZ18
2048² Clear Sky set, and a SceneNET write path. The earlier “no drivable vehicle” and
“p5-to-texture is future” statements were already stale: Piste Ovale–Impreza uses the real Rapier
raycast vehicle in its specialized player route, and primitive entities already support a
scene-native generative CanvasTexture `surface`. The Garage remains intentionally static because
no garage driving binding survives, and multiple composited overlay layers remain out of scope.

**Landed in this reconciliation:** `docs/archive-parity-ledger.json` inventories 8,823 media
paths / 5,949 unique hashes / 2,874 byte-identical duplicate paths / 5,688,234,500 examined bytes.
Its 71 functionality records resolve to 66 REVIVED, 3 SOURCE-ONLY, 1 SUPERSEDED and 1 OUT OF
SCOPE. Media resolves to 545 REVIVED, 2,870 ALIASED, 3,421 SOURCE-ONLY, 1,982 OUT OF SCOPE and
5 explicit zero-byte UNRECOVERABLE records. The checked-in generator and CI audit reject stale
output, invalid evidence, unclassified rows and ledger self-evidence.

The v2 document now owns validated fixed, revolute/hinge and rope joints. They are patchable and
removable through the human/agent API, transaction/undo/export/load safe, rebuilt after body
changes, reported by `state()` and `render_game_to_text`, and demonstrated by the ordinary
Physics Sketchbook scene. The bridge is now 90 tools, and the round-trip sweep is 99/99; the older
97-check and six-sky counts above are historical. Seven curated skies now ship, including the
exact six byte-identical BallZ18 Clear Sky PNGs with Unity provenance and native-cubemap
orientation. No surviving scene binds that Unity material, so its current Day/Night use is
explicitly adapted rather than presented as recovered placement.

SceneNET compatibility is bidirectional at an honest boundary. Imports cover the surviving
Object3D/Obj3D/EntityNET and v1.0–v1.2 shapes; `exportLegacyXml()` and both editor surfaces expose
a deterministic flat Scene3D v1.2 subset. Geometry dimensions, pose, visibility, known textures
and basic physics survive. Structured warnings disclose omitted environments, rules, joints,
unsupported entities and material/PBR fields; duplicate IDs and hierarchy are rejected rather
than silently renamed or flattened. Canonical v2 JSON remains the only lossless scene format.

**Remaining evidence boundaries:** the Projection effect and BallZ fluid-layer shader stay
SOURCE-ONLY because exhaustive binding searches found no host loader/parameter callsite; the
Arduino hardware panel also stays SOURCE-ONLY because the archive preserves a physical-device UI
but no faithful browser device binding. The five zero-byte files remain explicitly UNRECOVERABLE.
These are evidence limits, not placeholders for invented behavior.

Focused verification is green: physics/joints, Rapier race vehicle, generative surfaces,
BallZ18 sky, day/night, SceneNET XML, archive levels, standalone bridge parity, the 99/99
round-trip sweep, typecheck, production build, revival-debt audit and archive-parity audit.
Inspected captures: `output/web-game/joints-final-second/shot-0.png`,
`output/verify/rapier-piste-race.png`,
`output/smoke/surfaces-plasma.png`, `output/smoke/ballz18-clear-sky.png`,
`output/web-game/ballz18-sky-final/shot-0.png`, `output/smoke/scenenet-xml-export.png`, and
`output/web-game/scenenet-export-final-2/shot-0.png`. Browser text state matched the visible
world and no product console/page errors remained. The final full-gate result is appended after
the single authorized combined run.

**Final combined verification:** the one authorized `npm run verify -- --wait` run completed
45/46 checks. All type/build/audit/node checks and 42 of 43 browser smokes passed in-matrix;
Rapier Race alone exhausted both ephemeral preview servers at `page.goto` before any assertion.
The exact unchanged `smoke:rapier-race` then passed against the same built `dist/` on a
health-checked stable preview: real chassis motion, rear-wheel drive, suspension contacts,
steering, finite state, screenshot and zero console/page errors. No assertion was weakened and
the full gate was not rerun.
