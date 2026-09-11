# KidX combined-build acceptance on ugKid

## Source and ownership

This acceptance starts from `0561dcd5948cab28bdf589ad80c3d3ee5859613f`, on the isolated
branch `codex/kidx-ugkid-acceptance` in `C:/Users/Yanik/codes/GraphysX-Web-ugkid`.
The concurrent `codex/kidx-integration` task already combined the maintenance changes,
`e77158b` held-control correction and `fa9e6d0` workbench redesign. Reuse that integration;
do not merge the two source branches a second time.

The workbench's `ev3-drive-base:heading` group still contains the model, brick and
direction marker. Shared steering moves that assembly. Held pointer ownership is cleared
on success, retry, disable and disposal. The independent BallZ aim/body path and shared
runtime are unchanged by the reconciliation.

The owner explicitly split the concurrent work on 2026-09-10: the integration task owns
the single final full gate; this task owns the 4175 tunnel, physical acceptance and EV3
follow-up. Preserve the original checkout's dirty `.gitignore`, its 4176 server, the
integration acceptance server and other worktrees. New missions and construction-guide
work in another task are outside this fixed acceptance revision.

## Build and access receipts

- A fresh `npm run build` completed in this worktree while holding the existing machine
  verification lock; the lock was then released. `npm test`: 300 passes, one existing
  platform skip, zero failures.
- All **439 compiled files** are byte-identical to the integration task's frozen
  `output/playwright/kidx-integration/site/`. The full inventory, Git source blob ids and
  tree id are retained in `output/playwright/ugkid-acceptance/prepared-build.json`.
- Reused the existing integration server on Windows `127.0.0.1:4175`. Its manifest names
  `0561dcd`, with index SHA-256
  `6064657dfd5fb00f01b4ad1ca30ef952c3878b96101a7ca63c8f9bcb7eed00ab`.
  Source working-file hashes can differ with checkout line endings; the Git blobs and
  compiled-file comparison establish the source/build correspondence.
- Restored the authorized reverse SSH forward with
  `-R 127.0.0.1:4175:127.0.0.1:4175`, `BatchMode=yes`, `StrictHostKeyChecking=yes`,
  `IdentitiesOnly=yes`, `ExitOnForwardFailure=yes` and keepalives. Both listeners are
  loopback-only. Remote `curl /__build.json` and Firefox's served-build receipt match.
- Firefox's existing process/profile remains in use with session-only
  `MOZ_USE_XINPUT2=1`, 1920x922 viewport on the 1920x1080 display. Opened the combined
  `http://127.0.0.1:4175/?app=ev3-lab` and inspected the actual-Mint screenshot
  `output/playwright/ugkid-acceptance/mint-ready.png`. The page is ready in Build mode.
- PIDs are transient: rediscover the listener owners before stopping anything. At setup,
  the integration server was PID 4648 and this task's tunnel PID 40084. Local tunnel logs
  and pid receipt are in `output/playwright/ugkid-acceptance/`.

Physical input receipts remain in the running server's
`C:/Users/Yanik/codes/GraphysX-Web-integration/output/playwright/kidx-integration/browser-receipts.jsonl`.
The observer is passive; a remote page opening or screenshot is not a physical-input pass.
Filter by Firefox session start and correlate owner feedback with input/state transitions.

## Remaining physical checklist

Drive holds, visible turns, release outside a control, Go success/retry and the saved
`forward` program's reload/replay were accepted on `e77158b`. Keep those receipts scoped
to that version; do not repeat broad touch diagnosis or calibrate without new evidence.

| Check | Physical procedure | Current result |
| --- | --- | --- |
| Left route, Undo and Stop | Add Left, Forward, Stop. Undo removes only the last block. Restore Stop and Run: left turn, forward motion, then a stopped, editable program. | Owner confirms controls; Undo/Stop have receipts, Left has no individual run receipt. |
| Right route | Undo all three blocks; add Right, Forward, Stop and Run. Check the opposite route and final stop. | Owner confirms controls; Right/Stop exercised in another sequence, detailed below. |
| Name editing and copies | Open the existing `forward` program through Programs. Select/edit the name with the mini-keyboard; save a distinct copy. Confirm the original `forward` entry remains. Repeat with distinct names. | Pending. |
| Programs scrolling | Make enough named copies for the real dialog to overflow; swipe up and down inside the list, then open a visible entry. Do not seed storage or emulate a swipe and call it hardware acceptance. | Pending. |
| Keyboard focus | In Programs, Tab and Shift+Tab cycle through visible enabled controls, including both ends. Escape closes the dialog and restores focus to Programs; reopen and edit again. | Tab/Shift+Tab and reverse focus wrap observed; Close restores outside focus. Escape not recorded. |

### Owner follow-up, 2026-09-11 01:44 UTC

