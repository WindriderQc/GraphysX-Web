# Unit tests

`npm test` — `node --test`, no framework, no dependency. Runs in about a second.

## Why these exist, and what they are not

Everything else in this project is proved end to end by the full `npm run verify` matrix, most
of it driving the built output through a real headless browser. That has caught bugs nothing
else would have — objects falling through the world, dead clicks on scenery, a console error
on every production page load — and none of it is being replaced here.

What it could not give anyone is a *fast* answer. The gate holds a machine-global lock,
software-rasterises WebGL across most of the cores, and runs serially, so `CLAUDE.md`'s
standing advice is to run one full gate at the end and iterate on node-only probes. That
advice is right and it left a gap: the logic hardest to reason about in this codebase is pure,
dependency-free, and was reachable only by starting a server and speaking HTTP to it.

So the rule for this directory is narrow. **A test belongs here only if it needs no browser,
no server, and no port.** Store contracts may use an isolated temporary directory when persistence
itself is the behavior under test. Anything that needs a running system is a smoke, and belongs in
`scripts/`.

## What is covered, and why it earned a test

| File | Covers | Why |
| --- | --- | --- |
| `asset-store.test.mjs` | streamed upload cleanup, body compatibility, manifest cache isolation | Rejected bodies cannot leave unbounded directories; programmatic callers and cached records keep value semantics. |
| `live-session-stream-bounds.test.mjs` | projected SSE byte guard and hard teardown | A nonreader cannot cross the retained-memory budget or keep queued bytes alive behind a graceful end. |
| `scene-relay.test.mjs` | legacy scene SSE replay, global retention, admission and slow readers | Empty/gapped replay cannot claim success; unique names, bytes and readers are globally bounded; early disconnects and stalled peers release every slot and timer. |
| `store-migration.test.mjs` | dual-read scene/result persistence | Historical raw and percent-era files remain visible while new writes use bounded case-stable paths and counts deduplicate both copies. |
| `store-paths.test.mjs` | bounded id encoding and legacy path compatibility | Prevents NTFS device/ADS failures, case-fold aliases, component overflow, and silent orphaning of historical raw or percent-encoded stores. |
| `inverse-operations.test.mjs` | `computeInverseCommands`, `touchedEntityIds` | Decides whether collaborative undo reverts the right thing or destroys a colleague's work. Returns `null` for a dozen distinct reasons and ordering matters. |
| `ghost-trace.test.mjs` | `validateGhostTrace` | Eight rejection branches on a submitted recording, and one rule deliberately stricter than the client's. |
| `mission-reducer.test.mjs` | `applyMissionEvent` and friends | Documented as pure, and roughly twenty state transitions gate who may claim a mission stage is done. |
| `results-ranking.test.mjs` | ordering, retention, `fingerprintRules` | `rankResults` has a *recorded past bug* — comparing the wrong field made every difference `NaN`, which a comparator treats as "leave it alone", so the board silently kept insertion order and looked plausible. |
| `verify-classifier.test.mjs` | failure classification and retry budget | Only recorded transport signatures can retry; CI defaults to zero tolerated retried passes while local runs retain an explicit bounded allowance. |
