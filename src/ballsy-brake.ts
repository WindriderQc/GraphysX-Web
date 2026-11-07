/** Negative native thrust is reverse force, not friction. Aim it against the LIVE
 * velocity, then taper near rest so holding Brake never accelerates backwards.
 * The ordinary steering runtime remains the only body/impulse implementation. */
export function ballsyVelocityBrake(velocity: readonly number[], force: number, mass: number): { headingDegrees?: number; thrust: number; turn: number } {
  const speed = Math.hypot(velocity[0], velocity[2]);
  if (speed < .025 || force <= 0 || mass <= 0) return { thrust: 0, turn: 0 };
  return { headingDegrees: (Math.atan2(velocity[0], -velocity[2]) * 180 / Math.PI + 360) % 360,
    thrust: -Math.min(1, speed * mass * 7 / force), turn: 0 };
}
