# Release verification time

The release gate runs the complete smoke inventory across four independent GitHub
Ubuntu runners. Each runner still executes its checks serially, with the existing
machine lock, isolated servers, assertions, deadlines and retry policy. The existing
`Typecheck, build, headless smokes` check succeeds only when every shard succeeds;
production continues to depend on that complete reusable workflow.

`npm run verify` remains the full serial local gate. To reproduce one CI shard:

```bash
npm run verify -- --shard=2/4
```

A shard reports its partial scope. All four shards on the same revision are required
for release qualification. Sharding cannot be combined with tiers or an external
base URL, which could otherwise omit required checks. Do not run several shards
concurrently on one local machine; the machine lock continues to prevent that.

## Measured baseline

The [September 11 release](https://github.com/WindriderQc/GraphysX-Web/actions/runs/34564435709)
at `f3219f68fd98bdf8956d08e13c05abcb7e3b6a1c` spent 1h43m27s in
`Verify release`. `live-sessions-browser` alone took 25m55s, showroom 8m08s and
editor 7m09s. The successful deployment retry took 4m33s, including a 12-second
upload, a 12-second production build and 3m07s checking the activated site.
The original deployment attempt failed its remote disk preflight; the later retry
reused the successful verification job. The intervening hours were not build time.

The bottleneck is serial software-rendered browser testing. Rebuilding the final
production bundle is a small fraction of the total and remains unchanged, including
its production store configuration. Deployment, rollback and public smoke logic
also remain unchanged.

## Partitioning and estimates

`scripts/verify-timings.json` records the smoke durations from that successful gate,
with its revision and source run. `scripts/verify-shards.mjs` assigns the longest
checks to the least-loaded shard, then restores manifest order within each shard.
The manifest is the sole coverage inventory: stale timing entries do not select
checks, and newly registered checks automatically join a shard. Unmeasured checks
use a five-minute estimate (30 minutes for a long-deadline check). These are scheduling
hints only; they never change the actual timeout or a test assertion.

For the initial 59-smoke inventory, this predicts roughly 32 minutes per shard,
plus runner setup and the separate deployment job. This is an estimate: five new
KidX journeys lack Linux timings, shared runner performance varies, and the current
feature code differs from the measured baseline. Record a complete green matrix
before claiming an observed speedup. Inspect its four screenshot artifacts and
per-shard summaries when diagnosing a failure.

Four runners reduce wall time by distributing existing work. The inexpensive unit,
typecheck, lint, build and Node probes repeat in each shard to keep it self-contained.
Total runner minutes may increase slightly with setup and repeated static checks.
No GPU runner or homelab service is required.

GitHub's [matrix documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/run-job-variations)
describes the parallel jobs. `fail-fast: false` preserves evidence from the remaining
shards after a failure; the aggregate check rejects failure, cancellation or a skipped
matrix. An already-running deployment keeps the workflow from its own revision.

## Initial local validation (2026-09-11)

`npm test`: 326 passed, one existing Windows skip. Typecheck and full lint passed.
Coverage tests exercise every supported shard count, exact-once inclusion, new checks,
invalid shard arguments and conflicting scope filters. Both workflow files parse,
and the required matrix-to-verification-to-deployment dependencies were checked.
The four-runner Linux matrix and its wall-time improvement have not yet been measured.
