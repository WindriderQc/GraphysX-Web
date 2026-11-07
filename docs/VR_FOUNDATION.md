# Shared VR foundation

Open `?app=vr-lab` from **Ateliers → Atelier VR** on the GraphysX welcome page.
This is an opt-in first consumer of the shared renderer, not a replacement for Cyber Race
or the separate Ballsy prototype. The ordinary desktop routes do not load the XR factories.

## What is implemented

- Explicit **Entrer en VR**, retry, cancel while starting, exit and re-entry. No automatic
  immersive request. Unsupported browsers retain a usable 3D preview.
- A stationary, meter-scale workshop with headset instructions and three 3D buttons.
  Trigger/pinch activates a button. Grip/pinch picks up a cube; releasing puts it down.
  The cube's color and transform are changed through the ordinary `host.api.update`.
- Official Three.js `XRHandModelFactory` with its network-free `spheres` profile. These
  are the joints actually supplied by WebXR, not a fabricated full hand mesh.
- Official `XRControllerModelFactory`, using a GraphysX-authored **generic** controller
  and same-origin input profile. Trigger, squeeze and available face-button presses animate.
  The profile assumes `xr-standard`; unknown mappings keep a generic grip and ray instead.
  This is not an exact Quest hardware replica. No fingers are claimed to be tracked around it.
- Immediate procedural grip/ray fallback while a model loads or if an asset fails.
- Source/pose loss, visibility interruption and session end cancel held actions.
  A canceled release is distinguishable from an intentional release. It never implies a throw.
- Optional `local-floor` and `hand-tracking`; neither is mandatory. A `local`-only runtime
  gets a documented 1.6 m eye-origin offset. There is no automatic locomotion or camera chase.

## Module boundaries

`src/xr/vr-session.ts` owns one session. It calls `requestSession` synchronously from
`enter()` before awaiting anything, guards repeated requests, retains failed-end ownership
for retry and ignores stale asynchronous callbacks. It is dependency-injected and tested
without a browser. Call `checkSupport()` explicitly after construction.

`src/xr/vr-input.ts` owns native ray/grip/hand spaces, factory models and action events.
Slot index is never used as handedness. A fresh factory surrogate per connection isolates
late asset callbacks from a replacement source, including Three r179's asynchronous
connect/disconnect model-loading edge case. Factory GLTF failures leave the fallback usable.

`src/xr/platform-vr.ts` adapts those pieces to `PlatformHost`. Construct one adapter on a
**scene-mode** host. A second adapter or an editor/play host is rejected; switching surfaces
while a session exists exits VR. Apps that need their own driving/editor behavior must define
and test that adapter policy first. Dispose the adapter before disposing the host.

The adapter supplies a separate tracked camera under a floor-position/yaw rig. Desktop
framing, pitch, chase and third-party camera subscribers cannot move the headset camera.
The audio listener follows the active camera. `PlatformHost` keeps its one existing
`setAnimationLoop`, simulation and normal frame subscribers. During immersion it skips:

- desktop camera advance/chase/orbit;
- EffectComposer/SMAA/bloom;
- planar reflection refresh;
- desktop 2D overlays and after-render inset callbacks;
- renderer resizing while the real XR framebuffer is active.

The desktop camera was never overwritten. On exit, the audio listener, controls, resizing,
postprocessing and insets resume. Hidden/blurred sessions cancel **input**, not world
simulation; an app needing pause must implement that rule itself. No secondary frame loop,
service, bridge, SDK renderer, multiplayer authority or scene schema is introduced.

### App action contract

`new PlatformVr(host, { position: [x, floorY, z], yaw, onAction })` produces:

- `action`: `select` or `grab`;
- `phase`: `start` or `end`;
- `source`: the actual `XRInputSource`, with `handedness` also copied for convenience;
- `anchor`: Three Object3D at the controller grip or thumb/index midpoint;
- `ray`: the native target-ray Object3D;
- `cancelled`: true for interrupted releases.

Read world coordinates using `anchor.getWorldPosition()` / `getWorldQuaternion()`.
Do not retain a held state when `cancelled` is true. Hands map native select (pinch) to
`grab`; controllers keep trigger select and grip squeeze separate. The first lab uses
pinch/grab on buttons as well, without requiring simultaneous hand and controller tracking.
A hand can retain valid finger joints while its target ray is unavailable. Consumers must
check `ray.visible` before ray actions. The lab allows near pinches in that state, refuses
remote/button hits, and cancels a distant hold when its ray disappears.

