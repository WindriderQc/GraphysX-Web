# Ballsy camera and arrival QA

`scripts/smoke-ballsy-camera-finish.mjs` exercises the current build independently of
any private checkout or historical build. It defaults to `dist/`; set
`SMOKE_DIST_ROOT` to another explicit production output directory. It owns an
ephemeral loopback server and closes its browser/server on both success and failure.

Run expensive checks with the existing machine-wide verification lock. On the
Windows workstation, use the canonical `LOCALAPPDATA` and the installed Edge
executable to test the actual GPU renderer. Do not change browser security settings
or increase the shared smoke timeout to make a failure disappear.

```powershell
$env:LOCALAPPDATA = 'C:\Users\Yanik\AppData\Local'
$env:SMOKE_CHROMIUM = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$env:SMOKE_DIST_ROOT = 'dist'
$env:SMOKE_ARTIFACTS = 'output/ballsy-camera-finish'
node scripts/with-verify-lock.mjs -- node scripts/smoke-ballsy-camera-finish.mjs
```

## What the smoke proves

- Separate camera probes put the racers at identical native course samples: close
  to the start, in the banked turn, on the raised shortcut bridge, and on opposite
  sides of the course. They cover 1280×720, 1920×1080, 960×540 and 390×844.
- `api.update` sets those isolated poses; `advanceTime(0)` repaints them without
  advancing physics, time, gates or standings. The report verifies standings did
  not change. These probes are not evidence of completing the course.
- The whole balls must remain within the image and clear of opaque scene geometry
  and HUD panels. Close landscape views require a projected ball diameter at least
  3.5% of viewport height. Screenshots retain the complete product UI.
- The independent finish journeys use only standard Gamepad API axes/brake and
  the native physics step. The look-ahead pilot follows the policy already used by
  `smoke-ballsy-loop.mjs`; it never writes body transforms or awards a gate.
- One racer finishes first, receives its own sparkle and persistent arrival badge,
  and the other keeps racing. Pause freezes both physics and the sparkle clock.
  Both complete two laps with no recovery or teleport; results, animation expiry,
  keyboard control, gamepad pause and a clean rematch are checked.
- A second complete race uses the same main route for both racers. The leading
  controller eases off through actual input on the final approach, producing an
  explicitly coordinated close finish. It does not alter game speed limits or
  standings. Both arrivals must occur within two seconds and show both sparkles.

The report records browser version, build HTML SHA-256, GPU renderer, projected
diameters, occlusion measurements, renderer draw calls/triangles and real frame
intervals. The 120-frame timing sample holds a native manual pose while the full
product renderer runs; it is a rendering measurement, not physics throughput or a
physical-headset performance claim. Inspect the produced PNGs before accepting a
visual change. A passing geometry assertion is not an artistic-quality verdict.

## Optional before/after comparison

The regular smoke does not require an old build. For a deliberate comparison,
serve a known baseline by setting `SMOKE_DIST_ROOT` to its directory and use
`--baseline` with a separate `SMOKE_ARTIFACTS` directory. That records the same
camera probes without imposing the new camera's size requirements on old code.

Then run the current build with `SMOKE_CAMERA_BASELINE` pointing to the explicit
baseline `camera-finish-report.json`. The comparison verifies identical native
positions and requires at least 50% larger balls in close landscape views. It
records the actual ratios for all views. `--camera-only` and `--finish-only` split
investigation work; neither alone is a full pass.

## Public entrypoints and contact visuals

`scripts/smoke-ballsy-entrypoints.mjs` walks the actual front door: Games, the
permanent Ballsy row, race launch, return, Ateliers, the VR workshop, desktop
preview/reset and return. It checks the real navigated URLs and rejects console
or page errors. Its default is an ephemeral local server over `SMOKE_DIST_ROOT`
(or `dist`). An explicit `SMOKE_BASE` instead checks that exact deployed origin
without creating a local server. It does not create a multiplayer room.

`scripts/smoke-ballsy-contact-visual.mjs` is a local-only supplement to the unchanged
slime smoke. It uses a real pointer throw and the real relay, then verifies a
host-authoritative physical hit. Screenshots show the full host/giant UI before
impact, at onset, and 100/600 ms later. Resting racers must be within two centimetres
of the actual road mesh; native ball shadow flags and allocated host/giant sun
shadow maps are checked. Reports retain contact gaps, draw calls, triangles,
lighting and shadow-map diagnostics. Pixel inspection remains necessary to reject
shadow acne or poor lighting even when those structural checks pass.

