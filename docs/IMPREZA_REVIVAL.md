# Impreza: native parts and the two CarScene worlds

Open **Archives → Impreza · les mondes retrouvés**, or `/?app=impreza`.
The welcome offers Atmel and RacinX, model inspection, free driving with keyboard or
simultaneous touch, reset, pause and an editable Studio copy. Studio deliberately opens
a fresh copy at the settled departure, retaining the vehicle rig; a driven position is
not silently presented as an authored source spawn. Save/Export use the existing editor.

## Source custody

`scripts/vendor-impreza-worlds.mjs` reads the native GraphysX archive without writing to it.
Seventeen pinned inputs, exact hashes, source bounds, counts, original wheel offsets and
generation-specific placements are recorded in `public/assets/ports/impreza/manifest.json`.
Regenerate or check with:

```powershell
node scripts/vendor-impreza-worlds.mjs --archive=C:/Users/Yanik/codes/GraphysX --check
```

The source folder and its pre-existing edits remain in place. This recovery is not a
deletion clearance or an exhaustive certification of every C++/C#/VB project.

## Recovered

- `chassis.TVM`: 1,883 vertices / 2,436 triangles, exact body/glass/underbody face groups.
- `wheel_l.TVM`, `wheel_r.TVM`: 674 vertices / 690 triangles each, independent native origins.
- Original ChassisSTi, Windows, Undercarriage and Wheel BMP bytes and TVM UVs/normals.
- Atmel `CarScene.cpp`: the all-black 1024² CarHeightmap, 512m field, player and three witnesses.
- Later RacinX `CarScene.cpp`: the complete 512² RecTrack5 DXT1 red height channel,
  Winter sky binding and 100 copies of the native `ring.tvm` at `[10*i,-397,10*i]`.
- The later branch comments out opponents. It is not merged into an invented historical race.

TVM parsing follows counted MSTA/MVER/MI16/MATT/MGRO/MGR3/4 chunks through MEND,
validates bounds and material groups, and hashes any trailing bytes. It does not scan raw
bytes for guessed markers. Native `[x,y,z]` becomes `[x,y,-z]`; winding follows authored
normals. Model payloads omit generic fitting bounds so the loader retains their metre
scale and pivot instead of independently recentring the chassis and each wheel.

## Explicit adapters and remaining limits

Every scene root is translated +400Y, preserving relative source placement. The normal
start sits on the ground; “Rejouer la chute du C++” uses the original +100.2m or +50.2m
chassis drop. That high-energy impact can roll the car; reset returns it upright at the
settled departure. Atmel opponent 0 is separated six metres left to avoid its native overlap
with the player. Witnesses have no invented AI or networking. Most RacinX rings lie
beyond the 512m terrain; there is no recovered completed checkpoint/lap binding.

Rapier raycast vehicles run inside the existing shared fixed physics substep. Source
mass 1500, rear drive 3000, front steering limit 45°, 10° per source-frame and rear brake
2000 inform the adapter. Force units, suspension tuning, traction, speed limit, hull mass
properties and the chase camera are modern choices.
Digital controls reduce the steering limit with speed (`45° / (1 + .035 * speed²)`),
retaining the source maximum at rest while avoiding instant full-lock at rally speed.
The rough RacinX field can stop the original low bumper on abrupt relief; it is an
archived exploratory terrain, not a newly graded modern driving course. The SDK declaration
for the source tire arguments `.5,.372` is unavailable; `.372` is the applied radius, close to the
native visual radius .362, without claiming verified SDK argument semantics. The source
centre-of-mass call `[0,-1,10]` is retained as evidence, not applied outside the chassis.
Wheel spin is a rolling phase derived from chassis speed; it is not a recovered drivetrain.
The source wheel mass 25 is recorded in the manifest; raycast wheels have no separate
rigid-body mass in the web adapter.

The native texture call misorders its string arguments. Materials bind to their intended
body/glass/underbody slots, with modern PBR, lighting and corrected web texture orientation.
Terrain extents interpret `fWidth*256`; the RacinX renderer/collider resamples the retained
512² field to 128 segments per side. Closed TV3D terrain/tire/render parity is unproven.

RacinX's shared water class places water at native y=85, 485m above the terrain. Its water
entity retains that height, stays hidden and remains editable in Studio. Its old offscreen
water shader is not claimed as recovered. Engine sound and native networking are absent.
Orphan Jeep/FreeCar/Primera assets, modern oval/hillclimb courses and the separate selector
prototype are not certified historical vehicle choices or source worlds in this release.

## Shared vehicle vocabulary and validation

`steering.vehicle` describes chassis-local suspension attachments and wheel entity ids,
radius, spring/damper/traction tuning, drive/brake force, steering rate/limit and speed cap.
`steerLive(id,{thrust,turn,brake})` is transient. Wheels are ordinary non-physics root
entities projected from the current chassis and suspension, including paused teleports.
Absolute heading writes are rejected for vehicle rigs: heading follows the actual body.
Host transient namespaces cannot be referenced by authored wheel attachments.

Controllers follow body lifetime. Solver snapshots include their configuration, held
controls, steering and wheel phases; backend tests verify exact continuation after a
mid-turn restore and kinematic host suspension. Exported documents never retain held keys.
The application uses the shared host frame subscription and camera helpers, with no extra
renderer, physics world or animation loop. The `impreza-driver` tag leaves the generic
BallZ play HUD/camera out of this application.

Focused checks: `test/impreza-source.test.mjs`, `test/impreza-worlds.test.mjs`,
`test/vehicle-physics.test.mjs`, `test/live-steering.test.mjs`, and
`scripts/smoke-impreza.mjs`. The browser journey checks the real native hull/length,
wheel alignment, input-driven movement/turn/brake, both worlds, source drop, blur/reset,
Studio/save/export/reload, changed-world preservation, 390/320px simultaneous touch and
44px controls. Shared runtime changes require `npm run verify -- --wait` before release.
CI Node/build results, local WebGL proof and public deployed UI acceptance are separate.
