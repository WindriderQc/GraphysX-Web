# KidX First Drive visuals

`?app=ev3-lab` opens a dedicated workbench built by `ev3FirstDriveScene()` in
`src/ev3-robotics-lab.ts`. It shares the full EV3 lab's driving base, finish and miss
triggers, spawn, timer and steering. The full seven-station starter remains available
through Browse Scenes. The app has a fixed three-quarter camera, with additional
distance in portrait to keep the robot and target visible.

The driving base uses licensed LDraw part geometry, arranged as an original wheeled
teaching chassis inspired by the
[LEGO Education EV3 Driving Base](https://education.lego.com/en-us/product-resources/mindstorms-ev3/downloads/building-instructions/):
intelligent brick (95646), large motors (95658), 56 mm tyres (41897), six-spoke rims
(41896), Technic liftarms with through-holes, blue pins and steel ball caster. CAD
includes the moulded ports, speaker, directional controls and printed patterns. Two
original motor leads and a French LCD graphic complete the visual. It is a
visual teaching model, not an exact building instruction or a
dimensionally qualified hardware simulation.

The owner's original kit and Education instruction PDFs are indexed in
[KIDX_LEGO_REFERENCES.md](KIDX_LEGO_REFERENCES.md), including specific TRACK3R
assembly and original play-mat pages. The wheeled simulation mesh does not reproduce
the tracked 31313 build.
The [KidX workshop](KIDX_WORKSHOP.md) now provides separate TRACK3R/SPIK3R construction
views from licensed LDraw models and a reader for all 138 indexed documents.

The workbench uses a dark teal background, a green cutting mat, a warm desk and
separated key/rim lighting. The backdrop does not cast a wall shadow over the robot.
These shared EV3 scene lighting changes also apply to the full lab.

Regenerate the committed native mesh after changing its generator:

```sh
node scripts/build-ev3-assets.mjs output/kidx/ldraw
node scripts/build-asset-catalog.mjs
```

Supply the extracted [official LDraw library](https://library.ldraw.org/library/updates/complete.zip).
The generated JSON retains the authors and licenses of all 231 contributing part files,
source part placements and adaptation notes under `provenance`. The mesh has 132,909
triangles in 15 material batches with authored normals. Plastic, rubber, clear protectors
and metal have separate surface finishes. The converter repairs cancelled normals and
removes collapsed faces to avoid NaNs spreading through the renderer's bloom pass.
Its JSON, LCD SVG and work-mat SVG
live in `public/assets/kidx/`. The asset catalog and texture registry make the existing
product manifest include them in release builds; no remote model or image service is
needed. The mesh uses native scene coordinates, +Y up and -Z forward. Geometry changes
do not change the existing box collider or the four-block program language.

The scene's existing steering anchor `ev3-drive-base:heading` is now a group containing
the detailed model, editable brick core and forward marker. The shared runtime places
and turns that whole assembly using the actual steering heading. This also fixes the
previous discrepancy where only the floating indicator turned. No second frame loop
or application-specific physics path is involved.

Validation uses the existing unit suite, EV3 lab smoke, saved-program smoke and
web-game driver. The EV3 smoke also checks model loading, the mat texture and the
rendered chassis orientation after both turn programs. Inspect the rendered initial,
running, completed and portrait screenshots; DOM layout checks alone do not establish
that the robot and finish are in view. Physical Mint/EV3 acceptance remains separate.
