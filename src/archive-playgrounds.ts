import type {
  AgentWorldDefinition,
  AgentWorldEntityDefinition,
  GraphysXAgentWorldApi,
} from "./agent-world-runtime";

/**
 * Two recovered GraphysX **playgrounds**, rebuilt as platform-native v2 scenes.
 *
 * ## What this is, and what it is deliberately not
 *
 * This module contains **no three.js and no runtime imports at all** — only type imports,
 * which erase to nothing. Everything below is plain scene data: two `AgentWorldDefinition`
 * documents assembled from ordinary v2 vocabulary (`terrain`, `flock`, `force-field`,
 * `emitter`, primitives, behaviors, interactions) and handed to `api.create`. From that
 * point there is nothing archive-shaped left: both scenes are selectable, editable in the
 * workbench, exportable, and survive export→load like a scene someone composed this
 * afternoon. §10's pipeline ends at *vocabulary*, not at a special archive surface.
 *
 * The legacy module in this repo — `src/nature-lab.ts`, 1613 lines — is the counter-example
 * and was **consulted, never ported**. It builds `InstancedMesh`, `LineSegments`,
 * `ShaderMaterial` and canvas textures directly against the scene graph, runs its own
 * integrator, and is unreachable from here. What crossed over is numbers, not code.
 *
 * ## Why these two, out of eleven candidates
 *
 * The archive-mode census (`src/archive-content.ts`) lists eleven playground candidates.
 * Most are *galleries*: `object-library-catalog`, `dominus-asset-gallery`,
 * `dominus-port-evidence`, `arena-archive`, `maison-explorer` and `common-room-lab` are
 * inspection grids of archived meshes, whose whole content is geometry this vocabulary
 * cannot author and whose own records refuse to infer a composition. `physics-lab` is
 * Newton *joints* — a hinged seesaw, a pendulum chain, a wrecking ball — and v2 has no
 * constraint vocabulary at all, so it would ship as loose boxes. `input-device-lab` has no
 * 3D content. `threejs-playground` is a genuine composition but three of its five subjects
 * (a GLB airplane, per-object morph `ShaderMaterial`s, a bespoke asteroid cubemap) have no
 * v2 expression. See {@link ARCHIVE_PLAYGROUNDS_NOT_REVIVED} for the full record.
 *
 * The Nature Lab is the one candidate that is *simulation first*, and — this is the actual
 * reason — its numbers have **already graduated into the platform**. The `orbital-swarm`
 * flock preset's own provenance says "src/nature-lab.ts … count 60 / radius 5.25 /
 * maxForce 0.58 carried over unchanged"; the `flow-garden` and `gravity-well` force-field
 * presets cite `flowfield.js` and `attractor.js` with the same nature-lab lineage. So these
 * two scenes are not an approximation of the recovered studies — for their central system
 * they are the recovered constants, addressed by name. That is why the fidelity claims
 * below can be machine-checked against the shipped presets rather than asserted in prose.
 *
 * Both are from the same legacy module, which is worth saying plainly rather than hiding:
 * they are two of `NATURE_LAB_STUDIES`' four studies. They are chosen over a wider spread
 * because a gallery rebuilt without its geometry is theatre, and because the two read as
 * completely different scenes — one is a planet against a starfield, the other is a
 * ground-level force laboratory.
 */

/** Where a scene's numbers came from, and where the authoritative bytes actually live. */
export type PlaygroundProvenance = {
  /** Human name of the archived study. */
  study: string;
  /** The archive-mode id this study was reachable under, before it was a scene. */
  archiveModeId: string;
  /** Authoritative source files, by their archive-relative path. */
  sourcePaths: readonly string[];
  /** Where the bytes are. Recorded rather than implied. */
  sourceLocation: string;
  /** The in-repo legacy implementation this module read the numbers out of. */
  transcribedFrom: readonly string[];
  /**
   * Platform presets whose own `provenance` block already cites this study. These are the
   * strongest claims in the module: the constants are not re-typed here, they are addressed
   * by preset id, so the smoke re-derives them from the shipped registry.
   */
  graduatedPresets: readonly { preset: string; module: string; carries: string }[];
  /** Native authored units and extent. */
  nativeUnits: string;
  /** The conversion applied to reach the shipped scene. */
  conversion: string;
};

export type PlaygroundFidelity = {
  /** Carried across exactly, and machine-checked where possible. */
  faithful: readonly string[];
  /** Authored connective tissue — real design decisions made here, not recovered. */
  inferred: readonly string[];
  /** Present in the record, knowingly not reproduced, with the reason. */
  deliberatelyAbsent: readonly string[];
};

export type PlaygroundDeviation = { code: string; detail: string };

export type ArchivePlaygroundId = "archive-flock-planet" | "archive-forces-garden";

export type ArchivePlayground = {
  id: ArchivePlaygroundId;
  label: string;
  summary: string;
  provenance: PlaygroundProvenance;
  fidelity: PlaygroundFidelity;
  deviations: readonly PlaygroundDeviation[];
};

// ---------------------------------------------------------------------------------------
// Shared numbers recovered from src/nature-lab.ts. Named constants rather than magic
// literals, so the smoke can assert the shipped scene against the record it claims.
// ---------------------------------------------------------------------------------------

/** `buildFlockPlanet`: `SphereGeometry(4.4, 64, 40)`, tint `#c9e7ec`, roughness .76, metalness .06. */
const PLANET_RADIUS = 4.4;
/** `SphereGeometry(4.54, 48, 32)`, `#8ad8ff`, opacity 0.12, DoubleSide. */
const ATMOSPHERE_RADIUS = 4.54;
/** `TorusGeometry(4.72, 0.018, 6, 160)`, `#75e8ff`, opacity 0.28, additive. Two of them. */
const ORBIT_RING_RADIUS = 4.72;
/** The flock rides a shell at this radius; `orbital-swarm`'s own default is the same number. */
const FLOCK_SHELL_RADIUS = 5.25;
/** `planet.rotation.y += delta * 0.055` rad/s. */
const PLANET_SPIN_DEG = (0.055 * 180) / Math.PI; // 3.151
/** `atmosphere.rotation.y += delta * 0.082` rad/s. */
const ATMOSPHERE_SPIN_DEG = (0.082 * 180) / Math.PI; // 4.698
/** `boid.js` retains 45 trail samples per active boid. The platform cap is 48, so this fits. */
const ARCHIVE_TRAIL_SAMPLES = 45;
/**
 * The one number in this scene that is a staging decision rather than a record.
 *
 * Every radius below is the archive's, verbatim, and stays that way in the document. They
 * are then *presented* through a single root group scaled uniformly, because the archive
 * system is 11 world units across and the host's default framing is tuned to the ~36-unit
 * showroom — at 1:1 the planet is a coin in the middle of an empty frame. Scaling at the
 * root rather than editing the radii means the ratios 4.4 : 4.54 : 4.72 : 5.25 are exact by
 * construction, the numbers a reader sees are the archive's, and the departure is one
 * declared factor in one place. The same call `composeBallzLevel` makes with `cellSize`.
 */
const PLANET_STAGE_SCALE = 1.9;

/** `buildForcesGarden`: `IcosahedronGeometry(0.92, 3)` at `(0, 2.55, 0)`. */
const ATTRACTOR_POSITION: [number, number, number] = [0, 2.55, 0];
const ATTRACTOR_RADIUS = 0.92;
/** Child `TorusGeometry(1.36, 0.035, 8, 72)`, `#ff9857`, opacity 0.72, additive. */
const ATTRACTOR_RING_RADIUS = 1.36;
const ATTRACTOR_RING_TUBE = 0.035;
/** `attractor.rotation.y += delta * 0.8` rad/s in the combined lesson. */
const ATTRACTOR_SPIN_DEG = (0.8 * 180) / Math.PI; // 45.84
/** `ring.rotation.z += delta * 0.7` rad/s. */
const ATTRACTOR_RING_SPIN_DEG = (0.7 * 180) / Math.PI; // 40.11
/** Flow-field grid extent: `x ∈ [-10, 10]`, `z ∈ [-7, 7]`, drawn at `y = 0.13`, step 1.4. */
const FLOW_HALF_X = 10;
const FLOW_HALF_Z = 7;
const FLOW_STEP = 1.4;
/**
 * `visualizeResolution` is a count, not a step. 15 samples across a 20-unit span is a
 * 1.428-unit pitch — the closest the (1..24) integer knob gets to the archive's 1.4.
 */
