import type {
  AgentWorldDefinition,
  AgentWorldEntityDefinition,
  GraphysXAgentWorldApi,
} from "./agent-world-runtime";
import type { AgentWorldTextureId } from "./agent-world-textures";

/**
 * The recovered **Voie Lactée** planetary study, rebuilt as a platform-native v2 scene.
 *
 * ## What this is, and what it is deliberately not
 *
 * This module contains **no three.js and no runtime imports at all** — only type imports,
 * which erase to nothing. Everything below is plain scene data: one `AgentWorldDefinition`
 * assembled from ordinary v2 vocabulary (`group`, `sphere`, `torus`, lights, `spin` and
 * `orbit` behaviors, registry textures) and handed to `api.create`. From that point there is
 * nothing archive-shaped left: the scene is selectable, editable in the workbench,
 * exportable, and survives export→load like a scene someone composed this afternoon.
 *
 * The legacy module in this repo — `src/milky-way-environment.ts` — is the counter-example
 * and was **consulted, never ported**. It builds `Mesh`, `SphereGeometry`, `MeshPhongMaterial`
 * and a `TextureLoader` directly against the scene graph and runs its own integrator. What
 * crossed over is numbers, not code.
 *
 * ## Why this scene became possible only now
 *
 * The previous archive pass examined this record and rejected it (see
 * `ARCHIVE_PLAYGROUNDS_NOT_REVIVED` in `archive-playgrounds.ts`): *"four of its five bodies
 * are **defined** by their textures … the v2 texture registry carries `earth` and nothing
 * else, so Mars, Venus, the Moon and the cloud shell would ship as flat coloured balls and
 * the scene's entire fidelity claim would evaporate."* `moon`, `mars`, `venus`,
 * `earth-clouds` and `earth-surface` are now registered in `agent-world-textures.ts`,
 * pointing at the same `/assets/archives/milky-way/*.jpg` bytes the legacy module loaded by
 * hand. The blocker is gone, and every body is addressed by registry id rather than by URL.
 *
 * ## An honest classification, kept from the archive
 *
 * The census entry is emphatic and this module keeps it: this is a **five-body planetary
 * vignette, not a star field and not a solar system**. There is no sun in the record, no
 * barycentre, and no heliocentric orbits — the four planets sit at fixed authored positions
 * in a row, and the *only* orbit in twenty years of this material is the Moon's, around the
 * Earth, at radius 8. Giving Mars and Venus orbits would be inventing a system the archive
 * never had. See {@link ARCHIVE_MILKYWAY_NOT_REVIVED} for what that costs and why it was
 * still the right call.
 */

// ---------------------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------------------

/** Where a scene's numbers came from, and where the authoritative bytes actually live. */
export type MilkyWayProvenance = {
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
   * Registered texture ids this scene's fidelity rests on, with the archive filename each
   * one replaces. These are the strongest claims in the module: four of five bodies ARE
   * their maps, so the smoke resolves each id out of the shipped registry and asserts the
   * material actually took it, rather than trusting a hex colour that looks planetary.
   */
  graduatedTextures: readonly { texture: string; archiveFile: string; body: string }[];
  /** Native authored units and extent. */
  nativeUnits: string;
  /** The conversion applied to reach the shipped scene. */
  conversion: string;
};

export type MilkyWayFidelity = {
  /** Carried across exactly, and machine-checked where possible. */
  faithful: readonly string[];
  /** Authored connective tissue — real design decisions made here, not recovered. */
  inferred: readonly string[];
  /** Present in the record, knowingly not reproduced, with the reason. */
  deliberatelyAbsent: readonly string[];
};

export type MilkyWayDeviation = { code: string; detail: string };

export type ArchiveMilkyWayId = "archive-voie-lactee";

export type ArchiveMilkyWayScene = {
  id: ArchiveMilkyWayId;
  label: string;
  summary: string;
  provenance: MilkyWayProvenance;
  fidelity: MilkyWayFidelity;
  deviations: readonly MilkyWayDeviation[];
};

// ---------------------------------------------------------------------------------------
// Recovered constants.
//
// Every number in this block is read out of the archive sources, not chosen. The 2017
// profile (`GraphysX_1/Scene.cpp::CLScene::CreateVoieLactee`, workshop line 760) is the
// authority for positions, radii and the Earth tilt; the 2015 profile
// (`Archive/bckup/VoieLactee.cpp::CLVoieLactee::Update`) is the *only* place motion exists
// at all, because the 2017 rebuild dropped the update routine entirely
// (`updateRoutinePresent: false`). The shipped scene therefore composes the two, which is
// recorded as a deviation rather than smoothed over.
// ---------------------------------------------------------------------------------------

/** `addPrimSphere("earth", { -10, 15, 10 }, 6.0f, "Galaxy\\earthgood.jpg")`. */
const EARTH_POSITION: [number, number, number] = [-10, 15, 10];
const EARTH_RADIUS = 6.0;
/** `->mesh->RotateZ(23)` on the 2017 Earth. Commented out in the 2015 source. */
const EARTH_TILT_DEGREES = 23;

/** `addPrimSphere("clouds", { -10, 15, 10 }, 6.1f, "Galaxy\\EarthClouds.jpg")`. */
const CLOUD_POSITION: [number, number, number] = [-10, 15, 10];
const CLOUD_RADIUS = 6.1;

/** `addPrimSphere("Moon", { -8, 14, 12 }, 2.0f, "Galaxy\\MoonMap.jpg")`. */
const MOON_POSITION: [number, number, number] = [-8, 14, 12];
const MOON_RADIUS = 2.0;

/** `addPrimSphere("Mars", { -40, 15, 10 }, 12.0f, "Galaxy\\MarsMap.jpg")`. */
const MARS_POSITION: [number, number, number] = [-40, 15, 10];
const MARS_RADIUS = 12.0;

/** `addPrimSphere("Venus", { -70, 15, 10 }, 4.0f, "Galaxy\\VenusMap.jpg")`. */
const VENUS_POSITION: [number, number, number] = [-70, 15, 10];
const VENUS_RADIUS = 4.0;

