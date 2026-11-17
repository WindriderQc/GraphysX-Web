# CubZ: complete source actors and a coupled menu

Open `?app=cubx`, or **Archives → CubZ · le menu retrouvé**. Choose one of eight
blocks, watch its rotation and opening, use the four replacement actions, close it,
and return along the same rotation. The first choice opens directly. The waiting
animation is an explicit action. **Emporter cette pose dans le Studio** freezes a
copy at the current visible pose, ready for ordinary editing, local save and JSON export.

The old primitive-box/hinge study remains under **Laboratoire → CubZ · étude des
pistes TVA**. It is useful evidence, not a second copy of the restored menu.

## Source custody

The native archive is read-only input. Nothing here authorizes deleting it. The enhanced
host is `GraphysX/Yanik C++ BCKUP/CubZ (2).cpp`, SHA-256
`1337ae604176b7b31e664f74b9eb02f926dc1da9f018e9a6d6bc618288ca28f6`.
The shorter `CubZ.cpp` copies do not contain this complete menu controller.

Actors are from `Yanik C++ BCKUP/Media/PartSys/Animations/`:

| File | Nodes | Meshes | Vertices | Triangles | SHA-256 |
| --- | ---: | ---: | ---: | ---: | --- |
| `CubeRot.tva` | 70 | 44 | 2968 | 3136 | `8adba22a2103a6edac9b173474b1a4599db04b21c7df4418412ea35903ae7b4b` |
| `CubeOpen.tva` | 69 | 44 | 2968 | 3136 | `ccb1ed3bb77919509e2b501663fb34bfd7e64c34e95f01e003e6d553160ca27b` |
| `CubXScreensaver.tva` | 69 | 44 | 2968 | 3136 | `2aecb7774e672b125cab7c0a175b1e3bc01d69fb4914cb4e2ee8f074e83de18f` |

`scripts/cubz-source.mjs` decodes counted ASTA, MHI2, MAMD, MANS and MANI chunks with
bounds/count/index/finite-number checks. `scripts/vendor-cubz-menu.mjs` pins these hashes
and emits `public/assets/ports/archive-cubz-menu.json`. Reproduce from a local archive:

```powershell
node scripts/vendor-cubz-menu.mjs --archive=C:/Users/Yanik/codes/GraphysX --check
```

The manifest claims that JSON for deployment. The application fetches it lazily; visiting
the welcome/DNA experience does not parse the six-megabyte actor payload.

## What is restored and what is adapted

MAMD positions, normals, UVs and triangles are recovered, not replacement boxes. MHI2
parents and local matrices retain the actual pivots. A read-only source audit verified
`parentWorld × localMatrix` against every stored world matrix to within `7.63e-6` native
units. Local geometry is not transformed twice. The Web boundary reflects Z once on
vertices/normals and conjugates matrices. MANI keys are **passive rotations**: conjugate
them before reflecting Z, producing Web quaternions `[x,y,-z,w]`. Applying reflection
directly to the stored key in the first release inverted cylinder and panel axes.
Across all 136 first rotation keys, conjugation agrees with the independent MHI2 bind
matrices within `1.4e-5` degrees; using the stored rotation directly differs by up to
180 degrees. The pinned raw payload is unchanged.
Triangle winding follows the exported normal orientation after reflection.

All changing position, rotation and scale keys inside a chosen range survive. Only exactly
constant channels compact; endpoints are sampled when clipping. Vectors interpolate
linearly, normalized quaternions use slerp. The recovered engine was not run for a native
pixel comparison, so continuous interpolation and historical appearance are not certified.

The C++ supplies eight choices, seven selection ranges, the actor-swap sequence and four
buttons per internal menu. Selection ranges are 28 frames at 30 fps; opening is 50 frames
at 30 fps; the waiting actor is 750 frames at 30 fps. A Web loop of the waiting actor is
an explicit presentation choice. The return reverses the **same selected range**: the
native `selected + 1` reverse bug could request nonexistent range 8. Direct choice zero
also returns to usable idle controls. Source stop-frame thresholds are not simulated.

Materials, lights, camera, touch controls, picking of visible mesh surfaces and display
placement are current adapters. Root scale `0.04` displays native `fSize = 8` at 1/200 units.
Color coding is an optional inspection action, not a recovered native material scheme.

The host references `Media/CubXBtn/Btn1.tvm` through `Btn32.tvm` and `BtnExit.tvm`.
They were absent from the unpacked Media tree and from listings of both `CubXScene.rar`
and `AtmelCubx63_2003.rar` inspected in this pass. Historical internal labels, categories
and destinations are not established. The four plates and actions (select actor, color,
reframe, Studio) are explicit modern replacements. The original oversized outer hit
boxes are source evidence; Web picking uses the actual visible mesh surfaces.

The distinct **CubXActor** Get2..8 / Rot1..7 / Open family stays separate. Its exports
and the eight outer CubXActor button meshes inside `CubXScene.rar` are not evidence that
the missing 32 CubZ internal buttons have been recovered. Its later host has its own
uninitialized eighth slot and cannot safely be merged into this choreography by name.

