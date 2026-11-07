import { ballsyButton, type BallsyPad } from "./ballsy-input";

export type BallsyPadCheck = {
  device: string | null;
  directions: number;
  centred: boolean;
  braked: boolean;
  released: boolean;
  x: number;
  y: number;
  brakeDown: boolean;
};
export const createBallsyPadCheck = (): BallsyPadCheck => ({ device: null, directions: 0, centred: false, braked: false, released: false, x: 0, y: 0, brakeDown: false });
export const ballsyPadReady = (check: BallsyPadCheck): boolean => check.device !== null && check.directions === 15 && check.centred && check.braked && check.released;

/** Observe only the chosen slot. A replacement or disconnect must earn its own receipt. */
export function updateBallsyPadCheck(previous: BallsyPadCheck, pad: BallsyPad | null | undefined, active = true): BallsyPadCheck {
  if (!pad?.connected || pad.mapping !== "standard") return createBallsyPadCheck();
  const device = `${pad.index}|${pad.id}|${pad.axes.length}|${pad.buttons.length}`;
  const next = previous.device === device ? { ...previous } : { ...createBallsyPadCheck(), device };
  const finite = Number.isFinite(pad.axes[0]) && Number.isFinite(pad.axes[1]);
  next.x = finite ? Math.max(-1, Math.min(1, pad.axes[0])) : 0;
  next.y = finite ? Math.max(-1, Math.min(1, pad.axes[1])) : 0;
  next.brakeDown = ballsyButton(pad, 0);
  if (!active || !finite) return next;
  if (next.x < -0.6) next.directions |= 1;
  if (next.x > 0.6) next.directions |= 2;
  if (next.y < -0.6) next.directions |= 4;
  if (next.y > 0.6) next.directions |= 8;
  const neutral = Math.hypot(next.x, next.y) < 0.18;
  if (next.directions === 15 && neutral) next.centred = true;
  if (next.centred && next.brakeDown) next.braked = true;
  if (next.braked && !next.brakeDown && neutral) next.released = true;
  return next;
}

export function ballsyPadInstruction(check: BallsyPadCheck): string {
  if (!check.device) return "Appuie sur un bouton de ta manette pour la détecter.";
  if (check.directions !== 15) return "Fais un tour complet avec le stick gauche.";
  if (!check.centred) return "Relâche le stick au centre.";
  if (!check.braked) return "Appuie sur le bouton du bas pour freiner.";
  if (!check.released) return "Relâche le frein et le stick.";
  return "Stick et frein vérifiés !";
}
