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

## Start here — where the work actually is (2026-08-13)

**The lean platform and KidX First Drive are the current production release on `main`.** The
feature landed in `5bddf69`; the live visual follow-up landed in `ecd130b`, and the current release
line includes both. `refactor/lean-platform` remains the pre-KidX integration line for provenance.

**KidX First Drive is shipped, not pending.** It adds a bounded four-block language, runs those
blocks through the same steering API as a child or agent, and lets the existing First Drive scene
rules and Nestor judge the result. Left / Right produce opposite physical routes, Forward preserves
heading, every attempt restores north, and a scene-authored cyan marker makes direction visible.
The final live visual audit also caught and removed scene-store authoring chrome from the kid-facing
application route. The wide production capture has complete copy, no overlap or clipping, a clearly
framed robot and target, and state that agrees with the success screen.

    de3c7ba  preserve the EV3 robotics mission lab
    aebfe71  retire the archived legacy host
    f41b5d4  move the revival provenance record out of the product
    824fb92  name the asset library for what it is  (src/legacy → src/content)
    85f1842  reorganize verification around retained products  (tiers; 56 → 50 checks)
    d789aab  stop telling contributors to maintain deleted code
    539d7a8  give the EV3 mission lab a surface a child can use
    2477b81  make First Drive a real EV3 mission with scene rules and Nestor coaching
    5bddf69  add the first KidX program
    ecd130b  keep authoring chrome out of the app

What this branch did, in one line: the old GraphysX runtime is archived in another repo, so the
legacy host, the archive UI, the revival tooling and the parity ledger left. **The asset library
stayed** — 24.5 MB under `src/content/`, renamed rather than deleted, because it is read by the
runtime. Every converted experience, EV3, BallZ, the Center and AgentX stayed.

**Release verification is complete.** `npm run check` and `npm run lint` are green (278 passing
unit tests, one intentional skip). The focused EV3 browser smoke covers 171 entities, mission miss
and success, retry, held-Go driving, the six-block cap, deterministic programs, left/right physical
routes, heading repeatability, 72 px controls, and the absence of authoring chrome. The required
game client and screenshots were inspected at both 800×480 and 1280×720. The final clean Linux
release gate passed on its first workflow attempt in 1h21m, the atomic deploy and its production
smoke passed, and an independent live smoke found zero bad responses, console errors or page errors.

**Next, in the order that adds the most:**

1. **Finish Phase 6 on real EV3 hardware.** All four blocks now work in simulation; add the narrow
   adapter that sends that same compiled input sequence to EV3; do not invent a second program
   model for the robot.
2. **Phase 7, Raspberry Pi validation.** Run the child surface and hardware path on the actual Pi;
   the Build / Run surface is measured at 800×480 in anticipation of it.
3. **Phase 4, the application composition surface.** Deliberately not built yet: `?app=ev3-lab`
   remains one `if` in `main.ts`. Generalize it when a *second* application asks for it, not before.

Do not expand the Center, and do not extract an npm package or split the repository yet — both
are explicit product decisions, not oversights.

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
breaking the product, not taking a shortcut. The modules that used to do that left with the
legacy host; everything here now goes through the API.

## Architecture

