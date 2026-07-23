# GraphysX Web — session contract

Read `HANDOFF.md` for orientation and `progress.md` for history. This file is the short list
of rules that exist because breaking them has already cost real sessions real hours.

## Concurrency on this machine (several sessions share it, and this tree)

- **One full gate at a time, machine-wide.** `npm run verify` software-rasterises WebGL on
  ~70% of the cores. The lock is machine-global (`verify-guard.mjs`), so it now covers
  worktrees too. Queue politely with `npm run verify -- --wait`; never `--force-lock` unless
  you have verified the holder is dead. Measured cost of overlap: five of six runs losing a
  random smoke to `net::ERR_CONNECTION_RESET`.
- **Iterate with node-only probes and single smokes**, not repeated full gates. Run one full
  gate at the end.
- **CI is the authority.** If a local smoke fails on something your diff does not touch,
  check `gh run list` before chasing it. The deploy gate runs on a clean machine and has
  repeatedly passed commits the loaded local box failed.
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
  code holding scene state. New API methods go on BOTH `agent-world-api.ts` and
  `prototype-app.ts` or the build breaks (this is deliberate).
- Entity types thread through the full map in `HANDOFF.md` ("Adding an entity type").
- One shared frame loop. Never a second `requestAnimationFrame`.
- Recovered archive material is adapted behind v2 vocabulary, never rewritten, and
  provenance records keep `faithful` / `adapted` / `absent` honest — placements you invented
  go under `adapted` even when they were informed by recovered data.
