// Applying commands to a scene *document* — no runtime, no Three.js, no physics engine.
//
// The browser runtime is deliberately more capable than this module. This boundary accepts
// only the document-authoring subset whose validation and merge semantics can be proven here.
// An untrusted live member must never be able to commit JSON that every browser subsequently
// refuses to load; declining an unproven command is safer than persisting it.

const WORLD_SCHEMA = "graphysx.agent-world/v2";
const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/;
const MAX_AUTHORED_ENTITIES = 1_024;
const MAX_DEFINITION_BYTES = 8 * 1024 * 1024;

const ENTITY_TYPES = new Set([
  "group", "agent", "box", "sphere", "icosahedron", "cylinder", "cone", "torus", "plane",
  "spline", "model", "emitter", "terrain", "water", "flock", "crowd", "force-field",
  "formula-field", "dna-tree", "sound", "ambient-light", "directional-light", "point-light",
]);
const PRIMITIVE_TYPES = new Set(["box", "sphere", "icosahedron", "cylinder", "cone", "torus", "plane"]);
const PHYSICS_FORBIDDEN_TYPES = new Set([
  "group", "spline", "emitter", "sound", "terrain", "water", "flock", "crowd", "force-field",
  "formula-field", "dna-tree", "ambient-light", "directional-light", "point-light",
]);
const MOTION_BEHAVIORS = new Set(["spin", "bob", "orbit", "pulse", "look-at", "follow-spline"]);
const ENTITY_KEYS = new Set([
  "id", "label", "type", "parentId", "transform", "material", "modelMaterialOverrides", "geometry",
  "path", "asset", "emitter", "sound", "terrain", "water", "flock", "crowd", "formula", "surface",
  "steering", "dna", "forceField", "agent", "physics", "intensity", "distance", "marker", "visible",
  "castShadow", "receiveShadow", "ephemeral", "tags", "behaviors", "interactions",
]);
const PATCH_KEYS = new Set([
  "label", "parentId", "transform", "material", "modelMaterialOverrides", "surface", "steering", "visible",
  "castShadow", "receiveShadow", "ephemeral", "tags", "intensity", "distance", "marker", "physics", "agent",
  "emitter", "sound", "terrain", "water", "flock", "crowd", "formula", "dna", "forceField", "interactions",
]);
const ENVIRONMENT_KEYS = new Set([
  "background", "sky", "envelope", "post", "lighting", "dayNight", "overlay", "ground", "physics",
]);

const SKY_IDS = new Set(["clearblue", "ballz18-clear-sky", "lostvalley", "skyx", "winter", "clearnight", "nightsky"]);
const OVERLAY_IDS = new Set(["vignette", "starfield", "scanlines"]);
const HDRI_IDS = new Set(["studio-small-08", "studio-garden", "overcast-soil", "lilienstein", "vignaioli-night"]);
const TEXTURE_IDS = new Set([
  "checker", "green-grid", "abstract-cubes", "two-way", "eroded-metal", "rusted-metal", "marble",
  "wood-floor", "classic-alien01", "classic-alien01-normal", "classic-checkerboard", "classic-alien02",
  "classic-alien02-normal", "classic-wood03", "worn-wood", "earth", "moon", "mars", "venus",
  "earth-clouds", "earth-surface", "electronic-board", "concrete", "objet39", "podium", "grass-sample",
  "z-ring", "archive-ball-normal", "spheres", "common-tv3dlogo-diffuse", "common-tv3dlogo-normal", "zack",
]);
// Generated browser catalog mirrored at this trust boundary. Imported/store-backed assets
// remain authorable when they carry their HTTPS URL; an id alone is only safe when every
// released client is guaranteed to know it.
const MODEL_ASSET_IDS = new Set([
  "bush-01", "bush-02", "bush-03", "bush-04", "camp1-post", "camp1-tent1", "camp1-tent2", "camp1-tent3",
  "doman-m", "grass-flower01", "grass-flower02", "grass-reed01", "grass-reed02", "grass-reed03", "ishad-f",
  "port-const1", "port-const2", "port-cottage", "port-cottage2", "port-cottage4", "port-cottage5", "port-fishhouse",
  "port-house01", "port-hut", "port-hut01", "port-hut02", "port-hut03", "port-hut04", "port-hut05", "port-inn01",
  "port-lighthouse", "port-maindocks", "port-market", "port-minidock", "port-pub1", "port-shed1", "port-shippiece",
  "port-shipyard", "port-smalldocks", "port-sunkship", "port-weathervain", "port-windmill", "renzok", "renzok1",
  "renzok-m", "scale-renzok", "scale-renzok1", "shield", "shield1", "sword", "sword1", "tree-dead01", "tree-dead02",
  "tree-dead03", "tree-green01", "tree-green02", "tree-green03", "tree-green04", "tree-green05", "tree-green06",
  "tree-green07", "zokshield", "zoksword", "archive-cobra", "archive-impreza", "archive-piste-ovale",
  "archive-ballctrl-gridxl", "archive-ballctrl", "archive-ballfire", "archive-ballshell", "archive-glyph-0", "archive-glyph-1",
  "archive-glyph-2", "archive-glyph-3", "archive-glyph-4", "archive-glyph-5", "archive-glyph-6", "archive-glyph-7",
  "archive-glyph-8", "archive-glyph-9", "archive-glyph-a", "archive-glyph-b", "archive-glyph-c", "archive-glyph-d",
  "archive-glyph-e", "archive-glyph-f", "archive-glyph-g", "archive-glyph-h", "archive-glyph-i", "archive-glyph-j",
  "archive-glyph-k", "archive-glyph-l", "archive-glyph-m", "archive-glyph-n", "archive-glyph-o", "archive-glyph-p",
  "archive-glyph-q", "archive-glyph-r", "archive-glyph-s", "archive-glyph-t", "archive-glyph-u", "archive-glyph-v",
  "archive-glyph-w", "archive-glyph-x", "archive-glyph-y", "archive-glyph-z", "archive-level1-2011", "archive-map1",
  "archive-slide-large", "archive-suzanne-door-gate", "archive-suzanne-finish-line", "archive-suzanne-level",
  "archive-suzanne-piston-stand", "archive-suzanne-piston-trigger", "archive-suzanne-piston",
  "archive-suzanne-rotator-cube", "archive-suzanne-rotator", "archive-suzanne2-airplane", "archive-suzanne2-boned-gate",
  "archive-suzanne2-super-cage", "archive-tvm-90right", "archive-tvm-ballz-track1", "archive-tvm-corridor",
  "archive-tvm-cubx-btn1", "archive-tvm-cubx-btn2", "archive-tvm-cubx", "archive-tvm-finish-tvm", "archive-tvm-fleche",
  "archive-tvm-half-empty-ball", "archive-tvm-invert-sphere", "archive-tvm-pipe1", "archive-tvm-prisme",
  "archive-tvm-ring-tvm", "archive-tvm-slide1",
]);
const EMITTER_PRESETS = new Set([
  "campfire", "fireball", "ember-smoke", "spark-burst", "plasma-trail", "energy-orb", "firetrail", "shockwave",
]);
const HEIGHTMAP_IDS = new Set(["canyon", "highlands", "basin", "carx", "rolling"]);
const FLOCK_PRESETS = new Set(["starlings", "koi", "orbital-swarm"]);
const CROWD_PRESETS = new Set(["promenade", "pursuit", "throng"]);
const FORMULA_PRESETS = new Set(["parabola-bowl", "slope-ramp", "archive-molecules"]);
const DNA_PRESETS = new Set(["archive-grove", "single-specimen", "mutant-orchard"]);
const FORCE_FIELD_PRESETS = new Set(["gravity-well", "repulsor", "flow-garden", "liquid-pool", "whirlpool"]);

const NESTED_PATCH_FIELDS = new Set([
  "agent", "emitter", "sound", "terrain", "water", "flock", "crowd", "dna", "forceField", "steering",
]);
const PRESET_RESET_FIELDS = new Set(["emitter", "flock", "crowd", "dna", "forceField"]);

