import { PUSH_DIRECTIONS } from "./ballz-level-scene";
import { coachProgramFor, describeCoachRun, runCoachProgram } from "./agent-coach";
import { describeRun, formatClock, type AgentWorldDefinition, type GraphysXAgentWorldApi } from "./agent-world-runtime";
import { archiveReferenceMs, raceRecordIdForWorld } from "./archive-race-records";
import { createPersonalGhostSession, getPersonalGhostState, type GhostTrace } from "./level-ghosts";
import { buildLeaderboardPanel } from "./leaderboard-panel";
import {
  courseVersionFor,
  fetchGhost,
  fetchLeaderboard,
  resultsActorId,
  resultsCanSubmit,
  resultsConfigured,
  submitResult,
} from "./results-client";
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

type PlayControlMode = "auto" | "keyboard" | "touch" | "gamepad";
const PLAY_PREFERENCES_KEY = "graphysx.play.preferences.v1";

function readPlayControlMode(): PlayControlMode {
  try {
    const value = JSON.parse(window.localStorage.getItem(PLAY_PREFERENCES_KEY) ?? "null") as { controlMode?: unknown } | null;
    if (value?.controlMode === "keyboard" || value?.controlMode === "touch" || value?.controlMode === "gamepad") return value.controlMode;
  } catch { /* local preferences are optional */ }
  return "auto";
}

