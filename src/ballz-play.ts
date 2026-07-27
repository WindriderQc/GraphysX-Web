import { PUSH_DIRECTIONS } from "./ballz-level-scene";
import { describeRun, formatClock, type AgentWorldDefinition, type GraphysXAgentWorldApi } from "./agent-world-runtime";
import { ARCHIVE_BALLZ_LEVELS } from "./archive-ballz-levels";
import {
  LevelRecordStore,
  formatMedal,
  formatRaceTime,
  formatTimeDelta,
  type LevelFinishSummary,
} from "./scoreboard";

/**
 * The thin play layer over a materialised level: arrow keys push the ball, a HUD that renders
 * the run, and a completion panel when the level is won.
 *
 * **This file used to own the rules and no longer does.** It held the win condition in
 * TypeScript and found the pieces by string-matching entity ids — `startsWith("ballz-ring-")`
 * for a pickup, `=== "ballz-finish-gate"` for the goal — so "collect everything, then reach
 * the end" was expressible by exactly one world, was invisible to `export()` and the store,
 * and no agent could read or change it. That is the private code path the invariant forbids,
 * and it is now a `rules` block in the scene document judged by `agent-world-rules.ts`.
 *
 * What is left here is genuinely a *view*: it reads `api.rules.status()` and draws it. The
 * consequence worth noting is that this file no longer knows what BallZ is. Point it at any
 * scene carrying a rules block and a steerable subject and the HUD is correct, which is what
 * makes the World 1 / Great Slide ports a scene each rather than a play layer each.
 *
 * It still owns no scene state: the ball's steering is four `apply-impulse` interactions on
 * the ball itself, so a key press is an ordinary API call an agent could make too.
 */
export type BallzPlayOptions = {
  /**
   * Host-supplied raycast of a client-space point onto the play plane, for mouse aiming.
   * The host owns the camera, so it owns the unprojection; everything this layer *does*
   * with the result is an ordinary `api.steer` call. Returns null when the pointer misses
   * the plane (grazing angles at the horizon).
   */
  screenToGround?: (clientX: number, clientY: number) => [number, number, number] | null;
};

