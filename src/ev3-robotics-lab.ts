import type {
  AgentWorldDefinition,
  AgentWorldEntityDefinition,
  AgentWorldVector3,
} from "./agent-world-runtime";

/**
 * A scene-native EV3 learning lab, built from editable primitives rather than copied CAD.
 * The construction families and mission vocabulary follow LEGO Education's published EV3
 * building-instruction and Robot Trainer catalogs; proportions are deliberately stylized so
 * this remains a flexible robotics-planning scene, not a brick-by-brick digital twin.
 */

export const EV3_ROBOTICS_LAB_CONSTRUCTION_IDS = [
  "ev3-drive-base",
  "ev3-sensor-base",
  "ev3-gripper-bot",
  "ev3-forklift-bot",
  "ev3-tank-bot",
  "ev3-robot-arm",
  "ev3-color-sorter",
] as const;

export const EV3_ROBOTICS_LAB_MISSION_IDS = [
  "moves-and-turns",
  "objects-and-obstacles",
  "grab-and-release",
  "colors-and-lines",
  "angles-and-patterns",
  "factory-robot",
  "guided-launch",
] as const;

/** Scene-declared vocabulary for the first child-facing mission surface. */
export const EV3_FIRST_MISSION_SUBJECT_ID = "ev3-drive-base";
export const EV3_FIRST_MISSION_FINISH_ID = "ev3-first-mission-finish";
export const EV3_FIRST_MISSION_MISS_TAG = "mission-miss:first-drive";
export const EV3_FIRST_MISSION_TIME_LIMIT_SECONDS = 30;

const EV3_FIRST_MISSION_SPAWN: AgentWorldVector3 = [0, 0.83, 17];

const PALETTE = {
  white: "#dce3e6",
  light: "#aeb9bd",
  dark: "#20272b",
  tire: "#111518",
  red: "#d94138",
  screen: "#a7c76c",
  sensor: "#7f8b90",
  blue: "#2e78d0",
  yellow: "#f0bd32",
  green: "#42a56b",
} as const;

type RoverVariant = "drive" | "sensor" | "gripper" | "forklift" | "tank";

export function ev3RoboticsLab(): Pick<AgentWorldDefinition, "environment" | "entities" | "rules"> {
  const entities: AgentWorldEntityDefinition[] = [
    ...labLights(),
    {
      id: "ev3-lab-floor",
      label: "EV3 Robotics Challenge Mat",
      type: "box",
      transform: { position: [0, -0.32, 0] },
      geometry: { width: 58, height: 0.64, depth: 46 },
      material: { color: "#7c8b8e", roughness: 0.92, metalness: 0.01 },
      physics: { mode: "static", material: "ground", friction: 0.92 },
      receiveShadow: true,
      tags: ["ev3-lab", "challenge-mat", "physics:static"],
    },
    ...constructionGallery(),
    ...missionField(),
  ];

  return {
    environment: {
      background: "#b8d3dc",
      sky: "clearblue",
      lighting: {
        source: "hdri",
        hdri: "studio-small-08",
        intensity: 1.1,
        yawDegrees: -18,
        backgroundIntensity: 0.72,
        backgroundBlur: 0.18,
      },
      envelope: { fogNear: 58, fogFar: 145, cameraFar: 220 },
      ground: { visible: false, size: 64, color: "#dfe8e5", grid: false, gridColor: "#849b9b" },
      physics: { gravity: [0, -9.81, 0] },
      post: { bloom: { strength: 0.08, threshold: 0.94, radius: 0.12 } },
    },
    entities,
    // One deliberately small, real mission. The finish condition and clock travel with the
    // scene, so an agent sees exactly the same run the child-facing surface narrates.
    rules: {
      schema: "graphysx.agent-rules/v1",
      subjectId: EV3_FIRST_MISSION_SUBJECT_ID,
      spawn: { entityId: EV3_FIRST_MISSION_SUBJECT_ID, position: [...EV3_FIRST_MISSION_SPAWN] },
      finish: { triggerId: EV3_FIRST_MISSION_FINISH_ID },
      timer: { limitSeconds: EV3_FIRST_MISSION_TIME_LIMIT_SECONDS },
    },
  };
}

/** Kept derived from the scene so Browse metadata cannot drift when a station gains a part. */
export const EV3_ROBOTICS_LAB_ENTITY_COUNT = ev3RoboticsLab().entities.length;

function labLights(): AgentWorldEntityDefinition[] {
  return [
    {
      id: "ev3-lab-ambient",
      label: "EV3 Lab Ambient Light",
      type: "ambient-light",
      intensity: 0.8,
      material: { color: "#d9edf2" },
      tags: ["ev3-lab", "lighting"],
    },
    {
      id: "ev3-lab-sun",
      label: "EV3 Lab Key Light",
      type: "directional-light",
      intensity: 3.1,
      transform: { position: [-18, 26, 22] },
      material: { color: "#fff4dc" },
      castShadow: true,
      tags: ["ev3-lab", "lighting"],
    },
  ];
}

