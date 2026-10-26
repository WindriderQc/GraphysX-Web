# Generative geometry: the authoring gap

Status: mesh v1 plus construction and focused editing implementation, 2026-10-26. Browser/authority acceptance and native model
acceptance are recorded separately; a deterministic fixture is not a model result.

## Mesh v1

`spawn` accepts `type: "mesh"` and a `mesh` block. `update` with `patch.mesh` replaces that
entire block atomically, through the same commit/review/history path as other authored edits.
The indexed BufferGeometry, materials, selection, disposal, export/save/reload and live-session
inverse use the existing runtime. No asset store, model file or external URL is required.

```json
{
  "op": "spawn",
  "entity": {
    "id": "folded-sail", "type": "mesh",
    "mesh": {
      "positions": [-1,0,-1, 1,0,-1, 1,1,1, -1,0.3,1],
      "indices": [0,2,1, 0,3,2],
      "uvs": [0,0, 1,0, 1,1, 0,1]
    },
    "material": {
      "color": "#ffffff",
      "texture": { "id": "inline", "pixels": {
        "width": 2, "height": 1, "rgba": [20,180,220,255, 220,110,40,255]
      }}
    }
  }
}
```

- Positions are flat local xyz metres, +Y up. Indices are zero-based CCW triples. Normals
  are optional xyz direction triples, computed when absent. UVs are uv pairs per vertex;
  duplicate vertices for UV seams or hard edges. Textured meshes require UVs.
- Optional `mesh.materials` entries use the existing PBR material vocabulary over the entity
  material. Optional `mesh.groups` entries are `{start,count,materialIndex}`. Start/count
  address the index array, in whole triangles; groups must partition it without holes or
  overlaps. More than one material requires groups.
  Open inline surfaces render on both sides by default; `material.side` can explicitly select
  `front`, `back` or `double`, including on individual mesh materials.
- An authored texture uses `material.texture.id: "inline"`, with `pixels.width`, `height`
  and flat unsigned `rgba` bytes, bottom row first. It uses the existing DataTexture/material
  lifecycle, including repeat, offset and rotation; it also works as a normal map. Curated
  textures remain available. This deliberately executes no user script and fetches no URL.
- Shared validator limits: 4,096 vertices, 8,192 triangles, 8 materials, 128 groups and
  128 KiB serialized per mesh; 32,768 inline vertices and 65,536 inline triangles per scene.
  Pixels are at most 64 by 64. The 256 KiB provider reply and live-operation limit stays
  unchanged. These are conservative resource caps, not an FPS guarantee on physical phones.
  Scene caps apply after every operation in a batch, including temporary peaks; use an
  atomic `update.mesh`, or remove an old mesh before spawning its replacement. UV and normal
  bounds are published from the same constants as their validator.
- Physics requires explicit `convex-hull` or `trimesh`. Triangle colliders are static;
  moving bodies use the existing hull machinery. `auto` is refused for inline meshes,
  so collision never silently becomes a primitive bounding box.

`server/inline-mesh.mjs` validates topology before allocation; `scene-commands.mjs` validates
materials and document edits. The machine vocabulary publishes the same tables/limits and
a valid mesh+texture example. Core must render newly published field blocks and limits in
its prompt, rather than keeping a second fixed list of known blocks.

### Construction and focused edits

`spawn.meshBuild` builds a mesh instead of supplying `spawn.entity.mesh`. Existing meshes can
be rebuilt with `update.patch.meshBuild`. Pick exactly one geometry source per command:

- `{"kind":"extrude","profile":[[-1,-1],[1,-1],[1,1],[-1,1]],"depth":0.5}`:
  a simple XZ polygon, extruded along +Y with triangulated caps; concave profiles work.
- `{"kind":"revolve","profile":[[0,0],[0.8,0],[0.5,1.5],[0.7,2]],"segments":24}`:
  an open radius/Y profile turned around +Y. Optional `angleDegrees` defaults to360;
  partial turns have open cut edges. Axis vertices produce fans without degenerate triangles.
- `{"kind":"sweep","profile":[[-0.2,-0.2],[0.2,-0.2],[0.2,0.2],[-0.2,0.2]],"path":[[0,0,0],[0,2,1],[2,3,2]]}`:
  a polygon transported along a spatial path, with capped ends.

Profiles have at most64 points, paths64 points and revolution3..64 segments. Polygon profiles
omit the repeated endpoint; self-crossing, touching, repeated and collinear corners are refused.
All operators generate UVs and expand through the existing shared validator into ordinary
portable buffers. Recipes are command intent; the saved scene contains only the resulting mesh.
They add no executable script, service, renderer loop, CSG or alternate scene authority.

`update.patch.meshEdits` replaces fixed-size, nonoverlapping tuple ranges:

```json
{"op":"update","id":"folded-sail","patch":{"meshEdits":{"positions":[{"start":2,"values":[1,2,1]}]}}}
```

