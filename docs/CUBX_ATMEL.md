# CubX / Atmel: the recovered welcome composition

Open **Archives → CubZ → Explorer aussi l’accueil Atmel**, or
`?app=cubx&view=atmel`. The existing CubZ menu remains the default; this is the distinct
later CubXActor family, not a replacement or another renderer.

Choose any of eight cubes, watch the native rotation and opening, close it and return.
The first cube already occupies the opening corner. Waiting rotates the whole connected
machine. Selecting during waiting first aligns from the actual current pose.
Three views expose the menu, complete welcome and original Atmel panel. The panel edits
four source-font time displays, with undo/redo through ordinary world commands. Its two
indicators are local previews. **Emporter cette scène dans le Studio** freezes the visible
pose, keeping hidden source actors and user edits for normal save, reopen and JSON export.

## Source custody and reproducibility

The original `GraphysX` directory is read-only input and remains necessary. This recovery
does not authorize deleting it. `src/content/cubx-atmel-sources.json` pins 54 files by
path, size and SHA-256 at archive revision `f4cf357bc98cfad689d7a40a07fdd2dd0dc15d25`.
Those are file pins, not a count of restored scenes.
The C++ closed-mesh path names the absent `Media/CubX/` location; the actual retained
`CubXActor/CubXMesh.tvm` is resolved explicitly from its matching actor family.

```powershell
node scripts/vendor-cubx-atmel.mjs
node scripts/build-asset-catalog.mjs
node scripts/vendor-cubx-atmel.mjs --check
```

The generator verifies all input pins before writing only into this product. `--check`
rebuilds expected values in memory and checks committed outputs without writing them.
Use `--archive=C:/path/to/GraphysX` when the archive is elsewhere. No old executable,
serial port, device, private host or native engine is opened.

| Evidence | Recovery |
| --- | --- |
| `Yanik C++ BCKUP/Media/CubXActor/CubXMesh.tvm` | Closed mesh: 2,264 vertices / 2,750 triangles, with its own native origin |
| `CubXBtn1.tvm` … `CubXBtn8.tvm` | Eight original 24-vertex selection volumes; hidden geometry is picked explicitly only while this closed rig is active |
| `CubXGet2.tva` … `CubXGet8.tva` | Seven independent complete actors, 29 nodes / 23 meshes each, native 0–100 frames at 30 fps |
| `CubXOpen.tva` | Complete opening actor, 28 nodes / 23 meshes, all changing keys and terminal hold retained |
| `CubXRot1..7.tva`, `CubeOpensolo.tva` | Eight additional studies preserved in the source bundle; not presented as completed interactive scenes |
| `AtmelCubx/AtmelCubx/CubX.cpp`, `CubXScene.cpp` and companion classes | Controller evidence, placements, size semantics, texture overrides, source glyph offsets and terrain parameters |
| `Media/Models/Earth.TVM`, `Sphere.tvm`, `Box.tvm`, `fleche.TVM`, `MenuDomo.TVM` | Earth/grid, System/Tools cubes, arrow, gold indicators and detailed original panel; MenuDomo has 14,422 vertices / 28,524 triangles |
| `Media/Alphabet/0.tvm` … `9.tvm` | All ten original numeric glyphs, used directly in twenty editable digit meshes and also discoverable as Studio models |
| Seven original model textures | Byte-identical copies, including Earth grid with a black color key, gold, marble and grass |
| `textures n else/Heightmaps/heightmapSplit.jpg` | Original red-channel height samples resampled to a 64-segment v2 terrain |

There are 18 palette model entries, including texture variants of the same Box/Sphere
geometry. They are reusable models within one recovered composition. Source actors and
click volumes retain raw native coordinates; published model geometry reflects Z once.
Model files deliberately omit fitting bounds so independent recentering cannot break the
original composition. The CubX constructor's size argument is unused by its actor loader;
the host places that machine at `[-400,500,0]` at native scale one. The shared scene scale
is 0.03. Other objects retain their own `CL3DObject::SetScale` values.

The existing counted TVM reader now recognizes the older 416-byte `MGRP` material records.
Their opaque contents are retained by hash, while the original host's texture override is
applied to counted geometry. The vehicle wrapper still accepts only its established
`MGR3`/`MGR4` layouts. Normals, UVs, geometric bounds and group/index checks remain intact.

## Repaired and adapted boundaries

- The native controller indexes seven Get actors with eight selections. Endpoint geometry
  establishes direct choice 1 and `GetN` for choice N, repairing the shifted/uninitialized
  source lookup. Passive quaternion conversion is shared with CubZ, including cylinders.
- Closing reverses the same tracks; the old host leaves closing/return states unfinished.
  Initial visibility and held reverse/alignment poses remain coherent even when paused
  before the next simulation frame. Skip lands one fixed step beyond the terminal key.
- Waiting uses one rigid common rotation. Its axis/timing is an explicit current adapter,
  rather than a claim of identical native Euler integration or a disconnected Rot study.
- Camera, responsive framing, lighting, panel readability lift and materials are adapters.
  Source origins and source geometry remain unchanged. The heightmap's SDK default vertical
  scale, terrain interpolation and solver parity are not certified.
- The original main clock refreshes from local Windows time. This version deliberately
  captures local time on opening or on request, then saves editable digits in the scene.
  It does not claim an automatically live or hardware-backed clock. The two light schedule
  placements are matched to MenuDomo's engraved OFF/ON labels, which disagree with the C++
  variable names. Fan schedules retain the original order.
- The panel's temperature lettering is source geometry, without an attached sensor or
  fabricated temperature reading. Indicator toggles change native model material slots;
  no device output or automatic alarm transport is asserted.
- Impreza, FlightX and Studio destinations are current navigation adapters. The eight
  CubXActor outer selection meshes do **not** recover the separate CubZ paths
  `Media/CubXBtn/Btn1..32.tvm` / `BtnExit.tvm`, which are still not found. Earlier archive
  listing evidence is recorded in [CUBZ_MENU.md](CUBZ_MENU.md).

All entities, keyframes, edits, simulation and snapshots use the existing v2 world API
and shared frame loop. A replacement world arriving during loading cancels this mount.
After loading, foreign documents are preserved on Studio handoff and destructive controls
are disabled. A replacement world cancels the old view's camera move synchronously; its own
new camera and movement survive subsequent resize/media events. Optional scene-store
configuration is retained by Studio and experience links.
Simple Studio framing waits for native model bounds, excludes hidden source actors and fits
the visible scene in its available viewport, including after a named scene reload.

## Validation

`test/cubx-atmel.test.mjs` checks source pins/shipping, bind matrices, all native rigid
rotations and corner mapping, fixed hinges and outward petals, visibility at switches,
reverse cycles, waiting alignment, editable glyph preservation and JSON pose semantics.
`test/impreza-source.test.mjs` covers counted MGRP support without widening vehicle inputs.
`scripts/smoke-cubx-atmel.mjs` drives the actual browser through eight cycles, real native
picking, paused reverse/alignment poses, four protected layouts, clock editing/undo/redo,
material-slot indicators, named Studio save/reload and foreign-world loading/return fences.

```powershell
npm run verify -- --wait --checks=cubx-atmel,cubz-menu,studio-simple,my-creations,product-assets,asset-guard
npm run verify -- --wait
```

Run heavy checks under the machine-wide lock. Inspect the PNGs in `output/verify/` and
`cubx-atmel-result.json`; hosted CI only qualifies Node/static contracts. Local build,
public revision, deployed asset checks and public browser reception remain distinct proofs.