export class SceneCommandError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "SceneCommandError";
    this.status = status;
  }
}

function reject(message) {
  throw new SceneCommandError(message);
}

function isRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireRecord(value, label) {
  if (!isRecord(value)) reject(`${label} must be an object`);
  return value;
}

function allowedKeys(value, allowed, label) {
  requireRecord(value, label);
  for (const key of Object.keys(value)) if (!allowed.has(key)) reject(`Unsupported ${label}.${key}`);
}

function requireStableId(value, label) {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) reject(`Invalid ${label}: ${String(value)}`);
}

function requireString(value, label, { allowEmpty = false, maximum = 512 } = {}) {
  if (typeof value !== "string" || (!allowEmpty && !value.trim()) || value.length > maximum) {
    reject(`${label} must be ${allowEmpty ? "a" : "a non-empty"} string of at most ${maximum} characters`);
  }
}

function requireResolvedColor(value, label) {
  // Live authoring deliberately accepts the canonical form emitted by every shipping colour
  // input. Three.js also accepts a large CSS vocabulary, but its parser logs-and-keeps-state
  // for unknown strings; limiting the trust boundary to hex makes acceptance unambiguous.
  if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value)) reject(`${label} must be #rrggbb`);
}

function requireBoolean(value, label) {
  if (typeof value !== "boolean") reject(`${label} must be a boolean`);
}

function requireFinite(value, label, minimum = -Infinity, maximum = Infinity) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    reject(`${label} must be a finite number between ${minimum} and ${maximum}`);
  }
}

function requireInteger(value, label, minimum, maximum) {
  requireFinite(value, label, minimum, maximum);
  if (!Number.isInteger(value)) reject(`${label} must be an integer`);
}

function requireVector(value, length, label, minimum = -Infinity, maximum = Infinity) {
  if (!Array.isArray(value) || value.length !== length) reject(`${label} must contain ${length} finite numbers`);
  value.forEach((component, index) => requireFinite(component, `${label}[${index}]`, minimum, maximum));
}

function requireStringArray(value, label, maximum = 128) {
  if (!Array.isArray(value) || value.length > maximum || value.some((entry) => typeof entry !== "string")) {
    reject(`${label} must be an array of at most ${maximum} strings`);
  }
}

function validateJsonValue(value, label, depth = 0) {
  if (depth > 24) reject(`${label} is nested too deeply`);
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) reject(`${label} must not contain a non-finite number`);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 300_000) reject(`${label} is too large`);
    value.forEach((entry, index) => validateJsonValue(entry, `${label}[${index}]`, depth + 1));
    return;
  }
  if (!isRecord(value)) reject(`${label} must contain only JSON values`);
  for (const [key, entry] of Object.entries(value)) validateJsonValue(entry, `${label}.${key}`, depth + 1);
}

function validateTransform(value, label) {
  allowedKeys(value, new Set(["position", "rotationDegrees", "scale"]), label);
  if (value.position !== undefined) requireVector(value.position, 3, `${label}.position`, -10_000, 10_000);
  if (value.rotationDegrees !== undefined) requireVector(value.rotationDegrees, 3, `${label}.rotationDegrees`, -360_000, 360_000);
  if (value.scale !== undefined) requireVector(value.scale, 3, `${label}.scale`, 0.001, 1_000);
}

function validateTexture(value, label) {
  if (value === null) return;
  allowedKeys(value, new Set(["id", "repeat", "offset", "rotationDegrees"]), label);
  if (!TEXTURE_IDS.has(value.id)) reject(`${label}.id is not a curated live texture: ${String(value.id)}`);
  if (value.repeat !== undefined) requireVector(value.repeat, 2, `${label}.repeat`, 0.01, 128);
  if (value.offset !== undefined) requireVector(value.offset, 2, `${label}.offset`, -128, 128);
  if (value.rotationDegrees !== undefined) requireFinite(value.rotationDegrees, `${label}.rotationDegrees`, -360_000, 360_000);
}

function validateShader(value, label) {
  if (value === null) return;
  requireRecord(value, label);
  if (value.id === "archive-ppl") {
    allowedKeys(value, new Set(["id", "bumpAmount", "lightPosition"]), label);
    requireFinite(value.bumpAmount, `${label}.bumpAmount`, 0, 0.5);
    requireVector(value.lightPosition, 3, `${label}.lightPosition`, -100_000, 100_000);
    return;
  }
  if (value.id === "archive-meshlight") {
    allowedKeys(value, new Set([
      "id", "parallaxStrength", "specularMultiplier", "specularTexture", "lightPosition", "lightColor",
    ]), label);
    requireFinite(value.parallaxStrength, `${label}.parallaxStrength`, 0, 0.5);
    requireFinite(value.specularMultiplier, `${label}.specularMultiplier`, 0, 20);
    validateTexture(value.specularTexture, `${label}.specularTexture`);
    requireVector(value.lightPosition, 3, `${label}.lightPosition`, -100_000, 100_000);
    requireString(value.lightColor, `${label}.lightColor`, { maximum: 128 });
    return;
  }
  reject(`Unknown ${label}.id: ${String(value.id)}`);
}

function validateMaterial(value, label) {
  allowedKeys(value, new Set([
    "color", "emissive", "emissiveIntensity", "roughness", "metalness", "opacity", "wireframe", "texture",
    "normalTexture", "normalScale", "shader",
  ]), label);
  for (const key of ["color", "emissive"]) if (value[key] !== undefined) requireString(value[key], `${label}.${key}`, { maximum: 128 });
  if (value.emissiveIntensity !== undefined) requireFinite(value.emissiveIntensity, `${label}.emissiveIntensity`, 0, 100);
  for (const key of ["roughness", "metalness", "opacity"]) if (value[key] !== undefined) requireFinite(value[key], `${label}.${key}`, 0, 1);
  if (value.wireframe !== undefined) requireBoolean(value.wireframe, `${label}.wireframe`);
  if (value.texture !== undefined) validateTexture(value.texture, `${label}.texture`);
  if (value.normalTexture !== undefined) validateTexture(value.normalTexture, `${label}.normalTexture`);
  if (value.normalScale !== undefined) requireFinite(value.normalScale, `${label}.normalScale`, 0, 8);
  if (value.shader !== undefined) validateShader(value.shader, `${label}.shader`);
}

const MODEL_OVERRIDE_KEYS = new Set([
  "color", "roughness", "metalness", "clearcoat", "clearcoatRoughness", "opacity", "emissive", "emissiveIntensity",
]);