The integration task relayed the owner's feedback: "everything works well so far with
programs; tell me if I should test anything else." Matched Firefox receipts show trusted
touches adding Forward, Stop and Right, multiple Undo operations removing one trailing
block each, Run, success and Try again. A six-block program containing two Right blocks
finishes at heading 177.12 degrees with the final Stop; no browser error was recorded.
These are positive physical results for the exercised controls. The exact paired route
recipes above were not followed, and Left, name-copy edits, overflowing-list scrolling and
Tab/Shift+Tab/Escape still have no matching physical receipt. Request only those remaining
interactions; do not restart already accepted Drive or general touch diagnosis.

The owner subsequently confirmed in this task that the controls are good. Accept that
usability report without asking for the driving tests again. Additional Firefox receipts
at 01:57 UTC contain Tab and Shift+Tab input, with no browser errors. They do not yet show
a Left program run, a saved-name copy, an overflowing-list scroll or Escape; keep the
owner's broad controls confirmation separate from these individually instrumented checks.
The six-block limit was also noticed by the owner and explained as the deliberate First
Drive application cap. No increase was requested or implemented.

`Stop` is the existing timed neutral-input block, not an emergency-stop button during Run.
For these programs it is last, and the runner then pauses the simulation. No new execution
semantics or second block representation are introduced by this acceptance.

## EV3 follow-up

The owner has now powered on one of two EV3 bricks and connected it to ugKid by USB. The
owner believes it has the original LEGO firmware and is open to exploring another OS on
the second brick. Read-only USB inventory confirms `0694:0005`, an EV3 HID interface with
interrupt endpoints `0x01`/`0x81`. After the owner granted the scoped USB access below,
the real brick answered **firmware V1.09H**, **hardware V0.60**, and OS version string
`Linux 2.6.33-rc` (the query reserves 16 bytes, so this is not necessarily the full kernel
string). This confirms the LEGO Home firmware version. No firmware change was made.

Proposed wiring is **B = left drive motor, C = right drive motor**, viewed in the robot's
forward direction. A read-only `INPUT_DEVICE GET_TYPEMODE` query now detects large motors
(type 7) on B and C, with A/D empty (type 126). The left/right physical association and
polarity remain unconfirmed. The owner clarified that both motors are separate from the
chassis and explicitly deferred mounting direction; software inversion will be selected later.
A/B/C/D are motor outputs, while 1/2/3/4 are sensor inputs. Instruction
diagrams are reference material, not evidence of this particular robot's wiring.

The discovered `/dev/hidraw3` is owned by root with mode 0600. The version-only Python
standard-library probe at `output/ev3-usb/inspect_ev3.py` was copied to
`/tmp/kidx-inspect-ev3.py` on ugKid and correctly stopped at Permission denied before sending
anything. Packet encoding, version parsing, malformed-reply rejection and the version-only
command allowlist passed offline checks. The owner then ran
`sudo setfacl -m u:yb:rw /dev/hidraw3` locally, granting only
the owner account access for the current device connection. The live version and port
replies are retained in `output/ev3-usb/identity.json` and `ports.json`. No broad USB permission or
persistent udev rule was installed. Rediscover device identity after reconnection.

After the owner confirmed readiness, one B-only direction pulse at +20% power for 250 ms
was sent using the brick-timed `OUTPUT_TIME_POWER` operation with braking. The serial-bound
helper verified the opened EV3 USB handle before writing. The brick acknowledged the command;
the receipt is `output/ev3-usb/direction-b.json`. The owner observed its stop, but could not
assign a direction with the motors unmounted. This confirms the observed single-pulse stop;
it does not measure stop time or qualify a transport-loss stop.
No C pulse or compiled-program execution has been sent. The fixed pulse helper is
`output/ev3-usb/check_direction.py`, copied to `/tmp/kidx-check-direction.py` on ugKid.

Start with the documented LEGO USB direct-command path. An optional future ev3dev boot
uses a microSD card and leaves internal firmware intact; no flashing is needed to explore
it. See the [LEGO developer kits](https://education.lego.com/en-us/product-resources/mindstorms-ev3/downloads/developer-kits/),
[Linux hidraw interface](https://docs.kernel.org/hid/hidraw.html) and
[ev3dev boot model](https://www.ev3dev.org/). Motor-side association,
polarity and physical execution are still unqualified.

The [narrow USB adapter](KIDX_EV3_USB.md) now collects the existing runner's timed steering
inputs without changing browser code or duplicating its language. It maps that sequence to
explicit motor polarities and brick-timed pulses capped at 250 ms / 20% power, with stop on
completion/interruption and no automatic motion retry. Live read-only inspection and a
compiled preview pass on ugKid. Actual compiled execution, timing/turn measurements and a
real transport-loss stop test remain pending; simulator timing is not hardware calibration.

The integration task completed its single full gate on `0561dcd`: **58/58, zero retries**.
The exact summary is in its `output/playwright/kidx-integration/full-verify.log`. The frozen
site on 4175 still contains those 439 files. The separate USB tooling uses targeted tests;
no full gate was rerun here and no new UI or shared runtime change was made.

Application-surface generalization remains deferred until a second application needs it.
No push, merge into `main`, or production deployment is authorized for this task.
