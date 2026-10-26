// The machine-readable vocabulary of the world API, for a model that composes proposals.
//
// Owner decision, 2026-10-25 (America/Toronto): AgentX Core is the proposal provider and must
// never carry a hand-written copy of this API. So GraphysX publishes the vocabulary itself,
// derived from the tables the server-side command validator (`scene-commands.mjs`) already
// enforces — field names, closed enumerations, numeric bounds, curated ids — plus the shared
// entity-type list and the host-only id namespaces. Core reads one JSON file and builds its
// prompt from it; when GraphysX gains a field, the file gains it on the next build and Core
// learns it on the next load. Nothing in Core has to be edited.
//
// Two things are not in the validator's tables and are supplied by the build instead: the
// descriptor catalogues (prefabs, skies, HDRIs, overlays, surface sketches) live in TypeScript
// tables the browser runtime ships, so `vite.config.ts` passes them in as `descriptors`. In
// plain Node (unit tests, the MCP server) the ids still come from the validator and the
// prefab list is whatever the caller supplies — `test/world-vocabulary.test.mjs` proves the
// supplied list agrees with the runtime's `AgentWorldPrefabId` union.
//
// The prose here (one line per field, in `describe`) is the only hand-written part, and it is
// deliberately short: units, semantics, and what null means. It documents the field; it never
// decides whether a value is accepted — the tables and the runtime do that.

import { HOST_ONLY_ENTITY_ID_PREFIXES } from "./host-entity-id-policy.mjs";
import { ENUMS, FIELDS, ID_PATTERN, LIMITS, SCENE_COMMAND_TABLES } from "./scene-commands.mjs";
import { WORLD_SCHEMA } from "./scene-document.mjs";

export const WORLD_VOCABULARY_SCHEMA = "graphysx.world-vocabulary/v1";

/** Review limits a provider's reply must respect; mirrors `PROVIDER_LIMITS` in `src/coauthor-provider.ts`. */
export const PROPOSAL_LIMITS = Object.freeze({ commands: 40, intentChars: 200, replyBytes: 256 * 1024 });

/** Every command the browser runtime accepts in a transaction or a commit. */
export const OPERATIONS = Object.freeze({
  "spawn": { shape: { op: "spawn", entity: "<entity>" }, description: "Create one entity. `entity.id` must be new; `entity.type` picks which config block applies." },
  "spawn-prefab": { shape: { op: "spawn-prefab", prefabId: "<prefabId>", options: { idPrefix: "<id>", position: "[x,y,z]", rotationDegrees: "[x,y,z]", scale: "[x,y,z]", palette: { primary: "#rrggbb", secondary: "#rrggbb", accent: "#rrggbb", emissive: "#rrggbb" }, tags: ["<tag>"] } }, description: "Create a curated multi-entity assembly. The root gets `options.idPrefix` as its id and the parts `${idPrefix}:part`. Every option is optional." },
  "update": { shape: { op: "update", id: "<existing id>", patch: "<patch>" }, description: "Change an existing entity. Nested config blocks (emitter, flock, water…) merge over the current values; `null` on a nullable field clears it." },
  "remove": { shape: { op: "remove", id: "<existing id>" }, description: "Delete an existing entity and everything parented under it." },
  "add-joint": { shape: { op: "add-joint", joint: "<joint>" }, description: "Constrain two root-level physics bodies; at least one must be dynamic." },
  "update-joint": { shape: { op: "update-joint", id: "<existing joint id>", patch: "<joint fields except id>" }, description: "Retune an existing joint." },
  "remove-joint": { shape: { op: "remove-joint", id: "<existing joint id>" }, description: "Delete an existing joint by its id." },
  "attach-behavior": { shape: { op: "attach-behavior", id: "<existing id>", behavior: "<behavior>" }, description: "Add a motion behavior to an entity. Transform behaviors on a physics body require kinematic physics." },
  "detach-behavior": { shape: { op: "detach-behavior", id: "<existing id>", behaviorId: "<behavior id>" }, description: "Remove a behavior by its id." },
  "interact": { shape: { op: "interact", id: "<existing id>", interactionId: "<optional interaction id>" }, description: "Fire an entity's authored interaction (toggle visibility, apply an impulse, play a sound). Omit `interactionId` to fire its first one." },
  "steer": { shape: { op: "steer", id: "<existing id>", input: { headingDegrees: "number", thrust: "-1..1", turn: "-1..1", kick: "0..1", jump: "0..1" } }, description: "Drive a dynamic entity that carries a `steering` block. Every input field is optional." },
  "set-environment": { shape: { op: "set-environment", environment: "<environment>" }, description: "Change scene-wide looks: background, sky, lighting, bloom, fog envelope, day/night cycle, overlay, ground, gravity. Only the keys given change." },
  "select": { shape: { op: "select", ids: ["<existing id>"] }, description: "Highlight entities in the editor. Changes no document state." },
});

