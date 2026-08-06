# GraphysX Web — session handoff

Orientation for whoever picks this up next.

**This file describes the system as it is now.** It is rewritten, not appended to. The history
— what was tried, what broke, what was struck through and when — lives in `progress.md`, which
is append-only and is where you should look for *why* something is the way it is. That split is
deliberate: this file spent months accumulating strikethroughs and a closing section that began
by explaining which of its earlier sections to disregard, and three of its open items turned
out to have been fixed while still listed.

Read `PRODUCT_SPEC.md` §8.1 (the honest status table) for what ships versus what §8 describes
as the v1 target. Read `CLAUDE.md` for the short list of rules that exist because breaking them
cost real sessions real hours.

## What this is

A browser 3D scene engine where humans and AI agents co-author **one validated scene**. The
editor and `window.__GRAPHYSX__` are two interfaces over the same runtime.

Deploys to <https://graphysx.specialblend.ca> on push to `main`, gated by `npm run verify`.
After the atomic activation, production must serve a matching `release.json` and pass the
focused Great Slide browser canary. A failed canary makes the workflow red and atomically
restores the validated previous release; screenshots and results stay attached to the run.

## The invariant that matters most

Every editor control and every showroom interaction is an ordinary API call (`api.spawn` /
`update` / `interact` / `levels.*`). No bespoke host code holding scene state. Human and agent
edits land in the same revision history.

If you find yourself mutating the three.js scene graph directly to get something done, you are
breaking the product, not taking a shortcut. The archive modules do exactly that, which is why
they are legacy-only and unreachable from the editor and the agent API.

## Architecture

| File | Role |
| --- | --- |
| `src/platform-host.ts` | Renderer, camera, OrbitControls, ONE animation loop. Zero race-scene dependency. |
| `src/agent-world-runtime.ts` | The v2 runtime: entities, Rapier physics, behaviours, deterministic `update(dt)`. |
| `src/agent-world-api.ts` **and** `src/prototype-app.ts` | **Both** satisfy `GraphysXAgentWorldApi`. A new API method must be added to both or the build breaks. The second is a ~65-line adapter onto the legacy route's `debugApi`, not a second implementation. |
| `src/platform-editor.ts` | Top bar, left scene tree, right inspector, bottom tabbed library, Levels workbench, media import dialog. |
| `server/scene-store.mjs` | The store server: scenes, relay, and the router that mounts everything below. |
| `server/live-sessions.mjs` + `server/live-missions.mjs` | Authenticated scene-scoped collaboration, and the pure mission reducer on top of it. |
| `server/asset-store.mjs` + `src/agent-world-media.ts` | Runtime media imports: datalake browse/import/upload; the browser converts foreign models to `graphysx-mesh-json` and registers them through `api.media.*`. |
| `server/host-entity-id-policy.mjs` | The one source of truth for the `live-agent:` / `live-mission:` / `live-nestor:` namespaces, imported by both trees. |
| `server/store-paths.mjs` | The one place a public id is allowed to become a filename. |

`verbatimModuleSyntax` is on specifically so the two remaining type-only `race-scene` edges
cannot silently become runtime imports and drag the 1.4 MB monolith onto the default bundle
with a green build.

**Adding an entity type** — thread it through: the type union, `resolveEntity` (+guards),
`createEntityObject`, `rebuildPhysicsBody`, `updateSimulation`, `applyResolvedEntity`, the patch
path, `serializeEntity`, disposal, capabilities, **both** API implementations, and the editor
palette. Follow how `emitter`, `terrain`, `water` and `flock` did it.

## Verification — read before running anything

Three layers, cheapest first. Use them in that order.

| Command | Cost | What it proves |
| --- | --- | --- |
| `npm test` | < 1s | Fast authority/resource contracts: inverse operations, missions, streams, stores, results, assets, and the gate itself. No browser, server, port, or lock. |
| `npm run lint` | ~70s | What the type checker cannot see — principally floating promises. |
| `npm run verify` | ~40min+ | Typecheck, lint, build, then every product route driven through headless Chromium against the **built** output. The same gate CI runs before a production deploy. |

Screenshots land in `output/verify/`. For any visual change, actually look at them.

**Write a unit test when you can.** The rule for `test/` is narrow — no browser, no server, no
port — and that is exactly what makes it fast enough to run between edits. `test/README.md`
explains what belongs there and what does not. Anything needing a running system is a smoke and
belongs in `scripts/`.

### Running the full gate

