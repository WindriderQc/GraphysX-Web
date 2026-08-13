// The child-facing surface for the EV3 Robotics Mission Lab.
//
// It exists because of a measurement, not a preference. Reaching the lab through Browse Scenes
// opens the Scene Editor: at 800x480 that is four authoring panels around a postage stamp of the
// lab, with **218 controls, every one of them under 44px tall**. The editor is a correct tool
// aimed at the wrong person. A seven-year-old on a Raspberry Pi touchscreen needs a handful of
// targets big enough to hit with a thumb, and nothing else.
//
// Every control here is an ordinary `api.*` call on vocabulary the scene already declares. The
// run is evaluated by `api.rules`, red-zone misses arrive through `api.events`, and motion is
// `api.steer` on the drive base. There is no bespoke host state and no second command path,
// which is the invariant that lets an agent do anything a child can do and vice versa.
//
// Deliberately NOT here: mission selection, hardware, persistence or a scoring system. This is
// one real mission and one tiny motion language — enough to measure blocks → program → simulation
// before generalising either the application surface or the hardware bridge.

import type { GraphysXAgentWorldApi } from "./agent-world-runtime";
import {
  EV3_FIRST_MISSION_MISS_TAG,
  EV3_FIRST_MISSION_SUBJECT_ID,
  EV3_FIRST_MISSION_TIME_LIMIT_SECONDS,
} from "./ev3-robotics-lab";
import {
  createEv3FirstProgramRunner,
  EV3_FIRST_PROGRAM_BLOCKS,
  EV3_FIRST_PROGRAM_MAX_BLOCKS,
  type Ev3FirstProgramBlockId,
} from "./ev3-first-program";

/** The scene id this surface drives, re-exported for callers that only know the surface. */
export const EV3_DRIVE_BASE_ID = EV3_FIRST_MISSION_SUBJECT_ID;

/**
 * Minimum touch target.
 *
 * 44px is the usual accessibility floor and it is a floor for adults. These are 72px because the
 * hand is small, the screen is 800x480, and a miss on a moving robot is more annoying than a
 * miss on a form.
 */
export const EV3_TOUCH_TARGET_PX = 72;

export type Ev3MissionStrip = {
  dispose: () => void;
  /** What Nestor is currently telling the child, so a smoke can read it. */
  status: () => string;
  /** Concise player-facing state for `render_game_to_text`. */
  state: () => Ev3MissionStripState;
  /** Deterministic simulation path used by the web-game driver. */
  advanceTime: (milliseconds: number) => Ev3MissionStripState;
};

export type Ev3MissionStripState = {
  mode: "program" | "drive";
  mission: {
    phase: string;
    elapsedSeconds: number;
    remainingSeconds: number;
    misses: number;
  } | null;
  rover: {
    position: [number, number, number];
    velocity: [number, number, number] | null;
    headingDegrees: number | null;
  } | null;
  program: {
    blocks: Ev3FirstProgramBlockId[];
    running: boolean;
    activeIndex: number | null;
    atLimit: boolean;
  };
  nestor: string;
};

export type Ev3MissionStripOptions = {
  /** Joins the host's one frame loop; the surface must never create its own rAF loop. */
  subscribeFrame: (listener: (deltaSeconds: number) => void) => () => void;
};

const STYLE_ID = "gx-ev3-strip-style";