function constructionGallery(): AgentWorldEntityDefinition[] {
  const bays: Array<{ id: string; label: string; position: AgentWorldVector3; accent: string }> = [
    { id: "sensor-base", label: "Ultrasonic + Color Sensor Base", position: [-20, 0, -17], accent: PALETTE.blue },
    { id: "gripper-bot", label: "Grab-and-Release Bot", position: [-12, 0, -17], accent: PALETTE.red },
    { id: "forklift-bot", label: "Forklift Attachment", position: [-4, 0, -17], accent: PALETTE.yellow },
    { id: "tank-bot", label: "Tank / Stair-Climber Base", position: [4, 0, -17], accent: PALETTE.green },
    { id: "robot-arm", label: "Robot Arm", position: [12, 0, -17], accent: "#916bd1" },
    { id: "color-sorter", label: "Color Sorter", position: [20, 0, -17], accent: "#ee7b32" },
  ];

  return [
    ...bays.flatMap((bay) => buildBay(bay.id, bay.label, bay.position, bay.accent)),
    ...buildRover("ev3-sensor-base", "Sensor Driving Base", bays[0].position, "sensor"),
    ...buildRover("ev3-gripper-bot", "Gripper Bot", bays[1].position, "gripper"),
    ...buildRover("ev3-forklift-bot", "Forklift Bot", bays[2].position, "forklift"),
    ...buildRover("ev3-tank-bot", "Tank Bot", bays[3].position, "tank"),
    ...buildRobotArm(bays[4].position),
    ...buildColorSorter(bays[5].position),
  ];
}

function buildBay(id: string, label: string, position: AgentWorldVector3, accent: string): AgentWorldEntityDefinition[] {
  return [
    {
      id: `ev3-bay-${id}`,
      label: `${label} Build Bay`,
      type: "box",
      transform: { position: [position[0], 0.08, position[2]] },
      geometry: { width: 7.1, height: 0.16, depth: 7.2 },
      material: { color: "#26343a", roughness: 0.78, metalness: 0.08 },
      tags: ["ev3-lab", "construction-bay", `construction:${id}`],
    },
    {
      id: `ev3-bay-${id}-stripe`,
      label: `${label} Bay Marker`,
      type: "box",
      transform: { position: [position[0], 0.18, position[2] + 3.15] },
      geometry: { width: 6.4, height: 0.06, depth: 0.28 },
      material: { color: accent, emissive: accent, emissiveIntensity: 0.35, roughness: 0.42 },
      tags: ["ev3-lab", "construction-bay", "bay-marker"],
    },
  ];
}