const FLOW_VISUALIZE_RESOLUTION = 15;
/** Mass particles: `mass = 0.55 + rnd * 2.45`, so the authored range is exactly [0.55, 3.0]. */
const MASS_MINIMUM = 0.55;
const MASS_MAXIMUM = 3.0;
/** `mass < 1.65 ? HSL(0.45, .82, .61) : HSL(0.12, .82, .61)`. */
const MASS_COLOUR_THRESHOLD = 1.65;
/** HSL(0.45, 0.82, 0.61) resolved to hex — the archive's "light mass" cyan. */
const MASS_LIGHT_COLOUR = "#4aedbc";
/** HSL(0.12, 0.82, 0.61) resolved to hex — the archive's "heavy mass" amber. */
const MASS_HEAVY_COLOUR = "#edbf4a";
/** Instance scale rule: `0.72 + mass * 0.24`, applied to a 0.12-radius sphere. */
const massScaleRule = (mass: number): number => 0.72 + mass * 0.24;
/** `FlowWalkers`: 18 `ConeGeometry(0.2, 0.52, 5)` vehicles, `#f0fbff` / emissive `#116d79`. */
const WALKER_COUNT = 18;
const WALKER_SIZE = 0.52;
/** `WalkerPathMemory`: `#ffe47a`, additive, 420 samples ≈ seven seconds of 60 Hz history. */
const WALKER_TRAIL_COLOUR = "#ffe47a";
const ARCHIVE_WALKER_TRAIL_SAMPLES = 420;

/**
 * The recovered numbers, exported so the smoke asserts the *shipped scene* against the
 * record rather than against a second copy of the same literals written into the test.
 * Every value here is read out of `src/nature-lab.ts`; nothing is chosen.
 */
export const ARCHIVE_PLAYGROUND_CONSTANTS = {
  flockPlanet: {
    planetRadius: PLANET_RADIUS,
    atmosphereRadius: ATMOSPHERE_RADIUS,
    orbitRingRadius: ORBIT_RING_RADIUS,
    flockShellRadius: FLOCK_SHELL_RADIUS,
    planetSpinRadiansPerSecond: 0.055,
    atmosphereSpinRadiansPerSecond: 0.082,
    trailSamples: ARCHIVE_TRAIL_SAMPLES,
    starfieldPointCount: 900,
  },
  forcesGarden: {
    attractorPosition: ATTRACTOR_POSITION,
    attractorRadius: ATTRACTOR_RADIUS,
    attractorRingRadius: ATTRACTOR_RING_RADIUS,
    attractorRingTube: ATTRACTOR_RING_TUBE,
    attractorSpinRadiansPerSecond: 0.8,
    ringSpinRadiansPerSecond: 0.7,
    flowHalfExtents: [FLOW_HALF_X, FLOW_HALF_Z],
    /** The archive's arrow pitch. `FLOW_VISUALIZE_RESOLUTION` is the closest integer count to it. */
    flowGridStep: FLOW_STEP,
    flowVisualizeResolution: FLOW_VISUALIZE_RESOLUTION,
    massRange: [MASS_MINIMUM, MASS_MAXIMUM],
    massColourThreshold: MASS_COLOUR_THRESHOLD,
    massLightColour: MASS_LIGHT_COLOUR,
    massHeavyColour: MASS_HEAVY_COLOUR,
    walkerCount: WALKER_COUNT,
    walkerSize: WALKER_SIZE,
    walkerTrailColour: WALKER_TRAIL_COLOUR,
    /** Capped to 48 by `AGENT_WORLD_FLOCK_MAX_TRAIL_LENGTH` — the scene's largest single loss. */
    archiveWalkerTrailSamples: ARCHIVE_WALKER_TRAIL_SAMPLES,
    /** The archive's mass-instance scale rule, so the smoke can re-derive every probe radius. */
    massScaleRule,
  },
} as const;

// ---------------------------------------------------------------------------------------
// Scene 1 — Flock Planet
// ---------------------------------------------------------------------------------------

/**
 * The `flock-planet` study: a layered planet with a murmuration riding its shell.
 *
 * The whole simulation is **one entity**. `flock: { preset: "orbital-swarm" }` is not an
 * approximation of the recovered lesson — the preset's own provenance block names
 * `src/nature-lab.ts` and records that count 60, radius 5.25 and maxForce 0.58 were carried
 * over unchanged when flocking graduated. Everything this scene adds around it is the
 * *staging* the study drew by hand: the planet, its atmosphere shell, and the two orbit
 * rings, in the archive's own radii and colours.
 */