/**
 * `clEarth->Rotate(cTV_3DVECTOR(0, 1, 0), 0.02f)` — degrees per engine update, at 60 Hz.
 * The in-repo legacy module reads it the same way: `0.02 * 60 * delta` degrees per second.
 */
const EARTH_SPIN_DEGREES_PER_SECOND = 0.02 * 60; // 1.2
/** `clEarthClouds->Rotate(cTV_3DVECTOR(0, 1, 0), 0.06f)` — exactly three times the Earth's. */
const CLOUD_SPIN_DEGREES_PER_SECOND = 0.06 * 60; // 3.6

/**
 * `clMoon->RotateAround(-0.003f * clGlobalVar->fTimeElapsed, &clEarth->Mesh->GetPosition(), 8.0f)`.
 *
 * `fTimeElapsed` is milliseconds, so -0.003 deg/ms is **-3 degrees per second** — one lap
 * every 120 seconds, retrograde. The in-repo legacy module agrees: `-0.003 * delta * 1000`.
 */
const MOON_ORBIT_DEGREES_PER_SECOND = -0.003 * 1000; // -3
/** The third argument to `RotateAround`. The one orbital radius in the whole record. */
const MOON_ORBIT_RADIUS = 8.0;

/**
 * The Moon's authored *placement* and its authored *orbit* disagree, and that is a recovered
 * fact rather than a transcription error. `{ -8, 14, 12 }` is 2.83 units from the Earth
 * centre in the XZ plane; `RotateAround` immediately snaps it onto the 8-unit circle on the
 * first update. The shipped scene keeps the authored *bearing* — atan2(dz, dx) with
 * dx = +2, dz = +2 — as the orbit's phase, so the Moon starts in the direction the archive
 * placed it, at the radius the archive orbits it. This is the only reconciliation in the
 * module and it is one line of arithmetic on two recovered numbers.
 */
const MOON_ORBIT_PHASE_DEGREES =
  (Math.atan2(MOON_POSITION[2] - EARTH_POSITION[2], MOON_POSITION[0] - EARTH_POSITION[0]) * 180) / Math.PI; // 45

/**
 * The one number here that is a staging decision rather than a record — and the honest
 * answer to "state the compression factor".
 *
 * **The archive is not at solar-system distances and never was.** Its own extent is 74 units
 * across (Venus's far limb at x = -74, the Moon's far limb at x = 0), with body radii from
 * 2 to 12. So there is no astronomical compression to declare: the *authoring* already did
 * that, twenty years ago, and the ratios below are the ratios the archive shipped.
 *
 * What is applied is a single uniform **presentation scale**, because the host's default
 * framing (camera at [0, 24, 34], target [0, 3, 0], 55° FOV) is tuned to the ~36-unit
 * showroom, and a 74-unit row runs off both edges of it. Every position and radius in the
 * document below stays the archive's verbatim; the whole system hangs off one root group
 * carrying this factor and a recentring translation, exactly as `archive-playgrounds.ts`
 * does with `PLANET_STAGE_SCALE`. Scaling at the root rather than editing the numbers means
 * the recovered ratios 6 : 6.1 : 2 : 12 : 4 and the 8-unit orbit are exact by construction,
 * the numbers a reader sees are the archive's, and the departure is one declared factor in
 * one place. Selecting this group and setting its scale to 1 puts the system back to native.
 */
const STAGE_SCALE = 0.5;

/**
 * The second, and last, staging number — and the one that turned this from a lineup into a
 * scene.
 *
 * The archive row runs along a single axis. Presented square-on it is five discs in a line
 * across the frame, and at any scale that keeps Venus and the Moon both on screen the
 * bodies are small: the editor's outliner and inspector take roughly 570 of 1280 pixels, so
 * the usable viewport is far narrower than the canvas. Yawing the whole system 40 degrees
 * lets the row recede instead of spanning — Earth and its moon come forward, Mars holds the
 * middle, Venus falls away into the starfield — which costs no fidelity at all, because a
 * rigid rotation of the entire system preserves every distance, every radius and every
 * angle between bodies exactly. It lives on the same root group as the scale, so it is one
 * more declared number in one place, and zeroing it restores the archive's own axis.
 */
const STAGE_YAW_DEGREES = -40;

/**
 * The archive row's own centre, in archive coordinates: midway between Venus's far limb and
 * the Moon's far orbital limb in x, at the row's shared y and z. Derived, not chosen.
 */
const ARCHIVE_CENTRE: [number, number, number] = [
  ((VENUS_POSITION[0] - VENUS_RADIUS) + (EARTH_POSITION[0] + MOON_ORBIT_RADIUS + MOON_RADIUS)) / 2, // -37
  EARTH_POSITION[1], // 15
  EARTH_POSITION[2], // 10
];

/** Where that centre is put in world space: the host's default orbit target. */
const STAGE_ORIGIN: [number, number, number] = [0, 3, 0];

/** The archive centre after the stage yaw — the same rotation the group applies to its children. */
const YAWED_CENTRE: [number, number, number] = (() => {
  const radians = (STAGE_YAW_DEGREES * Math.PI) / 180;
  const [x, y, z] = ARCHIVE_CENTRE;
  // three composes a y-Euler as x' = x cos + z sin, z' = -x sin + z cos.
  return [x * Math.cos(radians) + z * Math.sin(radians), y, -x * Math.sin(radians) + z * Math.cos(radians)];
})();

/**
 * The root group's transform, derived so that
 * `STAGE_ORIGIN = position + STAGE_SCALE * Ry(STAGE_YAW_DEGREES) * ARCHIVE_CENTRE`.
 * One formula over recovered numbers, rather than three hand-tuned offsets.
 */
const STAGE_POSITION: [number, number, number] = [
  STAGE_ORIGIN[0] - STAGE_SCALE * YAWED_CENTRE[0],
  STAGE_ORIGIN[1] - STAGE_SCALE * YAWED_CENTRE[1],
  STAGE_ORIGIN[2] - STAGE_SCALE * YAWED_CENTRE[2],
];