function validateModelMaterialOverrides(value, label, { patch = false } = {}) {
  if (value === null && patch) return;
  requireRecord(value, label);
  if (Object.keys(value).length > 128) reject(`${label} supports at most 128 material slots`);
  for (const [slotId, override] of Object.entries(value)) {
    if (!/^mesh:\d+:[a-z0-9-]+:material:\d+:[a-z0-9-]+$/.test(slotId)) reject(`Invalid material slot id: ${slotId}`);
    if (override === null && patch) continue;
    allowedKeys(override, MODEL_OVERRIDE_KEYS, `${label}.${slotId}`);
    if (Object.keys(override).length === 0) reject(`${label}.${slotId} must change at least one property`);
    for (const key of ["color", "emissive"]) {
      if (override[key] !== undefined && (typeof override[key] !== "string" || !/^#[0-9a-fA-F]{6}$/.test(override[key]))) {
        reject(`${label}.${slotId}.${key} must be #rrggbb`);
      }
    }
    for (const key of ["roughness", "metalness", "clearcoat", "clearcoatRoughness", "opacity"]) {
      if (override[key] !== undefined) requireFinite(override[key], `${label}.${slotId}.${key}`, 0, 1);
    }
    if (override.emissiveIntensity !== undefined) requireFinite(override.emissiveIntensity, `${label}.${slotId}.emissiveIntensity`, 0, 100);
  }
}

function validateGeometry(value, label) {
  allowedKeys(value, new Set(["width", "height", "depth", "radius", "tube", "radialSegments"]), label);
  for (const key of ["width", "height", "depth", "radius", "tube"]) {
    if (value[key] !== undefined) requireFinite(value[key], `${label}.${key}`, 0.0001, 10_000);
  }
  if (value.radialSegments !== undefined) requireInteger(value.radialSegments, `${label}.radialSegments`, 3, 512);
}

function validatePath(value, label) {
  allowedKeys(value, new Set(["points", "closed", "tension"]), label);
  if (!Array.isArray(value.points) || value.points.length < 2 || value.points.length > 256) {
    reject(`${label}.points must contain 2 to 256 vectors`);
  }
  value.points.forEach((point, index) => requireVector(point, 3, `${label}.points[${index}]`, -10_000, 10_000));
  if (value.closed !== undefined) requireBoolean(value.closed, `${label}.closed`);
  if (value.tension !== undefined) requireFinite(value.tension, `${label}.tension`, 0, 1);
}

function validateAsset(value, label) {
  allowedKeys(value, new Set(["id", "url", "format", "fitSize", "alphaTest", "colorKey", "colorKeyTolerance"]), label);
  if (value.id !== undefined) requireString(value.id, `${label}.id`, { maximum: 160 });
  if (value.url !== undefined) {
    requireString(value.url, `${label}.url`, { maximum: 2_048 });
    if (!/^(?:\/|https:\/\/)/i.test(value.url)) reject(`${label}.url must be root-relative or HTTPS`);
  }
  if (!value.url && !MODEL_ASSET_IDS.has(value.id)) reject(`${label} requires a curated asset id or a root-relative/HTTPS URL`);
  if (value.format !== undefined && value.format !== "graphysx-mesh-json") reject(`Unsupported ${label}.format: ${String(value.format)}`);
  if (value.fitSize !== undefined) requireFinite(value.fitSize, `${label}.fitSize`, 0.0001, 10_000);
  if (value.alphaTest !== undefined) requireFinite(value.alphaTest, `${label}.alphaTest`, 0, 1);
  if (value.colorKey !== undefined && (typeof value.colorKey !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value.colorKey))) {
    reject(`${label}.colorKey must be #rrggbb`);
  }
  if (value.colorKeyTolerance !== undefined) requireFinite(value.colorKeyTolerance, `${label}.colorKeyTolerance`, 0, 1);
}

function validateAgent(value, label) {
  allowedKeys(value, new Set(["role", "status", "perceptionRadius", "capabilities"]), label);
  for (const key of ["role", "status"]) if (value[key] !== undefined) requireString(value[key], `${label}.${key}`, { maximum: 80 });
  if (value.perceptionRadius !== undefined) requireFinite(value.perceptionRadius, `${label}.perceptionRadius`, 0, 10_000);
  if (value.capabilities !== undefined) requireStringArray(value.capabilities, `${label}.capabilities`, 128);
}

function validateSound(value, label, { requireSource = false } = {}) {
  allowedKeys(value, new Set(["source", "volume", "loop", "autoplay", "positional", "refDistance"]), label);
  if (requireSource || value.source !== undefined) requireString(value.source, `${label}.source`, { maximum: 2_048 });
  if (value.volume !== undefined) requireFinite(value.volume, `${label}.volume`, 0, 1);
  for (const key of ["loop", "autoplay", "positional"]) if (value[key] !== undefined) requireBoolean(value[key], `${label}.${key}`);
  if (value.refDistance !== undefined) requireFinite(value.refDistance, `${label}.refDistance`, Number.MIN_VALUE, 1_000);
}

function validateEmitter(value, label) {
  allowedKeys(value, new Set([
    "preset", "rate", "maxParticles", "lifetimeSeconds", "speed", "sizeScale", "volumeScale", "color", "gravity",
    "direction", "spread", "seed", "enabled",
  ]), label);
  if (value.preset !== undefined && !EMITTER_PRESETS.has(value.preset)) reject(`Unknown ${label}.preset: ${String(value.preset)}`);
  for (const key of ["rate", "maxParticles", "lifetimeSeconds", "speed", "sizeScale", "volumeScale", "spread", "seed"]) {
    if (value[key] !== undefined) requireFinite(value[key], `${label}.${key}`);
  }
  if (value.color !== undefined && value.color !== null) requireString(value.color, `${label}.color`, { maximum: 128 });
  if (value.gravity !== undefined) requireVector(value.gravity, 3, `${label}.gravity`);
  if (value.direction !== undefined) requireVector(value.direction, 3, `${label}.direction`);
  if (value.enabled !== undefined) requireBoolean(value.enabled, `${label}.enabled`);
}

function validateTerrain(value, label) {
  allowedKeys(value, new Set([
    "heightmap", "heights", "size", "segments", "heightScale", "heightOffset", "flattenRadius", "flattenFalloff", "flattenHeight",
  ]), label);
  if (value.heightmap !== undefined && value.heightmap !== null && !HEIGHTMAP_IDS.has(value.heightmap)) {
    reject(`Unknown ${label}.heightmap: ${String(value.heightmap)}`);
  }
  if (value.heights !== undefined && value.heights !== null) {
    if (!Array.isArray(value.heights)) reject(`${label}.heights must be an array or null`);
    const samples = Math.round(Math.sqrt(value.heights.length));
    if (samples < 2 || samples > 513 || samples * samples !== value.heights.length) {
      reject(`${label}.heights must be a square grid from 2x2 through 513x513`);
    }
    value.heights.forEach((height, index) => requireFinite(height, `${label}.heights[${index}]`));
  }
  for (const key of ["size", "segments", "heightScale", "heightOffset", "flattenRadius", "flattenFalloff", "flattenHeight"]) {
    if (value[key] !== undefined) requireFinite(value[key], `${label}.${key}`);
  }
}

function validateWater(value, label) {
  allowedKeys(value, new Set([
    "size", "color", "sunColor", "sunDirection", "distortionScale", "rippleScale", "flowSpeed", "opacity", "reflectance",
    "tintStrength", "tintDistance", "specularStrength", "reflection", "reflectionResolution",
  ]), label);
  for (const key of ["color", "sunColor"]) if (value[key] !== undefined) requireResolvedColor(value[key], `${label}.${key}`);
  if (value.sunDirection !== undefined) requireVector(value.sunDirection, 3, `${label}.sunDirection`);
  for (const key of [
    "size", "distortionScale", "rippleScale", "flowSpeed", "opacity", "reflectance", "tintStrength", "tintDistance",
    "specularStrength", "reflectionResolution",
  ]) if (value[key] !== undefined) requireFinite(value[key], `${label}.${key}`);
  if (value.reflection !== undefined) requireBoolean(value.reflection, `${label}.reflection`);
}

function validateFlock(value, label) {
  allowedKeys(value, new Set([
    "preset", "count", "bounds", "radius", "size", "separation", "alignment", "cohesion", "separationDistance",
    "neighborDistance", "speed", "maxForce", "memberSize", "color", "emissive", "emissiveIntensity", "trails",
    "trailLength", "trailColor", "seed",
  ]), label);
  if (value.preset !== undefined && value.preset !== null && !FLOCK_PRESETS.has(value.preset)) reject(`Unknown ${label}.preset: ${String(value.preset)}`);
  if (value.bounds !== undefined && !["sphere", "box"].includes(value.bounds)) reject(`${label}.bounds must be sphere or box`);
  if (value.size !== undefined) requireVector(value.size, 3, `${label}.size`);
  for (const key of [
    "count", "radius", "separation", "alignment", "cohesion", "separationDistance", "neighborDistance", "speed",
    "maxForce", "memberSize", "emissiveIntensity", "trailLength", "seed",
  ]) if (value[key] !== undefined) requireFinite(value[key], `${label}.${key}`);
  for (const key of ["color", "emissive", "trailColor"]) if (value[key] !== undefined) requireResolvedColor(value[key], `${label}.${key}`);
  if (value.trails !== undefined) requireBoolean(value.trails, `${label}.trails`);
}

