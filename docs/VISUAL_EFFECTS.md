# Portable energy materials and brightness modulation

These effects are ordinary v2 scene fields. They use the existing World API,
MeshStandardMaterial pipeline and simulation clock; export/create, storage,
transactions and undo retain the authored values. They add no runtime dependency,
render loop, shadow map or full-screen post-processing pass.

## Energy PBR extension

```js
gx.spawn({
  id: "plasma", type: "sphere", transform: { position: [0, 2, 0] },
  material: {
    color: "#123746", emissive: "#13a5c8", emissiveIntensity: 1.2,
    shader: {
      id: "energy", rimColor: "#9bf5ff", rimPower: 2.5, rimIntensity: 1,
      flowSpeed: .65, flowScale: 1.8, flowStrength: .9
    }
  },
  behaviors: [{
    id: "breath", type: "modulate", property: "emissiveIntensity",
    minimumFactor: .72, maximumFactor: 1.28, frequencyHz: 1.5
  }]
});
```

`shader.id: "energy"` extends PBR emission with a view-dependent Fresnel rim and
smooth vertical flow fronts. The view direction is evaluated per fragment using
the active eye, including WebXR; orthographic cameras use parallel rays. Flow
uses local deformed vertex positions, so it follows object transforms and repeats
per instance. `flowScale` is cycles per local Y unit; `flowSpeed` is signed cycles
per simulation second. Base PBR maps, normals, lighting, fog and renderer colour
management remain in the standard pipeline. `material.emissiveIntensity` controls
both the base emission and the added energy. This is stylized emission, not
volumetric transport or physical atmospheric scattering.

For an atmosphere or holographic shell use `rimOpacity: true`: face-on alpha fades,
the material becomes transparent and depth writes are disabled. `blend: "additive"`
adds emitted light without darkening the scenery underneath. It also disables depth
writes. Normal blending is the default. Set `flowStrength: 0` for a rim-only compiled
variant, which omits flow sine/power calculations. NACRE uses that lighter variant
for its Earth atmosphere and reactor containment. Transparent shells still cost
overdraw; keep their layers and screen coverage bounded.

Clearing `material.shader` restores the normal PBR pipeline, blending and the
authored opacity/depth policy. Switching between energy and archived shaders clears
the previous hook; recovered archive implementations and provenance are unchanged.
Generic material shaders apply to authored primitives and inline meshes. Native
glTF source slots continue to use `modelMaterialOverrides`.

## Brightness modulation

`type: "modulate"` multiplies either `intensity` on owned lights or
`emissiveIntensity` on owned standard/physical materials by a sinusoidal factor.
It includes native model slots, also when the asset loads after the behavior.
Separately authored child entities keep their own brightness. Multiple modulation
behaviors multiply; actual final brightness is clamped to the platform's 0..100
range. Unsupported material families and embedded GLB lights are unaffected.

The defaults are factors .75..1.25 at .5 Hz. Optional `phaseDegrees` offsets the
wave; `startSeconds` gives its simulation origin. Before that origin, the starting
phase holds. `pause` freezes the shader and brightness; `step` advances both.
This visual behavior can be attached to dynamic bodies: it does not move physics.

Authored brightness remains unchanged in export/query. Native `materialSlots`
report the actual current material values. Detaching restores the original base
immediately; updating the authored base while modulated changes that base without
compounding prior frames. Animation does not append edits to undo history.

The published world vocabulary includes `energyShader`, shader IDs, the
`modulate` behavior and numeric limits from `server/visual-effects.mjs`. The same
validator protects browser authoring and stored documents. The unit contract and
the native `quest3` smoke cover bounds, physics separation, pause/step, child
ownership, late assets, patches, detach, shader clearing, undo and round trips.

## NACRE application

The reactor's two swept helical strands share one ordinary inline mesh and draw.
They rotate, flow and breathe inside an additive containment shell. The Earth
keeps its approved surface/cloud images and gains a small per-eye atmosphere shell.
Reactor lighting and ring emission use portable modulation. Existing mission
checkpoints, tracked input ownership, positional audio and immutable asset URLs
remain intact. Existing saved compositions keep their authored look; starting a
fresh NACRE scene uses the new composition.

Local WebGL captures and synthetic input establish browser behavior. Physical
Quest 3 stereo appearance, sustained frame pacing, comfort and listening require
headset acceptance.
