# Generative geometry: the authoring gap

Status: proposal, 2026-10-26. This document does not add an API or claim model acceptance.

The owner wants agents to design geometry and its texture, beyond arranging primitives and
catalogue models. That is a real authoring gap, rather than a missing triangle renderer.

## What already exists

`src/agent-world-assets.ts` builds indexed BufferGeometry from `graphysx-mesh-json` positions,
indices, optional normals and UVs. Payload meshes can have material groups and texture maps.
`api.media.register` can store generated model/texture files when the existing asset store is
available. A `model` entity then references an asset id or URL. No additional renderer is needed.

The scene/proposal boundary is narrower: `server/scene-commands.mjs` exposes primitive geometry
dimensions and a model asset reference, not inline mesh buffers. `server/world-vocabulary.mjs`
derives the vocabulary Core uses from those tables. The public, storeless page therefore has
no portable, direct mesh-authoring operation. Publishing a model URL is not the same feature.

A local renderer experiment generated a 6,144-triangle curved surface with indexed topology,
UVs and a loaded texture through that existing model path. It used deterministic code and a
loopback asset fixture, not an LLM. It proves rendering, not a new authoring API, native Nestor
composition, persistence independence, or the artistic quality of model output. Evidence is
kept outside Git.

## Recommended first capability

Make a bounded inline mesh a first-class part of the existing v2 scene and command validator.
Choose its final field/type shape during implementation; do not copy a hypothetical API into
Core's prompt or advertise it in the machine vocabulary before it works.

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