function buildRover(
  prefix: string,
  label: string,
  position: AgentWorldVector3,
  variant: RoverVariant,
  options: { driveable?: boolean; rotationDegrees?: AgentWorldVector3 } = {},
): AgentWorldEntityDefinition[] {
  const driveable = options.driveable === true;
  const rootTags = [
    "ev3-lab",
    "construction",
    `construction:${variant === "drive" ? "drive-base" : variant}`,
    "representation:stylized",
    ...(driveable ? ["agent-driveable"] : []),
  ];
  const parts: AgentWorldEntityDefinition[] = [
    {
      id: prefix,
      label,
      type: "box",
      transform: { position: [position[0], position[1] + 0.78, position[2]], rotationDegrees: options.rotationDegrees ?? [0, 0, 0] },
      // The driveable root is a nearly invisible body tall enough to rest on the mat with its
      // visual wheels at ground level. Its visible chassis is an ordinary child below.
      geometry: { width: 4.6, height: driveable ? 1.56 : 0.58, depth: 3.8 },
      material: { color: PALETTE.dark, roughness: 0.48, metalness: 0.15, ...(driveable ? { opacity: 0.015 } : {}) },
      ...(driveable ? {
        physics: { mode: "dynamic" as const, mass: 3.2, material: "default" as const, friction: 0.84, restitution: 0.04 },
        steering: {
          headingDegrees: 0,
          force: 34,
          speedCap: 5.4,
          turnRateDegrees: 160,
          kickImpulse: 5,
          jumpImpulse: 0,
          arrowId: `${prefix}:heading`,
          arrowLift: 2.65,
        },
      } : {}),
      castShadow: true,
      tags: rootTags,
    },
    ...(driveable ? [
      directionIndicator(prefix, position),
      roverPart(prefix, "chassis", "Drive Base Chassis", "box", [0, 0, 0], { width: 4.6, height: 0.58, depth: 3.8 }, PALETTE.dark),
    ] : []),
    roverPart(prefix, "brick", "EV3 Intelligent Brick", "box", [0, 1.02, 0.42], { width: 2.35, height: 1.45, depth: 1.62 }, PALETTE.white),
    roverPart(prefix, "screen", "EV3 Brick Screen", "box", [0, 1.77, 0.12], { width: 1.25, height: 0.08, depth: 0.82 }, PALETTE.screen, { emissive: "#364b1c", emissiveIntensity: 0.22 }),
    roverPart(prefix, "motor-left", "Left Large Motor", "box", [-1.45, 0.42, 0.3], { width: 1.2, height: 1.25, depth: 2.1 }, PALETTE.light),
    roverPart(prefix, "motor-right", "Right Large Motor", "box", [1.45, 0.42, 0.3], { width: 1.2, height: 1.25, depth: 2.1 }, PALETTE.light),
    roverPart(prefix, "wheel-left", "Left Wheel", "torus", [-2.18, 0.16, 0.32], { radius: 0.72, tube: 0.24, radialSegments: 20 }, PALETTE.tire, {}, [0, 90, 0]),
    roverPart(prefix, "wheel-right", "Right Wheel", "torus", [2.18, 0.16, 0.32], { radius: 0.72, tube: 0.24, radialSegments: 20 }, PALETTE.tire, {}, [0, 90, 0]),
    roverPart(prefix, "caster", "Rear Ball Caster", "sphere", [0, -0.17, 1.55], { radius: 0.35, radialSegments: 16 }, PALETTE.light),
    roverPart(prefix, "front-beam", "Front Attachment Beam", "box", [0, 0.3, -1.78], { width: 4.25, height: 0.3, depth: 0.34 }, PALETTE.red),
  ];

  if (variant === "sensor" || variant === "gripper" || variant === "forklift") {
    parts.push(
      roverPart(prefix, "ultrasonic-body", "Ultrasonic Sensor", "box", [0, 0.95, -1.93], { width: 1.65, height: 0.75, depth: 0.48 }, PALETTE.sensor),
      roverPart(prefix, "ultrasonic-left", "Ultrasonic Transducer Left", "sphere", [-0.42, 1.02, -2.2], { radius: 0.27, radialSegments: 16 }, "#c7d1d5"),
      roverPart(prefix, "ultrasonic-right", "Ultrasonic Transducer Right", "sphere", [0.42, 1.02, -2.2], { radius: 0.27, radialSegments: 16 }, "#c7d1d5"),
      roverPart(prefix, "color-sensor", "Downward Color Sensor", "cylinder", [0, 0.05, -1.45], { radius: 0.25, height: 0.55, radialSegments: 14 }, PALETTE.red),
    );
  }

  if (variant === "gripper") {
    parts.push(
      roverPart(prefix, "gripper-motor", "Medium Motor", "box", [0, 0.72, -2.25], { width: 1.2, height: 0.9, depth: 0.9 }, PALETTE.light),
      groupPart(prefix, "gripper-open", "Open Gripper", true),
      roverPart(`${prefix}:gripper-open`, "jaw-left", "Open Left Jaw", "box", [-0.8, 0.36, -0.9], { width: 0.28, height: 0.32, depth: 1.8 }, PALETTE.red, {}, [0, -24, 0]),
      roverPart(`${prefix}:gripper-open`, "jaw-right", "Open Right Jaw", "box", [0.8, 0.36, -0.9], { width: 0.28, height: 0.32, depth: 1.8 }, PALETTE.red, {}, [0, 24, 0]),
      groupPart(prefix, "gripper-closed", "Closed Gripper", false),
      roverPart(`${prefix}:gripper-closed`, "jaw-left", "Closed Left Jaw", "box", [-0.38, 0.36, -0.9], { width: 0.28, height: 0.32, depth: 1.8 }, PALETTE.red),
      roverPart(`${prefix}:gripper-closed`, "jaw-right", "Closed Right Jaw", "box", [0.38, 0.36, -0.9], { width: 0.28, height: 0.32, depth: 1.8 }, PALETTE.red),
      {
        ...roverPart(prefix, "gripper-control", "Open / Close Gripper", "box", [0, 2.02, 0.88], { width: 0.62, height: 0.18, depth: 0.62 }, PALETTE.yellow),
        interactions: [{
          id: "toggle-gripper",
          label: "Open / close the EV3 gripper",
          type: "toggle-visibility",
          targetIds: [`${prefix}:gripper-open`, `${prefix}:gripper-closed`],
        }],
        tags: ["ev3-lab", "interactive", "mission:grab-and-release"],
      },
    );
  }

  if (variant === "forklift") {
    parts.push(
      roverPart(prefix, "mast-left", "Forklift Mast Left", "box", [-0.72, 1.15, -2.15], { width: 0.28, height: 2.5, depth: 0.32 }, PALETTE.dark),
      roverPart(prefix, "mast-right", "Forklift Mast Right", "box", [0.72, 1.15, -2.15], { width: 0.28, height: 2.5, depth: 0.32 }, PALETTE.dark),
      roverPart(prefix, "carriage", "Forklift Carriage", "box", [0, 0.58, -2.34], { width: 2.05, height: 0.32, depth: 0.3 }, PALETTE.red),
      roverPart(prefix, "fork-left", "Fork Left", "box", [-0.55, 0.22, -3.2], { width: 0.3, height: 0.18, depth: 2.1 }, PALETTE.light),
      roverPart(prefix, "fork-right", "Fork Right", "box", [0.55, 0.22, -3.2], { width: 0.3, height: 0.18, depth: 2.1 }, PALETTE.light),
    );
  }

  if (variant === "tank") {
    parts.push(
      roverPart(prefix, "track-left", "Left Track", "box", [-2.02, 0.18, 0.25], { width: 0.48, height: 1.3, depth: 3.25 }, PALETTE.tire),
      roverPart(prefix, "track-right", "Right Track", "box", [2.02, 0.18, 0.25], { width: 0.48, height: 1.3, depth: 3.25 }, PALETTE.tire),
      roverPart(prefix, "gyro-sensor", "Gyro Sensor", "box", [0, 1.35, -0.62], { width: 0.82, height: 0.72, depth: 0.82 }, PALETTE.sensor),
      roverPart(prefix, "climber", "Stair Climber Nose", "box", [0, 0.32, -2.2], { width: 3.4, height: 0.25, depth: 1.3 }, PALETTE.red, {}, [22, 0, 0]),
    );
  }

  return parts;
}