function validateCrowd(value, label) {
  allowedKeys(value, new Set([
    "preset", "count", "pursuers", "size", "speed", "pursuitSpeedRatio", "turnRate", "separationDistance", "separation",
    "focus", "conversion", "memberSize", "wanderColor", "pursuerColor", "emissiveIntensity", "seed",
  ]), label);
  if (value.preset !== undefined && value.preset !== null && !CROWD_PRESETS.has(value.preset)) reject(`Unknown ${label}.preset: ${String(value.preset)}`);
  if (value.size !== undefined) requireVector(value.size, 2, `${label}.size`);
  if (value.focus !== undefined) requireVector(value.focus, 3, `${label}.focus`);
  for (const key of [
    "count", "pursuers", "speed", "pursuitSpeedRatio", "turnRate", "separationDistance", "separation", "memberSize",
    "emissiveIntensity", "seed",
  ]) if (value[key] !== undefined) requireFinite(value[key], `${label}.${key}`);
  for (const key of ["wanderColor", "pursuerColor"]) if (value[key] !== undefined) requireResolvedColor(value[key], `${label}.${key}`);
  if (value.conversion !== undefined && value.conversion !== null) {
    allowedKeys(value.conversion, new Set(["from", "to", "radius", "afterSeconds"]), `${label}.conversion`);
    if (!["wander", "pursue"].includes(value.conversion.from) || !["wander", "pursue"].includes(value.conversion.to)) {
      reject(`${label}.conversion roles must be wander or pursue`);
    }
    if (value.conversion.from === value.conversion.to) reject(`${label}.conversion roles must differ`);
    if (value.conversion.radius !== undefined) requireFinite(value.conversion.radius, `${label}.conversion.radius`);
    if (value.conversion.afterSeconds !== undefined) requireFinite(value.conversion.afterSeconds, `${label}.conversion.afterSeconds`);
  }
}

function validateFormula(value, label) {
  allowedKeys(value, new Set([
    "preset", "kind", "a", "b", "c", "m", "xOffset", "lanes", "perLane", "spacing", "moleculeSize", "nearColor", "farColor",
  ]), label);
  if (value.preset !== undefined && value.preset !== null && !FORMULA_PRESETS.has(value.preset)) reject(`Unknown ${label}.preset: ${String(value.preset)}`);
  if (value.kind !== undefined && !["parabola", "slope"].includes(value.kind)) reject(`${label}.kind must be parabola or slope`);
  for (const key of ["a", "b", "c", "m", "xOffset", "lanes", "perLane", "spacing", "moleculeSize"]) {
    if (value[key] !== undefined) requireFinite(value[key], `${label}.${key}`);
  }
  for (const key of ["nearColor", "farColor"]) if (value[key] !== undefined) requireString(value[key], `${label}.${key}`, { maximum: 128 });
  const presetSize = value.preset === "archive-molecules" ? 100 : 48;
  const lanes = value.lanes ?? presetSize;
  const perLane = value.perLane ?? presetSize;
  if (Math.min(200, Math.max(1, Math.round(lanes))) * Math.min(200, Math.max(1, Math.round(perLane))) > 10_000) {
    reject(`${label} exceeds the 10000 molecule budget`);
  }
}

function validateDna(value, label) {
  allowedKeys(value, new Set([
    "preset", "seed", "generation", "mutationRate", "trees", "columns", "spacing", "layoutJitter", "genome", "growSeconds",
    "seasonSeconds", "barkColor", "leaves",
  ]), label);
  if (value.preset !== undefined && value.preset !== null && !DNA_PRESETS.has(value.preset)) reject(`Unknown ${label}.preset: ${String(value.preset)}`);
  for (const key of ["seed", "generation", "mutationRate", "trees", "columns", "layoutJitter", "growSeconds", "seasonSeconds"]) {
    if (value[key] !== undefined) requireFinite(value[key], `${label}.${key}`);
  }
  if (value.spacing !== undefined) requireVector(value.spacing, 2, `${label}.spacing`);
  if (value.barkColor !== undefined) requireString(value.barkColor, `${label}.barkColor`, { maximum: 128 });
  if (value.leaves !== undefined) requireBoolean(value.leaves, `${label}.leaves`);
  if (value.genome !== undefined) {
    const genomeKeys = new Set([
      "trunkLength", "lengthRatio", "branchAngle", "rollTurns", "depth", "splitChance", "leafHue", "leafHueSpread",
      "leafSize", "branchThickness",
    ]);
    allowedKeys(value.genome, genomeKeys, `${label}.genome`);
    for (const [key, entry] of Object.entries(value.genome)) requireFinite(entry, `${label}.genome.${key}`);
  }
}

function validateForceField(value, label) {
  allowedKeys(value, new Set([
    "preset", "kind", "shape", "radius", "size", "strength", "minimumDistance", "scale", "speed", "edgeSoftness",
    "affectsTags", "affectsBodies", "affectsParticles", "affectsFlocks", "visualize", "visualizeResolution", "color", "enabled",
  ]), label);
  if (value.preset !== undefined && value.preset !== null && !FORCE_FIELD_PRESETS.has(value.preset)) reject(`Unknown ${label}.preset: ${String(value.preset)}`);
  if (value.kind !== undefined && !["attractor", "flow", "drag", "vortex"].includes(value.kind)) reject(`Unknown ${label}.kind: ${String(value.kind)}`);
  if (value.shape !== undefined && !["sphere", "box", "infinite"].includes(value.shape)) reject(`Unknown ${label}.shape: ${String(value.shape)}`);
  if (value.size !== undefined) requireVector(value.size, 3, `${label}.size`);
  for (const key of ["radius", "strength", "minimumDistance", "scale", "speed", "edgeSoftness", "visualizeResolution"]) {
    if (value[key] !== undefined) requireFinite(value[key], `${label}.${key}`);
  }
  if (value.affectsTags !== undefined) requireStringArray(value.affectsTags, `${label}.affectsTags`, 32);
  for (const key of ["affectsBodies", "affectsParticles", "affectsFlocks", "visualize", "enabled"]) {
    if (value[key] !== undefined) requireBoolean(value[key], `${label}.${key}`);
  }
  if (value.color !== undefined) requireResolvedColor(value.color, `${label}.color`);
}

function validateSurface(value, label) {
  if (value === null) return;
  allowedKeys(value, new Set(["sketch", "resolution", "fps", "emissive", "tint"]), label);
  if (!["waveform", "grid-pulse", "plasma"].includes(value.sketch)) reject(`Unknown ${label}.sketch: ${String(value.sketch)}`);
  if (value.resolution !== undefined) requireFinite(value.resolution, `${label}.resolution`);
  if (value.fps !== undefined) requireFinite(value.fps, `${label}.fps`);
  if (value.emissive !== undefined) requireBoolean(value.emissive, `${label}.emissive`);
  if (value.tint !== undefined && (typeof value.tint !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value.tint))) reject(`${label}.tint must be #rrggbb`);
}

function validateSteering(value, label) {
  if (value === null) return;
  // thrust/turn are live inputs and are intentionally not document-authoring fields.
  allowedKeys(value, new Set([
    "headingDegrees", "force", "speedCap", "turnRateDegrees", "kickImpulse", "jumpImpulse", "arrowId", "arrowLift",
  ]), label);
  for (const key of ["headingDegrees", "force", "speedCap", "turnRateDegrees", "kickImpulse", "jumpImpulse", "arrowLift"]) {
    if (value[key] !== undefined) requireFinite(value[key], `${label}.${key}`);
  }
  if (value.arrowId !== undefined) requireStableId(value.arrowId, `${label}.arrowId`);
}

