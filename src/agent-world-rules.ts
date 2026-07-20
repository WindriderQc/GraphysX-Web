import type {
  AgentWorldEventPage,
  AgentWorldStreamEvent,
  AgentWorldVector3,
} from "./agent-world-runtime";

/**
 * The rules layer: what a crossing *means*.
 *
 * `physics.mode: "trigger"` deliberately stops at observation — it reports that something
 * entered a volume and refuses to say whether that was a lap, a pickup or a win. This module
 * is the layer the runtime was refusing to be. It turns a stream of `trigger.enter` events
 * into a run: a spawn point, an ordered checkpoint sequence, banked laps, an elapsed clock,
 * and a finish condition.
 *
 * ## Decision 1 — rules live IN the scene document
 *
 * `rules` is a top-level key on `graphysx.agent-world/v2`, not a sibling document under some
 * `graphysx.agent-level/v1` schema. Three reasons, in order of weight:
 *
 * 1. **The store broadcasts scene documents.** `server/scene-store.mjs` versions, guards and
 *    SSE-broadcasts one thing: the v2 document. Rules kept *beside* it would need their own
 *    revision counter, their own 409 conflict guard and their own broadcast channel — and
 *    until all three existed, a human and an agent editing the same course would not be
 *    editing the same rules. The whole shared-scene property would silently not apply to the
 *    half of the scene that decides who won.
 * 2. **No world gets a private code path.** A course's win condition as *data* is editable by
 *    `api.rules.set`, by the agent tool, by a text editor, and it survives export→load like
 *    any other field. As *code* it would be another `ballz-play.ts` — which is exactly the
 *    thing this replaces (see below).
 * 3. **It costs almost nothing.** `validateWorldDefinition` is allowlist-free, so an unknown
 *    top-level key was already tolerated; only the three places that *rebuild* the document
 *    literal (`exportDefinition`, `exportDocument`, `loadDefinition`) had to learn to carry it.
 *
 * The honest counter-argument, recorded rather than waved away: rules are not geometry, and a
 * scene that is pure scenery now carries an optional key it will never use. That is a real
 * smell, and the mitigation is that `rules` is optional and absent by default — a showroom
 * document is byte-identical to what it was before this landed.
 *
 * ## Decision 2 — `dropped` is honoured, and honoured *honestly*
 *
 * `api.events(since)` returns `dropped: true` when the requested sequence aged out of the
 * 512-entry ring. That is not hypothetical here: `api.step(30)` runs 1800 substeps in one
 * call, and a course with a dozen triggers can emit well past 512 events inside it.
 *
 * What a drop costs is asymmetric, and the evaluator treats it that way:
 *
 * - **Collectibles are recoverable.** A collected ring hides itself through its own
 *   `toggle-visibility` interaction, so "which rings are gone" is a fact about the *world*,
 *   not about the event history. On a drop we re-derive the collected set from a snapshot.
 * - **Laps and the checkpoint index are not.** Nothing in world state records that you
 *   crossed gate 3. They can only ever be *under*-counted by a drop, never over-counted.
 *
 * So the run continues with the counters it has, and is permanently marked `desynced` with a
 * `resyncs` tally. It does not silently pretend the number is good, and it does not throw the
 * player's progress away for a buffer hiccup either. A desynced run's time is not a time you
 * would put on a leaderboard, and `status()` says so rather than leaving the caller to guess.
 *
 * The alternative considered and rejected: subscribing via `runtime.subscribeEvents`, which
 * cannot drop at all. It would have made this problem disappear — and with it the ability of
 * an *out-of-process* agent to run the same evaluator, since a push subscription does not
 * cross a process boundary. Polling `events(since)` is the transport every consumer shares,
 * so the drop path is real code on the real path rather than a branch nothing reaches.
 *
 * ## Shape
 *
 * Everything below is a pure reducer over `(status, rules, page) -> status`. No Three.js, no
 * DOM, no runtime handle. That is what lets the same evaluator be driven by the runtime's own
 * tick, by a HUD polling at 200 ms, by a smoke stepping deterministically, and by an agent
 * polling `events()` over the bridge from another process — one definition of "a lap", not
 * four.
 */