/**
 * The recovered numbers, exported so the smoke asserts the *shipped scene* against the
 * record rather than against a second copy of the same literals written into the test.
 */
export const ARCHIVE_MILKYWAY_CONSTANTS = {
  earth: { position: EARTH_POSITION, radius: EARTH_RADIUS, tiltDegrees: EARTH_TILT_DEGREES, spinDegreesPerSecond: EARTH_SPIN_DEGREES_PER_SECOND },
  clouds: { position: CLOUD_POSITION, radius: CLOUD_RADIUS, spinDegreesPerSecond: CLOUD_SPIN_DEGREES_PER_SECOND },
  moon: {
    position: MOON_POSITION,
    radius: MOON_RADIUS,
    orbitRadius: MOON_ORBIT_RADIUS,
    orbitDegreesPerSecond: MOON_ORBIT_DEGREES_PER_SECOND,
    orbitPhaseDegrees: MOON_ORBIT_PHASE_DEGREES,
  },
  mars: { position: MARS_POSITION, radius: MARS_RADIUS },
  venus: { position: VENUS_POSITION, radius: VENUS_RADIUS },
  /** The presentation factor and the transform derived from it. Declared, not hidden. */
  stage: {
    scale: STAGE_SCALE,
    yawDegrees: STAGE_YAW_DEGREES,
    archiveCentre: ARCHIVE_CENTRE,
    /** `ARCHIVE_CENTRE` after the yaw — what the recentring translation is actually derived from. */
    yawedCentre: YAWED_CENTRE,
    origin: STAGE_ORIGIN,
    position: STAGE_POSITION,
  },
  /** Archive extent in native units — the reason a presentation scale exists at all. */
  archiveExtentUnits: (EARTH_POSITION[0] + MOON_ORBIT_RADIUS + MOON_RADIUS) - (VENUS_POSITION[0] - VENUS_RADIUS), // 74
  /** Body radii in authoring order, so the smoke can check the ratios survived the stage. */
  radiiInOrder: [EARTH_RADIUS, CLOUD_RADIUS, MOON_RADIUS, MARS_RADIUS, VENUS_RADIUS],
} as const;

// ---------------------------------------------------------------------------------------
// The scene
// ---------------------------------------------------------------------------------------

/** Shared material for the two faint guide rings. Emissive because nothing lights a hairline. */
const GUIDE_RING_MATERIAL = {
  color: "#2c5f7a",
  emissive: "#3f9fc4",
  emissiveIntensity: 1.4,
  roughness: 0.5,
  metalness: 0.1,
  opacity: 0.55,
};

/**
 * A planetary body, as a `sphere` with a registry texture on it.
 *
 * Every body in this scene is the same construction, so it is one function rather than five
 * near-identical literals: position and radius come straight from the constants block, the
 * texture is addressed by registry id, and the spin rate is passed in by the caller so the
 * faithful rates and the inferred ones are visibly different at the call site.
 */
function body(options: {
  id: string;
  label: string;
  parentId: string;
  position: [number, number, number];
  radius: number;
  // Typed against the registry rather than as a string: an unregistered id is a build
  // error here, not a body that silently ships as a white ball.
  texture: AgentWorldTextureId;
  /** Slight self-lift so the night side is a silhouette rather than a hole. */
  emissive: string;
  spinDegreesPerSecond: number;
  tags: readonly string[];
}): AgentWorldEntityDefinition {
  return {
    id: options.id,
    parentId: options.parentId,
    type: "sphere",
    label: options.label,
    // 64 segments: a 12-unit Mars at 0.68 stage scale fills a good part of the frame, and
    // a 24-segment default sphere shows its silhouette facets at that size.
    geometry: { radius: options.radius, radialSegments: 64 },
    transform: { position: options.position },
    material: {
      // White base so the recovered map is the colour. A tint here would be this module
      // deciding what Mars looks like, when the archive already decided by shipping a map.
      color: "#ffffff",
      emissive: options.emissive,
      emissiveIntensity: 0.32,
      roughness: 0.94,
      metalness: 0.0,
      texture: { id: options.texture },
    },
    behaviors: [{ id: `${options.id}-spin`, type: "spin", axis: "y", speedDegrees: options.spinDegreesPerSecond }],
    tags: [...options.tags],
  };
}

/**
 * The Voie Lactée vignette: five recovered bodies, one recovered orbit, one recovered tilt.
 */