export function mountBallzPlay(
  api: GraphysXAgentWorldApi,
  container: HTMLElement,
  onExit?: () => void,
  options: BallzPlayOptions = {},
): () => void {
  const rules = api.rules.get();
  const players = api.query({ tag: "player" });
  // Rules are the authority: composed courses deliberately use their own subject ids
  // (`spiral-ball`, `world1-ball`, `great-slide-ball`). The old hard-coded `ballz-ball`
  // made every non-grid game enter play mode with no HUD and no controls. A single player
  // is a safe fallback for a rules-light playground; multiple players need an explicit subject.
  const subjectId = rules?.subjectId ?? rules?.spawn?.entityId ?? (players.length === 1 ? players[0]?.id : null);
  const ball = subjectId ? api.query({ ids: [subjectId] })[0] : null;
  // A level with no controllable subject is a layout rather than something to play.
  if (!ball || !subjectId) return () => {};
  const ballId = subjectId;
  // A composed replay reloads the pristine scene so hidden pickups, transforms, velocities,
  // and rules all restart together. Grid levels retain their existing library-backed replay.
  // `world.loaded` mounts this view before the runtime arms the rules block (deliberately: the
  // load event idles the previous run first). Capture on the next microtask so replay includes
  // the just-loaded rules as well as the pristine entity visibility/transforms.
  let pristineDefinition: AgentWorldDefinition | null = null;
  queueMicrotask(() => { pristineDefinition = api.export(); });

  // Self-injecting, so playing works on any route. The editor's stylesheet is loaded lazily and
  // only when someone opens the editor — an agent that calls `levels.play()` on the showroom
  // route would otherwise get a correct but invisible HUD.
  injectStyleOnce();

  // The run is armed by the runtime when the scene loads, so there is nothing to start here
  // and — importantly — no second cursor into the event stream. This layer never reads
  // `events()` at all now, which is what removed its ability to disagree with the runtime
  // about whether you had won.
  const initial = api.rules.status();
  let won = initial?.phase === "complete";

  const hud = document.createElement("div");
  hud.className = "gx-bz-hud";
  const course = document.createElement("div");
  course.className = "gx-bz-course";
  course.textContent = api.state()?.world.label ?? "GraphysX Run";
  const status = document.createElement("div");
  status.className = "gx-bz-status";
  const hint = document.createElement("div");
  hint.className = "gx-bz-hint";
  hint.textContent = (initial?.collectibleCount ?? 0) > 0 ? "collect the rings, then reach the finish" : "arrow keys to roll";
  hud.append(course, status, hint);
  // Play is a place you can leave. Without this the only way out of a game is a page reload,
  // which is the sort of dead end that makes a mode feel like a trap rather than a surface.
  if (onExit) {
    const exit = document.createElement("button");
    exit.type = "button";
    exit.className = "gx-bz-exit";
    exit.textContent = "✕ Exit play";
    exit.addEventListener("click", () => onExit());
    hud.append(exit);
  }
  container.append(hud);

  const renderHud = (): void => {
    const run = api.rules.status();
    if (!run) {
      status.textContent = "roll the ball";
      return;
    }
    const parts = [describeRun(run)];
    // Only when the lap's requirements are met do we say the finish is live — announcing it
    // earlier invites a run straight at a gate that will not count.
    const ringsIn = run.collected.length >= run.collectibleCount;
    const gatesIn = run.checkpointIndex >= run.checkpointCount;
    if (run.phase === "running" && ringsIn && gatesIn && (run.collectibleCount > 0 || run.checkpointCount > 0)) {
      parts.push("finish is open");
    }
    status.textContent = parts.join("  ·  ");
  };
  renderHud();

  // Two control schemes over one subject, chosen by what the SCENE says. A ball carrying a
  // `steering` block gets the two-body fire-arrow model (heading + thrust through
  // `api.steer`); a subject without one — the composed courses' own balls, or a scene
  // authored before steering existed — keeps the four-direction held-key pushes. Arrow keys
  // in both cases, on purpose: the editor already binds W/E/R to gizmo modes and Delete to
  // remove, so WASD would fight it the moment someone plays a level with the editor open.
  const steerable = !!api.query({ ids: [ballId] })[0]?.steering;
  if (steerable) {
    hint.textContent = "← → aim · ↑ roll · ↓ brake · space kick · point & click to launch";
  }
  const teardownControls = steerable
    ? mountSteerControls(api, ballId, container, () => won, options)
    : mountLegacyPushControls(api, ballId, () => won);

  // Poll the *run*, not the stream. 200 ms is a HUD refresh rate, and the run it reads is
  // advanced inside the simulation tick — so unlike the old cursor-into-`events()` version,
  // a slow or backgrounded tab cannot cause this layer to miss a crossing. The worst a lagging
  // poll costs now is a late repaint; it can no longer lose a ring.
  const poll = window.setInterval(() => {
    if (won) return;
    const run = api.rules.status();
    if (run?.phase === "complete") {
      win(run.collectibleCount, run.elapsedSeconds, run.desynced);
      return;
    }
    renderHud();
  }, 200);

  function win(totalRings: number, seconds: number, desynced: boolean): void {
    won = true;
    hud.remove();
    const worldId = api.state()?.world.id ?? "";
    const levelId = worldId.startsWith("ballz-level-") ? worldId.slice("ballz-level-".length) : null;
    const replayDefinition = pristineDefinition;
    const replay = levelId
      ? () => { api.levels.play(levelId); }
      : replayDefinition
        ? () => { void reloadPristineScene(api, replayDefinition); }
        : undefined;
    container.append(buildWinPanel(api, totalRings, seconds, desynced, onExit, replay));
  }

  return () => {
    window.clearInterval(poll);
    teardownControls();
    hud.remove();
    container.querySelector(".gx-bz-win")?.remove();
  };
}

