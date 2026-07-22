# GraphysX Web — session handoff

Orientation for whoever picks this up next. Read `PRODUCT_SPEC.md` (especially **§8.1
Reality check**, the honest status table) and `progress.md` first. §8 describes the v1
*target*; §8.1 is what is actually true.

## What this is

A browser 3D scene engine where humans and AI agents co-author **one validated scene**.
The editor and `window.__GRAPHYSX__` are two interfaces over the same runtime.
Deploys to <https://graphysx.specialblend.ca> on push to `main`, gated by `npm run verify`.

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

**Round-trip sweep** (`scripts/smoke-roundtrip.mjs`, in `verify.mjs`). 63 settable properties
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
5. Audio (19 sounds upstream, 4 vendored); ~~CubX recovered geometry (still 8 plain
   boxes)~~ — done, `cubx-r1` graduated the recovered assembly into a prefab;
   the §14.5 BallZ shader pass; high-res skies; p5-to-texture and multi-layer overlay stacks
   (both named as deferred in `overlay-r1`, both optional in §4).

## Known defects — recorded, not hidden

- ~~**Spheres landing within ~0.1 units of a heightfield cell seam get a lateral kick.**~~
  **Fixed by the Rapier migration.** The legacy solver represented cells as closed triangular
  prisms, so a penetrating sphere could catch a neighbouring rim and receive a tilted contact
  normal. Rapier heightfields use `FIX_INTERNAL_EDGES`; the deterministic seam probe now guards
  against that lateral impulse on a perfectly flat field.
- **Water reads grey at grazing angles.** three's `Water.js` hard-codes Fresnel
  `rf0 = 0.3`; real water is ~0.02. Patched to a uniform, but a low camera still mirrors a
  pale sky.
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
