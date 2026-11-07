/** Physical metres / seconds. No aiming, minimum impulse, or race simulation lives here. */
export type ThrowPoint = [number, number, number];
type Sample = { at: number; point: ThrowPoint };
export type BallsyThrow = { position: ThrowPoint; velocity: ThrowPoint };
export const BALLSY_THROW_LIMITS = {
  historyMs: 100, maximumGapMs: 80, minimumSpanMs: 24,
  maximumSpeed: 6.75, grabDistance: 0.14,
} as const;

const finitePoint = (point: ThrowPoint): boolean => point.length === 3 && point.every(Number.isFinite);
export function canGrabBallsyBalloon(hand: ThrowPoint, balloon: ThrowPoint): boolean {
  return finitePoint(hand) && finitePoint(balloon)
    && Math.hypot(...hand.map((value, i) => value - balloon[i])) <= BALLSY_THROW_LIMITS.grabDistance;
}

/** A vector is the difference of two transformed points, never a normalized direction. */
export function ballsyThrowInSpace(thrown: BallsyThrow, transformPoint: (point: ThrowPoint) => ThrowPoint): BallsyThrow {
  const position = transformPoint([...thrown.position]);
  const end = transformPoint(thrown.position.map((value, axis) => value + thrown.velocity[axis]) as ThrowPoint);
  return { position, velocity: end.map((value, axis) => value - position[axis]) as ThrowPoint };
}

/** One owner, one release. Lost tracking and cancellation cannot create a projectile. */
export class BallsyThrowGesture {
  private owner: object | string | null = null;
  private samples: Sample[] = [];
  private reason = "";

  start(owner: object | string, point: ThrowPoint, at: number): boolean {
    if (this.owner !== null || !finitePoint(point) || !Number.isFinite(at)) return false;
    this.owner = owner; this.reason = "";
    this.samples = [{ at, point: [...point] }];
    return true;
  }

  sample(owner: object | string, point: ThrowPoint, at: number): boolean {
    if (owner !== this.owner) return false;
    const previous = this.samples.at(-1)!;
    const elapsed = at - previous.at;
    if (!finitePoint(point) || !Number.isFinite(at) || elapsed < 0 || elapsed > BALLSY_THROW_LIMITS.maximumGapMs) {
      this.cancel("tracking-gap"); return false;
    }
    const distance = Math.hypot(...point.map((value, i) => value - previous.point[i]));
    if (elapsed === 0) {
      if (distance > 1e-8) { this.cancel("invalid-timestamp"); return false; }
      return true;
    }
    // A discontinuous pose is not a powerful throw. Tolerate ordinary tracking noise.
    if (distance > 0.035 + 3 * BALLSY_THROW_LIMITS.maximumSpeed * elapsed / 1000) {
      this.cancel("tracking-jump"); return false;
    }
    this.samples.push({ at, point: [...point] });
    this.samples = this.samples.filter((sample) => at - sample.at <= BALLSY_THROW_LIMITS.historyMs).slice(-20);
    return true;
  }

  release(owner: object | string, point: ThrowPoint, at: number): BallsyThrow | null {
    if (!this.sample(owner, point, at)) return null;
    const samples = this.samples;
    this.cancel("released");
    if (samples.length < 2 || samples.at(-1)!.at - samples[0].at < BALLSY_THROW_LIMITS.minimumSpanMs) return null;
    const averageTime = samples.reduce((total, sample) => total + sample.at, 0) / samples.length;
    const denominator = samples.reduce((total, sample) => total + (sample.at - averageTime) ** 2, 0);
    // Least-squares slope over the recent physical trajectory, including the release pose.
    const velocity = [0, 1, 2].map((axis) => samples.reduce((total, sample) =>
      total + (sample.at - averageTime) * sample.point[axis], 0) / denominator * 1000) as ThrowPoint;
    const speed = Math.hypot(...velocity);
    if (speed > BALLSY_THROW_LIMITS.maximumSpeed) for (let axis = 0; axis < 3; axis++) velocity[axis] *= BALLSY_THROW_LIMITS.maximumSpeed / speed;
    return { position: [...point], velocity };
  }

  cancel(reason = "cancelled"): void { this.owner = null; this.samples = []; this.reason = reason; }
  isHeldBy(owner: object | string): boolean { return this.owner === owner; }
  state(): { held: boolean; samples: number; reason: string } {
    return { held: this.owner !== null, samples: this.samples.length, reason: this.reason };
  }
}