function voieLactee(): AgentWorldDefinition {
  return {
    schema: "graphysx.agent-world/v2",
    id: "archive-voie-lactee",
    label: "Voie Lactée — Archive Planetary Vignette",
    environment: {
      background: "#01030a",
      // `clearnight` is stars on all six cube faces. `nightsky` is the higher-resolution set
      // and its own descriptor recommends it "when the stars are the subject" — and it is
      // the wrong pick here for a reason only a screenshot finds: its faces carry a horizon
      // silhouette and a near-black down face, so bodies floating at the origin sit against
      // dark ground from any camera that looks even slightly downward. The host's default
      // camera looks down from y = 24, so this scene is exactly the failure case.
      sky: "clearnight",
      // Nothing here is standing on anything. A ground plane under a planet is a floor in
      // space, and the grid would draw a wireframe through Mars.
      ground: { visible: false, size: 40, color: "#050a14", grid: false, gridColor: "#132538" },
      // The staged row is ~50 units across and the far bodies sit ~45 units from the camera.
      // The host default fogs from 34 and clips at 260, which would smear Venus into the
      // fog colour and grey out the starfield. Pushed well past the system.
      envelope: { fogNear: 260, fogFar: 700, cameraFar: 1400 },
    },
    entities: [
      {
        // Deliberately low. In space the night side of a body is genuinely black; a strong
        // ambient flattens every sphere into a disc and destroys the terminator, which is
        // the only thing that says "sphere" rather than "textured circle".
        id: "voie-lactee-ambient",
        type: "ambient-light",
        label: "Ambient Light",
        intensity: 0.16,
        material: { color: "#5f7aa8" },
        tags: ["archive-milkyway", "voie-lactee", "lighting"],
      },
      {
        // The star this system does not have. A directional light is the honest form of it:
        // it lights every body from the same direction across a 50-unit row, which is what
        // makes the five terminators line up and read as one system, without adding a sixth
        // body the archive never authored.
        id: "voie-lactee-sun",
        type: "directional-light",
        label: "Key Light",
        intensity: 3.6,
        transform: { position: [80, 26, 48] },
        material: { color: "#fff4e2" },
        // Off deliberately — see the `shadows-disabled` deviation.
        castShadow: false,
        tags: ["archive-milkyway", "voie-lactee", "lighting"],
      },
      {
        // A cold fill from the opposite side at a tenth of the key. Not physical, and said
        // so in the record: it keeps the night sides as dark blue silhouettes against the
        // starfield rather than as holes with no edge at all.
        id: "voie-lactee-fill",
        type: "directional-light",
        label: "Fill Light",
        intensity: 0.36,
        transform: { position: [-70, -8, -40] },
        material: { color: "#4d6ea8" },
        castShadow: false,
        tags: ["archive-milkyway", "voie-lactee", "lighting"],
      },
      {
        // The staging root. Every body below carries its archive position and radius
        // verbatim, so the ratios are exact by construction and the presentation factor is
        // one declared number in one place. Set this group's scale to 1 to see the system
        // at the size the archive authored it.
        id: "voie-lactee-system",
        type: "group",
        label: "Voie Lactée System",
        transform: {
          position: STAGE_POSITION,
          rotationDegrees: [0, STAGE_YAW_DEGREES, 0],
          scale: [STAGE_SCALE, STAGE_SCALE, STAGE_SCALE],
        },
        tags: ["archive-milkyway", "voie-lactee", "stage"],
      },
      {
        // The 23-degree tilt as a *parent* rather than as rotation on the sphere.
        //
        // This is a real structural decision. The runtime resets an entity's rotation to its
        // authored Euler every frame and then adds the spin onto one axis, so a sphere with
        // rotationDegrees [0,0,23] and a y-spin composes as Rx·Ry·Rz — the tilt applied
        // *inside* the spin, which precesses the pole around a cone instead of spinning
        // about it. Hanging the sphere off a tilted group makes its local y axis the tilted
        // axis, which is what an axial tilt is. The recovered number is untouched; only
        // where it lives changed.
        id: "voie-lactee-earth-axis",
        parentId: "voie-lactee-system",
        type: "group",
        label: "Earth Axis (23° tilt)",
        transform: { position: EARTH_POSITION, rotationDegrees: [0, 0, EARTH_TILT_DEGREES] },
        tags: ["archive-milkyway", "voie-lactee", "earth"],
      },
      body({
        id: "voie-lactee-earth",
        label: "Earth",
        parentId: "voie-lactee-earth-axis",
        // Zero, because the axis group is already at the archive position.
        position: [0, 0, 0],
        radius: EARTH_RADIUS,
        texture: "earth-surface",
        emissive: "#0a1c33",
        spinDegreesPerSecond: EARTH_SPIN_DEGREES_PER_SECOND,
        tags: ["archive-milkyway", "voie-lactee", "body", "earth"],
      }),
      {
        // The cloud shell: a separate translucent sphere 0.1 units outside the surface, which
        // is what the archive's two Earth maps are for and what its 6.0 / 6.1 pair encodes.
        // Three times the surface's spin rate, verbatim from the 2015 update routine.
        id: "voie-lactee-clouds",
        parentId: "voie-lactee-earth-axis",
        type: "sphere",
        label: "Earth Clouds",
        geometry: { radius: CLOUD_RADIUS, radialSegments: 64 },
        transform: { position: [0, 0, 0] },
        material: {
          color: "#ffffff",
          emissive: "#0d1d2e",
          emissiveIntensity: 0.2,
          roughness: 1,
          metalness: 0,
          // See the `cloud-shell-has-no-alpha` deviation: the recovered map is a JPEG of
          // white cloud on black with no alpha channel, and v2 has no additive blend, so the
          // shell is a uniform-opacity overlay. Kept low so the surface map still reads.
          opacity: 0.34,
          texture: { id: "earth-clouds" },
        },
        behaviors: [{ id: "clouds-spin", type: "spin", axis: "y", speedDegrees: CLOUD_SPIN_DEGREES_PER_SECOND }],
        // Nothing in the archive was clickable. This is authored, and it earns its place:
        // the two Earth maps are the whole reason the surface/shell split exists, and being
        // able to take the shell off is how a visitor sees that there are two of them.
        interactions: [
          {
            id: "toggle-clouds",
            label: "Toggle the cloud shell",
            type: "toggle-visibility",
            targetIds: ["voie-lactee-clouds"],
          },
        ],
        tags: ["archive-milkyway", "voie-lactee", "body", "earth", "interactive"],
      },
      {
        // The one orbit in the record, as one `orbit` behavior.
        //
        // The runtime's y-axis orbit computes
        //   x = center[0] + cos(t*speed + phase) * radius
        //   y = basePosition[1] + center[1]
        //   z = center[2] + sin(t*speed + phase) * radius
        // which is character-for-character the archive's RotateAround around the Earth's
        // position at radius 8, with the Moon's authored y = 14 preserved by `basePosition`.
        // `center` is in the parent group's space, so it is the Earth's archive position
        // with y zeroed — not a re-derived world coordinate.
        ...body({
          id: "voie-lactee-moon",
          label: "Moon",
          parentId: "voie-lactee-system",
          position: MOON_POSITION,
          radius: MOON_RADIUS,
          texture: "moon",
          emissive: "#14161c",
          // Inferred, but derived rather than invented: equal to the orbit rate, which is
          // what tidal locking is and what keeps one face toward the Earth.
          spinDegreesPerSecond: MOON_ORBIT_DEGREES_PER_SECOND,
          tags: ["archive-milkyway", "voie-lactee", "body", "moon"],
        }),
        behaviors: [
          { id: "moon-spin", type: "spin", axis: "y", speedDegrees: MOON_ORBIT_DEGREES_PER_SECOND },
          {
            id: "moon-orbit",
            type: "orbit",
            axis: "y",
            center: [EARTH_POSITION[0], 0, EARTH_POSITION[2]],
            radius: MOON_ORBIT_RADIUS,
            speedDegrees: MOON_ORBIT_DEGREES_PER_SECOND,
            phaseDegrees: MOON_ORBIT_PHASE_DEGREES,
          },
        ],
      },
      {
        // The Moon's path, drawn at the radius the record gives. Authored, and declared —
        // but it visualises a recovered number rather than inventing one, and it is what
        // makes the scene legible as a system in a still frame rather than only in motion.
        id: "voie-lactee-moon-orbit-ring",
        parentId: "voie-lactee-system",
        type: "torus",
        label: "Moon Orbit (r = 8)",
        geometry: { radius: MOON_ORBIT_RADIUS, tube: 0.045, radialSegments: 96 },
        // At the Moon's own authored y, which is one unit below the Earth's centre — so the
        // ring sits where the Moon actually travels, not on the Earth's equator.
        transform: { position: [EARTH_POSITION[0], MOON_POSITION[1], EARTH_POSITION[2]], rotationDegrees: [90, 0, 0] },
        material: GUIDE_RING_MATERIAL,
        interactions: [
          {
            id: "toggle-guides",
            label: "Toggle the orbit guide",
            type: "toggle-visibility",
            targetIds: ["voie-lactee-moon-orbit-ring"],
          },
        ],
        tags: ["archive-milkyway", "voie-lactee", "guide", "interactive"],
      },
      body({
        id: "voie-lactee-mars",
        label: "Mars",
        parentId: "voie-lactee-system",
        position: MARS_POSITION,
        radius: MARS_RADIUS,
        texture: "mars",
        emissive: "#2a1208",
        // Inferred. The record gives no rotation for Mars or Venus at all — the 2015 update
        // routine touches only the Earth, the clouds and the Moon. Rather than invent a
        // rate, both take the Earth's recovered 1.2 deg/s, which is the only axial rate the
        // archive ever wrote down. Recorded as an inference, not as fidelity.
        spinDegreesPerSecond: EARTH_SPIN_DEGREES_PER_SECOND,
        tags: ["archive-milkyway", "voie-lactee", "body", "mars"],
      }),
      body({
        id: "voie-lactee-venus",
        label: "Venus",
        parentId: "voie-lactee-system",
        position: VENUS_POSITION,
        radius: VENUS_RADIUS,
        texture: "venus",
        emissive: "#2b2413",
        spinDegreesPerSecond: EARTH_SPIN_DEGREES_PER_SECOND,
        tags: ["archive-milkyway", "voie-lactee", "body", "venus"],
      }),
    ],
  };
}

