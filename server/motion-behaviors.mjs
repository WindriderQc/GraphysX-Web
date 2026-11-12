/** Shared document/runtime validation for source animation and kinematic flight. */
export const MOTION_FIELDS = Object.freeze({
  keyframes: Object.freeze(["id", "type", "durationSeconds", "startSeconds", "loop", "positions", "rotations"]),
  flight: Object.freeze(["id", "type", "speed", "rollRateDegrees", "pitchUpDegrees", "pitchDownDegrees"]),
});

export function validateMotionBehavior(behavior) {
  if (!behavior || typeof behavior !== "object" || Array.isArray(behavior) || !["flight", "keyframes"].includes(behavior.type)) throw new Error("Unsupported motion behavior");
  const fields = MOTION_FIELDS[behavior.type];
  for (const key of Object.keys(behavior)) if (!fields.includes(key)) throw new Error(`Unsupported ${behavior.type} field: ${key}`);
  if (behavior.id !== undefined && (typeof behavior.id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/.test(behavior.id))) throw new Error("Invalid motion behavior id");
  if (behavior.type === "flight") {
    for (const field of ["speed", "rollRateDegrees", "pitchUpDegrees", "pitchDownDegrees"]) {
      const value = behavior[field];
      if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > 1000)) throw new Error(`flight.${field} must be 0..1000`);
    }
    return;
  }
  if (!Number.isFinite(behavior.durationSeconds) || behavior.durationSeconds <= 0 || behavior.durationSeconds > 3600) throw new Error("keyframes.durationSeconds must be > 0 and <= 3600");
  if (behavior.startSeconds !== undefined && (!Number.isFinite(behavior.startSeconds) || behavior.startSeconds < 0 || behavior.startSeconds > 1e9)) throw new Error("Invalid keyframes.startSeconds");
  if (behavior.loop !== undefined && typeof behavior.loop !== "boolean") throw new Error("keyframes.loop must be boolean");
  if (!behavior.positions?.length && !behavior.rotations?.length) throw new Error("Keyframes require a position or rotation track");
  for (const [name, width] of [["positions", 4], ["rotations", 5]]) {
    const keys = behavior[name];
    if (keys === undefined) continue;
    if (!Array.isArray(keys) || !keys.length || keys.length > 512) throw new Error(`keyframes.${name} needs 1..512 keys`);
    let previous = -1;
    for (const key of keys) {
      if (!Array.isArray(key) || key.length !== width || !key.every(value => typeof value === "number" && Number.isFinite(value))) throw new Error(`Invalid keyframes.${name} key`);
      if (key[0] < 0 || key[0] > behavior.durationSeconds || key[0] <= previous) throw new Error("Keyframe times must be strictly increasing within the clip");
      if (name === "positions" && key.slice(1).some(value => Math.abs(value) > 10000)) throw new Error("Keyframe positions must be within +/-10000");
      if (name === "rotations" && (Math.hypot(...key.slice(1)) < 1e-6 || key.slice(1).some(value => Math.abs(value) > 1.001))) throw new Error("Invalid keyframe quaternion");
      previous = key[0];
    }
  }
}
