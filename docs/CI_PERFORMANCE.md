# Fast hosted checks, local visual verification

GitHub does not launch Chromium or render 3D scenes. A single hosted job runs all
Node unit tests, typecheck, lint, the production build, the Node physics probes and
affected Node integration contracts. The existing ten Node-only checks remain
available: scene command validation, product assets, asset guard, preview inventory,
store authentication, sessions, session security, collaborative undo, results and DNA.

Visual journeys remain intact and run locally when their product area changes.
Inspect the screenshots and record the tested revision. CI prints the affected
local command, but does not claim to have executed it. This policy needs no new
runner, service, queue or approval system. The existing manual UGBrutal staging
workflow remains optional and executes on the local machine, not GitHub hardware.

## Selection and delivery

The existing impact map in `scripts/verify-impact.mjs` still selects affected
coverage. Known Node contracts go to GitHub; other checks go to the local visual
plan. New checks default to local execution until explicitly classified as Node.
Shared runtime, dependency or unknown changes select all Node contracts and the
full local plan. The `full_verify` manual input expands selection in the same way;
it never enables a hosted 3D renderer.

For production, comparison remains against the last successful workflow whose
`deploy` job actually ran. Successful documentation-only workflows with skipped
deployment do not advance this baseline. Failed/cancelled releases and accumulated
changes remain covered. Pull requests compare against their base merge point.
Missing history selects complete coverage instead of silently dropping checks.

The planner and Node job must both succeed. The aggregate check is named
`Typecheck, build and Node checks`; it does not claim visual acceptance.
Documentation and verification tooling still do not deploy the site.

After activation, `scripts/smoke-live-release.mjs` checks the expected release SHA
and compares the actual public HTML, module entry, module preloads and CSS against
the freshly built files byte for byte, with browser-compatible content types. This
catches an old index, missing bundles, changed bytes and SPA fallback pages without
rendering a scene. Request deadlines and the bounded manifest retry remain. Failure
still rolls back the existing deployment transaction. `release-http.json` records
file hashes; it is HTTP delivery evidence, not visual or acoustic acceptance.

## Local commands

```bash
# Static checks, without launching Chromium.
npm run verify -- --checks=none --wait

# Example focused visual journey; use the affected list printed by CI.
npm run verify -- --checks=llmx --wait

# Full local regression, when its broader coverage is needed.
npm run verify -- --wait
```

The existing local lock, assertions, timeouts and optional `--shard=i/n` remain.
No journey is deleted or weakened. The 84 checks comprise 10 Node contracts and
74 visual journeys; do not turn the local list into an unconditional extra gate
for a documentation or Node-only change. GitHub configuration and the HTTP checker
can be validated with Node tests, including explicit bad-publication fixtures.

## Historical hosted-rendering measurements

The measurements below explain the change of policy. They describe earlier
workflows that rendered 3D on GitHub and do not predict the new delivery duration.
A duration for the new policy is reported only after its first real run finishes.

## LLMx release correction (2026-09-14)

LLMx-only files previously fell through the unknown-file rule and selected every
game and collaboration journey. The explicit LLMx rules now select the affected
conversation/room journeys. Pose, finish and geometry changes retain native-world
round-trip, scene validation and external-agent coverage because the voxel face
also exists outside the room. Changes mixed with the shared runtime, host, schemas
or dependencies still receive their existing broad/full selection.

All 84 current journey timings now come from their passing CI receipts in runs
34804919818 and 34809216949. The first run had three old combined journeys time out;
only its passing journeys provide estimates. The second measured their seven
passing replacements. Timing metadata is a scheduling hint, never an acceptance
receipt or a timeout override.

The same full inventory has an estimated critical path of 63.4 minutes on four
runners and 25.8 minutes on twelve. This is a projection from measured individual
journeys; queueing, setup and deployment are additional, and the actual new run must
confirm the gain. The remaining full-suite floor is the 25m48s collaboration
journey. Static-only changes still use one runner, and small selections grow only
as needed toward a ten-minute scheduling target. Every selected check runs exactly
once; assertions, per-check deadlines, renderer quality and the aggregate required
check remain unchanged.