Both use `SMOKE_ARTIFACTS` for retained receipts/captures and must run under the
same canonical machine lock as the camera smoke. A local build must contain its
public assets, not just JavaScript and HTML, for valid front-door acceptance.

## Additional camera and control criteria

A fifth current-build camera probe covers vertically separated racers. It is not
part of the unchanged four-pose baseline comparison. Each finisher must decelerate
below 0.25 m/s within 1.5 seconds and stay within four metres of its arrival pose.
Arrival labels must not cover the HUD, including the final announcement, at
desktop and responsive result sizes.

Separate physical input probes accelerate both racers, then hold keyboard
Space/Shift or gamepad button 0. Both must stop within 1.5 seconds, stay stopped
for another two seconds without reversing or drifting half a metre, and move
again after releasing the brake. These probes do not replace the race journey.

## Companion regressions and limits

Run the existing setup, practice, shovel, slime and shared-VR smokes unchanged,
plus the loop, VR lab, Cyber Race and showroom on the main product build. The loop's
assertions remain unchanged. Its overtaking preparation now holds Corail's real
brake for 0.75 seconds before releasing the same geometric pilot: the corrected
native brake no longer produces the old spontaneous leader swap. The report states
this unequal start explicitly and captures the actual progress-based overtake.
No positions, velocities, forces, speed limits, standings or gates are injected.
The installed develop-web-game action
client is run through `scripts/smoke-ballsy-slime-client.mjs`, which imports the
original client unchanged and only resolves the repository's Playwright package.
That original client chooses its own Chromium/SwiftShader launch and is not the
Edge GPU timing probe.

Synthetic input and WebXR fixtures do not establish physical controller mapping,
Quest tracking, stereo comfort, real throwing feel, or headset frame rate. The
shared fixture's isolated hand/controller close-ups are explicitly labelled in
its report; normal gameplay screenshots must not hide product elements.

## Acceptance record

The unchanged shared-VR prototype baseline was captured on 2026-11-07. All sixteen
PNG files were inspected. At 1280×720 the projected racers measure 13.78–13.79 px
near the start and 10.59–10.73 px in the banked turn; at 390×844 they measure only
4.3–4.7 px and the distant island is heavily obscured by blue fog. The 960×540 route
advice overlaps the invite button. These are baseline observations, not new-code
regressions or accepted limits for the new camera.

The baseline's Edge renderer identifies the NVIDIA GeForce RTX 5070 Ti using D3D11.
The 120-frame held-pose samples measured approximately 75 FPS and 13.4 ms p95 in
1280×720 and 1920×1080, with 68 draw calls and 43,888 triangles. Timing is locally
display-limited and does not establish a performance gain or headset budget.
Receipts are under `output/permanent-ballsy-qa/baseline/` (ignored local evidence).

Build3 was tested from the complete isolated production output, including verified
public assets, on 2026-11-07. Close-start racers measure 34.60-34.66 px at 1280x720
(about 2.51 times the baseline), 51.90-51.99 px at 1920x1080 and 26.92-26.95 px at
390x844. The banked-turn improvement is about 3.1 times. All camera containment,
HUD and opaque-occlusion checks pass. Held-pose rendering remains display-limited
near 75 FPS / 13.4 ms p95, with 61 draw calls and 42,739 triangles in the measured
1280/1920 close-start views. This is not a proven performance gain or Quest budget.

The contact/impact journey passes with native road gaps around one millimetre,
allocated shadow maps, no visible giant shadow acne, a brief direct-hit burst and
a persistent slime coat. The host uses 66-69 draw calls / 43,508-44,788 triangles in
that journey; the giant uses 80-85 / 46,322-46,744. Full product screenshots were
inspected at rest and 100/600 ms after the real pointer impact.

Build3's public entrypoints pass 12 checks with loaded thumbnails and no browser
errors. Historical setup, practice, desktop shovel, slime (28 checks), shared VR
(50 checks), VR lab, Cyber Race and showroom pass. The loop passes all original
assertions with the explicit input-only preparation: a real overtake at frame
2504, contact separation 1.276 m, maximum separation 21.772 m, and two laps without
recovery or teleport. The installed original develop-web-game client passes;
its latest shot and text state were inspected. Evidence is retained in
`output/permanent-ballsy-qa/build3-*` and `final-contact` / `final-entrypoints`.

