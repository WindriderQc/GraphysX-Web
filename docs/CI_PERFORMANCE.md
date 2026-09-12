# Verification proportional to the change

CI always runs unit tests, typecheck, lint, build and the fast Node physics probes.
Browser checks are selected by changed area. A full 3D regression is not a routine
prerequisite for every deployment.

| Change | Browser coverage |
| --- | --- |
| Markdown documentation, Node unit tests, verification tooling, CI configuration | None; no site deployment |
| One registered smoke script | That smoke; no site deployment |
| KidX arrival guide | Guidance journey plus short integration checks |
| KidX PDF/catalog | Workshop journey plus short integration checks |
| KidX code laboratory | Interactive, challenge and guidance journeys plus integration |
| Other KidX/EV3 code or KidX assets | KidX/EV3 journeys plus integration |
| BallZ code | Game journeys plus integration |
| Results client/store | Results contracts and browser journey plus integration |
| Store or live collaboration | Store/collaboration contracts and journeys plus integration |
| Deployment configuration | Short integration checks, then existing production smoke |
| Shared engine, global styling, build/dependencies, unclassified files | Full regression |

The short integration selection is `standalone`, `product-assets` and `asset-guard`;
only standalone launches a browser. The last two check the built asset inventory in
Node. Mixed changes take the union of their checks. Existing assertions, timeouts,
retry limits, rollback and the post-activation public smoke remain in place.

## Comparison base

`scripts/plan-verification.mjs` reads Git changes, including both sides of renames.
For production, it compares HEAD with the last successful deployment that actually
ran the `deploy` job. A successful docs-only workflow with a skipped deploy job does
not advance this baseline. Failed/cancelled releases and changes in intervening
commits remain covered until a deployment succeeds. Prior runs are ordered by update
time so a rerun of an older release can become the latest activation.

Pull requests compare with their base merge point; manual branch runs compare with their
merge point against `origin/main`. Missing history, unavailable GitHub evidence or
no successful ancestor among the latest 20 successful main workflows selects the
full suite. The workflow summary names the comparison SHAs, changed files, matching
rules and selected checks. A selected check is required; a skipped/failed planner
or failed/cancelled matrix cannot pass the aggregate release check.

The coverage map is explicit in `scripts/verify-impact.mjs`. It is not inferred from
runtime imports. New shared paths default to full verification. When adding a narrow
rule, check its consumers and add a regression test for the expected selection.

EV3 scene/drive/program checks and KidX debrief review/turn/outcome checks run as separate
journeys. Their combined scripts remain available for manual use. A change to either
shared script selects its whole family, so splitting a slow journey retains its assertions
and the existing per-process deadline.

## Running checks

```bash
# The full serial suite remains available explicitly.
npm run verify -- --wait

# Reproduce an exact selection printed by CI.
npm run verify -- --checks=kidx-guidance-arrival,standalone,product-assets,asset-guard --wait

# Static checks, with no Chromium launch or smoke server.
npm run verify -- --checks=none --wait
```

The CI workflow has a manual `full_verify` input; deployment also exposes this input.
Automatic CI runs for pull requests and is called by the main deployment workflow.
Branch pushes without a PR do not run a duplicate gate; use the manual CI entry when needed.
There is no new recurring task. Manually selected checks report their limited scope;
the production workflow requires the complete selection calculated from its baseline.

Selections are balanced across one to four independent GitHub runners, using the
historical seconds in `scripts/verify-timings.json`. Each runner remains serial and
retains the machine lock. New checks receive estimates until measured; estimates
never change deadlines. Static-only changes use one runner and skip Chromium installation.
The original `--shard=i/n` option still reproduces a slice of the full inventory.

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
