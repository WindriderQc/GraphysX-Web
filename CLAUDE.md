# GraphysX Web — session contract

Read `README.md` for entry points and commands, `HANDOFF.md` for current priorities, and
search `progress.md` for specific history. This file is the short list
of rules that exist because breaking them has already cost real sessions real hours.

## Concurrency on this machine (several sessions share it, and this tree)

- Before editing, inspect `git status`, `git worktree list` and known active tasks. A clean
  branch is not an ownership release. Work in a separate `codex/` branch/worktree when
  another task owns the checkout; never reset, stash or absorb its changes.
- **One full gate at a time, machine-wide.** `npm run verify` software-rasterises WebGL on
  ~70% of the cores. The lock is machine-global (`verify-guard.mjs`), so it now covers
  worktrees too. Queue politely with `npm run verify -- --wait`; never `--force-lock` unless
  you have verified the holder is dead. Measured cost of overlap: five of six runs losing a
  random smoke to `net::ERR_CONNECTION_RESET`.
- **Match local validation to the change.** Use unit/contract tests and scoped lint for
  Node-only tooling; check links and commands for documentation. Use focused browser smokes
  for an affected journey and a full gate for changes spanning shared runtime behavior.
  **Publication requires static checks and the affected journeys selected by CI.** The
  full suite is required for shared runtime/dependency changes, unknown impact or an
  explicit full-verification request. Docs and Node-only tooling do not need 3D tests.
  See `docs/CI_PERFORMANCE.md`; do not restore an unconditional full suite before deployment.
- **Compare the same revision and scope.** If a local smoke fails outside the diff, inspect
  machine contention and `gh run list` before changing product code. A clean CI run is useful
  evidence only for the revision it tested; an older green deployment does not validate
  today's local changes.
- **Stage by explicit path. Never `git add -A`.** Concurrent sessions' work has been swept
  into unrelated commits three recorded times — once leaving `main` briefly broken (a smoke
  landed without its feature).
- `dist/` is shared and NOT covered by the verify lock: do not run a bare `npm run build`
  while a gate is running.

## Verification discipline

- Never pipe a gate through `tail`/`head` — `$?` becomes the pipe's and the summary is
  truncated. Redirect to a file, read the `=== verify summary ===` block.
- **Never weaken an assertion or extend a timeout to make a smoke pass.** Diagnose. Strict
  assertions have caught every real bug this project has records of.
- **Screenshot anything visual before shipping it.** Green assertions have coexisted with a
  hovering crowd, a camera buried inside a mesh (twice), and mis-scaled worlds. `output/`
  screenshots are the evidence; look at them.
- Prefer measurement to derivation: probe the composed scene through the public API
  (deterministic `api.step`) rather than deriving coordinates from source data. The
  drop-grid pattern in `progress.md` (`level1-r1`) is the template.
- Before working a defect-register or roadmap entry, **check it against HEAD** — three
  register bugs and one whole Horizon-3 item were already fixed while still listed open.
  Use two search methods before declaring anything absent.

## Product invariants (the short version)

- Every editor control and showroom interaction is an ordinary `api.*` call. No bespoke host
  code holding scene state. There is one implementation of the API now — `agent-world-api.ts`.
  The second one lived on the legacy route and retired with it.
- Entity types thread through the full map in `HANDOFF.md` ("Adding an entity type").
- One shared frame loop. Never a second `requestAnimationFrame`.
- Recovered archive material is adapted behind v2 vocabulary, never rewritten, and
  provenance records keep `faithful` / `adapted` / `absent` honest — placements you invented
  go under `adapted` even when they were informed by recovered data.

## Delivery and cleanup

- Follow the task's authorized delivery level. A push to `main` starts production deployment;
  LAN staging is manual. See the workflows and `ops/README-staging.md`, not historical plans.
- Report local changes, commits, push/PR, CI, merge and deployed behavior separately.
  Publication uses the CI impact plan relative to the last successful production deployment;
  ad hoc tier, existing-build and external-page checks alone are not that release plan.
- Remove only this task's temporary processes and worktrees. Before normal `git worktree remove`
  or `git branch -d`, prove the work is saved/integrated and no session uses it; inspect tracked,
  untracked and ignored files. Preserve `.graphysx-store/` and useful `output/` receipts. If
  ownership or data preservation is uncertain, retain the path and explain why at closeout.
