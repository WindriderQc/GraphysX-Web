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
| `src/agent-world-runtime.ts` | The v2 runtime: entities, cannon-es physics, behaviours, deterministic `update(dt)`. |
| `src/agent-world-api.ts` **and** `src/prototype-app.ts` | **Both** implement `GraphysXAgentWorldApi`. A new API method must be added to both or the build breaks. |
| `src/platform-editor.ts` | Top bar, left scene tree, right inspector, bottom tabbed library, Levels workbench. |

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

- **Run it 2–3 times with ~20 second gaps.** Back-to-back runs cause Chromium teardown
  contention and produce false failures. Measured: 2/4 fail with no gap, 0/4 with a gap.
  Do not "fix" a product because of this.
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
archive-derived presets), heightmap terrain with a cannon-es `Heightfield` collider,
reflective water, flocking (entity type, 0.228 ms/step for 116 members); showroom with
kinetic physics, click-to-drop, click-to-focus; CI gating production; scene store + scene
browser; trigger volumes; typed event stream; asset split (`dist` 140 MB → ~65 MB).

**Terrain pad + collider correctness.** Two defects behind the old "collider disagrees with
the mesh near the flatten rim" entry, both fixed in `agent-world-terrain.ts`:

- `flattenRadius` was applied *per vertex*, so the cell straddling the radius had flat inner
  corners and an un-flattened outer one and therefore ramped. The pad was level only out to
  the last grid ring inside the radius — r≈10.2, not 12, on the showroom field. The blend now
  starts one cell diagonal further out, so `flattenRadius` is a guarantee.
- The collider was the *opposite triangulation* of the same corner heights. `PlaneGeometry`
  and cannon split each quad on the same diagonal in index space, but the old single-axis
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

1. **Shadows.** Disabled back when nothing cast them; there are casters now (kinetic
   stack, trees, flock). Best visual-per-effort left. Terrain must `receiveShadow`.
2. **BallZ level (Phase 5).** §13 hangs "v1 done" on one game rebuilt *on* the platform,
   not ported. Every prerequisite now exists: the level workbench authors the layout,
   terrain gives ground with a collider, physics/emitters/flock/triggers are vocabulary.
   Highest-value remaining feature.
3. Force fields (composes with particles + flock), evolutionary/DNA entities, crowds
   (welded inside `race-scene.ts`), 2D overlay layer (no layer concept exists at all),
   CubX recovered geometry (still 8 plain boxes), audio (19 sounds upstream, 4 vendored).

## Known defects — recorded, not hidden

- **Spheres landing within ~0.1 units of a heightfield cell seam get a lateral kick.**
  cannon-es builds each terrain cell as two closed triangular prisms and runs sphere-vs-convex
  against each. A sphere that penetrates on landing catches the *rim edge* of the neighbouring
  prism, which returns a tilted normal instead of the flat face normal, and the resulting
  impulse starts it rolling — permanently, because a cannon sphere has no rolling resistance.
  Reproduced on a **perfectly flat** heightfield, so it is not a height-data problem. Scales
  with penetration per step: dropping from 6 m at `dt=1/60` drifts up to 25 units; at
  `dt=1/240` the same drop drifts 0.05. Not fixed — the cure is either patching cannon's
  narrowphase or halving the fixed timestep, and `Trimesh` is not an escape (cannon has no
  box/convex-vs-Trimesh narrowphase, so kinetic stacks would fall through). After the pad fix
  below it no longer shows up inside the showroom pad, but it is why `probe:terrain` reports
  drift outside it.
- **Water reads grey at grazing angles.** three's `Water.js` hard-codes Fresnel
  `rf0 = 0.3`; real water is ~0.02. Patched to a uniform, but a low camera still mirrors a
  pale sky.
- **Ball drop retuned 9 m/0.52 → 6 m/0.34** partly for test stability. Real justification,
  mixed motive.
- **A runtime rollback raises an uncaught error** when a rejected transaction leaves the
  gizmo attached to a destroyed object. Gated in the UI, not fixed at source.
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
