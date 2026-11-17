/** Shared document/runtime boundary. Controls are transient; wheel attachments are authored. */
export function validateVehicleDefinition(value, label = "steering.vehicle") {
  const keys = ["wheels", "radius", "suspensionRestLength", "suspensionStiffness", "suspensionCompression", "suspensionRelaxation", "maxSuspensionTravel", "maxSuspensionForce", "frictionSlip", "engineForce", "brakeForce", "maxSteerDegrees", "steerRateDegrees", "maxSpeed", "steeringSpeedFactor"];
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw new Error(`Unsupported ${label}.${key}`);
  const limits = { radius: [.01, 10], suspensionRestLength: [.01, 10], suspensionStiffness: [.01, 1000], suspensionCompression: [0, 100], suspensionRelaxation: [0, 100], maxSuspensionTravel: [0, 10], maxSuspensionForce: [1, 1000000], frictionSlip: [.01, 100], engineForce: [0, 100000], brakeForce: [0, 100000], maxSteerDegrees: [0, 80], steerRateDegrees: [1, 3600], maxSpeed: [.1, 1000] };
  for (const [key, [min, max]] of Object.entries(limits)) if (!Number.isFinite(value[key]) || value[key] < min || value[key] > max) throw new Error(`${label}.${key} must be ${min}..${max}`);
  if (value.steeringSpeedFactor !== undefined && (!Number.isFinite(value.steeringSpeedFactor) || value.steeringSpeedFactor < 0 || value.steeringSpeedFactor > 1)) throw new Error(`${label}.steeringSpeedFactor must be 0..1`);
  if (!Array.isArray(value.wheels) || value.wheels.length < 2 || value.wheels.length > 16) throw new Error(`${label}.wheels must contain 2..16 wheels`);
  const ids = new Set();
  for (const wheel of value.wheels) {
    if (!wheel || typeof wheel !== "object" || Array.isArray(wheel)) throw new Error(`${label}.wheel must be an object`);
    for (const key of Object.keys(wheel)) if (!["entityId", "connection", "steer", "driven", "brake"].includes(key)) throw new Error(`Unsupported ${label}.wheel.${key}`);
    if (typeof wheel.entityId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,127}$/.test(wheel.entityId) || ids.has(wheel.entityId)) throw new Error(`${label} needs distinct stable wheel entity ids`);
    ids.add(wheel.entityId);
    if (!Array.isArray(wheel.connection) || wheel.connection.length !== 3 || wheel.connection.some(n => !Number.isFinite(n) || Math.abs(n) > 100)) throw new Error(`${label}.wheel.connection must be a finite xyz attachment`);
    for (const key of ["steer", "driven", "brake"]) if (typeof wheel[key] !== "boolean") throw new Error(`${label}.wheel.${key} must be boolean`);
  }
  return value;
}