function directionIndicator(prefix: string, position: AgentWorldVector3): AgentWorldEntityDefinition {
  return {
    id: `${prefix}:heading`,
    label: "Drive Direction",
    type: "cone",
    transform: {
      position: [position[0], position[1] + 3.43, position[2]],
      // ConeGeometry points along +Y; -90° around X makes its tip point north (-Z).
      rotationDegrees: [-90, 0, 0],
    },
    geometry: { radius: 0.38, height: 1.3, radialSegments: 3 },
    material: {
      color: "#7fe6ff",
      emissive: "#1a718b",
      emissiveIntensity: 0.8,
      roughness: 0.28,
      metalness: 0.08,
    },
    marker: false,
    castShadow: false,
    tags: ["ev3-lab", "heading-indicator", "agent-observable"],
  };
}

function roverPart(
  parentId: string,
  suffix: string,
  label: string,
  type: AgentWorldEntityDefinition["type"],
  position: AgentWorldVector3,
  geometry: NonNullable<AgentWorldEntityDefinition["geometry"]>,
  color: string,
  material: Partial<NonNullable<AgentWorldEntityDefinition["material"]>> = {},
  rotationDegrees: AgentWorldVector3 = [0, 0, 0],
): AgentWorldEntityDefinition {
  return {
    id: `${parentId}:${suffix}`,
    label,
    type,
    parentId,
    transform: { position, rotationDegrees },
    geometry,
    material: { color, roughness: 0.48, metalness: 0.12, ...material },
    castShadow: true,
    tags: ["ev3-lab", "construction-part", "representation:stylized"],
  };
}

function groupPart(parentId: string, suffix: string, label: string, visible: boolean): AgentWorldEntityDefinition {
  return {
    id: `${parentId}:${suffix}`,
    label,
    type: "group",
    parentId,
    visible,
    tags: ["ev3-lab", "construction-part", "attachment-state"],
  };
}

function buildRobotArm(position: AgentWorldVector3): AgentWorldEntityDefinition[] {
  const prefix = "ev3-robot-arm";
  const root: AgentWorldEntityDefinition = {
    id: prefix,
    label: "EV3 Robot Arm",
    type: "group",
    transform: { position },
    tags: ["ev3-lab", "construction", "construction:robot-arm", "representation:stylized"],
  };
  return [
    root,
    roverPart(prefix, "base", "Arm Turntable", "cylinder", [0, 0.48, 0], { radius: 1.45, height: 0.8, radialSegments: 24 }, PALETTE.dark),
    roverPart(prefix, "brick", "EV3 Intelligent Brick", "box", [0, 1.18, 0.55], { width: 2.2, height: 1.15, depth: 1.45 }, PALETTE.white),
    roverPart(prefix, "shoulder", "Shoulder Motor", "cylinder", [0, 2.25, -0.15], { radius: 0.68, height: 1.2, radialSegments: 18 }, PALETTE.light, {}, [0, 0, 90]),
    roverPart(prefix, "upper-arm", "Upper Arm", "box", [0, 3.55, -0.7], { width: 0.58, height: 3.1, depth: 0.65 }, PALETTE.red, {}, [24, 0, 0]),
    roverPart(prefix, "elbow", "Elbow Motor", "cylinder", [0, 4.85, -1.45], { radius: 0.55, height: 1.05, radialSegments: 18 }, PALETTE.light, {}, [0, 0, 90]),
    roverPart(prefix, "forearm", "Forearm", "box", [0, 5.25, -2.45], { width: 0.48, height: 0.5, depth: 2.35 }, PALETTE.red, {}, [0, 0, 0]),
    roverPart(prefix, "claw-left", "Arm Claw Left", "box", [-0.42, 5.05, -3.65], { width: 0.22, height: 0.75, depth: 0.75 }, PALETTE.dark, {}, [0, -18, 0]),
    roverPart(prefix, "claw-right", "Arm Claw Right", "box", [0.42, 5.05, -3.65], { width: 0.22, height: 0.75, depth: 0.75 }, PALETTE.dark, {}, [0, 18, 0]),
  ];
}

