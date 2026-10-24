export interface PilotInput {
  x: number;
  y: number;
  boost: boolean;
  /** Knife-edge: -1 roll left, +1 roll right, 0 level. */
  roll: number;
}

/** Menu-level actions shared by keyboard, Xbox pads and Quest controllers. */
export type UiAction = "up" | "down" | "left" | "right" | "ok" | "back" | "pause" | "menu";

export interface UiEvent {
  action: UiAction;
  source: "key" | "pad" | "xr";
}

const P1 = {
  left: ["KeyA"],
  right: ["KeyD"],
  up: ["KeyW"],
  down: ["KeyS"],
  boost: ["Space", "ShiftLeft", "KeyF"],
  rollLeft: ["KeyQ"],
  rollRight: ["KeyE"]
};

const P2 = {
  left: ["ArrowLeft"],
  right: ["ArrowRight"],
  up: ["ArrowUp"],
  down: ["ArrowDown"],
  boost: ["ShiftRight", "Enter", "NumpadEnter", "Numpad0", "ControlRight", "Slash"],
  rollLeft: ["Comma", "Numpad1"],
  rollRight: ["Period", "Numpad3"]
};

const KEY_ACTIONS: Record<string, UiAction> = {
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  Enter: "ok",
  NumpadEnter: "ok",
  Space: "ok",
  Escape: "back",
  Backspace: "back",
  KeyP: "pause",
  KeyM: "menu"
};

const GAME_KEYS = new Set([...Object.values(P1).flat(), ...Object.values(P2).flat(), ...Object.keys(KEY_ACTIONS)]);

/** Standard-mapping buttons of an Xbox pad. */
const PAD = { a: 0, b: 1, lb: 4, rb: 5, rt: 7, view: 8, start: 9, up: 12, down: 13, left: 14, right: 15 };
const DEADZONE = 0.22;
const REPEAT_DELAY = 0.38;
const REPEAT_RATE = 0.14;

interface PadMemory {
  buttons: boolean[];
  dir: UiAction | null;
  held: number;
}

/** Keyboard split in two halves, one Xbox pad per pilot, plus Quest controllers in VR. */
export class RaceInput {
  private readonly down = new Set<string>();
  private readonly events: UiEvent[] = [];
  private readonly padMemory = new Map<number, PadMemory>();
  private xrPads: Gamepad[] = [];
  /** Called on the first keyboard or pad input so audio can start. */
  onActivity: (() => void) | null = null;