export const GRAPHYSX_AGENT_RULES_SCHEMA = "graphysx.agent-rules/v1" as const;
export const GRAPHYSX_AGENT_RUN_SCHEMA = "graphysx.agent-run/v1" as const;

export const GRAPHYSX_AGENT_RULES_CAPABILITIES = [
  "rules.spawn",
  "rules.checkpoints",
  "rules.laps",
  "rules.timer",
  "rules.finish",
  "rules.collectibles",
  "rules.resync",
] as const;

/** An ordered gate. Crossing it only counts when it is the one that is next due. */
export type AgentWorldCheckpointRule = {
  triggerId: string;
  label?: string;
};

export type AgentWorldRulesDefinition = {
  schema: typeof GRAPHYSX_AGENT_RULES_SCHEMA;
  /**
   * Whose crossings count. Absent means any mover, which is right for a co-op collection
   * scene and wrong for a race — so a course sets it to the ball/car.
   */
  subjectId?: string;
  /**
   * Where a run begins. `entityId` is what gets put back on reset; `position` overrides the
   * entity's authored transform (a course whose start line is not where the model sits).
   */
  spawn?: { entityId: string; position?: AgentWorldVector3 };
  /**
   * Ordered gates for one lap. Out-of-order crossings are ignored rather than rejected —
   * reversing into gate 2 after gate 3 is a thing players do, and it should be a no-op, not
   * a fault. Cutting the course simply never advances the index, so the lap never banks.
   */
  checkpoints?: AgentWorldCheckpointRule[];
  /**
   * Order-free pickups. `tag` resolves against the scene at arm time (BallZ tags its rings
   * `collectible`); `triggerIds` pins an explicit set. When `requiredToFinish` is true — the
   * default when any are declared — the finish will not bank a lap until all are in, which
   * is what stops the rings being scenery you can drive past.
   */
  collectibles?: { triggerIds?: string[]; tag?: string; requiredToFinish?: boolean };
  /** The lap line. Crossing it with the lap's requirements met banks the lap. */
  finish?: { triggerId: string };
  /** Laps required to complete. Defaults to 1, which is the plain "reach the end" case. */
  laps?: number;
  /** `limitSeconds` expires the run; absent means the clock only measures. */
  timer?: { limitSeconds?: number };
};

export type AgentWorldRunPhase = "idle" | "running" | "complete" | "expired";

export type AgentWorldRunStatus = {
  schema: typeof GRAPHYSX_AGENT_RUN_SCHEMA;
  phase: AgentWorldRunPhase;
  /** Simulation time the run was armed at, so elapsed inherits pause/step for free. */
  startedAtSeconds: number;
  elapsedSeconds: number;
  /** Laps banked, and laps required. */
  lap: number;
  laps: number;
  /** Ordered gates cleared *this lap*, and how many the lap needs. */
  checkpointIndex: number;
  checkpointCount: number;
  /** The gate that is next due, so a HUD can point at it. */
  nextCheckpointId: string | null;
  collected: string[];
  /**
   * The pickup set, resolved once at arm time and carried on the run.
   *
   * This is not redundant with the rules block: `collectibles.tag` is late-bound against the
   * scene, so "which ids are pickups" is a question only the armed run can answer. An earlier
   * cut tried to answer it per-event by asking "is this trigger not a gate and not the
   * finish?", which counted every fire tile in the level as a ring.
   */
  collectibleIds: string[];
  collectibleCount: number;
  /** How the run ended, when it has. */
  outcome: "complete" | "timeout" | null;
  /** The stream cursor to hand back to `events()`. */
  sequence: number;
  /**
   * True once a `dropped` page forced a rebuild. Sticky for the life of the run: a time that
   * had a gap in its evidence does not become trustworthy again later.
   */
  desynced: boolean;
  resyncs: number;
};

