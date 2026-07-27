# Generative Surfaces (Wave 15) — Design & Build Plan

Status: designed, ready to build as one focused PR. Grounded in current main (`24bfd61`).
Author: Claude, 2026-07-26. This is the plan the next session executes; every file:line below
was confirmed against the tree.

## Goal

Turn the existing single screen-space Canvas2D overlay into reusable, **scene-native** generative
visual layers: live Canvas2D sketches rendered onto in-world surfaces (screens, billboards,
panels) as textures — serializable, editor/API-accessible, export/load-safe, opt-in and
budget-gated, and drawn in the one shared frame loop.

## What already exists (reuse, don't reinvent)

- **Overlay sketch system** (`src/agent-world-overlay.ts`): `OverlaySketch { draw(ctx, dt, elapsed, w, h) }`
  with a registry (`GRAPHYSX_AGENT_WORLD_OVERLAYS`) and `createOverlaySketch(id)`. Screen-space only,
  ticked by the host. **The `draw` signature is exactly what a surface needs** — reuse it verbatim.
- **Entity sub-config pattern** (`agent-world-runtime.ts:447-465`): `emitter`, `sound`, `terrain`,
  `water`, `flock`, `crowd`, `formula` are each an optional typed field on the entity definition,
  valid only on their entity type, threaded through validation → serialization → patch → query.
  `surface` follows this pattern exactly.
- **Material build** (`agent-world-runtime.ts:3202-3205`): primitive mesh = `createGeometry` +
  `new MeshStandardMaterial()` + `applyMaterial`. This is where a surface's `CanvasTexture` attaches.
- **Per-frame pass** (`updateSimulation`, called from `update`/`step` at :1539/:1545): the shared-loop
  hook where each surface's sketch draws and `texture.needsUpdate = true` is set. No second rAF.
- `CanvasTexture` is already imported in `agent-world-assets.ts` — same pattern.

## Schema

New module `src/agent-world-surface.ts` (mirrors `agent-world-overlay.ts`):

```ts
export type AgentWorldSurfaceSketchId = "waveform" | "grid-pulse" | "plasma" | "starfield-screen";
export type AgentWorldSurfaceDescriptor = { id; label; description; provenance };
export const GRAPHYSX_AGENT_WORLD_SURFACES: readonly AgentWorldSurfaceDescriptor[] = [ ... ];
export interface SurfaceSketch { draw(ctx, dt, elapsed, w, h): void }   // reuse OverlaySketch shape
export function createSurfaceSketch(id): SurfaceSketch { ... }
export function isSurfaceSketchId(v): v is AgentWorldSurfaceSketchId { ... }
```

Entity definition gains one optional field (`agent-world-runtime.ts` ~:465, beside `formula`):

```ts
/** Live generative Canvas2D texture on this mesh's surface. Only valid on box/plane/cylinder. */
surface?: AgentWorldSurface | null;

export type AgentWorldSurface = {
  sketch: AgentWorldSurfaceSketchId;
  /** Square canvas edge in px; clamped 64..1024, default 256. Budget lever. */
  resolution?: number;
  /** Target redraws/sec; clamped 1..60, default 30. Budget lever — a sign can idle at 8. */
  fps?: number;
  /** Also drive emissiveMap so the surface glows (screens, signage). Default true. */
  emissive?: boolean;
  /** Multiply tint over the sketch, #rrggbb. Default #ffffff. */
  tint?: string;
};
```

## Runtime plumbing (the 7 points, all in `agent-world-runtime.ts` unless noted)

1. **Type + import** the `AgentWorldSurface` type and `createSurfaceSketch`/`isSurfaceSketchId`.
2. **Default + resolve**: add `surface: null` to the entity defaults; write `resolveSurface(source)`
   (mirror `resolveWater`/`resolveFlock`) — validate sketch id, clamp resolution/fps, validate tint
   hex, reject `surface` on unsupported types. Call it in the entity resolver.
