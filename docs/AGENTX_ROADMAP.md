# AgentX Center roadmap

*Truth reset: 2026-08-06. The AgentX Center v2 slice began from clean `main` at `9ea9da3`;
this document includes the completed spatial mission-director work in the current release.
[PRODUCT_SPEC.md](../PRODUCT_SPEC.md) remains the product contract. This is the execution order.*

## The product direction

GraphysX should open as a living 3D place where humans and agents share one scene, one
vocabulary, and one visible history. Nestor is the host of that place: he points at real scene
entities, performs ordinary attributed commands, and hands everything he changes to the human
editor. He is not decorative chat chrome and he does not pretend a model is connected when it
isn't.

The default showroom is now the first AgentX Center milestone:

- Nestor is a serializable `type: "agent"` entity with role, status, perception, and
  capabilities.
- Build, Play, and Explore are physical consoles in the scene plus accessible DOM controls.
- Every demonstration is one `api.commit()` signed by actor `nestor`.
- Build assembles a signal-beacon prefab; Play drives authored physics interactions; Explore
  retunes both live flock systems.
- The camera follows the demonstration, the panel narrates it, and the resulting entities and
  agent profile survive export/load and remain in the editor outliner.
- Presenter state is reconciled from the scene after load, undo, and redo; the card never
  advertises a demonstration that the world has already reverted.
- While a live-session client is attached, both DOM and physical topic routes are gated until
  Nestor uses the session operation path, so viewers and editors cannot create private edits.
  The card switches to session-only live-observer copy with no local Editor, Games, Browse, or
  topic actions, and canvas spawning/interactions are disabled until detach rather than creating
  unbroadcast local mutations.
- Exiting an unrelated in-memory editor world preserves that work behind a neutral resume door;
  Nestor controls appear only when the complete AgentX Center is authoritative. Browse entries
  still return to a freshly composed center.
- The showroom smoke proves the complete path, not just the panel.
- A bounded server-authoritative Analyze → Build → Validate mission now coordinates at least
  two online AgentX actors through the physical Explore, Build, and Play stations. Mission
  boards, evidence cards, and completion effects are transient projections; accepted Build
  work remains an ordinary attributed scene operation.

## Ground truth before the next slice

Already shipped on `main`:

- One `PlatformHost`, one renderer, one frame loop, scene-native physics, behaviors, prefabs,
  water, terrain, flocks, crowds, formula fields, DNA entities, rules, and editor authoring.
- Stored scenes, browser scene browsing, live-session protocol and browser UI, actor-attributed
  operations, collaborative undo, leaderboards, and shared ghosts.
- Browser-facing result submission and ghost racing. Editable grid runs now snapshot the durable
  level revision at play mount, so they use `level:<id>@<revision>` boards.
- A dev-only shared preview workshop. Two of nineteen preview harnesses are converted; the other
  seventeen are content cleanup, not a product prerequisite.

Production release proof:

- The production host was verified with port 8788 bound only to loopback. Every deploy now
  repeats that host-level proof and fails on missing, wildcard, public, or mixed listeners.
- `.server-checksum` advances only after extraction, required restart of changed code, active
  service proof, and the listener proof. Static activation cannot proceed past a failed server
  deployment.

## Execution order

| Slice | Status | Outcome | Done when |
|---|---|---|---|
| 1. Nestor's first demo | Complete | AgentX Center replaces the passive showroom | Build/Play/Explore are attributed, visible, persistent, editor-ready, and browser-tested |
| 2. Live presence binding | Complete | A connected AgentX actor visibly inhabits the center | Session member/operation events update an ephemeral avatar and Nestor activity without polluting either export path |
| 3. Spatial mission director | Complete in this release | A live owner directs multiple AgentX actors through one scene-native mission | Analyze → Build → Validate is server-authoritative, ordered, evidence-backed, reconnect-safe, spatially projected, accessible, and absent from authored exports |
| 4. Guided co-authoring | Queue shipped; editing and providers remain | A human can ask for a bounded scene change and inspect it before/after | Proposal, actor, intent, command set, result, undo, and rejection are all visible; no hidden mutation |
| 5. Nestor tours | Queued | Nestor can sequence highlights across scenes and games | Camera cues, short narration, entity highlighting, cancellation, reduced-motion behavior, and destination handoff are deterministic |
| 6. Agent gameplay | Queued | AgentX can demonstrate and coach a BallZ course inside the product | A deterministic baseline run, ghost comparison, attributed input, and honest capability/offline states are visible in-browser |
| 7. Center expansion | Queued | The front door becomes a compact world hub | Build lab, living-systems overlook, play arena, and portals share one performance budget and remain editable scene vocabulary |