/**
 * What the evaluator needs from the world to rebuild after a drop, and to resolve a
 * `collectibles.tag` at arm time. Passed in rather than read, so this module stays free of a
 * runtime handle and can be driven across a process boundary.
 */
export type AgentWorldRulesSnapshot = {
  nowSeconds: number;
  /** Every entity the rules might care about: `{ id, visible, tags }`. */
  entities: { id: string; visible: boolean; tags: readonly string[] }[];
};

export function isRulesDefinition(value: unknown): value is AgentWorldRulesDefinition {
  return Boolean(value) && (value as AgentWorldRulesDefinition).schema === GRAPHYSX_AGENT_RULES_SCHEMA;
}

/**
 * Validate on the way in, so a malformed block fails at `create`/`set` with a sentence rather
 * than producing a run that quietly never completes. Every reference must resolve to an
 * entity that exists — a checkpoint pointing at a typo'd id is the single most likely way to
 * author an unwinnable course, and it is invisible at runtime otherwise.
 */
export function validateRules(rules: AgentWorldRulesDefinition, knownIds: ReadonlySet<string>): void {
  if (rules.schema !== GRAPHYSX_AGENT_RULES_SCHEMA) {
    throw new Error(`Rules schema must be ${GRAPHYSX_AGENT_RULES_SCHEMA}`);
  }
  const require = (id: string, what: string): void => {
    if (!knownIds.has(id)) throw new Error(`Rules ${what} references unknown entity: ${id}`);
  };
  if (rules.subjectId) require(rules.subjectId, "subject");
  if (rules.spawn) require(rules.spawn.entityId, "spawn");
  if (rules.finish) require(rules.finish.triggerId, "finish");
  for (const checkpoint of rules.checkpoints ?? []) require(checkpoint.triggerId, "checkpoint");
  for (const id of rules.collectibles?.triggerIds ?? []) require(id, "collectible");

  const seen = new Set<string>();
  for (const checkpoint of rules.checkpoints ?? []) {
    // A repeated gate in the ordered set would need the subject to cross the same volume
    // twice without leaving it, which AABB occupancy makes impossible — the second crossing
    // never fires and the lap deadlocks. Better to refuse the authoring than to ship a
    // course that cannot be finished.
    if (seen.has(checkpoint.triggerId)) throw new Error(`Rules repeat checkpoint: ${checkpoint.triggerId}`);
    seen.add(checkpoint.triggerId);
  }
  if (rules.laps !== undefined && (!Number.isFinite(rules.laps) || rules.laps < 1)) {
    throw new Error("Rules laps must be a positive number");
  }
  if (rules.timer?.limitSeconds !== undefined && !(rules.timer.limitSeconds > 0)) {
    throw new Error("Rules timer limitSeconds must be a positive number");
  }
  if (!rules.finish && !rules.checkpoints?.length && !rules.collectibles) {
    // A block with a spawn and a clock and nothing to reach is almost certainly a half-typed
    // course rather than an intent. Say so now.
    throw new Error("Rules need at least a finish, a checkpoint or a collectible to be reachable");
  }
}

/** Resolve the collectible set against the scene — `tag` is late-bound on purpose. */
function resolveCollectibles(rules: AgentWorldRulesDefinition, snapshot: AgentWorldRulesSnapshot): string[] {
  const ids = new Set(rules.collectibles?.triggerIds ?? []);
  const tag = rules.collectibles?.tag;
  if (tag) for (const entity of snapshot.entities) if (entity.tags.includes(tag)) ids.add(entity.id);
  return [...ids];
}

/**
 * Which pickups the *world* says are already gone.
 *
 * Shared by arming and resyncing, and it is arming that needed it. Starting a run with an
 * empty collected set looks obviously right and is wrong the moment the run is re-armed on a
 * course that has already been played: `rules.reset()` would hand back a run needing every
 * ring, in a scene whose rings are hidden and can never be crossed again — an unwinnable
 * course produced by the reset button. A pickup that is no longer in the world is taken,
 * whoever took it and whenever.
 */