3. **createObject wiring** (:3202): if `definition.surface`, build an offscreen `<canvas>` at
   `resolution²`, a `CanvasTexture` (`colorSpace = SRGBColorSpace`), set `material.map` (and
   `material.emissiveMap` + `emissive = tint`, `emissiveIntensity ≈ 0.6` when `emissive`). Store
   `{ canvas, ctx, texture, sketch, fps, accum }` in a `Map<entityId, SurfaceRuntime>` on the class.
4. **Per-frame draw** in `updateSimulation(dt)`: for each live surface, accumulate dt; when
   `accum >= 1/fps`, call `sketch.draw(ctx, frameDt, elapsed, res, res)`, `texture.needsUpdate = true`,
   reset accum. **Budget gate**: `MAX_SURFACES = 8` (skip beyond, `log`), resolution ≤ 1024, and the
   pass runs inside the existing loop so pause/step apply for free (same as flock/particles).
5. **Serialization** (`serializeEntity` :3846): include `surface` when present — round-trips through
   `export()`/`load()`. (The smoke asserts this.)
6. **Patch support** (`AgentWorldEntityPatch` + apply): allow `surface?: AgentWorldSurface | null`
   so an agent/editor can add, retune, or remove a surface; on change, dispose old texture/canvas
   and rebuild (or hot-swap the sketch). Reset resets the map.
7. **Disposal**: on entity remove / world clear, `texture.dispose()` and drop the Map entry (mirror
   how flock/emitter runtimes are torn down). Expose `surface` in `getState()`/query so the bridge
   and editor see it. Add the paths to the bridge manifest + `bridge.audit()` and `AGENT_WORLD_API.md`.

## Sketches (v1, all new Canvas2D — no archive source, label as such)

- **waveform** — a scrolling neon oscilloscope trace; reads as a live signal/monitor.
- **grid-pulse** — a perspective grid with a travelling pulse; synthwave panel.
- **plasma** — classic sine-plasma field; cheap, hypnotic, good for a portal.
- **starfield-screen** — the overlay starfield adapted to a bounded panel (reuse its math).

Each clears with a low-alpha fill (motion trails) and draws in a few ms at 256².

## Showcase (one polished scene)

New `src/surfaces-showcase.ts` composed via `api.create`, registered in the Browse shelf like the
garage: a small dark gallery with **three angled panels** (thin `box` entities) each carrying a
different surface sketch, plus one **billboard** facing the entry and one curved **cylinder screen**,
under restrained bloom (`environment.post.bloom`) so the emissive surfaces glow. Camera framed on
the panels. Provenance block: sketches are new, panels are `adapted`.

## Verification

- **Smoke** `scripts/smoke-surfaces.mjs` (register in `verify.mjs` + `package.json`): compose the
  showcase; assert (a) each panel entity reports its `surface` in `state()`; (b) the surface texture
  advances — capture `host.surfaceFrameCount` (a new counter incremented in the draw pass, mirroring
  `overlayFrameCount`) at two times and assert it grew while `frameCount` grew (proves one shared
  loop, like the overlay smoke); (c) `export()`→`load()` preserves every `surface`; (d) removing a
  panel disposes its surface (Map shrinks); (e) zero console/page errors.
- **Screenshot** the showcase (CLAUDE.md rule): the panels must visibly show distinct animated art.
- Node-only probe first for the schema/serialization, one browser smoke for the render + loop proof.

## Budget & invariants honored

- Off by default (only entities that declare `surface` cost anything).
- One shared loop (draw in `updateSimulation`; never a second rAF).
- Caps: ≤8 surfaces, ≤1024², per-fps throttle; a panel can idle at 8 fps.
- Serializable scene data; editor/agent reachable; export/load-safe.
- Recovered-vs-new honesty: sketches are new, labelled "No archive source."

## Estimated size

~1 new module (surface sketches, ~200 lines) + ~120 lines of runtime plumbing across the 7 points +
~150-line showcase + ~120-line smoke. One focused session, one clean PR off current main.