function flockPlanet(): AgentWorldDefinition {
  const ringMaterial = {
    color: "#75e8ff",
    emissive: "#1c7f9c",
    emissiveIntensity: 1.15,
    roughness: 0.4,
    metalness: 0.1,
    opacity: 0.62,
  };

  return {
    schema: "graphysx.agent-world/v2",
    id: "archive-flock-planet",
    label: "Flock Planet — Nature Lab",
    environment: {
      background: "#03070f",
      // The archive drew 900 additive points at distance 18–44. There is no point-cloud
      // entity in v2, and a 900-member flock would blow the 240 cap and simulate steering
      // for something that is meant to be motionless. A recovered night skybox stands in.
      //
      // `nightsky` is the obvious pick on its descriptor ("the highest-fidelity night set —
      // pick this when the stars are the subject") and is the *wrong* one, which is worth
      // recording because only a screenshot catches it: nightsky's cube faces carry a
      // horizon silhouette and a near-black down face, so a body floating at the origin sits
      // against a dark ground plane from any camera that looks even slightly downward.
      // `clearnight` is stars on all six faces, which is what "in space" needs.
      sky: "clearnight",
      // A planet floating in space has no ground plane and no horizon grid.
      ground: { visible: false, size: 40, color: "#0a1420", grid: false, gridColor: "#1d3448" },
      // Default fog starts at 34 units, which would smear the far side of a body whose
      // whole extent is 11 units across. Pushed out so the planet is never fogged and the
      // starfield stays black rather than washing to fog colour.
      envelope: { fogNear: 180, fogFar: 400, cameraFar: 900 },
    },
    entities: [
      {
        id: "flock-planet-ambient",
        type: "ambient-light",
        label: "Ambient Light",
        intensity: 0.38,
        material: { color: "#7f9dc4" },
        tags: ["archive-playground", "flock-planet", "lighting"],
      },
      {
        // Deliberately low and to one side: a planet is legible because it has a
        // terminator. A flat front light turns it into a disc.
        id: "flock-planet-sun",
        type: "directional-light",
        label: "Key Light",
        intensity: 3.4,
        transform: { position: [16, 7, 13] },
        material: { color: "#fff2dc" },
        castShadow: true,
        tags: ["archive-playground", "flock-planet", "lighting"],
      },
      {
        // The staging root. Everything with a recovered radius hangs off this, so the scene
        // is presented at `PLANET_STAGE_SCALE` while every number in the document stays the
        // archive's. Selecting and rescaling this one group is also how a visitor puts the
        // system back to 1:1.
        id: "flock-planet-system",
        type: "group",
        label: "Planet System",
        transform: { position: [0, 0, 0], scale: [PLANET_STAGE_SCALE, PLANET_STAGE_SCALE, PLANET_STAGE_SCALE] },
        tags: ["archive-playground", "flock-planet", "stage"],
      },
      {
        id: "flock-planet-surface",
        parentId: "flock-planet-system",
        type: "sphere",
        label: "Layered Planet",
        geometry: { radius: PLANET_RADIUS, radialSegments: 64 },
        transform: { position: [0, 0, 0] },
        // The archive generated its own 1024x512 canvas map — an ocean gradient with 42
        // polygonal continents. A canvas texture is not v2 vocabulary; the registry's
        // recovered `earth` map is. The tint, roughness and metalness are the archive's.
        material: { color: "#c9e7ec", roughness: 0.76, metalness: 0.06, texture: { id: "earth" } },
        behaviors: [{ id: "planet-spin", type: "spin", axis: "y", speedDegrees: PLANET_SPIN_DEG }],
        receiveShadow: true,
        tags: ["archive-playground", "flock-planet", "planet"],
      },
      {
        id: "flock-planet-atmosphere",
        parentId: "flock-planet-system",
        type: "sphere",
        label: "Cloud Atmosphere",
        geometry: { radius: ATMOSPHERE_RADIUS, radialSegments: 48 },
        transform: { position: [0, 0, 0] },
        // `MeshPhysicalMaterial` transmission has no v2 field; opacity carries the read.
        material: { color: "#8ad8ff", opacity: 0.12, roughness: 0.9, metalness: 0 },
        behaviors: [{ id: "atmosphere-spin", type: "spin", axis: "y", speedDegrees: ATMOSPHERE_SPIN_DEG }],
        // The shell is the one thing here a visitor can switch off, which is worth having:
        // with it hidden the flock's shell radius and the two rings read as one system.
        interactions: [
          {
            id: "toggle-shell",
            label: "Toggle atmosphere and orbit rings",
            type: "toggle-visibility",
            targetIds: ["flock-planet-atmosphere", "flock-planet-ring-equatorial", "flock-planet-ring-inclined"],
          },
        ],
        tags: ["archive-playground", "flock-planet", "planet", "interactive"],
      },
      {
        id: "flock-planet-ring-equatorial",
        parentId: "flock-planet-system",
        type: "torus",
        label: "Orbit Ring (equatorial)",
        // Archive tube is 0.018 on an additively-blended line-thin torus. v2 has no additive
        // blend mode for a standard material, so a 0.018 tube at this radius resolves to
        // roughly one pixel and disappears. Thickened to 0.03 and given emissive lift.
        geometry: { radius: ORBIT_RING_RADIUS, tube: 0.03, radialSegments: 48 },
        transform: { position: [0, 0, 0], rotationDegrees: [90, 0, 0] },
        material: ringMaterial,
        tags: ["archive-playground", "flock-planet", "ring"],
      },
      {
        id: "flock-planet-ring-inclined",
        parentId: "flock-planet-system",
        type: "torus",
        label: "Orbit Ring (inclined)",
        geometry: { radius: ORBIT_RING_RADIUS, tube: 0.03, radialSegments: 48 },
        // The archive clone is `rotation.set(0.72, 0.25, 0.2)` in radians, verbatim.
        transform: {
          position: [0, 0, 0],
          rotationDegrees: [(0.72 * 180) / Math.PI, (0.25 * 180) / Math.PI, (0.2 * 180) / Math.PI],
        },
        material: ringMaterial,
        tags: ["archive-playground", "flock-planet", "ring"],
      },
      {
        // The study, as one entity. Only the two fields the preset caps below the archive
        // are restored here — trails, which nature-lab kept at 45 samples and the preset
        // trimmed to 32. Everything else is the preset, which *is* the record.
        id: "flock-planet-swarm",
        parentId: "flock-planet-system",
        type: "flock",
        label: "Spherical Boid Flock",
        transform: { position: [0, 0, 0] },
        flock: {
          preset: "orbital-swarm",
          radius: FLOCK_SHELL_RADIUS,
          trails: true,
          trailLength: ARCHIVE_TRAIL_SAMPLES,
          trailColor: "#56dfff",
        },
        tags: ["archive-playground", "flock-planet", "life", "flock"],
      },
    ],
  };
}

// ---------------------------------------------------------------------------------------
// Scene 2 — Forces & Flow Garden
// ---------------------------------------------------------------------------------------

/**
 * The archive's ground relief, re-derived rather than transcribed.
 *
 * `buildForcesGarden` displaces every vertex of a `PlaneGeometry(24, 18, 32, 24)` by
 * `sin(x * 0.42) * 0.08 + cos(z * 0.51) * 0.08`. A `terrain` entity takes an inline
 * `heights` field of 0..1 values, so evaluating the same closed form on a square sample
 * grid and pairing it with `heightScale` = the formula's full 0.32 span reproduces the
 * relief exactly instead of approximating it with a registry heightmap.
 */
function gardenHeights(samples: number, size: number): number[] {
  const heights: number[] = [];
  for (let row = 0; row < samples; row += 1) {
    for (let column = 0; column < samples; column += 1) {
      const x = (column / (samples - 1) - 0.5) * size;
      const z = (row / (samples - 1) - 0.5) * size;
      const y = Math.sin(x * 0.42) * 0.08 + Math.cos(z * 0.51) * 0.08;
      // The formula's range is [-0.16, 0.16]; normalise into 0..1 and let heightScale 0.32
      // with heightOffset -0.16 put it back exactly where it was.
      heights.push((y + 0.16) / 0.32);
    }
  }
  return heights;
}

/** The six rigid-body mass probes: the archive's authored mass range, its colour rule, its scale rule. */
const MASS_PROBES: readonly { mass: number; angle: number }[] = [
  { mass: MASS_MINIMUM, angle: 0 },
  { mass: 1.0, angle: 60 },
  { mass: 1.6, angle: 120 },
  { mass: 1.9, angle: 180 },
  { mass: 2.4, angle: 240 },
  { mass: MASS_MAXIMUM, angle: 300 },
];

/** Orbit radius for the probes. Chosen so every probe starts the same distance from the attractor. */
const PROBE_ORBIT_RADIUS = 6.2;
/** Attractor strength, from the `gravity-well` preset. Repeated here only to size the probes' orbit. */
const ATTRACTOR_STRENGTH = 40;

function massProbes(): AgentWorldEntityDefinition[] {
  // The field's acceleration at the probe ring is strength / d^2, and it is independent of
  // mass by construction (see agent-world-force-field.ts). A circular orbit therefore needs
  // v = sqrt(a * d), the same speed for every probe regardless of what it weighs — which is
  // the study's actual lesson, expressed as an initial condition rather than as prose.
  const acceleration = ATTRACTOR_STRENGTH / (PROBE_ORBIT_RADIUS * PROBE_ORBIT_RADIUS);
  const orbitalSpeed = Math.sqrt(acceleration * PROBE_ORBIT_RADIUS);

  return MASS_PROBES.map(({ mass, angle }, index): AgentWorldEntityDefinition => {
    const radians = (angle * Math.PI) / 180;
    const x = ATTRACTOR_POSITION[0] + Math.cos(radians) * PROBE_ORBIT_RADIUS;
    const z = ATTRACTOR_POSITION[2] + Math.sin(radians) * PROBE_ORBIT_RADIUS;
    // Tangent to the circle, so the probes sweep around the attractor instead of falling
    // straight in and piling up.
    const velocity: [number, number, number] = [
      -Math.sin(radians) * orbitalSpeed,
      0,
      Math.cos(radians) * orbitalSpeed,
    ];
    const light = mass < MASS_COLOUR_THRESHOLD;
    // 0.12 * 3.2 = 0.384. The archive rule is kept; only the scale factor is declared.
    const radius = Number((0.384 * massScaleRule(mass)).toFixed(3));

    return {
      id: `forces-mass-${index}`,
      type: "sphere",
      label: `Mass ${mass}`,
      geometry: { radius, radialSegments: 24 },
      transform: { position: [x, ATTRACTOR_POSITION[1], z] },
      material: {
        color: light ? MASS_LIGHT_COLOUR : MASS_HEAVY_COLOUR,
        emissive: light ? "#0f4d3c" : "#4d3a0f",
        emissiveIntensity: 0.75,
        roughness: 0.3,
        metalness: 0.25,
      },
      physics: { mode: "dynamic", mass, material: "ball", restitution: 0.6, linearVelocity: velocity },
      // Nudging a probe and watching the field recapture it is the whole point of an
      // inverse-square attractor being an entity. Ordinary `api.interact()`, no host special case.
      interactions: [
        {
          id: `nudge-mass-${index}`,
          label: `Nudge Mass ${mass}`,
          type: "apply-impulse",
          targetIds: [`forces-mass-${index}`],
          impulse: [Math.cos(radians) * 3.2 * mass, 1.4 * mass, Math.sin(radians) * 3.2 * mass],
        },
      ],
      tags: ["archive-playground", "forces-garden", "mass-probe", light ? "mass:light" : "mass:heavy", "interactive"],
    };
  });
}