function buildColorSorter(position: AgentWorldVector3): AgentWorldEntityDefinition[] {
  const prefix = "ev3-color-sorter";
  return [
    {
      id: prefix,
      label: "EV3 Color Sorter",
      type: "group",
      transform: { position },
      tags: ["ev3-lab", "construction", "construction:color-sorter", "representation:stylized"],
    },
    roverPart(prefix, "base", "Sorter Base", "box", [0, 0.42, 0], { width: 4.6, height: 0.62, depth: 4.2 }, PALETTE.dark),
    roverPart(prefix, "brick", "EV3 Intelligent Brick", "box", [0, 1.15, 1], { width: 2.2, height: 1.2, depth: 1.4 }, PALETTE.white),
    roverPart(prefix, "hopper", "Color Ball Hopper", "cone", [0, 3.25, -0.35], { radius: 1.25, height: 2.2, radialSegments: 18 }, PALETTE.light, {}, [180, 0, 0]),
    roverPart(prefix, "sensor", "Color Sensor", "cylinder", [0, 1.88, -0.35], { radius: 0.35, height: 0.72, radialSegments: 14 }, PALETTE.red),
    roverPart(prefix, "wheel", "Sorting Wheel", "cylinder", [0, 1.2, -0.65], { radius: 1.05, height: 0.35, radialSegments: 20 }, PALETTE.white, {}, [90, 0, 0]),
    roverPart(prefix, "bin-red", "Red Sorting Bin", "box", [-1.5, 0.65, -1.4], { width: 1.15, height: 0.9, depth: 1.2 }, PALETTE.red),
    roverPart(prefix, "bin-yellow", "Yellow Sorting Bin", "box", [0, 0.65, -1.75], { width: 1.15, height: 0.9, depth: 1.2 }, PALETTE.yellow),
    roverPart(prefix, "bin-blue", "Blue Sorting Bin", "box", [1.5, 0.65, -1.4], { width: 1.15, height: 0.9, depth: 1.2 }, PALETTE.blue),
  ];
}

function missionField(): AgentWorldEntityDefinition[] {
  return [
    ...firstDriveMission(),
    ...missionPad("moves-and-turns", "Mission 1 · Moves and Turns", [-17, 0.1, 11], [8, 0.12, 8], PALETTE.blue),
    ...missionPad("objects-and-obstacles", "Mission 2 · Objects and Obstacles", [-17, 0.1, 2], [8, 0.12, 8], "#697c83"),
    ...missionPad("grab-and-release", "Mission 3 · Grab and Release", [-8.5, 0.1, 8], [7.5, 0.12, 14], PALETTE.red),
    ...missionPad("colors-and-lines", "Mission 4 · Colors and Lines", [0, 0.1, 7], [8, 0.12, 16], PALETTE.green),
    ...missionPad("angles-and-patterns", "Mission 5 · Angles and Patterns", [8.5, 0.1, 10], [7.5, 0.12, 10], "#916bd1"),
    ...missionPad("factory-robot", "Mission 6 · Factory Robot", [17, 0.1, 10], [8, 0.12, 10], PALETTE.yellow),
    ...missionPad("guided-launch", "Mission 7 · Guided Launch", [14, 0.1, 0], [14, 0.12, 8], "#ee7b32"),
    ...precisionLane(),
    ...obstacleMission(),
    ...cargoMission(),
    ...lineMission(),
    ...angleMission(),
    ...factoryMission(),
    ...launchMission(),
    ...buildRover(EV3_FIRST_MISSION_SUBJECT_ID, "Drive Base Simulator", [0, 0.05, 17], "drive", { driveable: true }),
  ];
}

