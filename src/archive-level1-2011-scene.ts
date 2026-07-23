/**
 * Level1 2011 — the recovered BallZ mega-world, composed as ordinary v2 vocabulary.
 *
 * This was the LAST of the five archive ports for a structural reason: at 1135 units of
 * native span it could not even be rendered inside the host's old fixed far plane, let
 * alone collided or framed. `environment.envelope` removed the render limit and
 * scene-native trimesh colliders removed the collision one — so unlike every earlier
 * restoration reading (RaceScene raced it at scale 0.09; the inspection decode displayed
 * it at 0.1, both authored *under* the old constraints), this composition ships the mesh
 * at **1:1**. Rendering the largest recovered world at its recorded size is the point of
 * the capability work; shrinking it would dodge the achievement it exists to prove.
 *
 * The only archive-authored evidence in this scene is the decoded Level1.TVM mesh,
 * carried byte-for-value through `public/assets/ports/archive-level1-2011.json` and used
 * for both the rendered model and the exact static trimesh collider. Everything that
 * turns it into a game is an adaptation, and the geometry itself dictated the layout:
 * a 100-unit-slice height profile of the decoded vertices shows a start plateau at
 * z≈+400 (mean y +145), a continuous ~346-unit descent to z≈−600 (mean y −201), and a
 * perfectly x-symmetric centre lane the whole way — the "paired/two-lane long-form
 * course" reading the inspection decode recorded. Spawn, gates and finish sit on that
 * measured profile rather than on guesses. No archived runtime source loads Level1.TVM,
 * so spawn, rules, camera, controller and finish semantics have no original to be
 * faithful to; they are labelled adapted below, exactly as Map 1's are.
 */
import { Vector3 } from "three";
import {
  GRAPHYSX_AGENT_RULES_SCHEMA,
  GRAPHYSX_AGENT_WORLD_SCHEMA,
  type AgentWorldDefinition,
  type AgentWorldEntityDefinition,
  type AgentWorldVector3,
  type GraphysXAgentWorldApi,
} from "./agent-world-runtime";
import type { PlatformHost } from "./platform-host";

export const LEVEL1_2011_SCENE_ID = "graphysx-archive-level1-2011";

const LEVEL1_ASSET_ID = "archive-level1-2011";
/** Native longest span (z), shipped 1:1 — see the header for why this is not scaled down. */
const LEVEL1_NATIVE_LONGEST_SPAN = 1135.444;
/**
 * Ball sized for the world: Map 1 runs 0.42 at a ~72-unit fit; scaling that ratio to a
 * 1135-unit world gives ~4.2. Slightly heavier damping-free mass keeps the long descent
 * committed rather than skittish.
 */
const BALL_RADIUS = 4.2;
/**
 * Every gameplay coordinate below is MEASURED, not derived: a 19-probe drop grid over the
 * composed scene (deterministic `api.step`, catch floor removed so only the mesh answers)
 * mapped the world the physics engine actually built. The first composition placed these
 * from the decoded height profile instead, and the spawn missed the start plateau's edge —
 * the ball fell past the whole world. Measured facts this layout rests on: start plateau
 * rest at [−6, 191.5, 438]; a y≈0 basin floor across z −160…+40 with walls rising to +59
 * at |x| 60; the deep floor at y≈−196 across z −360…−480; a hole near z −260 that a
 * plumb-dropped probe threads (a rolling ball with momentum crosses it — probe dropped at
 * z +140 landed on the deep floor alive); and NO mesh at z −560 — the canyon mouth ends
 * between −480 and −560, which is why the finish sits at −470 and not further out.
 */
const SPAWN: AgentWorldVector3 = [0, 200, 440];

export const LEVEL1_2011_PROVENANCE = {
  source: "BallZ 2011/Release/Media/Level1.TVM via src/legacy/level1-2011-level.json",
  decodedCatalogSha256: "9e53fb7014551d8460a7f7990f013466d97abd68ab4bfc23182d3d2f9d26957f",
  faithful:
    "828 decoded vertices, 1648 triangles, UVs and native bounds at 1:1 scale; rendered and collided from the same exact vendored payload",
  adapted:
    "all gameplay geography — spawn, two checkpoint gates and the finish — placed from a 19-probe physics drop-grid over the composed scene, not from any archived layout; ball size, mass and impulse controls scaled from Map 1's; safety floor, camera framing, lighting, sky, fog envelope and effects",
  absent:
    "original material and texture bindings (one material slot, no usable UV map or texture names survive), 2011 controller behaviour, authored spawn/rules/checkpoint intent, camera, timer and finish semantics — no archived runtime source loads this mesh",
} as const;

