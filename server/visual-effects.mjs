/** Shared document/runtime contract. These are bounded visual effects, never transform motion. */
export const ENERGY_FIELDS = Object.freeze(["id", "blend", "rimColor", "rimPower", "rimIntensity", "rimOpacity", "flowSpeed", "flowScale", "flowStrength"]);
export const MODULATE_FIELDS = Object.freeze(["id", "type", "property", "minimumFactor", "maximumFactor", "frequencyHz", "phaseDegrees", "startSeconds"]);
export const VISUAL_LIMITS = Object.freeze({
  rimPower: [0.25, 12], rimIntensity: [0, 8], flowSpeed: [-8, 8], flowScale: [0.1, 64], flowStrength: [0, 4],
  minimumFactor: [0, 4], maximumFactor: [0, 4], frequencyHz: [0, 8], phaseDegrees: [-360000, 360000], startSeconds: [0, 1e9],
});
const only = (value, fields, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid ${label}`);
  for (const key of Object.keys(value)) if (!fields.includes(key)) throw new Error(`Unsupported ${label}.${key}`);
};
const numbers = (value, keys, label) => {
  for (const key of keys) if (value[key] !== undefined) {
    const [min, max] = VISUAL_LIMITS[key];
    if (!Number.isFinite(value[key]) || value[key] < min || value[key] > max) throw new Error(`${label}.${key} must be ${min}..${max}`);
  }
};
export function validateEnergyShader(value) {
  only(value, ENERGY_FIELDS, "energy");
  if (value.id !== "energy") throw new Error("Invalid energy shader id");
  if (value.blend !== undefined && !["normal", "additive"].includes(value.blend)) throw new Error("energy.blend must be normal or additive");
  if (value.rimColor !== undefined && (typeof value.rimColor !== "string" || !/^#[0-9a-f]{6}$/i.test(value.rimColor))) throw new Error("energy.rimColor must be #rrggbb");
  if (value.rimOpacity !== undefined && typeof value.rimOpacity !== "boolean") throw new Error("energy.rimOpacity must be boolean");
  numbers(value, ["rimPower", "rimIntensity", "flowSpeed", "flowScale", "flowStrength"], "energy");
}
export function validateModulateBehavior(value) {
  only(value, MODULATE_FIELDS, "modulate");
  if (value.type !== "modulate" || !["intensity", "emissiveIntensity"].includes(value.property)) throw new Error("modulate.property must be intensity or emissiveIntensity");
  if (value.id !== undefined && (typeof value.id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/.test(value.id))) throw new Error("Invalid modulate id");
  numbers(value, ["minimumFactor", "maximumFactor", "frequencyHz", "phaseDegrees", "startSeconds"], "modulate");
  if ((value.minimumFactor ?? 0.75) > (value.maximumFactor ?? 1.25)) throw new Error("modulate.minimumFactor must not exceed maximumFactor");
}