function alreadyTaken(collectibleIds: readonly string[], snapshot: AgentWorldRulesSnapshot): string[] {
  const wanted = new Set(collectibleIds);
  return snapshot.entities.filter((entity) => wanted.has(entity.id) && !entity.visible).map((entity) => entity.id);
}

/**
 * Arm a run. Simulation time, not wall clock: a paused world's timer does not advance, and
 * `step()` advances it exactly as much as it stepped.
 */
export function armRun(
  rules: AgentWorldRulesDefinition,
  snapshot: AgentWorldRulesSnapshot,
  sequence: number,
): AgentWorldRunStatus {
  const checkpoints = rules.checkpoints ?? [];
  const collectibles = resolveCollectibles(rules, snapshot);
  return {
    schema: GRAPHYSX_AGENT_RUN_SCHEMA,
    phase: "running",
    startedAtSeconds: snapshot.nowSeconds,
    elapsedSeconds: 0,
    lap: 0,
    laps: Math.max(1, Math.floor(rules.laps ?? 1)),
    checkpointIndex: 0,
    checkpointCount: checkpoints.length,
    nextCheckpointId: checkpoints[0]?.triggerId ?? null,
    collected: alreadyTaken(collectibles, snapshot),
    collectibleIds: collectibles,
    collectibleCount: collectibles.length,
    outcome: null,
    sequence,
    desynced: false,
    resyncs: 0,
  };
}

/** Whether the lap's requirements are met, so crossing the finish would bank it. */
function lapIsReady(status: AgentWorldRunStatus, rules: AgentWorldRulesDefinition): boolean {
  if (status.checkpointIndex < status.checkpointCount) return false;
  const required = rules.collectibles?.requiredToFinish ?? Boolean(rules.collectibles);
  if (required && status.collected.length < status.collectibleCount) return false;
  return true;
}

/**
 * Fold one page of events into the run.
 *
 * Deliberately takes the whole {@link AgentWorldEventPage} rather than a bare event array, so
 * the `dropped` flag cannot be dropped on the floor by a caller that only wanted the events.
 * That was the first version's shape and it made honouring the flag opt-in — which for a flag
 * whose entire job is to be noticed is the wrong default.
 */
export function advanceRun(
  status: AgentWorldRunStatus,
  rules: AgentWorldRulesDefinition,
  page: AgentWorldEventPage,
  snapshot: AgentWorldRulesSnapshot,
): AgentWorldRunStatus {
  let next: AgentWorldRunStatus = { ...status, collected: [...status.collected], sequence: page.sequence };

  if (page.dropped) next = resyncRun(next, rules, snapshot);

  // A finished run still tracks its cursor (so a later resume is not instantly stale) but
  // stops interpreting crossings — a victory lap is not a second lap.
  if (next.phase === "running") {
    for (const event of page.events) next = applyEvent(next, rules, event);
    next.elapsedSeconds = Math.max(0, snapshot.nowSeconds - next.startedAtSeconds);

    const limit = rules.timer?.limitSeconds;
    if (next.phase === "running" && limit !== undefined && next.elapsedSeconds >= limit) {
      next.phase = "expired";
      next.outcome = "timeout";
      next.elapsedSeconds = limit;
    }
  }

  return next;
}