function writePlayControlMode(controlMode: PlayControlMode): void {
  try { window.localStorage.setItem(PLAY_PREFERENCES_KEY, JSON.stringify({ controlMode })); } catch { /* optional */ }
}

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
  const worldId = api.state()?.world.id ?? "";
  const recordId = raceRecordIdForWorld(worldId);
  // Snapshot the durable library revision when this materialisation begins. Runtime world
  // revisions count play interactions and are unrelated, while a post-finish lookup could
  // mislabel this run if somebody edited the grid while it was being played.
  const courseRevision = recordId && worldId.startsWith("ballz-level-")
    ? api.levels.get(recordId)?.revision ?? null : null;
  // A "Race" click on the leaderboard parks the rival's trace here and reloads the level;
  // this view is mounted fresh by `world.loaded`, so the handoff cannot be a local variable.
  const challenge = recordId ? takeGhostChallenge(recordId) : null;
  const ghostSession = recordId
    ? createPersonalGhostSession(api, ballId, recordId, {
      challenger: challenge?.trace ?? null,
      challengerLabel: challenge?.label ?? null,
    })
    : null;
  // A composed replay reloads the pristine scene so hidden pickups, transforms, velocities,
  // and rules all restart together. Grid levels retain their existing library-backed replay.
  // `world.loaded` mounts this view before the runtime arms the rules block (deliberately: the
  // load event idles the previous run first). Capture on the next microtask so replay includes
  // the just-loaded rules as well as the pristine entity visibility/transforms.
  let pristineDefinition: AgentWorldDefinition | null = null;
  queueMicrotask(() => { pristineDefinition = api.export(); });
  let menuPaused = false;
  let controlMode = readPlayControlMode();
  container.dataset.gxControlMode = controlMode;

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
  const actions = document.createElement("div");
  actions.className = "gx-bz-hud-actions";
  const controlSelect = document.createElement("select");
  controlSelect.className = "gx-bz-control-mode";
  controlSelect.setAttribute("aria-label", "Preferred play controls");
  controlSelect.title = "Preferred play controls (all connected inputs remain available)";
  for (const [value, label] of [["auto", "Controls: Auto"], ["keyboard", "Keyboard + mouse"], ["touch", "Touch controls"], ["gamepad", "Gamepad"]] as const) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    controlSelect.append(option);
  }
  controlSelect.value = controlMode;
  // News from the agent's own run, if it just took one. Held rather than written straight into
  // `hint`, because `updateHint` rewrites that line whenever the control mode changes — and
  // then dropped the moment the player asks for the control help by changing modes, so the
  // agent's news cannot squat on the only line that tells you which keys to press.
  let coachNote = recordId ? takeCoachNote(recordId) : null;
  const updateHint = (): void => {
    if (coachNote) { hint.textContent = coachNote; return; }
    const suffix = hasGhost ? " · personal ghost active" : "";
    const modeHint = controlMode === "gamepad"
      ? "left stick aim/roll · A jump"
      : controlMode === "touch"
        ? "touch arrows to aim/roll · jump button"
        : steerable
          ? "← → aim · ↑ roll · ↓ brake · space jump"
          : "arrow keys to roll";
    hint.textContent = `${modeHint}${suffix}`;
  };
  controlSelect.addEventListener("change", () => {
    controlMode = controlSelect.value as PlayControlMode;
    container.dataset.gxControlMode = controlMode;
    writePlayControlMode(controlMode);
    coachNote = null;
    updateHint();
  });
  const pauseButton = document.createElement("button");
  pauseButton.type = "button";
  pauseButton.className = "gx-bz-action gx-bz-pause-toggle";
  pauseButton.textContent = "Ⅱ Pause";
  const fullscreenButton = document.createElement("button");
  fullscreenButton.type = "button";
  fullscreenButton.className = "gx-bz-action gx-bz-fullscreen";
  fullscreenButton.textContent = "⛶ Fullscreen";
  const syncFullscreen = (): void => { fullscreenButton.textContent = document.fullscreenElement ? "⛶ Window" : "⛶ Fullscreen"; };
  fullscreenButton.addEventListener("click", () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void container.requestFullscreen().catch(() => { hint.textContent = "Fullscreen is unavailable in this browser"; });
  });
  document.addEventListener("fullscreenchange", syncFullscreen);
  actions.append(controlSelect, pauseButton, fullscreenButton);

  // Racing the agent, but only on a course it has actually driven. A button offering a
  // baseline that does not exist would be the coach guessing, which is the one thing this
  // whole layer is built not to do — so on an uncoached course there is simply no button.
  const playableLevelId = worldId.startsWith("ballz-level-") ? worldId.slice("ballz-level-".length) : null;
  if (recordId && playableLevelId && coachProgramFor(recordId)) {
    const agentButton = document.createElement("button");
    agentButton.type = "button";
    agentButton.className = "gx-bz-action gx-bz-race-agent";
    agentButton.dataset.gxRaceAgent = recordId;
    agentButton.textContent = "◈ Race AgentX";
    agentButton.title = "AgentX drives this course through the same controls you use, then you race its ghost";
    agentButton.addEventListener("click", () => {
      // Disabled rather than removed: this element is about to be torn down by the reload, and
      // a second click in the meantime would start a second agent run over the first one.
      agentButton.disabled = true;
      hint.textContent = "AgentX is driving…";
      void raceTheAgent(api, recordId, playableLevelId);
    });
    actions.append(agentButton);
  }
  hud.append(course, status, hint, actions);
  // Play is a place you can leave. Without this the only way out of a game is a page reload,
  // which is the sort of dead end that makes a mode feel like a trap rather than a surface.
  if (onExit) {
    const exit = document.createElement("button");
    exit.type = "button";
    exit.className = "gx-bz-exit";
    exit.textContent = "✕ Exit play";
    exit.addEventListener("click", () => onExit());
    actions.append(exit);
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
  updateHint();

  const pauseOverlay = buildPauseMenu();
  container.append(pauseOverlay);
  const setMenuPaused = (paused: boolean): void => {
    if (won || menuPaused === paused) return;
    menuPaused = paused;
    api.pause(paused);
    if (paused && steerable) api.steer(ballId, { thrust: 0, turn: 0 });
    const playChrome = [hud, ...container.querySelectorAll<HTMLElement>(".gx-bz-touch")];
    for (const element of playChrome) element.inert = paused;
    pauseOverlay.hidden = !paused;
    pauseButton.textContent = paused ? "▶ Resume" : "Ⅱ Pause";
    if (paused) {
      queueMicrotask(() => pauseOverlay.querySelector<HTMLButtonElement>('[data-gx-pause-action="resume"]')?.focus());
    } else {
      pauseButton.focus();
    }
  };
  const restart = (): void => {
    setMenuPaused(false);
    const worldId = api.state()?.world.id ?? "";
    const levelId = worldId.startsWith("ballz-level-") ? worldId.slice("ballz-level-".length) : null;
    if (levelId) api.levels.play(levelId);
    else if (pristineDefinition) void reloadPristineScene(api, pristineDefinition);
  };
  function buildPauseMenu(): HTMLElement {
    const overlay = document.createElement("div");
    overlay.className = "gx-bz-pause";
    overlay.hidden = true;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Game paused");
    const panel = document.createElement("div");
    panel.className = "gx-bz-pause-panel";
    const title = document.createElement("strong");
    title.textContent = "Paused";
    const subtitle = document.createElement("span");
    subtitle.textContent = "The simulation and race clock are stopped.";
    const resume = document.createElement("button");
    resume.type = "button";
    resume.textContent = "▶ Resume";
    resume.dataset.gxPauseAction = "resume";
    resume.addEventListener("click", () => setMenuPaused(false));
    const again = document.createElement("button");
    again.type = "button";
    again.textContent = "↻ Restart course";
    again.dataset.gxPauseAction = "restart";
    // The menu is constructed before `restart` is initialised; defer the lookup to the click.
    again.addEventListener("click", () => restart());
    panel.append(title, subtitle, resume, again);
    if (onExit) {
      const exit = document.createElement("button");
      exit.type = "button";
      exit.textContent = "← Exit to games";
      exit.dataset.gxPauseAction = "exit";
      exit.addEventListener("click", onExit);
      panel.append(exit);
    }
    overlay.append(panel);
    overlay.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      const focusable = [...panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled):not([hidden])')]
        .filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    });
    return overlay;
  }
  pauseButton.addEventListener("click", () => setMenuPaused(!menuPaused));
  const onPauseKey = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || isFormField(event.target)) return;
    event.preventDefault();
    setMenuPaused(!menuPaused);
  };
  window.addEventListener("keydown", onPauseKey);
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
    ? mountSteerControls(api, ballId, container, () => won || menuPaused || (!raceStarted && !(api.state()?.paused ?? false)), options)
    : mountLegacyPushControls(api, ballId, container, () => won || menuPaused);

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
    menuPaused = false;
    api.pause(false);
    hud.remove();
    pauseOverlay.remove();
    const worldId = api.state()?.world.id ?? "";
    const levelId = worldId.startsWith("ballz-level-") ? worldId.slice("ballz-level-".length) : null;
    const replayDefinition = pristineDefinition;
    const replay = levelId
      ? () => { api.levels.play(levelId); }
      : replayDefinition
        ? () => { void reloadPristineScene(api, replayDefinition); }
        : undefined;
    const panel = buildWinPanel(api, totalRings, seconds, desynced, onExit, replay);
    container.append(panel);
    container.querySelector<HTMLElement>(".gx-bz-touch")?.setAttribute("inert", "");
    queueMicrotask(() => {
      const action = panel.querySelector<HTMLButtonElement>("button");
      if (action) action.focus(); else panel.focus();
    });
    // Results are an enhancement layered onto a finish that has already been recorded
    // locally and already rendered. Deliberately not awaited, and a complete no-op when no
    // store is configured — see the header of results-client.ts.
    void publishAndShowBoard(panel, recordId, courseRevision, seconds, desynced, ghostSession?.recording() ?? null, replay);
  }

  return () => {
    window.clearInterval(poll);
    teardownCountdown?.();
    teardownControls();
    window.removeEventListener("keydown", onPauseKey);
    document.removeEventListener("fullscreenchange", syncFullscreen);
    if (menuPaused) api.pause(false);
    ghostSession?.dispose();
    hud.remove();
    pauseOverlay.remove();
    delete container.dataset.gxControlMode;
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

function mountTouchControls(
  container: HTMLElement,
  callbacks: { setKey: (key: string, pressed: boolean) => void; jump?: () => void },
): () => void {
  const pad = document.createElement("div");
  pad.className = "gx-bz-touch";
  pad.setAttribute("aria-label", "Touch play controls");
  const specs: ReadonlyArray<[string, string, string]> = [
    ["ArrowUp", "↑", "Roll forward"],
    ["ArrowLeft", "←", "Turn left"],
    ["ArrowDown", "↓", "Brake or roll backward"],
    ["ArrowRight", "→", "Turn right"],
  ];
  const active = new Set<string>();
  for (const [key, label, ariaLabel] of specs) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `gx-bz-touch-btn gx-bz-touch-${key.slice(5).toLowerCase()}`;
    button.dataset.gxTouch = key;
    button.textContent = label;
    button.setAttribute("aria-label", ariaLabel);
    const press = (event: PointerEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      if (active.has(key)) return;
      active.add(key);
      try { button.setPointerCapture?.(event.pointerId); } catch { /* synthetic/test pointers have no active capture */ }
      button.classList.add("gx-bz-touch-on");
      callbacks.setKey(key, true);
    };
    const release = (event: PointerEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      if (!active.delete(key)) return;
      button.classList.remove("gx-bz-touch-on");
      callbacks.setKey(key, false);
    };
    button.addEventListener("pointerdown", press);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
    pad.append(button);
  }
  if (callbacks.jump) {
    const jump = document.createElement("button");
    jump.type = "button";
    jump.className = "gx-bz-touch-btn gx-bz-touch-jump";
    jump.dataset.gxTouch = "jump";
    jump.textContent = "JUMP";
    jump.setAttribute("aria-label", "Jump");
    jump.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      callbacks.jump?.();
    });
    pad.append(jump);
  }
  container.append(pad);
  return () => {
    for (const key of active) callbacks.setKey(key, false);
    pad.remove();
  };
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
  const keyboardHeld = new Set<string>();
  const touchHeld = new Set<string>();
  let gamepadThrust = 0;
  let gamepadTurn = 0;
  const axisInputs = (): { thrust: number; turn: number } => ({
    thrust: keyboardHeld.has("ArrowUp") || touchHeld.has("ArrowUp")
      ? 1
      : keyboardHeld.has("ArrowDown") || touchHeld.has("ArrowDown")
        ? -1
        : gamepadThrust,
    turn: keyboardHeld.has("ArrowRight") || touchHeld.has("ArrowRight")
      ? 1
      : keyboardHeld.has("ArrowLeft") || touchHeld.has("ArrowLeft")
        ? -1
        : gamepadTurn,
  });
  const sendAxes = (): void => {
    api.steer(ballId, isWon() ? { thrust: 0, turn: 0 } : axisInputs());
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
    if (keyboardHeld.has(event.key) || isWon()) return;
    keyboardHeld.add(event.key);
    sendAxes();
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    if (!keyboardHeld.delete(event.key)) return;
    sendAxes();
  };
  let mouseDriving = false;
  // A defocused tab must not leave a key held: zero every input on blur.
  const onBlur = (): void => {
    keyboardHeld.clear();
    touchHeld.clear();
    gamepadThrust = 0;
    gamepadTurn = 0;
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
  const teardownTouch = mountTouchControls(container, {
    jump: () => { if (!isWon()) api.steer(ballId, { jump: 1 }); },
    setKey: (key, pressed) => {
      if (pressed) touchHeld.add(key); else touchHeld.delete(key);
      sendAxes();
    },
  });
  let gamepadJumpHeld = false;
  let gamepadActive = false;
  const deadzone = (value: number): number => Math.abs(value) < 0.18 ? 0 : Math.max(-1, Math.min(1, value));
  const gamepadPoll = window.setInterval(() => {
    const pad = navigator.getGamepads?.().find((candidate) => candidate?.connected) ?? null;
    const turn = pad ? deadzone((pad.axes[0] ?? 0) + (pad.buttons[15]?.pressed ? 1 : 0) - (pad.buttons[14]?.pressed ? 1 : 0)) : 0;
    const thrust = pad ? deadzone(-(pad.axes[1] ?? 0) + (pad.buttons[12]?.pressed ? 1 : 0) - (pad.buttons[13]?.pressed ? 1 : 0)) : 0;
    const jump = !!pad?.buttons[0]?.pressed;
    if (turn !== gamepadTurn || thrust !== gamepadThrust || gamepadActive !== !!pad) {
      gamepadTurn = turn;
      gamepadThrust = thrust;
      gamepadActive = !!pad;
      sendAxes();
    }
    if (jump && !gamepadJumpHeld && !isWon()) api.steer(ballId, { jump: 1 });
    gamepadJumpHeld = jump;
  }, 50);
  return () => {
    window.clearInterval(gamepadPoll);
    teardownTouch();
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    container.removeEventListener("pointermove", onPointerMove);
    container.removeEventListener("pointerdown", onPointerDown);
    container.removeEventListener("pointerup", onPointerUp);
    // Leave nothing thrusting after the layer is gone — the entity outlives the HUD.
    if (keyboardHeld.size > 0 || touchHeld.size > 0 || gamepadActive || mouseDriving) api.steer(ballId, { thrust: 0, turn: 0 });
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
function mountLegacyPushControls(api: GraphysXAgentWorldApi, ballId: string, container: HTMLElement, isWon: () => boolean): () => void {
  const pushBy = new Map<string, string>(PUSH_DIRECTIONS.map((direction) => [direction.key, direction.id]));
  const dirById = new Map<string, readonly [number, number, number]>(
    PUSH_DIRECTIONS.map((direction) => [direction.id, direction.vector]),
  );
  const keyboardHeld = new Set<string>();
  const touchHeld = new Set<string>();
  const gamepadHeld = new Set<string>();
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
    if (!keyboardHeld.has(event.key)) {
      keyboardHeld.add(event.key);
      const velocity = api.query({ ids: [ballId] })[0]?.physics?.linearVelocity;
      pushIfUnderCap(interactionId, velocity);
    }
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    if (pushBy.has(event.key)) keyboardHeld.delete(event.key);
  };
  const onBlur = (): void => { keyboardHeld.clear(); touchHeld.clear(); gamepadHeld.clear(); }; // a defocused tab must not leave a key stuck.
  const steer = window.setInterval(() => {
    const held = new Set([...keyboardHeld, ...touchHeld, ...gamepadHeld]);
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
  const press = (target: Set<string>, key: string): void => {
    if (target.has(key) || isWon()) return;
    target.add(key);
    const interactionId = pushBy.get(key);
    if (interactionId) pushIfUnderCap(interactionId, api.query({ ids: [ballId] })[0]?.physics?.linearVelocity);
  };
  const teardownTouch = mountTouchControls(container, {
    setKey: (key, pressed) => { if (pressed) press(touchHeld, key); else touchHeld.delete(key); },
  });
  const gamepadPoll = window.setInterval(() => {
    const pad = navigator.getGamepads?.().find((candidate) => candidate?.connected) ?? null;
    const x = pad?.axes[0] ?? 0;
    const y = pad?.axes[1] ?? 0;
    const wanted = new Set<string>();
    if (x < -0.28 || pad?.buttons[14]?.pressed) wanted.add("ArrowLeft");
    if (x > 0.28 || pad?.buttons[15]?.pressed) wanted.add("ArrowRight");
    if (y < -0.28 || pad?.buttons[12]?.pressed) wanted.add("ArrowUp");
    if (y > 0.28 || pad?.buttons[13]?.pressed) wanted.add("ArrowDown");
    for (const key of wanted) press(gamepadHeld, key);
    for (const key of [...gamepadHeld]) if (!wanted.has(key)) gamepadHeld.delete(key);
  }, 50);
  return () => {
    window.clearInterval(steer);
    window.clearInterval(gamepadPoll);
    teardownTouch();
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
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "Course complete");
  panel.tabIndex = -1;

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
  panel.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const focusable = [...panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled):not([hidden])')]
      .filter((element) => element.getClientRects().length > 0);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  });

  return panel;
}



/**
 * A ghost challenge chosen on the win panel, handed to the next mount of the play view.
 *
 * Module state rather than a parameter because "Race this ghost" reloads the level, and the
 * reload tears this whole layer down and builds a new one. It is consumed on read so a
 * challenge cannot silently apply to every subsequent run.
 */
let pendingChallenge: { recordId: string; label: string; trace: GhostTrace } | null = null;

function takeGhostChallenge(recordId: string): { label: string; trace: GhostTrace } | null {
  if (!pendingChallenge || pendingChallenge.recordId !== recordId) return null;
  const { label, trace } = pendingChallenge;
  pendingChallenge = null;
  return { label, trace };
}

/**
 * A line of AgentX news for the next mount of the play view, for the same reason as
 * `pendingChallenge`: racing the agent reloads the level twice, and this view does not survive
 * either reload. Consumed on read, so old news never reappears under a later run.
 */
let pendingCoachNote: { recordId: string; text: string } | null = null;

function takeCoachNote(recordId: string): string | null {
  if (!pendingCoachNote || pendingCoachNote.recordId !== recordId) return null;
  const { text } = pendingCoachNote;
  pendingCoachNote = null;
  return text;
}

/** The agent needs a moment of armed run before it can drive; `levels.play` returns before that. */
async function waitForArmedRun(api: GraphysXAgentWorldApi, attempts = 60): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (api.rules.status()) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

/**
 * Runs the agent's baseline for this course and hands its trace back as a ghost to race.
 *
 * Two reloads, and both are load-bearing. The first is so the agent drives from the spawn
 * rather than from wherever the player left the ball — a demonstration that started mid-course
 * would be a different run wearing the baseline's name. The second is so the player's own
 * attempt starts clean, with the agent's trace as the challenger.
 *
 * Between them the world really is stepped by the agent, 11 seconds of simulation inside one
 * synchronous loop. No frame renders while that happens, so what a player sees is the level
 * reloading twice, not the ball skating around on its own.
 */
async function raceTheAgent(api: GraphysXAgentWorldApi, recordId: string, levelId: string): Promise<void> {
  const program = coachProgramFor(recordId);
  if (!program) return;
  pendingCoachNote = { recordId, text: "AgentX is driving…" };
  api.levels.play(levelId);
  if (!await waitForArmedRun(api)) {
    pendingCoachNote = { recordId, text: "The course did not start, so AgentX could not drive it." };
    api.levels.play(levelId);
    return;
  }
  const run = runCoachProgram(api, program);
  // `describeCoachRun` refuses to call an unfinished run a baseline, which is the whole point
  // of routing the message through it rather than writing a cheerful one here.
  pendingCoachNote = { recordId, text: describeCoachRun(run) };
  if (run.completed) pendingChallenge = { recordId, label: "AgentX", trace: run.trace };
  api.levels.play(levelId);
}

/**
 * Submits the finished run and, if a store answered, appends the leaderboard to the win panel.
 *
 * Every step is optional and silent. With no store nothing here makes a request at all; with a
 * store that refuses the submission the panel simply keeps the local score row it already has.
 */
async function publishAndShowBoard(
  panel: HTMLElement,
  recordId: string | null,
  courseRevision: number | null,
  seconds: number,
  desynced: boolean,
  ghost: GhostTrace | null,
  replay: (() => void) | undefined,
): Promise<void> {
  if (!recordId || !resultsConfigured()) return;
  const elapsedMs = Math.round(seconds * 1000);
  const courseVersion = courseVersionFor(recordId, courseRevision);
  const rulesVersion = "v1";
  const actorId = resultsActorId();

  if (!desynced && resultsCanSubmit()) {
    const record = new LevelRecordStore().getRecord(recordId);
    await submitResult({
      recordId,
      actorId,
      label: actorId,
      courseVersion,
      rulesVersion,
      elapsedMs,
      medal: record?.medal ?? null,
      desynced,
      // Only offered when it is this run's own trace and it matches the time submitted; the
      // server rejects a mismatch, and sending one anyway would lose the whole result.
      ghost: ghost && Math.abs(ghost.elapsedMs - elapsedMs) <= 150 ? ghost : null,
    });
  }

  const board = await fetchLeaderboard(recordId, courseVersion, rulesVersion, 8);
  if (!board || !panel.isConnected) return;
  const element = buildLeaderboardPanel(board, {
    actorId,
    onRaceGhost: (entry) => {
      void fetchGhost(recordId, entry.actorId, courseVersion, rulesVersion).then((trace) => {
        if (!trace || !replay) return;
        pendingChallenge = { recordId, label: entry.label, trace };
        replay();
      });
    },
  });
  if (element) panel.append(element);
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
.gx-bz-hud-actions{display:flex;align-items:center;justify-content:center;gap:5px;pointer-events:auto;margin-top:3px}
.gx-bz-control-mode{max-width:145px;padding:4px 6px;border:1px solid var(--gx-accent-ring);border-radius:5px;background:rgba(10,22,30,.8);color:var(--gx-ink-soft);font:10px/1 var(--gx-font)}
/* The HUD is pointer-events:none so it never eats a click meant for the scene; the one
   interactive child opts back in. */
.gx-bz-exit,.gx-bz-action{pointer-events:auto;background:rgba(10,22,30,.72);border:1px solid var(--gx-accent-glow);
  border-radius:4px;color:var(--gx-ink-soft);cursor:pointer;font:10px/1 var(--gx-font);padding:5px 9px}
.gx-bz-exit:hover,.gx-bz-action:hover{background:rgba(18,40,52,.86);border-color:var(--gx-accent)}
/* The agent's button reads as an offer rather than a control, so it carries the AgentX tint
   the rest of the product uses for "this is Nestor doing something", not the HUD's steel. */
.gx-bz-race-agent{border-color:rgba(150,124,255,.55);color:#d9d2ff}
.gx-bz-race-agent:hover:not(:disabled){background:rgba(46,34,84,.88);border-color:#967cff}
.gx-bz-race-agent:disabled{cursor:progress;opacity:.6}
.gx-bz-pause{position:absolute;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;background:rgba(2,10,16,.7);backdrop-filter:blur(7px);font-family:var(--gx-font)}
.gx-bz-pause[hidden]{display:none}
.gx-bz-pause-panel{width:min(330px,calc(100vw - 32px));display:flex;flex-direction:column;gap:10px;padding:26px;border:1px solid var(--gx-accent-glow);border-radius:15px;background:rgba(8,23,31,.97);box-shadow:0 24px 70px rgba(0,0,0,.58);text-align:center}
.gx-bz-pause-panel strong{color:var(--gx-accent);font-size:26px}.gx-bz-pause-panel span{color:var(--gx-ink-faint);font-size:11px;margin-bottom:4px}
.gx-bz-pause-panel button{cursor:pointer;padding:10px 14px;border:1px solid var(--gx-accent-ring);border-radius:9px;background:rgba(16,38,50,.92);color:var(--gx-ink);font:600 12px/1.2 var(--gx-font)}
.gx-bz-pause-panel button:hover,.gx-bz-pause-panel button:focus-visible{outline:none;border-color:var(--gx-accent);background:rgba(25,58,72,.96)}
.gx-bz-touch{position:absolute;left:18px;bottom:18px;z-index:12;display:none;grid-template-columns:repeat(3,58px);grid-template-rows:repeat(2,58px);gap:7px;pointer-events:auto;touch-action:none;user-select:none}
[data-gx-control-mode="touch"] .gx-bz-touch{display:grid}
.gx-bz-touch-btn{border:1px solid rgba(120,240,208,.5);border-radius:14px;background:rgba(7,25,34,.78);color:var(--gx-ink);box-shadow:0 5px 18px rgba(0,0,0,.3);font:800 24px/1 var(--gx-font);touch-action:none;-webkit-tap-highlight-color:transparent}
.gx-bz-touch-btn.gx-bz-touch-on{background:var(--gx-accent-fill);border-color:var(--gx-accent);transform:scale(.96)}
.gx-bz-touch-up{grid-column:2;grid-row:1}.gx-bz-touch-left{grid-column:1;grid-row:2}.gx-bz-touch-down{grid-column:2;grid-row:2}.gx-bz-touch-right{grid-column:3;grid-row:2}
.gx-bz-touch-jump{position:absolute;left:calc(100vw - 120px);bottom:5px;width:84px;height:84px;border-radius:50%;font-size:13px;color:#1b0d02;background:linear-gradient(180deg,#ffd24d,#ff8a2a);border-color:#ffe073}
@media(pointer:coarse){[data-gx-control-mode="auto"] .gx-bz-touch{display:grid}}
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
@media (max-width:640px){.gx-bz-hud{top:8px;min-width:230px;max-width:calc(100vw - 20px);padding:7px 10px}.gx-bz-status{font-size:11px}.gx-bz-hint{font-size:9px}.gx-bz-hud-actions{flex-wrap:wrap}.gx-bz-touch{left:10px;bottom:10px;grid-template-columns:repeat(3,50px);grid-template-rows:repeat(2,50px)}}
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