function buildDefinition(): AgentWorldDefinition {
  const entities: AgentWorldEntityDefinition[] = [
    {
      id: "level1-terrain",
      label: "Recovered Level1.TVM",
      type: "model",
      // Same handedness convention as Map 1: the loader converts archive handedness, and the
      // 180-degree turn keeps the measured decoded-relative z readable as scene z, so the
      // descent runs toward -z and every gameplay coordinate below matches the profile.
      transform: { position: [0, 0, 0], rotationDegrees: [0, 180, 0] },
      asset: { id: LEVEL1_ASSET_ID, fitSize: LEVEL1_NATIVE_LONGEST_SPAN },
      physics: { mode: "static", material: "ground", collider: "trimesh" },
      castShadow: true,
      receiveShadow: true,
      tags: ["level1-2011", "archive", "archive-mesh", "scene-native-collider", "collider:trimesh"],
    },
    {
      id: "level1-ball",
      label: "Canyon Ball",
      type: "sphere",
      transform: { position: SPAWN },
      geometry: { radius: BALL_RADIUS, radialSegments: 32 },
      material: {
        color: "#ffd166",
        emissive: "#8a5a13",
        emissiveIntensity: 0.4,
        roughness: 0.24,
        metalness: 0.14,
      },
      physics: { mode: "dynamic", material: "ball", mass: 6 },
      interactions: (
        [
          ["push-north", "Roll downhill", [0, 0, -1]],
          ["push-south", "Roll uphill", [0, 0, 1]],
          ["push-west", "Roll west", [-1, 0, 0]],
          ["push-east", "Roll east", [1, 0, 0]],
        ] as Array<[string, string, AgentWorldVector3]>
      ).map(([id, label, direction]) => ({
        id,
        label,
        type: "apply-impulse" as const,
        // Map 1 pushes 2.6 at mass 1.6; scaled to this ball's mass and size.
        targetIds: ["level1-ball"],
        impulse: direction.map((axis) => axis * 55) as AgentWorldVector3,
      })),
      castShadow: true,
      tags: ["level1-2011", "player", "agent-observable", "physics:dynamic", "adapted-gameplay"],
    },
    {
      id: "level1-checkpoint-rim",
      label: "Rim Gate",
      type: "box",
      // The profile's midpoint: the canyon floor crosses y≈+20 around z 0.
      transform: { position: [0, 30, 0] },
      geometry: { width: 120, height: 70, depth: 3 },
      material: {
        color: "#63d9ff",
        emissive: "#248eb5",
        emissiveIntensity: 0.76,
        opacity: 0.2,
        roughness: 0.16,
      },
      physics: { mode: "trigger" },
      castShadow: false,
      tags: ["level1-2011", "checkpoint", "gate", "adapted-gameplay"],
    },
    {
      id: "level1-checkpoint-deep",
      label: "Deep Gate",
      type: "box",
      // On the measured deep floor (y ≈ −196 across z −360…−480), past the z −260 hole.
      transform: { position: [0, -180, -380] },
      geometry: { width: 120, height: 70, depth: 3 },
      material: {
        color: "#9a8cff",
        emissive: "#5d4bd1",
        emissiveIntensity: 0.72,
        opacity: 0.2,
        roughness: 0.16,
      },
      physics: { mode: "trigger" },
      castShadow: false,
      tags: ["level1-2011", "checkpoint", "gate", "adapted-gameplay"],
    },
    {
      id: "level1-finish",
      label: "Canyon Mouth Finish",
      type: "box",
      // Near the measured end of the deep floor. The mesh is GONE by z −560 (a probe there
      // fell out of the world), so the finish sits safely inside the canyon mouth.
      transform: { position: [0, -185, -470] },
      geometry: { width: 130, height: 80, depth: 4 },
      material: {
        color: "#78f0d0",
        emissive: "#2fae8b",
        emissiveIntensity: 0.9,
        opacity: 0.26,
        roughness: 0.14,
      },
      physics: { mode: "trigger" },
      castShadow: false,
      tags: ["level1-2011", "finish", "gate", "adapted-gameplay"],
    },
    {
      id: "level1-finish-beacon",
      label: "Finish Beacon",
      type: "emitter",
      transform: { position: [0, -185, -470] },
      emitter: {
        preset: "firetrail",
        sizeScale: 6,
        speed: 5,
        spread: 4,
        maxParticles: 96,
        color: "#78f0d0",
      },
      tags: ["level1-2011", "finish", "effect", "adapted-presentation"],
    },
    {
      id: "level1-catch-floor",
      label: "Canyon Safety Floor",
      type: "box",
      // Below the measured deep floor, spanning past both mesh ends — and THICK. At this
      // world's fall speeds a ball moves ~2 units per fixed step, so the first floor (2
      // thick) was a tunnelling coin flip and measurably lost: the ball fell to y −11,863.
      // Thirty units cannot be stepped over.
      transform: { position: [0, -255, 0] },
      geometry: { width: 280, height: 30, depth: 1300 },
      material: { color: "#0b1b24", roughness: 0.95, metalness: 0.01 },
      physics: { mode: "static", material: "ground" },
      visible: false,
      castShadow: false,
      receiveShadow: true,
      tags: ["level1-2011", "safety-floor", "collision", "adapted-gameplay"],
    },
    {
      id: "level1-ambient",
      label: "Canyon Ambient",
      type: "ambient-light",
      intensity: 0.5,
      material: { color: "#a9bfd8" },
      tags: ["level1-2011", "light", "adapted-presentation"],
    },
    {
      id: "level1-sun",
      label: "Canyon Sun",
      type: "directional-light",
      transform: { position: [-320, 520, 360] },
      intensity: 2.7,
      material: { color: "#ffe2b8" },
      castShadow: true,
      tags: ["level1-2011", "light", "adapted-presentation"],
    },
    {
      id: "level1-mouth-glow",
      label: "Canyon Mouth Glow",
      type: "point-light",
      transform: { position: [0, -160, -450] },
      intensity: 60,
      distance: 420,
      marker: false,
      material: { color: "#78f0d0", emissive: "#78f0d0" },
      tags: ["level1-2011", "light", "adapted-presentation"],
    },
  ];

  return {
    schema: GRAPHYSX_AGENT_WORLD_SCHEMA,
    id: LEVEL1_2011_SCENE_ID,
    label: "Level1 2011: The Long Canyon",
    environment: {
      background: "#060f1a",
      // Era-stock set; no archived scene record binds any sky to Level1.TVM, so provenance
      // lists it as presentation, exactly as Map 1 does with the same set.
      sky: "skyx",
      lighting: { source: "hdri", hdri: "studio-small-08", intensity: 0.85, yawDegrees: -24, backgroundIntensity: 0.85, backgroundBlur: 0.1 },
      overlay: "vignette",
      ground: { visible: false, size: 90, color: "#0b1b24", grid: false, gridColor: "#24586a" },
      physics: { gravity: [0, -9.81, 0] },
      // The reason this world ships last and 1:1: the old host pinned the far plane at 260,
      // one quarter of this mesh. The envelope is sized so the far canyon mouth stays inside
      // the fog rather than popping against the sky.
      envelope: { fogNear: 260, fogFar: 1350, cameraFar: 1900 },
      post: { bloom: { strength: 0.5, threshold: 0.64, radius: 0.38 } },
    },
    entities,
    rules: {
      schema: GRAPHYSX_AGENT_RULES_SCHEMA,
      subjectId: "level1-ball",
      spawn: { entityId: "level1-ball", position: SPAWN },
      checkpoints: [
        { triggerId: "level1-checkpoint-rim", label: "Rim" },
        { triggerId: "level1-checkpoint-deep", label: "Deep" },
      ],
      finish: { triggerId: "level1-finish" },
      laps: 1,
    },
  };
}

/** Compose Level1 2011 through the same public API an agent or stored scene uses. */
export function composeArchiveLevel12011(api: GraphysXAgentWorldApi) {
  return api.create(buildDefinition());
}

/**
 * Frame the whole run: high three-quarter over the start plateau, looking down the canyon's
 * length. First attempt settled the camera INSIDE the canyon wall — every gameplay assertion
 * green, screenshot a featureless grey plane — so these numbers are set from looking at the
 * captured frame, not from arithmetic: the eye must clear the +59 rim walls and sit well
 * outside the mesh's +568 z end while the whole 1135-unit descent stays inside the 1350 fog.
 */
export function frameArchiveLevel12011(host: PlatformHost): void {
  // The pre-set position exists to give focusOn its DIRECTION (camera minus orbit target):
  // aimed down the canyon's length, every distance lands the eye against the plateau flank,
  // because a 1135-unit world subtends the whole frame end-on. Broadside from +x, the
  // descent crosses the frame diagonally instead — start plateau upper right, canyon mouth
  // fading into fog lower left. Verified against the captured frame, twice.
  host.camera.position.set(900, 420, 200);
  host.focusOn(new Vector3(0, -60, -100), 480, 1.2, 900);
}