// ---------------------------------------------------------------------------------------
// The provenance record
// ---------------------------------------------------------------------------------------

export const ARCHIVE_MILKYWAY_SCENES: readonly ArchiveMilkyWayScene[] = [
  {
    id: "archive-voie-lactee",
    label: "Voie Lactée — Archive Planetary Vignette",
    summary:
      "The recovered five-body GraphysX planetary study — Earth under a separate cloud shell, the Moon on its " +
      "8-unit retrograde orbit, Mars and Venus — at the archive's own radii and positions, with its own surface " +
      "maps, under a full-sphere starfield.",
    provenance: {
      study: "Voie Lactée / Milky Way",
      archiveModeId: "milky-way-lab",
      sourcePaths: [
        "GraphysX_1/Scene.cpp::CLScene::CreateVoieLactee (line 760) — positions, radii, textures, the 23° Earth tilt",
        "Archive/bckup/VoieLactee.cpp::CLVoieLactee::Update — the only motion in the record",
        "Archive/bckup/VoieLactee.h — the five-body member list",
        "Archive/bckup/BallZ2015.bckup/VoieLactee.cpp — the 2015 duplicate, byte-comparable",
        "Scene3D/GamePlayScreen.cpp:390, Scene3D/EditorScreen.cpp:176 — the two call sites",
      ],
      sourceLocation:
        "The workshop repository at C:/Users/Yanik/codes/GraphysX, read-only. No SHA is recorded for these files " +
        "in either ARCHIVE_SCENE_CENSUS.md or RECUPERATION_LEDGER.md; the census carries the classification, not " +
        "the bytes. Stated rather than implied, because every other claim here is stronger than this one.",
      transcribedFrom: [
        "src/milky-way-environment.ts — the in-repo legacy decode, whose MILKY_WAY_EVIDENCE block agrees with the workshop sources line for line",
        "src/archive-content.ts — the `milky-way-lab` census entry that corrects the classification",
      ],
      graduatedTextures: [
        { texture: "earth-surface", archiveFile: "Galaxy/earthgood.jpg", body: "Earth" },
        { texture: "earth-clouds", archiveFile: "Galaxy/EarthClouds.jpg", body: "Earth cloud shell" },
        { texture: "moon", archiveFile: "Galaxy/MoonMap.jpg", body: "Moon" },
        { texture: "mars", archiveFile: "Galaxy/MarsMap.jpg", body: "Mars" },
        { texture: "venus", archiveFile: "Galaxy/VenusMap.jpg", body: "Venus" },
      ],
      nativeUnits:
        "TV3D world units. The system is 74 units across (Venus's far limb at x = -74, the Moon's far orbital " +
        "limb at x = 0) with body radii from 2 to 12, all at y = 15 and z = 10.",
      conversion:
        "None to the numbers. Every position, radius, tilt and rate below is the archive's verbatim. A single " +
        "uniform presentation scale of 0.68 and a recentring translation live on one root group, derived from " +
        "the archive's own centre — see the `presentation-scale` deviation.",
    },
    fidelity: {
      faithful: [
        "All five bodies, at their exact 2017 positions: Earth (-10, 15, 10), clouds (-10, 15, 10), Moon (-8, 14, 12), Mars (-40, 15, 10), Venus (-70, 15, 10).",
        "All five radii verbatim — 6.0, 6.1, 2.0, 12.0, 4.0 — including Mars being twice the Earth's size, which is astronomically wrong and is what the archive authored.",
        "The 0.1-unit gap between the Earth surface at 6.0 and its cloud shell at 6.1: the shell is a separate sphere, which is what the study's two Earth maps exist for.",
        "The 23-degree Earth tilt from the 2017 rebuild (`->mesh->RotateZ(23)`), which the 2015 source had commented out.",
        "The Earth's 0.02 deg/update spin and the clouds' 0.06 — 1.2 and 3.6 deg/s at 60 Hz, an exact 1:3 ratio.",
        "The Moon's orbit: radius 8.0, retrograde at -3 deg/s (`-0.003f * fTimeElapsed`, milliseconds), around the Earth's position, holding the Moon's authored y = 14 one unit below the Earth's centre.",
        "Every body addressed by its recovered map: earth-surface, earth-clouds, moon, mars and venus resolve to the same /assets/archives/milky-way/*.jpg bytes the legacy module loaded by hand.",
        "The classification. This ships as a five-body vignette, not as a star field and not as a solar system — the correction the census entry was written to make.",
      ],
      inferred: [
        "The presentation scale of 0.50, the 40-degree stage yaw and the recentring translation. The archive's 74-unit row does not fit the host's default framing; all three live on one root group, derived from the archive's own centre, so every number in the document stays native and the ratios are exact by construction. This is the compression factor, and it is a *framing* factor — the archive was never at astronomical distances.",
        "The entire lighting rig. The record has no Voie Lactée camera, sky, or light: `renderingUnknowns` says so explicitly. One key directional light standing in for the absent star, a 0.16 ambient, and a 0.36 cold fill from the opposite side so night sides read as silhouettes rather than as holes.",
        "The `clearnight` sky. There is no recovered sky for this scene; it is here because a body needs stars behind it on all six faces, and because it gives the scene an image-based light probe.",
        "Mars's and Venus's spin. The record gives them no rotation at all — the 2015 update routine touches only the Earth, the clouds and the Moon. Rather than invent a rate, both take the Earth's recovered 1.2 deg/s, which is the only axial rate the archive ever wrote down.",
        "The Moon's spin, at exactly its orbit rate. Derived rather than chosen: equal rates is what tidal locking is, and it keeps one face toward the Earth the way the real Moon does.",
        "The Moon's orbital phase of 45 degrees. Two recovered numbers disagree — the authored placement is 2.83 units from the Earth, the authored orbit is 8 — so the shipped scene keeps the authored *bearing* and the authored *radius*. One line of arithmetic, no invented value.",
        "The 23-degree tilt as a parent group rather than as rotation on the Earth sphere. Structural, not numeric: the runtime composes a base Euler with an added y-spin as Rx·Ry·Rz, which precesses a z-tilted pole instead of spinning about it. A tilted parent makes the sphere's local y the tilted axis, which is what an axial tilt is.",
        "The faint Moon orbit ring. Authored, but it draws the record's own radius 8 rather than inventing a path, and it is what makes the scene read as a system in a still frame.",
        "The `toggle-clouds` and `toggle-guides` interactions. Nothing in the archive was clickable; taking the shell off is how a visitor sees that Earth is two spheres and two maps.",
        "Every material property except the maps: emissive lift, roughness 0.94, metalness 0. The archive used TV3D materials with no v2 equivalent.",
      ],
      deliberatelyAbsent: [
        "Heliocentric orbits for Mars and Venus. There is no sun in the record, no barycentre, and no orbital element for anything but the Moon — the four planets sit at fixed authored positions in a row. Putting Mars and Venus on orbits would ship a solar system under the archive's name when the archive's own census entry exists to say this is not one. This is the single largest gap between what was asked for and what shipped, and it is deliberate.",
        "A sun body. Same reason: the study has five objects and none of them is a star. The key light is the honest form of an absent star; an emissive sphere would be a sixth body nobody authored.",
        "`EarthNight.jpg`. The 2015 constructor loads it into `iEarthNightTex` and never binds it to anything — the record's own `earthNightTextureLoadedButUnused: true`. A v2 material has one texture slot and no day/night terminator shader, so there is nowhere to put it even if the archive had used it.",
        "The 2015 profile's positions (Earth/clouds at z = 0, Moon at (-8, 14, -10), Mars at -25, Venus at -35). Both profiles are in the record; shipping both would be two near-identical scenes, and the 2017 profile is the one whose asset binding the record calls exact (`graphysx2017AllExact: true`). The 2015 numbers stay in the record, unshipped.",
        "`cTV_BLEND_COLOR` and `SetAlphaTest(true, 255)` on the cloud shell. The record's own `renderingUnknowns` says TV3D's blend modes have no exact three.js binding, and v2 materials expose opacity and nothing else.",
        "The archive's Venus pointer bug (`clMars = ...back()` executed twice, so `clVenus` is never assigned). It is a fact about the source, preserved here as a record; reproducing a null pointer is not a scene feature.",
        "Newton physics bodies. Every `CL3DObject` here was constructed with a `NewtonWorld*`, but nothing in the update routine reads a body — the motion is direct transform assignment. Giving these spheres rigid bodies would add simulation the archive did not run.",
      ],
    },
    deviations: [
      {
        code: "presentation-scale",
        detail:
          "The system ships at 0.50x native, with a recentring translation, both on the single root group " +
          "`voie-lactee-system`. The archive row is 74 units across against a host default framing tuned to a " +
          "36-unit showroom, so at 1:1 Venus and the Moon leave opposite edges of the frame. Every position and " +
          "radius in the document is the archive's verbatim and the ratios 6 : 6.1 : 2 : 12 : 4 and the 8-unit " +
          "orbit are exact by construction; setting this one group's scale to 1 restores native size. Note what " +
          "this factor is NOT: it is not an astronomical compression. The archive itself is a 74-unit vignette " +
          "with Mars twice the size of Earth — real solar-system distances never appear in this record, so there " +
          "is no astronomical ratio to preserve or to compress.",
      },
      {
        code: "presentation-rotation",
        detail:
          "The system is yawed 40 degrees about y on the same root group. The archive row runs along a single " +
          "axis, and presented square-on it is five discs in a line across the frame — at any scale that keeps " +
          "Venus and the Moon both on screen the bodies are small, because the editor's outliner and inspector " +
          "take roughly 570 of 1280 pixels and the usable viewport is far narrower than the canvas. Yawed, the " +
          "row recedes rather than spans: Earth and its moon come forward, Mars holds the middle, Venus falls " +
          "away into the starfield. This costs no fidelity whatsoever — a rigid rotation of the whole system " +
          "preserves every distance, radius and inter-body angle exactly — but it is a composition decision the " +
          "archive did not make, so it is declared rather than absorbed into the scale. Zero it to restore the " +
          "archive's own axis. Found by looking at a render, not at an assertion: the first pass shipped the " +
          "row square-on and every green check still passed with Earth hidden behind the inspector panel.",
      },
      {
        code: "cross-profile-composition",
        detail:
          "Positions, radii and the 23-degree tilt are the 2017 profile " +
          "(`GraphysX_1/Scene.cpp::CreateVoieLactee`); the spin and orbit rates are the 2015 profile " +
          "(`Archive/bckup/VoieLactee.cpp::Update`). This is a composition of two recoveries, and it is " +
          "unavoidable: the 2017 rebuild dropped the update routine entirely (`updateRoutinePresent: false`), so " +
          "a scene that is both exactly-2017 and alive does not exist in the archive. The alternative was a " +
          "motionless diorama or the 2015 profile's less-exact asset binding.",
      },
      {
        code: "moon-placement-reconciled",
        detail:
          "The Moon's authored position (-8, 14, 12) is 2.83 units from the Earth centre in XZ; its authored " +
          "orbit radius is 8. The archive resolved this at runtime — `RotateAround` snaps the Moon onto the " +
          "8-unit circle on the first update — so the authored placement is only ever seen for one frame. The " +
          "shipped scene keeps the authored bearing (45 degrees, from atan2 of the recovered offsets) as the " +
          "orbit phase, so the Moon starts in the archive's direction at the archive's radius. The authored " +
          "position is still in the document as the entity's base transform, which is what supplies the " +
          "orbit's y = 14.",
      },
      {
        code: "cloud-shell-has-no-alpha",
        detail:
          "The 2015 source loads `EarthCloudsMapHigh.png` with `cTV_COLORKEY_USE_ALPHA_CHANNEL` and alpha-tests " +
          "it; the recovered and registered asset is `earth-clouds.jpg` — white cloud on black, 8192x4096, no " +
          "alpha channel. v2 materials expose opacity and no blend mode, so the shell is a uniform-opacity " +
          "overlay: the black inter-cloud regions do not vanish, they darken the surface beneath them. Opacity " +
          "is held at 0.34, which is the point found by looking at renders where the clouds are legible and the " +
          "recovered surface map still reads through. This is the largest visual loss in the scene, and it is a " +
          "missing alpha channel, not a rebuild decision.",
      },
      {
        code: "shadows-disabled",
        detail:
          "`castShadow` is false on both lights and on every body. There is no ground plane, so the only shadow " +
          "available is body-on-body, and the two candidates are 20 and 30 units apart along the light " +
          "direction. The runtime pins a directional light's shadow camera to a +/-38 orthographic box, which " +
          "over a 50-unit staged row resolves to a few centimetres per texel — the condition that produced hard " +
          "black ellipses reading as holes in the previous archive pass. A sphere in space gets its form from " +
          "its terminator, which is lighting, not shadow mapping.",
      },
      {
        code: "no-orbits-for-mars-and-venus",
        detail:
          "Mars and Venus do not orbit anything, because in the record they do not. This is recorded as a " +
          "deviation from the *brief* rather than from the archive: a solar-system scene wants planets going " +
          "round something, and the honest answer is that this study is a row of bodies with one moon orbiting " +
          "one planet. Both planets spin, and the Moon orbits, so the scene is alive; nothing revolves around " +
          "an invented centre.",
      },
      {
        code: "axial-tilt-moved-to-a-parent",
        detail:
          "The recovered 23 degrees sits on a `group` that the Earth and its cloud shell hang off, rather than " +
          "on the Earth sphere itself. The runtime resets each entity's rotation to its authored Euler every " +
          "frame and adds the spin to one axis, composing Rx*Ry*Rz — so a z-tilt plus a y-spin precesses the " +
          "pole around a cone instead of rotating about it. The number is untouched; only its owner changed. " +
          "The visible consequence is that the cloud shell inherits the same tilt, which is correct and is not " +
          "something the archive expressed either way.",
      },
      {
        code: "sphere-segments-raised",
        detail:
          "Every body is a 64-segment sphere against the runtime's 24-segment default. Mars is 12 archive units " +
          "across and fills a large part of the frame at the staged scale, where a 24-segment silhouette is " +
          "visibly faceted. The archive's TV3D primitive tessellation is not recorded, so this is a free choice " +
          "rather than a departure from a known value.",
      },
      {
        code: "guide-ring-is-authored",
        detail:
          "The faint ring at radius 8 is not in the archive — nothing in the record draws the Moon's path. It " +
          "is here because the scene's one piece of real motion takes two minutes to complete a lap, so a still " +
          "frame otherwise shows five unrelated spheres. It draws a recovered number and is switchable off " +
          "through `toggle-guides`, so it can be removed without touching the record.",
      },
    ],
  },
];