| File | Role |
| --- | --- |
| `src/platform-host.ts` | Renderer, camera, OrbitControls, ONE animation loop. |
| `src/agent-world-runtime.ts` | The v2 runtime: entities, Rapier physics, behaviours, deterministic `update(dt)`. |
| `src/agent-world-api.ts` | The one implementation of `GraphysXAgentWorldApi`. There used to be a second on the retired legacy route, and a new method had to land in both; it now lands in one place. |
| `src/platform-editor.ts` | Top bar, left scene tree, right inspector, bottom tabbed library, Levels workbench, media import dialog. |
| `src/ev3-first-program.ts` | The DOM-free first KidX language and runner: Forward, Left, Right and Stop, capped at six timed blocks and compiled only to steering inputs. |
| `src/ev3-mission-strip.ts` | The first *application surface*: First Drive's objective, clock, Nestor and Build / Run / Drive controls, reached by `?app=ev3-lab`. It consumes `api.rules` / `api.events`; both manual play and programs drive through `api.steer`. |
| `src/content/` | The asset library — 24.5 MB of converted scenes and media, read by the runtime. Formerly `src/legacy/`, renamed because the name was describing its origin instead of its job. |
| `server/scene-store.mjs` | The store server: scenes, relay, and the router that mounts everything below. |
| `server/live-sessions.mjs` + `server/live-missions.mjs` | Authenticated scene-scoped collaboration, and the pure mission reducer on top of it. |
| `server/asset-store.mjs` + `src/agent-world-media.ts` | Runtime media imports: datalake browse/import/upload; the browser converts foreign models to `graphysx-mesh-json` and registers them through `api.media.*`. |
| `server/host-entity-id-policy.mjs` | The one source of truth for the `live-agent:` / `live-mission:` / `live-nestor:` namespaces, imported by both trees. |
| `server/store-paths.mjs` | The one place a public id is allowed to become a filename. |

`verbatimModuleSyntax` stays on as ordinary hygiene. Its original reason — stopping two type-only
`race-scene` edges from silently becoming runtime imports and dragging a 1.4 MB monolith onto the
default bundle — retired with the monolith.

**Adding an entity type** — thread it through: the type union, `resolveEntity` (+guards),
`createEntityObject`, `rebuildPhysicsBody`, `updateSimulation`, `applyResolvedEntity`, the patch
path, `serializeEntity`, disposal, capabilities, the API, and the editor
palette. Follow how `emitter`, `terrain`, `water` and `flock` did it.

## Verification — read before running anything

Three layers, cheapest first. Use them in that order.

| Command | Cost | What it proves |
| --- | --- | --- |
| `npm test` | < 1s | Fast authority/resource contracts: inverse operations, missions, streams, stores, results, assets, and the gate itself. No browser, server, port, or lock. |
| `npm run lint` | ~70s | What the type checker cannot see — principally floating promises. |
| `npm run check` | ~13s | Typecheck + unit tests. The loop to run while building. |
| `npm run verify -- --tier=core` | ~10min | The platform and its front door: showroom, editor, standalone, levels, rules, triggers, round-trip, command validation, asset guards. |
| `npm run verify -- --tier=apps` | ~15min | One application or content family per check. Run when you touch one. |
| `npm run verify` | ~40min+ | Everything, including the deep protocol tier. What a release runs. |

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
- **Mission station Y is animated state, not the authored anchor.** AgentX station targets use
  Y = 0.36, but `state().agents[].position` exposes the rendered transform and its intentional
  bob (up to 0.09 while working). Arrival waits must retain the 0.0005 tolerance on X/Z and
  leave Y to the following animation-envelope assertion; polling all three axes waits for a
  timing-dependent sine zero crossing. Do not widen one scalar tolerance, disable animation,
  or drop the station/stage and cross-client projection checks.
- **Mint expiring fixture invitations at their point of use.** The browser fixture deliberately
  gives invites a 600-second TTL. A clean Linux run reached Carol's late initial-join race after
  977.5 seconds, so a startup-minted code was correctly rejected before the client could request
  the held snapshot. Keep the TTL and barrier strict; create late-phase one-use credentials
  immediately before arming their race instead of coupling coverage to total suite duration.
  A longer invite would hide this fixture bug and weaken the policy being exercised.
