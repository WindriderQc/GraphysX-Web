# LLMx visual integration — first interface

2026-09-13. Shared base: `d7c9937`. Codex integration worktree: `C:\Users\Yanik\codes\GraphysX-Web-llmx-integration`, branch `codex/llmx-integration`. Pipeline task: `0688`.

Yanik's current priority is the Forge atmosphere, face and entrance. Early arithmetic for ages 4 and 7 is documented for later in the planning worktree; it does not block this milestone.

## Ownership and delivery

Claude owns face data/sculpting, `llmx-face-pose.ts`, the face renderer and the Forge builder. Codex owns `main.ts`, `platform-host.ts`, `agent-world-runtime.ts`, server validation, shared contracts and application/conversation integration. Supply small committed slices with file lists; Codex integrates them without merging unrelated branch changes.

The following interface is ready for review in [llmx-contracts.ts](../src/llmx-contracts.ts). Claude acknowledgement is still pending. If an existing visual module already uses another interface, preserve the work and document that interface; Codex can adapt it at the boundary.

## Face

The authored entity is an ordinary `agent` with `appearance: { kind: "voxel-face", asset: "forge-mask", palette: "forge", seed: 1 }`. Codex will thread `appearance` through normalization, patching, state, export and server validation. It is not a new physics entity type. The quality profile selects `high`, `balanced` or `mobile` separately from persistent appearance.

Codex adopts the interface already agreed between the two Claude sessions: `object`, `setDrivers(Partial<FaceDrivers>)`, `update(deltaSeconds)`, `describe()` (including `build` and `speaking`) and `dispose()`. The conversation mapper supplies `build`, `speak`, `speakTone`, `gazeX`, `gazeY`, `attention`, `think`, `warmth`. The rig owns normal blinking and breathing; the entrance may temporarily override lid closure. The runtime calls the update in its existing frame loop; neither renderer nor application owns a second animation loop.

The face source observed before this interface already supports the three quality names. Its sculpt and counts may continue evolving; no hardcoded rest geometry is introduced by Codex.

`llmx-presentation.ts` maps observable conversation/output state to these inputs. The actual speech output bus supplies amplitude and brightness. Neither queued text/audio, user microphone, ambience nor unrelated GPU activity drives the mouth. Playback can continue after generation ends. The presentation layer cannot claim a real connection by animating a waiting pose.

## Forge

The generic application descriptor can be filled from Claude's existing `createForgeWorld() -> { document, anchors }`; no rename or rewrite of his builder is requested. Mapping into the proposed descriptor:

- `id`, `label`, `world` (ordinary `AgentWorldDefinition`), `faceEntityId`;
- `anchors.cameraStart`, `cameraRest`, `cameraTarget`, `creationCenter`, in world coordinates;
- `entrance.cameraSeconds`, `assemblyDelaySeconds`, `assemblySeconds`.

Claude's `forgeIntroAt()` and `forgeCameraAt()` remain the artistic source for the circuit, approach, assembly and wake bands. The Codex clock only gates start/skip/disposal and supplies elapsed time; it must not add another easing over those samples. The Forge uses `llmx-face-anchor` as a group marker until the integrator adds the authored agent appearance.

The builder composes persistent entities and environment settings only. No DOM, renderer construction, service URL, private session data or internal animation loop. It may use the current GraphysX sky/HDRI, lights, fog, bloom and particle presets. Codex applies environment settings through the host and mounts the face through the runtime.

Use a placeholder agent entity if the runtime appearance type is not yet in Claude's branch; supply its intended `appearance` in the handoff. Do not weaken validation or cast a new unregistered entity type just to compile the visual branch.

## Entrance and readiness

`llmx-entrance.ts` provides a pure clock for camera/assembly progress. It remains loading until essential assets are ready, supports skip/reduced motion, and cannot be revived by a late asset callback after disposal. The host is the only source of ticks. Zero visual duration means no animation, not a skipped readiness check.

Visual readiness does not start a greeting on its own. The application separately coordinates Conversation readiness, explicit audio activation and the server-side opening turn. No canned or simulated Hello is accepted as the actual agent conversation.

The host currently clamps `frameView(..., 0)` to 150 ms. Codex will resolve the immediate-framing case for skipped/reduced-motion entrances and verify affected camera behavior. Claude need not work around this inside the Forge.

## Evidence

Integrated commits: Codex entry/contracts `9309804`, Claude sculpt/pose `6d8f27d` as `3ba594e`, interface adoption `9e245df`, Claude Forge `a4b4163` as `fce43cf`. Typecheck and the existing suite on the integrated tree pass: 382 passed, one skipped, no failures. No new production dependency was added. The application route, persistent appearance integration and real Conversation/Hello are still pending.

The Forge owner runs a development preview at `http://localhost:4199/llmx-preview.html`. Codex inspected that page with the real voxel rig attached and the simulation label visible, including entry and rest. That page includes working files not yet in these committed slices; it is not a screenshot receipt for `fce43cf`. The face renderer is still owned and being finished by `aiops-b5`; Forge is owned by `graphysx-web-74`.

Visual feedback on the inspected preview: the bright socket dominates the face, and the dark metal/seams obscure its main surfaces. Recheck the latest renderer copy before judging the lighting, since the two visual worktrees currently exchange uncommitted preview copies.

Review note for the face owner: the current renderer uses exponential smoothing for `current.build` and tests `current.build < 1` to decide whether to rewrite static cubes. The same recurrence at 60 Hz remains below one after 10,000 iterations due to floating-point convergence. Snap a near-target value to its target (with a bounded visual tolerance), and test that static writes actually stop after assembly. Do not make opening readiness depend on an exact equality that the smoother cannot guarantee.

The entry tests cover late assets, skip, reduced motion, exact zero durations, invalid time, and real-playback precedence over generation state. Full visual qualification follows integration of Claude's committed renderer and the actual LLMx route.

## Messaging receipt

The existing Claude sessions were discovered through the installed CLI (`claude agents --json`): `aiops-b5` owns the face and `graphysx-web-74` owns the Forge. A one-shot relay restricted to `SendMessage`/`ToolSearch` was attempted to send the coordination note to both. It failed before inference with HTTP 401 (invalid API key), zero model tokens and no message found in either recipient log. No credential, authentication setting or running-session permission was changed. This failed relay is distinct from the two functioning interactive Claude sessions. Shared file/Pipeline delivery is available; receipt by Claude is not yet confirmed.