/**
 * One line per field. Keyed by block, then field. A field with no line here is still in the
 * vocabulary (its name comes from the validator); it just carries no explanation.
 */
const describe = {
  entity: {
    appearance: "Agent entities only: avatar look, or null for the default avatar.",
    id: "Stable id, unique in the scene. Pattern in `idPattern`. Choose short kebab-case names.",
    label: "Human name shown in the outliner.",
    type: "One of `entityTypes`. Decides which config block (`flock`, `water`, …) is accepted.",
    parentId: "Id of an existing entity to nest under. Physics entities must stay at the root.",
    transform: "position [x,y,z] in metres (y up), rotationDegrees [x,y,z], scale [x,y,z].",
    material: "PBR look for meshes and light markers. Colours are CSS strings, `#rrggbb` preferred.",
    modelMaterialOverrides: "Model entities only: per-slot overrides keyed by the slot ids the runtime reports; rarely needed.",
    geometry: "Primitive dimensions in metres: width/height/depth (box, plane), radius/tube (sphere, torus, cylinder, cone).",
    path: "Spline control points (spline entities only): `{ points: [[x,y,z], …], closed?, tension? }`.",
    asset: "Model entities only: a curated id from `modelAssetIds`, or a root-relative / HTTPS URL.",
    emitter: "Particle emitter config (emitter entities only).",
    sound: "Placed audio source (sound entities only); `source` is a sound id or URL.",
    terrain: "Heightmap terrain (terrain entities only).",
    water: "Reflective water plane (water entities only).",
    flock: "Boid flock (flock entities only).",
    crowd: "Ground crowd of wanderers and pursuers (crowd entities only).",
    formula: "Math-game molecule field (formula-field entities only).",
    surface: "Live generative texture on a primitive mesh.",
    steering: "Heading-based driving for a dynamic physics body.",
    dna: "Living Forest genome grove (dna-tree entities only).",
    forceField: "A field acting on other bodies, particles and flocks (force-field entities only).",
    agent: "Role, status and capabilities of an agent avatar (agent entities only).",
    physics: "Rigid body: `mode` static|dynamic|kinematic|trigger, mass, material, friction, restitution, velocities.",
    intensity: "Lights only: brightness (point lights read well between 2 and 8).",
    distance: "Point lights only: range in metres.",
    marker: "Point lights only: draw the small bulb sphere (default true).",
    visible: "Hidden entities still exist and can be toggled.",
    castShadow: "Mesh casts shadows.",
    receiveShadow: "Mesh receives shadows.",
    ephemeral: "Session-only; dropped from the saved document. Default false.",
    tags: "Free labels used by queries, rules and force-field filters.",
    behaviors: "Motion behaviors applied every frame (see `behaviors`).",
    interactions: "Authored reactions fired by `interact` or a trigger (see `interactions`).",
  },
  transform: { position: "Metres, y is up.", rotationDegrees: "Euler degrees.", scale: "Per axis multiplier, 1 is natural size." },
  material: {
    color: "Base colour.", emissive: "Self-lit colour; combine with bloom for glow.", emissiveIntensity: "Emissive strength.",
    roughness: "0 mirror, 1 matte.", metalness: "0 dielectric, 1 metal.", opacity: "Below 1 is translucent.",
    wireframe: "Draw edges only.", texture: "Curated texture `{ id, repeat?, offset?, rotationDegrees? }` from `textureIds`.",
    normalTexture: "Curated normal map, same shape as texture.", normalScale: "Normal map strength.", shader: "Recovered archive shader; leave absent for PBR.",
  },
  physics: {
    mode: "static never moves; dynamic falls and collides; kinematic moves by behaviors; trigger only notices crossings.",
    mass: "Kilograms, dynamic bodies.", material: "Named friction/restitution preset.", friction: "0..1.", restitution: "Bounciness 0..1.",
    linearVelocity: "Initial m/s.", angularVelocity: "Initial rad/s.", collider: "Models only: auto, convex-hull, or trimesh (static only).",
  },
  emitter: {
    preset: "Curated look from `emitterPresets`.", rate: "Particles per second.", maxParticles: "Live particle cap.", lifetimeSeconds: "Per particle.",
    speed: "Initial m/s.", sizeScale: "Multiplier over preset sizes.", volumeScale: "Multiplier over the spawn volume.", color: "Tint or null for the preset colours.",
    gravity: "[x,y,z] m/s².", direction: "Emission bias [x,y,z].", spread: "0 directional, 1 preset randomness.", seed: "Deterministic PRNG seed.", enabled: "Pause with false.",
  },
  terrain: {
    heightmap: "Curated id from `heightmapIds`, or null with inline `heights`.", heights: "Row-major square grid of 0..1 samples, 2x2 to 513x513.",
    size: "Edge length in metres.", segments: "Mesh resolution per edge.", heightScale: "Metres for a full 0..1 excursion.", heightOffset: "Vertical offset.",
    flattenRadius: "Flat pad radius around the origin.", flattenFalloff: "Blend distance back into the landform.", flattenHeight: "Pad height.",
  },
  water: {
    size: "Edge length in metres.", color: "Body colour #rrggbb; deep water is dark.", sunColor: "Specular highlight colour #rrggbb.", sunDirection: "[x,y,z].",
    distortionScale: "Reflection ripple distortion.", rippleScale: "Higher is smaller ripples; 1 reads as glass, 6-12 as a lake.", flowSpeed: "Ripple animation; 0 freezes.",
    opacity: "Below 1 shows the shore through.", reflectance: "Fresnel F0; 0.02 is physical water.", tintStrength: "0..1 pull toward colour with distance.",
    tintDistance: "Metres over which the tint ramps.", specularStrength: "Sun highlight strength.", reflection: "false disables the reflection pass (cheaper).", reflectionResolution: "Reflection render size in px.",
  },
  flock: {
    preset: "Curated starting point from `flockPresets`, or null.", count: "Members.", bounds: "sphere rides a shell of `radius`; box confines to `size`.",
    radius: "Shell radius for sphere bounds.", size: "Half-extents [x,y,z] for box bounds.", separation: "Reynolds weight.", alignment: "Reynolds weight.", cohesion: "Reynolds weight.",
    separationDistance: "Push-away distance.", neighborDistance: "Awareness distance.", speed: "Cruise m/s.", maxForce: "Turn tightness.", memberSize: "Body length in metres.",
    color: "#rrggbb.", emissive: "#rrggbb.", emissiveIntensity: "Glow.", trails: "Motion trails (costly).", trailLength: "Samples per member.", trailColor: "#rrggbb.", seed: "Deterministic scatter.",
  },
  crowd: {
    preset: "Curated starting point from `crowdPresets`, or null.", count: "Members.", pursuers: "How many start pursuing.", size: "Ground half-extents [x,z].",
    speed: "Wanderer m/s.", pursuitSpeedRatio: "Pursuer speed multiplier.", turnRate: "Radians per second.", separationDistance: "Personal space.", separation: "0..1 overlap resolution.",
    focus: "Fallback target [x,y,z].", conversion: "`{ from, to, radius?, afterSeconds? }` with roles wander|pursue.", memberSize: "Metres.", wanderColor: "#rrggbb.", pursuerColor: "#rrggbb.", emissiveIntensity: "Glow.", seed: "Deterministic.",
  },
  forceField: {
    preset: "Curated starting point from `forceFieldPresets`, or null.", kind: "attractor, flow, drag or vortex.", shape: "sphere, box or infinite.", radius: "Sphere radius.",
    size: "Box half-extents [x,y,z].", strength: "Signed m/s²; negative reverses the sense.", minimumDistance: "Attractor floor.", scale: "Flow cell frequency.", speed: "Flow animation.",
    edgeSoftness: "0 hard edge, 1 fades to centre.", affectsTags: "Only entities with one of these tags.", affectsBodies: "Act on rigid bodies.", affectsParticles: "Act on emitters.",
    affectsFlocks: "Act on flocks.", visualize: "Draw the field.", visualizeResolution: "Arrows per edge.", color: "#rrggbb.", enabled: "Pause with false.",
  },
  dna: {
    preset: "Curated grove from `dnaPresets`, or null.", seed: "Growth stream seed.", generation: "Which generation is expressed; 1 is the founder.", mutationRate: "0..0.35 drift.",
    trees: "Trees in the grove.", columns: "Trees per row.", spacing: "Grid pitch [x,z].", layoutJitter: "Root offset.", genome: "Shape parameters (see `dnaGenome`).",
    growSeconds: "Reveal duration; 0 is instant.", seasonSeconds: "Leaf-fall period; 0 keeps leaves.", barkColor: "Branch colour.", leaves: "Show leaves.",
  },
  formula: { preset: "Curated field from `formulaPresets`, or null.", kind: "parabola (a·x²+b·x+c) or slope (m·x+b).", lanes: "Rows along z.", perLane: "Molecules per lane.", spacing: "Metres between molecules.", moleculeSize: "Cube edge.", nearColor: "Gradient start.", farColor: "Gradient end." },
  sound: { source: "Sound id or URL.", volume: "0..1.", loop: "Default true.", autoplay: "Default true.", positional: "Attenuate with distance.", refDistance: "Metres before falloff." },
  surface: { sketch: "waveform, grid-pulse or plasma.", resolution: "Canvas px, 64..1024.", fps: "Redraws per second, 1..60.", emissive: "Also drive the emissive map.", tint: "#rrggbb multiplier." },
  steering: { headingDegrees: "0 points -Z, 90 points +X.", force: "Newtons at full thrust.", speedCap: "m/s per direction.", turnRateDegrees: "Degrees per second.", kickImpulse: "Impulse at kick 1.", jumpImpulse: "Vertical impulse at jump 1.", arrowId: "Non-physics entity anchored to the body.", arrowLift: "Arrow height offset." },
  agent: { role: "Short role text.", status: "Short status text.", perceptionRadius: "Metres.", capabilities: "Short labels." },
  environment: {
    background: "Flat background and fog colour.", sky: "Skybox id from `skyIds`, or null for the flat colour.",
    envelope: "`{ fogNear, fogFar, cameraFar }` in metres, or null for host defaults (34, 130, 260). Large worlds need one.",
    post: "`{ bloom: { strength, threshold, radius } }` or null for no post-processing.",
    lighting: "`{ source: sky|studio|hdri, hdri?, intensity, yawDegrees, backgroundIntensity, backgroundBlur }` or null for the automatic look.",
    dayNight: "`{ cycleSeconds, phaseOffset, day: look, night: look }` or null. A look is `{ sky, lighting, background }`; phaseOffset 0 starts at midnight, 0.5 at noon, ~0.4 reads as sunset.",
    overlay: "Generative 2D layer id from `overlayIds`, or null.", ground: "`{ visible, size, color, grid, gridColor }`.", physics: "`{ gravity: [x,y,z] }`, default [0,-9.81,0].",
  },
  behaviors: {
    spin: "Rotate about `axis` at `speedDegrees` per second.", bob: "Oscillate along `axis` by `amplitude` metres at `frequencyHz`.",
    orbit: "Circle `center` at `radius` and `speedDegrees` per second.", pulse: "Scale between `minimumScale` and `maximumScale` at `frequencyHz`.",
    "look-at": "Face `targetId` every frame.", "follow-spline": "Travel along `splineId` at `speed` m/s; `loop`, `orientToPath`.",
  },
  interactions: {
    "toggle-visibility": "Flip `visible` on `targetIds`.", "apply-impulse": "Push dynamic `targetIds` by `impulse` [x,y,z] newton-seconds.",
    "play-sound": "Play `sound` (id or URL) at the entity or at `targetIds`.",
  },
  joint: { type: "fixed, revolute (needs `axis`) or rope (needs `length`).", bodyA: "Existing physics entity id.", bodyB: "Existing physics entity id.", anchorA: "Local [x,y,z] on A.", anchorB: "Local [x,y,z] on B.", axis: "Revolute hinge axis.", length: "Rope maximum separation." },
};