- **Never run two verifies at once — the gate refuses to.** A run software-rasterises WebGL
  (Chromium with `--use-angle=swiftshader-webgl`), so every 3D smoke renders on the CPU.
  Measured: **one** run took ~70% of a 16-core box — 113 CPU-seconds in a 10-second window. Two
  do not go twice as fast, they starve the machine, including whatever browser someone is using
  to look at the product. `scripts/verify-guard.mjs` holds a machine-global lock (it covers
  worktrees, which a per-checkout lock could not). Queue politely with `npm run verify -- --wait`;
  use `--force-lock` only when you have verified the holder is dead.
- **Never pipe the gate through `tail`/`head`** — `$?` becomes the pipe's and the summary is
  truncated. Redirect to a file and read the `=== verify summary ===` block.
- **A retried check says so.** The gate retries a smoke that died on a transport signature, and
  only that: never on a deadline kill, never on an assertion failure. The summary prints
  `PASS (retried: …)`. CI tolerates zero retried passes by default; local runs retain the
  historical allowance of 3, and an explicit non-negative `VERIFY_MAX_RETRIES` overrides either.
  If you see retries, suspect the machine before the product.
- **If the app freezes while you work, check for a running gate before suspecting the app.** A
  whole session went to a "lag" that was a concurrent verify. The tell: the freeze is a *total*
  stall — camera, animation, everything resumes together — and a CPU profile shows V8 getting a
  fraction of the samples it is owed, with `(idle)` on top. That is the OS descheduling the tab.
  The showroom's median frame is 13.3 ms.
- **`dist/` is shared, and the lock does not cover it.** A verify racing a bare `npm run build`
  from another session fails with `ENOTEMPTY: dist\assets` — observed.
- **Never weaken an assertion to make it pass.** Three real bugs were caught only because strict
  assertions were kept: objects falling through the world, dead clicks on scenery, and a console
  error on every production page load.
- **If a smoke fails with `net::ERR_*` or a bare `fetch failed`, suspect the harness.** Two such
  bugs are fixed and both were transport-level: a static server using chunked encoding with no
  `Content-Length` (reset on the largest chunk), and servers not setting `keepAliveTimeout`, so
  undici reused sockets Node had closed after 5s. These signatures are exactly what the gate's
  retry classifier matches.
- **The live mission render-budget smoke pins its test-device hardware signals.** The product
  correctly selects `balanced` on GitHub's four-vCPU runner, while that smoke deliberately
  compares the `high` and `mobile` budgets. Its pre-navigation harness therefore reports 16
  cores / 8 GiB, exactly like `probe-render-profiles.mjs`; do not remove the pin or change the
  product selector to make the test environment fit the assertion.
- **The stalled-reader security burst is intentionally about 19 MiB.** A clean Linux runner
  can absorb roughly 6 MiB in receive buffering plus 4 MiB in send buffering before the
  server's own 4 MiB retained-stream guard becomes observable. Fifteen maximal entities over
  38 operations crosses that finite envelope, and the healthy-reader control consumes the
  identical burst; seed + burst + final control operation exactly fits the 40-operation bucket.
- **A wedged run used to hang forever.** `runSmoke` awaited `close` with nothing bounding it, and
  two verify parents were found alive **9.5 and 7.7 hours** after launch holding Chromium trees.
  There are now deadlines (10 min/smoke, 15 for the live browser contract, 10 min/build; all
  env-overridable) and signal cleanup, so Ctrl-C kills the tree instead of orphaning it.
- **Judge liveness from `output/verify/*.png` mtimes**, not from elapsed time, and run the gate
  backgrounded.

## Where the product stands

The v1 bar is met. `PRODUCT_SPEC.md` §8.1 is the authoritative status table; the milestone note
at the end of `progress.md` records how it was reached.

Shipping: a clean `PlatformHost`; the full agent API and tool bridge (90 tools); the rebuilt
editor; the ASCII/grid level workbench with lossless round-trip; skyboxes, particle emitters,
heightmap terrain with a Rapier heightfield collider, reflective water, flocking, crowds, force
fields, formula fields, DNA trees, a 2D overlay layer, generative surfaces, and scene-authored
fixed/revolute/rope joints; scene-native model colliders (`auto` / `convex-hull` / static-only
`trimesh`); the media library; the scene store, scene browser and results boards; live
collaboration sessions with server-authoritative missions.

All three front-door destinations (§5) are live: the showroom, **Games & Playgrounds** (every
row is `api.levels.play(id)`) and **Browse Scenes** (curated starters that open in the editor).
BallZ is a finished game — the original two-body control model as scene vocabulary, driven by
the same `api.steer` call an agent makes.

`scripts/smoke-roundtrip.mjs` is 99 property and rejection checks set through the public API and
read back four ways. It exists because the same bug kept recurring in different clothes: **a
surface that writes state without ever reading it back.** Run it after adding any settable
field, and prefer an object-verified check over a storage round-trip where one is possible.

