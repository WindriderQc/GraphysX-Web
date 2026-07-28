import { PUSH_DIRECTIONS } from "./ballz-level-scene";
import { describeRun, formatClock, type AgentWorldDefinition, type GraphysXAgentWorldApi } from "./agent-world-runtime";
import { archiveReferenceMs, raceRecordIdForWorld } from "./archive-race-records";
import { createPersonalGhostSession, getPersonalGhostState } from "./level-ghosts";
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
  const recordId = raceRecordIdForWorld(api.state()?.world.id ?? "");
  const ghostSession = recordId ? createPersonalGhostSession(api, ballId, recordId) : null;
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
  const lapDigitIds = api.query({ tag: "ballz-lap-digit" }).map((entity) => entity.id);
  let displayedLap = Math.min((initial?.lap ?? 0) + 1, initial?.laps ?? 1);

  const syncLapDisplay = (run: ReturnType<typeof api.rules.status>): void => {
    if (!run || lapDigitIds.length === 0) return;
    const nextLap = Math.min(run.lap + 1, run.laps);
    if (nextLap === displayedLap) return;
    for (const id of lapDigitIds) api.update(id, { visible: id === `ballz-lap-digit-${nextLap}` });
    displayedLap = nextLap;
  };

  const hud = document.createElement("div");
  hud.className = "gx-bz-hud";
  const course = document.createElement("div");
  course.className = "gx-bz-course";
  course.textContent = api.state()?.world.label ?? "GraphysX Run";
  const status = document.createElement("div");
  status.className = "gx-bz-status";
  const hint = document.createElement("div");
  hint.className = "gx-bz-hint";
  const hasGhost = getPersonalGhostState()?.available ?? false;
  const baseHint = (initial?.collectibleCount ?? 0) > 0 ? "collect the rings, then reach the finish" : "arrow keys to roll";
  hint.textContent = `${baseHint}${hasGhost ? " · race your personal ghost" : ""}`;
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
    const ringsIn = run.collected.length >= run.collectibleTarget;
    const gatesIn = run.checkpointIndex >= run.checkpointCount;
    if (run.phase === "running" && ringsIn && gatesIn && (run.collectibleCount > 0 || run.checkpointCount > 0)) {
      parts.push("finish is open");
    }
    status.textContent = parts.join("  ·  ");
    syncLapDisplay(run);
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
    hint.textContent = `← → aim · ↑ roll · ↓ brake · space jump${hasGhost ? " · personal ghost active" : ""}`;
  }
  // The race-start countdown: 3 · 2 · 1 · GO, controls locked until GO, and the run clock
  // re-armed AT go so the time on the board measures driving, not staring at the overlay.
  // A programmatic driver must never be held hostage by presentation, so the countdown
  // cancels itself the moment anything touches the world through the API (a revision bump —
  // a smoke's teleport, an agent's steer) or pauses it (a deterministic harness's first
  // move). A human just watching changes neither, and gets the full ceremony.
  let raceStarted = !steerable;
  let teardownCountdown: (() => void) | null = null;
  if (steerable) {
    teardownCountdown = mountCountdown(api, container, () => {
      raceStarted = true;
    });
  }
  const teardownControls = steerable
    ? mountSteerControls(api, ballId, container, () => won || (!raceStarted && !(api.state()?.paused ?? false)), options)
    : mountLegacyPushControls(api, ballId, () => won);

  // Poll the *run*, not the stream. 200 ms is a HUD refresh rate, and the run it reads is
  // advanced inside the simulation tick — so unlike the old cursor-into-`events()` version,
  // a slow or backgrounded tab cannot cause this layer to miss a crossing. The worst a lagging
  // poll costs now is a late repaint; it can no longer lose a ring.
  const poll = window.setInterval(() => {
    if (won) return;
    const run = api.rules.status();
    if (run && raceStarted) ghostSession?.tick(run.elapsedSeconds * 1000);
    if (run?.phase === "complete") {
      ghostSession?.finish(run.elapsedSeconds * 1000, !run.desynced);
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
    teardownCountdown?.();
    teardownControls();
    ghostSession?.dispose();
    hud.remove();
    container.querySelector(".gx-bz-win")?.remove();
  };
}

/**
 * The 3 · 2 · 1 · GO race start. Purely presentational plus one honest rules effect: at GO
 * the run is re-armed (`rules.reset`) so the clock starts when control does. Cancellation
 * is the load-bearing design: ANY api activity during the countdown — a revision bump from
 * a teleporting smoke, an agent pausing the world to step it — dismisses the overlay
 * immediately, unlocks control, and skips the reset, so every programmatic consumer keeps
 * exactly the behaviour it had before countdowns existed.
 */
function mountCountdown(api: GraphysXAgentWorldApi, container: HTMLElement, onGo: () => void): () => void {
  const meshStages = new Set(api.query({ tag: "ballz-countdown-stage" }).map((entity) => entity.id));
  const expectedStages = ["ballz-countdown-stage-3", "ballz-countdown-stage-2", "ballz-countdown-stage-1", "ballz-countdown-stage-go"];
  const usesRecoveredMeshes = expectedStages.every((id) => meshStages.has(id));
  const overlay = usesRecoveredMeshes ? null : document.createElement("div");
  const digit = usesRecoveredMeshes ? null : document.createElement("div");
  if (overlay && digit) {
    overlay.className = "gx-bz-count";
    digit.className = "gx-bz-count-digit";
    overlay.append(digit);
    container.append(overlay);
  }

  // The revision baseline is taken at the FIRST tick, not at mount: this layer mounts inside
  // the `world.loaded` dispatch, which runs *before* `create()` bumps the world revision, so
  // a mount-time baseline made the loading transaction itself look like agent activity and
  // the countdown self-cancelled on the next tick (box-load dependent, maddeningly flaky).
  // By 800 ms the load's own bump has landed; anything that moves the revision after that
  // really is a programmatic driver.
  let baselineRevision: number | null = null;
  const steps = ["3", "2", "1", "GO!"];
  let index = 0;
  let timer = 0;
  let clearTimer = 0;
  let visibleMeshStage: string | null = null;
  const setMeshStage = (stage: string | null): void => {
    if (!usesRecoveredMeshes || visibleMeshStage === stage) return;
    const wanted = stage ? `ballz-countdown-stage-${stage === "GO!" ? "go" : stage}` : null;
    for (const id of expectedStages) api.update(id, { visible: id === wanted });
    visibleMeshStage = stage;
  };
  const finish = (viaGo: boolean): void => {
    window.clearInterval(timer);
    if (viaGo) {
      // The clock starts when the player does. The subject is still on its spawn (controls
      // were locked), so the reset's respawn is a no-op in space and a fresh start in time.
      api.rules.reset();
      if (digit && overlay) {
        digit.textContent = "GO!";
        overlay.classList.add("gx-bz-count-go");
      }
      setMeshStage("GO!");
      clearTimer = window.setTimeout(() => {
        overlay?.remove();
        setMeshStage(null);
      }, 650);
    } else {
      overlay?.remove();
      setMeshStage(null);
    }
    onGo();
  };
  const show = (): void => {
    const step = steps[index];
    setMeshStage(step);
    if (digit) {
      digit.textContent = step;
      digit.classList.remove("gx-bz-count-pop");
      // Restart the pop animation from frame zero for each digit.
      void digit.offsetWidth;
      digit.classList.add("gx-bz-count-pop");
    }
  };
  show();
  timer = window.setInterval(() => {
    const state = api.state();
    if (state?.paused || (baselineRevision !== null && (state?.revision ?? 0) !== baselineRevision)) {
      finish(false);
      return;
    }
    baselineRevision = state?.revision ?? 0;
    index += 1;
    if (index >= steps.length - 1) {
      finish(true);
      return;
    }
    show();
    // Showing a recovered stage is itself an ordinary API update. Make those known revision
    // bumps the new baseline so the next tick still detects only outside activity.
    baselineRevision = api.state()?.revision ?? baselineRevision;
  }, 800);

  return () => {
    window.clearInterval(timer);
    window.clearTimeout(clearTimer);
    overlay?.remove();
    setMeshStage(null);
  };
}

/** Never steal a keystroke from a field — the level workbench is full of them. */
function isFormField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

/**
 * The two-body control scheme (the original BallZ model): ←/→ rotate the fire-arrow, ↑/↓
 * thrust and brake along its heading, Space is the vertical hop; the mouse aims the arrow
 * at the ground point under the cursor and HOLDING the button rolls toward it — the pointer
 * is the wheel, the held button is the accelerator.
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
      // Once per press: OS auto-repeat must not machine-gun the hop. Straight UP — the
      // original BallZ jump — never along the heading; aiming is the arrow's job.
      if (!event.repeat && !isWon()) api.steer(ballId, { jump: 1 });
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
  let mouseDriving = false;
  // A defocused tab must not leave a key held: zero every input on blur.
  const onBlur = (): void => {
    held.clear();
    mouseDriving = false;
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
    api.steer(ballId, { headingDegrees: heading, ...(mouseDriving ? { thrust: 1 } : {}) });
  };

  // HOLD to roll: while the button is down the ball thrusts toward the pointer — the
  // pointer aims (above) and the held button is the accelerator, exactly like holding ↑
  // with the arrow pinned on the cursor. Release coasts; keyboard thrust state is restored
  // so a player mixing both inputs never has the ball die under a still-held ArrowUp.
  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || isWon() || !onSceneCanvas(event)) return;
    mouseDriving = true;
    const point = options.screenToGround?.(event.clientX, event.clientY) ?? null;
    const heading = point ? headingToward(point) : aimedHeading;
    api.steer(ballId, { ...(heading !== null && heading !== undefined ? { headingDegrees: heading } : {}), thrust: 1 });
  };
  const onPointerUp = (): void => {
    if (!mouseDriving) return;
    mouseDriving = false;
    api.steer(ballId, axisInputs());
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
    if (held.size > 0 || mouseDriving) api.steer(ballId, { thrust: 0, turn: 0 });
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

  const recordId = raceRecordIdForWorld(api.state()?.world.id ?? "");

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
/* The race-start countdown. Centre of the arena view, never blocking a click (the scene is
   locked anyway), digits popping like a starting light. GO flashes green and fades. */
.gx-bz-count{position:absolute;inset:0;z-index:7;display:flex;align-items:center;justify-content:center;
  pointer-events:none}
.gx-bz-count-digit{font:800 120px/1 var(--gx-font);color:#ffcf6a;letter-spacing:.06em;
  text-shadow:0 6px 40px rgba(255,122,26,.65),0 2px 6px rgba(0,0,0,.8)}
.gx-bz-count-pop{animation:gx-bz-pop .78s ease-out}
.gx-bz-count-go .gx-bz-count-digit{color:#7df0c8;text-shadow:0 6px 46px rgba(95,224,180,.7),0 2px 6px rgba(0,0,0,.8);
  animation:gx-bz-go .6s ease-out forwards}
@keyframes gx-bz-pop{0%{transform:scale(1.7);opacity:0}25%{transform:scale(1);opacity:1}100%{transform:scale(.94);opacity:.9}}
@keyframes gx-bz-go{0%{transform:scale(.8);opacity:1}100%{transform:scale(1.5);opacity:0}}
`;