## Next three work sessions

### A. Center foundation and live presence — complete

1. Keep Nestor's scene-native Build, Play, and Explore demonstrations attributed, persistent,
   editor-ready, and visually polished across desktop and narrow layouts.
2. Project one actor-keyed transient avatar per online AgentX member and route accepted agent
   intent/revision reactions through Nestor without creating authored state or another frame loop.
3. Reconcile disconnect, reconnect, removal, leave, and world reload from authoritative session
   membership; keep transient actors out of history, selection, and both export paths.
4. Preserve the completed showroom, live-session browser, typecheck, build, graphics, and release
   proofs as the foundation for later slices.

### B. AgentX Center v2 spatial mission director — complete

1. Keep the bounded mission model on the existing live-session authority, sequence, snapshot,
   replay, resync, credential, and rate-limit path; it never revisions the scene document.
2. Require eligible online assignments spanning at least two AgentX actors before activation,
   ordered Analyze → Build → Validate progress, authoritative evidence, and safe interruption,
   reassignment, resume, cancellation, and terminal cuts.
3. Project accepted assignments into Explore, Build, and Play choreography with a runtime-only
   mission board, evidence holograms, completion response, camera focus, and accessible owner
   controls—without adding a renderer, animation loop, or exportable entity.
4. Keep deterministic protocol, hostile-input, multi-browser, transient/export, resource, mobile,
   reduced-motion, and navigation proof attached to the slice.

### C. Add the co-author command queue — partly shipped

1. **Done.** `src/coauthor-proposal.ts` is the proposal record, built from the existing `actor`,
   `intent`, `expectedRevision`, and typed command list. It adds no second command format:
   accepting is a plain `api.commit()` of the same `AgentWorldCommand[]`, so there is no
   translation layer to drift.
2. **Done.** The card shows actor, intent, command count, touched entity ids in first-touch
   order, the composing revision, and every command as a sentence behind one disclosure.
3. **Accept and reject: done.** Both DOM topics and the physical 3D consoles now compose rather
   than commit, so there is one path from "a human asked" to "the scene changed" and it always
   stops for an answer. Accepting sends the *original* `expectedRevision`, so a world that moved
   while the person was reading refuses the commit instead of applying a decision made against a
   stale view; the panel says so before they press it. Discard touches nothing at all.
   **Editing a proposal is not built** — the person can accept or discard what was composed.
4. **Not started.** Model/provider integration behind an adapter. The center remains fully useful
   with no backend or API key, which is still true: Nestor composes these proposals locally.

Remaining for this slice: proposal editing, and the provider adapter.

## Parallel correctness lane

These are real, bounded tasks. None should block the next AgentX visual slice unless it touches
the same code:

1. **Complete:** harden deploy restart/checksum/listener ordering and verify the real production listener.
2. **Complete:** the mobile Scene Browser/Editor overlap now resolves to one intentional
   Scene, Inspect, or Library surface at a time.
3. **Complete:** code-composed archive courses now snapshot an explicit durable level revision
   when play mounts.
4. Convert old preview harnesses only when their content is being revived; keep the workshop
   dev-only.
5. Reconcile `README.md`, the historical `ROADMAP.md`, and `HANDOFF.md` with current `main`.

## Guardrails that keep this fast

- Do not build a rigged-character pipeline before the scene-native guide proves the interaction
  loop.
- Do not add a second renderer or `requestAnimationFrame`; Nestor uses runtime entities and
  behaviors.
- Do not make live sessions, an LLM, Ollama, or a store mandatory for the front door.
- Do not turn the seventeen preview conversions into a release gate.
- Do not call a chat response an agent action. A Nestor action has an actor, intent, typed
  commands, revision, visible result, and undo path.
- Prefer one impressive vertical slice with browser proof over many disconnected panels.

No product decision is required to start Slice 4. The proposal queue should wrap the existing
`actor`, `intent`, `expectedRevision`, and typed command list, then expose preview, accept,
reject, edit, result, and undo as one visible flow before any model-provider integration is
added.
