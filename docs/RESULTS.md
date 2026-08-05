# Results, leaderboards and shared ghosts

- Server: `server/results-store.mjs` (+ `server/ghost-trace.mjs`), mounted at `/results/*`
- Proof: `scripts/smoke-results.mjs` — 47 assertions
- Storage: one JSON file per board under `<store-dir>/.results/`

## Trust: client-attested. Say it out loud.

The browser runs the simulation and reports the time. This server validates that the report
is well-formed, self-consistent and plausible. **It does not verify that the run happened.**

Every read surface carries `trust: "client-attested"`, and the leaderboard also carries a
`trustNote` spelling it out. A smoke assertion fails if any response starts implying
otherwise. Making times server-verified means running the physics here and replaying input —
a different and much larger product, and not something to imply we have.

What *is* enforced:

| Rule | Why |
|---|---|
| A `desynced` run is never recorded | The client already refuses to make one a personal best. This refuses to make one a leaderboard entry. The project's core integrity rule. |
| Only `outcome: "complete"` is recorded | A timeout is not a time. |
| `elapsedMs` is an integer, ≥ 250ms, ≤ 6h | Below a quarter second is a clock that never started; above six hours is a stuck tab. |
| Optional per-course `floorMs` | Advisory: catches a broken clock, not a determined cheat. |
| A personal best is replaced only by a strictly faster valid result | |
| Ghosts must describe the run they claim | Duration must match the submitted time within one sample interval. |

## Compatibility: results are separated, never silently compared

A board is keyed by `sha256(courseVersion + rulesVersion)`. Two results are comparable only
when both strings match; otherwise they land on different boards. A time set on a different
version of a course does not beat a board it was never racing.

Both are **opaque strings supplied by the client**, because the two kinds of course version
themselves differently and it is not this server's place to invent one:

- Grid levels have `AgentLevelState.revision` → `level:<id>@<revision>`. The play layer
  snapshots that durable library revision when the course is materialized, so an edit made
  during a run cannot relabel the finished run onto a newer board.
- Scene-store courses have the record revision → `scene:<name>@<revision>`
- Code-composed archive courses have **neither**, and their only honest version signal is
  their id (e.g. `archive-level3-v2`). Plumbing a real version through those is open work.

`rulesVersion` may be omitted, in which case the server fingerprints the submitted `rules`
block. This is a fingerprint, **not** a version counter: `src/agent-world-rules.ts` records a
decision that the rules definition must not carry its own revision, and that decision stands.

## Ghosts

Traces are the exact shape `src/level-ghosts.ts` already persists — `{ elapsedMs, samples: [{ tMs, position: [x,y,z] }] }` —
so a downloaded ghost plays back through the existing interpolator with no conversion.

Bounds mirror the client's (`GHOST_MAX_SAMPLES = 6000`, ≥ 2 samples, finite triples), and the
smoke asserts the numbers agree by reading them out of both files: a cap that drifts between
client and server is a cap that does not exist.

One rule is **stricter** than the client: sample times must strictly ascend. The client never
checked, because its playback binary-searches a trace its own recorder produced in order. A
trace arriving over HTTP has no such guarantee, and an unsorted one produces silently wrong
interpolation.

The recorder preserves that contract at the finish edge: if the HUD poll and forced finish
observe the same elapsed time, the finish position replaces the last sample instead of adding
a duplicate timestamp that would invalidate an otherwise recordable result.

Retention is bounded: the top 50 results per board, ghosts for the top 10.

## API

```
POST /results                                     store token required
  { recordId, actorId, label?, courseVersion, rulesVersion? | rules?,
    elapsedMs, medal?, outcome?, desynced?, resyncs?, floorMs?, ghost? }
  → 201 { improved, isNewBest, bestMs, previousBestMs, rank, ghostStored, trust }

GET /results/:recordId/leaderboard?courseVersion=&rulesVersion=&limit=   open
GET /results/:recordId/personal/:actorId?courseVersion=&rulesVersion=    open
GET /results/:recordId/ghost/:actorId?courseVersion=&rulesVersion=       open
```

Writes need the store token; reads are open, matching how scene reads work.

## Limitations

1. **`actorId` is self-reported.** The store token says "allowed to record", not "who". Same
   limitation the live-session layer documents. There is no account system behind it.
2. **Not cheat-proof, by construction.** See the trust section. Anyone holding the store token
   can post any plausible time.
3. **Composed archive courses have no real version.** They are keyed by id, so editing one in
   code silently keeps the old board. Grid and scene-store courses do not have this problem.
4. **Recording needs the store token; reading does not.** A browser without one reads
   leaderboards and races ghosts but does not post. That is a capability check made *before*
   submitting, not an error handled after: Chromium writes "Failed to load resource: 401" to
   the console itself, before application code can catch it, and the front door asserts zero
   console errors. Same reason the client makes no request at all until configured.

## In the browser

`src/results-client.ts` is the client, `src/leaderboard-panel.ts` the board, and
`src/ballz-play.ts` submits on finish and appends the board to the win panel. A "Race" button
on a rival's row downloads their ghost and replays the course against it —
`createPersonalGhostSession` takes a `challenger` trace that replaces the *playback* source
while recording and personal-best storage stay entirely your own.

Both `window.__GRAPHYSX_RESULTS__` and `window.__GRAPHYSX_RESULTS_UI__` exist only when a
store answered; their absence is the storeless contract, and the smoke asserts it.

Proof: `scripts/smoke-results-browser.mjs` (30 assertions). It asserts the storeless case
first, because that is the one that regresses, and it reads the *painted* colour of the
rendered names and times rather than their aria-labels — the first version of the panel
inherited black onto a dark surface and 23 green assertions did not notice.