/**
 * The `forces-garden` study: an inverse-square attractor over an animated flow field.
 *
 * Two force fields, because the archive ran two systems: `attractor.js`'s `G·m/d²` pull on
 * the mass particles, and `flowfield.js`'s steering field the walkers sample. Both graduated
 * into the platform as presets that cite this study by name, so `preset: "gravity-well"` and
 * `preset: "flow-garden"` are the recovered laws, addressed rather than re-typed.
 */
function forcesGarden(): AgentWorldDefinition {
  const TERRAIN_SAMPLES = 33;
  const TERRAIN_SIZE = 24;

  return {
    schema: "graphysx.agent-world/v2",
    id: "archive-forces-garden",
    label: "Forces & Flow Garden — Nature Lab",
    environment: {
      background: "#050f14",
      // The p5 originals draw on a dark canvas with no horizon. `clearnight` is the lowest
      // -contrast recovered sky in the registry, so it gives the scene an image-based light
      // probe (which is what stops the amber attractor reading as a flat disc) without
      // putting a landscape behind a laboratory. Declared as staging, not as the record.
      sky: "clearnight",
      ground: { visible: false, size: TERRAIN_SIZE, color: "#132d31", grid: false, gridColor: "#2a6f6a" },
      // **Faithful, and load-bearing.** The p5 sketches have no gravity: `applyForce` is
      // called with the attractor's pull and nothing else. Zeroing world gravity is what
      // makes the attractor the only force in the scene, which is the entire lesson. With
      // -9.81 in place every probe would simply fall to the floor and the field would be
      // a decoration.
      physics: { gravity: [0, 0, 0] },
      envelope: { fogNear: 44, fogFar: 130, cameraFar: 300 },
    },
    entities: [
      {
        id: "forces-ambient",
        type: "ambient-light",
        label: "Ambient Light",
        intensity: 0.78,
        material: { color: "#8fd8e0" },
        tags: ["archive-playground", "forces-garden", "lighting"],
      },
      {
        id: "forces-key",
        type: "directional-light",
        label: "Key Light",
        intensity: 3.0,
        transform: { position: [-9, 15, 8] },
        material: { color: "#ffe9c9" },
        // Shadows deliberately off. With one key light over a dark floor, six spheres and two
        // particle plumes cast hard black ellipses that read as holes punched in the terrain —
        // the floor is too dark for a shadow to be a gradient rather than a void. Nothing here
        // needs a contact shadow to be legible: the probes are held in the air by a field, not
        // resting on anything, so ground contact is not information this scene has to convey.
        castShadow: false,
        tags: ["archive-playground", "forces-garden", "lighting"],
      },
      {
        id: "forces-ground",
        type: "terrain",
        label: "Displaced Garden Floor",
        // `heights` is authored inline from the archive's own displacement formula, so the
        // relief is the record rather than a heightmap that looks similar. `heightScale`
        // 0.32 with `heightOffset` -0.16 puts the 0..1 field back on its original range.
        terrain: {
          heights: gardenHeights(TERRAIN_SAMPLES, TERRAIN_SIZE),
          size: TERRAIN_SIZE,
          segments: 32,
          heightScale: 0.32,
          heightOffset: -0.16,
          flattenRadius: 0,
          flattenFalloff: 0,
        },
        transform: { position: [0, 0, 0] },
        // Colour, roughness and metalness are the archive's. The small emissive lift is a
        // declared addition: at #132d31 under this rig the floor read as a black void and the
        // relief was invisible, which loses the one part of the floor that is recovered data.
        material: { color: "#132d31", roughness: 0.82, metalness: 0.08, emissive: "#0d2b2e", emissiveIntensity: 0.55 },
        castShadow: false,
        receiveShadow: false,
        tags: ["archive-playground", "forces-garden", "terrain"],
      },
      {
        // `flowfield.js`, as scene vocabulary. A thin slab rather than a tall volume: the
        // archive field is a 2D grid drawn at y = 0.13, and a slab keeps the visualised
        // vectors reading as the carpet they were instead of a cube of arrows.
        id: "forces-flow-field",
        type: "force-field",
        label: "Flow Field",
        transform: { position: [0, 0.45, 0] },
        forceField: {
          preset: "flow-garden",
          size: [FLOW_HALF_X, 0.55, FLOW_HALF_Z],
          visualize: true,
          visualizeResolution: FLOW_VISUALIZE_RESOLUTION,
          affectsParticles: true,
          affectsFlocks: true,
          // The probes orbit above the slab, and a flow field shoving rigid bodies sideways
          // would corrupt the attractor lesson happening over it.
          affectsBodies: false,
        },
        tags: ["archive-playground", "forces-garden", "force-field", "flow"],
      },
      {
        // `attractor.js`, as scene vocabulary. Radius covers the whole probe ring and the
        // emitter plumes; the preset's own `minimumDistance` 1.18 is nature-lab's clamp.
        id: "forces-attractor-field",
        type: "force-field",
        label: "Inverse-Square Attractor",
        transform: { position: ATTRACTOR_POSITION },
        forceField: {
          preset: "gravity-well",
          radius: 11,
          strength: ATTRACTOR_STRENGTH,
          visualize: true,
          visualizeResolution: 7,
          affectsParticles: true,
          // The walkers follow the flow field only, exactly as in the archive: the mass
          // particles were the attractor's population, the vehicles were the field's.
          affectsFlocks: false,
          affectsBodies: true,
        },
        tags: ["archive-playground", "forces-garden", "force-field", "attractor"],
      },
      {
        id: "forces-attractor-core",
        type: "icosahedron",
        label: "Attractor Core",
        geometry: { radius: ATTRACTOR_RADIUS },
        transform: { position: ATTRACTOR_POSITION },
        material: {
          color: "#ffbf69",
          emissive: "#6f2700",
          emissiveIntensity: 1.05,
          roughness: 0.22,
          metalness: 0.28,
        },
        behaviors: [{ id: "attractor-spin", type: "spin", axis: "y", speedDegrees: ATTRACTOR_SPIN_DEG }],
        castShadow: false,
        tags: ["archive-playground", "forces-garden", "attractor"],
      },
      {
        id: "forces-attractor-ring",
        type: "torus",
        label: "Attractor Ring",
        geometry: { radius: ATTRACTOR_RING_RADIUS, tube: ATTRACTOR_RING_TUBE, radialSegments: 48 },
        transform: { position: ATTRACTOR_POSITION },
        material: {
          color: "#ff9857",
          emissive: "#7a2f0d",
          emissiveIntensity: 0.95,
          roughness: 0.35,
          metalness: 0.2,
          opacity: 0.72,
        },
        behaviors: [{ id: "ring-spin", type: "spin", axis: "z", speedDegrees: ATTRACTOR_RING_SPIN_DEG }],
        tags: ["archive-playground", "forces-garden", "attractor"],
      },
      ...massProbes(),
      {
        // The archive's 176-instance mass mist, as the one thing in v2 that can carry
        // hundreds of moving points cheaply. Tinted to the archive's *light mass* cyan, and
        // placed inside both fields so the plume is visibly bent by the flow and drawn in
        // by the attractor rather than rising straight.
        id: "forces-mist-light",
        type: "emitter",
        label: "Light Mass Mist",
        transform: { position: [-5.6, 1.1, 3.2] },
        // The read this took three passes to get right, and the fix was **lifetime**, not
        // speed or size. `energy-orb`'s archive lifetime is 0.5 s: however hard a particle is
        // thrown it dies within half a metre, so the plume is a glowing clump at the nozzle
        // no matter what. At 2.4 s a particle covers roughly ten units, which is long enough
        // to leave the emitter, be bent by the flow slab and then be drawn into the attractor
        // — i.e. long enough for the mist to actually show the fields acting on it, which is
        // the only reason it is in this scene.
        emitter: {
          preset: "energy-orb",
          color: MASS_LIGHT_COLOUR,
          lifetimeSeconds: 2.4,
          sizeScale: 1.5,
          speed: 4.5,
          spread: 1.2,
          direction: [0.4, 1, -0.35],
          maxParticles: 200,
          rate: 90,
        },
        tags: ["archive-playground", "forces-garden", "mist"],
      },
      {
        id: "forces-mist-heavy",
        type: "emitter",
        label: "Heavy Mass Mist",
        transform: { position: [5.6, 1.1, -3.2] },
        emitter: {
          preset: "energy-orb",
          color: MASS_HEAVY_COLOUR,
          lifetimeSeconds: 2.4,
          sizeScale: 1.5,
          speed: 4.5,
          spread: 1.2,
          direction: [-0.4, 1, 0.35],
          maxParticles: 200,
          rate: 90,
        },
        tags: ["archive-playground", "forces-garden", "mist"],
      },
      {
        // The 18 `FlowWalkers`. Modelled as a flock with **alignment and cohesion zeroed**,
        // which is what turns a murmuration back into eighteen independent vehicles: the
        // only thing steering them is the flow field they sit inside, plus enough separation
        // to keep them from stacking. That is `flowfield.js`'s vehicle, not `boid.js`'s boid.
        id: "forces-walkers",
        type: "flock",
        label: "Flow Walkers",
        transform: { position: [0, 0.55, 0] },
        flock: {
          count: WALKER_COUNT,
          bounds: "box",
          size: [FLOW_HALF_X - 0.6, 0.55, FLOW_HALF_Z - 0.6],
          separation: 0.6,
          alignment: 0,
          cohesion: 0,
          separationDistance: 1.1,
          neighborDistance: 2.2,
          speed: 1.6,
          maxForce: 0.5,
          memberSize: WALKER_SIZE,
          color: "#f0fbff",
          emissive: "#116d79",
          emissiveIntensity: 0.85,
          trails: true,
          // The archive keeps 420 samples — "roughly seven seconds of 60 Hz history". The
          // platform caps trails at 48 (the memory is rewritten every step), so the path
          // memory that *was* the experiment is shortened to about eight-tenths of a second.
          trailLength: 48,
          trailColor: WALKER_TRAIL_COLOUR,
          seed: 1000,
        },
        tags: ["archive-playground", "forces-garden", "life", "flock", "walkers"],
      },
    ],
  };
}

