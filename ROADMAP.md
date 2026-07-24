# GraphysX Web — Roadmap

*Taken stock 2026-07-19, against the tree at `7c072e6` plus the in-flight working set.
[PRODUCT_SPEC.md](PRODUCT_SPEC.md) says what the product is and why; this doc says where it
stands and what comes next, in order. When they disagree, the spec's tenets win and this
doc is the one that's wrong.*

## Where we are

**v1 is met.** Every §13 clause is checked in `progress.md` (browse-r1): the site opens
into the welcome showroom, a human and an agent act in the same live scene, a game was
rebuilt on-platform and played to a win, scenes save/load/export, and the archive player
no longer competes for the front door. The verify gate (typecheck + build + 31 browser/node
checks) is green and gates every deploy to
<https://graphysx.specialblend.ca>.

**The numbers.** `src/` is ~54k lines. The clean spine is small and cohesive:
`platform-host.ts` (~600 lines) owns the renderer and the one shared frame loop,
`agent-world-runtime.ts` (~3k) owns document → entities → physics, `platform-editor.ts`
(~2k) is the human authoring layer. Around that spine sit ~15k lines of legacy monolith
(`race-scene.ts` + `prototype-app.ts`, alive for `?host=legacy` and one type export) and
~18.5k lines of archive environments/previews, most of whose preview harnesses are no
longer reachable from any served page.