`start` counts vertices for positions/normals, triangles for indices, and UV pairs for uvs.
It never counts individual scalar components. For positions, use `delta:[dx,dy,dz,...]` instead
of `values` to move tuples relatively, preserving unchanged coordinates without copying them.
Generated positions/UVs are canonical Float32 values; construction uses fixed-arithmetic
trigonometry so Node and Chromium produce the same portable buffers.
Unchanged buffers remain exact. Position/index
edits drop stale explicit normals unless normals are also supplied; `normals:"recompute"`
requests the same behavior explicitly. There is no insertion, buffer extension or overlap.

`update.patch.pixelEdits:[{x,y,width,height,rgba}]` patches disjoint rectangles in the entity's
existing inline base texture, bottom row first. It preserves size, other texels and UV transforms.
For a material slot's own inline texture, supply `materialIndex` on its rectangles; omitting it
targets the entity base texture. Slot edits require an unchanged material layout. They can be
combined with position/index/UV edits, keeping other slots and textures exact.
Each edit permits at most64 ranges/rectangles. The completed mesh/texture is validated before
allocation; a bad edit rejects the whole batch. Review, one commit, undo/redo, JSON reload and
shared-scene inverse use the same paths as whole-block replacement.

For a selected or Nestor-targeted mesh, the request panel offers an unchecked geometry-sharing
option for one typed request. Checking it binds consent to that object; submission or changing
targets resets it. Background Center state reports and demonstration buttons keep summary-only
context. Only id/type/label,
counts, transform, mesh and material can enter optional `scene.focus`, at most16 KiB. Larger
meshes send counts with `complete:false`, omitting buffers/materials; no partial geometry is
presented as complete. Core validates this context before inference and treats it as untrusted
data. Normal requests retain the60-id summary. Core still composes; the browser still reviews.

Remaining geometry work is optional sophistication: hole profiles, CSG and richer surface
recipes, rather than a missing triangle/range/construction path.

## Original gap and direction

The owner wants agents to design geometry and its texture, beyond arranging primitives and
catalogue models. The original gap was authoring, rather than a missing triangle renderer.

## Existing asset path

`src/agent-world-assets.ts` builds indexed BufferGeometry from `graphysx-mesh-json` positions,
indices, optional normals and UVs. Payload meshes can have material groups and texture maps.
`api.media.register` can store generated model/texture files when the existing asset store is
available. A `model` entity then references an asset id or URL. No additional renderer is needed.

Before v1, the scene/proposal boundary exposed primitive dimensions and a model asset reference,
without portable inline buffers. Publishing a model URL was not the same authoring feature.
`server/world-vocabulary.mjs` still derives Core's vocabulary from the validator's tables.

A local renderer experiment generated a 6,144-triangle curved surface with indexed topology,
UVs and a loaded texture through that existing model path. It used deterministic code and a
loopback asset fixture, not an LLM. It proves rendering, not a new authoring API, native Nestor
composition, persistence independence, or the artistic quality of model output. Evidence is
kept outside Git.

## Design requirements

V1 makes a bounded inline mesh part of the existing v2 scene and command validator. The
requirements below guide further changes; range edits remain outside the first version.

- Indexed positions/triangles, optional normals, and UVs; duplicated vertices allow UV seams
  and hard edges. Accept a whole mesh in one command, not one network call per triangle.
- Existing PBR material controls and registered texture references, with explicit material
  groups for different faces. Texture creation should reuse the media/texture mechanism.
- Atomic replacement, then bounded vertex/triangle range edits when those can preserve the
  same invariants. Each accepted change remains one attributed commit and one undo step.
- Geometry and material references survive export, save, reload and live synchronization.
  No temporary blob URL masquerades as portable scene content.
- Reuse the current geometry/material construction and model collider machinery. Unsupported
  dynamic triangle colliders must be refused, not silently replaced by an unrelated shape.
- Derive model-facing fields and limits from the same validator tables; Core remains the
  proposal composer. No browser-side LLM, new service, generic proxy, arbitrary JavaScript
  execution or separate scene authority.

Finite numeric values, tuple lengths, valid integer index ranges, normal/UV cardinality,
triangle-aligned material groups, texture references and total serialized size all need
validation before allocation or mutation. Set geometry budgets from measured mobile costs,
and account for the existing proposal reply-size limit instead of silently raising it.

## Creativity needs more than buffers

Raw triangles are the escape hatch. Asking a model to emit thousands of numeric literals is
an expensive way to describe a curved object. A second layer should expose a small,
declarative set of construction tools: extrusion, revolution, sweep along a path, and bounded
deformation. These produce the same mesh data and pass the same validator. They are not a
second engine or an unrestricted script interpreter.

Material composition also matters: UV control, repeat/offset, different face assignments,
normal maps and restrained procedural texture recipes. A richer mesh alone will not fix a
scene whose lighting, proportions, focal point and density are poorly composed.

## Acceptance before advertising it

Prove a non-primitive textured object through the actual proposal review and Apply path.
Verify selection, one-step undo/redo, export/reload, shared-scene authority and mobile rendering.
Reject malformed topology, oversized payloads and bad texture references atomically, retaining
the exact previous document and history. Then run a native Nestor composition and inspect its
actual result; a deterministic geometry fixture is not evidence that an LLM can design well.