## One authored timeline, then an editable copy

Each actor is ordinary v2 groups and inline meshes. Reusable `keyframes` behaviors carry
positions, rotations, scales and discrete visibility; no second renderer or animation loop
owns the scene. Visibility holds the latest key, including at its exact timestamp. Channels
are bounded to 1024 keys so the waiting actor's 751 keys need no resampling. Browser and
storage validators share the same fields and limits. The public clock retains full
simulation precision so a rounded timestamp cannot pause before a visibility boundary.

Open/return commands install a whole authored sequence in one transaction. A large step,
paused playback, undo and document reload therefore use the shared runtime rather than
relying on future host callbacks to switch actors. Saving this animated document retains
its timeline and configured `startSeconds`, not a running cursor; reloading restarts the
world clock. The Studio action deliberately samples the current local TRS/visibility into
a static copy instead. All actors and user children remain in that copy, including hidden
ones. Only the menu's exact owned playback IDs are removed; foreign behaviors survive.
Menu and Studio picking both ignore meshes with any hidden ancestor.
The opened action grid is brought into view on short screens. Studio's Home action
returns to the actual welcome; it does not replay the captured CubZ startup route.
If another document replaces the rig, helpers disable and Studio opens that document
unchanged. Foreign entities are never normalized or baked by the pose helper.

## Validation

The owner reported disconnected cylinders and inward petals after the first release.
Earlier receipts covered the UI, persistence and source decoding; they did not prove
mechanical coherence. `test/cubz-mechanics.test.mjs` now calibrates animation against
independent bind matrices, checks all endpoint-pair distances and the central pivot at
every integer frame of all seven rotations, and checks fixed cores/hinges and outward
movement of all three opening petals. The first two tests reproduce the published bug.
The browser smoke also measures actual renderer endpoints midway and at the end of
each rotation, fixed cores during opening, and captures the half-open flower.

The stored rotation ranges leave up to 3.60 native units (0.144 display units) of residue
at the front slot before the source actor swap. This source-export limitation remains
explicit; the tests do not pretend the original recordings end on exact cardinal poses.

`test/cubz-source.test.mjs` exercises counted binary fixtures, corruption rejection, pinned
payload counts and release-asset inclusion. The actual public API/Rapier contract in
`test/agent-world-bridge-live.test.mjs` covers all eight source cycles, reverse, waiting
loop, exact visibility/scale sampling, pause, stable authoring, storage validation and pose
copies with children under hidden actors.

`scripts/smoke-cubz-menu.mjs` uses real browser controls and rendered objects: eight
open/return cycles, canvas drag versus selection, occluding hidden actors, keyboard,
diagnostic colors, waiting animation, a partial-pose Studio handoff, normal save/export/
reload, and touch at 390px and 320px with reduced motion. It belongs to the full gate;
screenshots and receipts are produced under the selected smoke artifact directory.
Physical touch-device acceptance and native-engine visual parity remain separate.

Local release evidence, 2026-11-16: the complete shared-runtime gate passed 128 controls
at `4783555` (1312 Node passes, one conditional skip). The three GPU receptions were
explicitly not run. That runtime, motion validator/vocabulary and editor picking remain
unchanged in the final implementation. CubZ-only navigation/preservation improvements
then passed a fresh 1313 Node tests, one conditional skip, static/build/physics checks and
all six affected browser journeys at `7834c1e` (CubZ, revival, archive worlds, DNA, editor,
scene store). Three previously failing short-screen/Studio cases were reproduced against
the earlier build and passed against the final one.

The final CSS/test-only delta at `64c702b` passed lint, a fresh build, the complete CubZ
journey and the byte-identical standard game client. Captures were inspected. The partial
pose's maximum world-matrix difference was `1.574e-7`; the settled Studio hover contrast
was `11.91:1`. Two-finger input actually moved the shared camera without authoring a
scene change. Optional store handoff used an isolated loopback fixture, with no homelab
or production writes. Publication is tracked by PR146 and the main deployment workflow.

Mechanical correction qualification, 2026-11-16: product revision `01d93fb` passed
1,316 Node tests with one conditional skip, typecheck, lint, a fresh production build,
physics probes and all three affected browser journeys (CubZ, revival, editor): nine
controls in this focused gate. Actual renderer maximum endpoint-distance error was
`2.215e-6` display units, central-pivot drift was zero, and fixed-core drift during
opening was below `1.908e-6`. The partial-pose Studio copy differed by less than
`1.717e-6` in world matrices. Desktop, 390px/320px touch and the isolated local-store
handoff passed without browser/HTTP errors. The byte-identical standard game client
then completed two opening iterations against that static build without errors.
Mid-rotation, half-open flower, fully open, compact and Studio captures were inspected.
This qualifies the correction's affected paths; it is not a rerun of the old full gate
or physical-device/native-engine pixel acceptance. Publication evidence follows in PR147.
