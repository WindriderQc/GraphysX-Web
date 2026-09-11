# KidX interactive workshop delivery

User authorization (2026-09-11): "all the way to the end, and beyond!!" for the ten-feature roadmap.
Scope: usable local learning software, French interface, shared scene API and frame loop.

| Workstream | Acceptance | Status |
| --- | --- | --- |
| Reverse | Held drive control, saved reverse block, physical backward route | Verified locally |
| Robot animation | Independent CAD wheels driven by odometry, optional local sound, animated B/C meters on the brick LCD | Verified locally |
| Animated construction | Insertion arrow, ghost destination, pause, slow replay, smooth explode | Verified locally |
| Nestor demonstration | French requests trigger visible build controls and share their action path | Verified locally |
| Physical challenges | Movable cargo, obstacles, ramps and measured objectives | Verified locally |
| Sensors | Distance, touch, color, heading readings consumed by programs | Verified locally |
| Growing language | Motor power/duration, wait, repeat, conditionals, live block, pause/step, persistence | Verified locally |
| Model adventures | Build/program/test/challenge navigation and saved achievements | Verified locally |
| Micro demonstrations | Short local interactive demonstrations with playback controls | Verified locally |
| Build together | Two named roles, prepare/assemble handoff, saved cooperative progress and revisioned shared rooms | Verified locally |

Visual verification covers desktop, compact landscape and portrait, including open panels.
The final repository gate passed all 62 checks: 310 unit tests passed, one intentional Windows
skip, typecheck, lint, production build, both Rapier probes and all 56 integration checks.
Receipt: `output/kidx/verify-expansion.log`; inspected screenshots: `output/verify/`.
Hardware, production and public distribution are outside this local delivery.

Implemented coverage is described in KIDX_WORKSHOP.md. Six new challenge routes completed in
the browser through real controls and Rapier, with no console errors. Thirteen added node tests
cover odometry, language execution, validation/persistence, sensing, local Nestor actions,
progress, room synchronization, stale writes, expiry, reconnect and leaving during an in-flight join.
The required game client rendered individual CAD insertion and the 8:24 gear demonstration.
The saved-program smoke passed in 9m14s of its unchanged ten-minute deadline; keep this
headroom measurement for future test-maintenance work. Full receipts are in progress.md.
