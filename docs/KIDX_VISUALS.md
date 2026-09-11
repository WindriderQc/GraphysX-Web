# KidX First Drive visuals

`?app=ev3-lab` opens a dedicated workbench built by `ev3FirstDriveScene()` in
`src/ev3-robotics-lab.ts`. It shares the full EV3 lab's driving base, finish and miss
triggers, spawn, timer and steering. The full seven-station starter remains available
through Browse Scenes. The app has a fixed three-quarter camera, with additional
distance in portrait to keep the robot and target visible.

The driving base is original procedural geometry inspired by the
[LEGO Education EV3 Driving Base](https://education.lego.com/en-us/product-resources/mindstorms-ev3/downloads/building-instructions/):
rounded intelligent brick, inset LCD, directional buttons, motor housings, tyre tread,
wheel rims, Technic liftarms with through-holes, blue pins and two motor leads. It is a
visual teaching model, not imported LEGO CAD, an exact building instruction or a
dimensionally qualified hardware simulation.

The owner's original kit and Education instruction PDFs are indexed in
[KIDX_LEGO_REFERENCES.md](KIDX_LEGO_REFERENCES.md), including specific TRACK3R
assembly and original play-mat pages. They provide references for future fidelity
work; the current wheeled mesh does not reproduce the tracked 31313 build.

Regenerate the committed native mesh after changing its generator:

```sh
node scripts/build-ev3-assets.mjs
node scripts/build-asset-catalog.mjs
```

The 19,754-triangle mesh uses nine material batches. Its JSON, LCD SVG and work-mat SVG
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
