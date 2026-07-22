# GraphysX-Web — Feature & Fix Wave (2026-07-22)

Four waves landed off the peer review, plus one real bug found while verifying. Base: `643e184`
(applied cleanly onto your `78e1fe3`, which only adds `showroom-welcome.ts` — untouched here).
All changes typecheck (`tsc --noEmit` clean) and build (`vite build` green). Affected smokes were
run individually against a served `dist` and pass; the two new smokes are registered in the gate.

---

## Wave 1 — Physics correctness (the headline fix)

**Files:** `src/agent-world-runtime.ts`, new `scripts/smoke-physics.mjs`

- **Contact materials are now live.** Each of the six surface presets (default/wall/finish/
  ground/ball/human) is a single shared `CannonMaterial`, and the world registers all 21
  `ContactMaterial` pairs on construction (`registerPhysicsContactMaterials`, ~:3213). Before
  this, every body minted a private material that never entered the world's contact table, so
  all collisions fell back to cannon's defaults (friction 0.3, **restitution 0.0**) — nothing
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
- `smoke:store-auth` — token gate, CORS, tokenless compat (node-only, cheapest in the list)
- `smoke:dna` — was authored but never registered; now in the gate (node-only, deterministic)

## Verification run in this session (served `dist`, swiftshader)

Individually passing: `physics`, `standalone` (parity), `store-auth`, `dna`, `ballz`, `triggers`,
`rules`, `roundtrip`, `spiral`, `world1`, `archive-levels`, `games`, `showroom`, `editor`,
`scene-store`. `tsc --noEmit` clean; `vite build` green (227 assets / 44.4 MB).

## Follow-ups (not done here)

- Run the **full `npm run verify` gate** on your machine once (I stopped it mid-suite on request;
  the browser smokes are slow on swiftshader but I ran the affected ones by hand).
- The `environment.post` field already exists in the runtime — a scene-authored bloom flag is wired;
  consider surfacing it in the editor inspector.
- Rapier migration (peer-review item #2) is still open; the contact-material fix here is
  engine-agnostic and lands independent of that decision.
- `_to_delete/graphysx-kickass.tgz` — the delivery bundle; safe to delete (the bridge can't `rm`).