**In flight (uncommitted, Yanik's working set):**
- **BallZ archive levels** — module + `main.ts` seeding + smoke + gate registration.
  Complete as a unit; commits together.
- **Vehicle garage** — vendored meshes (3, ~500 KB), generated manifest, a complete
  v2-vocabulary garage scene, and a smoke — all deliberately walled off behind a
  throwaway harness until a front-door route exists. To land: catalog registration,
  release-manifest coverage for `assets/vehicles`, a real route, register the smoke.
- **Flock trail ring buffer** — isolated perf refactor, independently shippable.
- **`agent-world-formula.ts`** — recovered Math Game field, complete-looking,
  imported by nothing. Needs a decision: wire it like flock (runtime + smoke) or park it
  in the workshop.

## Defect register (real bugs, not wishes)

1. ~~**`server/scene-store.mjs:89`** — atomic `rename` needs a bounded retry~~ — **fixed** in
   `0bc3f26`, a drive-by inside an unrelated commit. Verified against HEAD 2026-07-21.
2. ~~**`agent-world-assets.ts` model recentring**~~ — **fixed**: the offset now goes through
   the same factors the vertices do (`p = -S·center`), with the T·R·S reasoning recorded
   inline at `agent-world-assets.ts:256`. Verified against HEAD 2026-07-21.
3. ~~**Point lights always render a marker sphere**~~ — **fixed**: `marker?: boolean` on the
   definition and the patch path, default true, serialised only when false. Verified at HEAD.

   **All three of the above were already fixed when checked on 2026-07-21 — none had been
   struck off. Verify a register entry against HEAD before spending a session on it.**
4. ~~**Runtime rollback with an attached gizmo** raises an uncaught error~~ — **fixed** in
   `13aba57`: `world.loaded` synchronously rebinds or detaches the gizmo, and refresh guards
   the same invariant before rendering. This was another fixed-but-unstruck register entry.
5. ~~**Sphere/heightfield cell-seam kick**~~ — fixed by the Rapier migration and guarded with
   `FIX_INTERNAL_EDGES`; **water grey at grazing angles** remains documented.

## Horizon 1 — Land what's in flight, fix what's broken

Close the working set before opening anything new.

1. Land BallZ levels (ready), the flock ring buffer (ready), then the vehicle garage
   chain (catalog + manifest + route + smoke). Decide formula: wire or park.
2. Fix defects 1–3 above. The recentring bug matters most — it silently degrades every
   model the vehicles work will make people look at.
3. Retire the vehicle verify harness once the garage has a real route.

## Horizon 2 — Archive ports

The platform blockers are now gone: `environment.envelope` carries scene-scale fog/camera
limits, and model entities can author validated static trimesh or moving convex-hull colliders
from their registered asset geometry. Great Slide is the collider proof: exact recovered
SlideLarge positions/UVs/indices, a scene-native trimesh, editor control, bridge reachability,
round-trip persistence, and a deterministic built-output smoke. It now also ships as the adapted
**Great Slide: Gravity Run**: two ordered gates, finish, controls, HUD, results, replay, and a
Games-shelf route. The recovered mesh is faithful; scale, material, spawn, checkpoints, lighting,
and gameplay remain explicit adaptations rather than a claim of archive-faithful game rules.

1. ~~**Envelope in the document**~~ — **Done.**
2. ~~**Mesh colliders for ported geometry**~~ — **Done** in Wave 6; Great Slide guards it.
3. ~~World 1~~, ~~Skybox Spiral~~, the ~~adapted Great Slide gravity run~~, and the adapted
   ~~Map 1 gravity descent~~ are reachable ports. Map 1 carries its exact 699-vertex/1456-triangle
   mesh and trimesh collider through a natural halfway-to-finish run; its material, scale,
   orientation, spawn, gate, controls, camera, lighting, and rules are explicitly adaptations.
   **An archive-faithful Great Slide rules reconstruction remains** (needs new source
   evidence). ~~Level1 2011~~ — **done** (`0b31c5d`): the 1135-unit mega-world at 1:1, with
   its own smoke and a provenance record that keeps the mesh in `faithful` and every piece of
   gameplay geography in `adapted` (all of it placed from a 19-probe physics drop-grid over
   the composed scene — no archived layout exists to be faithful to). Landing it surfaced and
   removed the THIRD mega-world pin: `asset.fitSize` was capped at 1000 from before any asset
   that large existed, the same vintage as the fixed far plane and the missing mesh colliders.
   All five Horizon 2 ports are now reachable from the Games shelf.

## Horizon 3 — The look

The 3D side is technically sound (ACES, PCF soft shadows, IBL, per-scene skies, water,
instanced flocks). The font, theme, bloom and front-door cinematic below have landed.
Lighting is no longer synthetic-only: Waves 11–13 vendored five licensed HDRIs and moved
recovered headline materials onto reflection-aware Standard/Physical paths. Ordered by
impact-per-effort:

1. ~~**Actually load the brand font.**~~ **Done** in `810923a`: vendored Space Grotesk
   weights load through `@fontsource`, with no CDN dependency.
2. ~~**One theme layer.**~~ **Done** in `810923a`: `platform-theme.ts` owns the product
   tokens consumed by the editor and front-door modules.
3. ~~**EffectComposer on the product path.**~~ **Done** in `aad0305`: bloom is opt-in
   scene vocabulary at `environment.post`, in the one shared render loop.
4. ~~**Scene-authored IBL look controls**~~ **Done** — Automatic/Sky/Studio/HDRI source,
   reflection intensity, aligned yaw, backdrop intensity/blur, Natural/Soft/Hero editor looks,
   cached-PMREM reuse, and renderer/persistence coverage are scene vocabulary. The follow-up is
   done too: five licensed 1K HDRIs ship, recovered headline materials selectively use
   Standard/Physical, model slots are authorable without flattening source structure, and Wave 14
   gives materialized BallZ grids their first authored HDRI + bloom look pass.
5. ~~**Thumbnails on the shelves.**~~ **Done**: Browse/Games are two-column galleries.
   Curated scenes use 14 build-captured 3D previews regenerated by
   `npm run assets:shelf-thumbnails`; editable grid levels draw a live top-down preview
   from their current revision, so user-authored changes never show a stale screenshot.
6. ~~**A results screen worth winning.**~~ **Done**: composed and grid games share a glass win
   panel with time/best, replay, and return; the live HUD is driven by `api.rules.status()`.
7. ~~**Front-door cinematic.**~~ **Done** in `643e184` + `78e1fe3`: interruptible entry
   camera move, staged exposure warm-up and reduced-motion-aware title treatment.

## Horizon 4 — Platform depth

In spec order, all pre-existing commitments:
- ~~Prefabs in the editor UI~~ — done; the Prefabs tab is the library's default tab.
- ~~**Evolutionary / DNA entities**~~ — **done** in `48953f5`: `dna-tree` is a
  deterministic entity module with a real genome rather than relabelling the archive's
  generation-driven hue drift as evolution.
- ~~**Crowds**~~ — **done**, `crowd-r1`. The term mapped to the NPC population in
  `race-scene.ts` (~207 lines:
  wandering humans, hunting zombies, infection, squash-on-contact). The target concept this
  entry asked for: a neutral instanced `crowd` entity owns population, positions and steering
  (`wander`/`pursue`), while infection and squash stay game concerns expressed through the
  rules vocabulary — the force-field precedent of entity-for-identity, pass-for-effect. The
  physics went with it: members were rigid-body spheres, so spacing was a free side effect of the
  solver, and an explicit separation pass replaces it — recorded as an adaptation, not a
  recovery. `setRole` is the seam rules drive to express infection.
- **Best-time persistence** — needs a store-side concept that doesn't exist yet; design
  it with the auth question in view, not before it.
- **Milestones B/C** — live deltas beyond whole-document reload, then the authenticated
  relay for remote presence. Still roadmap, still honest about it.

## Debt ledger (pay as you pass)

- **Sever `MapEditorTile`** — three clean-path files type-import from the 9.8k-line
  `race-scene.ts`; extracting one type quarantines the monolith behind its lazy route.
- **Orphaned preview harnesses** — ~19 `*-preview.ts` pages unreachable from any HTML;
  either a preview index page or move them workshop-side.
- **Preview renderer drift** — previews hand-roll renderers with mismatched color
  space/tone mapping; a shared preview bootstrap ends the divergence.
- ~~**Drop the illusion of Rapier**~~ — **done**: Rapier is the runtime physics engine, with
  heightfields, trimesh/convex colliders, joints, and vehicle control behind the engine boundary.
- **README refreshed 2026-07-19** — keep it matching the tree; it had said
  "in transition" for a full product generation.