function validatePhysics(value, label, entity) {
  if (value === null) return;
  allowedKeys(value, new Set([
    "mode", "mass", "material", "friction", "restitution", "linearVelocity", "angularVelocity", "collider",
  ]), label);
  if (!["static", "dynamic", "kinematic", "trigger"].includes(value.mode)) reject(`Unsupported ${label}.mode: ${String(value.mode)}`);
  if (PHYSICS_FORBIDDEN_TYPES.has(entity.type)) reject(`Entity type cannot have physics: ${entity.type}`);
  if (entity.type === "plane" && value.mode === "dynamic") reject("Plane physics can only be static or kinematic");
  if (entity.parentId) reject("Physics entities must remain at the world root");
  if (value.mass !== undefined) requireFinite(value.mass, `${label}.mass`, 0, 100_000);
  if (value.material !== undefined && !["default", "wall", "finish", "ground", "ball", "human"].includes(value.material)) {
    reject(`Unsupported ${label}.material: ${String(value.material)}`);
  }
  for (const key of ["friction", "restitution"]) if (value[key] !== undefined) requireFinite(value[key], `${label}.${key}`, 0, 1);
  if (value.linearVelocity !== undefined) requireVector(value.linearVelocity, 3, `${label}.linearVelocity`, -10_000, 10_000);
  if (value.angularVelocity !== undefined) requireVector(value.angularVelocity, 3, `${label}.angularVelocity`, -10_000, 10_000);
  const collider = value.collider ?? "auto";
  if (!["auto", "convex-hull", "trimesh"].includes(collider)) reject(`Unsupported ${label}.collider: ${String(collider)}`);
  if (collider !== "auto" && entity.type !== "model") reject(`${collider} colliders are only available on model entities`);
  if (collider === "trimesh" && value.mode !== "static") reject("Trimesh colliders must be static");
}

function validateBehaviors(value, label) {
  if (!Array.isArray(value) || value.length > 128) reject(`${label} must be an array of at most 128 behaviors`);
  const ids = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const behavior = value[index];
    const itemLabel = `${label}[${index}]`;
    requireRecord(behavior, itemLabel);
    requireStableId(behavior.id, `${itemLabel}.id`);
    if (ids.has(behavior.id)) reject(`Behavior ids must be unique on an entity: ${behavior.id}`);
    ids.add(behavior.id);
    if (behavior.type === "spin") {
      allowedKeys(behavior, new Set(["id", "type", "axis", "speedDegrees"]), itemLabel);
      if (behavior.axis !== undefined && !["x", "y", "z"].includes(behavior.axis)) reject(`${itemLabel}.axis is invalid`);
      if (behavior.speedDegrees !== undefined) requireFinite(behavior.speedDegrees, `${itemLabel}.speedDegrees`);
    } else if (behavior.type === "bob") {
      allowedKeys(behavior, new Set(["id", "type", "axis", "amplitude", "frequencyHz", "phaseDegrees"]), itemLabel);
      if (behavior.axis !== undefined && !["x", "y", "z"].includes(behavior.axis)) reject(`${itemLabel}.axis is invalid`);
      for (const key of ["amplitude", "frequencyHz", "phaseDegrees"]) if (behavior[key] !== undefined) requireFinite(behavior[key], `${itemLabel}.${key}`);
    } else if (behavior.type === "orbit") {
      allowedKeys(behavior, new Set(["id", "type", "center", "radius", "speedDegrees", "phaseDegrees", "axis"]), itemLabel);
      if (behavior.axis !== undefined && !["x", "y", "z"].includes(behavior.axis)) reject(`${itemLabel}.axis is invalid`);
      if (behavior.center !== undefined) requireVector(behavior.center, 3, `${itemLabel}.center`);
      for (const key of ["radius", "speedDegrees", "phaseDegrees"]) if (behavior[key] !== undefined) requireFinite(behavior[key], `${itemLabel}.${key}`);
    } else if (behavior.type === "pulse") {
      allowedKeys(behavior, new Set(["id", "type", "minimumScale", "maximumScale", "frequencyHz", "phaseDegrees"]), itemLabel);
      for (const key of ["minimumScale", "maximumScale", "frequencyHz", "phaseDegrees"]) if (behavior[key] !== undefined) requireFinite(behavior[key], `${itemLabel}.${key}`);
    } else if (behavior.type === "look-at") {
      allowedKeys(behavior, new Set(["id", "type", "targetId"]), itemLabel);
      requireStableId(behavior.targetId, `${itemLabel}.targetId`);
    } else if (behavior.type === "follow-spline") {
      allowedKeys(behavior, new Set(["id", "type", "splineId", "speed", "phase", "loop", "orientToPath"]), itemLabel);
      requireStableId(behavior.splineId, `${itemLabel}.splineId`);
      if (behavior.speed !== undefined) requireFinite(behavior.speed, `${itemLabel}.speed`);
      if (behavior.phase !== undefined) requireFinite(behavior.phase, `${itemLabel}.phase`);
      for (const key of ["loop", "orientToPath"]) if (behavior[key] !== undefined) requireBoolean(behavior[key], `${itemLabel}.${key}`);
    } else {
      reject(`Unsupported behavior: ${String(behavior.type)}`);
    }
  }
}

function validateInteractions(value, label) {
  if (!Array.isArray(value) || value.length > 128) reject(`${label} must be an array of at most 128 interactions`);
  const ids = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const interaction = value[index];
    const itemLabel = `${label}[${index}]`;
    requireRecord(interaction, itemLabel);
    requireStableId(interaction.id, `${itemLabel}.id`);
    if (ids.has(interaction.id)) reject(`Interaction ids must be unique on an entity: ${interaction.id}`);
    ids.add(interaction.id);
    if (interaction.type === "toggle-visibility") {
      allowedKeys(interaction, new Set(["id", "label", "type", "targetIds"]), itemLabel);
    } else if (interaction.type === "apply-impulse") {
      allowedKeys(interaction, new Set(["id", "label", "type", "targetIds", "impulse", "relativePoint"]), itemLabel);
      requireVector(interaction.impulse, 3, `${itemLabel}.impulse`, -100_000, 100_000);
      if (interaction.relativePoint !== undefined) requireVector(interaction.relativePoint, 3, `${itemLabel}.relativePoint`, -10_000, 10_000);
    } else if (interaction.type === "play-sound") {
      allowedKeys(interaction, new Set([
        "id", "label", "type", "targetIds", "sound", "volume", "positional", "refDistance",
      ]), itemLabel);
      requireString(interaction.sound, `${itemLabel}.sound`, { maximum: 2_048 });
      if (interaction.volume !== undefined) requireFinite(interaction.volume, `${itemLabel}.volume`, 0, 1);
      if (interaction.positional !== undefined) requireBoolean(interaction.positional, `${itemLabel}.positional`);
      if (interaction.refDistance !== undefined) requireFinite(interaction.refDistance, `${itemLabel}.refDistance`, Number.MIN_VALUE, 1_000);
    } else {
      reject(`Unsupported interaction: ${String(interaction.type)}`);
    }
    if (interaction.label !== undefined) requireString(interaction.label, `${itemLabel}.label`, { maximum: 80 });
    const targets = interaction.targetIds ?? [];
    if (!Array.isArray(targets) || targets.length > 32) reject(`${itemLabel}.targetIds must be an array of at most 32 ids`);
    if (interaction.type !== "play-sound" && targets.length === 0) reject(`${interaction.type} requires at least one target id`);
    targets.forEach((targetId, targetIndex) => requireStableId(targetId, `${itemLabel}.targetIds[${targetIndex}]`));
  }
}