This is the seam for Ballsy's future paint/slime balloons. Ballsy owns the near-object
selection, tracked pose history, velocity validation, world/table-scale conversion,
projectile physics and temporary slowdown. Those game rules are deliberately absent here.
The lab's cube is placed, not thrown, collision-solved or manipulated with two hands.

## Assets and dependencies

There is no new package dependency. Source baseline uses Three `^0.179.1`; factories were
inspected in the installed r179 implementation. `scripts/build-xr-controller.mjs` regenerates
`public/assets/xr/profiles/` entirely from GraphysX-authored primitive geometry. The GLTF has
an embedded buffer and no texture/network references. The manifest includes these files,
and `test/vr-assets.test.mjs` validates profile nodes and packaging.

No model-CDN request is needed. Real tracked input is not sent to a remote service.
A custom consumer must not silently replace the local profile path with a remote model source.

### Meta IWSDK decision

The official project is https://github.com/meta/immersive-web-sdk and describes a Three alias
pointing to `super-three`. That is an integration difference to investigate, not an assumption
of drop-in compatibility.

IWSDK is not installed in this checkout. Its current peer-version/renderer constraints have
not been verified in this task, so compatibility is **not** claimed. A framework migration is
not justified by the input visualization requirement: native Three factories already fit the
existing renderer, canonical scene API and one-loop architecture. Evaluate IWSDK in a separate
compatibility spike only if its interaction/authoring features justify that integration cost.

Reference implementations inspected locally:
`three/examples/jsm/webxr/XRHandModelFactory.js`, `XRHandPrimitiveModel.js`,
`XRControllerModelFactory.js`, `libs/motion-controllers.module.js`, and
`three/src/renderers/webxr/WebXRManager.js`.

## Running and validation

Use the repository's Node version and installed dependencies. Run normal `npm run dev`, then
open the printed localhost URL with `?app=vr-lab`. Browser-local localhost can test desktop
fallback; a Quest visiting a computer's plain LAN HTTP address cannot use immersive WebXR.
Use an already trusted HTTPS origin or an authorized headset-local development route.
Never disable security warnings or certificate checks to make XR work.

Focused checks:

```
node --test test/vr-session.test.mjs test/vr-input.test.mjs test/vr-assets.test.mjs
npm run typecheck
npm run lint
npm run verify -- --wait --checks=vr-lab
```

The `vr-lab` browser smoke loads the built app, verifies desktop/mobile UI and same-origin
models, and substitutes **only** the headset binding and native input poses. It exercises
entry rejection/retry, optional floor fallback, hands/controllers, button animation,
source/pose/visibility interruption, desktop camera preservation and post/inset restoration.
It is not a headset emulator or proof of real stereoscopic rendering.

Heavy captures/builds/smokes must use the existing machine-global verify lock. On a tool host
that redirects `LOCALAPPDATA`, ensure all cooperating processes resolve the same real lock
path. Use an existing installed browser through `SMOKE_CHROMIUM` if its cache discovery is
redirected; do not install another browser or change machine settings unnecessarily.

## Physical-headset acceptance still required

1. Open a trusted HTTPS page in Quest Browser or a working PC OpenXR browser.
2. Confirm the scene floor/scale and a comfortable stationary spawn, with an unobstructed area.
3. Enter using the visible button; inspect both-eye stereo, frame pacing and text readability.
4. Try each controller independently, reversed connection order, and trigger/grip/button travel.
5. Put controllers down and enable hand tracking. Inspect all supplied joints and pinch/release.
6. Lose a hand/controller behind the head, remove a source, open the system menu, and return.
   The cube must release safely and never re-grab until a fresh gesture.
7. Use the in-world exit and the headset's exit separately, then re-enter. Desktop framing,
   preview controls and other applications must remain usable.
8. Verify local-floor and seated/local fallback comfort on actual runtimes. A simulated 1.6 m
   origin is not proof of real device ergonomics.

No physical headset, hand-tracking permission prompt, optical tracking, mixed-input behavior,
comfort, real audio or performance acceptance was performed by the automated checks.