/** Never steal a keystroke from a field — the level workbench is full of them. */
function isFormField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

/**
 * The two-body control scheme (the original BallZ model): ←/→ rotate the fire-arrow, ↑/↓
 * thrust and brake along its heading, Space is the strong kick; the mouse aims the arrow at
 * the ground point under the cursor and a click (or a drag, for power) launches toward it.
 *
 * Everything here is an `api.steer` call, and the calls happen on input EDGES — a keydown,
 * a keyup, a throttled pointer move — never per frame. The continuous work (turn → heading,
 * thrust → force, the per-direction speed cap) is the runtime's steering pass, inside the
 * simulation step, which is exactly what lets an agent drive the identical ball with the
 * identical call and inherit the identical physics.
 */
function mountSteerControls(
  api: GraphysXAgentWorldApi,
  ballId: string,
  container: HTMLElement,
  isWon: () => boolean,
  options: BallzPlayOptions,
): () => void {
  const held = new Set<string>();
  const axisInputs = (): { thrust: number; turn: number } => ({
    thrust: (held.has("ArrowUp") ? 1 : 0) - (held.has("ArrowDown") ? 1 : 0),
    turn: (held.has("ArrowRight") ? 1 : 0) - (held.has("ArrowLeft") ? 1 : 0),
  });
  const sendAxes = (): void => {
    api.steer(ballId, axisInputs());
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (isFormField(event.target)) return;
    if (event.key === " " || event.code === "Space") {
      event.preventDefault();
      // Once per press: OS auto-repeat must not machine-gun the launch impulse.
      if (!event.repeat && !isWon()) api.steer(ballId, { kick: 1 });
      return;
    }
    if (!/^Arrow(Up|Down|Left|Right)$/.test(event.key)) return;
    event.preventDefault();
    if (held.has(event.key) || isWon()) return;
    held.add(event.key);
    sendAxes();
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    if (!held.delete(event.key)) return;
    sendAxes();
  };
  // A defocused tab must not leave a key held: zero every input on blur.
  const onBlur = (): void => {
    held.clear();
    api.steer(ballId, { thrust: 0, turn: 0 });
  };

  // Mouse aim. The heading is computed from the ball's live position to the ground point
  // under the cursor, throttled to ~20 Hz — an aim update is a transaction, and the arrow
  // only needs to track the hand, not the mouse's report rate.
  const AIM_INTERVAL_MS = 50;
  let lastAimAt = 0;
  let aimedHeading: number | null = null;
  const headingToward = (point: [number, number, number]): number | null => {
    const ball = api.query({ ids: [ballId] })[0];
    if (!ball) return null;
    const dx = point[0] - ball.position[0];
    const dz = point[2] - ball.position[2];
    if (dx * dx + dz * dz < 0.04) return null; // pointing at the ball itself is no direction
    return (Math.atan2(dx, -dz) * 180) / Math.PI;
  };
  // Only the WebGL canvas counts: the HUD's buttons and the win panel live in the same
  // container, and a click on "Exit play" must not double as a launch.
  const onSceneCanvas = (event: Event): boolean => event.target instanceof HTMLCanvasElement;
  const onPointerMove = (event: PointerEvent): void => {
    if (!options.screenToGround || isWon() || !onSceneCanvas(event)) return;
    const now = performance.now();
    if (now - lastAimAt < AIM_INTERVAL_MS) return;
    const point = options.screenToGround(event.clientX, event.clientY);
    if (!point) return;
    const heading = headingToward(point);
    if (heading === null) return;
    lastAimAt = now;
    aimedHeading = heading;
    api.steer(ballId, { headingDegrees: heading });
  };

  // Click / drag-for-power launch. Press-to-release distance in CSS pixels maps to kick
  // power: a plain click is a modest chip, a full pull is the cap. Direction is wherever
  // the arrow points at release — the pointer has been aiming it all along.
  let pressedAt: { x: number; y: number } | null = null;
  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !onSceneCanvas(event)) return;
    pressedAt = { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event: PointerEvent): void => {
    const pressed = pressedAt;
    pressedAt = null;
    if (!pressed || isWon() || !onSceneCanvas(event)) return;
    const dragPx = Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y);
    const kick = dragPx < 8 ? 0.55 : Math.min(1, 0.35 + dragPx / 240);
    // Final aim at the release point, when the plane raycast has one; the throttle above
    // may have skipped the last few pixels of the gesture.
    const point = options.screenToGround?.(event.clientX, event.clientY) ?? null;
    const heading = point ? headingToward(point) : aimedHeading;
    api.steer(ballId, { ...(heading !== null && heading !== undefined ? { headingDegrees: heading } : {}), kick });
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  container.addEventListener("pointermove", onPointerMove);
  container.addEventListener("pointerdown", onPointerDown);
  container.addEventListener("pointerup", onPointerUp);
  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    container.removeEventListener("pointermove", onPointerMove);
    container.removeEventListener("pointerdown", onPointerDown);
    container.removeEventListener("pointerup", onPointerUp);
    // Leave nothing thrusting after the layer is gone — the entity outlives the HUD.
    if (held.size > 0) api.steer(ballId, { thrust: 0, turn: 0 });
  };
}

