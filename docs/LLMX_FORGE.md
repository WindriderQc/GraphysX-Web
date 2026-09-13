# LLMx — Nocturnal Forge (environment, choreography, preview harness)

Owner: the Claude "Forge" session (branch `claude/llmx-forge`, base `d7c9937`). The face
(sculpt, data, pose, rig `agent-world-face.ts`) belongs to the Claude "face" session on
`claude/llmx-face-forge`; the application mount, contracts, conversation and catalogues belong to
Codex per [LLMX_RESTART_HANDOFF](../../GraphysX-Web-llmx-plan/docs/LLMX_RESTART_HANDOFF.md).

## What exists

| File | Role |
| --- | --- |
| `src/llmx-forge.ts` | `createForgeWorld()` — the Forge as a plain v2 document plus named anchors (`faceCenter`, `gazeTarget`, `cameraRest`, `cameraEntry`, `buildZone`, `ribs`). Also the pure entry timeline `forgeIntroAt()` / `forgeCameraAt()`. Type-only over the runtime so `node --test` loads it. |
| `src/llmx-forge-presentation.ts` | Host-side transient effects: the copper circuit running along the ribs at entry, the copper "breath" behind the mask while the agent speaks, and `announceCreation(point)` — a cyan trail from the socket to a new object and a ring opening under it. Not scene state; never exported. |
| `src/llmx-preview.ts` + `llmx-preview.html` | Dev harness in the real `PlatformHost`. Not a build input. Everything it animates is labelled SIMULATION. |
| `test/llmx-forge.test.mjs` | Document invariants: unique ids, one floor collider, one shadow light, particle budget, anchors consistent, timeline monotonic. |

## Contract with the face rig

The rig is parented to the group entity `llmx-face-anchor` at `anchors.faceCenter` (0, 3.2, 0),
scale 1, facing +Z. Socket top is y = 0.9; the mask's measured bottom (y = -1.117 local) sits
1.18 m above the crown. Cameras aim at `anchors.gazeTarget` (the eyes, y = 3.3), not the origin.
The only shadow-casting light is the directional key at (-9, 13, 10); no shadow light is within
2 m of the mask (the rig self-shadows otherwise).

The harness drives the rig through the interface the face session fixed on 2026-09-13:
`object`, `setDrivers(Partial<FaceDrivers>)`, `update(dt)`, `describe()`, `dispose()`.
Plug it in with `window.__LLMX_PREVIEW__.attachFace(rig)`; when `agent-world-face.ts` sits beside the
harness it is attached automatically.

Once Codex wires the runtime (the face session's `docs/LLMX_FACE_INTEGRATION.md` lists the eight
seams, modelled on how `formula` already threads through `agent-world-runtime.ts`), the anchor
entity carries `appearance: { kind: "voxel-face", level, ... }` and the mask rebuilds on load with
nobody instantiating it by hand. `createForgeWorld()` will then set that field on
`llmx-face-anchor`; it does not yet, because the entity type does not know the field.

## Running the harness

From this worktree: `npm run dev -- --port 4199` then open
`http://localhost:4199/llmx-preview.html`. Query: `intro=0` skips the entry, `t=<s>` seeks it,
`speak=1` starts the simulated speech envelope. "Créer (simulé)" spawns an ephemeral copper block into the build zone through an ordinary `api.spawn` (the object is real scene state on the real collider; only the decision is simulated), fires the creation accent and holds the mask's gaze on it for two seconds. `.claude/launch.json` has an `llmx-preview`
entry for the Browser pane.

With a junctioned `node_modules`, Vite logs 403s for `@fontsource` files outside its allow list;
the HUD falls back to the system font. Cosmetic, dev-only.

## Entry timeline (indicative, plan §6.1)

circuit 0–2 s → approach 0.8–6.2 s → assembly 2–6.4 s → wake 6.4–7.5 s. Reduced motion
compresses the whole thing to 1.2 s. The timeline is never evidence that the engine or the voice
is ready; the application gates the "Hello" separately.

## Looked at (2026-09-13, Browser pane, 1280×720, profile high)

Entry view with the plateau, arches and stack smoke; circuit pulse along the front rib; block
stand-in assembling from the chin up; rest framing with the crown, rim breath and build zone.
Later the same day, with the face session's rig (its commit `cc223dd`) attached through the
harness: the mask carries the key light without cracks, aims its gaze at the rest camera
(`gazeX` 0.55), opens its mouth on simulated speech, and turns toward a simulated creation while
the trail and ring play. Not yet: a landscape capture at native scale, a reduced-profile capture
with a measured frame budget.
