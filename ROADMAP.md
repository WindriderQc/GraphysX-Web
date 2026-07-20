# GraphysX Web — Roadmap

*Taken stock 2026-07-19, against the tree at `7c072e6` plus the in-flight working set.
[PRODUCT_SPEC.md](PRODUCT_SPEC.md) says what the product is and why; this doc says where it
stands and what comes next, in order. When they disagree, the spec's tenets win and this
doc is the one that's wrong.*

## Where we are

**v1 is met.** Every §13 clause is checked in `progress.md` (browse-r1): the site opens
into the welcome showroom, a human and an agent act in the same live scene, a game was
rebuilt on-platform and played to a win, scenes save/load/export, and the archive player
no longer competes for the front door. The verify gate (typecheck + build + 12 headless
smokes; 13 once `archive-levels` lands) is green and gates every deploy to
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

1. **`server/scene-store.mjs:89`** — atomic `rename` needs a bounded retry; Windows
   `EPERM` under contention. The only long-standing known bug; owned by nobody.
2. **`agent-world-assets.ts` model recentring** — `loadAgentWorldModel` mis-places any
   model whose `fitSize` differs from its native span (T·R·S order). Affects every
   default-`fitSize` model; the garage works around it by loading at native span.
3. **Point lights always render a marker sphere** — debug affordance leaking into
   composed scenes; needs an opt-out (or default-off outside the editor).
4. **Runtime rollback with an attached gizmo** raises an uncaught error — gated in the
   UI, not fixed at source.
5. **Sphere/heightfield cell-seam kick** (cannon-es narrowphase) and **water grey at
   grazing angles** — known, documented, live with them for now.

## Horizon 1 — Land what's in flight, fix what's broken

Close the working set before opening anything new.

1. Land BallZ levels (ready), the flock ring buffer (ready), then the vehicle garage
   chain (catalog + manifest + route + smoke). Decide formula: wire or park.
2. Fix defects 1–3 above. The recentring bug matters most — it silently degrades every
   model the vehicles work will make people look at.
3. Retire the vehicle verify harness once the garage has a real route.

## Horizon 2 — The scene envelope (unblocks the archive ports)

The four remaining mesh worlds have bounds of 56, 81, 527 and 1135 units. The host pins
fog at literals (34–130 at `platform-host.ts:372`, 38–138 at `:434`) and the camera far
plane at 260 (`:163`). Level1 2011 cannot currently be rendered at all, let alone framed.
The ~20 divergent fog/far literals across the archive previews are the proof this pin
breaks real content.

1. **Envelope in the document** — optional `environment.envelope` (fog near/far, camera
   far, suggested framing) consumed by the host exactly the way `sky` already is.
   Pure scene-data work in the same vein as the rules block. Also closes the spec's
   open "no per-scene camera" item for courses.
2. **Mesh colliders** for ported geometry — big enough to be its own effort.
3. **The five ports** — World 1, Map 1, Great Slide, Level1 2011, Skybox Spiral — each
   an `api.create` composition with provenance, a smoke, and honest FAITHFUL/INFERRED
   labels. Rules loop and (after this horizon) envelope and colliders all exist; ASCII
   path is already proven by the BallZ pack.

## Horizon 3 — The look

The 3D side is technically sound (ACES, PCF soft shadows, IBL, per-scene skies, water,
instanced flocks) but the product path has **no post-processing at all**, lighting is
synthetic-only, and the chrome has quietly forked. Ordered by impact-per-effort:

1. **Actually load the brand font.** `Space Grotesk` is declared in `styles.css` and
   never loaded; the entire UI silently renders in system fonts today. One `@font-face`
   (self-hosted, per the no-CDN posture).
2. **One theme layer.** The editor uses `--accent:#78f0d0`; the front-door modules
   hardcode a *different* cyan family (`#4fd0e6`, `#37b6d3`…) and `system-ui`. Move the
   shelves/welcome/browser onto the shared tokens before the drift gets worse.
3. **EffectComposer on the product path** — bloom (emissives finally glow: rings, gates,
   the finish), SMAA, subtle vignette/grading. Budget-gated the same way the overlay
   layer is: on only when the scene earns it, one shared loop, no second rAF.
4. **HDRI environment option** — `RGBELoader` + one or two good HDRIs as an
   `environment.sky` alternative; PBR surfaces stop reading flat. Pairs with a material
   pass (selective `MeshPhysicalMaterial`, normal/roughness maps in the texture
   vocabulary).
5. **Thumbnails on the shelves.** Browse/Games render text rows today. Snapshot each
   scene once (offscreen render → dataURL, cached in the store or at build time) and the
   front door becomes a gallery instead of a directory listing.
6. **A results screen worth winning.** `scoreboard.ts` stores medals and times and never
   draws them. Render it: win panel with time, medal, best-delta; feed the HUD from
   `api.rules.status()` as ballz-play already does.
7. **Front-door cinematic** — title treatment, a choreographed camera move on entry
   instead of the flat 0.6 auto-orbit, staged light warm-up. Cheap, pure host work,
   enormous first-impression yield.

## Horizon 4 — Platform depth

In spec order, all pre-existing commitments:
- ~~Prefabs in the editor UI~~ — done; the Prefabs tab is the library's default tab.
- **Evolutionary / DNA entities** — graduate the `nature-lab.ts` forest the way flock did.
  Grounded caveat: the legacy "evolution" is a generation counter driving leaf-hue drift —
  there is no genome, inheritance, or selection. A v2 `forest` entity either keeps that
  honestly (a colour-family lineage) or grows a real genome; that design decision is the
  only non-mechanical part.
- **Crowds** — the term maps to the NPC population system in `race-scene.ts` (~210 lines:
  wandering humans, hunting zombies, infection, squash-on-contact). Harder than the other
  graduations because it leans on the race scene's physics, player and audio; the v2 shape
  needs a target concept before the port is honest.
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
- **Drop the illusion of Rapier** — `@dimforge/rapier3d-compat` sits in node_modules,
  imported nowhere; there is one physics engine and it is cannon-es.
- **README refreshed 2026-07-19** — keep it matching the tree; it had said
  "in transition" for a full product generation.