function validateTypedConfig(entity, key, value, label, { merged = false } = {}) {
  const expected = {
    agent: "agent", emitter: "emitter", sound: "sound", terrain: "terrain", water: "water", flock: "flock",
    crowd: "crowd", formula: "formula-field", dna: "dna-tree", forceField: "force-field",
  }[key];
  if (expected && entity.type !== expected) reject(`Only ${expected} entities accept ${key}`);
  if (key === "agent") validateAgent(value, label);
  else if (key === "emitter") validateEmitter(value, label);
  else if (key === "sound") validateSound(value, label, { requireSource: merged });
  else if (key === "terrain") validateTerrain(value, label);
  else if (key === "water") validateWater(value, label);
  else if (key === "flock") validateFlock(value, label);
  else if (key === "crowd") validateCrowd(value, label);
  else if (key === "formula") validateFormula(value, label);
  else if (key === "dna") validateDna(value, label);
  else if (key === "forceField") validateForceField(value, label);
}

function validateEntityFields(entity, label) {
  allowedKeys(entity, ENTITY_KEYS, label);
  requireStableId(entity.id, `${label}.id`);
  if (!ENTITY_TYPES.has(entity.type)) reject(`Unsupported entity type: ${String(entity.type)}`);
  if (entity.label !== undefined) requireString(entity.label, `${label}.label`, { maximum: 240 });
  if (entity.parentId !== undefined) requireStableId(entity.parentId, `${label}.parentId`);
  if (entity.transform !== undefined) validateTransform(entity.transform, `${label}.transform`);
  if (entity.material !== undefined) validateMaterial(entity.material, `${label}.material`);
  if (entity.modelMaterialOverrides !== undefined) {
    if (entity.type !== "model") reject("Only model entities accept modelMaterialOverrides");
    validateModelMaterialOverrides(entity.modelMaterialOverrides, `${label}.modelMaterialOverrides`);
  }
  if (entity.geometry !== undefined) validateGeometry(entity.geometry, `${label}.geometry`);
  if (entity.type === "spline") validatePath(entity.path, `${label}.path`);
  else if (entity.path !== undefined) reject("Only spline entities accept a path");
  if (entity.type === "model") validateAsset(entity.asset, `${label}.asset`);
  else if (entity.asset !== undefined) reject("Only model entities accept an asset");
  for (const key of ["agent", "emitter", "sound", "terrain", "water", "flock", "crowd", "formula", "dna", "forceField"]) {
    if (entity[key] !== undefined) validateTypedConfig(entity, key, entity[key], `${label}.${key}`, { merged: true });
  }
  if (entity.type === "sound" && entity.sound === undefined) reject("A sound entity requires sound.source");
  if (entity.surface !== undefined) {
    if (!PRIMITIVE_TYPES.has(entity.type)) reject(`Only primitive mesh entities accept a surface (got ${entity.type})`);
    validateSurface(entity.surface, `${label}.surface`);
  }
  if (entity.steering !== undefined) validateSteering(entity.steering, `${label}.steering`);
  if (entity.physics !== undefined) validatePhysics(entity.physics, `${label}.physics`, entity);
  if (entity.steering && entity.physics?.mode !== "dynamic") reject("Steering requires dynamic physics");
  for (const key of ["intensity", "distance"]) if (entity[key] !== undefined) requireFinite(entity[key], `${label}.${key}`);
  for (const key of ["marker", "visible", "castShadow", "receiveShadow", "ephemeral"]) {
    if (entity[key] !== undefined) requireBoolean(entity[key], `${label}.${key}`);
  }
  if (entity.ephemeral === true) reject("Cannot store a session-only entity: the scene store holds authored content, not session state");
  if (entity.tags !== undefined) requireStringArray(entity.tags, `${label}.tags`, 128);
  if (entity.behaviors !== undefined) validateBehaviors(entity.behaviors, `${label}.behaviors`);
  if (entity.interactions !== undefined) validateInteractions(entity.interactions, `${label}.interactions`);
  if (entity.physics && !["kinematic", "trigger"].includes(entity.physics.mode) && (entity.behaviors ?? []).some((behavior) => MOTION_BEHAVIORS.has(behavior.type))) {
    reject("Transform behaviors require kinematic physics");
  }
}

function validatePatchFields(current, patch, label) {
  allowedKeys(patch, PATCH_KEYS, label);
  if (patch.label !== undefined) requireString(patch.label, `${label}.label`, { maximum: 240 });
  if (patch.parentId !== undefined && patch.parentId !== null) requireStableId(patch.parentId, `${label}.parentId`);
  if (patch.transform !== undefined) validateTransform(patch.transform, `${label}.transform`);
  if (patch.material !== undefined) {
    if (current.type === "model") reject("Model source materials use modelMaterialOverrides, not the generic material patch");
    validateMaterial(patch.material, `${label}.material`);
  }
  if (patch.modelMaterialOverrides !== undefined) {
    if (current.type !== "model") reject("Only model entities accept modelMaterialOverrides");
    validateModelMaterialOverrides(patch.modelMaterialOverrides, `${label}.modelMaterialOverrides`, { patch: true });
  }
  if (patch.surface !== undefined) {
    if (!PRIMITIVE_TYPES.has(current.type)) reject(`Only primitive mesh entities accept a surface (got ${current.type})`);
    validateSurface(patch.surface, `${label}.surface`);
  }
  if (patch.steering !== undefined) validateSteering(patch.steering, `${label}.steering`);
  for (const key of ["visible", "castShadow", "receiveShadow", "ephemeral", "marker"]) {
    if (patch[key] !== undefined) requireBoolean(patch[key], `${label}.${key}`);
  }
  if (patch.ephemeral === true) reject("Cannot store a session-only entity: the scene store holds authored content, not session state");
  if (patch.tags !== undefined) requireStringArray(patch.tags, `${label}.tags`, 128);
  for (const key of ["intensity", "distance"]) if (patch[key] !== undefined) requireFinite(patch[key], `${label}.${key}`);
  if (patch.physics !== undefined && patch.physics !== null) {
    const mergedPhysics = { ...(current.physics ?? { mode: "static" }), ...patch.physics };
    validatePhysics(mergedPhysics, `${label}.physics`, { ...current, ...patch, physics: mergedPhysics });
  }
  for (const key of ["agent", "emitter", "sound", "terrain", "water", "flock", "crowd", "formula", "dna", "forceField"]) {
    if (patch[key] !== undefined) validateTypedConfig(current, key, patch[key], `${label}.${key}`);
  }
  if (patch.interactions !== undefined) validateInteractions(patch.interactions, `${label}.interactions`);
}

function mergeModelMaterialOverrides(current, patch) {
  if (patch === undefined) return current;
  if (patch === null) return undefined;
  const next = { ...(current ?? {}) };
  for (const [slotId, values] of Object.entries(patch)) {
    if (values === null) delete next[slotId];
    else next[slotId] = { ...(next[slotId] ?? {}), ...values };
  }
  return Object.keys(next).length ? next : undefined;
}

function mergeNestedConfig(key, current, patch) {
  if (patch === undefined) return current;
  if (patch === null) return undefined;
  // Supplying a real preset makes the browser resolver start from that preset rather than
  // from the current resolved block. Retaining old overrides here would make the next
  // snapshot mean something different from the operation every connected browser applied.
  if (PRESET_RESET_FIELDS.has(key) && patch.preset !== undefined && patch.preset !== null) {
    return { ...patch };
  }
  const next = { ...(current ?? {}), ...patch };
  if (key === "dna" && patch.genome !== undefined) next.genome = { ...(current?.genome ?? {}), ...patch.genome };
  if (key === "terrain" && Array.isArray(next.heights)) next.heightmap = null;
  if (key === "terrain" && next.heights === null && next.heightmap == null) next.heightmap = "rolling";
  return next;
}