  constructor() {
    window.addEventListener("keydown", (event) => {
      if (GAME_KEYS.has(event.code)) {
        event.preventDefault();
      }
      if (!event.repeat) {
        const action = KEY_ACTIONS[event.code];
        if (action) {
          this.events.push({ action, source: "key" });
        }
      } else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
        const action = KEY_ACTIONS[event.code];
        if (action) this.events.push({ action, source: "key" });
      }
      this.down.add(event.code);
      this.onActivity?.();
    });
    window.addEventListener("keyup", (event) => {
      this.down.delete(event.code);
    });
    window.addEventListener("blur", () => this.down.clear());
  }

  /** Controllers of the current WebXR session (Quest Touch), refreshed each frame. */
  setXrPads(pads: Gamepad[]): void {
    this.xrPads = pads;
  }

  private any(codes: string[]): boolean {
    return codes.some((code) => this.down.has(code));
  }

  /** Connected standard gamepads in a stable order (by index). */
  private pads(): Gamepad[] {
    const list = typeof navigator.getGamepads === "function" ? navigator.getGamepads() : [];
    return [...list].filter((p): p is Gamepad => p !== null && p.connected);
  }

  padCount(): number {
    return this.pads().length;
  }

  /** Poll pads for menu actions (edge-detected, with stick auto-repeat). */
  poll(dt: number): void {
    const pads = this.pads();
    const all: Array<[number, Gamepad, "std" | "xr"]> = pads.map((p) => [p.index, p, "std"]);
    this.xrPads.forEach((p, i) => all.push([100 + i, p, "xr"]));
    for (const [id, pad, kind] of all) {
      let mem = this.padMemory.get(id);
      if (!mem) {
        mem = { buttons: [], dir: null, held: 0 };
        this.padMemory.set(id, mem);
      }
      const pressed = (i: number): boolean => Boolean(pad.buttons[i]?.pressed);
      const edge = (i: number): boolean => pressed(i) && !mem.buttons[i];
      if (kind === "std") {
        if (edge(PAD.a)) this.push("ok");
        if (edge(PAD.b)) this.push("back");
        if (edge(PAD.start)) this.push("pause");
        if (edge(PAD.view)) this.push("menu");
      } else {
        // xr-standard: 0 trigger, 4 A/X, 5 B/Y.
        if (edge(0) || edge(4)) this.push("ok", "xr");
        if (edge(5)) this.push("back", "xr");
      }
      const ax = kind === "std" ? pad.axes[0] ?? 0 : pad.axes[2] ?? 0;
      const ay = kind === "std" ? pad.axes[1] ?? 0 : pad.axes[3] ?? 0;
      let dir: UiAction | null = null;
      if (kind === "std" && pressed(PAD.up)) dir = "up";
      else if (kind === "std" && pressed(PAD.down)) dir = "down";
      else if (kind === "std" && pressed(PAD.left)) dir = "left";
      else if (kind === "std" && pressed(PAD.right)) dir = "right";
      else if (Math.max(Math.abs(ax), Math.abs(ay)) > 0.6) {
        dir = Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? "right" : "left") : ay > 0 ? "down" : "up";
      }
      if (dir !== mem.dir) {
        mem.dir = dir;
        mem.held = 0;
        if (dir) this.push(dir, kind === "xr" ? "xr" : "pad");
      } else if (dir) {
        mem.held += dt;
        if (mem.held > REPEAT_DELAY) {
          mem.held -= REPEAT_RATE;
          this.push(dir, kind === "xr" ? "xr" : "pad");
        }
      }
      mem.buttons = pad.buttons.map((b) => b.pressed);
      if (pad.buttons.some((b) => b.pressed)) {
        this.onActivity?.();
      }
    }
  }

  private push(action: UiAction, source: "pad" | "xr" = "pad"): void {
    this.events.push({ action, source });
  }

  /** Menu actions since the previous call. */
  takeEvents(): UiEvent[] {
    return this.events.splice(0, this.events.length);
  }

  pilot(index: 0 | 1): PilotInput {
    const map = index === 0 ? P1 : P2;
    let x = Number(this.any(map.right)) - Number(this.any(map.left));
    let y = Number(this.any(map.up)) - Number(this.any(map.down));
    let boost = this.any(map.boost);
    let roll = Number(this.any(map.rollRight)) - Number(this.any(map.rollLeft));
    const pad = this.pads()[index];
    if (pad) {
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      if (Math.abs(ax) > DEADZONE) x = ax;
      if (Math.abs(ay) > DEADZONE) y = -ay;
      const button = (i: number): boolean => Boolean(pad.buttons[i]?.pressed);
      if (button(PAD.left)) x = -1;
      if (button(PAD.right)) x = 1;
      if (button(PAD.up)) y = 1;
      if (button(PAD.down)) y = -1;
      boost = boost || button(PAD.a) || button(PAD.rt);
      if (button(PAD.lb)) roll = -1;
      if (button(PAD.rb)) roll = 1;
    }
    if (index === 0) {
      for (const xr of this.xrPads) {
        const ax = xr.axes[2] ?? 0;
        const ay = xr.axes[3] ?? 0;
        if (Math.abs(ax) > DEADZONE) x = ax;
        if (Math.abs(ay) > DEADZONE) y = -ay;
        boost = boost || Boolean(xr.buttons[0]?.pressed);
        // Grip: knife-edge, towards the stick (right by default).
        if (xr.buttons[1]?.pressed) roll = ax < -DEADZONE ? -1 : 1;
      }
    }
    return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)), boost, roll };
  }
}