// ---------------------------------------------------------------------------------------
// The records
// ---------------------------------------------------------------------------------------

const NATURE_LAB_LOCATION =
  "WindriderQc/SBQC-graphysx-public (the p5/three sketches) — an external GitHub repository present in neither " +
  "GraphysX-Web nor the read-only workshop. No SHA is quoted because none can be recomputed from here. What is " +
  "in-repo is the workshop's 3D transposition, src/nature-lab.ts, which is what this module read.";

export const ARCHIVE_PLAYGROUNDS: readonly ArchivePlayground[] = [
  {
    id: "archive-flock-planet",
    label: "Flock Planet — Nature Lab",
    summary:
      "The recovered spherical murmuration: sixty boids riding the tangent plane of a shell around a layered " +
      "planet, with the archive's atmosphere and its two orbit rings.",
    provenance: {
      study: "Nature Lab — Flock Planet (NATURE_LAB_STUDIES.flock-planet)",
      archiveModeId: "nature-lab",
      sourcePaths: [
        "SBQC/public/js/Boid3D.js",
        "SBQC/public/js/Flock3D.js",
        "SBQC/public/js/threejs_setup.js",
        "SBQC/public/Projects/Nature of Code/flock/boid.js",
        "SBQC/public/Projects/Nature of Code/flock/flock.js",
        "SBQC/public/Projects/Nature of Code/flock/sketch.js",
      ],
      sourceLocation: NATURE_LAB_LOCATION,
      transcribedFrom: [
        "GraphysX-Web/src/nature-lab.ts::buildFlockPlanet",
        "GraphysX-Web/src/nature-lab.ts::updateFlock",
      ],
      graduatedPresets: [
        {
          preset: "orbital-swarm",
          module: "src/agent-world-flock.ts",
          carries:
            "Sphere-tangent bounds, count 60, radius 5.25, speed 1.12, maxForce 0.58, separationDistance 0.78, " +
            "neighborDistance 1.75, memberSize 0.38, colour #d9fbff / emissive #167ca0 — its own provenance " +
            "records these as 'carried over unchanged' from src/nature-lab.ts.",
        },
      ],
      nativeUnits:
        "Three.js world units. Planet radius 4.4, atmosphere 4.54, orbit rings 4.72, flock shell 5.25. Every one " +
        "of those numbers is in the shipped document unchanged; the whole system is then presented through a " +
        "single root group at 1.9x (see the `stage-scale` deviation).",
      conversion:
        "One flock entity addressing the graduated preset, plus four primitives at the archive's own radii, " +
        "colours and rotations, parented to one uniformly scaled group. No geometry is generated by this module.",
    },
    fidelity: {
      faithful: [
        "The flock itself, by preset reference rather than transcription: `orbital-swarm` is nature-lab's sphere-tangent lesson, and the smoke re-derives count/radius/speed/maxForce from the shipped registry rather than from a literal here.",
        "Trail length 45 samples — the archive's own figure, restored over the preset's trimmed 32 (the platform cap is 48, so it fits exactly).",
        "Planet radius 4.4 at 64 radial segments, tint #c9e7ec, roughness 0.76, metalness 0.06.",
        "Atmosphere shell radius 4.54, colour #8ad8ff, opacity 0.12.",
        "Two orbit rings at radius 4.72 in #75e8ff — the first rotated x = pi/2, the second at the archive's verbatim rotation (0.72, 0.25, 0.2) radians.",
        "Planet spin 0.055 rad/s and atmosphere spin 0.082 rad/s, converted to the behaviors' degrees-per-second.",
        "Flock trail colour #56dfff and member colour/emissive #d9fbff / #167ca0.",
      ],
      inferred: [
        "The lighting rig. `buildFlockPlanet` inherits the Nature Lab host's lights and defines none of its own, so the low key light at [16, 7, 13] and the 0.38 ambient are authored here — chosen so the planet carries a terminator instead of reading as a flat disc.",
        "The `earth` texture on the planet surface. The archive generated a 1024x512 canvas map (ocean gradient #0f4e72 -> #12678b -> #092b4d with 42 polygonal continents and latitude lines); canvas textures are not v2 vocabulary, so the registry's recovered `earth` map stands in.",
        "Orbit-ring tube thickness 0.03, up from the archive's 0.018 — see the deviation record.",
        "The 1.9x presentation scale on the root group — see the deviation record. Uniform, so every recovered ratio is preserved exactly.",
        "The viewing envelope (fog 180-400, camera far 900). The archive study defines none; the host default fogs from 34 units, which would smear an 11-unit-wide subject.",
        "The atmosphere's toggle interaction. Authored connective tissue so the shell and rings can be cleared to read the flock's shell radius; nothing in the archive toggled them.",
      ],
      deliberatelyAbsent: [
        "The 900-point `NatureStarfield` — see the deviation record; the `clearnight` skybox stands in.",
        "The three isolation lessons (separation-only, alignment-only, cohesion-only, driven by `effectiveFlockWeights` zeroing the other two). A scene is a scene, not a lesson player; the weights are ordinary editable fields on the flock entity, so the lesson can be performed by hand or by an agent in one `api.update` call.",
        "`addFlockBoids` — the archive grew the population by 12 per click up to a capacity of 216. The platform cap is 240 and the count is an editable field, but `toggle-visibility` and `apply-impulse` are the only interaction types, so no click can change a count. Recorded rather than faked with hidden pre-spawned members.",
        "The per-instance colour jitter (HSL 0.48 + rnd*0.12) and per-instance scale ramp (0.82 + (i%7)*0.035). The flock entity carries one colour for the population; a shipped preset does not expose per-member variation.",
      ],
    },
    deviations: [
      {
        code: "starfield-replaced-by-skybox",
        detail:
          "The archive draws 900 additive `Points` at distance 18-44 in #d9f5ff. v2 has no point-cloud entity; a " +
          "900-member flock would exceed the 240 cap and would simulate steering for something meant to be still. " +
          "A recovered TV3D night skybox stands in, so the stars are at infinity rather than on a finite shell " +
          "and do not parallax as the camera orbits. The set is `clearnight`, **not** `nightsky` — whose " +
          "descriptor recommends it 'when the stars are the subject' and which is nonetheless wrong here, because " +
          "its cube faces carry a horizon silhouette and a near-black down face, so a body at the origin sits " +
          "against dark ground from any downward-looking camera. Caught by looking at a screenshot, not by a test.",
      },
      {
        code: "orbit-ring-thickened",
        detail:
          "Archive tube radius 0.018 with additive blending at opacity 0.28. A v2 standard material has no additive " +
          "blend mode, and a 0.018 tube at radius 4.72 resolves to about one pixel, so the rings vanish. Thickened " +
          "to 0.03 with emissive lift and opacity 0.62 — a legibility change, and the only geometry number in this " +
          "scene that is not the archive's.",
      },
      {
        code: "planet-texture-substituted",
        detail:
          "The archive's planet map is generated at runtime into a 1024x512 canvas: an ocean gradient with 42 " +
          "polygonal continent clusters at hue 92+rnd*34 and latitude lines every 64 px. The registry `earth` " +
          "texture is a different planet. The tint, roughness and metalness applied over it are the archive's.",
      },
      {
        code: "curl-term-not-separable",
        detail:
          "nature-lab adds a hand-written curl term (-n.z, sin(t*0.21+i)*0.15, n.x) at weight 0.12 in the complete " +
          "lesson. The graduated `orbital-swarm` preset folded the sphere constraint in but not that term, so the " +
          "shipped flock circulates from Reynolds steering alone. The `whirlpool` force field is the same idea as " +
          "vocabulary, but it spins about a world axis rather than a shell normal, so adding one would not be the " +
          "same motion and none is added.",
      },
      {
        code: "stage-scale",
        detail:
          "The archive system is 11 world units across and the host's default framing is tuned to the ~36-unit " +
          "showroom, so at 1:1 the planet opens as a coin in an empty frame. Every radius stays the archive's in " +
          "the document; the presentation scale is one uniform 1.9x on a root `group` the five recovered entities " +
          "are parented to. Uniform, so 4.4 : 4.54 : 4.72 : 5.25 is exact by construction, and reversible in one " +
          "edit — selecting `flock-planet-system` and setting its scale to 1 restores the archive's absolute units. " +
          "The same class of decision `composeBallzLevel` makes with `cellSize`.",
      },
      {
        code: "no-physics-in-scene",
        detail:
          "Nothing in this scene is a rigid body. The archive study had no physics either — the flock is a " +
          "hand-integrated steering system — so this is faithful, but it does mean the scene's only simulation is " +
          "the flock. Stated so 'it barely moves' is never a surprise.",
      },
    ],
  },
  {
    id: "archive-forces-garden",
    label: "Forces & Flow Garden — Nature Lab",
    summary:
      "The recovered Nature-of-Code force laboratory: an inverse-square attractor with orbiting mass probes and " +
      "particle mist, over an animated flow field that eighteen walkers steer along.",
    provenance: {
      study: "Nature Lab — Forces & Flow Garden (NATURE_LAB_STUDIES.forces-garden)",
      archiveModeId: "nature-lab",
      sourcePaths: [
        "SBQC/public/Projects/Nature of Code/sAll/flowfield.js",
        "SBQC/public/Projects/Nature of Code/sAll/animal.js",
        "SBQC/public/Projects/Nature of Code/s1/walker.js",
        "SBQC/public/Projects/Nature of Code/s2/particle.js",
        "SBQC/public/Projects/Nature of Code/s2/attractor.js",
      ],
      sourceLocation: NATURE_LAB_LOCATION,
      transcribedFrom: [
        "GraphysX-Web/src/nature-lab.ts::buildForcesGarden",
        "GraphysX-Web/src/nature-lab.ts::flowAngle",
      ],
      graduatedPresets: [
        {
          preset: "gravity-well",
          module: "src/agent-world-force-field.ts",
          carries:
            "attractor.js's G·m/d² with the original's artificial distance clamp; its provenance note " +
            "records minimumDistance 1.18 as nature-lab's squared-distance clamp of 1.4 re-expressed as a distance.",
        },
        {
          preset: "flow-garden",
          module: "src/agent-world-force-field.ts",
          carries:
            "flowfield.js's steering field, using nature-lab's closed-form flowAngle() in place of the p5 baked " +
            "Perlin grid; its provenance note records 'grid extent +/-10 / +/-7 and vector length 0.52 carried over'.",
        },
      ],
      nativeUnits:
        "Three.js world units. Floor 24 x 18, attractor at (0, 2.55, 0) radius 0.92, flow grid x in [-10, 10] and " +
        "z in [-7, 7] at step 1.4. The scene ships at 1:1, with no rescale.",
      conversion:
        "Two force-field entities addressing the graduated presets, a terrain whose inline `heights` are evaluated " +
        "from the archive's own displacement formula, and primitives at the archive's positions, radii and colours.",
    },
    fidelity: {
      faithful: [
        "Both force laws, by preset reference rather than transcription: `gravity-well` is attractor.js and `flow-garden` is flowfield.js, and the smoke re-derives kind/strength/minimumDistance from the shipped registry.",
        "Zero world gravity. The p5 sketches apply the attractor's force and nothing else, so the attractor is the only force acting — this is the lesson, not a convenience.",
        "The floor relief, exactly: `terrain.heights` is evaluated from the archive's own sin(x*0.42)*0.08 + cos(z*0.51)*0.08, with heightScale 0.32 and heightOffset -0.16 restoring its native +/-0.16 range.",
        "Floor material #132d31, roughness 0.82, metalness 0.08.",
        "Attractor at (0, 2.55, 0), radius 0.92, colour #ffbf69, emissive #6f2700 at 1.05, roughness 0.22, metalness 0.28; child ring radius 1.36, tube 0.035, #ff9857 at opacity 0.72.",
        "Attractor spin 0.8 rad/s and ring spin 0.7 rad/s, converted to degrees per second.",
        "The flow field's authored extent: half-extents 10 and 7, matching x in [-10, 10] and z in [-7, 7].",
        "The mass colour rule and the authored mass range: 0.55 to 3.0, cyan below 1.65 and amber above, at the exact HSL(0.45/0.12, 0.82, 0.61) hues resolved to #4aedbc and #edbf4a.",
        "The mass-to-scale rule 0.72 + mass*0.24 (applied to a scaled-up base radius — see the deviation record).",
        "Eighteen walkers at member size 0.52 in #f0fbff / emissive #116d79, with the #ffe47a path memory the archive drew.",
        "Walkers steer by the flow field alone: alignment and cohesion are zeroed, which is what makes them flowfield.js vehicles rather than boid.js boids.",
      ],
      inferred: [
        "The lighting rig and the `clearnight` sky. The study runs on a dark p5-style canvas with neither; the sky is here for its image-based light probe, which is what keeps the amber attractor from reading as a flat disc.",
        "Shadows are off scene-wide, and the floor carries a small emissive lift over its archive colour. Both are legibility fixes found by looking at renders rather than at data — see the deviation records.",
        "The mist emitters' 2.4-second particle lifetime, over `energy-orb`'s archived 0.5 seconds. At the archive lifetime a particle dies before it can be visibly moved by either field, which defeats the only purpose the mist serves here.",
        "The mass probes' circular orbit. The archive particles start at random points in a box with random velocities and bounce off invisible walls; six probes on a 6.2-unit ring with the tangential speed sqrt(a*d) is an authored initial condition, chosen because it makes the mass-independence of the law visible — every probe holds the same orbit whatever it weighs.",
        "The two particle mist emitters and their placement. The archive mist is 176 instanced spheres; an emitter is the only v2 thing that carries hundreds of cheap moving points, and where the plumes are placed is a composition decision.",
        "`apply-impulse` interactions on each probe. Nothing in the archive was clickable; this is authored so a visitor can knock a probe out of orbit and watch the field recapture it.",
        "The flow field as a 0.55-half-height slab at y = 0.45. The archive field is a 2D grid drawn at y = 0.13; a v2 field needs a volume, and a slab is the closest shape to a plane.",
        "visualizeResolution 15. The knob is a sample count, not a step: 15 across the 20-unit span is a 1.428-unit pitch against the archive's 1.4.",
      ],
      deliberatelyAbsent: [
        "The attractor's drift in the combined lesson (x = sin(t*0.31)*1.8, z = cos(t*0.23)*1.25). Two different frequencies trace a Lissajous path; the `orbit` behavior traces a circle, so reproducing it would mean shipping a different motion under the archive's name. The attractor stays at its authored (0, 2.55, 0).",
        "The three isolation lessons (random-walk with two walkers, flow-field with eighteen, attraction alone). As with the flock, every weight involved is an editable field on an ordinary entity.",
        "`addParticles` (12 per click up to 240) and the combined lesson's random impulse. No interaction type can change a count; the impulse is expressible and is used on the probes instead.",
        "The archive's bounce box (+/-10.8, y 0.28-7.3, +/-7.6, restitution -0.86). The probes are real rigid bodies in an open world instead, held by the field rather than by walls.",
        "Per-particle mass on the mist. An emitter's particles are uniform, so the mist carries the archive's two mass *colours* but not its continuous mass distribution; the six rigid probes carry the distribution.",
      ],
    },
    deviations: [
      {
        code: "mass-population-split",
        detail:
          "The archive runs 176 instanced 0.12-radius spheres as a single population. That splits here: an emitter " +
          "pair carries the *mist* (hundreds of cheap points, no rigid bodies), and six rigid probes carry the " +
          "*law* (real masses, real collision, individually inspectable). A 176-body cannon world is over budget, " +
          "and a 0.12-radius rigid body is invisible at any framing that also shows the field.",
      },
      {
        code: "probe-radius-scaled",
        detail:
          "The archive scale rule 0.72 + mass*0.24 is kept, but applied to a base radius of 0.384 rather than the " +
          "archive's 0.12 — a 3.2x enlargement, so probes span 0.327 to 0.553 units instead of 0.102 to 0.173. " +
          "Purely so the probes are visible next to a 0.92-radius attractor.",
      },
      {
        code: "walker-trail-shortened",
        detail:
          "The archive keeps 420 path samples per walker, described in its own comment as 'roughly seven seconds of " +
          "60 Hz history' — the path *is* the experiment, because session 1 never clears its canvas. The platform " +
          "caps flock trails at 48 samples (the buffer is rewritten every step), so the shipped memory is about " +
          "eight-tenths of a second. This is the single largest loss in the scene.",
      },
      {
        code: "shadows-disabled",
        detail:
          "`castShadow` is false on the key light, the attractor and every probe. With one key light over a very " +
          "dark floor, six spheres and two particle plumes cast hard black ellipses that read as holes punched " +
          "through the terrain — a shadow needs a floor bright enough to be a gradient rather than a void. Nothing " +
          "here is resting on the ground (the probes are held in mid-air by the field), so contact shadow is not " +
          "information this scene has to convey.",
      },
      {
        code: "floor-emissive-lift",
        detail:
          "The floor's colour, roughness and metalness are the archive's #132d31 / 0.82 / 0.08. An emissive of " +
          "#0d2b2e at 0.55 is added on top, because at the archive value under this rig the floor rendered as a " +
          "black void and the sine relief — the one genuinely recovered thing about the floor — was invisible.",
      },
      {
        code: "mist-lifetime-extended",
        detail:
          "The `energy-orb` preset's archived lifetime is 0.5 s, so a particle dies within about half a unit " +
          "however hard it is thrown, and the plume stays a clump at the nozzle. The two mist emitters override it " +
          "to 2.4 s. This is a departure from an archive *particle* record in the service of an archive *scene* " +
          "record: the mist exists to show the fields acting on something, and at 0.5 s nothing is acted on.",
      },
      {
        code: "scene-ships-at-one-to-one",
        detail:
          "Unlike the flock planet, this scene carries no presentation scale: the floor is 24 units and the " +
          "attractor sits at its authored y = 2.55. A root-group scale is not available here because the probes " +
          "are rigid bodies and a cannon shape does not inherit a parent's scale, so scaling the group would " +
          "desynchronise the physics from the render. The consequence is honest and visible: at the host's default " +
          "framing the laboratory sits in the middle distance rather than filling the frame.",
      },
      {
        code: "floor-squared",
        detail:
          "The archive floor is a 24 x 18 plane. A `terrain` entity is square, so the shipped floor is 24 x 24. The " +
          "relief formula is evaluated over the larger footprint rather than stretched, so every point that existed " +
          "in the archive floor is at its archive height; the extra six units on each z edge are new ground.",
      },
      {
        code: "flow-vectors-are-the-field",
        detail:
          "In the archive the turquoise arrows are a separate `FlowFieldVectors` LineSegments object drawn from the " +
          "same function the walkers sample — two things that agree by construction. Here they are the force-field " +
          "entity's own visualiser, so they cannot disagree at all. Same picture, stronger guarantee, and the " +
          "arrows are no longer a separate selectable object.",
      },
      {
        code: "walkers-are-a-flock",
        detail:
          "flowfield.js vehicles have no neighbours. A v2 `flock` is the only population primitive, so the walkers " +
          "ship as one with alignment and cohesion set to 0 and a small separation of 0.6 to stop them stacking. " +
          "That residual separation force is not in the archive vehicle.",
      },
      {
        code: "flow-field-ignores-bodies",
        detail:
          "`affectsBodies` is false on the flow field. In the archive's combined lesson the mass particles *did* " +
          "sample the flow at 0.48 strength. Turning it on here lets a ground-level steering field shove the " +
          "orbiting probes sideways, which visibly corrupts the attractor demonstration happening above it. The " +
          "mist still takes the flow, so the coupling is shown, just not on the rigid bodies.",
      },
    ],
  },
];

