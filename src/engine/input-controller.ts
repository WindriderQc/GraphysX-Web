export class InputController {
  private readonly keyboardKeys = new Set<string>();
  private readonly mouseButtons = new Set<number>();
  private readonly virtualKeys = new Set<string>();
  private readonly gamepadKeys = new Set<string>();
  private readonly pressed = new Set<string>();
  private lastGamepadPoll = -1;
  private activeGamepadId: string | null = null;
  private gamepadAxes = { forward: 0, turn: 0 };
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.isGameKey(event.code)) {
      event.preventDefault();
    }
    if (!this.keyboardKeys.has(event.code)) {
      this.pressed.add(event.code);
    }
    this.keyboardKeys.add(event.code);
  };
  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (this.isGameKey(event.code)) {
      event.preventDefault();
    }
    this.keyboardKeys.delete(event.code);
  };
  private readonly onBlur = (): void => {
    this.keyboardKeys.clear();
    this.mouseButtons.clear();
    this.virtualKeys.clear();
    this.pressed.clear();
  };
  private readonly onPointerDown = (event: PointerEvent): void => {
    this.mouseButtons.add(event.button);
  };
  private readonly onPointerUp = (event: PointerEvent): void => {
    this.mouseButtons.delete(event.button);
  };

  constructor() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointerup", this.onPointerUp);
  }

  getMoveAxis(): { forward: number; turn: number } {
    this.pollGamepad();
    const localDown = (code: string): boolean => this.keyboardKeys.has(code) || this.virtualKeys.has(code);
    const localForward =
      Number(localDown("KeyW") || localDown("ArrowUp")) -
      Number(localDown("KeyS") || localDown("ArrowDown"));
    const localTurn =
      Number(localDown("KeyD") || localDown("ArrowRight")) -
      Number(localDown("KeyA") || localDown("ArrowLeft"));
    const padForward =
      Number(this.gamepadKeys.has("ArrowUp")) - Number(this.gamepadKeys.has("ArrowDown"));
    const padTurn =
      Number(this.gamepadKeys.has("ArrowRight")) - Number(this.gamepadKeys.has("ArrowLeft"));
    const forward = localForward || this.gamepadAxes.forward || padForward;
    const turn = localTurn || this.gamepadAxes.turn || padTurn;

    return { forward, turn };
  }

  isDown(code: string): boolean {
    this.pollGamepad();
    return this.keyboardKeys.has(code) || this.virtualKeys.has(code) || this.gamepadKeys.has(code);
  }

  consumePress(code: string): boolean {
    this.pollGamepad();
    const wasPressed = this.pressed.has(code);
    this.pressed.delete(code);
    return wasPressed;
  }

  setVirtualKey(code: string, down: boolean): void {
    if (!this.isGameKey(code)) return;
    if (down) {
      if (!this.virtualKeys.has(code)) this.pressed.add(code);
      this.virtualKeys.add(code);
    } else {
      this.virtualKeys.delete(code);
    }
  }

  getInputState(): {
    keyboard: boolean;
    touch: boolean;
    gamepad: { connected: boolean; id: string | null; forward: number; turn: number };
  } {
    this.pollGamepad();
    return {
      keyboard: this.keyboardKeys.size > 0,
      touch: this.virtualKeys.size > 0,
      gamepad: {
        connected: this.activeGamepadId !== null,
        id: this.activeGamepadId,
        forward: Number(this.gamepadAxes.forward.toFixed(3)),
        turn: Number(this.gamepadAxes.turn.toFixed(3))
      }
    };
  }

  getDeviceMonitorState(): {
    connected: boolean;
    id: string | null;
    horizontal: number;
    vertical: number;
    buttons: { fire1: boolean; fire2: boolean; fire3: boolean; jump: boolean };
  } {
    const gamepad = typeof navigator !== "undefined" && typeof navigator.getGamepads === "function"
      ? Array.from(navigator.getGamepads()).find((entry): entry is Gamepad => Boolean(entry?.connected))
      : undefined;
    const applyDeadzone = (value: number): number => Math.abs(value) < 0.19 ? 0 : Math.max(-1, Math.min(1, value));
    const keyboardDown = (...codes: string[]) => codes.some((code) => this.keyboardKeys.has(code));
    return {
      connected: Boolean(gamepad),
      id: gamepad?.id ?? null,
      horizontal: Number(applyDeadzone(gamepad?.axes[0] ?? 0).toFixed(3)),
      vertical: Number(applyDeadzone(-(gamepad?.axes[1] ?? 0)).toFixed(3)),
      buttons: {
        fire1: Boolean(gamepad?.buttons[0]?.pressed || keyboardDown("ControlLeft", "ControlRight") || this.mouseButtons.has(0)),
        fire2: Boolean(gamepad?.buttons[1]?.pressed || keyboardDown("AltLeft", "AltRight") || this.mouseButtons.has(1)),
        fire3: Boolean(gamepad?.buttons[2]?.pressed || keyboardDown("ShiftLeft", "ShiftRight") || this.mouseButtons.has(2)),
        jump: Boolean(gamepad?.buttons[3]?.pressed || keyboardDown("Space"))
      }
    };
  }

  reset(): void {
    this.keyboardKeys.clear();
    this.virtualKeys.clear();
    this.pressed.clear();
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointerup", this.onPointerUp);
  }

  private isGameKey(code: string): boolean {
    return [
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "KeyC",
      "KeyF",
      "KeyR",
      "Space",
      "ShiftLeft",
      "ShiftRight"
    ].includes(code);
  }

  private pollGamepad(): void {
    if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return;
    const now = typeof performance === "undefined" ? Date.now() : performance.now();
    if (now - this.lastGamepadPoll < 8) return;
    this.lastGamepadPoll = now;

    const gamepad = Array.from(navigator.getGamepads()).find((entry): entry is Gamepad => Boolean(entry?.connected));
    const nextKeys = new Set<string>();
    this.activeGamepadId = gamepad?.id ?? null;
    this.gamepadAxes = { forward: 0, turn: 0 };

    if (gamepad) {
      const deadzone = (value: number): number => {
        const absolute = Math.abs(value);
        if (absolute < 0.18) return 0;
        return Math.sign(value) * Math.min(1, (absolute - 0.18) / 0.82);
      };
      const turn = deadzone(gamepad.axes[0] ?? 0);
      const forward = -deadzone(gamepad.axes[1] ?? 0);
      this.gamepadAxes = { forward, turn };

      if (turn < -0.18 || gamepad.buttons[14]?.pressed) nextKeys.add("ArrowLeft");
      if (turn > 0.18 || gamepad.buttons[15]?.pressed) nextKeys.add("ArrowRight");
      if (forward > 0.18 || gamepad.buttons[12]?.pressed) nextKeys.add("ArrowUp");
      if (forward < -0.18 || gamepad.buttons[13]?.pressed) nextKeys.add("ArrowDown");
      if ((gamepad.buttons[7]?.value ?? 0) > 0.18) nextKeys.add("KeyW");
      if ((gamepad.buttons[6]?.value ?? 0) > 0.18) nextKeys.add("KeyS");
      if (gamepad.buttons[0]?.pressed) nextKeys.add("Space");
      if (gamepad.buttons[1]?.pressed) nextKeys.add("KeyB");
      if (gamepad.buttons[2]?.pressed) nextKeys.add("KeyC");
      if (gamepad.buttons[3]?.pressed) nextKeys.add("KeyR");
      if (gamepad.buttons[5]?.pressed) nextKeys.add("KeyF");
      if (gamepad.buttons[10]?.pressed) nextKeys.add("ShiftLeft");
    }

    for (const code of nextKeys) {
      if (!this.gamepadKeys.has(code)) this.pressed.add(code);
    }
    this.gamepadKeys.clear();
    for (const code of nextKeys) this.gamepadKeys.add(code);
  }
}
