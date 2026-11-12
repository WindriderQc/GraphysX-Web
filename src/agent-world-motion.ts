import { Quaternion, Vector3 } from "three";
export { validateMotionBehavior } from "../server/motion-behaviors.mjs";

export type KeyframeTrackBehavior = {
  id?: string; type: "keyframes"; durationSeconds: number; startSeconds?: number; loop?: boolean;
  /** Seconds within the clip, followed by a local position or quaternion. */
  positions?: [number, number, number, number][];
  rotations?: [number, number, number, number, number][];
};
export type FlightBehavior = {
  id?: string; type: "flight"; speed?: number; rollRateDegrees?: number; pitchUpDegrees?: number; pitchDownDegrees?: number;
};
export type FlightInput = { roll?: number; pitch?: number; thrust?: number; airbrake?: boolean; reset?: boolean };
export type FlightPose = { position: Vector3; rotation: Quaternion; input: Required<Omit<FlightInput, "reset">> };

export function sampleKeyframeTrack(behavior: KeyframeTrackBehavior, seconds: number, position: Vector3, rotation: Quaternion): void {
  const elapsed = Math.max(0, seconds - (behavior.startSeconds ?? 0));
  const time = behavior.loop ? elapsed % behavior.durationSeconds : Math.min(elapsed, behavior.durationSeconds);
  const sample = (keys: number[][], apply: (a: number[], b: number[], alpha: number) => void): void => {
    const next = keys.findIndex((key) => key[0] > time);
    const a = keys[Math.max(0, next < 0 ? keys.length - 1 : next - 1)];
    const b = next < 0 ? a : keys[next];
    apply(a, b, a === b ? 0 : Math.max(0, (time - a[0]) / (b[0] - a[0])));
  };
  if (behavior.positions?.length) sample(behavior.positions, (a, b, alpha) => {
    position.set(a[1] + (b[1] - a[1]) * alpha, a[2] + (b[2] - a[2]) * alpha, a[3] + (b[3] - a[3]) * alpha);
  });
  if (behavior.rotations?.length) sample(behavior.rotations, (a, b, alpha) => {
    rotation.set(a[1], a[2], a[3], a[4]).normalize().slerp(new Quaternion(b[1], b[2], b[3], b[4]).normalize(), alpha);
  });
}

export function validatedFlightInput(input: FlightInput): FlightInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Flight input must be an object");
  const result: FlightInput = {};
  for (const [field, value] of Object.entries(input)) {
    if (field === "airbrake" || field === "reset") {
      if (typeof value !== "boolean") throw new Error(`Flight ${field} must be boolean`);
      result[field] = value;
    } else if (field === "roll" || field === "pitch" || field === "thrust") {
      if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Flight ${field} must be finite`);
      result[field] = Math.max(-1, Math.min(1, value));
    } else throw new Error(`Unsupported flight input: ${field}`);
  }
  return result;
}

const axisX = new Vector3(1, 0, 0), axisZ = new Vector3(0, 0, 1);
const scratchRotation = new Quaternion(), forward = new Vector3();
/** Source FlightX is kinematic: W/S move along the plane's local X, with no invented lift. */
export function stepFlight(pose: FlightPose, behavior: FlightBehavior, seconds: number): void {
  const degrees = Math.PI / 180;
  const { roll, pitch, thrust, airbrake } = pose.input;
  if (roll) pose.rotation.multiply(scratchRotation.setFromAxisAngle(axisZ, roll * (behavior.rollRateDegrees ?? (0.9 / degrees)) * degrees * seconds)).normalize();
  // Reflect the native left-handed local-X pitch into the shared right-handed world.
  if (pitch) pose.rotation.multiply(scratchRotation.setFromAxisAngle(axisX, -pitch * (pitch > 0 ? behavior.pitchUpDegrees ?? (0.4 / degrees) : (behavior.pitchDownDegrees ?? (0.5 / degrees)) + (airbrake ? 0.1 / degrees : 0)) * degrees * seconds)).normalize();
  forward.copy(axisX).applyQuaternion(pose.rotation);
  pose.position.addScaledVector(forward, thrust * (behavior.speed ?? 18) * seconds);
}
