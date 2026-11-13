# NACRE: Quest 3 showcase and rendering vocabulary

Entry: `?app=quest3`, available from **Créations** and **Archives & labo**.
This is an original orbital observatory composed as an ordinary
`graphysx.agent-world/v2` document by `src/quest3-scene.ts`. It uses the existing
PlatformHost, World API, material slots, persistence and single frame loop.

## Delivered capabilities

1. **XR budget and diagnostics.** Opt-in `PlatformVr` profiles select framebuffer
   scale before session binding and fixed foveation afterward. Supported refresh
   rates are negotiated at runtime. Balanced requests up to 90 Hz; economy up to
   72 Hz. A request is not evidence that the application sustains that rate.
   Existing VR consumers retain their behavior when no profile is specified.
   `gx.observe().diagnostics` reports the last 240 observed frame intervals,
   p50/p95/p99, CPU submission time and main-render draw/triangle/resource counts.
   Desktop and immersive samples are separated; long intervals remain included.
   GPU time, compositor drops and memory bytes are **not measured**. Software
   Chromium results must never be described as Quest 3 performance.
2. **Native glTF 2.0 / GLB.** `asset.format: "gltf"` preserves native PBR maps,
   geometry, hierarchy and skin/morph data. General animation playback is outside
   this change. KTX2/Basis and meshopt use Three's own loaders. The Basis transcoder
   and Touch Plus controller profiles are bundled locally; no runtime CDN is used
   by NACRE. The existing media-library foreign-format conversion is retained;
   native models are authored using their stable asset URLs.
3. **Baked lightmaps.** `asset.lightmap: {url, intensity?}` uses the model's second
   UV set (`TEXCOORD_1` / Three `uv1`). Every participating mesh must have that UV
   set and PBR materials; missing UVs cause an explicit asset error. NACRE uses a
   reproducible CPU bake of direct colored lights, AABB shadows and sampled ambient
   occlusion, compressed into a 512² KTX2 atlas. This is not a global illumination
   bake or a probe-volume implementation. Its static lighting remains static when
   the reactor's emissive surfaces are switched into standby.
4. **Instance batches and LOD.** A native model can contain 1–2048 local instance
   transforms and up to three lower-detail models at strictly increasing distances.
   Three's real InstancedMesh and LOD are used, with 12% LOD hysteresis. NACRE
   instances the ribs, equipment, inlays and 420 stars. The equipment switches to
   a simpler GLB at 14 m. Batch bounds are computed for frustum culling. LOD chooses
   a level for the whole entity, not each instance: use spatial chunks for large
   worlds. Picking, material editing and transforms operate on the batch as one
   entity. Animated, skinned, morphed or nested instance batches are refused.

```js
gx.spawn({
  id: "equipment-row", type: "model",
  asset: {
    format: "gltf", url: "/assets/quest3/equipment.glb", fitSize: .8,
    instances: [{position: [0, 1, 0]}, {position: [2, 1, 0]}],
    lods: [{url: "/assets/quest3/equipment-low.glb", distance: 14}]
  }
});
gx.observe().diagnostics;
```

The shared browser/server validator checks the same presentation shape and limits.
Presentation data survives export/create/save/load and appears in observations.
Removing an entity or replacing the whole world invalidates pending model roots.
Late decodes release their resources instead of attaching to detached scene objects.
Native glTF models use separate ordinary primitive physics proxies; assigning a
rigid body to a native visual model is refused. Existing recovered mesh colliders
are unchanged. Lights embedded in a GLB remain part of its source scene and should
be authored sparingly for mobile XR.

## Scene and controls

Desktop supports orbit inspection and three arrival/reactor/observation views.
In VR, headset motion stays native and the player starts at meter scale on the deck.
The in-world console provides reactor standby, an explicit jump to the observation
deck and exit. There is no automatic camera flight. The system's own exit remains
available. Touch Plus uses the pinned native controller models; the Quest 2-specific
cosmetic grip avatar is not fitted to this different controller. Optical hand models
continue to use actual WebXR joints.

The desktop diagnostic is hidden by default. The in-world panel shows observed
frame pacing. Scene saving uses the existing named browser-local library; it is
not a cross-device or server save. UI profile changes apply to the next XR entry.

## Build and verification

```
node scripts/build-quest3-assets.mjs
node scripts/vendor-xr-models.mjs
node --test test/quest3-rendering.test.mjs test/vr-assets.test.mjs
npm run verify -- --wait --checks=quest3,vr-lab,model-recentre,roundtrip,scene-command-validation
npm run verify -- --wait
```

Asset generation uses only the local CPU. Its optional offline Basis encoder is
downloaded from pinned `BinomialLLC/basis_universal v2_50` into ignored
`output/quest3/tools`; it is not shipped. The generated build manifest records its
hashes, the light sources and bake parameters. Original artwork, decoder notices,
all LOD assets and textures are covered by the production asset manifest.

The `quest3` smoke tests the built WebGL app with real GLB decoding and KTX2
transcoding, compressed lightmaps, instance counts, actual LOD selection,
material override/undo, portable reload, local save, mobile layout and synthetic
XR entry/profile/exit. It captures views under the machine-wide verify lock.
Evidence is under `output/verify/` or the explicitly selected smoke artifact folder.

## Physical acceptance remains required

Open the deployed or otherwise already trusted **HTTPS** origin in Quest Browser.
A Quest visiting a workstation's plain LAN HTTP address cannot enter immersive VR.
No new LAN listener, relay, public tunnel or security bypass is introduced here.

On the real Quest 3, check both-eye appearance, floor/scale, Touch Plus button and
hand tracking, panel readability, viewpoint jumps, interruption/exit/re-entry and
audio behavior. Record actual supported/active refresh rate and pacing after the
scene has warmed, then repeat during a sustained session. Compare quality,
balanced and economy on the same scene. The headset's real performance, thermals,
comfort and tracking are not established by desktop or synthetic XR tests.