/** `[minimum, maximum]` for a field, looked up in the validator's LIMITS table; null when unbounded. */
function boundsFor(block, field) {
  const table = LIMITS[block];
  if (!table) return null;
  const direct = table[field];
  if (Array.isArray(direct)) return direct;
  if (block === "geometry" && field !== "radialSegments") return LIMITS.geometry.size;
  if (block === "material" && ["roughness", "metalness", "opacity"].includes(field)) return LIMITS.material[field];
  return null;
}

function fieldList(block, names, { extraBounds = {} } = {}) {
  return names.map((name) => {
    const entry = { name };
    const line = describe[block]?.[name];
    if (line) entry.description = line;
    const bounds = extraBounds[name] ?? boundsFor(block, name);
    if (bounds) entry.range = [bounds[0], bounds[1] === 1 - Number.EPSILON ? 1 : bounds[1]];
    return entry;
  });
}

const config = { emitter: "emitter", sound: "sound", terrain: "terrain", water: "water", flock: "flock", crowd: "crowd", formula: "formula-field", dna: "dna-tree", forceField: "force-field", agent: "agent" };

/**
 * Build the vocabulary. `descriptors` are the runtime's own catalogue tables, passed by the
 * build; each is optional and, when absent, the corresponding list is ids only (prefabs: empty).
 */
