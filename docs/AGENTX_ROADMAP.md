# AgentX Center roadmap

*Truth reset: 2026-08-04. Baseline was clean `main` at `64af273`; this document includes the
current local AgentX Center slice. [PRODUCT_SPEC.md](../PRODUCT_SPEC.md) remains the product
contract. This is the execution order.*

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

Still needs external proof:

- The real production host must show port 8788 bound only to loopback. Repository defaults are
  loopback-safe, but browser health cannot prove the listener address.
- The deploy workflow should advance `.server-checksum` only after restart and a failing
  loopback-listener check. This is a bounded ops hardening task, separate from AgentX product
  work.

## Execution order

| Slice | Outcome | Done when |
|---|---|---|
| 1. Nestor's first demo | AgentX Center replaces the passive showroom | Build/Play/Explore are attributed, visible, persistent, editor-ready, and browser-tested |
| 2. Live presence binding | A connected AgentX actor visibly inhabits the center | Session member/operation events update an ephemeral avatar and Nestor activity without polluting saved scene JSON |
| 3. Guided co-authoring | A human can ask for a bounded scene change and inspect it before/after | Proposal, actor, intent, command set, result, undo, and rejection are all visible; no hidden mutation |
| 4. Nestor tours | Nestor can sequence highlights across scenes and games | Camera cues, short narration, entity highlighting, cancellation, reduced-motion behavior, and destination handoff are deterministic |
| 5. Agent gameplay | AgentX can demonstrate and coach a BallZ course inside the product | A deterministic baseline run, ghost comparison, attributed input, and honest capability/offline states are visible in-browser |
| 6. Center expansion | The front door becomes a compact world hub | Build lab, living-systems overlook, play arena, and portals share one performance budget and remain editable scene vocabulary |

## Next three work sessions

### A. Ship the first center slice

1. Keep the current Nestor composition and accessible panel visually polished at desktop and
   narrow widths.
2. Run typecheck, build, the extended showroom smoke, required game-client automation, and the
   release gate.
3. Review the local diff, then commit/push/deploy only when explicitly requested.

### B. Bind real AgentX presence

1. Map `LiveSessionEvents.onMembers` and `onOperation` into a small presence controller.
2. Spawn one `ephemeral: true` agent avatar per online agent actor, keyed by actor id.
3. Illuminate Nestor and show the accepted intent when an agent operation lands.
4. Remove avatars on disconnect; never export them or create a second animation loop.
5. Extend `smoke-live-sessions-browser.mjs` with presence, operation, reconnect, and cleanup
   assertions.

### C. Add the co-author command queue

1. Define a proposal record around the existing `actor`, `intent`, `expectedRevision`, and typed
   command list.
2. Show a concise preview: affected entity ids, command count, and expected revision.
3. Let the human accept, reject, or edit the proposal; accepted work uses `api.commit()` and
   existing undo.
4. Keep model/provider integration behind an adapter. The center remains fully useful with no
   backend or API key.

## Parallel correctness lane

These are real, bounded tasks. None should block the next AgentX visual slice unless it touches
the same code:

1. Harden deploy restart/checksum/listener ordering and verify the real production listener.
2. Fix the Scene Browser/Editor INSPECTOR overlap.
3. Give code-composed archive courses a durable explicit result-version signal.
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

No product decision is required to start Slice 2. The existing live-session actor model,
ephemeral entity flag, commit attribution, and Nestor stage provide the seams.