`docs/archive-parity-ledger.json` inventories the whole archive: 8,823 media paths, 5,949 unique
hashes, 5,688,234,500 examined bytes. Its 71 functionality records resolve to 66 REVIVED, 3
SOURCE-ONLY, 1 SUPERSEDED and 1 OUT OF SCOPE. The checked-in generator and the CI audit reject
stale output, invalid evidence, unclassified rows and ledger self-evidence.

## Known evidence boundaries — limits, not placeholders

- The **Projection effect** and the **BallZ fluid-layer shader** stay SOURCE-ONLY: exhaustive
  binding searches by exact filename and by parameter found no host loader or callsite.
- The **Arduino hardware panel** stays SOURCE-ONLY: the archive preserves a physical-device UI
  and no faithful browser device binding.
- **Five zero-byte files** are explicitly UNRECOVERABLE.
- The **Garage** is intentionally static: no garage driving binding survives.
- **Multiple composited overlay layers** are out of scope, as is p5-to-texture.

## Known defects

- **Ball drop retuned 9 m/0.52 → 6 m/0.34** partly for test stability. Real justification, mixed
  motive.
- **`?host=legacy` in a production build shows missing archive textures and meshes.** Deliberate
  — it is a reference fallback, fully intact in `vite dev`, and was costing ~76 MB per push.
- **A live session's mission event ledger does not clear.** It is retained for the session's
  whole lifetime so a retried event keeps returning its original receipt. At the cap the only
  remedy is a new session, and the error now says so. Owner controls hold a reserve so a session
  can always still be directed and closed.

## Enrichments beyond v1

Nothing here blocks a release; pick by value rather than by order.

- **High-resolution skies.** The tooling half is done: `scripts/vendor-sky-from-hdri.mjs`
  converts any equirect Radiance HDR into a correctly oriented six-face set in the archive file
  convention, with a coarse-reprojection `--verify` that catches naming, orientation and
  encoding faults against a ~1/255 JPEG floor. What remains is curation: download the panoramas
  (blocked from the build sandbox), run the tool per set, and add registry entries with real
  provenance to `agent-world-skies.ts`.
- **Splitting the two large product files.** `agent-world-runtime.ts` and
  `platform-editor.ts` are past comfortable navigability. The runtime has already been
  decomposed at its edges — terrain, water, flock, crowd, dna, particles, force fields all live
  in their own modules — so the seams exist; what remains is entity resolution, physics rebuild,
  simulation and serialization, which is roughly four more files. This is a multi-session
  refactor and should be its own change, not a rider on something else. `race-scene.ts` and
  `prototype-app.ts` are legacy and correctly quarantined; leave them.
- `scripts/smoke-live-sessions-browser.mjs` is large enough to need its own review before
  changes. A test that cannot be reviewed safely is a test that eventually gets deleted instead
  of fixed.

## Ops

- Production nginx has **gzip and immutable caching applied manually** (measured 3.65× on the
  largest chunk). `ops/nginx/graphysx.specialblend.ca` has drifted from the live config —
  re-running `ops/install-nginx.sh` **will overwrite it**.
- The store server is deployed and restarted by `deploy.yml` as a two-phase transaction: the
  store syncs *before* the web release is activated, both halves roll back together on any
  failure, and the deploy proves the store's listener is loopback-only via `ss` before
  continuing. It restarts only when the server payload's git tree actually changed, because
  sessions are in-memory and every restart drops everyone collaborating.
- Prototyping on UGBrutal: `npm run dev -- --host` → <http://192.168.2.12:4173/>. The staging
  workflow is manual-only by design.
- **The repo is PUBLIC.** Never add a `pull_request:` trigger to `staging.yml` while a
  self-hosted runner is registered — a fork's PR would execute code on UGBrutal.

## Working style that paid off

- **Verify claims against the running system, not the docs.** This ledger has been wrong: it
  once claimed work was unpushed and DNS unconfigured; all three claims were false. Before
  working any register or roadmap entry, check it against HEAD with two search methods.
- **Adapt recovered archive code, don't rewrite it.** `archive-skybox.ts` already solved TV3D
  face reordering; `nature-lab.ts` already had working boids. The pivot's mistake was reading
  "not v2-expressible" as "rebuild from zero" instead of "wrap behind a v2 interface".
- **Stage commits by explicit path. Never `git add -A`.** Several sessions have shared this tree
  concurrently, and a broad add has already swept one session's work into another's commit under
  an unrelated message — twice.
- **A cap on one request is not a bound on the system.** The live session's per-request limits
  were all individually correct and composed into gigabytes of retained state. When you add a
  limit, ask what accumulates behind it.