export function buildWorldVocabulary({ descriptors = {} } = {}) {
  const tables = SCENE_COMMAND_TABLES;
  const byId = (list) => new Map((list ?? []).map((item) => [item.id, item]));
  const described = (ids, list, pick) => ids.map((id) => {
    const item = byId(list).get(id);
    return item ? { id, ...pick(item) } : { id };
  });
  const entityTypes = {};
  for (const type of tables.entityTypes) {
    const block = Object.entries(config).find(([, expected]) => expected === type)?.[0] ?? null;
    entityTypes[type] = {
      primitive: tables.primitiveTypes.includes(type),
      physics: !tables.physicsForbiddenTypes.includes(type),
      config: block,
      ...(type === "spline" ? { requires: ["path"] } : {}),
      ...(type === "model" ? { requires: ["asset"] } : {}),
      ...(type === "sound" ? { requires: ["sound.source"] } : {}),
      ...(type.endsWith("-light") ? { fields: ["intensity", ...(type === "point-light" ? ["distance", "marker"] : [])] } : {}),
    };
  }

  const vocabulary = {
    schema: WORLD_VOCABULARY_SCHEMA,
    worldSchema: WORLD_SCHEMA,
    proposalLimits: { ...PROPOSAL_LIMITS },
    idPattern: ID_PATTERN.source,
    reservedIdPrefixes: [...HOST_ONLY_ENTITY_ID_PREFIXES],
    operations: Object.fromEntries(Object.entries(OPERATIONS).map(([op, entry]) => [op, { ...entry, documentSubset: tables.documentOps.includes(op) }])),
    entityTypes,
    fields: {
      entity: fieldList("entity", FIELDS.entity),
      patch: FIELDS.patch,
      transform: fieldList("transform", FIELDS.transform),
      material: fieldList("material", FIELDS.material),
      texture: fieldList("texture", FIELDS.texture),
      geometry: fieldList("geometry", FIELDS.geometry),
      path: fieldList("path", FIELDS.path, { extraBounds: { points: LIMITS.path.points } }),
      asset: fieldList("asset", FIELDS.asset),
      agent: fieldList("agent", FIELDS.agent),
      sound: fieldList("sound", FIELDS.sound),
      emitter: fieldList("emitter", FIELDS.emitter),
      terrain: fieldList("terrain", FIELDS.terrain),
      water: fieldList("water", FIELDS.water),
      flock: fieldList("flock", FIELDS.flock),
      crowd: fieldList("crowd", FIELDS.crowd),
      crowdConversion: FIELDS.crowdConversion,
      formula: fieldList("formula", FIELDS.formula),
      dna: fieldList("dna", FIELDS.dna),
      dnaGenome: FIELDS.dnaGenome,
      forceField: fieldList("forceField", FIELDS.forceField),
      surface: fieldList("surface", FIELDS.surface),
      steering: fieldList("steering", FIELDS.steering),
      physics: fieldList("physics", FIELDS.physics),
      environment: fieldList("environment", FIELDS.environment),
      envelope: fieldList("envelope", FIELDS.envelope, { extraBounds: Object.fromEntries(FIELDS.envelope.map((key) => [key, LIMITS.envelope])) }),
      bloom: fieldList("bloom", FIELDS.bloom),
      lighting: fieldList("lighting", FIELDS.lighting),
      dayNight: fieldList("dayNight", FIELDS.dayNight),
      dayNightLook: FIELDS.dayNightLook,
      ground: fieldList("ground", FIELDS.ground),
      environmentPhysics: fieldList("environmentPhysics", FIELDS.environmentPhysics, { extraBounds: { gravity: LIMITS.gravity } }),
      joint: fieldList("joint", FIELDS.joint),
    },
    behaviors: Object.fromEntries(Object.entries(FIELDS.behaviors).map(([type, fields]) => [type, { fields: [...fields], description: describe.behaviors[type] }])),
    interactions: Object.fromEntries(Object.entries(FIELDS.interactions).map(([type, fields]) => [type, { fields: [...fields], description: describe.interactions[type] }])),
    enums: {
      physicsModes: [...ENUMS.physicsModes],
      physicsMaterials: [...ENUMS.physicsMaterials],
      colliders: [...ENUMS.colliders],
      axes: [...ENUMS.axes],
      jointTypes: [...ENUMS.jointTypes],
      lightingSources: [...ENUMS.lightingSources],
      flockBounds: [...ENUMS.flockBounds],
      crowdRoles: [...ENUMS.crowdRoles],
      formulaKinds: [...ENUMS.formulaKinds],
      forceFieldKinds: [...ENUMS.forceFieldKinds],
      forceFieldShapes: [...ENUMS.forceFieldShapes],
      surfaceSketches: described(ENUMS.surfaceSketches, descriptors.surfaces, (s) => ({ label: s.label, description: s.description })),
      skyIds: described(tables.skyIds, descriptors.skies, (s) => ({ label: s.label, description: s.description })),
      hdriIds: described(tables.hdriIds, descriptors.hdris, (h) => ({ label: h.label, description: h.description })),
      overlayIds: described(tables.overlayIds, descriptors.overlays, (o) => ({ label: o.label, description: o.description })),
      textureIds: [...tables.textureIds],
      modelAssetIds: [...tables.modelAssetIds],
      emitterPresets: described(tables.emitterPresets, descriptors.emitters, (e) => ({ label: e.label, description: e.description })),
      heightmapIds: described(tables.heightmapIds, descriptors.heightmaps, (h) => ({ label: h.label, description: h.description })),
      flockPresets: described(tables.flockPresets, descriptors.flocks, (f) => ({ label: f.label, description: f.description })),
      crowdPresets: described(tables.crowdPresets, descriptors.crowds, (c) => ({ label: c.label, description: c.description })),
      formulaPresets: described(tables.formulaPresets, descriptors.formulas, (f) => ({ label: f.label, description: f.description })),
      dnaPresets: described(tables.dnaPresets, descriptors.dnas, (d) => ({ label: d.label, description: d.description })),
      forceFieldPresets: described(tables.forceFieldPresets, descriptors.forceFields, (f) => ({ label: f.label, description: f.description })),
    },
    prefabs: (descriptors.prefabs ?? []).map((prefab) => ({ id: prefab.id, label: prefab.label, summary: prefab.summary, entityCount: prefab.entityCount })),
    limits: {
      strings: { ...LIMITS.strings },
      arrays: { ...LIMITS.arrays },
      document: { ...LIMITS.document },
    },
    rules: [
      "Reply with JSON only: { \"intent\": string, \"commands\": [ ... ] }. No prose, no markdown fences.",
      `At most ${PROPOSAL_LIMITS.commands} commands; the intent is one sentence under ${PROPOSAL_LIMITS.intentChars} characters saying what the change does.`,
      "Use only the operations listed in `operations`, the entity types in `entityTypes` and the fields listed for each block.",
      "`update`, `remove`, `attach-behavior`, `detach-behavior`, `interact`, `steer` and `select` may only name ids present in the scene summary you were given.",
      "`spawn` ids must be new and must match `idPattern`; never use an id starting with one of `reservedIdPrefixes`.",
      "Keep numbers inside the published ranges. The showroom is about 36 metres across; place new things within roughly 20 metres of the origin and above y = 0.",
      "Prefer a curated preset (emitter, flock, crowd, force field, dna, sky, HDRI, texture, model) over inventing parameters.",
      "Nothing you return is applied: a person reviews the commands line by line and accepts or discards them.",
    ],
    examples: EXAMPLES,
  };
  return vocabulary;
}

