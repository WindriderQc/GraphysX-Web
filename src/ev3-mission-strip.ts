// The child-facing surface for the EV3 Robotics Mission Lab.
//
// It exists because of a measurement, not a preference. Reaching the lab through Browse Scenes
// opens the Scene Editor: at 800x480 that is four authoring panels around a postage stamp of the
// lab, with **218 controls, every one of them under 44px tall**. The editor is a correct tool
// aimed at the wrong person. A seven-year-old on a Raspberry Pi touchscreen needs a handful of
// targets big enough to hit with a thumb, and nothing else.
//
// Every control here is an ordinary `api.*` call on vocabulary the scene already declares —
// `api.steer` on the drive base, `api.interact` on the gripper and the launch button. There is no
// bespoke host state and no second command path, which is the invariant that lets an agent do
// anything a child can do and vice versa.
//
// Deliberately NOT here: mission selection, block programming, hardware, scoring, Nestor. Those
// are the rest of the KidX slice. This is the smallest thing that makes the lab usable by the
// person it was built for.

import type { GraphysXAgentWorldApi } from "./agent-world-runtime";

/** The scene ids this surface drives. All three are declared by `ev3-robotics-lab.ts`. */
export const EV3_DRIVE_BASE_ID = "ev3-drive-base";
export const EV3_GRIPPER_CONTROL_ID = "ev3-gripper-bot:gripper-control";
export const EV3_LAUNCH_BUTTON_ID = "ev3-launch-button";

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
  /** What the strip is currently telling the child, so a smoke can read it. */
  status: () => string;
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
.gx-ev3 button{width:${EV3_TOUCH_TARGET_PX}px;height:${EV3_TOUCH_TARGET_PX}px;border-radius:18px;border:2px solid rgba(120,220,255,.5);
  background:rgba(9,26,36,.88);color:#eaf7ff;font:800 15px/1.1 var(--gx-font);cursor:pointer;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;
  -webkit-tap-highlight-color:transparent;touch-action:manipulation;backdrop-filter:blur(8px)}
.gx-ev3 button span.gx-ev3-glyph{font-size:26px;line-height:1}
.gx-ev3 button:active,.gx-ev3 button[data-held="true"]{background:rgba(38,120,150,.95);border-color:#7fe6ff;transform:scale(.96)}
.gx-ev3 button:focus-visible{outline:3px solid #7fe6ff;outline-offset:3px}
.gx-ev3-wide{width:auto!important;min-width:${EV3_TOUCH_TARGET_PX * 2}px;padding:0 18px}
.gx-ev3-status{position:fixed;left:14px;top:14px;z-index:30;max-width:min(60vw,520px);pointer-events:none;
  padding:10px 14px;border-radius:12px;background:rgba(9,26,36,.82);color:#dff4ff;font:600 15px/1.25 var(--gx-font);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;backdrop-filter:blur(8px)}
.gx-ev3-exit{position:fixed;right:14px;top:14px;z-index:30;pointer-events:auto;
  min-height:48px;padding:0 16px;border-radius:12px;border:2px solid rgba(120,220,255,.45);
  background:rgba(9,26,36,.82);color:#dff4ff;font:700 14px/1 var(--gx-font);cursor:pointer;touch-action:manipulation}
/* The render-settings disclosure is pinned bottom-right at z-index 120 and lands on top of the
   Launch button, clipping it to "Laun". It is a developer control and a child has no use for it,
   so the application surface hides it rather than dodging around it. */
body:has(.gx-ev3) .gx-display-settings{display:none}
@media (max-height:520px){
  .gx-ev3{padding:8px 10px calc(8px + env(safe-area-inset-bottom))}
  .gx-ev3-status{font-size:13px;padding:8px 11px}
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
): Ev3MissionStrip {
  injectStyleOnce();

  const has = (id: string): boolean => api.query({ ids: [id] }).length === 1;
  const driveable = has(EV3_DRIVE_BASE_ID);

  const status = document.createElement("div");
  status.className = "gx-ev3-status";
  status.setAttribute("role", "status");
  const say = (text: string): void => { status.textContent = text; };
  say(driveable ? "Drive the robot. Hold a button." : "This lab has no drive base loaded.");

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

  const tap = (label: string, glyph: string, run: () => void): HTMLButtonElement => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.ev3 = label.toLowerCase();
    button.className = "gx-ev3-wide";
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

  if (driveable) {
    pad.append(
      held("Left", "◀", () => { api.steer(EV3_DRIVE_BASE_ID, { turn: -1, thrust: 0.6 }); say("Turning left."); }),
      held("Go", "▲", () => { api.steer(EV3_DRIVE_BASE_ID, { headingDegrees: 0, thrust: 1 }); say("Driving forward."); }),
      held("Right", "▶", () => { api.steer(EV3_DRIVE_BASE_ID, { turn: 1, thrust: 0.6 }); say("Turning right."); }),
    );
  }

  // Both of these fire an interaction the scene declares. If a lab is loaded without one of
  // them the button is not offered, rather than offered and dead.
  if (has(EV3_GRIPPER_CONTROL_ID)) {
    actions.append(tap("Grab", "✊", () => {
      const result = api.interact(EV3_GRIPPER_CONTROL_ID, "toggle-gripper");
      say(result.ok ? "The gripper opened and closed." : "The gripper did not answer.");
    }));
  }
  if (has(EV3_LAUNCH_BUTTON_ID)) {
    actions.append(tap("Launch", "🚀", () => {
      const result = api.interact(EV3_LAUNCH_BUTTON_ID, "initiate-launch");
      say(result.ok ? "Rocket away — the Mars outpost is lit." : "The launch button did not answer.");
    }));
  }

  root.append(status, exit, strip);

  return {
    status: () => status.textContent ?? "",
    dispose: () => {
      if (driveable) api.steer(EV3_DRIVE_BASE_ID, { thrust: 0, turn: 0 });
      status.remove();
      exit.remove();
      strip.remove();
    },
  };
}