/**
 * A short first run that fits inside the application's opening camera.
 *
 * The blue pad is the rules-layer finish. The two red lanes are ordinary triggers tagged as
 * misses; they do not invent a second failure system or stop the run. Nestor can therefore
 * coach a child back toward the target after a mistake, while timeout remains the one terminal
 * failure condition declared by the scene.
 */
function firstDriveMission(): AgentWorldEntityDefinition[] {
  const miss = (id: string, x: number): AgentWorldEntityDefinition => ({
    id,
    label: x < 0 ? "Left Red Miss Zone" : "Right Red Miss Zone",
    type: "box",
    transform: { position: [x, 0.3, 12.5] },
    geometry: { width: 2.5, height: 0.22, depth: 8 },
    material: { color: PALETTE.red, emissive: "#741a17", emissiveIntensity: 0.3, opacity: 0.72, roughness: 0.58 },
    physics: { mode: "trigger" },
    tags: ["ev3-lab", "mission-attempt-zone", "mission:first-drive", EV3_FIRST_MISSION_MISS_TAG],
  });

  return [
    {
      id: EV3_FIRST_MISSION_FINISH_ID,
      label: "First Drive Blue Target",
      type: "box",
      transform: { position: [0, 0.3, 10.5] },
      // Narrower than the rover body plus either miss zone. Trigger overlap is AABB-based, so
      // touching edges count; generous visual spacing prevents one position meaning both verdicts.
      geometry: { width: 3, height: 0.22, depth: 2.4 },
      material: { color: PALETTE.blue, emissive: "#0e4f9a", emissiveIntensity: 0.52, opacity: 0.78, roughness: 0.42 },
      physics: { mode: "trigger" },
      tags: ["ev3-lab", "mission-attempt-zone", "mission-goal", "mission:first-drive"],
    },
    {
      id: "ev3-first-mission-goal-ring",
      label: "First Drive Blue Goal Ring",
      type: "torus",
      transform: { position: [0, 2.75, 10.5] },
      geometry: { radius: 2.5, tube: 0.16, radialSegments: 32 },
      material: { color: PALETTE.blue, emissive: "#1269c8", emissiveIntensity: 0.85, roughness: 0.3 },
      tags: ["ev3-lab", "mission-goal-marker", "mission:first-drive"],
    },
    miss("ev3-first-mission-miss-left", -5),
    miss("ev3-first-mission-miss-right", 5),
  ];
}

function missionPad(
  id: typeof EV3_ROBOTICS_LAB_MISSION_IDS[number],
  label: string,
  position: AgentWorldVector3,
  size: AgentWorldVector3,
  accent: string,
): AgentWorldEntityDefinition[] {
  return [
    {
      id: `ev3-mission-${id}`,
      label,
      type: "box",
      transform: { position },
      geometry: { width: size[0], height: size[1], depth: size[2] },
      material: { color: "#e8ece6", roughness: 0.86, metalness: 0.01 },
      tags: ["ev3-lab", "mission-zone", `mission:${id}`],
    },
    {
      id: `ev3-mission-${id}-marker`,
      label: `${label} Marker`,
      type: "box",
      transform: { position: [position[0], position[1] + 0.1, position[2] + size[2] / 2 - 0.28] },
      geometry: { width: size[0] - 0.5, height: 0.06, depth: 0.28 },
      material: { color: accent, emissive: accent, emissiveIntensity: 0.18, roughness: 0.5 },
      tags: ["ev3-lab", "mission-marker", `mission:${id}`],
    },
  ];
}

function precisionLane(): AgentWorldEntityDefinition[] {
  return [0, 1, 2, 3].flatMap((index): AgentWorldEntityDefinition[] => [
    {
      id: `ev3-precision-left-${index}`,
      label: `Precision Lane Left ${index + 1}`,
      type: "box",
      transform: { position: [-19.2, 0.25, 8.6 + index * 1.65] },
      geometry: { width: 0.22, height: 0.18, depth: 1.25 },
      material: { color: PALETTE.blue, roughness: 0.6 },
      tags: ["ev3-lab", "mission-prop", "mission:moves-and-turns"],
    },
    {
      id: `ev3-precision-right-${index}`,
      label: `Precision Lane Right ${index + 1}`,
      type: "box",
      transform: { position: [-14.8, 0.25, 8.6 + index * 1.65] },
      geometry: { width: 0.22, height: 0.18, depth: 1.25 },
      material: { color: PALETTE.blue, roughness: 0.6 },
      tags: ["ev3-lab", "mission-prop", "mission:moves-and-turns"],
    },
  ]);
}