/**
 * Playground candidates that were examined and **not** turned into a scene.
 *
 * §11: a record that cannot honestly become a scene should say so rather than be forced into
 * one. Exported as data so the reasoning ships with the code instead of living in a commit
 * message — the same shape as `ARCHIVE_BALLZ_NOT_REVIVED`.
 */
export const ARCHIVE_PLAYGROUNDS_NOT_REVIVED = [
  {
    record: "Nature Lab — Living Forest (`nature-lab` study 3)",
    what:
      "Thirteen recursively generated trees at depth 6 (child length x 0.69, 2-3 branches per node) drawn as " +
      "LineSegments, with one instanced DNA leaf per recursion terminal, a 17-second seasonal cycle, and a " +
      "per-tree colour genome that mutates by generation.",
    verdict: "not revivable without inventing the content",
    why:
      "The recursion *is* the study. A depth-6 branching tree is on the order of 200 line segments; expressing " +
      "it in v2 means one entity per branch, so thirteen trees is a few thousand cylinders — over any sane budget " +
      "and unselectable in the editor. The `luminous-tree` prefab is a hand-authored tree, not a recursive one, so " +
      "shipping a grove of them would be a picture of the study with its mechanism deleted. The seasonal cycle and " +
      "the DNA mutation have no vocabulary either: no behavior animates material colour, and there is no genome " +
      "concept. This is the strongest candidate for a future pass, and what it actually needs is an L-system or " +
      "procedural-geometry primitive, which is a platform feature rather than a scene.",
  },
  {
    record: "Nature Lab — Orbital Observatory (`nature-lab` study 4, `orbital-observatory.ts`)",
    what:
      "A day/night Earth with a cloud shell, the ISS on a 51.6-degree inclined trajectory, an observer pass " +
      "window over Quebec City, and 160 real earthquake events decoded in-repo at `src/legacy/sbqc-quakes.json` " +
      "(source `WindriderQc/SBQC/public/data/quakes.csv`, commit 42c210f3).",
    verdict: "partly revivable, deliberately not shipped in this pass",
    why:
      "This is the one skipped record that is not a 'cannot', and its data provenance is the best in the set — the " +
      "quake bytes are in this repository with a source commit. The ISS on its inclined orbit is an ordinary " +
      "`orbit` behavior. What has no expression is everything that makes it an *observatory*: the day/night " +
      "terminator is a custom shader (v2 has one texture slot per material and no night map), the detection-radius " +
      "pass window is a computed overlay with no 2D-in-3D vocabulary, and 160 quake markers would be 160 entities " +
      "carrying data no entity field can hold. Shipping the globe and the ISS without the telemetry would be a " +
      "planet with a moving dot, and the telemetry is the point.",
  },
  {
    record: "Physics Lab (`physics-lab` archive mode)",
    what:
      "A live Newton-style constraint playground: a hinged seesaw, a swinging pendulum chain, a rigid box stack, " +
      "and an auto-resetting wrecking ball. Source: Newton joints (GraphysX_1), Scene3D physics callbacks.",
    verdict: "not revivable — the vocabulary has no joints",
    why:
      "Three of its four exhibits are *constraints*. `AgentWorldPhysics` carries mode, mass, material, friction, " +
      "restitution and initial velocities, and nothing else: there is no hinge, no point-to-point, no distance " +
      "constraint, so a seesaw cannot pivot, a pendulum chain cannot hang and a wrecking ball cannot swing. Only " +
      "the box stack survives, and `physics-sketchbook` already ships a better version of that. Reviving this " +
      "properly means graduating a constraint into the entity model — real platform work, named rather than faked " +
      "with kinematic objects animated along a `bob` behavior, which would be a picture of a pendulum, not one.",
  },
  {
    record: "Three.js Playground (`threejs-playground` archive mode)",
    what:
      "The SBQC browser composition, restored with nine byte-verified assets (3,712,102 bytes, SHA-256 recorded " +
      "per file): an asteroids skybox, an Airplane.glb orbiting at radius 5, three ShaderMaterial morph spheres, " +
      "three radius-5 planet spheres sharing one earth texture, a seeded red procedural terrain, a blue " +
      "three-point line, and a spotlight pulsing 75*sin(pi*f/240)+73.",
    verdict: "partly revivable, rejected for this pass",
    why:
      "The strongest provenance of any candidate — every asset is SHA-verified — and still the wrong pick, because " +
      "its identity is in the parts v2 cannot express. The three morph spheres are a per-object vertex/fragment " +
      "shader (sinusoidal normal displacement plus a rotating dot-product colour); v2 materials are `standard` " +
      "with no custom shader slot, so they would ship as three plain icosahedra and the scene's most distinctive " +
      "element would simply be gone. The asteroids cubemap is not in the sky registry and adding it means editing " +
      "shared vocabulary. `Airplane.glb` is not in the asset catalog and production prunes unregistered models out " +
      "of dist. The spotlight pulse needs an intensity-animating behavior that does not exist. What *would* revive " +
      "cleanly — the terrain, the earth spheres, the spline, the orbit — is the least characteristic half.",
  },
  {
    record:
      "The gallery modes: `object-library-catalog`, `dominus-asset-gallery`, `dominus-port-evidence`, " +
      "`arena-archive`, `maison-explorer`, `common-room-lab`",
    what:
      "Inspection grids of recovered geometry — a 61-entry ObjectLibrary catalog, 65 Dominus source assets, 28 " +
      "port placement rows, the Unity arena mesh and its 1024² atlas, the maison/cuisine compositions, and the " +
      "common-room TVM set.",
    verdict: "not revivable as playgrounds",
    why:
      "Two reasons, and either alone is enough. First, their whole content is *geometry* — hand-modelled meshes " +
      "this vocabulary cannot author and whose files are not in the product asset catalog, so a v2 rebuild would " +
      "be primitives standing in for models, which is theatre. Second, and more decisive, several of these records " +
      "explicitly refuse to infer a composition: the Dominus gallery's own summary is 'without inventing the " +
      "absent village/port composition' and the port evidence identifies itself as 'an editor catalog grid rather " +
      "than an authored village'. Rebuilding them as scenes would invent exactly what they were careful not to. " +
      "The brief also asked for simulation over static galleries, and a gallery is what these are.",
  },
  {
    record: "Input & Device Lab (`input-device-lab`)",
    what:
      "BallZ18 controller diagnostics, GraphysX robot/sonar protocols, AtmelCubx I/O schedules and MeArm controls, " +
      "as one simulation-first device lab.",
    verdict: "not a 3D scene",
    why:
      "Its subject is serial protocols and input state. There is nothing to compose: no world, no geometry, no " +
      "spatial content. It belongs where it is.",
  },
  {
    record: "Voie Lactee / Milky Way Vignette (`milky-way-lab`)",
    what:
      "The archived five-body planetary component — Earth, EarthClouds, Moon, Mars, Venus — with exact per-profile " +
      "positions for both the 2015 and 2017 recoveries, exact radii (6, 6.1, 2, 12, 4), a 23-degree Earth tilt, a " +
      "moon orbiting at radius 8, and two archive bugs preserved as facts.",
    verdict: "revivable, deliberately not shipped in this pass",
    why:
      "Geometrically this is the cleanest fit in the whole census: five spheres at recorded positions with an " +
      "`orbit` behavior on the moon and a `spin` on the Earth would be a near-exact v2 rebuild. Two things held it " +
      "back. It has no simulation at all — the brief asked for simulation over static tableaux, and the 2017 " +
      "profile's own record says `updateRoutinePresent: false`. And four of its five bodies are *defined* by their " +
      "textures (moon.jpg, mars.jpg, venus.jpg, earth-clouds.jpg); the v2 texture registry carries `earth` and " +
      "nothing else, so Mars, Venus, the Moon and the cloud shell would ship as flat coloured balls and the " +
      "scene's entire fidelity claim would evaporate. It becomes an excellent scene the moment those four maps are " +
      "registered as textures — a small, well-defined piece of shared-vocabulary work.",
  },
] as const;

