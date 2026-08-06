# Unit tests

`npm test` — `node --test`, no framework, no dependency. Runs in about a second.

## Why these exist, and what they are not

Everything else in this project is proved end to end: 55 checks in `npm run verify`, most of
them driving the built output through a real headless browser. That has caught bugs nothing
else would have — objects falling through the world, dead clicks on scenery, a console error
on every production page load — and none of it is being replaced here.

What it could not give anyone is a *fast* answer. The gate holds a machine-global lock,
software-rasterises WebGL across most of the cores, and runs serially, so `CLAUDE.md`'s
standing advice is to run one full gate at the end and iterate on node-only probes. That
advice is right and it left a gap: the logic hardest to reason about in this codebase is pure,
dependency-free, and was reachable only by starting a server and speaking HTTP to it.

So the rule for this directory is narrow. **A test belongs here only if it needs no browser,
no server, no port and no disk** (`results-store` bends the last one, and says why). Anything
that needs a running system is a smoke, and belongs in `scripts/`.

## What is covered, and why it earned a test

| File | Covers | Why |
| --- | --- | --- |
| `store-paths.test.mjs` | `encodeStoreName` / `decodeStoreName` | Ids reaching the filesystem is a portability trap with a reproduced failure. Also pins the no-migration property: an ordinary name must still encode to itself. |
| `inverse-operations.test.mjs` | `computeInverseCommands`, `touchedEntityIds` | Decides whether collaborative undo reverts the right thing or destroys a colleague's work. Returns `null` for a dozen distinct reasons and ordering matters. |
| `ghost-trace.test.mjs` | `validateGhostTrace` | Eight rejection branches on a submitted recording, and one rule deliberately stricter than the client's. |
| `mission-reducer.test.mjs` | `applyMissionEvent` and friends | Documented as pure, and roughly twenty state transitions gate who may claim a mission stage is done. |
| `results-ranking.test.mjs` | ordering, retention, `fingerprintRules` | `rankResults` has a *recorded past bug* — comparing the wrong field made every difference `NaN`, which a comparator treats as "leave it alone", so the board silently kept insertion order and looked plausible. |
| `verify-classifier.test.mjs` | `createFailureClassifier` | It decides which failures the gate is allowed to retry. If it silently stops matching, the gate quietly returns to retrying real assertion failures. |