Observed on [run 34863918465](https://github.com/WindriderQc/GraphysX-Web/actions/runs/34863918465),
revision `0b906d080c32bd6b6ee563ac374ef5ef6e7e6945`: all twelve runners passed.
Verification ran from 15:44:02 to 16:11:55 UTC on September 14, **27m53s** including
planning, runner setup and the aggregate check. The run was created at 15:42:26 UTC;
initial queueing and subsequent deployment are outside that verification duration.
This confirms the parallel gain for the full 84-journey inventory. It does not
remove the cost of its browser journeys.
The complete successful workflow took **34m22s**, including its initial queue;
the deployment job took **4m49s**, including the activated-site smoke. All 84
registered journeys passed exactly once, with 551 passing Linux unit tests per
runner (about six seconds for the unit suite). Collaboration alone took 26m07s.

The following liner-only LLMx release, `2bb0476`, measured the narrower path:
[run34871091829](https://github.com/WindriderQc/GraphysX-Web/actions/runs/34871091829)
passed all 15 selected journeys exactly once on five runners, with 551 Linux unit
passes per runner and no skips. Verification took **12m49s**, deployment **4m27s**,
and the complete workflow **17m22s**. Family creation (8m19s) and the mathematics
journey (7m56s) still report deadline-headroom warnings; those passed without
extending any deadline. The cheaper face render does not remove other journey costs.

The combined sculpted-face/MCP release, `0a13e75`, selected the full inventory in
[run34873742082](https://github.com/WindriderQc/GraphysX-Web/actions/runs/34873742082).
Its first attempt passed 83 journeys; Family exceeded its unchanged ten-minute
deadline while continuing through the UI, without an assertion failure. One bounded
retry of that group passed on the identical SHA: Family **8m18s**, compared with
**8m19s** in the preceding release. The other eleven successful groups were retained;
all eight journeys in the retried group ran again. Across those attempts, all 84
registered journeys have passing coverage, with **564 Linux unit passes** and zero
skips. The local Family journey independently passed in **6m12s**, with its mobile
capture inspected. No assertion, timeout or renderer-quality change was made.

The entire successful workflow took **53m02s**, including the failed attempt and
targeted retry; deployment and its activated-site smoke took **4m42s**. This is the
actual delivery cost, not a new faster baseline. The repeated same-code check passed,
but Family's headroom warning remains a maintenance concern. The one bounded retry
does not establish a standing retry policy. Receipts are in
`output/llmx-sculpted-face-ci-{attempt1,family-retry,final}.log` and
`output/llmx-sculpted-face-ci-coverage.json`.

## Why this changed

The [September 11 baseline](https://github.com/WindriderQc/GraphysX-Web/actions/runs/34564435709)
spent 1h43m27s in verification, including 25m55s in collaboration, 8m08s in showroom
and 7m09s in editor. The successful deployment retry took 4m33s, including a
12-second upload and 3m07s checking the activated site. The interval between the
original failed disk preflight and its retry was not build time.

Parallelizing every test still spent unnecessary work on unrelated features. Selection
now comes first; parallel runners help larger selections. The earlier estimate of
32 minutes applied to the earlier full inventory, before KidX scenario splitting.
No new CI wall-time measurement is claimed before this workflow actually runs.

Implementation references: GitHub's [dynamic matrices](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/run-job-variations)
and [workflow run API](https://docs.github.com/en/rest/actions/workflow-runs).

Initial local validation (2026-09-11): 338 Node tests passed, one existing Windows
skip; scoped tooling lint and workflow parsing passed. Selection, exact coverage,
invalid filters, skipped/failed release baselines and cumulative Git rename history
were exercised. A read-only GitHub lookup found the real successful deployment base.
The first [Linux PR validation](https://github.com/WindriderQc/GraphysX-Web/actions/runs/34634263687)
passed in 2m17s: static checks plus the three selected deployment-integration checks.
This measures a tooling/deployment change, not the duration of a full regression.
Delivery and production receipts are attached to [PR #18](https://github.com/WindriderQc/GraphysX-Web/pull/18).

The [September 12 KidX PR validation](https://github.com/WindriderQc/GraphysX-Web/actions/runs/34699795220)
passed in 35m39s on four runners: all 28 selected journeys, 344 Linux Node tests,
typecheck, lint, build and both Rapier probes. This is the measured KidX selection,
not the full inventory. The split EV3 program took 6m30s; the three debrief journeys
took 5m23s to 5m35s, within their unchanged ten-minute deadlines. The existing compact
program-library and checkpoint-mission checks still reported headroom warnings at
8m43s and 9m04s. Those passed; the warnings remain visible for future maintenance.