function applyEvent(
  status: AgentWorldRunStatus,
  rules: AgentWorldRulesDefinition,
  event: AgentWorldStreamEvent,
): AgentWorldRunStatus {
  // A world reload replaces every entity under the run's feet. Continuing to count into it
  // would attribute the next scene's crossings to this scene's lap.
  if (event.type === "world.loaded") return { ...status, phase: "idle" };
  if (event.type !== "trigger.enter") return status;

  const triggerId = String(event.data?.triggerId ?? "");
  const entityId = String(event.data?.entityId ?? "");
  if (!triggerId) return status;
  if (rules.subjectId && entityId !== rules.subjectId) return status;

  const next: AgentWorldRunStatus = { ...status };

  // Collectibles first: a tile can be both a pickup and the last gate, and taking the pickup
  // before judging the gate is what lets a single volume close out a lap.
  //
  // Membership is tested against the set resolved at arm time, never re-derived per event.
  // A `Set` is not used because the status has to stay JSON — it crosses `postMessage` and
  // the bridge, and a Set would arrive as `{}`.
  if (next.collectibleIds.includes(triggerId) && !next.collected.includes(triggerId)) {
    next.collected = [...next.collected, triggerId];
  }

  const checkpoints = rules.checkpoints ?? [];
  const due = checkpoints[next.checkpointIndex];
  if (due && due.triggerId === triggerId) {
    next.checkpointIndex += 1;
    next.nextCheckpointId = checkpoints[next.checkpointIndex]?.triggerId ?? null;
  }

  if (rules.finish && rules.finish.triggerId === triggerId && lapIsReady(next, rules)) {
    next.lap += 1;
    if (next.lap >= next.laps) {
      next.phase = "complete";
      next.outcome = "complete";
    } else {
      // A new lap re-arms the ordered set. Collectibles are not re-required — a ring you
      // took on lap 1 stays taken, because the ring itself is hidden and there is nothing
      // left in the world to cross.
      next.checkpointIndex = 0;
      next.nextCheckpointId = checkpoints[0]?.triggerId ?? null;
    }
  }

  return next;
}

/**
 * Rebuild what the world still knows after a `dropped` page, and mark what it does not.
 *
 * The asymmetry is the whole point. Collection is expressed *in the scene* — a taken ring has
 * `visible: false`, because collecting one is the ring running its own `toggle-visibility` on
 * itself — so the collected set is recoverable exactly and is recovered here. A lap and a
 * checkpoint index live nowhere but in the history that just aged out, so they are kept as-is
 * (they can only be under-counted) and the run is flagged.
 *
 * Sticky by design: `desynced` is never cleared except by re-arming. A run whose evidence had
 * a hole in it does not get to look clean again three laps later.
 */
export function resyncRun(
  status: AgentWorldRunStatus,
  rules: AgentWorldRulesDefinition,
  snapshot: AgentWorldRulesSnapshot,
): AgentWorldRunStatus {
  const collectibles = resolveCollectibles(rules, snapshot);
  const collected = alreadyTaken(collectibles, snapshot);
  // Union rather than replace: a collectible that does not hide itself when taken is not
  // recoverable from the snapshot, and forgetting one we had already banked would turn a
  // resync into a regression.
  for (const id of status.collected) if (!collected.includes(id)) collected.push(id);
  return {
    ...status,
    collected,
    collectibleIds: collectibles,
    collectibleCount: collectibles.length,
    desynced: true,
    resyncs: status.resyncs + 1,
  };
}

/** A short line a HUD can render without re-deriving the rules. */
export function describeRun(status: AgentWorldRunStatus): string {
  const parts: string[] = [];
  // "3 / 8 collected", not a bare "3 / 8". This layer no longer knows the pickups are rings,
  // but a fraction with no noun beside a clock reads as another time value — which is exactly
  // how it looked on screen once the BallZ HUD started rendering from here.
  if (status.collectibleCount > 0) parts.push(`${status.collected.length} / ${status.collectibleCount} collected`);
  if (status.checkpointCount > 0) parts.push(`gate ${status.checkpointIndex} / ${status.checkpointCount}`);
  if (status.laps > 1) parts.push(`lap ${Math.min(status.lap + 1, status.laps)} / ${status.laps}`);
  parts.push(formatClock(status.elapsedSeconds));
  if (status.desynced) parts.push("~resynced");
  return parts.join("  ·  ");
}

export function formatClock(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  return `${minutes}:${rest < 10 ? "0" : ""}${rest.toFixed(2)}`;
}