// ---------------------------------------------------------------------------------------
// The two things a caller needs
// ---------------------------------------------------------------------------------------

/**
 * Builds a recovered playground as a plain scene document.
 *
 * Pure data in, pure data out: no `api`, no three.js, no side effects. That is what lets the
 * smoke import this module in Node and push the result into a built page through
 * `window.__GRAPHYSX__.create()` — the shipped definition is verified, not a re-typed copy of it.
 */
export function buildArchivePlayground(id: ArchivePlaygroundId): AgentWorldDefinition {
  if (id === "archive-flock-planet") return flockPlanet();
  if (id === "archive-forces-garden") return forcesGarden();
  throw new Error(`Unknown archive playground: ${String(id)}`);
}

/** Materialises a recovered playground into the live world. One `api.create`, nothing else. */
export function composeArchivePlayground(api: GraphysXAgentWorldApi, id: ArchivePlaygroundId): void {
  api.create(buildArchivePlayground(id));
}

/** Descriptor list for a shelf row, without pulling in the full provenance blocks. */
export function listArchivePlaygrounds(): readonly { id: ArchivePlaygroundId; label: string; summary: string }[] {
  return ARCHIVE_PLAYGROUNDS.map(({ id, label, summary }) => ({ id, label, summary }));
}

/**
 * Browse-shelf rows for both playgrounds, in the exact shape `ComposedSceneEntry` wants.
 *
 * Structurally typed rather than importing `ComposedSceneEntry` from `browse-shelf.ts`, so
 * this module keeps its "no runtime imports, no imports from surfaces" property and the
 * shelf keeps not having to know what a playground is. The lead spreads the result into the
 * `composed` array it already accepts; `onOpen` is the caller's, because only the caller
 * knows whether the showroom needs taking down first.
 */
export function archivePlaygroundBrowseRows(
  api: GraphysXAgentWorldApi,
  onOpen?: (id: ArchivePlaygroundId) => void,
): { id: string; label: string; summary: string; meta: string; open: () => void }[] {
  return ARCHIVE_PLAYGROUNDS.map((record) => {
    const definition = buildArchivePlayground(record.id);
    return {
      id: record.id,
      label: record.label,
      summary: record.summary,
      meta: `${definition.entities.length} entities · recovered · ${record.deviations.length} recorded deviations`,
      open: () => {
        composeArchivePlayground(api, record.id);
        onOpen?.(record.id);
      },
    };
  });
}