/**
 * The pre-steering scheme, kept for subjects without a `steering` block (composed courses'
 * own balls, older scenes). Steering is HELD-key continuous, not one impulse per OS
 * key-repeat. A press fires one immediate push (responsive, and synchronous for a
 * step-driven agent/test); while the key is held a steer loop keeps pushing. The speed
 * limit is applied PER DIRECTION, not as a global gate: a push is suppressed only when the
 * ball is already fast *along that push's own axis*. A global "if speed >= cap, stop
 * pushing" gate (the obvious version) silently kills braking and turning at speed — the
 * ball hits the cap and then ignores the brake and the steer, which reads as the ball
 * "fighting" the controls. Capping per-axis means the opposing key always brakes and the
 * perpendicular key always turns; only the already-maxed direction stops adding.
 */
function mountLegacyPushControls(api: GraphysXAgentWorldApi, ballId: string, isWon: () => boolean): () => void {
  const pushBy = new Map<string, string>(PUSH_DIRECTIONS.map((direction) => [direction.key, direction.id]));
  const dirById = new Map<string, readonly [number, number, number]>(
    PUSH_DIRECTIONS.map((direction) => [direction.id, direction.vector]),
  );
  const held = new Set<string>();
  const STEER_HZ = 30;
  const SPEED_CAP = 6.5; // m/s along a single axis; the opposing key still brakes past this.
  const pushIfUnderCap = (interactionId: string, velocity: readonly number[] | undefined): void => {
    const dir = dirById.get(interactionId);
    // Velocity component along this push's direction. Braking (opposite) is negative and always
    // allowed; a perpendicular turn is ~0 and always allowed; only an already-fast same-axis
    // push is suppressed.
    const along = dir && velocity ? velocity[0] * dir[0] + velocity[2] * dir[2] : 0;
    if (along < SPEED_CAP) api.interact(ballId, interactionId);
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (isFormField(event.target)) return;
    const interactionId = pushBy.get(event.key);
    if (!interactionId) return;
    event.preventDefault();
    // Fire once on the initial press (not on OS auto-repeat); the held loop keeps accelerating.
    if (!held.has(event.key)) {
      held.add(event.key);
      const velocity = api.query({ ids: [ballId] })[0]?.physics?.linearVelocity;
      pushIfUnderCap(interactionId, velocity);
    }
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    if (pushBy.has(event.key)) held.delete(event.key);
  };
  const onBlur = (): void => held.clear(); // a defocused tab must not leave a key stuck.
  const steer = window.setInterval(() => {
    if (isWon() || held.size === 0) return;
    const velocity = api.query({ ids: [ballId] })[0]?.physics?.linearVelocity;
    for (const key of held) {
      const interactionId = pushBy.get(key);
      if (interactionId) pushIfUnderCap(interactionId, velocity);
    }
  }, 1000 / STEER_HZ);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  return () => {
    window.clearInterval(steer);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
  };
}