function obstacleMission(): AgentWorldEntityDefinition[] {
  return [
    [-19, 1, 0], [-16.8, 1, 3.2], [-14.7, 1, 0.7],
  ].map((position, index): AgentWorldEntityDefinition => ({
    id: `ev3-obstacle-${index + 1}`,
    label: `Ultrasonic Obstacle ${index + 1}`,
    type: index === 1 ? "cylinder" : "box",
    transform: { position: position as AgentWorldVector3 },
    geometry: index === 1 ? { radius: 0.75, height: 2, radialSegments: 18 } : { width: 1.4, height: 2, depth: 1.4 },
    material: { color: index === 1 ? PALETTE.yellow : PALETTE.red, roughness: 0.56 },
    physics: { mode: "static", material: "wall" },
    castShadow: true,
    tags: ["ev3-lab", "mission-prop", "mission:objects-and-obstacles", "sensor-target:ultrasonic"],
  }));
}

function cargoMission(): AgentWorldEntityDefinition[] {
  const colors = [PALETTE.red, PALETTE.yellow, PALETTE.blue];
  return [
    ...colors.map((color, index): AgentWorldEntityDefinition => ({
      id: `ev3-cargo-${index + 1}`,
      label: `${["Red", "Yellow", "Blue"][index]} Cargo Cube`,
      type: "box",
      transform: { position: [-10 + index * 1.45, 0.75, 9.5] },
      geometry: { width: 1.15, height: 1.15, depth: 1.15 },
      material: { color, roughness: 0.54 },
      physics: { mode: "dynamic", mass: 0.45, material: "default", friction: 0.72, restitution: 0.08 },
      castShadow: true,
      tags: ["ev3-lab", "mission-prop", "cargo", "mission:grab-and-release"],
    })),
    {
      id: "ev3-cargo-drop-zone",
      label: "Cargo Drop Zone",
      type: "torus",
      transform: { position: [-8.5, 0.22, 3.7], rotationDegrees: [90, 0, 0] },
      geometry: { radius: 1.5, tube: 0.16, radialSegments: 28 },
      material: { color: PALETTE.green, emissive: "#17683e", emissiveIntensity: 0.35, roughness: 0.48 },
      tags: ["ev3-lab", "mission-prop", "drop-zone", "mission:grab-and-release"],
    },
  ];
}

function lineMission(): AgentWorldEntityDefinition[] {
  const points: Array<[number, number]> = [
    [0, 13], [0, 11.4], [0, 9.8], [-0.4, 8.3], [-1.3, 7], [-1.3, 5.3],
    [-0.5, 4], [0.9, 3], [1.4, 1.5], [0.6, 0.1], [-0.8, -0.4],
  ];
  return points.map(([x, z], index): AgentWorldEntityDefinition => ({
    id: `ev3-line-${index + 1}`,
    label: `Color Sensor Line ${index + 1}`,
    type: "box",
    transform: { position: [x, 0.22, z], rotationDegrees: [0, index > 2 && index < 9 ? (index - 3) * 18 : 0, 0] },
    geometry: { width: 0.58, height: 0.05, depth: 1.9 },
    material: { color: "#15191b", roughness: 0.92 },
    tags: ["ev3-lab", "mission-prop", "line-follow", "mission:colors-and-lines", "sensor-target:color"],
  }));
}

function angleMission(): AgentWorldEntityDefinition[] {
  const gates: AgentWorldVector3[] = [[6.5, 1.25, 12], [10.5, 1.25, 12], [10.5, 1.25, 8], [6.5, 1.25, 8]];
  return gates.map((position, index): AgentWorldEntityDefinition => ({
    id: `ev3-angle-gate-${index + 1}`,
    label: `${index * 90} Degree Turn Gate`,
    type: "torus",
    transform: { position, rotationDegrees: [90, 0, 0] },
    geometry: { radius: 0.75, tube: 0.11, radialSegments: 24 },
    material: { color: "#916bd1", emissive: "#33205b", emissiveIntensity: 0.32, roughness: 0.45 },
    tags: ["ev3-lab", "mission-prop", "gyro-turn", "mission:angles-and-patterns", `angle:${index * 90}`],
  }));
}

function factoryMission(): AgentWorldEntityDefinition[] {
  const colors = [PALETTE.red, PALETTE.yellow, PALETTE.blue];
  return [
    {
      id: "ev3-factory-conveyor",
      label: "Factory Conveyor",
      type: "box",
      transform: { position: [17, 0.55, 10] },
      geometry: { width: 6.2, height: 0.75, depth: 2.1 },
      material: { color: PALETTE.dark, roughness: 0.5, metalness: 0.28 },
      physics: { mode: "static", material: "wall" },
      tags: ["ev3-lab", "mission-prop", "factory", "mission:factory-robot"],
    },
    ...colors.map((color, index): AgentWorldEntityDefinition => ({
      id: `ev3-factory-part-${index + 1}`,
      label: `${["Red", "Yellow", "Blue"][index]} Factory Part`,
      type: "cylinder",
      transform: { position: [15.3 + index * 1.7, 1.25, 10] },
      geometry: { radius: 0.48, height: 0.52, radialSegments: 16 },
      material: { color, roughness: 0.44 },
      physics: { mode: "dynamic", mass: 0.3, material: "default", friction: 0.62, restitution: 0.12 },
      tags: ["ev3-lab", "mission-prop", "factory-part", "mission:factory-robot", `color:${["red", "yellow", "blue"][index]}`],
    })),
    ...colors.map((color, index): AgentWorldEntityDefinition => ({
      id: `ev3-factory-bin-${index + 1}`,
      label: `${["Red", "Yellow", "Blue"][index]} Factory Bin`,
      type: "box",
      transform: { position: [15.3 + index * 1.7, 0.5, 6.8] },
      geometry: { width: 1.25, height: 0.9, depth: 1.5 },
      material: { color, roughness: 0.62 },
      tags: ["ev3-lab", "mission-prop", "factory-bin", "mission:factory-robot"],
    })),
  ];
}