The final canonical `dist/` built from commit `662c104` passes the complete
camera/finish smoke: 254 checks in 64.0 seconds. The close-arrival gap is 0.531
seconds; both badges are disjoint, on screen and connected to their own balls at
1280x720, 960x540 and 390x844. The actual captures were inspected. Individual stops,
held keyboard/gamepad brakes, pause/resume, sparkle expiry and rematch all pass.
Canonical entrypoints pass 12 checks in 9.4 seconds, and the product shared-VR
wrapper passes 50 checks in 24.6 seconds against that exact `dist/`. All three
reports contain zero browser errors. Their receipts and full-UI captures are in
`output/permanent-ballsy-qa/canonical-camera-finish`, `canonical-entrypoints` and
`canonical-shared-vr`. The unchanged scopes retain the separate build3 regression
receipts described above. No assertion or timeout was weakened.

Physical headset and human controller acceptance remain separate tasks, not
claimed by these browser and synthetic-XR runs.

## Final complete manifest reception, 2026-11-07

The canonical production `dist/` built from
`48dec7d6f312ab9c73182d205cb7313a2644fd95` was tested from 18:14:34 to
18:41:49 UTC: **116/118 scenarios passed, with 106/108 visual journeys and
10/10 manifest Node contracts passing**. Every entry ran once; none was omitted,
and there were zero retries. The six formerly blocked priority scenarios
(standalone, levels, joints, full IWER shovel, Face embed and Top20) passed before
the remaining manifest entries. All assertions and timeouts stayed unchanged
during this reception. Live-browser completed all 131 checks in 367.7 seconds.

This was an independent complete manifest diagnostic, **not a green official
Windows gate**. The preceding official run on the same revision reported 1237
unit tests: 1232 passed, four existing directory-fsync/checkpoint failures and one
skip. Typecheck, global lint and the canonical build passed; the official gate
therefore skipped its browser phase. Its log is
`output/permanent-ballsy-build/full-gate-48dec7d.log`. Separately, the verified
Linux CI run `42400131610` for this exact revision is green: 1239/1239 tests and
all 16 verification checks passed. Neither result changes the observed Windows failures.

The two retained visual failures are:

- `island`, `scripts/smoke-island.mjs:153`: after native fullscreen exit,
  `aria-pressed` is still `true` where the assertion requires `false`.
- `island-workspace`, `scripts/smoke-island-workspace.mjs:52`: the retained zoom
  button is disconnected during the live population update, violating the
  map-control continuity assertion.

Both reproduce with the identical original scenario files on the separately
built exact-main baseline `6d478d3eb64e26f1352fc9339762f3a1179000c3`. The A/B receipt
is `GraphysX-Web-ab-main-6d478d3/output/ab-main6d478d3/README.md` in the sibling
worktree; its evidence hashes and script equality are recorded in the final
receipt's `baseline-reference.json`. They remain failures, not waived checks.
Their later assertions were not reached. The A/B proves pre-existence, not a
complete root-cause diagnosis.

The machine-wide verification lock covered the whole reception, with pinned
`LOCALAPPDATA`, explicit Edge and a fresh ephemeral server per scenario using
the normal Kidx route and cleanup. All Ballsy frontends used the complete
canonical `dist/`, not a prototype build. The Island scripts retained their
normal isolated auxiliary world-service builds. IWER 2.8.0 archive integrity
and bundle hash were reverified; the complete shovel scenario uses its public
host-input synthetic tracked poses, without weakening the product tracking
guard or reducing the journey to desktop-only.

All 1240 build files had identical before/after SHA-256 inventories; HEAD and
tracked sources stayed unchanged. The diagnostic exited 1 for the two retained
failures, and the machine lock was absent after completion. Evidence lives in
`output/final-regression-48dec7d/`: `REPORT.md`, `results.json`, original logs,
build inventories, `iwer-integrity.json` and 351 PNGs indexed with SHA-256 in
`captures.json`.

Actual final-build images were opened and inspected for the stereo shovel and
desktop cut, shared controller/hand fixtures, VR workshop/mobile fallback,
phone arrival/results, 100/600 ms slime impact, Face functions, Top20 play,
showroom/editor, Cyber Race, EV3/KidX, shader labs and live-session desktop/phone
states. `visual-review.md` names the exact inspected files and limitations;
351 retained images does not mean 351 manual reviews. The Island captures
precede their failing assertions. The results-browser harness appends its panel
over the welcome card, so that capture is not a clean leaderboard-layout receipt.

This record does not claim production delivery, a physical Quest session,
controller calibration, comfort or headset performance.