/**
 * The completion panel. "Play again" re-materialises the same level: the source level id is
 * recoverable from the world id (`composeBallzLevel` names the world `ballz-level-<id>`), so no
 * caller has to thread it through — the panel reads it back out of the scene it is standing in.
 */
function buildWinPanel(
  api: GraphysXAgentWorldApi,
  totalRings: number,
  seconds: number,
  desynced: boolean,
  onExit?: () => void,
  onReplay?: () => void,
): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "gx-bz-win";

  const title = document.createElement("div");
  title.className = "gx-bz-win-title";
  title.textContent = `✓ ${api.state()?.world.label ?? "Run"} Complete`;

  const sub = document.createElement("div");
  sub.className = "gx-bz-win-sub";
  const summary = totalRings > 0 ? `all ${totalRings} rings · ${formatClock(seconds)}` : `finish reached · ${formatClock(seconds)}`;
  // A time whose evidence had a gap in it is shown, and labelled. Honesty over theatre: the
  // run is still won, but this is not a number to put on a board.
  sub.textContent = desynced ? `${summary} · time unverified (stream gap)` : summary;

  const actions = document.createElement("div");
  actions.className = "gx-bz-win-actions";

  const worldId = api.state()?.world.id ?? "";
  const levelId = worldId.startsWith("ballz-level-") ? worldId.slice("ballz-level-".length) : null;
  const recordId = levelId ?? (worldId || null);

  // The scoreboard finally drawn (ROADMAP Horizon 3 §6): time, medal, best, delta-to-best, fed
  // from the rules run this panel already renders plus the level record store. A desynced run
  // is summarised but never recorded — an unverified time must not become a stored best.
  if (recordId) {
    const store = new LevelRecordStore();
    const elapsedMs = Math.round(seconds * 1000);
    const referenceMs = archiveReferenceMs(recordId);
    const finish = desynced
      ? store.summarize(recordId, elapsedMs, referenceMs)
      : store.registerFinish(recordId, elapsedMs, referenceMs);
    panel.append(title, sub, buildScoreRow(finish), actions);
  } else {
    panel.append(title, sub, actions);
  }
  if (onReplay) {
    const again = document.createElement("button");
    again.type = "button";
    again.className = "gx-bz-win-btn gx-bz-win-again";
    again.textContent = "↻ Play again";
    // Re-materialising/reloading fires world.loaded, which tears down this whole play layer and
    // mounts a fresh one — so the panel does not need a second reset path.
    again.addEventListener("click", onReplay);
    actions.append(again);
  }

  if (onExit) {
    const back = document.createElement("button");
    back.type = "button";
    back.className = "gx-bz-win-btn";
    back.textContent = "← Back to games";
    back.addEventListener("click", () => onExit());
    actions.append(back);
  }

  return panel;
}

/**
 * The medal/best strip inside the win panel. Built with textContent throughout — the level id
 * and any stored strings never pass through innerHTML.
 */