function launchMission(): AgentWorldEntityDefinition[] {
  return [
    {
      id: "ev3-launch-pad",
      label: "Guided Mission Launch Pad",
      type: "cylinder",
      transform: { position: [14, 0.35, 0] },
      geometry: { radius: 2.4, height: 0.5, radialSegments: 28 },
      material: { color: "#59666b", roughness: 0.6, metalness: 0.3 },
      physics: { mode: "static", material: "ground" },
      tags: ["ev3-lab", "mission-prop", "launch", "mission:guided-launch"],
    },
    {
      id: "ev3-rocket",
      label: "Mission Rocket",
      type: "cylinder",
      transform: { position: [14, 2.7, 0] },
      geometry: { radius: 0.75, height: 4.4, radialSegments: 20 },
      material: { color: PALETTE.white, roughness: 0.38, metalness: 0.22 },
      castShadow: true,
      tags: ["ev3-lab", "mission-prop", "rocket", "mission:guided-launch"],
    },
    {
      id: "ev3-rocket-nose",
      label: "Rocket Nose Cone",
      type: "cone",
      transform: { position: [14, 5.55, 0] },
      geometry: { radius: 0.78, height: 1.4, radialSegments: 20 },
      material: { color: PALETTE.red, roughness: 0.42 },
      castShadow: true,
      tags: ["ev3-lab", "mission-prop", "rocket", "mission:guided-launch"],
    },
    {
      id: "ev3-rocket-flame",
      label: "Rocket Launch Flame",
      type: "cone",
      transform: { position: [14, 0.2, 0], rotationDegrees: [180, 0, 0] },
      geometry: { radius: 0.55, height: 1.8, radialSegments: 18 },
      material: { color: "#ff9d36", emissive: "#ff4b18", emissiveIntensity: 1.8, roughness: 0.3 },
      visible: false,
      behaviors: [{ type: "pulse", minimumScale: 0.82, maximumScale: 1.15, frequencyHz: 2.4 }],
      tags: ["ev3-lab", "mission-effect", "mission:guided-launch"],
    },
    {
      id: "ev3-mars-outpost",
      label: "Mars Outpost Beacon",
      type: "cylinder",
      transform: { position: [19.2, 1.1, 0] },
      geometry: { radius: 0.72, height: 2.2, radialSegments: 16 },
      material: { color: PALETTE.dark, roughness: 0.46, metalness: 0.3 },
      tags: ["ev3-lab", "mission-prop", "outpost", "mission:guided-launch"],
    },
    {
      id: "ev3-mars-outpost-light",
      label: "Mars Outpost Activated",
      type: "sphere",
      transform: { position: [19.2, 2.55, 0] },
      geometry: { radius: 0.42, radialSegments: 18 },
      material: { color: PALETTE.green, emissive: "#1c9c58", emissiveIntensity: 1.5, roughness: 0.32 },
      visible: false,
      behaviors: [{ type: "pulse", minimumScale: 0.88, maximumScale: 1.16, frequencyHz: 0.9 }],
      tags: ["ev3-lab", "mission-effect", "mission:guided-launch"],
    },
    {
      id: "ev3-launch-button",
      label: "Press to Initiate Launch",
      type: "cylinder",
      transform: { position: [9.5, 0.45, 0] },
      geometry: { radius: 0.78, height: 0.52, radialSegments: 20 },
      material: { color: PALETTE.red, emissive: "#7a1712", emissiveIntensity: 0.45, roughness: 0.4 },
      physics: { mode: "static", material: "wall" },
      interactions: [{
        id: "initiate-launch",
        label: "Launch rocket and activate Mars outpost",
        type: "toggle-visibility",
        targetIds: ["ev3-rocket-flame", "ev3-mars-outpost-light"],
      }],
      tags: ["ev3-lab", "interactive", "mission:guided-launch"],
    },
  ];
}