/**
 * A small set of valid command lists, one per family. They are part of the published file so a
 * model sees the shapes; the unit test runs every document-subset example through
 * `applyCommands` and every example through the provider's structural validation.
 */
export const EXAMPLES = Object.freeze({
  "primitive-and-light": [
    { op: "spawn", entity: { id: "lamp-post", type: "cylinder", label: "Lamp post", transform: { position: [4, 1.5, -2], scale: [1, 1, 1] }, geometry: { radius: 0.08, height: 3 }, material: { color: "#3a4a55", roughness: 0.7, metalness: 0.4 } } },
    { op: "spawn", entity: { id: "lamp-light", type: "point-light", label: "Lamp light", parentId: "lamp-post", transform: { position: [0, 1.7, 0] }, intensity: 5, distance: 14, marker: false, material: { color: "#ffd9a8", emissive: "#ff9a3c", emissiveIntensity: 1.2 } } },
  ],
  "water-and-flock-at-sunset": [
    { op: "spawn", entity: { id: "lake", type: "water", label: "Lake", transform: { position: [0, -0.4, 10] }, water: { size: 24, color: "#0b2a3a", sunColor: "#ffb067", rippleScale: 8, flowSpeed: 0.6, opacity: 0.92 } } },
    { op: "spawn", entity: { id: "lake-birds", type: "flock", label: "Birds over the lake", transform: { position: [0, 6, 10] }, flock: { preset: "starlings", count: 90, bounds: "box", size: [12, 3, 12], color: "#2b1d1a", speed: 5.5 } } },
    { op: "set-environment", environment: { background: "#4a2630", sky: "lostvalley", lighting: { source: "sky", intensity: 1.1, yawDegrees: 35, backgroundIntensity: 0.9, backgroundBlur: 0 }, post: { bloom: { strength: 0.6, threshold: 0.82, radius: 0.5 } } } },
  ],
  "day-night-cycle": [
    { op: "set-environment", environment: { dayNight: { cycleSeconds: 120, phaseOffset: 0.4, day: { sky: "clearblue", lighting: { source: "sky", intensity: 1, yawDegrees: 0, backgroundIntensity: 1, backgroundBlur: 0 }, background: "#9fc7e6" }, night: { sky: "nightsky", lighting: { source: "sky", intensity: 0.35, yawDegrees: 0, backgroundIntensity: 0.6, backgroundBlur: 0 }, background: "#06101c" } } } },
  ],
  "motion-behaviors": [
    { op: "spawn", entity: { id: "drifting-orb", type: "sphere", label: "Drifting orb", transform: { position: [-5, 2, -4] }, geometry: { radius: 0.5 }, material: { color: "#8cf6ff", emissive: "#1aa8c8", emissiveIntensity: 1.5 } } },
    { op: "attach-behavior", id: "drifting-orb", behavior: { id: "orb-bob", type: "bob", axis: "y", amplitude: 0.6, frequencyHz: 0.4 } },
    { op: "attach-behavior", id: "drifting-orb", behavior: { id: "orb-spin", type: "spin", axis: "y", speedDegrees: 40 } },
  ],
  "physics-and-interaction": [
    { op: "spawn", entity: { id: "crate", type: "box", label: "Crate", transform: { position: [3, 0.5, 3] }, geometry: { width: 1, height: 1, depth: 1 }, material: { color: "#b9834a" }, physics: { mode: "dynamic", mass: 4, friction: 0.6, restitution: 0.2 } } },
    { op: "update", id: "crate", patch: { interactions: [{ id: "crate-kick", type: "apply-impulse", targetIds: ["crate"], impulse: [0, 6, -4] }] } },
    { op: "interact", id: "crate", interactionId: "crate-kick" },
  ],
  "living-systems": [
    { op: "spawn", entity: { id: "campfire", type: "emitter", label: "Campfire", transform: { position: [-3, 0.2, 2] }, emitter: { preset: "campfire", rate: 60 } } },
    { op: "spawn", entity: { id: "grove", type: "dna-tree", label: "Grove", transform: { position: [8, 0, 6] }, dna: { preset: "single-specimen", generation: 2 } } },
    { op: "spawn", entity: { id: "well", type: "force-field", label: "Gravity well", transform: { position: [0, 3, -6] }, forceField: { preset: "gravity-well", radius: 6, strength: 12 } } },
  ],
  "prefab": [
    { op: "spawn-prefab", prefabId: "luminous-tree", options: { idPrefix: "glow-tree", position: [-6, 0, 4], scale: [1.2, 1.2, 1.2], tags: ["garden"] } },
    { op: "select", ids: ["glow-tree"] },
  ],
  "update-and-remove": [
    { op: "update", id: "lamp-light", patch: { intensity: 2, material: { color: "#9ad8ff" } } },
    { op: "remove", id: "crate" },
  ],
});

/** The JSON text the build writes to `dist/embed/world-vocabulary.json`. */
export function renderWorldVocabulary(options) {
  return `${JSON.stringify(buildWorldVocabulary(options), null, 1)}\n`;
}