function buildScoreRow(finish: LevelFinishSummary): HTMLElement {
  const row = document.createElement("div");
  row.className = "gx-bz-win-score";

  const stat = (label: string, value: string, extraClass?: string): HTMLElement => {
    const cell = document.createElement("div");
    cell.className = "gx-bz-win-stat";
    const name = document.createElement("span");
    name.className = "gx-bz-win-stat-label";
    name.textContent = label;
    const figure = document.createElement("span");
    figure.className = `gx-bz-win-stat-value${extraClass ? ` ${extraClass}` : ""}`;
    figure.textContent = value;
    cell.append(name, figure);
    return cell;
  };

  row.append(stat("time", formatRaceTime(finish.elapsedMs)));
  // A level with no recovered reference time has no medal scale; showing "—" would read as a
  // failed run rather than an unscored level, so the medal cell only exists when it can judge.
  if (finish.medal) row.append(stat("medal", formatMedal(finish.medal), `gx-bz-medal-${finish.medal}`));
  if (finish.isNewBest) {
    row.append(stat(
      "best",
      finish.previousBestMs === null
        ? `${formatRaceTime(finish.bestMs)} · first clear`
        : `${formatRaceTime(finish.bestMs)} · ${formatTimeDelta(finish.elapsedMs - finish.previousBestMs)}`,
      "gx-bz-win-best",
    ));
  } else if (finish.previousBestMs !== null) {
    row.append(stat("best", `${formatRaceTime(finish.bestMs)} · ${formatTimeDelta(finish.elapsedMs - finish.bestMs)}`));
  } else {
    // A desynced first clear: there is no stored best to measure against, and this run's
    // unverified time never became one, so the cell states the time without inventing a delta.
    row.append(stat("best", formatRaceTime(finish.bestMs)));
  }
  return row;
}

/**
 * The archive's recovered `ScoreBest` for a seeded level, when this run is one of them — the
 * reference the medal scale judges against. Hand-painted levels return null and stay unscored.
 */
function archiveReferenceMs(levelId: string): number | null {
  const level = ARCHIVE_BALLZ_LEVELS.find((entry) => entry.id === levelId);
  const value = level?.provenance.levelListFacts["scoreBestMs"];
  return typeof value === "number" && value > 0 ? value : null;
}

/** Reload a composed course without letting gravity outrun an async exact model collider. */
async function reloadPristineScene(api: GraphysXAgentWorldApi, definition: AgentWorldDefinition): Promise<void> {
  const exactModelIds = definition.entities
    .filter((entity) => entity.type === "model" && entity.physics?.collider && entity.physics.collider !== "auto")
    .map((entity) => entity.id)
    .filter((id): id is string => Boolean(id));
  if (exactModelIds.length > 0) api.pause(true);
  const loaded = api.load(definition);
  if (!loaded.ok) {
    api.pause(false);
    console.error(loaded.error ?? "Could not replay course");
    return;
  }
  if (exactModelIds.length === 0) return;

  const deadline = performance.now() + 20_000;
  try {
    while (performance.now() < deadline) {
      const models = exactModelIds.map((id) => api.query({ ids: [id] })[0]);
      const failed = models.find((entity) => entity?.asset?.status === "error" || entity?.physics?.collider?.error);
      if (failed) throw new Error(failed.asset?.error ?? failed.physics?.collider?.error ?? "Exact collider failed to load");
      if (models.every((entity) => entity?.asset?.status === "ready" && entity.physics?.collider?.effective !== "auto")) return;
      await new Promise((resolve) => window.setTimeout(resolve, 40));
    }
    throw new Error("Timed out while rebuilding the course collider");
  } catch (error) {
    console.error(error);
  } finally {
    api.pause(false);
  }
}

const STYLE_ID = "gx-ballz-play-css";

function injectStyleOnce(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = BALLZ_PLAY_CSS;
  document.head.append(style);
}

