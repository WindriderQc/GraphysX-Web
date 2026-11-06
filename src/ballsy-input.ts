/** Standard Gamepad API only. Brand names do not prove a usable browser mapping. */
export type BallsyPad = {
  index: number;
  connected: boolean;
  mapping: string;
  id: string;
  axes: readonly number[];
  buttons: readonly { pressed: boolean; value: number }[];
};
export type BallsyDrive = { headingDegrees?: number; thrust: number; turn: number };
export type BallsySlots = [number | null, number | null];

/** Preserve slots through sparse arrays and unplugging; never swap players mid-race. */
export function assignBallsyPads(slots: BallsySlots, pads: readonly (BallsyPad | null)[]): BallsySlots {
  const next: BallsySlots = [...slots];
  for (const pad of pads) {
    if (!pad?.connected || pad.mapping !== "standard" || next.includes(pad.index)) continue;
    const empty = next.indexOf(null);
    if (empty >= 0) next[empty] = pad.index;
  }
  return next;
}

const finiteAxis = (value: number | undefined): number => Number.isFinite(value) ? Math.max(-1, Math.min(1, value!)) : 0;
export const ballsyButton = (pad: BallsyPad | null | undefined, index: number): boolean =>
  !!pad?.connected && pad.mapping === "standard" && !!(pad.buttons[index]?.pressed || pad.buttons[index]?.value > 0.5);

/** Absolute, screen-aligned aiming: right = +x, up = -z. No tank steering to learn. */
export function readBallsyDrive(slot: number, keys: ReadonlySet<string>, pad?: BallsyPad | null): BallsyDrive {
  const held = (...codes: string[]): boolean => codes.some((code) => keys.has(code));
  const keyboardX = slot === 0 ? Number(held("ArrowRight")) - Number(held("ArrowLeft")) : Number(held("KeyD")) - Number(held("KeyA", "KeyQ"));
  const keyboardZ = slot === 0 ? Number(held("ArrowDown")) - Number(held("ArrowUp")) : Number(held("KeyS")) - Number(held("KeyW", "KeyZ"));
  const usePad = pad?.connected && pad.mapping === "standard";
  const x = keyboardX || keyboardZ ? keyboardX : usePad ? finiteAxis(pad.axes[0]) : 0;
  const z = keyboardX || keyboardZ ? keyboardZ : usePad ? finiteAxis(pad.axes[1]) : 0;
  const magnitude = Math.hypot(x, z);
  const braking = held(slot === 0 ? "Space" : "ShiftLeft", ...(slot === 1 ? ["ShiftRight"] : [])) || ballsyButton(pad, 0);
  if (braking) return { thrust: -1, turn: 0 };
  if (magnitude < 0.18) return { thrust: 0, turn: 0 };
  return {
    headingDegrees: (Math.atan2(x, -z) * 180 / Math.PI + 360) % 360,
    thrust: Math.min(1, magnitude),
    turn: 0,
  };
}
