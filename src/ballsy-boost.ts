/** Directional track strips reward a clean racing line, never a stationary parked ball. */
export const BALLSY_BOOSTS = [
  { x: 3, z: 8.8, direction: [1, 0] },
  { x: -4, z: -8.8, direction: [-1, 0] },
  { x: -13.5, z: -2, direction: [0, 1] },
] as const;
export type BallsyBoost = { remaining: number; cooldown: number; count: number; strip: number };
export const createBallsyBoost = (): BallsyBoost => ({ remaining: 0, cooldown: 0, count: 0, strip: -1 });
export function advanceBallsyBoost(state: BallsyBoost, seconds: number, position: readonly number[], velocity: readonly number[], allowed: boolean): [number, number] | null {
  state.remaining = Math.max(0, state.remaining - seconds);
  state.cooldown = Math.max(0, state.cooldown - seconds);
  const index = BALLSY_BOOSTS.findIndex((strip) => Math.abs(position[0] - strip.x) < 1.2 && Math.abs(position[2] - strip.z) < 1.25 && position[1] < 1.6);
  const entered = index >= 0 && index !== state.strip;
  state.strip = index;
  if (!allowed) { state.remaining = 0; return null; }
  if (!entered || state.cooldown > 0) return null;
  const direction = BALLSY_BOOSTS[index].direction;
  if (velocity[0] * direction[0] + velocity[2] * direction[1] < 1.2) return null;
  state.remaining = 0.9; state.cooldown = 2; state.count++;
  return [direction[0] * 2.4, direction[1] * 2.4];
}