const BALLZ_PLAY_CSS = `
/* Top-centre, not bottom-centre. This first shipped at the bottom, where the editor's Library
   panel covered it completely — in the DOM, correctly styled, and invisible. Play mode now
   hides the authoring chrome outright, so there is nothing left to dodge, but the top is still
   the right place for a HUD and a bottom-centre one would break again the moment anything is
   docked there. */
.gx-bz-hud{position:absolute;left:50%;top:18px;transform:translateX(-50%);z-index:6;
  display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none;min-width:270px;
  padding:10px 18px 9px;background:linear-gradient(180deg,rgba(7,22,31,.88),rgba(7,22,31,.66));
  border:1px solid rgba(79,208,230,.28);border-radius:12px;box-shadow:0 12px 34px rgba(0,0,0,.25);
  backdrop-filter:blur(10px);font:12px/1.2 var(--gx-font);text-shadow:0 1px 3px rgba(0,0,0,.75)}
.gx-bz-course{color:var(--gx-accent);font-size:9px;font-weight:700;letter-spacing:.18em;text-transform:uppercase}
.gx-bz-status{color:var(--gx-ink);letter-spacing:.08em;font-size:13px;font-weight:650}
.gx-bz-hint{color:var(--gx-ink-faint);font-size:10px;letter-spacing:.06em}
/* The HUD is pointer-events:none so it never eats a click meant for the scene; the one
   interactive child opts back in. */
.gx-bz-exit{pointer-events:auto;margin-top:4px;background:rgba(10,22,30,.72);border:1px solid var(--gx-accent-glow);
  border-radius:4px;color:var(--gx-ink-soft);cursor:pointer;font:10px/1 var(--gx-font);padding:5px 9px}
.gx-bz-exit:hover{background:rgba(18,40,52,.86);border-color:var(--gx-accent)}
/* The completion panel. Centred and modal-feeling but not a full backdrop — the level you just
   beat stays visible behind it, which is the reward. */
.gx-bz-win{position:absolute;left:50%;top:34%;transform:translate(-50%,-50%);z-index:8;
  display:flex;flex-direction:column;align-items:center;gap:10px;padding:24px 34px;
  background:rgba(9,22,31,.92);border:1px solid rgba(95,224,180,.5);border-radius:16px;
  box-shadow:0 18px 60px rgba(0,0,0,.5);font-family:var(--gx-font);text-align:center}
.gx-bz-win-title{color:var(--gx-life);font-size:26px;font-weight:800;letter-spacing:.04em;
  text-shadow:0 3px 24px rgba(95,224,180,.4)}
.gx-bz-win-sub{color:var(--gx-ink-soft);font-size:13px;letter-spacing:.05em}
/* The scoreboard strip: time / medal / best-with-delta, straight from the level record store. */
.gx-bz-win-score{display:flex;gap:24px;margin-top:2px}
.gx-bz-win-stat{display:flex;flex-direction:column;gap:3px;align-items:center;min-width:64px}
.gx-bz-win-stat-label{font:600 9px/1 var(--gx-font);letter-spacing:.16em;text-transform:uppercase;color:var(--gx-ink-faint)}
.gx-bz-win-stat-value{font:700 15px/1.2 var(--gx-font);color:var(--gx-ink)}
.gx-bz-win-best{color:var(--gx-life)}
.gx-bz-medal-gold{color:#f0c46a;text-shadow:0 0 16px rgba(240,196,106,.45)}
.gx-bz-medal-silver{color:#cdd9e4;text-shadow:0 0 16px rgba(205,217,228,.35)}
.gx-bz-medal-bronze{color:#d8956b;text-shadow:0 0 16px rgba(216,149,107,.35)}
.gx-bz-win-actions{display:flex;gap:10px;margin-top:6px}
.gx-bz-win-btn{cursor:pointer;border-radius:10px;padding:10px 18px;font:600 13px var(--gx-font);
  background:rgba(16,38,50,.9);border:1px solid var(--gx-accent-ring);color:var(--gx-ink-soft)}
.gx-bz-win-btn:hover{background:rgba(24,56,72,.96);border-color:var(--gx-accent)}
.gx-bz-win-again{background:linear-gradient(180deg,#2f9e7f,var(--gx-accent-fill));border-color:var(--gx-life);color:var(--gx-ink)}
.gx-bz-win-again:hover{filter:brightness(1.08)}
@media (max-width:640px){.gx-bz-hud{top:10px;min-width:230px;padding:8px 12px}.gx-bz-status{font-size:11px}}
`;