- **A wedged run used to hang forever.** `runSmoke` awaited `close` with nothing bounding it, and
  two verify parents were found alive **9.5 and 7.7 hours** after launch holding Chromium trees.
  There are now deadlines (10 min/smoke, 30 for the live browser contract, 10 min/build; all
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
the same `api.steer` call an agent makes. On the starter course that is not a figure of speech:
the play HUD carries **◈ Race AgentX**, which drives the course through those same calls,
finishes in 11.35s and hands its trajectory back as the ghost you race.

`src/agent-coach.ts` is the whole of it, and two of its properties are load-bearing:

- **A program is inputs at times, never a recorded time.** Rapier is deterministic for a build
  and platform and not across them, so a baseline shipped as data would quietly stop being true
  on someone else's machine. The run is computed where it is shown.
- **Adding a course means recording one, not writing one.**
  `node scripts/record-coach-line.mjs --level <id>` drives closed-loop — reading the ball's
  position and re-aiming sixty times a second — and prints the inputs it issued as a paste-able
  `registerCoachProgram` block. It refuses to print a line that did not finish. `PROGRAMS` is a
  small explicit map, and a course that is not in it gets no button at all, because a coach that
  guessed a driving line would be offering advice it has no basis for.

Bit-identical replay is *false* and was measured: two runs of one program on one page part by
1.4mm over three seconds, so `coachRunsAgree` checks reproducible-within-5cm. The gap to a real
fault is three orders of magnitude — dropping a single `kick` moves the ball units.

`scripts/smoke-roundtrip.mjs` is 99 property and rejection checks set through the public API and
read back four ways. It exists because the same bug kept recurring in different clothes: **a
surface that writes state without ever reading it back.** Run it after adding any settable
field, and prefer an object-verified check over a storage round-trip where one is possible.

**The archive parity ledger and its audits are gone** (`f41b5d4`). They inventoried a 5.7 GB
archive to prove the revival was faithful; that job finished, the old application lives in its
own repository, and a 7.1 MB ledger plus four audit scripts were being carried by a product that
no longer answers to it. What was kept is the thing with ongoing value: the asset library, now
`src/content/`. If you need the provenance record, it is in the archive repo and in the history
of this one.

### Applications, and why `?app=` takes an id

The editor is a correct tool aimed at the wrong person. Reaching the EV3 lab through Browse
Scenes was measured at desktop, 1024×600 and 800×480: **218 controls, every one under 44px**,
four authoring panels around a postage stamp of the lab. `?app=ev3-lab` opens the same scene in
its own surface instead — First Drive's mission card and seven Build-mode actions, none under
72px at 800×480.

- **The surface holds no scene state.** Manual controls and the four-block program runner both
  reduce to `api.steer` on the drive base. The EV3 document declares the 30-second run,
  drive-base subject and blue finish through `rules`; red miss lanes are trigger entities.
  Nestor reads `api.events` and `api.rules.status()` in the host's shared frame loop. An agent
  sees and drives the same attempt the child does.
- **First Drive is real, and deliberately one mission.** Hold Go and the dynamic rover reaches
  the luminous blue ring in about 2.3 seconds. A red crossing keeps the attempt alive and makes
  Nestor coach toward the middle; success or timeout stops steering and offers Try again. The
  focused smoke proves both forced verdicts and the actual held-button path at 800×480.
- **The first program is deliberately not a framework.** Forward, Left, Right and Stop are timed
  inputs, programs stop at six blocks, and three Forward blocks solve First Drive in about 1.8
  seconds. A program that stops early leaves the scene's mission alive and makes Nestor recommend
  the missing Forward block. Build mode pauses the clock and rover until Run. Left / Right make
  repeatable opposite quarter-turn routes, Forward preserves that heading, and the cyan direction
  marker keeps the logical program visible on the rover.
- **It is keyed by id, not by a boolean**, because it is the seam a second application uses. That
  is the entire architectural claim so far, and it is deliberately still one `if` in `main.ts` —
  generalize it into a composition surface when a second application exists to reveal what the
  shape should be, not from a diagram.
- **`onExit` is required, not optional.** The surface covers the whole screen, and a mode a child
  cannot leave is a trap.
- The render-settings disclosure is hidden while a surface is mounted (it is pinned bottom-right
  at z-index 120 and competes with the surface controls). Dodging around it would have been the
  worse fix.

### Portals, and why the destination is a tag

A portal in the showroom is an entity carrying `portal-to:<entityId>` in its tags, read by
`showroom-interaction.ts` the same way `nestor-topic:<topic>` already is. Clicking it moves the
camera to that entity.

- **Travel is a camera move, not a scene load.** Slice 7 requires the Center's places to share one
  performance budget, and only things that coexist can. A portal that loaded a different world
  would be the Games shelf, which already exists.
- **The destination lives in the scene**, so it survives export and reload, an author can retarget
  it in the inspector, and an agent can build another with an ordinary `api.spawn`. The host
  interprets the tag and holds no destination of its own. `smoke-showroom` asserts the tag is in
  the *exported document* specifically, because a table of portals in TypeScript would pass every
  behavioural check and still be host code.
- A portal naming a destination that is not in the scene falls through to ordinary focus rather
  than doing nothing — a dead click on scenery is the failure that module exists to remove.

Adding one costs no entities: tag an existing prefab. Adding a *place* does cost entities, and the
budget to hold is the showroom's real median frame of 13.3ms — not the headless number, which is
software-rasterised and reports roughly 290ms regardless.

### Where proposals come from

`src/coauthor-provider.ts` is the seam that lets a model compose a proposal instead of Nestor.
Two things about it are worth knowing before touching it:

- **No provider is configured by default, and none is required.** With nothing set the page makes
  no request at all. `VITE_GRAPHYSX_PROPOSAL_URL` bakes one in; `?propose=<url>` sets one for a
  session. The endpoint is expected to be same-origin and to hold its own credentials — a key in
  the bundle is a key handed to every visitor.
- **A provider's reply is hostile input.** It returns commands that mutate the user's scene, so
  it is validated before a card exists: unknown ops refused, size bounded to what a person can
  review, and host-only id namespaces refused through `server/host-entity-id-policy.mjs` — the
  same module the runtime enforces on commit. A provider that could claim `live-agent:` could
  forge a teammate, and it would look authentic because it would BE an ordinary entity.

What makes it safe to offer at all is structural rather than careful: the output becomes an
ordinary `CoauthorProposal`, which cannot commit itself. Downstream, nothing can tell a
provider-composed proposal from a local one, because there is nothing to tell apart.

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
- ~~`?host=legacy` shows missing archive textures~~ — **fixed by removal** (`aebfe71`). The
  legacy host route is gone. Comments in `agent-world-flock.ts`, `agent-world-formula.ts` and the
  `archive-*` modules still mention `?host=legacy` when describing where that code came from;
  those are provenance notes about the past, not live routes.
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
  refactor and should be its own change, not a rider on something else.
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
- **Adapt recovered code, don't rewrite it.** `archive-skybox.ts` already solved TV3D face
  reordering; the retired `nature-lab.ts` already had working boids, and `agent-world-flock.ts`
  is that code graduated rather than reinvented. The pivot's mistake was reading "not
  v2-expressible" as "rebuild from zero" instead of "wrap behind a v2 interface".
- **Look at it before you believe it.** The EV3 surface passed on every number it was measured
  by while the camera framed the room instead of the robot and the render-settings widget
  clipped the Launch button to "Laun". Both were obvious in a screenshot and invisible to the
  assertions. This is the third time on this project that green checks coexisted with a visibly
  broken scene.
- **Stage commits by explicit path. Never `git add -A`.** Several sessions have shared this tree
  concurrently, and a broad add has already swept one session's work into another's commit under
  an unrelated message — twice.
- **A cap on one request is not a bound on the system.** The live session's per-request limits
  were all individually correct and composed into gigabytes of retained state. When you add a
  limit, ask what accumulates behind it.
