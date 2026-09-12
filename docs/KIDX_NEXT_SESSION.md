# KidX continuation after session cleanup

## Daily use on ugKid

Open [production KidX](https://graphysx.specialblend.ca/?app=ev3-lab), or go directly to
[the construction workshop](https://graphysx.specialblend.ca/?app=ev3-lab&view=atelier).
The public application does not require a Windows preview or an SSH tunnel. Read the
production section in [HANDOFF.md](../HANDOFF.md) for the deployed revision and its evidence.
The optional LAN PDF cache and cross-screen construction rooms are separate from static
hosting; see [the workshop guide](KIDX_WORKSHOP.md).

The loopback addresses, branches and commands below document earlier physical acceptance.
Use them only to reproduce those specific receipts. Preserve the old browser profile:
programs stored on its loopback origin are separate from the production site's storage.

## Earlier integration status

`codex/kidx-integration` now contains all branches listed below, including maintenance
`9d5d727` and the LEGO reference index `a2bd99b`. Its full gate passed 58/58 without retries
on `0561dcd`; the later mat-only fix has separate targeted checks. The current continuation
is `codex/kidx-ugkid-acceptance`, which includes that fix and the bounded CLI USB adapter.
The owner confirms controls and the remaining Programs copy/scroll/Escape checklist. Real
EV3 USB runs cover all four blocks and stopping after controller-process loss on unmounted
motors. Read [current acceptance](KIDX_UGKID_ACCEPTANCE.md) and [USB status](KIDX_EV3_USB.md)
for the exact evidence and remaining chassis qualification; do not repeat completed tests.
The branch inventory and cleanup receipts below describe the earlier rover closeout; do not
repeat the merge or treat its `e77158b` gate as the integrated build's receipt. See current
`HANDOFF.md` and the latest integration entry in `progress.md` for subsequent results.

## Branches and evidence

- `codex/kidx-mint-rover`: code commit `e77158b`, in
  `C:\Users\Yanik\.codex\worktrees\ab67\GraphysX-Web`. Visible rover yaw and held-control
  ownership/reset are corrected; BallZ's independent aim/body behavior is unchanged.
- `codex/kidx-linux-mint`: concurrent redesign commit `fa9e6d0`, in
  `C:\Users\Yanik\codes\GraphysX-Web`. It introduces a dedicated workbench, detailed EV3
  model, authored work mat and fixed camera. Read its `docs/KIDX_VISUALS.md`. Its heading
  group already turns the visual assembly, so do not blindly substitute this branch's
  chassis-root composition. Review and preserve the held-input lifecycle correction too.
- Both start from `f3d9f52`. The two branch tips were not merged, rebased or pushed during
  cleanup. The original checkout has another session's dirty `.gitignore`; preserve it.
  Rediscover current branches and ownership before any reconciliation.
- This branch passed one final `npm run verify -- --wait`: 58/58 checks, zero retries,
  293 unit passes and one existing skip. The Programs smoke took 8m12s of its unchanged
  10-minute deadline; the 131/131 live-browser checks passed. This receipt covers `e77158b`,
  not the untested combination with the redesign.

Evidence is retained in this worktree's `output/mint-rover/`,
`output/playwright/mint-rover/` and `output/verify/`. Earlier touchscreen diagnosis receipts
remain under the original checkout's `output/mint-touch-2026-09-10/` and
`output/playwright/mint-touch/`. The two transient gate-watching scripts are stopped and
retained with their logs. No evidence or Firefox saved program was deleted.

## Cleanup completed

- Stopped the rediscovered acceptance server PID 25412 and SSH reverse tunnel PID 3148.
  Port 4175 was verified absent on both Windows and ugKid. No scoped touch-capture helper
  remained running on ugKid.
- Removed this session's four `/tmp/kidx-*.png` screenshot duplicates on ugKid only after
  comparing SHA-256 hashes with their retained local copies.
- Recursive deletion of the duplicated site was rejected by automatic approval review
  with the reason `blocked by policy`. A reversible rename retained it as
  `output/playwright/mint-rover/site-validated-e77158b/`. Its 436 files match the gate build.
  `dist/`, source, evidence and the useful acceptance/observer scripts remain available.
- Preserved the unrelated Vite server on 4176 (PID 17476 at cleanup), all other worktrees,
  Firefox and its profile, and the requested disabled automatic lock setting. Rediscover
  PIDs; do not reuse these numbers to stop processes in another session.

## Resume testing

SSH to ugKid remains authorized: `yb@192.168.2.116`, Windows key
`C:/Users/Yanik/.ssh/id_ed25519`, with `BatchMode=yes`, `StrictHostKeyChecking=yes` and
`IdentitiesOnly=yes`. No new permission is needed for that established SSH access.

To reproduce this branch's receipt, the retained `serve.mjs` can be run from this worktree
with port argument `4175`; it recreates `site/` from the current `dist/`. Rediscover listeners
first. For a newly reconciled build, deliberately select and verify the new build and its
source hashes before physical testing; do not infer it from an old `dist/` or archived site.
The reverse tunnel must bind only `127.0.0.1:4175` on both hosts. Launch background helpers
hidden on Windows. Keep Firefox's existing profile and `http://127.0.0.1:4175` origin so the
saved `forward` program remains accessible. XInput2 was enabled only for the Firefox session;
do not persist a launcher change implicitly.

## Roadmap order

1. Reconcile the held-control fixes and the concurrent workbench design in an isolated
   branch, preserving the one-runtime/API/scene-composition invariants. Compare both sets of
   smoke assertions, especially visual heading, success/retry held state and saved replay.
2. Finish the short actual-PC checklist with the owner: remaining block/Undo/Stop routes,
   Programs touch scrolling, repeated name editing/copying, Tab/Shift+Tab/Escape and restored
   focus. Drive holds, slide-out release, visible Left/Right yaw, Go success/retry and saved
   program reload/replay are already physically accepted on this branch. The redesign and
   combined result need their own rendered and physical evidence. Do not repeat general
   touchscreen diagnosis or calibration without new evidence.
3. Continue the narrow EV3 adapter using the same compiled four-block input sequence. First
   establish firmware, connection, motor ports and polarity with the owner. The brick is
   unplugged and unqualified; no motor result or transport choice is assumed. Require real
   measurements for timing/turn calibration and explicit bounded stop on transport failure.
4. Keep application-surface generalization deferred until a second application requires it.
   Center expansion, package extraction and repository splitting remain deferred decisions.

Read `CLAUDE.md`, `HANDOFF.md`, `docs/LINUX_MINT_TOUCH.md` and the relevant current product
status before editing. Iterate with existing unit tests and focused browser smokes, inspect
screenshots, and run one final gate after code changes using the machine-global lock.
Documentation-only cleanup does not require another full gate. No push, merge or production
deployment is authorized by this handoff.