function mergeEntityPatch(current, patch) {
  const next = { ...current, ...patch };
  if (patch.transform !== undefined) next.transform = { ...(current.transform ?? {}), ...patch.transform };
  if (patch.material !== undefined) next.material = { ...(current.material ?? {}), ...patch.material };
  next.modelMaterialOverrides = mergeModelMaterialOverrides(current.modelMaterialOverrides, patch.modelMaterialOverrides);
  if (patch.physics !== undefined) next.physics = patch.physics === null
    ? undefined
    : { ...(current.physics ?? { mode: "static" }), ...patch.physics };
  for (const key of NESTED_PATCH_FIELDS) {
    if (patch[key] !== undefined) next[key] = mergeNestedConfig(key, current[key], patch[key]);
  }
  // The runtime replaces these blocks; it does not merge them.
  if (patch.formula !== undefined) next.formula = structuredClone(patch.formula);
  if (patch.interactions !== undefined) next.interactions = structuredClone(patch.interactions);
  if (patch.surface !== undefined) next.surface = patch.surface === null ? undefined : structuredClone(patch.surface);
  for (const key of ["modelMaterialOverrides", "physics", "steering", "surface"]) if (next[key] === undefined) delete next[key];
  return next;
}

function validateUpdatedEntity(entity, label) {
  if (entity.parentId && entity.parentId === entity.id) reject("An entity cannot parent itself");
  if (entity.physics !== undefined) validatePhysics(entity.physics, `${label}.physics`, entity);
  if (entity.steering !== undefined) {
    validateSteering(entity.steering, `${label}.steering`);
    if (entity.physics?.mode !== "dynamic") reject("Steering requires dynamic physics");
  }
  for (const key of ["agent", "emitter", "sound", "terrain", "water", "flock", "crowd", "formula", "dna", "forceField"]) {
    if (entity[key] !== undefined) validateTypedConfig(entity, key, entity[key], `${label}.${key}`, { merged: true });
  }
  if (entity.physics && !["kinematic", "trigger"].includes(entity.physics.mode) && (entity.behaviors ?? []).some((behavior) => MOTION_BEHAVIORS.has(behavior.type))) {
    reject("Transform behaviors require kinematic physics");
  }
}

function validateEnvironmentBlock(value, label) {
  allowedKeys(value, ENVIRONMENT_KEYS, label);
  if (value.background !== undefined) requireString(value.background, `${label}.background`, { maximum: 128 });
  if (value.sky !== undefined && value.sky !== null && !SKY_IDS.has(value.sky)) reject(`Unknown ${label}.sky: ${String(value.sky)}`);
  if (value.overlay !== undefined && value.overlay !== null && !OVERLAY_IDS.has(value.overlay)) reject(`Unknown ${label}.overlay: ${String(value.overlay)}`);
  if (value.ground !== undefined) {
    allowedKeys(value.ground, new Set(["visible", "size", "color", "grid", "gridColor"]), `${label}.ground`);
    for (const key of ["visible", "grid"]) if (value.ground[key] !== undefined) requireBoolean(value.ground[key], `${label}.ground.${key}`);
    if (value.ground.size !== undefined) requireFinite(value.ground.size, `${label}.ground.size`, 0.001, 100_000);
    for (const key of ["color", "gridColor"]) if (value.ground[key] !== undefined) requireString(value.ground[key], `${label}.ground.${key}`, { maximum: 128 });
  }
  if (value.physics !== undefined) {
    allowedKeys(value.physics, new Set(["gravity"]), `${label}.physics`);
    if (value.physics.gravity !== undefined) requireVector(value.physics.gravity, 3, `${label}.physics.gravity`, -1_000, 1_000);
  }
  if (value.envelope !== undefined && value.envelope !== null) {
    allowedKeys(value.envelope, new Set(["fogNear", "fogFar", "cameraFar"]), `${label}.envelope`);
    for (const key of ["fogNear", "fogFar", "cameraFar"]) requireFinite(value.envelope[key], `${label}.envelope.${key}`, 0, 100_000);
    if (value.envelope.fogFar <= value.envelope.fogNear) reject(`${label}.envelope.fogFar must exceed fogNear`);
    if (value.envelope.cameraFar <= value.envelope.fogNear) reject(`${label}.envelope.cameraFar must exceed fogNear`);
  }
  if (value.post !== undefined && value.post !== null) {
    allowedKeys(value.post, new Set(["bloom"]), `${label}.post`);
    allowedKeys(value.post.bloom, new Set(["strength", "threshold", "radius"]), `${label}.post.bloom`);
    requireFinite(value.post.bloom.strength, `${label}.post.bloom.strength`, 0, 3);
    requireFinite(value.post.bloom.threshold, `${label}.post.bloom.threshold`, 0, 1);
    requireFinite(value.post.bloom.radius, `${label}.post.bloom.radius`, 0, 1);
  }
  if (value.lighting !== undefined && value.lighting !== null) validateLighting(value.lighting, `${label}.lighting`);
  if (value.dayNight !== undefined && value.dayNight !== null) {
    allowedKeys(value.dayNight, new Set(["cycleSeconds", "phaseOffset", "day", "night"]), `${label}.dayNight`);
    requireFinite(value.dayNight.cycleSeconds, `${label}.dayNight.cycleSeconds`, 5, 86_400);
    requireFinite(value.dayNight.phaseOffset, `${label}.dayNight.phaseOffset`, 0, 1 - Number.EPSILON);
    for (const key of ["day", "night"]) {
      const look = value.dayNight[key];
      allowedKeys(look, new Set(["sky", "lighting", "background"]), `${label}.dayNight.${key}`);
      if (look.sky !== null && !SKY_IDS.has(look.sky)) reject(`Unknown ${label}.dayNight.${key}.sky: ${String(look.sky)}`);
      validateLighting(look.lighting, `${label}.dayNight.${key}.lighting`);
      requireString(look.background, `${label}.dayNight.${key}.background`, { maximum: 128 });
    }
  }
}

function validateLighting(value, label) {
  allowedKeys(value, new Set([
    "source", "hdri", "intensity", "yawDegrees", "backgroundIntensity", "backgroundBlur",
  ]), label);
  if (!["sky", "studio", "hdri"].includes(value.source)) reject(`${label}.source must be sky, studio, or hdri`);
  if (value.source === "hdri") {
    if (!HDRI_IDS.has(value.hdri)) reject(`Unknown ${label}.hdri: ${String(value.hdri)}`);
  } else if (value.hdri !== undefined) reject(`${label}.hdri is only valid for an hdri source`);
  requireFinite(value.intensity, `${label}.intensity`, 0, 3);
  requireFinite(value.yawDegrees, `${label}.yawDegrees`, -180, 180);
  requireFinite(value.backgroundIntensity, `${label}.backgroundIntensity`, 0, 3);
  requireFinite(value.backgroundBlur, `${label}.backgroundBlur`, 0, 1);
}

function entityMap(entities) {
  const map = new Map();
  for (const entity of entities) {
    requireRecord(entity, "scene entity");
    requireStableId(entity.id, "entity id");
    if (!ENTITY_TYPES.has(entity.type)) reject(`Unsupported entity type: ${String(entity.type)}`);
    if (map.has(entity.id)) reject(`Duplicate entity id: ${entity.id}`);
    map.set(entity.id, entity);
  }
  return map;
}

function validateReferencesForEntity(entity, map, { spawning = false } = {}) {
  if (entity.parentId) {
    requireStableId(entity.parentId, `${entity.id}.parentId`);
    if (!map.has(entity.parentId)) reject(`Unknown parent entity: ${entity.parentId}`);
  }
  for (const behavior of entity.behaviors ?? []) {
    if (behavior.type === "look-at" && !map.has(behavior.targetId)) reject(`Unknown look-at target: ${behavior.targetId}`);
    if (behavior.type === "follow-spline") {
      const spline = map.get(behavior.splineId);
      if (!spline) reject(`Unknown spline: ${behavior.splineId}`);
      if (spline.type !== "spline") reject(`follow-spline target is not a spline: ${behavior.splineId}`);
    }
  }
  for (const interaction of entity.interactions ?? []) {
    for (const targetId of interaction.targetIds ?? []) {
      const target = map.get(targetId);
      if (!target) reject(`Unknown interaction target: ${targetId}`);
      if (interaction.type === "apply-impulse" && target.physics?.mode !== "dynamic") {
        reject(`apply-impulse target must be dynamic: ${targetId}`);
      }
    }
  }
  if (!spawning && entity.steering?.arrowId && !map.has(entity.steering.arrowId)) {
    reject(`Unknown steering arrow: ${entity.steering.arrowId}`);
  }
}