const injectStyleOnce = (): void => {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.gx-ev3{position:fixed;inset:auto 0 0 0;z-index:30;display:flex;align-items:flex-end;justify-content:space-between;
  gap:12px;padding:12px 14px calc(12px + env(safe-area-inset-bottom));pointer-events:none;font-family:var(--gx-font)}
/* The strip is a fixed band at the bottom. It must never grow upward: a bottom-anchored panel
   that changes height covers the scene behind it, which has already cost this project a dead
   click on a kinetic block. Status text is one line and clips rather than wrapping. */
.gx-ev3-pad,.gx-ev3-actions{display:flex;gap:12px;pointer-events:auto}
.gx-ev3[data-mode="program"] .gx-ev3-pad,.gx-ev3[data-mode="program"] .gx-ev3-actions{gap:8px}
.gx-ev3 button{width:${EV3_TOUCH_TARGET_PX}px;height:${EV3_TOUCH_TARGET_PX}px;border-radius:18px;border:2px solid rgba(120,220,255,.5);
  background:rgba(9,26,36,.88);color:#eaf7ff;font:800 15px/1.1 var(--gx-font);cursor:pointer;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;
  -webkit-tap-highlight-color:transparent;touch-action:manipulation;backdrop-filter:blur(8px)}
.gx-ev3 button span.gx-ev3-glyph{font-size:26px;line-height:1}
.gx-ev3 button:active,.gx-ev3 button[data-held="true"]{background:rgba(38,120,150,.95);border-color:#7fe6ff;transform:scale(.96)}
.gx-ev3 button:disabled{cursor:default;opacity:.45;transform:none}
.gx-ev3 button[hidden]{display:none!important}
.gx-ev3 button:focus-visible{outline:3px solid #7fe6ff;outline-offset:3px}
.gx-ev3-wide{width:auto!important;min-width:${EV3_TOUCH_TARGET_PX * 2}px;padding:0 18px}
.gx-ev3-mission{position:fixed;left:14px;top:14px;z-index:30;width:min(66vw,560px);pointer-events:none;
  padding:13px 15px 14px;border:1px solid rgba(120,220,255,.38);border-radius:16px;
  background:rgba(9,26,36,.88);color:#eaf7ff;font-family:var(--gx-font);backdrop-filter:blur(10px)}
.gx-ev3-mission-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:7px}
.gx-ev3-kicker{color:#7fe6ff;font:800 11px/1 var(--gx-font);letter-spacing:.12em;text-transform:uppercase}
.gx-ev3-clock{min-width:48px;text-align:center;padding:5px 8px;border-radius:999px;background:rgba(46,120,208,.28);
  color:#fff;font:800 14px/1 var(--gx-font);font-variant-numeric:tabular-nums}
.gx-ev3-objective{font:800 19px/1.18 var(--gx-font)}
.gx-ev3-nestor{display:flex;align-items:center;gap:9px;margin-top:10px;color:#dff4ff;font:600 14px/1.25 var(--gx-font)}
.gx-ev3-nestor-mark{display:grid;place-items:center;flex:0 0 30px;height:30px;border-radius:50%;background:#7fe6ff;color:#08202b;
  font:900 16px/1 var(--gx-font);box-shadow:0 0 18px rgba(127,230,255,.28)}
.gx-ev3-nestor-copy{min-width:0}.gx-ev3-nestor-name{display:block;color:#7fe6ff;font:800 10px/1 var(--gx-font);letter-spacing:.1em;text-transform:uppercase;margin-bottom:3px}
.gx-ev3-status{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gx-ev3-program-readout{display:flex;align-items:center;gap:9px;margin-top:9px;padding-top:8px;border-top:1px solid rgba(127,230,255,.18)}
.gx-ev3-program-label{flex:0 0 auto;color:#9bdff3;font:800 10px/1 var(--gx-font);letter-spacing:.1em;text-transform:uppercase}
.gx-ev3-program-blocks{display:flex;align-items:center;gap:5px;min-width:0;overflow:hidden;list-style:none;margin:0;padding:0}
.gx-ev3-program-chip{display:flex;align-items:center;gap:4px;min-width:0;padding:5px 7px;border-radius:8px;
  background:rgba(45,118,151,.42);color:#eaf7ff;font:800 11px/1 var(--gx-font);white-space:nowrap}
.gx-ev3-program-chip[data-active="true"]{background:#7fe6ff;color:#08202b;box-shadow:0 0 14px rgba(127,230,255,.34)}
.gx-ev3-program-empty{color:#b9d2dc;font:600 11px/1 var(--gx-font);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gx-ev3-mission[data-mode="drive"] .gx-ev3-program-readout{display:none}
.gx-ev3-mission[data-phase="complete"]{border-color:rgba(94,235,151,.72)}
.gx-ev3-mission[data-phase="expired"]{border-color:rgba(255,174,92,.72)}
.gx-ev3-exit{position:fixed;right:14px;top:14px;z-index:30;pointer-events:auto;
  min-height:48px;padding:0 16px;border-radius:12px;border:2px solid rgba(120,220,255,.45);
  background:rgba(9,26,36,.82);color:#dff4ff;font:700 14px/1 var(--gx-font);cursor:pointer;touch-action:manipulation}
/* The render-settings disclosure is pinned bottom-right at z-index 120 and competes with the
   mission's controls. It is a developer control and a child has no use for it, so the
   application surface hides it rather than dodging around it. */
body:has(.gx-ev3) .gx-display-settings{display:none}
@media (max-height:520px){
  .gx-ev3{padding:8px 10px calc(8px + env(safe-area-inset-bottom))}
  .gx-ev3-mission{left:10px;top:10px;padding:9px 11px 10px;width:min(65vw,520px)}
  .gx-ev3-objective{font-size:16px}.gx-ev3-nestor{margin-top:7px;font-size:12px}.gx-ev3-nestor-mark{height:26px;flex-basis:26px}
  .gx-ev3-program-readout{margin-top:7px;padding-top:6px}
  .gx-ev3-exit{right:10px;top:10px}
}`;
  document.head.append(style);
};

/**
 * Mounts the strip over a loaded EV3 lab.
 *
 * `onExit` is required rather than optional: a mode a child cannot leave is a trap, and this one
 * covers the whole screen.
 */
export function mountEv3MissionStrip(
  root: HTMLElement,
  api: GraphysXAgentWorldApi,
  onExit: () => void,
  options: Ev3MissionStripOptions,
): Ev3MissionStrip {
  injectStyleOnce();

  const has = (id: string): boolean => api.query({ ids: [id] }).length === 1;
  const driveable = has(EV3_DRIVE_BASE_ID);

  const mission = document.createElement("section");
  mission.className = "gx-ev3-mission";
  mission.dataset.ev3Mission = "first-drive";
  mission.setAttribute("aria-label", "First Drive mission");
  const missionHead = document.createElement("div");
  missionHead.className = "gx-ev3-mission-head";
  const kicker = document.createElement("span");
  kicker.className = "gx-ev3-kicker";
  kicker.textContent = "Mission 01 · First Drive";
  const clock = document.createElement("span");
  clock.className = "gx-ev3-clock";
  clock.dataset.ev3Clock = "";
  missionHead.append(kicker, clock);
  const objective = document.createElement("div");
  objective.className = "gx-ev3-objective";
  objective.dataset.ev3Objective = "";
  objective.textContent = "Reach the blue target before time runs out.";
  const nestor = document.createElement("div");
  nestor.className = "gx-ev3-nestor";
  const nestorMark = document.createElement("span");
  nestorMark.className = "gx-ev3-nestor-mark";
  nestorMark.textContent = "N";
  const nestorCopy = document.createElement("div");
  nestorCopy.className = "gx-ev3-nestor-copy";
  const nestorName = document.createElement("span");
  nestorName.className = "gx-ev3-nestor-name";
  nestorName.textContent = "Nestor";
  const status = document.createElement("span");
  status.className = "gx-ev3-status";
  status.dataset.ev3Nestor = "";
  status.setAttribute("role", "status");
  const say = (text: string): void => { status.textContent = text; };
  say(driveable ? "Build a program: tap Forward three times, then Run." : "This lab has no drive base loaded.");
  nestorCopy.append(nestorName, status);
  nestor.append(nestorMark, nestorCopy);
  const programReadout = document.createElement("div");
  programReadout.className = "gx-ev3-program-readout";
  programReadout.dataset.ev3Program = "";
  programReadout.setAttribute("aria-label", "Your program");
  const programLabel = document.createElement("span");
  programLabel.className = "gx-ev3-program-label";
  programLabel.textContent = "Your program";
  const programBlocks = document.createElement("ol");
  programBlocks.className = "gx-ev3-program-blocks";
  programBlocks.setAttribute("aria-live", "polite");
  programReadout.append(programLabel, programBlocks);
  mission.append(missionHead, objective, nestor, programReadout);

  const exit = document.createElement("button");
  exit.type = "button";
  exit.className = "gx-ev3-exit";
  exit.textContent = "✕ Leave the lab";
  exit.addEventListener("click", () => onExit());

  const strip = document.createElement("div");
  strip.className = "gx-ev3";
  const pad = document.createElement("div");
  pad.className = "gx-ev3-pad";
  const actions = document.createElement("div");
  actions.className = "gx-ev3-actions";
  strip.append(pad, actions);

  /**
   * A held button steers while it is down and stops when it is released.
   *
   * Pointer events rather than mouse or touch: one code path covers a finger, a mouse and a
   * stylus, and `setPointerCapture` means a thumb that slides off the button still releases the
   * control instead of leaving the robot driving forever.
   */
  const held = (label: string, glyph: string, input: () => void): HTMLButtonElement => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.ev3 = label.toLowerCase();
    button.setAttribute("aria-label", label);
    const icon = document.createElement("span");
    icon.className = "gx-ev3-glyph";
    icon.textContent = glyph;
    const text = document.createElement("span");
    text.textContent = label;
    button.append(icon, text);

    const stop = (): void => {
      button.dataset.held = "false";
      if (driveable) api.steer(EV3_DRIVE_BASE_ID, { thrust: 0, turn: 0 });
    };
    button.addEventListener("pointerdown", (event) => {
      button.setPointerCapture(event.pointerId);
      button.dataset.held = "true";
      input();
    });
    for (const type of ["pointerup", "pointercancel", "pointerleave"] as const) {
      button.addEventListener(type, stop);
    }
    return button;
  };

  const tap = (label: string, glyph: string, run: () => void, wide = true): HTMLButtonElement => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.ev3 = label.toLowerCase();
    if (wide) button.className = "gx-ev3-wide";
    button.setAttribute("aria-label", label);
    const icon = document.createElement("span");
    icon.className = "gx-ev3-glyph";
    icon.textContent = glyph;
    const text = document.createElement("span");
    text.textContent = label;
    button.append(icon, text);
    button.addEventListener("click", run);
    return button;
  };

  const driveButtons = driveable ? [
    held("Left", "◀", () => { api.steer(EV3_DRIVE_BASE_ID, { turn: -1, thrust: 0.6 }); }),
    held("Go", "▲", () => { api.steer(EV3_DRIVE_BASE_ID, { thrust: 1, turn: 0 }); }),
    held("Right", "▶", () => { api.steer(EV3_DRIVE_BASE_ID, { turn: 1, thrust: 0.6 }); }),
  ] : [];

  let eventCursor = 0;
  let lastPhase = "idle";
  let misses = 0;
  let mode: "program" | "drive" = "program";
  let program: Ev3FirstProgramBlockId[] = [];
  let controlsEnabled = true;
  let deterministicMode = false;
  let activeProgramIndex: number | null = null;
  let refreshProgram = (): void => undefined;
  let refreshControls = (): void => undefined;
  let setControlsEnabled = (_enabled: boolean): void => undefined;

  const missIds = new Set(api.query({ tag: EV3_FIRST_MISSION_MISS_TAG }).map((entity) => entity.id));
  const missionRules = api.rules.get();
  const timeLimit = missionRules?.timer?.limitSeconds ?? EV3_FIRST_MISSION_TIME_LIMIT_SECONDS;
  const missionReady = driveable && Boolean(missionRules?.finish) && missIds.size > 0;
  const resetAttempt = () => {
    const reset = api.rules.reset();
    // Rules own the spawn transform and velocity. Heading is transient steering state, so the
    // application restores the scene-authored north heading at the same attempt boundary.
    if (driveable) api.steer(EV3_DRIVE_BASE_ID, { headingDegrees: 0, thrust: 0, turn: 0 });
    return reset;
  };
  const runner = createEv3FirstProgramRunner(
    (input) => { if (driveable) api.steer(EV3_DRIVE_BASE_ID, input); },
    (index, block) => {
      activeProgramIndex = index;
      refreshProgram();
      say(`Running block ${index + 1} of ${program.length}: ${block.label}.`);
    },
    () => {
      activeProgramIndex = null;
      api.pause(true);
      setControlsEnabled(true);
      refreshProgram();
      refreshControls();
      if (api.rules.status()?.phase !== "running") return;
      say(misses > 0
        ? "Program finished after red. Undo the turn or add one back toward the middle."
        : "Program stopped before blue. Add another Forward block and run it again.");
    },
  );

  const setVisibleLabel = (button: HTMLButtonElement, label: string): HTMLButtonElement => {
    const text = button.lastElementChild;
    if (text) text.textContent = label;
    return button;
  };
  const blockOrder: Ev3FirstProgramBlockId[] = ["forward", "left", "right", "stop"];
  const programButtons = blockOrder.map((id) => {
    const block = EV3_FIRST_PROGRAM_BLOCKS[id];
    const button = tap(`Add ${block.label} block`, block.glyph, () => {
      if (!controlsEnabled || program.length >= EV3_FIRST_PROGRAM_MAX_BLOCKS) return;
      program = [...program, id];
      refreshProgram();
      refreshControls();
      say(program.length === 1
        ? `${block.label} added. Add more blocks, then tap Run.`
        : `${block.label} added as block ${program.length}.`);
    }, false);
    button.dataset.ev3Block = id;
    return setVisibleLabel(button, block.label);
  });
  const undo = setVisibleLabel(tap("Undo block", "↶", () => {
    if (!controlsEnabled || program.length === 0) return;
    program = program.slice(0, -1);
    refreshProgram();
    refreshControls();
    say(program.length === 3 && program.every((id) => id === "forward")
      ? "Three Forward blocks ready. Tap Run to test them."
      : (program.length > 0 ? `Last block removed. ${program.length} left.` : "Program cleared. Start with Forward."));
  }, false), "Undo");
  undo.dataset.ev3Undo = "";
  const runProgram = setVisibleLabel(tap("Run program", "▶", () => {
    if (!controlsEnabled || program.length === 0 || !missionReady) return;
    runner.stop();
    const reset = resetAttempt();
    misses = 0;
    lastPhase = reset.value?.phase ?? "idle";
    eventCursor = api.events().sequence;
    retry.hidden = true;
    setControlsEnabled(false);
    if (!deterministicMode) api.pause(false);
    runner.start(program);
    refreshProgram();
    refreshControls();
  }), "Run");
  runProgram.dataset.ev3Run = "";
  const driveMode = setVisibleLabel(tap("Drive mode", "●", () => {
    if (!controlsEnabled) return;
    api.pause(false);
    mode = "drive";
    mission.dataset.mode = mode;
    strip.dataset.mode = mode;
    refreshControls();
    say("Drive it yourself: hold Go, and use Left or Right to steer.");
  }, false), "Drive");
  driveMode.dataset.ev3Mode = "drive";
  const buildMode = setVisibleLabel(tap("Build program", "▦", () => {
    if (!controlsEnabled) return;
    runner.stop();
    mode = "program";
    const reset = resetAttempt();
    misses = 0;
    lastPhase = reset.value?.phase ?? "idle";
    eventCursor = api.events().sequence;
    api.pause(true);
    mission.dataset.mode = mode;
    strip.dataset.mode = mode;
    refreshProgram();
    refreshControls();
    say(program.length > 0 ? "Your program is ready. Tap Run to test it." : "Build a program: tap Forward three times, then Run.");
  }), "Build");
  buildMode.dataset.ev3Mode = "program";

  const retry = tap("Try again", "↻", () => {
    runner.stop();
    activeProgramIndex = null;
    const reset = resetAttempt();
    misses = 0;
    lastPhase = reset.value?.phase ?? "idle";
    eventCursor = api.events().sequence;
    retry.hidden = true;
    api.pause(mode === "program");
    setControlsEnabled(true);
    refreshProgram();
    refreshControls();
    say(mode === "program"
      ? (program.length > 0 ? "Program ready. Tap Run to try it again." : "Build a program: tap Forward three times, then Run.")
      : "Blue is straight ahead. Hold Go to reach it!");
    renderRun();
  });
  retry.dataset.ev3Retry = "";
  retry.hidden = true;

  setControlsEnabled = (enabled: boolean): void => {
    const wasEnabled = controlsEnabled;
    controlsEnabled = enabled;
    for (const button of driveButtons) button.disabled = !enabled;
    for (const button of programButtons) button.disabled = !enabled || program.length >= EV3_FIRST_PROGRAM_MAX_BLOCKS;
    undo.disabled = !enabled || program.length === 0;
    runProgram.disabled = !enabled || program.length === 0;
    driveMode.disabled = !enabled;
    buildMode.disabled = !enabled;
    // Stop a held manual input on the enabled → disabled edge. Re-rendering disabled program
    // controls must not emit another stop: doing so would cancel the block the runner just set.
    if (!enabled && wasEnabled && driveable) api.steer(EV3_DRIVE_BASE_ID, { thrust: 0, turn: 0 });
  };
  refreshProgram = (): void => {
    programBlocks.replaceChildren();
    if (program.length === 0) {
      const empty = document.createElement("li");
      empty.className = "gx-ev3-program-empty";
      empty.textContent = "Tap blocks below to build";
      programBlocks.append(empty);
    } else {
      program.forEach((id, index) => {
        const block = EV3_FIRST_PROGRAM_BLOCKS[id];
        const chip = document.createElement("li");
        chip.className = "gx-ev3-program-chip";
        chip.dataset.ev3ProgramBlock = id;
        chip.dataset.active = String(index === activeProgramIndex);
        chip.textContent = `${block.glyph} ${block.shortLabel}`;
        programBlocks.append(chip);
      });
    }
    setControlsEnabled(controlsEnabled);
  };
  refreshControls = (): void => {
    pad.replaceChildren();
    actions.replaceChildren();
    mission.dataset.mode = mode;
    strip.dataset.mode = mode;
    if (!retry.hidden) {
      actions.append(retry);
      return;
    }
    if (mode === "program") {
      pad.append(...programButtons);
      actions.append(undo, runProgram, driveMode);
    } else {
      pad.append(...driveButtons);
      actions.append(buildMode);
    }
  };

  const formatClock = (seconds: number): string => `0:${Math.max(0, Math.ceil(seconds)).toString().padStart(2, "0")}`;
  const renderRun = (): void => {
    const run = api.rules.status();
    if (!run) {
      clock.textContent = "--:--";
      mission.dataset.phase = "idle";
      return;
    }
    clock.textContent = formatClock(timeLimit - run.elapsedSeconds);
    mission.dataset.phase = run.phase;
    mission.dataset.misses = String(misses);
    if (run.phase !== lastPhase) {
      if (run.phase === "complete") {
        runner.stop();
        activeProgramIndex = null;
        api.pause(true);
        say(`You did it! Blue target reached in ${run.elapsedSeconds.toFixed(1)} seconds.`);
        setControlsEnabled(false);
        retry.hidden = false;
        refreshProgram();
        refreshControls();
      } else if (run.phase === "expired") {
        runner.stop();
        activeProgramIndex = null;
        api.pause(true);
        say("Time's up. Good try — tap Try again and aim for blue.");
        setControlsEnabled(false);
        retry.hidden = false;
        refreshProgram();
        refreshControls();
      }
      lastPhase = run.phase;
    }
  };

  if (missionReady) {
    // Start when the instructions appear, not while the application's dynamic import is still
    // loading. Reset is itself public rules vocabulary and returns the robot to the scene's spawn.
    const reset = resetAttempt();
    lastPhase = reset.value?.phase ?? "idle";
    eventCursor = api.events().sequence;
    api.pause(true);
    refreshProgram();
    refreshControls();
    renderRun();
  } else {
    say(driveable ? "This lab has no First Drive mission loaded." : "This lab has no drive base loaded.");
    clock.textContent = "--:--";
  }

  const processFrame = (deltaSeconds: number, advanceProgram: boolean): void => {
    const page = api.events(eventCursor);
    eventCursor = page.sequence;
    const run = api.rules.status();
    if (run?.phase === "running") {
      for (const event of page.events) {
        if (
          event.type === "trigger.enter"
          && event.data.entityId === EV3_DRIVE_BASE_ID
          && missIds.has(String(event.data.triggerId ?? ""))
        ) {
          misses += 1;
          say(runner.state().running
            ? `Red zone on block ${(runner.state().activeIndex ?? 0) + 1}. Let it finish, then steer back toward blue.`
            : (misses === 1
              ? "That was a red zone. Steer back toward blue — you've still got this!"
              : "Red again. Ease toward the middle, then aim for blue."));
        }
      }
    }
    renderRun();
    if (advanceProgram && api.rules.status()?.phase === "running") runner.advance(deltaSeconds);
    renderRun();
  };

  const unsubscribeFrame = options.subscribeFrame((deltaSeconds) => {
    processFrame(Math.min(deltaSeconds, 1 / 20), !deterministicMode);
  });

  root.append(mission, exit, strip);

  const surfaceState = (): Ev3MissionStripState => {
    const run = api.rules.status();
    const rover = api.query({ ids: [EV3_DRIVE_BASE_ID] })[0] ?? null;
    const runnerState = runner.state();
    return {
      mode,
      mission: run ? {
        phase: run.phase,
        elapsedSeconds: run.elapsedSeconds,
        remainingSeconds: Math.max(0, timeLimit - run.elapsedSeconds),
        misses,
      } : null,
      rover: rover ? {
        position: [...rover.position] as [number, number, number],
        velocity: rover.physics?.linearVelocity
          ? [...rover.physics.linearVelocity] as [number, number, number]
          : null,
        headingDegrees: rover.steering?.headingDegrees ?? null,
      } : null,
      program: {
        blocks: [...program],
        running: runnerState.running,
        activeIndex: runnerState.activeIndex,
        atLimit: program.length >= EV3_FIRST_PROGRAM_MAX_BLOCKS,
      },
      nestor: status.textContent ?? "",
    };
  };

  return {
    status: () => status.textContent ?? "",
    state: surfaceState,
    advanceTime: (milliseconds) => {
      if (!Number.isFinite(milliseconds) || milliseconds < 0) {
        throw new RangeError("advanceTime requires non-negative milliseconds");
      }
      if (!deterministicMode) {
        deterministicMode = true;
        api.pause(true);
      }
      const steps = Math.ceil(milliseconds / (1000 / 60));
      for (let index = 0; index < steps; index += 1) {
        api.step(1 / 60);
        processFrame(1 / 60, true);
      }
      if (steps === 0) processFrame(0, false);
      return surfaceState();
    },
    dispose: () => {
      unsubscribeFrame();
      runner.stop();
      mission.remove();
      exit.remove();
      strip.remove();
    },
  };
}
