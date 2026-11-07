# Ballsy: volcanic racing diorama

Local visual work, 2026-11-07, based on `f00c01c`. No publication or physical Quest acceptance is implied.

## Direction and implementation

- Graphite asphalt with tiny portable native diffuse/normal textures (16 × 16 RGBA, six repeats), coral/ivory kerbs and pale turquoise reflectors. Kerbs follow the original banked samples.
- Faceted stacked basalt, moss caps, two-tone folded foliage, pitched village roofs and a sculpted volcano with emissive lava veins. Scenery stays below racing sightlines and has no new collider.
- Solid lacquered balls keep their original dimensions and rolling identity bands. Native studio illumination is reduced to 0.3 so it does not wash out shape and contact. One warm directional sun and one ambient fill remain the entire authored light rig. No bloom, post stack, point light or additional shadow map.
- The same fixed slime pool still contains six projectiles, twelve splats and two coats. Projectiles have a latex/knot silhouette and bounded volume-preserving stretch; splats have actual relief and six small splash beads. Host impact age drives a short squash/settle. Direct ball hits use a compact 0.45-second burst, while the parented coat retains the two-second slowdown indication. Road puddles keep their full original radius/lifetime. Projection never changes collision, velocity, slowdown or authoritative state.
- The giant's miniature sun now targets its transformed board rather than the room origin. Its existing shadow camera and normal bias are scaled to the 0.045 miniature. The target inherits translation/yaw, and projection updates happen only at setup or resize, not in a new frame loop. The giant uses PCFSoftShadowMap like the PC and a 0.8 native ambient fill, compensating partly for its lack of studio IBL without adding lights. PC and giant are not claimed to have identical image-based lighting.

## Hard limits

`test/ballsy-art.test.mjs` fixes the SHA-256 signatures of all nine physical entities from the original composition. Mesh positions/indices, primitive dimensions, spawns, transforms, Rapier properties and steering are byte-for-byte unchanged. UV/material additions are deliberately excluded from those physical signatures.

Native document budgets after the second pass:

| Scope | Entities | Inline vertices | Inline triangles |
| --- | ---: | ---: | ---: |
| Dressed course | 76 | 25,663 | 37,854 |
| Course plus every slime object | 96 | 28,519 | 42,846 |
| Above with maximum legal lava mesh | 96 | 32,612 | 51,037 |

The maximum includes a full 4,096-vertex / 8,192-triangle replacement for the initial empty lava mesh. This remains below the platform's 32,768 / 65,536 aggregate limits. The separate arrival effect uses primitives, not inline mesh buffers. Primitive triangles and actually submitted draw calls are measured by browser QA rather than counted as inline geometry.

The two authored 16 × 16 textures are portable and request no external images. The runtime may clone them per road material. The slime effect creates no new objects, colliders, textures or document snapshots per frame.

## Validation and inspected evidence

- TypeScript and scoped ESLint pass. Twenty-seven focused art, lighting, course, slime and lava tests pass on the final source, including the brief direct-hit burst and adversarial lava reserve.
- Tests cover unchanged physics, full native scene/mesh validation, worst-case live lava reserve, UV/material contracts, fixed slime object reuse and state immutability, transformed miniature sun direction, scale/recenter and stable shadow configuration.
- Baseline images inspected: `output/ballsy-shared-vr` in the retained `GraphysX-Web-ballsy-vr` worktree, plus QA baseline in `output/permanent-ballsy-qa/baseline`.
- First integrated render inspected at departure, banked turn, bridge and opposite sides in `output/permanent-ballsy-qa/camera-first`. This inspection caught overly large asphalt texels and washed-out studio illumination. Both were corrected before the second pass.
- Second-pass departure, banked turn, bridge, opposite-side, mobile and two-lap result captures in `output/permanent-ballsy-qa/accepted-camera-finish` were inspected. Asphalt tiling is no longer distracting, contact shadows are distinct and volume/colour remain readable. Camera/arrival assertions belong to integrated QA, not this art report.
- Real settled-ball and pointer-to-relay slime captures in `output/permanent-ballsy-qa/accepted-contact` were inspected on both host and giant. The measured bottom-to-road gaps were -1.1 mm and -0.9 mm, with caster/receiver flags true and a 2048-square shadow map. Slime impact geometry and the remaining player identity are visible at onset, 100 ms and 600 ms.
- The first miniature shadow render was rejected after inspection: BasicShadowMap plus insufficient depth bias exposed broad self-shadow bands. The third build switches that existing map to filtered PCFSoft, restores a stronger depth bias and raises only the existing giant ambient light. Final images in `output/permanent-ballsy-qa/final-contact` were inspected directly: giant at rest and 600 ms, host at 100 and 600 ms. Self-shadow arcs are gone, contact/relief remain visible, and the compact direct-hit burst disappears while the coat remains. The real pointer-to-relay test passes with no console errors. Host draw calls are 66-69 with 43,508-44,788 submitted triangles; giant draw calls are 80-85 with 46,322-46,744 submitted triangles. These are desktop capture samples, not worst-case frame-rate claims.
- The third-build banked turn in `output/permanent-ballsy-qa/final-camera-finish/after-banked-turn-1280x720.png` was inspected directly; asphalt and ball contact remain readable. The final canonical game-client capture is still pending while the separate close-arrival badge layout is corrected. Art approval is not a claim that all integrated QA has passed.

## Remaining limits

- No physical headset comfort, controller feel or Quest frame-rate claim. Desktop synthetic XR does not establish these.
- This is a scene/material/lighting improvement, not a new physics model or improvement to suspension, collisions or racing dynamics.
- Fine asphalt is intentionally low-contrast to avoid distracting shimmer. The image-backed PC studio and bare giant renderer are not claimed to be photometrically identical.