/**
 * Milky-Way candidates that were examined and **not** turned into a scene.
 *
 * §11: a record that cannot honestly become a scene should say so rather than be forced into
 * one. Exported as data so the reasoning ships with the code instead of living in a commit
 * message — the same shape as `ARCHIVE_PLAYGROUNDS_NOT_REVIVED`.
 */
export const ARCHIVE_MILKYWAY_NOT_REVIVED = [
  {
    record: "The 2015 BallZ profile (`Archive/bckup/VoieLactee.cpp`, `BallZ2015.bckup/VoieLactee.cpp`)",
    what:
      "The same five bodies at a different layout — Earth and clouds at (-10, 15, 0), the Moon at (-8, 14, -10), " +
      "Mars at -25, Venus at -35 — with the Earth tilt commented out, plus the update routine that is the only " +
      "source of motion anywhere in the record.",
    verdict: "revivable, deliberately not shipped as a second scene",
    why:
      "It would be the same nine spheres, the same five maps and the same one orbit at slightly different x " +
      "coordinates: a second thin scene rather than one good one. The 2017 profile wins on asset binding — the " +
      "record's own `graphysx2017AllExact: true` against `ballz2015MissingExactCloudAlphaMap` and " +
      "`ballz2015EarthCandidateOnly` — so it is the profile whose textures are the recovered ones. The 2015 " +
      "positions are preserved in `ARCHIVE_MILKYWAY_SCENES[0].fidelity.deliberatelyAbsent` and in " +
      "`src/milky-way-environment.ts`'s evidence block, and its motion rates are what the shipped scene runs on.",
  },
  {
    record: "A day/night Earth using `EarthNight.jpg`",
    what:
      "The 2015 constructor loads a night-lights Earth map into `iEarthNightTex` and never binds it, recorded " +
      "as `earthNightTextureLoadedButUnused: true`.",
    verdict: "not revivable — the vocabulary has one texture slot",
    why:
      "A day/night Earth is a terminator-blended two-map shader. `AgentWorldMaterial` carries exactly one " +
      "texture and there is no custom shader slot, so the second map has nowhere to go. This is the same wall " +
      "`orbital-observatory` hit, and it needs the same platform work: a second texture channel plus a blend " +
      "term. The map is also not registered, so it would be pruned out of `dist/` even if it could be used.",
  },
  {
    record: "An authored Voie Lactée camera, sky, or host scene",
    what:
      "`CreateVoieLactee` is called from `GamePlayScreen.cpp:390` and `EditorScreen.cpp:176` — the vignette is " +
      "a sub-scene dropped into whatever scene is already active. No standalone composition survives.",
    verdict: "does not exist to revive",
    why:
      "The record says so directly: `renderingUnknowns` lists 'No Voie Lactee-specific camera, sky, lighting " +
      "rig, or standalone menu is defined.' Every framing and lighting decision in the shipped scene is " +
      "therefore labelled inferred rather than dressed up as recovery. What the archive actually authored is " +
      "five bodies, five maps, one tilt, two spins and one orbit — and all of that ships.",
  },
  {
    record: "The Newton rigid bodies the archive constructed",
    what:
      "Every `CL3DObject` in `VoieLactee.cpp` is built with a `NewtonWorld*` argument, so each body was " +
      "registered with the physics world.",
    verdict: "not revivable as simulation — nothing ever read them",
    why:
      "`Update()` assigns transforms directly: `Rotate`, `Rotate`, `RotateAround`. No force, no integration, no " +
      "collision. The Newton handles are vestigial — the objects are in the world because the constructor takes " +
      "one, not because anything simulates them. Giving these spheres `physics: { mode: 'dynamic' }` would add " +
      "simulation the archive never ran, and would immediately break the recovered transforms, since a dynamic " +
      "body ignores behaviors.",
  },
] as const;