function validateGraph(definition) {
  if (definition.entities.length > MAX_AUTHORED_ENTITIES) {
    reject(`A live-authored scene supports at most ${MAX_AUTHORED_ENTITIES} entities`);
  }
  const map = entityMap(definition.entities);
  for (const entity of definition.entities) {
    if (entity.behaviors !== undefined) validateBehaviors(entity.behaviors, `${entity.id}.behaviors`);
    if (entity.interactions !== undefined) validateInteractions(entity.interactions, `${entity.id}.interactions`);
    if (entity.steering !== undefined) validateSteering(entity.steering, `${entity.id}.steering`);
    validateReferencesForEntity(entity, map);
  }
  for (const entity of definition.entities) {
    const seen = new Set([entity.id]);
    let parentId = entity.parentId;
    while (parentId) {
      if (seen.has(parentId)) reject(`Parenting would create a cycle involving ${entity.id}`);
      seen.add(parentId);
      parentId = map.get(parentId)?.parentId;
    }
  }
  if (definition.joints !== undefined) {
    if (!Array.isArray(definition.joints)) reject("Scene joints must be an array");
    for (const joint of definition.joints) {
      if (!isRecord(joint)) reject("Scene joints must contain objects");
      const bodyA = map.get(joint.bodyA);
      const bodyB = map.get(joint.bodyB);
      if (!bodyA || !bodyB) reject(`Joint ${String(joint.id)} references an unknown body`);
      if (!bodyA.physics || !bodyB.physics) reject(`Joint ${String(joint.id)} requires two physics entities`);
      if (bodyA.physics.mode === "trigger" || bodyB.physics.mode === "trigger") reject(`Joint ${String(joint.id)} cannot connect trigger bodies`);
      if (bodyA.physics.mode !== "dynamic" && bodyB.physics.mode !== "dynamic") reject(`Joint ${String(joint.id)} requires at least one dynamic body`);
    }
  }
  if (definition.rules !== undefined && definition.rules !== null) {
    const rules = requireRecord(definition.rules, "scene rules");
    const requireRuleTarget = (id, label) => {
      if (id !== undefined && !map.has(id)) reject(`Rules ${label} references unknown entity: ${String(id)}`);
    };
    requireRuleTarget(rules.subjectId, "subject");
    requireRuleTarget(rules.spawn?.entityId, "spawn");
    requireRuleTarget(rules.finish?.triggerId, "finish");
    for (const checkpoint of rules.checkpoints ?? []) requireRuleTarget(checkpoint?.triggerId, "checkpoint");
    for (const id of rules.collectibles?.triggerIds ?? []) requireRuleTarget(id, "collectible");
    for (const subject of rules.subjects ?? []) requireRuleTarget(subject?.id, "race subject");
  }
}

function validateSpawnReferences(entity, entities) {
  const map = entityMap(entities);
  // Parent, look-at, spline and interaction references are resolved synchronously by a
  // browser transaction. They must already exist before this command, not merely appear in
  // a later command in the same batch. Steering arrows are soft during spawn and checked on
  // the final graph, which preserves the runtime's documented arrow-then-subject batching.
  validateReferencesForEntity(entity, map, { spawning: true });
}

function validateUpdateReferences(entity, entities) {
  const map = entityMap(entities);
  map.set(entity.id, entity);
  validateReferencesForEntity(entity, map, { spawning: true });
  const seen = new Set([entity.id]);
  let parentId = entity.parentId;
  while (parentId) {
    if (seen.has(parentId)) reject(`Parenting would create a cycle involving ${entity.id}`);
    seen.add(parentId);
    parentId = map.get(parentId)?.parentId;
  }
}

function applyCommand(definition, command) {
  requireRecord(command, "command");
  const entities = definition.entities;

  if (command.op === "spawn") {
    allowedKeys(command, new Set(["op", "entity"]), "spawn command");
    const entity = command.entity;
    validateEntityFields(entity, "spawn.entity");
    if (entities.some((existing) => existing.id === entity.id)) reject(`Entity id already exists: ${entity.id}`);
    validateSpawnReferences(entity, entities);
    entities.push(structuredClone(entity));
    return { op: "spawn", id: entity.id };
  }

  if (command.op === "update") {
    allowedKeys(command, new Set(["op", "id", "patch"]), "update command");
    requireStableId(command.id, "update entity id");
    const index = entities.findIndex((entity) => entity.id === command.id);
    if (index === -1) reject(`Unknown entity: ${command.id}`);
    const current = entities[index];
    validatePatchFields(current, command.patch, "update.patch");
    const next = mergeEntityPatch(current, command.patch);
    validateUpdatedEntity(next, `entity ${command.id}`);
    validateUpdateReferences(next, entities);
    entities[index] = next;
    return { op: "update", id: command.id };
  }

  if (command.op === "remove") {
    allowedKeys(command, new Set(["op", "id"]), "remove command");
    requireStableId(command.id, "remove entity id");
    if (!entities.some((entity) => entity.id === command.id)) reject(`Unknown entity: ${command.id}`);
    const removed = [command.id];
    for (let pass = 0; pass < entities.length; pass += 1) {
      for (const entity of entities) {
        if (entity.parentId && removed.includes(entity.parentId) && !removed.includes(entity.id)) removed.push(entity.id);
      }
    }
    const removedSet = new Set(removed);
    definition.entities = entities.filter((entity) => !removedSet.has(entity.id));
    if (Array.isArray(definition.joints)) {
      definition.joints = definition.joints.filter((joint) => !removedSet.has(joint.bodyA) && !removedSet.has(joint.bodyB));
    }
    return { op: "remove", ids: removed };
  }

  if (command.op === "set-environment") {
    allowedKeys(command, new Set(["op", "environment"]), "set-environment command");
    validateEnvironmentBlock(command.environment, "set-environment.environment");
    definition.environment = { ...(definition.environment ?? {}), ...structuredClone(command.environment) };
    return { op: "set-environment" };
  }

  reject(`Unsupported command for document editing: ${String(command.op)}`);
}

export function applyCommands(definition, commands) {
  if (!Array.isArray(commands) || commands.length === 0) reject("At least one command is required");
  validateJsonValue(commands, "commands");
  if (!isRecord(definition)) reject("Scene definition must be an object");
  if (definition.schema !== WORLD_SCHEMA) reject(`Scene schema must be ${WORLD_SCHEMA}`);
  if (!Array.isArray(definition.entities)) reject("Scene entities must be an array");
  const next = structuredClone(definition);
  entityMap(next.entities);
  const outputs = commands.map((command) => applyCommand(next, command));
  validateGraph(next);
  const serializedBytes = Buffer.byteLength(JSON.stringify(next), "utf8");
  if (serializedBytes > MAX_DEFINITION_BYTES) {
    reject(`A live-authored scene supports at most ${MAX_DEFINITION_BYTES} serialized bytes`);
  }
  return { definition: next, outputs };
}

/** A short human sentence for a change, used when the caller supplies no intent. */
export function describeCommands(commands, outputs) {
  if (commands.length === 1) {
    const [command] = commands;
    if (command.op === "spawn") return `added ${command.entity.label ?? command.entity.type} ${outputs[0]?.id ?? ""}`.trim();
    if (command.op === "remove") return `removed ${outputs[0]?.ids?.join(", ") ?? command.id}`;
    if (command.op === "update") return `changed ${command.id}`;
    if (command.op === "set-environment") return "changed the environment";
  }
  return `applied ${commands.length} changes`;
}