// ---------------------------------------------------------------------------------------
// The three things a caller needs
// ---------------------------------------------------------------------------------------

/**
 * Builds the recovered vignette as a plain scene document.
 *
 * Pure data in, pure data out: no `api`, no three.js, no side effects. That is what lets the
 * smoke import this module in Node and push the result into a built page through
 * `window.__GRAPHYSX__.create()` — the shipped definition is verified, not a re-typed copy of it.
 */
export function buildArchiveMilkyWay(id: ArchiveMilkyWayId = "archive-voie-lactee"): AgentWorldDefinition {
  if (id === "archive-voie-lactee") return voieLactee();
  throw new Error(`Unknown archive milky-way scene: ${String(id)}`);
}

/** Materialises the recovered vignette into the live world. One `api.create`, nothing else. */
export function composeArchiveMilkyWay(
  api: GraphysXAgentWorldApi,
  id: ArchiveMilkyWayId = "archive-voie-lactee",
): void {
  api.create(buildArchiveMilkyWay(id));
}

/** Descriptor list for a shelf row, without pulling in the full provenance blocks. */
export function listArchiveMilkyWayScenes(): readonly { id: ArchiveMilkyWayId; label: string; summary: string }[] {
  return ARCHIVE_MILKYWAY_SCENES.map(({ id, label, summary }) => ({ id, label, summary }));
}

/**
 * Browse-shelf rows, in the exact shape `ComposedSceneEntry` wants.
 *
 * Structurally typed rather than importing `ComposedSceneEntry` from `browse-shelf.ts`, so
 * this module keeps its "no runtime imports, no imports from surfaces" property and the
 * shelf keeps not having to know what an archive vignette is. The lead spreads the result
 * into the `composed` array it already accepts; `onOpen` is the caller's, because only the
 * caller knows whether the showroom needs taking down first.
 */
export function archiveMilkyWayBrowseRows(
  api: GraphysXAgentWorldApi,
  onOpen?: (id: ArchiveMilkyWayId) => void,
): { id: string; label: string; summary: string; meta: string; open: () => void }[] {
  return ARCHIVE_MILKYWAY_SCENES.map((record) => {
    const definition = buildArchiveMilkyWay(record.id);
    return {
      id: record.id,
      label: record.label,
      summary: record.summary,
      meta: `${definition.entities.length} entities · recovered · ${record.deviations.length} recorded deviations`,
      open: () => {
        composeArchiveMilkyWay(api, record.id);
        onOpen?.(record.id);
      },
    };
  });
}
