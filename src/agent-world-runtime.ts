import {
  AgentWorldFormulaField,
  GRAPHYSX_AGENT_WORLD_FORMULAS,
  findFormulaField,
  resolveAgentWorldFormula,
  type AgentWorldFormula,
  type AgentWorldFormulaDescriptor,
  type ResolvedAgentWorldFormula,
} from "./agent-world-formula";
import {
  AgentWorldDnaSystem,
  GRAPHYSX_AGENT_WORLD_DNA,
  findDnaSystem,
  resolveAgentWorldDna,
  type AgentWorldDna,
  type AgentWorldDnaDescriptor,
  type AgentWorldDnaReadout,
  type ResolvedAgentWorldDna,
} from "./agent-world-dna";
import { GRAPHYSX_AGENT_WORLD_OVERLAYS, isOverlayId, type AgentWorldOverlayDescriptor, type AgentWorldOverlayId } from "./agent-world-overlay";
import {
  GRAPHYSX_AGENT_RULES_CAPABILITIES,
  advanceRun,
  armRun,
  validateRules,
  type AgentWorldRulesDefinition,
  type AgentWorldRulesSnapshot,
  type AgentWorldRunStatus,
} from "./agent-world-rules";
// Re-exported so a consumer that already imports the runtime's vocabulary does not have to
// know the rules layer lives in its own module — `AgentWorldDefinition` and the rules block
// that hangs off it should arrive from the same place.
export {
  GRAPHYSX_AGENT_RULES_SCHEMA,
  GRAPHYSX_AGENT_RUN_SCHEMA,
  describeRun,
  formatClock,
  type AgentWorldCheckpointRule,
  type AgentWorldRulesDefinition,
  type AgentWorldRunPhase,
  type AgentWorldRunStatus,
} from "./agent-world-rules";

import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  GridHelper,
  Group,
  IcosahedronGeometry,
  Line,
  LineBasicMaterial,
  Matrix4,
  Mesh,
  MeshPhongMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  RepeatWrapping,
  SRGBColorSpace,
  SphereGeometry,
  Texture,
  TextureLoader,
  TorusGeometry,
  Vector3
} from "three";
import {
  Body,
  Box as CannonBox,
  Cylinder as CannonCylinder,
  Material as CannonMaterial,
  Plane as CannonPlane,
  Quaternion as CannonQuaternion,
  Sphere as CannonSphere,
  Vec3,
  World as CannonWorld
} from "cannon-es";
import {
  GRAPHYSX_AGENT_WORLD_ASSETS,
  loadAgentWorldModel,
  resolveAgentWorldModelAsset,
  type AgentWorldAssetDescriptor,
  type AgentWorldModelAsset,
  type ResolvedAgentWorldModelAsset
} from "./agent-world-assets";
import {
  GRAPHYSX_AGENT_WORLD_PREFABS,
  instantiateAgentWorldPrefab,
  type AgentWorldPrefabDescriptor,
  type AgentWorldPrefabId,
  type AgentWorldPrefabInstance,
  type AgentWorldPrefabOptions
} from "./agent-world-prefabs";
import {
  GRAPHYSX_AGENT_WORLD_STARTERS,
  instantiateAgentWorldStarter,
  type AgentWorldStarterDescriptor,
  type AgentWorldStarterId,
  type AgentWorldStarterOptions
} from "./agent-world-starters";
import {
  GRAPHYSX_AGENT_LEVEL_CAPABILITIES,
  GRAPHYSX_AGENT_LEVEL_SCHEMA,
  type GraphysXAgentLevelApi
} from "./agent-level-library";
import {
  GRAPHYSX_AGENT_WORLD_TEXTURES,
  findAgentWorldTexture,
  type AgentWorldTextureDescriptor,
  type AgentWorldTextureId
} from "./agent-world-textures";
import {
  allAgentWorldSkies,
  resolveAgentWorldSky,
  type AgentWorldSkyDescriptor,
  type AgentWorldSkyId
} from "./agent-world-skies";
import {
  AgentWorldParticleSystem,
  GRAPHYSX_AGENT_WORLD_EMITTERS,
  resolveAgentWorldEmitter,
  type AgentWorldEmitter,
  type AgentWorldEmitterDescriptor,
  type ResolvedAgentWorldEmitter
} from "./agent-world-particles";
import {
  GRAPHYSX_AGENT_WORLD_HEIGHTMAPS,
  createTerrainGeometry,
  createTerrainHeightfield,
  resolveAgentWorldTerrain,
  sampleTerrainHeights,
  type AgentWorldHeightmapDescriptor,
  type AgentWorldTerrain,
  type ResolvedAgentWorldTerrain
} from "./agent-world-terrain";
import {
  AgentWorldFlockSystem,
  GRAPHYSX_AGENT_WORLD_FLOCKS,
  findFlockSystem,
  resolveAgentWorldFlock,
  type AgentWorldFlock,
  type AgentWorldFlockDescriptor,
  type ResolvedAgentWorldFlock
} from "./agent-world-flock";
import {
  AgentWorldForceFieldVisual,
  GRAPHYSX_AGENT_WORLD_FORCE_FIELDS,
  findForceFieldVisual,
  resolveAgentWorldForceField,
  sampleForceFieldAcceleration,
  type AgentWorldForceField,
  type AgentWorldForceFieldDescriptor,
  type ResolvedAgentWorldForceField
} from "./agent-world-force-field";
import {
  AgentWorldWaterSurface,
  findWaterSurface,
  resolveAgentWorldWater,
  type AgentWorldWater,
  type ResolvedAgentWorldWater
} from "./agent-world-water";
import {
  resolveAgentWorldSound,
  type AgentWorldSound,
  type AgentWorldSoundDescriptor,
  type ResolvedAgentWorldSound
} from "./agent-world-sounds";
// Type-only on purpose: the media library imports runtime types back, and a value
// import here would make that a real cycle instead of an erased one.
import type { GraphysXAgentMediaApi } from "./agent-world-media";

export const GRAPHYSX_AGENT_WORLD_SCHEMA = "graphysx.agent-world/v2" as const;
export const GRAPHYSX_AGENT_WORLD_STATE_SCHEMA = "graphysx.agent-world-state/v2" as const;

export type AgentWorldVector2 = [number, number];
export type AgentWorldVector3 = [number, number, number];
export type AgentWorldEntityType =
  | "group"
  | "agent"
  | "box"
  | "sphere"
  | "icosahedron"
  | "cylinder"
  | "cone"
  | "torus"
  | "plane"
  | "spline"
  | "model"
  | "emitter"
  | "terrain"
  | "water"
  | "flock"
  | "force-field"
  | "formula-field"
  | "dna-tree"
  | "sound"
  | "ambient-light"
  | "directional-light"
  | "point-light";

export type AgentWorldTransform = {
  position: AgentWorldVector3;
  rotationDegrees: AgentWorldVector3;
  scale: AgentWorldVector3;
};

export type AgentWorldTexture = {
  id: AgentWorldTextureId;
  repeat?: AgentWorldVector2;
  offset?: AgentWorldVector2;
  rotationDegrees?: number;
};

export type AgentWorldAgentProfile = {
  role?: string;
  status?: string;
  perceptionRadius?: number;
  capabilities?: string[];
};

export type AgentWorldMaterial = {
  color: string;
  emissive: string;
  emissiveIntensity: number;
  roughness: number;
  metalness: number;
  opacity: number;
  wireframe: boolean;
  texture: AgentWorldTexture | null;
};

export type AgentWorldSplinePath = {
  points: AgentWorldVector3[];
  closed?: boolean;
  tension?: number;
};

/**
 * `trigger` is a region that notices rather than resists: it takes part in collision
 * detection but not collision response, so bodies pass through while the world records
 * `trigger.enter` and `trigger.exit` events naming the trigger and what crossed it.
 *
 * This is the primitive the archive's race worlds are missing. Their geometry ports as
 * ordinary entities; what has no expression in v2 is "the ball reached the checkpoint".
 * A trigger is deliberately only the *observation* — it fires an event and, if the entity
 * carries interactions, runs them. Deciding what a crossing means (a lap, a pickup, a win)
 * belongs to a rules layer above this, not to the shape itself.
 */
export type AgentWorldPhysicsMode = "static" | "dynamic" | "kinematic" | "trigger";
export type AgentWorldPhysicsMaterial = "default" | "wall" | "finish" | "ground" | "ball" | "human";
export type AgentWorldPhysics = {
  mode: AgentWorldPhysicsMode;
  mass?: number;
  material?: AgentWorldPhysicsMaterial;
  friction?: number;
  restitution?: number;
  linearVelocity?: AgentWorldVector3;
  angularVelocity?: AgentWorldVector3;
};

export type AgentWorldSpinBehavior = {
  id?: string;
  type: "spin";
  axis?: "x" | "y" | "z";
  speedDegrees?: number;
};

export type AgentWorldBobBehavior = {
  id?: string;
  type: "bob";
  axis?: "x" | "y" | "z";
  amplitude?: number;
  frequencyHz?: number;
  phaseDegrees?: number;
};

export type AgentWorldOrbitBehavior = {
  id?: string;
  type: "orbit";
  center?: AgentWorldVector3;
  radius?: number;
  speedDegrees?: number;
  phaseDegrees?: number;
  axis?: "x" | "y" | "z";
};

export type AgentWorldPulseBehavior = {
  id?: string;
  type: "pulse";
  minimumScale?: number;
  maximumScale?: number;
  frequencyHz?: number;
  phaseDegrees?: number;
};

export type AgentWorldLookAtBehavior = {
  id?: string;
  type: "look-at";
  targetId: string;
};

export type AgentWorldFollowSplineBehavior = {
  id?: string;
  type: "follow-spline";
  splineId: string;
  /** Travel speed in world units per second. */
  speed?: number;
  /** Initial normalized position from 0 to 1. */
  phase?: number;
  loop?: boolean;
  orientToPath?: boolean;
};

export type AgentWorldBehavior =
  | AgentWorldSpinBehavior
  | AgentWorldBobBehavior
  | AgentWorldOrbitBehavior
  | AgentWorldPulseBehavior
  | AgentWorldLookAtBehavior
  | AgentWorldFollowSplineBehavior;

export type AgentWorldToggleVisibilityInteraction = {
  id?: string;
  label?: string;
  type: "toggle-visibility";
  targetIds: string[];
};

export type AgentWorldApplyImpulseInteraction = {
  id?: string;
  label?: string;
  type: "apply-impulse";
  targetIds: string[];
  impulse: AgentWorldVector3;
  relativePoint?: AgentWorldVector3;
};

export type AgentWorldInteraction = AgentWorldToggleVisibilityInteraction | AgentWorldApplyImpulseInteraction;

export type AgentWorldEntityDefinition = {
  id?: string;
  label?: string;
  type: AgentWorldEntityType;
  parentId?: string;
  transform?: Partial<AgentWorldTransform>;
  material?: Partial<AgentWorldMaterial>;
  geometry?: {
    width?: number;
    height?: number;
    depth?: number;
    radius?: number;
    tube?: number;
    radialSegments?: number;
  };
  path?: AgentWorldSplinePath;
  asset?: AgentWorldModelAsset;
  /** Particle emitter configuration. Only valid on `emitter` entities. */
  emitter?: AgentWorldEmitter;
  /**
   * Placed sound source. Only valid on `sound` entities. The runtime keeps the config and
   * a selectable marker; playback is a host pass (agent-world-audio.ts), because audio
   * needs the camera's listener and a user gesture — same entity-for-identity split as
   * force fields.
   */
  sound?: AgentWorldSound;
  /** Heightmap-backed terrain configuration. Only valid on `terrain` entities. */
  terrain?: AgentWorldTerrain;
  /** Reflective water configuration. Only valid on `water` entities. */
  water?: AgentWorldWater;
  /** Boid flocking configuration. Only valid on `flock` entities. */
  flock?: AgentWorldFlock;
  /** Recovered Math Game molecule field. Only valid on `formula-field` entities. */
  formula?: AgentWorldFormula;
  /** Recovered Living Forest genome. Only valid on `dna-tree` entities. */
  dna?: AgentWorldDna;
  /**
   * Force field configuration. Only valid on `force-field` entities. Unlike every other
   * field here, this one describes what the entity does to *other* entities — see the module
   * header of `agent-world-force-field.ts` for why that is still an entity type.
   */
  forceField?: AgentWorldForceField;
  agent?: AgentWorldAgentProfile;
  physics?: AgentWorldPhysics;
  intensity?: number;
  distance?: number;
  /**
   * Point lights only: whether to draw the small emissive sphere at the light's origin.
   * Defaults to true — the marker is how an author finds an invisible thing to select —
   * but a composed scene lighting a showpiece wants the light, not the lightbulb.
   */
  marker?: boolean;
  visible?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  /**
   * Session-only: this entity exists while the scene is being lived in, and is dropped by
   * `exportDocument()`. A ball you threw is ephemeral; a ball you placed in the editor is
   * not. Defaults to false, so authored content persists unless it says otherwise.
   */
  ephemeral?: boolean;
  tags?: string[];
  behaviors?: AgentWorldBehavior[];
  interactions?: AgentWorldInteraction[];
};

export type AgentWorldEntityPatch = {
  label?: string;
  parentId?: string | null;
  transform?: Partial<AgentWorldTransform>;
  material?: Partial<AgentWorldMaterial>;
  visible?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  /** Promote a thrown object into the document, or demote an authored one to session-only. */
  ephemeral?: boolean;
  tags?: string[];
  intensity?: number;
  distance?: number;
  /** Point lights only: show or hide the origin marker sphere. */
  marker?: boolean;
  physics?: Partial<AgentWorldPhysics> | null;
  agent?: AgentWorldAgentProfile;
  /** Patch the emitter of an `emitter` entity. Merged over the current configuration. */
  emitter?: AgentWorldEmitter;
  /** Patch the sound of a `sound` entity. Merged over the current configuration. */
  sound?: AgentWorldSound;
  /** Patch the terrain of a `terrain` entity. Merged over the current configuration. */
  terrain?: AgentWorldTerrain;
  /** Patch the water of a `water` entity. Merged over the current configuration. */
  water?: AgentWorldWater;
  /** Patch the flock of a `flock` entity. Merged over the current configuration. */
  flock?: AgentWorldFlock;
  /** Patch the formula of a `formula-field` entity. Replaces the configuration. */
  formula?: AgentWorldFormula;
  /** Patch the dna of a `dna-tree` entity. Merged over the current configuration. */
  dna?: AgentWorldDna;
  /** Patch the field of a `force-field` entity. Merged over the current configuration. */
  forceField?: AgentWorldForceField;
  interactions?: AgentWorldInteraction[];
};

/**
 * The scene's viewing envelope: fog distances and the camera far plane, in world units.
 * Fog always takes the scene's background (or sky-horizon) colour; the envelope decides
 * only where it starts and ends.
 */
export type AgentWorldEnvelope = {
  fogNear: number;
  fogFar: number;
  /** Keep a margin beyond `fogFar` so geometry is fully fogged before it is clipped. */
  cameraFar: number;
};

export type AgentWorldEnvironment = {
  background: string;
  /**
   * Per-scene skybox selection, or null for the flat background colour. Scoped to the
   * scene by design — there is deliberately no global sky (see PRODUCT_SPEC section 11).
   */
  sky: AgentWorldSkyId | null;
  /**
   * Per-scene viewing envelope, or null for the host defaults (fog 34–130, camera far
   * 260 — tuned to the ~36-unit showroom). Scene data like `sky`, because a pinned host
   * value breaks real content: the recovered archive worlds span 56 to 1135 units, and
   * the largest cannot be rendered at all inside the default far plane.
   */
  envelope: AgentWorldEnvelope | null;
  /**
   * Per-scene generative 2D overlay, or null for none. Like `sky`, it is scene data the host
   * renders rather than a global setting — and off by default, because a 2D layer must earn its
   * frame budget (§4). The host draws it in the one shared loop; there is never a second rAF.
   */
  overlay: AgentWorldOverlayId | null;
  ground: {
    visible: boolean;
    size: number;
    color: string;
    grid: boolean;
    gridColor: string;
  };
  physics: {
    gravity: AgentWorldVector3;
  };
};

export type AgentWorldDefinition = {
  schema: typeof GRAPHYSX_AGENT_WORLD_SCHEMA;
  id: string;
  label: string;
  environment?: Partial<AgentWorldEnvironment> & {
    ground?: Partial<AgentWorldEnvironment["ground"]>;
    physics?: Partial<AgentWorldEnvironment["physics"]>;
  };
  entities: AgentWorldEntityDefinition[];
  /**
   * What a crossing *means*: spawn, ordered checkpoints, laps, clock, finish condition.
   *
   * In the document rather than beside it, so a course's win condition travels through
   * export/save/store/SSE on exactly the same path as its geometry — see the decision record
   * at the head of `agent-world-rules.ts`. Optional and absent by default: a scene with no
   * rules block serialises byte-identically to one authored before this existed.
   */
  rules?: AgentWorldRulesDefinition;
};

export type AgentWorldCommand =
  | { op: "spawn"; entity: AgentWorldEntityDefinition }
  | { op: "spawn-prefab"; prefabId: AgentWorldPrefabId; options?: AgentWorldPrefabOptions }
  | { op: "update"; id: string; patch: AgentWorldEntityPatch }
  | { op: "remove"; id: string }
  | { op: "attach-behavior"; id: string; behavior: AgentWorldBehavior }
  | { op: "detach-behavior"; id: string; behaviorId: string }
  | { op: "interact"; id: string; interactionId?: string }
  | { op: "set-environment"; environment: AgentWorldDefinition["environment"] }
  | { op: "select"; ids: string[] };

export type AgentWorldQuery = {
  ids?: string[];
  type?: AgentWorldEntityType;
  tag?: string;
  labelIncludes?: string;
  within?: { center: AgentWorldVector3; radius: number };
};

export type AgentWorldEntityState = {
  id: string;
  label: string;
  type: AgentWorldEntityType;
  parentId: string | null;
  position: AgentWorldVector3;
  rotationDegrees: AgentWorldVector3;
  scale: AgentWorldVector3;
  material: AgentWorldMaterial;
  geometry: Required<NonNullable<AgentWorldEntityDefinition["geometry"]>>;
  intensity: number;
  distance: number;
  marker: boolean;
  visible: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
  /** True when this entity is session-only and will not survive a save or a reload. */
  ephemeral: boolean;
  /**
   * For a `trigger`, the ids currently inside it. Absent on everything else. Lets an agent
   * poll "is anything on the finish pad" without replaying the event log.
   */
  occupants?: string[];
  tags: string[];
  behaviors: Array<{ id: string; type: AgentWorldBehavior["type"] }>;
  interactions: Array<{ id: string; label: string; type: AgentWorldInteraction["type"]; targetIds: string[]; impulse?: AgentWorldVector3; relativePoint?: AgentWorldVector3 }>;
  physics: {
    mode: AgentWorldPhysicsMode;
    mass: number;
    material: AgentWorldPhysicsMaterial;
    linearVelocity: AgentWorldVector3;
    angularVelocity: AgentWorldVector3;
    sleeping: boolean;
  } | null;
  path: { pointCount: number; closed: boolean } | null;
  asset: ({ status: "loading" | "ready" | "error"; error?: string } & ResolvedAgentWorldModelAsset) | null;
  agent: Required<AgentWorldAgentProfile> | null;
  emitter: (ResolvedAgentWorldEmitter & { liveParticles: number }) | null;
  sound: ResolvedAgentWorldSound | null;
  /** Terrain configuration plus the derived collider facts an agent needs to place things. */
  terrain: (ResolvedAgentWorldTerrain & { minimumHeight: number; maximumHeight: number; colliderVertices: number }) | null;
  water: ResolvedAgentWorldWater | null;
  /**
   * Flock configuration plus live readings. `leadPosition` and `averageSpeed` are what make
   * the simulation *observable*: a flock that has stalled is visible in `state()` rather than
   * only on screen, so an agent (or a smoke test) can tell "present" from "alive".
   */
  flock: (ResolvedAgentWorldFlock & { memberCount: number; leadPosition: AgentWorldVector3; averageSpeed: number }) | null;
  /**
   * Formula field configuration plus the derived surface, so an agent can read the curve it
   * produced without re-implementing the archive maths.
   */
  formula: (ResolvedAgentWorldFormula & { moleculeCount: number; minHeight: number; maxHeight: number }) | null;
  /**
   * DNA configuration plus the live readout — expressed genome, per-tree hues, growth and
   * season phase — so an agent can read what evolution produced without replaying it.
   */
  dna: (ResolvedAgentWorldDna & AgentWorldDnaReadout) | null;
  /**
   * Force field configuration plus live readings, for the same reason the flock reports
   * `averageSpeed`: a field that is present, enabled, and silently affecting nothing — wrong
   * radius, wrong tag filter, every target static — is indistinguishable from a working one
   * unless the runtime says how many things it actually pushed on the last step.
   */
  forceField: (ResolvedAgentWorldForceField & {
    /** Bodies + flocks + emitters the last step's force pass actually applied a non-zero acceleration to. */
    affectedCount: number;
    /** Largest |a| applied on the last step, world units per second squared. */
    peakAcceleration: number;
    /** Line segments the visualiser is drawing. 0 when `visualize` is off. */
    visualVectors: number;
  }) | null;
};

export type AgentWorldInteractionReceipt = {
  sourceId: string;
  interactionId: string;
  label: string;
  type: AgentWorldInteraction["type"];
  targets: Array<{ id: string; visible: boolean; linearVelocity?: AgentWorldVector3 }>;
};

export type AgentWorldEvent = {
  revision: number;
  timeSeconds: number;
  type: string;
  message: string;
  actorId?: string;
};

export type AgentWorldActor = {
  id: string;
  label?: string;
  kind?: "agent" | "human" | "system";
};

export type AgentWorldChangeSet = {
  id?: string;
  actor: AgentWorldActor;
  intent: string;
  expectedRevision?: number;
  commands: AgentWorldCommand[];
};

export type AgentWorldCommitSummary = {
  id: string;
  worldId: string;
  actor: Required<AgentWorldActor>;
  intent: string;
  revision: number;
  commandCount: number;
  timeSeconds: number;
};

/**
 * One thing that happened, addressed by a monotonic sequence number.
 *
 * Distinct from the `recentEvents` telemetry ring, which is a human-readable tail for the
 * editor and is deliberately tiny. This is the machine-facing stream: typed payloads,
 * gap-detectable, and the substrate both the rules layer and a remote relay read from.
 * Without it a consumer polling `state()` can only diff whole worlds and can never know
 * whether it missed something.
 */
export type AgentWorldStreamEvent = {
  sequence: number;
  type: AgentWorldStreamEventType;
  /** Simulation time, so replay and physics agree even when wall-clock does not. */
  atSeconds: number;
  /** Entities this event concerns, so a consumer can filter without parsing a message. */
  entityIds: string[];
  data: Record<string, unknown>;
};

export type AgentWorldStreamEventType =
  | "trigger.enter"
  | "trigger.exit"
  | "entity.spawned"
  | "entity.updated"
  | "entity.removed"
  | "world.loaded"
  | "environment.changed"
  | "commit.applied";

export type AgentWorldEventPage = {
  events: AgentWorldStreamEvent[];
  /** Highest sequence issued so far; pass it back as `since` to continue. */
  sequence: number;
  /**
   * True when the requested `since` had already fallen out of the buffer, so events were
   * missed. A consumer that sees this must resynchronise from `state()` rather than
   * assuming it has a complete picture — silently returning a partial list is how a rules
   * layer loses a lap and nobody finds out for a week.
   */
  dropped: boolean;
};

export type AgentWorldCommitReceipt = {
  commit: AgentWorldCommitSummary;
  outputs: unknown[];
};

export type AgentWorldState = {
  schema: typeof GRAPHYSX_AGENT_WORLD_STATE_SCHEMA;
  apiVersion: "2.0";
  world: { id: string; label: string };
  revision: number;
  elapsedSeconds: number;
  paused: boolean;
  entityCount: number;
  selectedIds: string[];
  environment: AgentWorldEnvironment;
  bounds: { minimum: AgentWorldVector3; maximum: AgentWorldVector3 } | null;
  entities: AgentWorldEntityState[];
  recentEvents: AgentWorldEvent[];
  recentCommits: AgentWorldCommitSummary[];
  savedWorlds: string[];
  capabilities: readonly string[];
};

export type AgentWorldResult<T = unknown> = {
  ok: boolean;
  revision: number;
  value?: T;
  error?: string;
};

export type AgentWorldObservation = AgentWorldState & { matches?: AgentWorldEntityState[] };

/** Stable host-facing contract implemented by window.__GRAPHYSX__. */
export type GraphysXAgentWorldApi = {
  readonly schema: "graphysx.agent-api/v2";
  readonly worldSchema: typeof GRAPHYSX_AGENT_WORLD_SCHEMA;
  readonly levelSchema: typeof GRAPHYSX_AGENT_LEVEL_SCHEMA;
  readonly version: "2.0";
  readonly capabilities: readonly string[];
  readonly levels: GraphysXAgentLevelApi;
  /**
   * The media library: runtime imports from the local asset store (datalake browse,
   * import, upload). Store-backed and async, unlike the curated lists below — offline
   * it reports `status().online === false` and the library holds built-ins only.
   */
  readonly media: GraphysXAgentMediaApi;
  /** Curated catalog plus any media-library imports registered this session. */
  assets(): readonly AgentWorldAssetDescriptor[];
  textures(): readonly AgentWorldTextureDescriptor[];
  /** The curated per-scene skybox sets recovered from the archive. */
  skies(): readonly AgentWorldSkyDescriptor[];
  /** The curated particle-emitter presets decoded from the TV3D archive library. */
  emitters(): readonly AgentWorldEmitterDescriptor[];
  /** The archive sound samples plus any media-library imports, for `sound` entities. */
  sounds(): readonly AgentWorldSoundDescriptor[];
  /** The curated heightmaps, with provenance, for spawning `terrain` entities. */
  heightmaps(): readonly AgentWorldHeightmapDescriptor[];
  /** The curated boid-flock presets recovered from the Nature-of-Code sketches. */
  flocks(): readonly AgentWorldFlockDescriptor[];
  /** The curated force-field presets recovered from the same Nature-of-Code sketches. */
  forceFields(): readonly AgentWorldForceFieldDescriptor[];
  /** The recovered Math Game formula presets (Scene3D/Formulas.cpp). */
  formulas(): readonly AgentWorldFormulaDescriptor[];
  /** The recovered Living Forest genome presets (nature-lab.ts). */
  dna(): readonly AgentWorldDnaDescriptor[];
  importLegacyXml(xml: string, options?: { id?: string; label?: string }): AgentWorldResult<{
    state: AgentWorldState;
    sourceEntityCount: number;
    convertedEntityCount: number;
    warnings: string[];
  }>;
  open(): boolean;
  demo(): AgentWorldResult<AgentWorldState>;
  state(): AgentWorldState | null;
  create(definition: AgentWorldDefinition): AgentWorldResult<AgentWorldState>;
  clear(id?: string, label?: string): AgentWorldResult<AgentWorldState>;
  spawn(entity: AgentWorldEntityDefinition): AgentWorldResult<AgentWorldEntityState>;
  update(id: string, patch: AgentWorldEntityPatch): AgentWorldResult<AgentWorldEntityState>;
  remove(id: string): AgentWorldResult<string[]>;
  attachBehavior(id: string, behavior: AgentWorldBehavior): AgentWorldResult<{ entityId: string; behaviorId: string }>;
  detachBehavior(id: string, behaviorId: string): AgentWorldResult<string>;
  interact(id: string, interactionId?: string): AgentWorldResult<AgentWorldInteractionReceipt>;
  prefabs(): readonly AgentWorldPrefabDescriptor[];
  spawnPrefab(prefabId: AgentWorldPrefabId, options?: AgentWorldPrefabOptions): AgentWorldResult<AgentWorldPrefabInstance>;
  starters(): readonly AgentWorldStarterDescriptor[];
  loadStarter(starterId: AgentWorldStarterId, options?: AgentWorldStarterOptions): AgentWorldResult<AgentWorldState>;
  transaction(commands: AgentWorldCommand[]): AgentWorldResult<unknown[]>;
  commit(changeSet: AgentWorldChangeSet): AgentWorldResult<AgentWorldCommitReceipt>;
  history(sinceRevision?: number): AgentWorldCommitSummary[];
  /**
   * The typed event stream since a sequence number. The substrate for a rules layer and for
   * a relay sending deltas instead of whole documents.
   */
  events(since?: number): AgentWorldEventPage;
  /**
   * The rules layer. `get`/`set` are scene data and round-trip; `status`/`reset` are the live
   * run and do not. A scene with no rules block answers `null` rather than an empty run — the
   * difference between "this course has no win condition" and "you have not won yet" matters
   * to anything rendering it.
   */
  rules: {
    get(): AgentWorldRulesDefinition | null;
    set(rules: AgentWorldRulesDefinition | null): AgentWorldResult<AgentWorldRunStatus | null>;
    status(): AgentWorldRunStatus | null;
    reset(): AgentWorldResult<AgentWorldRunStatus | null>;
  };
  undo(): AgentWorldResult<AgentWorldState>;
  select(ids: string[]): string[];
  query(query?: AgentWorldQuery): AgentWorldEntityState[];
  observe(query?: AgentWorldQuery): AgentWorldObservation | null;
  pause(paused: boolean): AgentWorldResult<boolean>;
  step(seconds?: number): AgentWorldResult<number>;
  /** Full runtime snapshot, ephemeral entities included. */
  export(): AgentWorldDefinition | null;
  /** The persistable document: authored content only, session spawns dropped. */
  exportDocument(): AgentWorldDefinition | null;
  save(name: string): AgentWorldResult<string>;
  load(nameOrDefinition: string | AgentWorldDefinition): AgentWorldResult<AgentWorldState>;
};

type ResolvedEntity = {
  id: string;
  label: string;
  type: AgentWorldEntityType;
  parentId: string | null;
  transform: AgentWorldTransform;
  material: AgentWorldMaterial;
  geometry: Required<NonNullable<AgentWorldEntityDefinition["geometry"]>>;
  path: Required<AgentWorldSplinePath> | null;
  asset: ResolvedAgentWorldModelAsset | null;
  agent: Required<AgentWorldAgentProfile> | null;
  emitter: ResolvedAgentWorldEmitter | null;
  sound: ResolvedAgentWorldSound | null;
  terrain: ResolvedAgentWorldTerrain | null;
  water: ResolvedAgentWorldWater | null;
  flock: ResolvedAgentWorldFlock | null;
  forceField: ResolvedAgentWorldForceField | null;
  formula: ResolvedAgentWorldFormula | null;
  dna: ResolvedAgentWorldDna | null;
  physics: ResolvedAgentWorldPhysics | null;
  intensity: number;
  distance: number;
  marker: boolean;
  visible: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
  ephemeral: boolean;
  tags: string[];
  behaviors: Array<AgentWorldBehavior & { id: string }>;
  interactions: Array<AgentWorldInteraction & { id: string; label: string }>;
};

type RuntimeEntity = {
  definition: ResolvedEntity;
  object: Object3D;
  body: Body | null;
  assetState: AgentWorldEntityState["asset"];
};

type ResolvedAgentWorldPhysics = {
  mode: AgentWorldPhysicsMode;
  mass: number;
  material: AgentWorldPhysicsMaterial;
  friction: number;
  restitution: number;
  linearVelocity: AgentWorldVector3;
  angularVelocity: AgentWorldVector3;
};

const DEFAULT_TRANSFORM: AgentWorldTransform = {
  position: [0, 0, 0],
  rotationDegrees: [0, 0, 0],
  scale: [1, 1, 1]
};

const DEFAULT_MATERIAL: AgentWorldMaterial = {
  color: "#7de6c3",
  emissive: "#071f23",
  emissiveIntensity: 0.3,
  roughness: 0.55,
  metalness: 0.08,
  opacity: 1,
  wireframe: false,
  texture: null
};

const DEFAULT_GEOMETRY = {
  width: 1,
  height: 1,
  depth: 1,
  radius: 0.5,
  tube: 0.12,
  radialSegments: 24
};

const DEFAULT_ENVIRONMENT: AgentWorldEnvironment = {
  background: "#07141d",
  sky: null,
  envelope: null,
  overlay: null,
  ground: {
    visible: true,
    size: 36,
    color: "#102b2c",
    grid: true,
    gridColor: "#4aa998"
  },
  physics: { gravity: [0, -9.81, 0] }
};

export const GRAPHYSX_AGENT_CAPABILITIES = [
  "world.create",
  "world.clear",
  "entity.spawn",
  "entity.update",
  "entity.remove",
  "entity.model",
  "entity.agent-avatar",
  "asset.list",
  "material.texture",
  "texture.list",
  "environment.sky",
  "sky.list",
  "entity.emitter",
  "emitter.list",
  "entity.sound",
  "sound.list",
  "entity.terrain",
  "heightmap.list",
  "terrain.collider",
  "entity.water",
  "water.reflection",
  "entity.flock",
  "flock.list",
  "simulation.flocking",
  "entity.force-field",
  "force-field.list",
  "simulation.force-fields",
  "physics.rigid-body",
  "spline.path",
  "behavior.follow-spline",
  "behavior.attach",
  "behavior.detach",
  "interaction.trigger",
  "interaction.impulse",
  "prefab.list",
  "prefab.spawn",
  "starter.list",
  "starter.load",
  "scene.query",
  "scene.observe",
  "scene.select",
  "transaction.atomic",
  "transaction.undo",
  "collaboration.commit",
  "collaboration.history",
  "time.pause",
  "time.step",
  "snapshot.export",
  "snapshot.save",
  "snapshot.load",
  "events.stream",
  ...GRAPHYSX_AGENT_RULES_CAPABILITIES,
  ...GRAPHYSX_AGENT_LEVEL_CAPABILITIES
] as const;

export const GRAPHYSX_AGENT_DEMO_WORLD: AgentWorldDefinition = {
  schema: GRAPHYSX_AGENT_WORLD_SCHEMA,
  id: "graphysx-agent-constellation",
  label: "Agent Constellation",
  environment: {
    background: "#040c18",
    ground: { visible: true, size: 38, color: "#0e2730", grid: true, gridColor: "#3aa9ba" }
  },
  entities: [
    { id: "ambient", type: "ambient-light", intensity: 0.7, material: { color: "#8abdd2" } },
    { id: "sun", type: "directional-light", intensity: 2.8, transform: { position: [-9, 14, 11] }, material: { color: "#fff3d5" }, castShadow: true },
    { id: "core-light", type: "point-light", intensity: 7, distance: 24, transform: { position: [0, 3.4, 0] }, material: { color: "#ff7a59", emissive: "#ff4b30" } },
    { id: "core", label: "Pulsing Core", type: "icosahedron", transform: { position: [0, 3.4, 0], scale: [1.4, 1.4, 1.4] }, material: { color: "#ff8066", emissive: "#7a190d", emissiveIntensity: 1.4, metalness: 0.35 }, tags: ["focus", "energy"], behaviors: [{ type: "spin", axis: "y", speedDegrees: 28 }, { type: "pulse", minimumScale: 0.9, maximumScale: 1.12, frequencyHz: 0.35 }], interactions: [{ id: "toggle-halo", label: "Toggle core halo", type: "toggle-visibility", targetIds: ["halo"] }] },
    { id: "halo", label: "Core Halo", type: "torus", transform: { position: [0, 3.4, 0], rotationDegrees: [90, 0, 0], scale: [2.6, 2.6, 2.6] }, geometry: { radius: 0.5, tube: 0.035, radialSegments: 64 }, material: { color: "#7af4ff", emissive: "#16758a", emissiveIntensity: 1.5, metalness: 0.7 }, tags: ["energy"], behaviors: [{ type: "spin", axis: "z", speedDegrees: 18 }] },
    ...Array.from({ length: 7 }, (_, index): AgentWorldEntityDefinition => ({
      id: `orbiter-${index + 1}`,
      label: `Agent Orbiter ${index + 1}`,
      type: index % 2 === 0 ? "sphere" : "icosahedron",
      geometry: { radius: 0.32 + (index % 3) * 0.07 },
      transform: { position: [0, 2.2 + (index % 3) * 1.15, 0] },
      material: {
        color: index % 2 === 0 ? "#72e9ff" : "#8df5bb",
        emissive: index % 2 === 0 ? "#0b6178" : "#176b3d",
        emissiveIntensity: 0.9,
        metalness: 0.25
      },
      tags: ["orbiter", index % 2 === 0 ? "sensor" : "builder"],
      behaviors: [{ type: "orbit", center: [0, 2.2 + (index % 3) * 1.15, 0], radius: 5 + (index % 3) * 1.65, speedDegrees: 13 + index * 2.8, phaseDegrees: index * (360 / 7) }, { type: "spin", axis: "y", speedDegrees: 35 }]
    })),
    ...[-7.5, -3.75, 3.75, 7.5].map((x, index): AgentWorldEntityDefinition => ({
      id: `signal-${index + 1}`,
      label: `Signal Tower ${index + 1}`,
      type: "cylinder",
      geometry: { radius: 0.42, height: 3 + index * 0.55, radialSegments: 12 },
      transform: { position: [x, 1.5 + index * 0.275, -6.5], scale: [1, 1, 1] },
      material: { color: "#294b62", emissive: "#1a7896", emissiveIntensity: 0.7, metalness: 0.48 },
      tags: ["tower", "infrastructure"],
      behaviors: [{ type: "bob", axis: "y", amplitude: 0.18, frequencyHz: 0.22, phaseDegrees: index * 60 }]
    }))
  ]
};

export class AgentWorldRuntime {
  readonly group = new Group();
  private readonly worldRoot = new Group();
  private readonly environmentRoot = new Group();
  private readonly physicsWorld = new CannonWorld({ gravity: new Vec3(...DEFAULT_ENVIRONMENT.physics.gravity) });
  private readonly entities = new Map<string, RuntimeEntity>();
  private readonly savedWorlds = new Map<string, AgentWorldDefinition>();
  private readonly history: AgentWorldDefinition[] = [];
  private readonly events: AgentWorldEvent[] = [];
  private readonly commits: AgentWorldCommitSummary[] = [];
  /** Trigger id → ids currently inside it, so each crossing fires once rather than per frame. */
  private readonly triggerOccupants = new Map<string, Set<string>>();
  /**
   * The machine-facing event stream. 512 is chosen to comfortably outlast a slow consumer
   * polling a few times a second; overflow is reported through `dropped` rather than hidden.
   */
  private readonly stream: AgentWorldStreamEvent[] = [];
  private readonly streamListeners = new Set<(event: AgentWorldStreamEvent) => void>();
  private streamSequence = 0;
  /**
   * The rules layer's own state. `rules` is scene data (it round-trips); `run` is *session*
   * state and deliberately does not — a saved course carries its win condition, never a
   * half-finished attempt at it. Same distinction the store already draws between authoring
   * a scene and living in one.
   */
  private rules: AgentWorldRulesDefinition | null = null;
  private run: AgentWorldRunStatus | null = null;
  private rulesCursor = 0;
  private definition: AgentWorldDefinition = deepClone(GRAPHYSX_AGENT_DEMO_WORLD);
  private environment: AgentWorldEnvironment = deepClone(DEFAULT_ENVIRONMENT);
  private selectedIds: string[] = [];
  private revision = 0;
  private elapsedSeconds = 0;
  private paused = false;
  private entitySequence = 0;
  private behaviorSequence = 0;
  private interactionSequence = 0;
  private prefabSequence = 0;
  private commitSequence = 0;
  private groundBody: Body | null = null;
  /**
   * What each force field touched on the last completed step, keyed by field id. Written by
   * {@link applyForceFields} and read only by `state()`, so a field that is present but inert
   * is distinguishable from one that is working — the flock's `averageSpeed` lesson applied to
   * a system whose whole job is invisible.
   */
  private readonly forceFieldReadings = new Map<string, { affected: Set<string>; peak: number }>();
  /** Allocation-free scratch for the per-step force pass. Owned here so the hot loop never allocates. */
  private readonly forceFieldScratch = {
    localPoint: new Vector3(),
    localVelocity: new Vector3(),
    localAcceleration: new Vector3(),
    worldA: new Vector3(),
    worldB: new Vector3(),
    worldPoint: new Vector3(),
    worldVelocity: new Vector3(),
    worldAcceleration: new Vector3(),
    hookWorldPoint: new Vector3(),
    hookWorldVelocity: new Vector3(),
    hookWorldAcceleration: new Vector3()
  };

  constructor(definition: AgentWorldDefinition = GRAPHYSX_AGENT_DEMO_WORLD) {
    this.group.name = "GraphysXAgentWorldV2";
    this.worldRoot.name = "AgentEntities";
    this.environmentRoot.name = "AgentEnvironment";
    this.group.add(this.environmentRoot, this.worldRoot);
    this.physicsWorld.allowSleep = true;
    this.loadDefinition(definition);
    this.recordEvent("world.created", `Created ${this.definition.label}`);
  }

  getEnvironment(): AgentWorldEnvironment {
    return deepClone(this.environment);
  }

  /** The generative 2D overlays a scene can select. Off (null) is always also valid. */
  listOverlays(): readonly AgentWorldOverlayDescriptor[] {
    return GRAPHYSX_AGENT_WORLD_OVERLAYS;
  }

  listSkies(): readonly AgentWorldSkyDescriptor[] {
    return deepClone(allAgentWorldSkies());
  }

  /** The archive particle-emitter presets, as scene vocabulary. */
  listEmitters(): readonly AgentWorldEmitterDescriptor[] {
    return deepClone(GRAPHYSX_AGENT_WORLD_EMITTERS) as AgentWorldEmitterDescriptor[];
  }

  /** The curated heightmaps recovered from the archive, as terrain vocabulary. */
  listHeightmaps(): readonly AgentWorldHeightmapDescriptor[] {
    return deepClone(GRAPHYSX_AGENT_WORLD_HEIGHTMAPS) as AgentWorldHeightmapDescriptor[];
  }

  /** The boid-flock presets graduated from the Nature-of-Code sketches, as scene vocabulary. */
  /** The recovered Math Game formula presets. */
  listFormulas(): readonly AgentWorldFormulaDescriptor[] {
    return deepClone(GRAPHYSX_AGENT_WORLD_FORMULAS) as AgentWorldFormulaDescriptor[];
  }

  /** The recovered Living Forest genome presets. */
  listDna(): readonly AgentWorldDnaDescriptor[] {
    return deepClone(GRAPHYSX_AGENT_WORLD_DNA) as AgentWorldDnaDescriptor[];
  }

  listFlocks(): readonly AgentWorldFlockDescriptor[] {
    return deepClone(GRAPHYSX_AGENT_WORLD_FLOCKS) as AgentWorldFlockDescriptor[];
  }

  /** The force-field presets graduated from the Nature-of-Code sketches, as scene vocabulary. */
  listForceFields(): readonly AgentWorldForceFieldDescriptor[] {
    return deepClone(GRAPHYSX_AGENT_WORLD_FORCE_FIELDS) as AgentWorldForceFieldDescriptor[];
  }

  listAssets(): readonly AgentWorldAssetDescriptor[] {
    return deepClone(GRAPHYSX_AGENT_WORLD_ASSETS);
  }

  listTextures(): readonly AgentWorldTextureDescriptor[] {
    return deepClone(GRAPHYSX_AGENT_WORLD_TEXTURES);
  }

  create(definition: AgentWorldDefinition): AgentWorldResult<AgentWorldState> {
    const before = this.exportDefinition();
    const beforeSelection = [...this.selectedIds];
    const beforeElapsedSeconds = this.elapsedSeconds;
    try {
      validateWorldDefinition(definition);
      this.loadDefinition(definition);
      this.history.push(before);
      if (this.history.length > 40) this.history.shift();
      this.revision += 1;
      this.recordEvent("world.created", `Created ${this.definition.label}`);
      return this.success(this.getState());
    } catch (error) {
      // Loading is intentionally strict and may discover a bad parent reference
      // after it has started rebuilding. Restore the prior world so create/load
      // remain atomic from an agent's point of view.
      this.loadDefinition(before);
      this.selectedIds = beforeSelection;
      this.elapsedSeconds = beforeElapsedSeconds;
      this.updateSimulation(0);
      this.recordEvent("world.rejected", error instanceof Error ? error.message : String(error));
      return this.failure(error);
    }
  }

  clear(id = "untitled-agent-world", label = "Untitled Agent World"): AgentWorldResult<AgentWorldState> {
    return this.create({ schema: GRAPHYSX_AGENT_WORLD_SCHEMA, id, label, environment: this.environment, entities: [] });
  }

  spawn(entity: AgentWorldEntityDefinition): AgentWorldResult<AgentWorldEntityState> {
    const result = this.transaction([{ op: "spawn", entity }]);
    return result.ok
      ? this.success(this.getEntityState(String(result.value?.[0])))
      : this.failure(result.error ?? "Spawn failed");
  }

  updateEntity(id: string, patch: AgentWorldEntityPatch): AgentWorldResult<AgentWorldEntityState> {
    const result = this.transaction([{ op: "update", id, patch }]);
    return result.ok ? this.success(this.getEntityState(id)) : this.failure(result.error ?? "Update failed");
  }

  remove(id: string): AgentWorldResult<string[]> {
    const removed = this.descendantIds(id);
    const result = this.transaction([{ op: "remove", id }]);
    return result.ok ? this.success(removed) : this.failure(result.error ?? "Remove failed");
  }

  attachBehavior(id: string, behavior: AgentWorldBehavior): AgentWorldResult<{ entityId: string; behaviorId: string }> {
    const result = this.transaction([{ op: "attach-behavior", id, behavior }]);
    return result.ok
      ? this.success({ entityId: id, behaviorId: String(result.value?.[0]) })
      : this.failure(result.error ?? "Behavior attach failed");
  }

  detachBehavior(id: string, behaviorId: string): AgentWorldResult<string> {
    const result = this.transaction([{ op: "detach-behavior", id, behaviorId }]);
    return result.ok ? this.success(behaviorId) : this.failure(result.error ?? "Behavior detach failed");
  }

  interact(id: string, interactionId?: string): AgentWorldResult<AgentWorldInteractionReceipt> {
    const result = this.transaction([{ op: "interact", id, interactionId }]);
    if (!result.ok) return this.failure(result.error ?? `Interaction failed: ${id}`);
    const receipt = result.value?.[0] as AgentWorldInteractionReceipt | undefined;
    if (!receipt) return this.failure(`Interaction failed: ${id}`);
    this.recordEvent("interaction.triggered", `${receipt.label} on ${id}`);
    return this.success(receipt);
  }

  listPrefabs(): readonly AgentWorldPrefabDescriptor[] {
    return deepClone(GRAPHYSX_AGENT_WORLD_PREFABS);
  }

  spawnPrefab(prefabId: AgentWorldPrefabId, options: AgentWorldPrefabOptions = {}): AgentWorldResult<AgentWorldPrefabInstance> {
    const result = this.transaction([{ op: "spawn-prefab", prefabId, options }]);
    if (!result.ok) return this.failure(result.error ?? `Could not spawn prefab: ${prefabId}`);
    const instance = result.value?.[0] as AgentWorldPrefabInstance | undefined;
    if (!instance) return this.failure(`Could not spawn prefab: ${prefabId}`);
    this.recordEvent("prefab.spawned", `${prefabId} as ${instance.rootId}`);
    return this.success(instance);
  }

  listStarters(): readonly AgentWorldStarterDescriptor[] {
    return deepClone(GRAPHYSX_AGENT_WORLD_STARTERS);
  }

  loadStarter(starterId: AgentWorldStarterId, options: AgentWorldStarterOptions = {}): AgentWorldResult<AgentWorldState> {
    try {
      const result = this.create(instantiateAgentWorldStarter(starterId, options));
      if (result.ok) this.recordEvent("starter.loaded", starterId);
      return result;
    } catch (error) {
      this.recordEvent("starter.rejected", error instanceof Error ? error.message : String(error));
      return this.failure(error);
    }
  }

  transaction(commands: AgentWorldCommand[]): AgentWorldResult<unknown[]> {
    if (!Array.isArray(commands) || commands.length === 0) {
      return this.failure("A transaction requires at least one command");
    }
    const before = this.exportDefinition();
    const beforeSelection = [...this.selectedIds];
    const outputs: unknown[] = [];
    try {
      for (const command of commands) outputs.push(this.applyCommand(command));
      this.history.push(before);
      if (this.history.length > 40) this.history.shift();
      this.revision += 1;
      this.recordEvent("transaction.committed", `${commands.length} command${commands.length === 1 ? "" : "s"}`);
      return this.success(outputs);
    } catch (error) {
      this.loadDefinition(before);
      this.selectedIds = beforeSelection;
      this.recordEvent("transaction.rejected", error instanceof Error ? error.message : String(error));
      return this.failure(error);
    }
  }

  commit(changeSet: AgentWorldChangeSet): AgentWorldResult<AgentWorldCommitReceipt> {
    try {
      const actor = resolveActor(changeSet?.actor);
      const intent = changeSet?.intent?.trim();
      if (!intent) throw new Error("A collaborative change set requires an intent");
      if (intent.length > 240) throw new Error("Change-set intent must be 240 characters or fewer");
      const requestedId = changeSet.id?.trim();
      const id = requestedId || `commit-${String(++this.commitSequence).padStart(4, "0")}`;
      validateStableId(id, "commit id");
      if (this.commits.some((commit) => commit.id === id)) throw new Error(`Commit id already exists: ${id}`);
      if (changeSet.expectedRevision !== undefined) {
        if (!Number.isInteger(changeSet.expectedRevision) || changeSet.expectedRevision < 0) throw new Error("expectedRevision must be a non-negative integer");
        if (changeSet.expectedRevision !== this.revision) {
          const message = `Revision conflict: expected ${changeSet.expectedRevision}, current ${this.revision}`;
          this.recordEvent("collaboration.conflict", message, actor.id);
          return this.failure(message);
        }
      }
      const result = this.transaction(changeSet.commands);
      if (!result.ok) {
        this.recordEvent("collaboration.rejected", `${actor.id}: ${result.error ?? "change rejected"}`, actor.id);
        return this.failure(result.error ?? "Collaborative change rejected");
      }
      const summary: AgentWorldCommitSummary = {
        id,
        worldId: this.definition.id,
        actor,
        intent,
        revision: this.revision,
        commandCount: changeSet.commands.length,
        timeSeconds: Number(this.elapsedSeconds.toFixed(3))
      };
      this.commits.push(summary);
      if (this.commits.length > 80) this.commits.shift();
      this.emit("commit.applied", [], { commitId: id, actor: actor.id, intent, revision: this.revision });
      this.recordEvent("collaboration.committed", `${actor.label}: ${intent}`, actor.id);
      return this.success({ commit: deepClone(summary), outputs: result.value ?? [] });
    } catch (error) {
      return this.failure(error);
    }
  }

  getCommitHistory(sinceRevision = 0): AgentWorldCommitSummary[] {
    const minimumRevision = Number.isFinite(sinceRevision) ? Math.max(0, Math.floor(sinceRevision)) : 0;
    return this.commits.filter((commit) => commit.revision > minimumRevision).map((commit) => deepClone(commit));
  }

  undo(): AgentWorldResult<AgentWorldState> {
    const previous = this.history.pop();
    if (!previous) return this.failure("There is no transaction to undo");
    this.loadDefinition(previous);
    this.revision += 1;
    this.recordEvent("transaction.undone", "Restored the previous world definition");
    return this.success(this.getState());
  }

  select(ids: string[]): string[] {
    this.selectedIds = uniqueStrings(Array.isArray(ids) ? ids : []).filter((id) => this.entities.has(id));
    return [...this.selectedIds];
  }

  setPaused(paused: boolean): AgentWorldResult<boolean> {
    this.paused = paused;
    this.recordEvent(paused ? "time.paused" : "time.resumed", paused ? "Simulation paused" : "Simulation resumed");
    return this.success(this.paused);
  }

  step(seconds = 1 / 60): AgentWorldResult<number> {
    const duration = clamp(seconds, 1 / 60, 30);
    const steps = Math.max(1, Math.ceil(duration * 60));
    for (let index = 0; index < steps; index += 1) this.updateSimulation(duration / steps);
    this.recordEvent("time.stepped", `Advanced ${duration.toFixed(3)} seconds`);
    return this.success(this.elapsedSeconds);
  }

  update(deltaSeconds: number): void {
    if (!this.paused) this.updateSimulation(clamp(deltaSeconds, 0, 1 / 20));
  }

  query(query: AgentWorldQuery = {}): AgentWorldEntityState[] {
    const center = query.within ? new Vector3(...query.within.center) : null;
    const radius = query.within ? Math.max(0, query.within.radius) : 0;
    const idSet = query.ids ? new Set(query.ids) : null;
    return [...this.entities.values()]
      .filter(({ definition, object }) => {
        if (idSet && !idSet.has(definition.id)) return false;
        if (query.type && definition.type !== query.type) return false;
        if (query.tag && !definition.tags.includes(query.tag)) return false;
        if (query.labelIncludes && !definition.label.toLowerCase().includes(query.labelIncludes.toLowerCase())) return false;
        if (center && object.getWorldPosition(new Vector3()).distanceTo(center) > radius) return false;
        return true;
      })
      .map(({ definition }) => this.getEntityState(definition.id));
  }

  observe(query?: AgentWorldQuery): AgentWorldObservation {
    const state = this.getState();
    return query ? { ...state, matches: this.query(query) } : state;
  }

  /**
   * Full-fidelity export, ephemeral entities included. This is the *runtime* snapshot:
   * `transaction()` and `undo()` depend on it round-tripping everything, otherwise undoing
   * an edit would quietly delete every ball anyone had thrown.
   */
  exportDefinition(): AgentWorldDefinition {
    return {
      schema: GRAPHYSX_AGENT_WORLD_SCHEMA,
      id: this.definition.id,
      label: this.definition.label,
      environment: deepClone(this.environment),
      entities: [...this.entities.values()].map(({ definition }) => serializeEntity(definition)),
      ...(this.rules ? { rules: deepClone(this.rules) } : {})
    };
  }

  /**
   * The persistable document: what the scene *is*, minus what merely happened in it.
   *
   * Living in a scene and authoring one are different acts. Balls dropped on the showroom
   * floor, objects an inhabitant spawned mid-session — those are session state, and saving
   * them would mean a scene silently accumulates every visit's debris. Editor changes are
   * authoring and persist; everything marked `ephemeral` is dropped here.
   */
  exportDocument(): AgentWorldDefinition {
    // Children of an ephemeral entity cannot outlive their parent, so they go too.
    const dropped = new Set<string>();
    for (const { definition } of this.entities.values()) {
      if (definition.ephemeral) dropped.add(definition.id);
    }
    for (const id of [...dropped]) for (const descendant of this.descendantIds(id)) dropped.add(descendant);
    return {
      schema: GRAPHYSX_AGENT_WORLD_SCHEMA,
      id: this.definition.id,
      label: this.definition.label,
      environment: deepClone(this.environment),
      entities: [...this.entities.values()]
        .filter(({ definition }) => !dropped.has(definition.id))
        .map(({ definition }) => serializeEntity(definition)),
      // The rules go with the document, not with the run. What persists is "this course is
      // three laps and needs every ring"; what does not is "you are on lap two".
      ...(this.rules ? { rules: deepClone(this.rules) } : {})
    };
  }

  save(name: string): AgentWorldResult<string> {
    const safeName = name.trim();
    if (!safeName) return this.failure("Snapshot name cannot be empty");
    // Saving is an authoring act, so it stores the document rather than the live runtime.
    const definition = this.exportDocument();
    this.savedWorlds.set(safeName, deepClone(definition));
    try {
      window.localStorage.setItem(`graphysx.agent-world.v2.${safeName}`, JSON.stringify(definition));
    } catch {
      // In-memory snapshots remain available when storage is blocked.
    }
    this.recordEvent("snapshot.saved", safeName);
    return this.success(safeName);
  }

  load(nameOrDefinition: string | AgentWorldDefinition): AgentWorldResult<AgentWorldState> {
    if (typeof nameOrDefinition !== "string") return this.create(nameOrDefinition);
    let definition = this.savedWorlds.get(nameOrDefinition) ?? null;
    if (!definition) {
      try {
        const raw = window.localStorage.getItem(`graphysx.agent-world.v2.${nameOrDefinition}`);
        definition = raw ? JSON.parse(raw) as AgentWorldDefinition : null;
      } catch {
        definition = null;
      }
    }
    if (!definition) return this.failure(`Unknown snapshot: ${nameOrDefinition}`);
    const result = this.create(definition);
    if (result.ok) this.recordEvent("snapshot.loaded", nameOrDefinition);
    return result;
  }

  getState(): AgentWorldState {
    const entityStates = [...this.entities.keys()].map((id) => this.getEntityState(id));
    const positions = entityStates.map((entity) => entity.position);
    const bounds = positions.length > 0
      ? {
          minimum: [Math.min(...positions.map((position) => position[0])), Math.min(...positions.map((position) => position[1])), Math.min(...positions.map((position) => position[2]))] as AgentWorldVector3,
          maximum: [Math.max(...positions.map((position) => position[0])), Math.max(...positions.map((position) => position[1])), Math.max(...positions.map((position) => position[2]))] as AgentWorldVector3
        }
      : null;
    return {
      schema: GRAPHYSX_AGENT_WORLD_STATE_SCHEMA,
      apiVersion: "2.0",
      world: { id: this.definition.id, label: this.definition.label },
      revision: this.revision,
      elapsedSeconds: Number(this.elapsedSeconds.toFixed(3)),
      paused: this.paused,
      entityCount: entityStates.length,
      selectedIds: [...this.selectedIds],
      environment: deepClone(this.environment),
      bounds,
      entities: entityStates,
      recentEvents: this.events.slice(-12).map((event) => ({ ...event })),
      recentCommits: this.commits.slice(-10).map((commit) => deepClone(commit)),
      savedWorlds: [...this.savedWorlds.keys()].sort(),
      capabilities: GRAPHYSX_AGENT_CAPABILITIES
    };
  }

  findInteractiveEntityId(object: Object3D | null): string | null {
    let current = object;
    while (current && current !== this.group) {
      const id = typeof current.userData.graphysxEntityId === "string" ? current.userData.graphysxEntityId : null;
      if (id && (this.entities.get(id)?.definition.interactions.length ?? 0) > 0) return id;
      current = current.parent;
    }
    return null;
  }

  findEntityId(object: Object3D | null): string | null {
    let current = object;
    while (current && current !== this.group) {
      const id = typeof current.userData.graphysxEntityId === "string" ? current.userData.graphysxEntityId : null;
      if (id && this.entities.has(id)) return id;
      current = current.parent;
    }
    return null;
  }

  getEntityObject(id: string): Object3D | null {
    return this.entities.get(id)?.object ?? null;
  }

  dispose(): void {
    disposeObjectTree(this.worldRoot);
    disposeObjectTree(this.environmentRoot);
    this.worldRoot.clear();
    this.environmentRoot.clear();
    this.entities.clear();
  }

  private applyCommand(command: AgentWorldCommand): unknown {
    if (!command || typeof command !== "object" || !("op" in command)) throw new Error("Invalid world command");
    switch (command.op) {
      case "spawn": return this.spawnInternal(command.entity);
      case "spawn-prefab": return this.spawnPrefabInternal(command.prefabId, command.options);
      case "update": this.updateInternal(command.id, command.patch); return command.id;
      case "remove": this.removeInternal(command.id); return command.id;
      case "attach-behavior": return this.attachBehaviorInternal(command.id, command.behavior);
      case "detach-behavior": this.detachBehaviorInternal(command.id, command.behaviorId); return command.behaviorId;
      case "interact": return this.interactInternal(command.id, command.interactionId);
      case "set-environment": this.setEnvironmentInternal(command.environment); return this.environment;
      case "select": this.selectedIds = command.ids.filter((id) => this.entities.has(id)); return [...this.selectedIds];
    }
  }

  private spawnInternal(source: AgentWorldEntityDefinition, allowUnresolvedLookAt = false): string {
    const definition = this.resolveEntity(source, allowUnresolvedLookAt);
    if (this.entities.has(definition.id)) throw new Error(`Entity id already exists: ${definition.id}`);
    if (definition.parentId && !this.entities.has(definition.parentId)) throw new Error(`Unknown parent entity: ${definition.parentId}`);
    const object = createEntityObject(definition);
    object.name = definition.id;
    object.userData.graphysxEntityId = definition.id;
    const runtime: RuntimeEntity = {
      definition,
      object,
      body: null,
      assetState: definition.asset ? { ...definition.asset, status: "loading" } : null
    };
    this.entities.set(definition.id, runtime);
    const parent = definition.parentId ? this.entities.get(definition.parentId)?.object : this.worldRoot;
    parent?.add(object);
    this.applyResolvedEntity(runtime);
    this.rebuildPhysicsBody(runtime);
    if (definition.asset) this.startModelLoad(runtime);
    // Carries the type so a relay can decide whether it needs the whole definition, and an
    // ephemeral flag so a consumer knows this one is session state and not worth persisting.
    this.emit("entity.spawned", [definition.id], { type: definition.type, ephemeral: definition.ephemeral });
    return definition.id;
  }

  private spawnPrefabInternal(prefabId: AgentWorldPrefabId, options: AgentWorldPrefabOptions = {}): AgentWorldPrefabInstance {
    const idPrefix = options.idPrefix?.trim() || this.nextPrefabPrefix(prefabId);
    const definitions = instantiateAgentWorldPrefab(prefabId, { ...options, idPrefix });
    for (const entity of definitions) this.spawnInternal(entity);
    return { prefabId, rootId: idPrefix, entityIds: definitions.map((entity) => String(entity.id)) };
  }

  private updateInternal(id: string, patch: AgentWorldEntityPatch): void {
    const runtime = this.requireEntity(id);
    const definition = runtime.definition;
    if (patch.parentId !== undefined) {
      const nextParent = patch.parentId;
      if (nextParent === id) throw new Error("An entity cannot parent itself");
      if (nextParent && !this.entities.has(nextParent)) throw new Error(`Unknown parent entity: ${nextParent}`);
      if (nextParent && this.descendantIds(id).includes(nextParent)) throw new Error("Parenting would create a cycle");
      if (nextParent && definition.physics) throw new Error("Physics entities must remain at the world root");
      definition.parentId = nextParent;
      const parent = nextParent ? this.entities.get(nextParent)?.object : this.worldRoot;
      parent?.add(runtime.object);
    }
    if (patch.label !== undefined) definition.label = patch.label;
    if (patch.transform) definition.transform = mergeTransform(definition.transform, patch.transform);
    if (patch.material) definition.material = resolveMaterial(patch.material, definition.material);
    if (patch.visible !== undefined) definition.visible = patch.visible;
    if (patch.castShadow !== undefined) definition.castShadow = patch.castShadow;
    if (patch.receiveShadow !== undefined) definition.receiveShadow = patch.receiveShadow;
    if (patch.ephemeral !== undefined) definition.ephemeral = patch.ephemeral;
    if (patch.tags) definition.tags = uniqueStrings(patch.tags);
    if (patch.intensity !== undefined) definition.intensity = clamp(patch.intensity, 0, 100);
    if (patch.distance !== undefined) definition.distance = clamp(patch.distance, 0, 1000);
    if (patch.marker !== undefined) definition.marker = patch.marker === true;
    if (patch.physics !== undefined) {
      definition.physics = patch.physics === null
        ? null
        : resolvePhysics({ ...(definition.physics ?? { mode: "static" }), ...patch.physics }, definition.type, definition.parentId, definition.behaviors);
    }
    if (patch.agent !== undefined) {
      if (definition.type !== "agent") throw new Error("Only agent entities accept an agent profile");
      definition.agent = resolveAgentProfile(patch.agent, definition.agent ?? undefined);
    }
    if (patch.emitter !== undefined) {
      if (definition.type !== "emitter") throw new Error("Only emitter entities accept an emitter configuration");
      definition.emitter = resolveAgentWorldEmitter(patch.emitter, definition.emitter ?? undefined);
    }
    if (patch.sound !== undefined) {
      if (definition.type !== "sound") throw new Error("Only sound entities accept a sound configuration");
      definition.sound = resolveAgentWorldSound(patch.sound, definition.sound ?? undefined);
    }
    if (patch.formula !== undefined) {
      if (definition.type !== "formula-field") throw new Error("Only formula-field entities accept a formula configuration");
      definition.formula = resolveAgentWorldFormula(patch.formula);
      findFormulaField(runtime.object)?.configure(definition.formula);
    }
    if (patch.dna !== undefined) {
      if (definition.type !== "dna-tree") throw new Error("Only dna-tree entities accept a dna configuration");
      // Merged over the current configuration: `{ dna: { generation: 4 } }` keeps the genome
      // it was already expressing — advancing the generation IS the evolution mechanism.
      definition.dna = resolveAgentWorldDna(patch.dna, definition.dna ?? undefined);
      findDnaSystem(runtime.object)?.configure(definition.dna);
    }
    if (patch.terrain !== undefined) {
      if (definition.type !== "terrain") throw new Error("Only terrain entities accept a terrain configuration");
      definition.terrain = resolveAgentWorldTerrain(patch.terrain, definition.terrain ?? undefined);
      rebuildTerrainMesh(runtime);
    }
    if (patch.water !== undefined) {
      if (definition.type !== "water") throw new Error("Only water entities accept a water configuration");
      definition.water = resolveAgentWorldWater(patch.water, definition.water ?? undefined);
      findWaterSurface(runtime.object)?.configure(definition.water);
    }
    if (patch.flock !== undefined) {
      if (definition.type !== "flock") throw new Error("Only flock entities accept a flock configuration");
      definition.flock = resolveAgentWorldFlock(patch.flock, definition.flock ?? undefined);
      findFlockSystem(runtime.object)?.configure(definition.flock);
    }
    if (patch.forceField !== undefined) {
      if (definition.type !== "force-field") throw new Error("Only force-field entities accept a force field configuration");
      definition.forceField = resolveAgentWorldForceField(patch.forceField, definition.forceField ?? undefined);
      findForceFieldVisual(runtime.object)?.configure(definition.forceField);
    }
    if (patch.interactions) definition.interactions = this.resolveInteractions(patch.interactions);
    this.applyResolvedEntity(runtime);
    // A terrain patch reshapes the ground, so the collider has to be rebuilt with it —
    // otherwise the mesh moves and things keep landing on the old landform.
    if (patch.transform || patch.physics !== undefined || patch.parentId !== undefined || patch.terrain !== undefined) {
      this.rebuildPhysicsBody(runtime);
    }
    // The changed field names, not the values: a relay reads them to decide what to send,
    // and shipping the values here would duplicate state that `query()` already answers.
    this.emit("entity.updated", [id], { fields: Object.keys(patch) });
  }

  private removeInternal(id: string): void {
    const runtime = this.requireEntity(id);
    const ids = this.descendantIds(id).reverse();
    for (const descendantId of ids) {
      const descendant = this.entities.get(descendantId);
      if (!descendant) continue;
      if (descendant.body) this.physicsWorld.removeBody(descendant.body);
      descendant.object.removeFromParent();
      disposeObjectTree(descendant.object);
      this.entities.delete(descendantId);
    }
    if (runtime.body) this.physicsWorld.removeBody(runtime.body);
    runtime.object.removeFromParent();
    disposeObjectTree(runtime.object);
    this.entities.delete(id);
    this.selectedIds = this.selectedIds.filter((selectedId) => selectedId !== id && !ids.includes(selectedId));
    // Descendants go with the parent, so the event names all of them — a consumer that only
    // heard about the root would leave orphans on screen.
    this.emit("entity.removed", [id, ...ids], { rootId: id });
  }

  private attachBehaviorInternal(id: string, behavior: AgentWorldBehavior): string {
    const runtime = this.requireEntity(id);
    validateBehavior(behavior, this.entities);
    if (
      runtime.definition.physics
      && !["kinematic", "trigger"].includes(runtime.definition.physics.mode)
      && isMotionBehavior(behavior)
    ) {
      throw new Error("Transform behaviors require kinematic physics");
    }
    const behaviorId = behavior.id?.trim() || `behavior-${String(++this.behaviorSequence).padStart(3, "0")}`;
    if (runtime.definition.behaviors.some((candidate) => candidate.id === behaviorId)) throw new Error(`Behavior id already exists on ${id}: ${behaviorId}`);
    runtime.definition.behaviors.push({ ...deepClone(behavior), id: behaviorId });
    return behaviorId;
  }

  private detachBehaviorInternal(id: string, behaviorId: string): void {
    const runtime = this.requireEntity(id);
    const index = runtime.definition.behaviors.findIndex((behavior) => behavior.id === behaviorId);
    if (index < 0) throw new Error(`Unknown behavior on ${id}: ${behaviorId}`);
    runtime.definition.behaviors.splice(index, 1);
  }

  private interactInternal(id: string, interactionId?: string): AgentWorldInteractionReceipt {
    const runtime = this.requireEntity(id);
    const interaction = interactionId
      ? runtime.definition.interactions.find((candidate) => candidate.id === interactionId)
      : runtime.definition.interactions[0];
    if (!interaction) {
      throw new Error(interactionId ? `Unknown interaction on ${id}: ${interactionId}` : `Entity has no interactions: ${id}`);
    }
    validateInteraction(interaction, this.entities);
    const targets = interaction.targetIds.map((targetId) => {
      const target = this.requireEntity(targetId);
      if (interaction.type === "toggle-visibility") {
        target.definition.visible = !target.definition.visible;
        this.applyResolvedEntity(target);
        return { id: targetId, visible: target.definition.visible };
      }
      if (!target.body || target.definition.physics?.mode !== "dynamic") throw new Error(`apply-impulse target must be dynamic: ${targetId}`);
      const impulse = new Vec3(...interaction.impulse);
      const relativePoint = interaction.relativePoint ? new Vec3(...interaction.relativePoint) : undefined;
      target.body.applyImpulse(impulse, relativePoint);
      target.body.wakeUp();
      return { id: targetId, visible: target.definition.visible, linearVelocity: roundCannonVector(target.body.velocity) };
    });
    return {
      sourceId: id,
      interactionId: interaction.id,
      label: interaction.label,
      type: interaction.type,
      targets
    };
  }

  private setEnvironmentInternal(environment: AgentWorldDefinition["environment"]): void {
    this.environment = resolveEnvironment(environment);
    this.buildEnvironment();
    // The runtime owns the ground mesh and gravity — `buildEnvironment` just updated both.
    // But `background`, `fog` and `sky` are applied by the *host*, off the runtime's scene
    // graph, and the host only re-reads them on `world.loaded`. Without this, an agent's
    // `api.transaction([{ op: "set-environment", ... }])` changed the stored environment and
    // the ground, while the rendered sky and background silently stayed on the old values —
    // the same write-only parity gap that `world.loaded` closed for `create`/`load`, reopened
    // by a different entry point. Emitting here lets the host re-apply for every caller.
    this.emit("environment.changed", [], { sky: this.environment.sky, overlay: this.environment.overlay, background: this.environment.background, envelope: this.environment.envelope });
  }

  private loadDefinition(source: AgentWorldDefinition): void {
    validateWorldDefinition(source);
    for (const runtime of this.entities.values()) if (runtime.body) this.physicsWorld.removeBody(runtime.body);
    if (this.groundBody) this.physicsWorld.removeBody(this.groundBody);
    this.groundBody = null;
    disposeObjectTree(this.worldRoot);
    this.worldRoot.clear();
    this.entities.clear();
    this.selectedIds = [];
    this.elapsedSeconds = 0;
    this.entitySequence = 0;
    this.behaviorSequence = 0;
    this.interactionSequence = 0;
    this.definition = { schema: GRAPHYSX_AGENT_WORLD_SCHEMA, id: source.id, label: source.label, environment: deepClone(source.environment ?? {}), entities: [] };
    this.environment = resolveEnvironment(source.environment);
    this.buildEnvironment();
    const pending = source.entities.map((entity) => deepClone(entity));
    let previousPending = pending.length + 1;
    while (pending.length > 0 && pending.length < previousPending) {
      previousPending = pending.length;
      for (let index = pending.length - 1; index >= 0; index -= 1) {
        const entity = pending[index];
        if (!entity.parentId || this.entities.has(entity.parentId)) {
          this.spawnInternal(entity, true);
          pending.splice(index, 1);
        }
      }
    }
    if (pending.length > 0) throw new Error(`Unresolved parent references: ${pending.map((entity) => entity.id ?? entity.label ?? entity.type).join(", ")}`);
    for (const runtime of this.entities.values()) {
      for (const behavior of runtime.definition.behaviors) validateBehavior(behavior, this.entities);
      for (const interaction of runtime.definition.interactions) validateInteraction(interaction, this.entities);
    }
    this.updateSimulation(0);
    // A wholesale replacement invalidates any incremental picture a consumer was keeping,
    // whether it came from a load, a rollback or an undo. Saying so is cheaper than every
    // consumer inferring it from a storm of spawn events.
    this.emit("world.loaded", [], { worldId: this.definition.id, entityCount: this.entities.size });
    // Armed *after* the emit, deliberately. `world.loaded` idles a run — that is how an
    // external consumer learns its course was replaced underneath it — so arming first would
    // have the runtime's own evaluator immediately read that event and idle the run it had
    // just started. Arming last puts the cursor past it.
    this.applyRules(source.rules ?? null);
  }

  /**
   * Install a rules block and arm a fresh run against it. Validation runs against the entity
   * ids that actually exist, which is why this is called at the end of a load rather than
   * alongside `validateWorldDefinition` — a checkpoint can only be checked once the gate it
   * names has been spawned.
   */
  private applyRules(rules: AgentWorldRulesDefinition | null): void {
    if (!rules) {
      this.rules = null;
      this.run = null;
      this.definition.rules = undefined;
      this.rulesCursor = this.streamSequence;
      return;
    }
    validateRules(rules, new Set(this.entities.keys()));
    this.rules = deepClone(rules);
    this.definition.rules = deepClone(rules);
    this.rulesCursor = this.streamSequence;
    this.run = armRun(this.rules, this.rulesSnapshot(), this.rulesCursor);
    this.recordEvent("rules.armed", `${this.run.checkpointCount} checkpoints · ${this.run.collectibleCount} collectibles · ${this.run.laps} lap(s)`);
  }

  /**
   * The world facts the evaluator is allowed to see. Deliberately narrow: id, visibility and
   * tags are everything a resync needs, and handing it the whole entity state would invite a
   * rules layer that reads positions and quietly becomes a second physics engine.
   */
  private rulesSnapshot(): AgentWorldRulesSnapshot {
    return {
      nowSeconds: this.elapsedSeconds,
      entities: [...this.entities.values()].map(({ definition }) => ({
        id: definition.id,
        visible: definition.visible !== false,
        tags: definition.tags ?? []
      }))
    };
  }

  /**
   * Drive the run one slice, from inside the simulation so it inherits pause/step.
   *
   * It polls `readEvents(cursor)` — its own buffer, through the same public path an
   * out-of-process agent uses — rather than subscribing. That looks redundant for an
   * in-process consumer and is the point: `step(30)` runs 1800 substeps in a single call and
   * a busy course overflows the 512-entry ring inside it, so the `dropped` branch is live
   * code on the real path instead of a limb only a test can reach.
   */
  private updateRules(): void {
    if (!this.rules || !this.run) return;
    const page = this.readEvents(this.rulesCursor);
    this.rulesCursor = page.sequence;
    const before = this.run;
    this.run = advanceRun(before, this.rules, page, this.rulesSnapshot());
    if (this.run.resyncs > before.resyncs) {
      this.recordEvent("rules.resync", `stream gap at ${before.sequence}; collectibles rebuilt from the scene, lap and gate counts kept and flagged`);
    }
    if (this.run.phase !== before.phase && (this.run.phase === "complete" || this.run.phase === "expired")) {
      this.recordEvent("rules.finished", `${this.run.outcome} in ${this.run.elapsedSeconds.toFixed(2)}s${this.run.desynced ? " (desynced)" : ""}`);
    }
  }

  /** The live rules block, or null. */
  getRules(): AgentWorldRulesDefinition | null {
    return this.rules ? deepClone(this.rules) : null;
  }

  /** Install or clear a rules block on the live scene, arming a fresh run. */
  setRules(rules: AgentWorldRulesDefinition | null): AgentWorldResult<AgentWorldRunStatus | null> {
    try {
      this.applyRules(rules);
    } catch (error) {
      return this.failure(error instanceof Error ? error.message : String(error));
    }
    this.definition.rules = this.rules ?? undefined;
    return this.success(this.run ? deepClone(this.run) : null);
  }

  /** The current run, or null when the scene declares no rules. */
  runStatus(): AgentWorldRunStatus | null {
    return this.run ? deepClone(this.run) : null;
  }

  /**
   * Re-arm the run without reloading the scene, and put the subject back on the spawn point.
   *
   * Note what this does *not* do: it does not restore collected rings, because a ring hides
   * itself and un-hiding it is an ordinary scene edit the caller can make. Keeping the reset
   * to "clock, laps, gates, and where the subject stands" is what stops it becoming a
   * bespoke save-state system living inside the runtime.
   */
  resetRun(): AgentWorldResult<AgentWorldRunStatus | null> {
    if (!this.rules) return this.failure("This scene declares no rules");
    const spawn = this.rules.spawn;
    if (spawn) {
      const subject = this.entities.get(spawn.entityId);
      if (subject) {
        const position = spawn.position ?? subject.definition.transform.position;
        subject.object.position.set(...position);
        if (subject.body) {
          subject.body.position.set(...position);
          subject.body.velocity.setZero();
          subject.body.angularVelocity.setZero();
          subject.body.wakeUp();
        }
      }
    }
    this.rulesCursor = this.streamSequence;
    this.run = armRun(this.rules, this.rulesSnapshot(), this.rulesCursor);
    this.recordEvent("rules.reset", spawn?.entityId ?? "clock only");
    return this.success(deepClone(this.run));
  }

  private buildEnvironment(): void {
    if (this.groundBody) this.physicsWorld.removeBody(this.groundBody);
    this.groundBody = null;
    this.physicsWorld.gravity.set(...this.environment.physics.gravity);
    disposeObjectTree(this.environmentRoot);
    this.environmentRoot.clear();
    if (!this.environment.ground.visible) return;
    const geometry = new PlaneGeometry(this.environment.ground.size, this.environment.ground.size);
    geometry.rotateX(-Math.PI / 2);
    const ground = new Mesh(
      geometry,
      new MeshStandardMaterial({ color: new Color(this.environment.ground.color), roughness: 0.92, metalness: 0.03, side: DoubleSide })
    );
    ground.name = "AgentWorldGround";
    ground.receiveShadow = true;
    this.environmentRoot.add(ground);
    this.groundBody = new Body({ mass: 0, shape: new CannonPlane() });
    this.groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.physicsWorld.addBody(this.groundBody);
    if (this.environment.ground.grid) {
      const grid = new GridHelper(this.environment.ground.size, Math.max(8, Math.round(this.environment.ground.size)), this.environment.ground.gridColor, this.environment.ground.gridColor);
      grid.name = "AgentWorldGrid";
      grid.position.y = 0.012;
      const materials = Array.isArray(grid.material) ? grid.material : [grid.material];
      materials.forEach((material) => { material.transparent = true; material.opacity = 0.3; });
      this.environmentRoot.add(grid);
    }
  }

  private updateSimulation(deltaSeconds: number): void {
    this.elapsedSeconds += deltaSeconds;
    const degreesToRadians = Math.PI / 180;
    for (const runtime of this.entities.values()) {
      const { definition, object } = runtime;
      if (definition.physics?.mode === "dynamic") continue;
      const basePosition = definition.transform.position;
      const baseRotation = definition.transform.rotationDegrees;
      const baseScale = definition.transform.scale;
      object.position.set(...basePosition);
      object.rotation.set(baseRotation[0] * degreesToRadians, baseRotation[1] * degreesToRadians, baseRotation[2] * degreesToRadians);
      object.scale.set(...baseScale);
    }
    for (const runtime of this.entities.values()) {
      const { definition, object } = runtime;
      if (definition.physics?.mode === "dynamic") continue;
      const basePosition = definition.transform.position;
      const baseScale = definition.transform.scale;
      for (const behavior of definition.behaviors) {
        const phase = (("phaseDegrees" in behavior ? behavior.phaseDegrees : 0) ?? 0) * degreesToRadians;
        if (behavior.type === "spin") {
          const axis = behavior.axis ?? "y";
          object.rotation[axis] += this.elapsedSeconds * (behavior.speedDegrees ?? 30) * degreesToRadians;
        } else if (behavior.type === "bob") {
          const axis = behavior.axis ?? "y";
          object.position[axis] += Math.sin(this.elapsedSeconds * Math.PI * 2 * (behavior.frequencyHz ?? 0.5) + phase) * (behavior.amplitude ?? 0.5);
        } else if (behavior.type === "orbit") {
          const center = behavior.center ?? [0, 0, 0];
          const angle = this.elapsedSeconds * (behavior.speedDegrees ?? 20) * degreesToRadians + phase;
          const radius = behavior.radius ?? 5;
          const axis = behavior.axis ?? "y";
          if (axis === "y") object.position.set(center[0] + Math.cos(angle) * radius, basePosition[1] + center[1], center[2] + Math.sin(angle) * radius);
          if (axis === "x") object.position.set(basePosition[0] + center[0], center[1] + Math.cos(angle) * radius, center[2] + Math.sin(angle) * radius);
          if (axis === "z") object.position.set(center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius, basePosition[2] + center[2]);
        } else if (behavior.type === "pulse") {
          const minimum = behavior.minimumScale ?? 0.85;
          const maximum = behavior.maximumScale ?? 1.15;
          const mix = (Math.sin(this.elapsedSeconds * Math.PI * 2 * (behavior.frequencyHz ?? 0.5) + phase) + 1) * 0.5;
          const scale = minimum + (maximum - minimum) * mix;
          object.scale.set(baseScale[0] * scale, baseScale[1] * scale, baseScale[2] * scale);
        } else if (behavior.type === "follow-spline") {
          this.applyFollowSpline(runtime, behavior);
        }
      }
    }
    for (const runtime of this.entities.values()) {
      // Triggers follow their transform for the same reason kinematic bodies do: a gate that
      // bobs or rides a spline has to carry its detection volume with it.
      const mode = runtime.definition.physics?.mode;
      if ((mode === "kinematic" || mode === "trigger") && runtime.body) syncObjectToBody(runtime.object, runtime.body);
    }
    // Fields act before the solver: a force applied after the step would not be integrated
    // until the next one, which is a one-frame lag that shows up as jitter on a fast attractor.
    this.applyForceFields();
    if (deltaSeconds > 0) this.physicsWorld.step(1 / 60, deltaSeconds, 4);
    for (const runtime of this.entities.values()) {
      if (runtime.definition.physics?.mode === "dynamic" && runtime.body) syncBodyToObject(runtime.body, runtime.object);
    }
    this.updateTriggers();
    // Emitters, water and flocks tick inside updateSimulation, so they inherit pause/step for
    // free — `api.pause(true)` freezes the murmuration, and `api.step(dt)` advances it one
    // deterministic slice, exactly as it does a rigid body.
    for (const runtime of this.entities.values()) {
      const particles = findParticleSystem(runtime.object);
      if (particles) particles.update(deltaSeconds);
      const water = findWaterSurface(runtime.object);
      if (water) water.update(deltaSeconds);
      const flock = findFlockSystem(runtime.object);
      if (flock) flock.update(deltaSeconds);
      const field = findForceFieldVisual(runtime.object);
      if (field) field.update(deltaSeconds);
      // Growth and the seasonal leaf fall inherit pause/step exactly as the flock does.
      const dna = findDnaSystem(runtime.object);
      if (dna) dna.update(deltaSeconds);
    }
    for (const runtime of this.entities.values()) {
      for (const behavior of runtime.definition.behaviors) {
        if (behavior.type === "look-at") {
          const target = this.entities.get(behavior.targetId);
          if (target) runtime.object.lookAt(target.object.getWorldPosition(new Vector3()));
        }
      }
    }
    // Last, so the rules see the crossings this slice produced rather than last slice's.
    this.updateRules();
  }

  /**
   * The force-field pass: the one place in the runtime that can see rigid bodies, particle
   * systems and flocks at once, which is exactly why the coupling lives here rather than
   * inside `agent-world-force-field.ts`.
   *
   * It runs once per simulation step, immediately before the cannon step, and does three
   * things:
   *
   *  1. applies `a · mass` to every eligible **dynamic** body — static, kinematic and trigger
   *     bodies are left alone, because a field that shoved the ground would be a bug;
   *  2. installs (or clears) the per-step `externalAcceleration` hook on every flock and
   *     emitter, so those systems pick the field up inside their own integrator without
   *     either module having to know force fields exist;
   *  3. records what each field actually touched, so `state().forceField` can distinguish a
   *     working field from a present-but-inert one.
   *
   * Everything is sampled in the **field's** local space, so a rotated, scaled or parented
   * field is exactly as correct as an unrotated one at the origin — the box region of a
   * tilted drag volume really is tilted. The local↔world conversion uses two `applyMatrix4`
   * calls and a subtraction rather than a normal matrix, because that handles non-uniform
   * scale without a special case.
   */
  private applyForceFields(): void {
    const fields = [...this.entities.values()].filter(
      (runtime) => runtime.definition.type === "force-field" && runtime.definition.forceField?.enabled,
    );
    this.forceFieldReadings.clear();
    // Clear last step's hooks unconditionally, so removing or disabling the last field really
    // does stop the pushing. This is the shape of bug this codebase keeps finding: state that
    // is written on the way in and never unwritten on the way out.
    for (const runtime of this.entities.values()) {
      const flock = findFlockSystem(runtime.object);
      if (flock) flock.externalAcceleration = null;
      const particles = findParticleSystem(runtime.object);
      if (particles) particles.externalAcceleration = null;
    }
    if (fields.length === 0) return;

    for (const field of fields) {
      field.object.updateWorldMatrix(true, false);
      this.forceFieldReadings.set(field.definition.id, { affected: new Set<string>(), peak: 0 });
    }
    const inverses = new Map<string, Matrix4>();
    for (const field of fields) inverses.set(field.definition.id, new Matrix4().copy(field.object.matrixWorld).invert());

    const scratch = this.forceFieldScratch;
    const elapsed = this.elapsedSeconds;

    /**
     * Sum every field of a given channel that reaches `worldPoint` into `outWorld`, in world
     * space. `channel` selects which of the three `affects*` flags gates a field, so bodies,
     * flocks and particles share one path and differ only in the flag they read.
     */
    const accumulate = (
      targetId: string,
      targetTags: string[],
      channel: "affectsBodies" | "affectsFlocks" | "affectsParticles",
      worldPoint: Vector3,
      worldVelocity: Vector3,
      outWorld: Vector3,
    ): void => {
      outWorld.set(0, 0, 0);
      for (const field of fields) {
        const config = field.definition.forceField!;
        if (!config[channel]) continue;
        if (config.affectsTags.length > 0 && !config.affectsTags.some((tag) => targetTags.includes(tag))) continue;
        const inverse = inverses.get(field.definition.id)!;
        // World → field-local, for both the point and the velocity direction.
        scratch.localPoint.copy(worldPoint).applyMatrix4(inverse);
        scratch.localVelocity.copy(worldPoint).add(worldVelocity).applyMatrix4(inverse).sub(scratch.localPoint);
        const influence = sampleForceFieldAcceleration(config, scratch.localPoint, scratch.localVelocity, elapsed, scratch.localAcceleration);
        if (influence <= 0 || scratch.localAcceleration.lengthSq() < 1e-12) continue;
        // Field-local → world, same trick in the other direction.
        scratch.worldA.copy(scratch.localPoint).applyMatrix4(field.object.matrixWorld);
        scratch.worldB.copy(scratch.localPoint).add(scratch.localAcceleration).applyMatrix4(field.object.matrixWorld).sub(scratch.worldA);
        outWorld.add(scratch.worldB);
        const reading = this.forceFieldReadings.get(field.definition.id)!;
        reading.affected.add(targetId);
        reading.peak = Math.max(reading.peak, scratch.worldB.length());
      }
    };

    const anyBodies = fields.some((field) => field.definition.forceField!.affectsBodies);
    const anyFlocks = fields.some((field) => field.definition.forceField!.affectsFlocks);
    const anyParticles = fields.some((field) => field.definition.forceField!.affectsParticles);

    for (const runtime of this.entities.values()) {
      const definition = runtime.definition;
      if (definition.type === "force-field") continue;

      // 1. Dynamic rigid bodies.
      if (anyBodies && runtime.body && definition.physics?.mode === "dynamic") {
        scratch.worldPoint.set(runtime.body.position.x, runtime.body.position.y, runtime.body.position.z);
        scratch.worldVelocity.set(runtime.body.velocity.x, runtime.body.velocity.y, runtime.body.velocity.z);
        accumulate(definition.id, definition.tags, "affectsBodies", scratch.worldPoint, scratch.worldVelocity, scratch.worldAcceleration);
        if (scratch.worldAcceleration.lengthSq() > 1e-12) {
          // F = m·a. Applying an acceleration rather than a force is the whole reason a heavy
          // crate and a light ball fall into an attractor together — the p5 original got there
          // by dividing the force back out by mass on the way in.
          const mass = runtime.body.mass || 1;
          runtime.body.applyForce(
            new Vec3(scratch.worldAcceleration.x * mass, scratch.worldAcceleration.y * mass, scratch.worldAcceleration.z * mass),
          );
          // A body asleep in a field would ignore it forever; a field arriving is exactly the
          // kind of event that should wake it.
          if (runtime.body.sleepState === Body.SLEEPING) runtime.body.wakeUp();
        }
      }

      // 2. Flocks and emitters, via the per-step hook installed on the system. The consumer's
      //    own world matrix is captured once here rather than per member/particle.
      const flock = findFlockSystem(runtime.object);
      const particles = findParticleSystem(runtime.object);
      if ((!flock || !anyFlocks) && (!particles || !anyParticles)) continue;
      const channel = flock ? "affectsFlocks" : "affectsParticles";
      runtime.object.updateWorldMatrix(true, false);
      const toWorld = new Matrix4().copy(runtime.object.matrixWorld);
      const toLocal = new Matrix4().copy(toWorld).invert();
      const hook = (localPosition: Vector3, localVelocity: Vector3, out: Vector3): void => {
        // Consumer-local → world, sample every field, back to consumer-local.
        scratch.hookWorldPoint.copy(localPosition).applyMatrix4(toWorld);
        scratch.hookWorldVelocity.copy(localPosition).add(localVelocity).applyMatrix4(toWorld).sub(scratch.hookWorldPoint);
        accumulate(definition.id, definition.tags, channel, scratch.hookWorldPoint, scratch.hookWorldVelocity, scratch.hookWorldAcceleration);
        out.copy(scratch.hookWorldPoint).add(scratch.hookWorldAcceleration).applyMatrix4(toLocal).sub(localPosition);
      };
      if (flock && anyFlocks) flock.externalAcceleration = hook;
      if (particles && anyParticles) particles.externalAcceleration = hook;
    }
  }

  private applyFollowSpline(runtime: RuntimeEntity, behavior: AgentWorldFollowSplineBehavior): void {
    const spline = this.entities.get(behavior.splineId);
    if (!spline?.definition.path) return;
    const curve = createSplineCurve(spline.definition.path);
    const length = Math.max(0.0001, curve.getLength());
    const distance = clamp(behavior.phase ?? 0, 0, 1) * length + this.elapsedSeconds * clamp(behavior.speed ?? 2, -1000, 1000);
    const progress = behavior.loop === false
      ? clamp(distance / length, 0, 1)
      : ((distance % length) + length) % length / length;
    const worldPoint = spline.object.localToWorld(curve.getPointAt(progress));
    const parent = runtime.object.parent;
    runtime.object.position.copy(parent ? parent.worldToLocal(worldPoint.clone()) : worldPoint);
    if (behavior.orientToPath) {
      const nextProgress = behavior.loop === false ? Math.min(1, progress + 0.002) : (progress + 0.002) % 1;
      const nextWorldPoint = spline.object.localToWorld(curve.getPointAt(nextProgress));
      runtime.object.lookAt(nextWorldPoint);
    }
  }

  /**
   * Turns overlap into enter/exit events.
   *
   * Deliberately computed here from body AABBs rather than read off cannon's contact list.
   * A trigger body is excluded from contact *resolution*, and depending on it also appearing
   * in the solver's reported contacts would tie the vocabulary to an implementation detail
   * of the physics engine. An AABB test is coarse — a checkpoint fires slightly before a
   * ball touches its visible surface — but it is predictable, survives pause/step exactly,
   * and is the same approximation the archive's gates used.
   *
   * Occupancy is diffed rather than reported raw so a ball resting inside a trigger fires
   * `trigger.enter` once, not sixty times a second.
   */
  private updateTriggers(): void {
    const triggers = [...this.entities.values()].filter((runtime) => runtime.definition.physics?.mode === "trigger" && runtime.body);
    if (triggers.length === 0) {
      // A world can lose its last trigger; leaving stale occupancy would replay exits later.
      if (this.triggerOccupants.size > 0) this.triggerOccupants.clear();
      return;
    }
    // Anything that can move through a trigger. Static scenery cannot cross anything, and a
    // trigger overlapping another trigger is not a crossing worth reporting.
    const movers = [...this.entities.values()].filter((runtime) => {
      const mode = runtime.definition.physics?.mode;
      return runtime.body && (mode === "dynamic" || mode === "kinematic");
    });

    for (const trigger of triggers) {
      const triggerId = trigger.definition.id;
      trigger.body!.updateAABB();
      const previous = this.triggerOccupants.get(triggerId) ?? new Set<string>();
      const current = new Set<string>();

      for (const mover of movers) {
        mover.body!.updateAABB();
        if (!trigger.body!.aabb.overlaps(mover.body!.aabb)) continue;
        const moverId = mover.definition.id;
        current.add(moverId);
        if (previous.has(moverId)) continue;
        this.recordEvent("trigger.enter", `${triggerId} <- ${moverId}`);
        this.emit("trigger.enter", [triggerId, moverId], { triggerId, entityId: moverId });
        // A trigger's interactions are its response to being crossed. This is what lets a
        // gate light up, a pickup vanish, or a launcher fire without any external agent in
        // the loop — the first in-world cause-and-effect the vocabulary has had.
        if (trigger.definition.interactions.length > 0) {
          try {
            this.interactInternal(triggerId);
          } catch (error) {
            // One malformed trigger must not stop the simulation for everything else.
            this.recordEvent("trigger.rejected", `${triggerId}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }

      for (const moverId of previous) {
        if (current.has(moverId)) continue;
        this.recordEvent("trigger.exit", `${triggerId} -> ${moverId}`);
        this.emit("trigger.exit", [triggerId, moverId], { triggerId, entityId: moverId });
      }
      this.triggerOccupants.set(triggerId, current);
    }

    for (const triggerId of [...this.triggerOccupants.keys()]) {
      if (!triggers.some((trigger) => trigger.definition.id === triggerId)) this.triggerOccupants.delete(triggerId);
    }
  }

  private emit(type: AgentWorldStreamEventType, entityIds: string[], data: Record<string, unknown> = {}): void {
    const event: AgentWorldStreamEvent = {
      sequence: ++this.streamSequence,
      type,
      atSeconds: Number(this.elapsedSeconds.toFixed(3)),
      entityIds,
      data,
    };
    this.stream.push(event);
    if (this.stream.length > 512) this.stream.shift();
    for (const listener of this.streamListeners) {
      try {
        listener(event);
      } catch {
        // A broken consumer must not take the simulation down with it.
      }
    }
  }

  /**
   * Everything that happened after `since`. Pull-based by default because the interesting
   * consumers — a rules layer, a relay, an agent on another machine — are not in this call
   * stack and cannot be handed a callback.
   */
  readEvents(since = 0): AgentWorldEventPage {
    const from = Number.isFinite(since) ? Math.max(0, Math.floor(since)) : 0;
    const oldest = this.stream.length > 0 ? this.stream[0].sequence : this.streamSequence + 1;
    return {
      events: this.stream.filter((event) => event.sequence > from).map((event) => deepClone(event)),
      sequence: this.streamSequence,
      // Asking for events older than the buffer holds means some are gone for good.
      dropped: from > 0 && from < oldest - 1,
    };
  }

  /** Push, for consumers that are in-process. Returns an unsubscribe. */
  subscribeEvents(listener: (event: AgentWorldStreamEvent) => void): () => void {
    this.streamListeners.add(listener);
    return () => this.streamListeners.delete(listener);
  }

  /** Ids currently inside a trigger. Empty for anything that is not one. */
  triggerOccupantIds(id: string): string[] {
    return [...(this.triggerOccupants.get(id) ?? [])];
  }

  private rebuildPhysicsBody(runtime: RuntimeEntity): void {
    if (runtime.body) this.physicsWorld.removeBody(runtime.body);
    // Terrain is the one type whose collider is implied by the entity rather than requested
    // through `physics` — a terrain you can fall through is not terrain.
    runtime.body = runtime.definition.type === "terrain"
      ? createTerrainBody(runtime.definition, runtime.object)
      : runtime.definition.physics
        ? createPhysicsBody(runtime.definition)
        : null;
    if (runtime.body) this.physicsWorld.addBody(runtime.body);
  }

  private startModelLoad(runtime: RuntimeEntity): void {
    const asset = runtime.definition.asset;
    if (!asset || !(runtime.object instanceof Group)) return;
    void loadAgentWorldModel(runtime.object, asset).then(() => {
      if (this.entities.get(runtime.definition.id) !== runtime || runtime.object.userData.graphysxDisposed) return;
      runtime.assetState = { ...asset, status: "ready" };
      this.applyResolvedEntity(runtime);
      this.recordEvent("asset.ready", `${runtime.definition.id}: ${asset.id ?? asset.url}`);
    }).catch((error: unknown) => {
      if (this.entities.get(runtime.definition.id) !== runtime) return;
      const message = error instanceof Error ? error.message : String(error);
      runtime.assetState = { ...asset, status: "error", error: message };
      this.recordEvent("asset.error", `${runtime.definition.id}: ${message}`);
    });
  }

  private applyResolvedEntity(runtime: RuntimeEntity): void {
    const { definition, object } = runtime;
    object.visible = definition.visible;
    const particles = findParticleSystem(object);
    if (particles && definition.emitter) particles.configure(definition.emitter);
    const water = findWaterSurface(object);
    if (water && definition.water) water.configure(definition.water);
    const flock = findFlockSystem(object);
    if (flock && definition.flock) flock.configure(definition.flock);
    const formula = findFormulaField(object);
    if (formula && definition.formula) formula.configure(definition.formula);
    const dnaSystem = findDnaSystem(object);
    if (dnaSystem && definition.dna) dnaSystem.configure(definition.dna);
    const field = findForceFieldVisual(object);
    if (field && definition.forceField) field.configure(definition.forceField);
    object.position.set(...definition.transform.position);
    object.rotation.set(...definition.transform.rotationDegrees.map((value) => value * Math.PI / 180) as AgentWorldVector3);
    object.scale.set(...definition.transform.scale);
    object.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = definition.castShadow;
        child.receiveShadow = definition.receiveShadow;
        // Some entity types own their own material, configured from their own field: water
        // from `water`, flock members from `flock.color`/`flock.emissive`. The generic entity
        // material pass would overwrite exactly what they just set, so they opt out.
        if (child.material instanceof MeshStandardMaterial && child.userData.graphysxMaterialLocked !== true) {
          applyMaterial(child.material, child.userData.graphysxAgentAccent === true
            ? { ...definition.material, color: "#ffffff", emissive: definition.material.color, emissiveIntensity: 1.15, texture: null }
            : definition.material);
        }
      }
      if (child instanceof AmbientLight || child instanceof DirectionalLight || child instanceof PointLight) {
        child.color.set(definition.material.color);
        child.intensity = definition.intensity;
        if (child instanceof PointLight) child.distance = definition.distance;
        if (child instanceof DirectionalLight) child.castShadow = definition.castShadow;
      }
      if (child.userData.agentLightMarker === true) child.visible = definition.marker;
    });
  }

  private resolveEntity(source: AgentWorldEntityDefinition, allowUnresolvedLookAt = false): ResolvedEntity {
    if (!source || typeof source !== "object" || !isEntityType(source.type)) throw new Error(`Unsupported entity type: ${String(source?.type)}`);
    const id = source.id?.trim() || `entity-${String(++this.entitySequence).padStart(3, "0")}`;
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/.test(id)) throw new Error(`Invalid entity id: ${id}`);
    const behaviors = (source.behaviors ?? []).map((behavior) => {
      validateBehavior(behavior, this.entities, allowUnresolvedLookAt);
      return { ...deepClone(behavior), id: behavior.id?.trim() || `behavior-${String(++this.behaviorSequence).padStart(3, "0")}` };
    });
    const interactions = this.resolveInteractions(source.interactions ?? [], allowUnresolvedLookAt);
    const path = resolveSplinePath(source.type, source.path);
    const asset = source.type === "model" ? resolveAgentWorldModelAsset(source.asset) : null;
    if (source.type !== "model" && source.asset) throw new Error("Only model entities accept an asset");
    const agent = source.type === "agent" ? resolveAgentProfile(source.agent) : null;
    if (source.type !== "agent" && source.agent) throw new Error("Only agent entities accept an agent profile");
    const emitter = source.type === "emitter" ? resolveAgentWorldEmitter(source.emitter) : null;
    if (source.type !== "emitter" && source.emitter) throw new Error("Only emitter entities accept an emitter configuration");
    if (source.type === "emitter" && source.physics) throw new Error("Emitter entities do not take a rigid body");
    const sound = source.type === "sound" ? resolveAgentWorldSound(source.sound) : null;
    if (source.type !== "sound" && source.sound) throw new Error("Only sound entities accept a sound configuration");
    // A sound source is a point in space, not matter — same reasoning as an emitter.
    if (source.type === "sound" && source.physics) throw new Error("Sound entities do not take a rigid body");
    const terrain = source.type === "terrain" ? resolveAgentWorldTerrain(source.terrain) : null;
    if (source.type !== "terrain" && source.terrain) throw new Error("Only terrain entities accept a terrain configuration");
    const water = source.type === "water" ? resolveAgentWorldWater(source.water) : null;
    if (source.type !== "water" && source.water) throw new Error("Only water entities accept a water configuration");
    // Water is a surface you look at and fall through, not a body you land on. A collider
    // here would be a lie about what the entity does.
    if (source.type === "water" && source.physics) throw new Error("Water entities do not take a rigid body");
    const flock = source.type === "flock" ? resolveAgentWorldFlock(source.flock) : null;
    if (source.type !== "flock" && source.flock) throw new Error("Only flock entities accept a flock configuration");
    // Members are steered, not simulated as rigid bodies — a collider on the flock entity
    // would describe a box the members do not live in.
    if (source.type === "flock" && source.physics) throw new Error("Flock entities do not take a rigid body");
    const formula = source.type === "formula-field" ? resolveAgentWorldFormula(source.formula) : null;
    if (source.type !== "formula-field" && source.formula) throw new Error("Only formula-field entities accept a formula configuration");
    // The field is a plotted surface, not matter: a collider would describe a box its
    // molecules do not live in, exactly as for a flock.
    if (source.type === "formula-field" && source.physics) throw new Error("Formula-field entities do not take a rigid body");
    const dna = source.type === "dna-tree" ? resolveAgentWorldDna(source.dna) : null;
    if (source.type !== "dna-tree" && source.dna) throw new Error("Only dna-tree entities accept a dna configuration");
    // The forest is instanced growth, not matter — a collider would describe a box the
    // branches do not live in, exactly as for a flock or a formula field.
    if (source.type === "dna-tree" && source.physics) throw new Error("Dna-tree entities do not take a rigid body");
    const forceField = source.type === "force-field" ? resolveAgentWorldForceField(source.forceField) : null;
    if (source.type !== "force-field" && source.forceField) throw new Error("Only force-field entities accept a force field configuration");
    // A field acts on bodies; giving it one would let it act on itself, and a self-attracting
    // attractor is a divide-by-zero with a scene graph attached.
    if (source.type === "force-field" && source.physics) throw new Error("Force field entities do not take a rigid body");
    // Terrain always carries its own static Heightfield collider, built from the same height
    // array as the mesh. Accepting a physics field would let a scene ask for a box or a
    // dynamic body and quietly get neither.
    if (source.type === "terrain" && source.physics) {
      throw new Error("Terrain entities carry their own static heightfield collider; remove the physics field");
    }
    const physics = source.physics ? resolvePhysics(source.physics, source.type, source.parentId ?? null, behaviors) : null;
    return {
      formula,
      dna,
      id,
      label: source.label?.trim() || id,
      type: source.type,
      parentId: source.parentId ?? null,
      transform: mergeTransform(DEFAULT_TRANSFORM, source.transform ?? {}),
      material: resolveMaterial(source.material),
      geometry: { ...DEFAULT_GEOMETRY, ...(source.geometry ?? {}) },
      path,
      asset,
      agent,
      emitter,
      sound,
      terrain,
      water,
      flock,
      forceField,
      physics,
      intensity: clamp(source.intensity ?? 1, 0, 100),
      distance: clamp(source.distance ?? 0, 0, 1000),
      marker: source.marker ?? true,
      visible: source.visible ?? true,
      castShadow: source.castShadow ?? true,
      receiveShadow: source.receiveShadow ?? true,
      ephemeral: source.ephemeral ?? false,
      tags: uniqueStrings(source.tags ?? []),
      behaviors,
      interactions
    };
  }

  private resolveInteractions(source: AgentWorldInteraction[], allowUnresolvedTargets = false): ResolvedEntity["interactions"] {
    const interactions = source.map((interaction) => {
      validateInteraction(interaction, this.entities, allowUnresolvedTargets);
      const id = interaction.id?.trim() || `interaction-${String(++this.interactionSequence).padStart(3, "0")}`;
      validateStableId(id, "interaction id");
      return {
        ...deepClone(interaction),
        id,
        label: interaction.label?.trim() || id,
        targetIds: uniqueStrings(interaction.targetIds),
        ...(interaction.type === "apply-impulse" ? {
          impulse: sanitizeVector(interaction.impulse, -100000, 100000, "interaction.impulse"),
          ...(interaction.relativePoint ? { relativePoint: sanitizeVector(interaction.relativePoint, -10000, 10000, "interaction.relativePoint") } : {})
        } : {})
      };
    });
    if (new Set(interactions.map((interaction) => interaction.id)).size !== interactions.length) {
      throw new Error("Interaction ids must be unique on an entity");
    }
    return interactions;
  }

  private getEntityState(id: string): AgentWorldEntityState {
    const runtime = this.requireEntity(id);
    const worldPosition = runtime.object.getWorldPosition(new Vector3());
    // The derived surface travels with the config, so an agent reading state() sees the
    // curve the archive maths produced rather than having to re-evaluate it.
    const formulaField = findFormulaField(runtime.object);
    const formulaState = runtime.definition.formula && formulaField
      ? { ...runtime.definition.formula, ...formulaField.describe() }
      : null;
    const dnaSystem = findDnaSystem(runtime.object);
    const dnaState = runtime.definition.dna && dnaSystem
      ? { ...runtime.definition.dna, ...dnaSystem.describe() }
      : null;
    return {
      formula: formulaState,
      dna: dnaState,
      id,
      label: runtime.definition.label,
      type: runtime.definition.type,
      parentId: runtime.definition.parentId,
      position: roundVector(worldPosition),
      rotationDegrees: roundVector(new Vector3(runtime.object.rotation.x, runtime.object.rotation.y, runtime.object.rotation.z).multiplyScalar(180 / Math.PI)),
      scale: roundVector(runtime.object.scale),
      material: deepClone(runtime.definition.material),
      geometry: deepClone(runtime.definition.geometry),
      intensity: runtime.definition.intensity,
      distance: runtime.definition.distance,
      marker: runtime.definition.marker,
      visible: runtime.object.visible,
      castShadow: runtime.definition.castShadow,
      receiveShadow: runtime.definition.receiveShadow,
      ephemeral: runtime.definition.ephemeral,
      ...(runtime.definition.physics?.mode === "trigger" ? { occupants: this.triggerOccupantIds(id) } : {}),
      tags: [...runtime.definition.tags],
      behaviors: runtime.definition.behaviors.map((behavior) => ({ id: behavior.id, type: behavior.type })),
      interactions: runtime.definition.interactions.map((interaction) => ({
        id: interaction.id,
        label: interaction.label,
        type: interaction.type,
        targetIds: [...interaction.targetIds],
        ...(interaction.type === "apply-impulse" ? {
          impulse: [...interaction.impulse] as AgentWorldVector3,
          ...(interaction.relativePoint ? { relativePoint: [...interaction.relativePoint] as AgentWorldVector3 } : {})
        } : {})
      })),
      // Terrain's collider is implied rather than requested, so report it here anyway —
      // an agent asking "can I land on this?" must be able to see the answer in state().
      physics: runtime.body ? (runtime.definition.physics ? {
        mode: runtime.definition.physics.mode,
        mass: runtime.definition.physics.mass,
        material: runtime.definition.physics.material,
        linearVelocity: roundCannonVector(runtime.body.velocity),
        angularVelocity: roundCannonVector(runtime.body.angularVelocity),
        sleeping: runtime.body.sleepState === Body.SLEEPING
      } : {
        mode: "static" as AgentWorldPhysicsMode,
        mass: 0,
        material: "ground" as AgentWorldPhysicsMaterial,
        linearVelocity: [0, 0, 0] as AgentWorldVector3,
        angularVelocity: [0, 0, 0] as AgentWorldVector3,
        sleeping: false
      }) : null,
      path: runtime.definition.path ? { pointCount: runtime.definition.path.points.length, closed: runtime.definition.path.closed } : null,
      asset: runtime.assetState ? deepClone(runtime.assetState) : null,
      agent: runtime.definition.agent ? deepClone(runtime.definition.agent) : null,
      emitter: runtime.definition.emitter
        ? { ...deepClone(runtime.definition.emitter), liveParticles: findParticleSystem(runtime.object)?.activeCount ?? 0 }
        : null,
      sound: runtime.definition.sound ? deepClone(runtime.definition.sound) : null,
      terrain: runtime.definition.terrain ? terrainStateOf(runtime) : null,
      water: runtime.definition.water ? deepClone(runtime.definition.water) : null,
      flock: runtime.definition.flock ? flockStateOf(runtime) : null,
      forceField: runtime.definition.forceField ? this.forceFieldStateOf(runtime) : null
    };
  }

  /**
   * Force-field state: the resolved config plus the live readings from the last step. The
   * readings are what make an inert field visible — `affectedCount: 0` on an enabled field
   * means the radius, tag filter or target set is wrong, which `state()` could not otherwise
   * tell from a field that is working perfectly.
   */
  private forceFieldStateOf(runtime: RuntimeEntity): NonNullable<AgentWorldEntityState["forceField"]> {
    const reading = this.forceFieldReadings.get(runtime.definition.id);
    const visual = findForceFieldVisual(runtime.object);
    return {
      ...deepClone(runtime.definition.forceField!),
      affectedCount: reading?.affected.size ?? 0,
      peakAcceleration: Number((reading?.peak ?? 0).toFixed(3)),
      visualVectors: visual?.visualVectorCount ?? 0
    };
  }

  private requireEntity(id: string): RuntimeEntity {
    const runtime = this.entities.get(id);
    if (!runtime) throw new Error(`Unknown entity: ${id}`);
    return runtime;
  }

  private descendantIds(id: string): string[] {
    this.requireEntity(id);
    const descendants: string[] = [];
    const visit = (parentId: string) => {
      for (const runtime of this.entities.values()) {
        if (runtime.definition.parentId === parentId) {
          descendants.push(runtime.definition.id);
          visit(runtime.definition.id);
        }
      }
    };
    visit(id);
    return descendants;
  }

  private nextPrefabPrefix(prefabId: AgentWorldPrefabId): string {
    let candidate = "";
    do {
      candidate = `prefab-${prefabId}-${String(++this.prefabSequence).padStart(3, "0")}`;
    } while (this.entities.has(candidate));
    return candidate;
  }

  private recordEvent(type: string, message: string, actorId?: string): void {
    this.events.push({ revision: this.revision, timeSeconds: Number(this.elapsedSeconds.toFixed(3)), type, message, ...(actorId ? { actorId } : {}) });
    if (this.events.length > 40) this.events.shift();
  }

  private success<T>(value: T): AgentWorldResult<T> {
    return { ok: true, revision: this.revision, value };
  }

  private failure<T = never>(error: unknown): AgentWorldResult<T> {
    return { ok: false, revision: this.revision, error: error instanceof Error ? error.message : String(error) };
  }
}

function createEntityObject(definition: ResolvedEntity): Object3D {
  if (definition.type === "group") return new Group();
  if (definition.type === "agent") return createAgentAvatar(definition);
  if (definition.type === "model") return new Group();
  if (definition.type === "emitter") {
    const system = new AgentWorldParticleSystem(definition.emitter ?? resolveAgentWorldEmitter(undefined));
    // The update loop finds the system here; the Points object is the entity object itself, so
    // particles inherit the entity transform.
    system.points.userData.graphysxParticleSystem = system;
    return system.points;
  }
  if (definition.type === "sound") {
    // A speaker glyph the author can find and select, exactly the point-light marker's
    // trick: the audio itself is host-side, so without a marker a placed sound would be
    // invisible AND intangible. `agentLightMarker` so `marker:false` hides the glyph
    // while the sound keeps playing.
    const group = new Group();
    const marker = new Mesh(
      new SphereGeometry(0.16, 12, 8),
      new MeshStandardMaterial({ color: definition.material.color, emissive: definition.material.color, emissiveIntensity: 0.7, wireframe: true })
    );
    marker.userData.agentLightMarker = true;
    marker.visible = definition.marker;
    group.add(marker);
    return group;
  }
  if (definition.type === "terrain") {
    const terrain = definition.terrain ?? resolveAgentWorldTerrain(undefined);
    const heights = sampleTerrainHeights(terrain);
    const material = new MeshStandardMaterial();
    applyMaterial(material, definition.material);
    const mesh = new Mesh(createTerrainGeometry(terrain, heights), material);
    // The collider is built from this same array, so cache it on the object rather than
    // resampling the field a second time when the body is made.
    mesh.userData.graphysxTerrainHeights = heights;
    return mesh;
  }
  if (definition.type === "water") {
    const surface = new AgentWorldWaterSurface(definition.water ?? resolveAgentWorldWater(undefined));
    // The update loop and `configure` find the surface here, the same way emitters are found.
    surface.object.userData.graphysxWaterSurface = surface;
    return surface.object;
  }
  if (definition.type === "formula-field") {
    const field = new AgentWorldFormulaField(definition.formula ?? resolveAgentWorldFormula(undefined));
    // Found by `configure` and disposal the same way emitters, water and flocks are.
    field.object.userData.graphysxFormulaField = field;
    return field.object;
  }
  if (definition.type === "dna-tree") {
    const system = new AgentWorldDnaSystem(definition.dna ?? resolveAgentWorldDna(undefined));
    // Found by the update loop, `configure` and disposal the same way flocks are.
    system.object.userData.graphysxDnaSystem = system;
    return system.object;
  }
  if (definition.type === "flock") {
    const system = new AgentWorldFlockSystem(definition.flock ?? resolveAgentWorldFlock(undefined));
    // Found by the update loop and `configure` exactly the way emitters and water are.
    system.object.userData.graphysxFlockSystem = system;
    return system.object;
  }
  if (definition.type === "force-field") {
    const visual = new AgentWorldForceFieldVisual(definition.forceField ?? resolveAgentWorldForceField(undefined));
    // Found by the update loop and `configure` exactly the way emitters, water and flocks are
    // — but this one is only the drawing; the force pass reads `definition.forceField`.
    visual.object.userData.graphysxForceFieldVisual = visual;
    return visual.object;
  }
  if (definition.type === "spline" && definition.path) {
    const curve = createSplineCurve(definition.path);
    const geometry = new BufferGeometry().setFromPoints(curve.getPoints(Math.max(24, definition.path.points.length * 16)));
    return new Line(geometry, new LineBasicMaterial({ color: definition.material.color, transparent: definition.material.opacity < 1, opacity: definition.material.opacity }));
  }
  if (definition.type === "ambient-light") return new AmbientLight(definition.material.color, definition.intensity);
  if (definition.type === "directional-light") {
    const light = new DirectionalLight(definition.material.color, definition.intensity);
    // `castShadow` on a v2 directional light was very nearly a no-op. three defaults a
    // directional light's shadow camera to a ±5 orthographic box with far=500, so a light
    // that opted in only cast inside a 10×10 window at the origin — everything beyond it,
    // including most of the demo world and every materialised level, silently received
    // nothing. The flag looked honoured and wasn't.
    //
    // Sized generously rather than fitted to the scene bounds on purpose: the bounds change
    // on every spawn, and refitting the frustum per edit would make shadow quality flicker
    // while an agent builds. ±38 covers the demo world, the starters and a full 64-cell
    // level at the default 2.6 cell size; larger worlds still clip, which is a documented
    // limit rather than a hidden one.
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.camera.left = -38;
    light.shadow.camera.right = 38;
    light.shadow.camera.top = 38;
    light.shadow.camera.bottom = -38;
    light.shadow.camera.near = 0.5;
    light.shadow.camera.far = 260;
    // Offsetting along the normal rather than a large constant bias keeps small props from
    // detaching from their own shadows.
    light.shadow.normalBias = 0.03;
    light.shadow.bias = -0.0004;
    return light;
  }
  if (definition.type === "point-light") {
    const group = new Group();
    const light = new PointLight(definition.material.color, definition.intensity, definition.distance);
    const marker = new Mesh(
      new SphereGeometry(0.12, 12, 8),
      new MeshStandardMaterial({ color: definition.material.color, emissive: definition.material.emissive, emissiveIntensity: Math.max(1, definition.material.emissiveIntensity) })
    );
    marker.userData.agentLightMarker = true;
    // Kept in the graph even when hidden, so a patch can toggle it without a rebuild.
    marker.visible = definition.marker;
    group.add(light, marker);
    return group;
  }
  const geometry = createGeometry(definition);
  const material = new MeshStandardMaterial();
  applyMaterial(material, definition.material);
  return new Mesh(geometry, material);
}

function createGeometry(definition: ResolvedEntity) {
  const geometry = definition.geometry;
  switch (definition.type) {
    case "box": return new BoxGeometry(geometry.width, geometry.height, geometry.depth);
    case "sphere": return new SphereGeometry(geometry.radius, Math.max(8, geometry.radialSegments), Math.max(6, Math.floor(geometry.radialSegments * 0.65)));
    case "icosahedron": return new IcosahedronGeometry(geometry.radius, Math.min(3, Math.max(0, Math.floor(geometry.radialSegments / 12))));
    case "cylinder": return new CylinderGeometry(geometry.radius, geometry.radius, geometry.height, Math.max(6, geometry.radialSegments));
    case "cone": return new ConeGeometry(geometry.radius, geometry.height, Math.max(5, geometry.radialSegments));
    case "torus": return new TorusGeometry(geometry.radius, geometry.tube, Math.max(6, Math.floor(geometry.radialSegments / 2)), Math.max(12, geometry.radialSegments));
    case "plane": {
      const plane = new PlaneGeometry(geometry.width, geometry.depth);
      plane.rotateX(-Math.PI / 2);
      return plane;
    }
    default: return new BoxGeometry(1, 1, 1);
  }
}

function createAgentAvatar(definition: ResolvedEntity): Group {
  const group = new Group();
  const height = Math.max(0.8, definition.geometry.height);
  const radius = Math.max(0.2, definition.geometry.radius);
  const body = new Mesh(
    new CylinderGeometry(radius * 0.72, radius, height * 0.58, Math.max(8, definition.geometry.radialSegments)),
    new MeshStandardMaterial()
  );
  body.position.y = height * 0.32;
  const head = new Mesh(new SphereGeometry(radius * 0.72, 24, 16), new MeshStandardMaterial());
  head.position.y = height * 0.78;
  const direction = new Mesh(new ConeGeometry(radius * 0.28, radius * 0.7, 10), new MeshStandardMaterial());
  direction.rotation.x = Math.PI / 2;
  direction.position.set(0, height * 0.78, -radius * 0.8);
  direction.userData.graphysxAgentAccent = true;
  const perception = new Mesh(
    new TorusGeometry(Math.min(3, Math.max(0.6, (definition.agent?.perceptionRadius ?? 6) * 0.12)), 0.025, 8, 48),
    new MeshStandardMaterial()
  );
  perception.rotation.x = Math.PI / 2;
  perception.position.y = 0.04;
  perception.userData.graphysxAgentAccent = true;
  group.add(body, head, direction, perception);
  return group;
}

function applyMaterial(material: MeshStandardMaterial, definition: AgentWorldMaterial): void {
  material.color.set(definition.color);
  material.emissive.set(definition.emissive);
  material.emissiveIntensity = definition.emissiveIntensity;
  material.roughness = definition.roughness;
  material.metalness = definition.metalness;
  material.opacity = definition.opacity;
  material.transparent = definition.opacity < 1;
  material.depthWrite = definition.opacity >= 0.5;
  material.wireframe = definition.wireframe;
  material.needsUpdate = true;
  applyAgentTexture(material, definition.texture);
}

const agentTextureLoader = new TextureLoader();
const agentTextureCache = new Map<AgentWorldTextureId, Promise<Texture>>();

function applyAgentTexture(material: MeshStandardMaterial, settings: AgentWorldTexture | null): void {
  const previousAgentTexture = material.userData.graphysxAgentTexture instanceof Texture
    ? material.userData.graphysxAgentTexture as Texture
    : null;
  if (!settings) {
    material.userData.graphysxTextureToken = Symbol("no-agent-texture");
    if (material.userData.graphysxHasOriginalMap === true) {
      material.map = material.userData.graphysxOriginalMap instanceof Texture
        ? material.userData.graphysxOriginalMap as Texture
        : null;
      delete material.userData.graphysxOriginalMap;
      delete material.userData.graphysxHasOriginalMap;
    }
    previousAgentTexture?.dispose();
    delete material.userData.graphysxAgentTexture;
    delete material.userData.graphysxTextureKey;
    material.needsUpdate = true;
    return;
  }

  const resolved = resolveTexture(settings);
  if (!resolved) return;
  const key = JSON.stringify(resolved);
  if (material.userData.graphysxTextureKey === key && previousAgentTexture && material.map === previousAgentTexture) return;
  if (material.userData.graphysxHasOriginalMap !== true) {
    material.userData.graphysxOriginalMap = material.map;
    material.userData.graphysxHasOriginalMap = true;
  }
  const token = Symbol(`agent-texture:${resolved.id}`);
  material.userData.graphysxTextureToken = token;
  void loadAgentTexture(resolved.id).then((baseTexture) => {
    if (material.userData.graphysxTextureToken !== token) return;
    const texture = baseTexture.clone();
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.repeat.set(...(resolved.repeat ?? [1, 1]));
    texture.offset.set(...(resolved.offset ?? [0, 0]));
    texture.center.set(0.5, 0.5);
    texture.rotation = (resolved.rotationDegrees ?? 0) * Math.PI / 180;
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    const oldTexture = material.userData.graphysxAgentTexture instanceof Texture
      ? material.userData.graphysxAgentTexture as Texture
      : null;
    material.map = texture;
    material.userData.graphysxAgentTexture = texture;
    material.userData.graphysxTextureKey = key;
    oldTexture?.dispose();
    material.needsUpdate = true;
  }).catch((error: unknown) => {
    if (material.userData.graphysxTextureToken !== token) return;
    material.userData.graphysxTextureError = error instanceof Error ? error.message : String(error);
  });
}

function loadAgentTexture(id: AgentWorldTextureId): Promise<Texture> {
  const cached = agentTextureCache.get(id);
  if (cached) return cached;
  const descriptor = findAgentWorldTexture(id);
  if (!descriptor) return Promise.reject(new Error(`Unknown GraphysX texture: ${id}`));
  const pending = agentTextureLoader.loadAsync(descriptor.url).then((texture) => {
    texture.name = `GraphysXTexture:${id}`;
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    return texture;
  });
  agentTextureCache.set(id, pending);
  return pending;
}

function resolveAgentProfile(source: AgentWorldAgentProfile = {}, base?: Required<AgentWorldAgentProfile>): Required<AgentWorldAgentProfile> {
  const role = (source.role ?? base?.role ?? "world participant").trim();
  const status = (source.status ?? base?.status ?? "ready").trim();
  if (!role || role.length > 80) throw new Error("Agent role must contain 1 to 80 characters");
  if (!status || status.length > 80) throw new Error("Agent status must contain 1 to 80 characters");
  return {
    role,
    status,
    perceptionRadius: clamp(source.perceptionRadius ?? base?.perceptionRadius ?? 6, 0, 10000),
    capabilities: uniqueStrings(source.capabilities ?? base?.capabilities ?? [])
  };
}

function resolveMaterial(source?: Partial<AgentWorldMaterial>, base: AgentWorldMaterial = DEFAULT_MATERIAL): AgentWorldMaterial {
  return {
    color: source?.color ?? base.color,
    emissive: source?.emissive ?? base.emissive,
    emissiveIntensity: clamp(source?.emissiveIntensity ?? base.emissiveIntensity, 0, 100),
    roughness: clamp(source?.roughness ?? base.roughness, 0, 1),
    metalness: clamp(source?.metalness ?? base.metalness, 0, 1),
    opacity: clamp(source?.opacity ?? base.opacity, 0, 1),
    wireframe: source?.wireframe ?? base.wireframe,
    texture: source?.texture === undefined ? deepClone(base.texture) : resolveTexture(source.texture)
  };
}

function resolveTexture(source: AgentWorldTexture | null): AgentWorldTexture | null {
  if (source === null) return null;
  const descriptor = findAgentWorldTexture(source.id);
  if (!descriptor) throw new Error(`Unknown GraphysX texture: ${String(source.id)}`);
  return {
    id: descriptor.id as AgentWorldTextureId,
    repeat: sanitizeVector2(source.repeat ?? [...descriptor.defaultRepeat], 0.01, 128, "material.texture.repeat"),
    offset: sanitizeVector2(source.offset ?? [0, 0], -128, 128, "material.texture.offset"),
    rotationDegrees: clamp(source.rotationDegrees ?? 0, -360000, 360000)
  };
}

function resolveEnvironment(source?: AgentWorldDefinition["environment"]): AgentWorldEnvironment {
  const sky = source?.sky ?? DEFAULT_ENVIRONMENT.sky;
  if (sky !== null && !resolveAgentWorldSky(sky)) {
    // Lists imports too: with a store running, "use one of <curated six>" would be a lie
    // that sends the reader looking for a typo in an id that is genuinely registered.
    throw new Error(`Unknown sky: ${sky}. Use one of ${allAgentWorldSkies().map((s) => s.id).join(", ")}`);
  }
  const overlay = source?.overlay ?? DEFAULT_ENVIRONMENT.overlay;
  if (overlay !== null && !isOverlayId(overlay)) {
    throw new Error(`Unknown overlay: ${overlay}. Use one of ${GRAPHYSX_AGENT_WORLD_OVERLAYS.map((o) => o.id).join(", ")}`);
  }
  return {
    background: source?.background ?? DEFAULT_ENVIRONMENT.background,
    sky,
    envelope: resolveEnvelope(source?.envelope),
    overlay,
    ground: { ...DEFAULT_ENVIRONMENT.ground, ...(source?.ground ?? {}) },
    physics: {
      gravity: sanitizeVector(source?.physics?.gravity ?? DEFAULT_ENVIRONMENT.physics.gravity, -1000, 1000, "physics.gravity")
    }
  };
}

function resolveEnvelope(source: AgentWorldEnvironment["envelope"] | undefined): AgentWorldEnvelope | null {
  if (source === null || source === undefined) return DEFAULT_ENVIRONMENT.envelope;
  if (typeof source !== "object") throw new Error("environment.envelope must be an object or null");
  const entries = [["fogNear", source.fogNear], ["fogFar", source.fogFar], ["cameraFar", source.cameraFar]] as const;
  for (const [label, value] of entries) {
    if (!Number.isFinite(value) || value < 0 || value > 100000) throw new Error(`envelope.${label} must be a finite number between 0 and 100000`);
  }
  if (source.fogFar <= source.fogNear) throw new Error("envelope.fogFar must be greater than envelope.fogNear");
  if (source.cameraFar <= source.fogNear) throw new Error("envelope.cameraFar must be greater than envelope.fogNear");
  return { fogNear: source.fogNear, fogFar: source.fogFar, cameraFar: source.cameraFar };
}

function mergeTransform(base: AgentWorldTransform, patch: Partial<AgentWorldTransform>): AgentWorldTransform {
  return {
    position: sanitizeVector(patch.position ?? base.position, -10000, 10000, "position"),
    rotationDegrees: sanitizeVector(patch.rotationDegrees ?? base.rotationDegrees, -360000, 360000, "rotationDegrees"),
    scale: sanitizeVector(patch.scale ?? base.scale, 0.001, 1000, "scale")
  };
}

function sanitizeVector(value: AgentWorldVector3, minimum: number, maximum: number, label: string): AgentWorldVector3 {
  if (!Array.isArray(value) || value.length !== 3 || value.some((component) => !Number.isFinite(component))) throw new Error(`${label} must contain three finite numbers`);
  return value.map((component) => clamp(component, minimum, maximum)) as AgentWorldVector3;
}

function sanitizeVector2(value: AgentWorldVector2, minimum: number, maximum: number, label: string): AgentWorldVector2 {
  if (!Array.isArray(value) || value.length !== 2 || value.some((component) => !Number.isFinite(component))) throw new Error(`${label} must contain two finite numbers`);
  return value.map((component) => clamp(component, minimum, maximum)) as AgentWorldVector2;
}

function resolveSplinePath(type: AgentWorldEntityType, source?: AgentWorldSplinePath): Required<AgentWorldSplinePath> | null {
  if (type !== "spline") {
    if (source) throw new Error("Only spline entities accept a path");
    return null;
  }
  if (!source || !Array.isArray(source.points) || source.points.length < 2) throw new Error("A spline requires at least two points");
  if (source.points.length > 256) throw new Error("A spline supports at most 256 points");
  const tension = source.tension ?? 0.5;
  if (!Number.isFinite(tension) || tension < 0 || tension > 1) throw new Error("Spline tension must be between 0 and 1");
  return {
    points: source.points.map((point, index) => sanitizeVector(point, -10000, 10000, `path.points[${index}]`)),
    closed: source.closed ?? false,
    tension
  };
}

function createSplineCurve(path: Required<AgentWorldSplinePath>): CatmullRomCurve3 {
  return new CatmullRomCurve3(path.points.map((point) => new Vector3(...point)), path.closed, "catmullrom", path.tension);
}

function resolvePhysics(
  source: AgentWorldPhysics,
  entityType: AgentWorldEntityType,
  parentId: string | null,
  behaviors: AgentWorldBehavior[]
): ResolvedAgentWorldPhysics {
  if (!source || !["static", "dynamic", "kinematic", "trigger"].includes(source.mode)) throw new Error(`Unsupported physics mode: ${String(source?.mode)}`);
  // Terrain owns a heightfield collider it builds itself; water deliberately has none.
  if (["group", "spline", "emitter", "sound", "terrain", "water", "flock", "force-field", "formula-field", "dna-tree", "ambient-light", "directional-light", "point-light"].includes(entityType)) throw new Error(`Entity type cannot have physics: ${entityType}`);
  if (entityType === "plane" && source.mode === "dynamic") throw new Error("Plane physics can only be static or kinematic");
  if (parentId) throw new Error("Physics entities must be spawned at the world root");
  // A trigger never responds to contact, so a behavior moving it cannot fight the solver.
  // Letting a checkpoint bob or orbit is the whole point of a moving gate.
  if (source.mode !== "kinematic" && source.mode !== "trigger" && behaviors.some(isMotionBehavior)) {
    throw new Error("Transform behaviors require kinematic physics");
  }
  const material = source.material ?? "default";
  const presets: Record<AgentWorldPhysicsMaterial, { friction: number; restitution: number }> = {
    default: { friction: 0.18, restitution: 0.28 },
    wall: { friction: 0.32, restitution: 0.08 },
    finish: { friction: 0.16, restitution: 0.2 },
    ground: { friction: 0.45, restitution: 0.05 },
    ball: { friction: 0.12, restitution: 0.68 },
    human: { friction: 0.5, restitution: 0.02 }
  };
  if (!(material in presets)) throw new Error(`Unsupported physics material: ${String(material)}`);
  const requestedMass = source.mass ?? 1;
  if (!Number.isFinite(requestedMass) || requestedMass < 0 || requestedMass > 100000) throw new Error("Physics mass must be between 0 and 100000");
  return {
    mode: source.mode,
    mass: source.mode === "dynamic" ? Math.max(0.001, requestedMass) : 0,
    material,
    friction: clamp(source.friction ?? presets[material].friction, 0, 1),
    restitution: clamp(source.restitution ?? presets[material].restitution, 0, 1),
    linearVelocity: sanitizeVector(source.linearVelocity ?? [0, 0, 0], -10000, 10000, "physics.linearVelocity"),
    angularVelocity: sanitizeVector(source.angularVelocity ?? [0, 0, 0], -10000, 10000, "physics.angularVelocity")
  };
}

function isMotionBehavior(behavior: AgentWorldBehavior): boolean {
  return ["spin", "bob", "orbit", "pulse", "look-at", "follow-spline"].includes(behavior.type);
}

function createPhysicsBody(definition: ResolvedEntity): Body {
  const physics = definition.physics!;
  const material = new CannonMaterial({ friction: physics.friction, restitution: physics.restitution });
  material.name = `graphysx-${definition.id}-${physics.material}`;
  const body = new Body({
    mass: physics.mass,
    material,
    linearDamping: physics.mode === "dynamic" ? 0.08 : 0,
    angularDamping: physics.mode === "dynamic" ? 0.08 : 0,
    // A trigger is detected but never resolved: contacts are reported and then discarded,
    // so a ball rolls through a checkpoint instead of bouncing off it.
    isTrigger: physics.mode === "trigger",
    // Triggers must keep testing contacts even when nothing has moved for a while, and a
    // sleeping body stops generating them — a checkpoint that nods off stops counting.
    ...(physics.mode === "trigger" ? { type: Body.KINEMATIC, allowSleep: false } : {})
  });
  const scale = definition.transform.scale.map((value) => Math.abs(value)) as AgentWorldVector3;
  const geometry = definition.geometry;
  const shapeOrientation = new CannonQuaternion();
  shapeOrientation.setFromEuler(-Math.PI / 2, 0, 0);
  if (definition.type === "sphere" || definition.type === "icosahedron") {
    body.addShape(new CannonSphere(Math.max(0.001, geometry.radius * Math.max(...scale))));
  } else if (definition.type === "cylinder" || definition.type === "cone") {
    const radius = Math.max(0.001, geometry.radius * Math.max(scale[0], scale[2]));
    const height = Math.max(0.001, geometry.height * scale[1]);
    body.addShape(new CannonCylinder(definition.type === "cone" ? 0.001 : radius, radius, height, Math.max(6, geometry.radialSegments)), new Vec3(), shapeOrientation);
  } else if (definition.type === "plane") {
    body.addShape(new CannonPlane(), new Vec3(), shapeOrientation);
  } else {
    const torusDiameter = (geometry.radius + geometry.tube) * 2;
    const dimensions = definition.type === "torus"
      ? [torusDiameter, geometry.tube * 2, torusDiameter] as AgentWorldVector3
      : [geometry.width, geometry.height, geometry.depth] as AgentWorldVector3;
    body.addShape(new CannonBox(new Vec3(
      Math.max(0.001, dimensions[0] * scale[0] / 2),
      Math.max(0.001, dimensions[1] * scale[1] / 2),
      Math.max(0.001, dimensions[2] * scale[2] / 2)
    )));
  }
  body.position.set(...definition.transform.position);
  body.quaternion.setFromEuler(...definition.transform.rotationDegrees.map((value) => value * Math.PI / 180) as AgentWorldVector3);
  body.velocity.set(...physics.linearVelocity);
  body.angularVelocity.set(...physics.angularVelocity);
  if (physics.mode === "kinematic") body.type = Body.KINEMATIC;
  if (physics.mode === "static") body.type = Body.STATIC;
  body.updateMassProperties();
  return body;
}

/**
 * The static heightfield collider for a terrain entity.
 *
 * Heights come off the mesh object rather than being resampled, so the collider is provably
 * the surface that was drawn. Terrain is always static and always uses the `ground` friction
 * preset — a rolling ball should slow on soil, not skate.
 */
function createTerrainBody(definition: ResolvedEntity, object: Object3D): Body | null {
  const terrain = definition.terrain;
  if (!terrain) return null;
  const cached = object.userData.graphysxTerrainHeights;
  const heights = cached instanceof Float32Array ? cached : sampleTerrainHeights(terrain);
  const { shape, offset, orientation } = createTerrainHeightfield(terrain, heights);
  const material = new CannonMaterial({ friction: 0.45, restitution: 0.05 });
  material.name = `graphysx-${definition.id}-terrain`;
  const body = new Body({ mass: 0, material, type: Body.STATIC });
  body.addShape(shape, offset, orientation);
  body.position.set(...definition.transform.position);
  body.quaternion.setFromEuler(...definition.transform.rotationDegrees.map((value) => value * Math.PI / 180) as AgentWorldVector3);
  body.updateMassProperties();
  return body;
}

function syncObjectToBody(object: Object3D, body: Body): void {
  body.position.set(object.position.x, object.position.y, object.position.z);
  body.quaternion.set(object.quaternion.x, object.quaternion.y, object.quaternion.z, object.quaternion.w);
  body.aabbNeedsUpdate = true;
  body.wakeUp();
}

/**
 * Terrain as an agent sees it: the configuration, plus the derived facts that answer
 * "where is the ground here?" without needing to raycast — the achieved height range and
 * the collider's vertex count, so the cost is visible too.
 */
/**
 * Flock state is configuration plus a live reading. Reporting only the configuration would
 * make a frozen flock indistinguishable from a flying one in `state()`, which is the same
 * mistake the old terrain entity made about its missing collider.
 */
function flockStateOf(runtime: RuntimeEntity): NonNullable<AgentWorldEntityState["flock"]> {
  const system = findFlockSystem(runtime.object);
  return {
    ...deepClone(runtime.definition.flock!),
    memberCount: system?.memberCount ?? 0,
    leadPosition: system?.leadPosition ?? [0, 0, 0],
    averageSpeed: system?.averageSpeed ?? 0
  };
}

function terrainStateOf(runtime: RuntimeEntity): NonNullable<AgentWorldEntityState["terrain"]> {
  const terrain = runtime.definition.terrain!;
  const cached = runtime.object.userData.graphysxTerrainHeights;
  const heights = cached instanceof Float32Array ? cached : sampleTerrainHeights(terrain);
  let minimumHeight = Infinity;
  let maximumHeight = -Infinity;
  for (const height of heights) {
    if (height < minimumHeight) minimumHeight = height;
    if (height > maximumHeight) maximumHeight = height;
  }
  return {
    ...deepClone(terrain),
    minimumHeight: Number(minimumHeight.toFixed(3)),
    maximumHeight: Number(maximumHeight.toFixed(3)),
    colliderVertices: heights.length
  };
}

/** Re-displace a terrain mesh in place after its configuration was patched. */
function rebuildTerrainMesh(runtime: RuntimeEntity): void {
  const terrain = runtime.definition.terrain;
  if (!terrain || !(runtime.object instanceof Mesh)) return;
  const heights = sampleTerrainHeights(terrain);
  runtime.object.geometry.dispose();
  runtime.object.geometry = createTerrainGeometry(terrain, heights);
  runtime.object.userData.graphysxTerrainHeights = heights;
}

function syncBodyToObject(body: Body, object: Object3D): void {
  object.position.set(body.position.x, body.position.y, body.position.z);
  object.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
}

function validateWorldDefinition(definition: AgentWorldDefinition): void {
  if (!definition || definition.schema !== GRAPHYSX_AGENT_WORLD_SCHEMA) throw new Error(`World schema must be ${GRAPHYSX_AGENT_WORLD_SCHEMA}`);
  if (!definition.id?.trim() || !definition.label?.trim()) throw new Error("World id and label are required");
  if (!Array.isArray(definition.entities)) throw new Error("World entities must be an array");
}

function resolveActor(actor?: AgentWorldActor): Required<AgentWorldActor> {
  if (!actor?.id?.trim()) throw new Error("A collaborative change set requires an actor id");
  const id = actor.id.trim();
  validateStableId(id, "actor id");
  const label = actor.label?.trim() || id;
  if (label.length > 80) throw new Error("Actor label must be 80 characters or fewer");
  const kind = actor.kind ?? "agent";
  if (!(["agent", "human", "system"] as const).includes(kind)) throw new Error(`Unsupported actor kind: ${String(kind)}`);
  return { id, label, kind };
}

function validateStableId(id: string, label: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/.test(id)) throw new Error(`Invalid ${label}: ${id}`);
}

function validateBehavior(behavior: AgentWorldBehavior, entities: Map<string, RuntimeEntity>, allowUnresolvedLookAt = false): void {
  if (!behavior || !["spin", "bob", "orbit", "pulse", "look-at", "follow-spline"].includes(behavior.type)) throw new Error(`Unsupported behavior: ${String(behavior?.type)}`);
  if (behavior.type === "look-at" && !allowUnresolvedLookAt && !entities.has(behavior.targetId)) throw new Error(`Unknown look-at target: ${behavior.targetId}`);
  if (behavior.type === "follow-spline") {
    validateStableId(behavior.splineId, "spline id");
    const spline = entities.get(behavior.splineId);
    if (!allowUnresolvedLookAt && !spline) throw new Error(`Unknown spline: ${behavior.splineId}`);
    if (spline && spline.definition.type !== "spline") throw new Error(`follow-spline target is not a spline: ${behavior.splineId}`);
  }
}

function validateInteraction(interaction: AgentWorldInteraction, entities: Map<string, RuntimeEntity>, allowUnresolvedTargets = false): void {
  if (!interaction || !["toggle-visibility", "apply-impulse"].includes(interaction.type)) throw new Error(`Unsupported interaction: ${String(interaction?.type)}`);
  if (!Array.isArray(interaction.targetIds) || interaction.targetIds.length === 0) throw new Error(`${interaction.type} requires at least one target id`);
  if (interaction.targetIds.length > 32) throw new Error("An interaction can target at most 32 entities");
  for (const targetId of interaction.targetIds) {
    if (typeof targetId !== "string") throw new Error("Interaction target ids must be strings");
    validateStableId(targetId, "interaction target id");
    if (!allowUnresolvedTargets && !entities.has(targetId)) throw new Error(`Unknown interaction target: ${targetId}`);
    if (!allowUnresolvedTargets && interaction.type === "apply-impulse" && entities.get(targetId)?.definition.physics?.mode !== "dynamic") throw new Error(`apply-impulse target must be dynamic: ${targetId}`);
  }
  if (interaction.type === "apply-impulse") {
    sanitizeVector(interaction.impulse, -100000, 100000, "interaction.impulse");
    if (interaction.relativePoint) sanitizeVector(interaction.relativePoint, -10000, 10000, "interaction.relativePoint");
  }
  if ((interaction.label?.trim().length ?? 0) > 80) throw new Error("Interaction label must be 80 characters or fewer");
}

function isEntityType(value: unknown): value is AgentWorldEntityType {
  return ["group", "agent", "box", "sphere", "icosahedron", "cylinder", "cone", "torus", "plane", "spline", "model", "emitter", "terrain", "water", "flock", "force-field", "formula-field", "dna-tree", "sound", "ambient-light", "directional-light", "point-light"].includes(String(value));
}

function serializeEntity(definition: ResolvedEntity): AgentWorldEntityDefinition {
  return {
    // Carried explicitly: a formula field that does not serialise would round-trip into an
    // empty plot, which is the failure the write-only-state sweep exists to catch.
    ...(definition.formula ? { formula: deepClone(definition.formula) } : {}),
    // Same reason: a dna-tree without its genome would round-trip into the default grove.
    ...(definition.dna ? { dna: deepClone(definition.dna) } : {}),
    id: definition.id,
    label: definition.label,
    type: definition.type,
    ...(definition.parentId ? { parentId: definition.parentId } : {}),
    transform: deepClone(definition.transform),
    material: deepClone(definition.material),
    geometry: deepClone(definition.geometry),
    ...(definition.path ? { path: deepClone(definition.path) } : {}),
    ...(definition.asset ? {
      asset: {
        ...(definition.asset.id ? { id: definition.asset.id } : {}),
        url: definition.asset.url,
        format: definition.asset.format,
        fitSize: definition.asset.fitSize
      }
    } : {}),
    ...(definition.agent ? { agent: deepClone(definition.agent) } : {}),
    ...(definition.emitter ? { emitter: deepClone(definition.emitter) } : {}),
    ...(definition.sound ? { sound: deepClone(definition.sound) } : {}),
    // Inline heights round-trip as-is; a registry-backed terrain exports only the id, so a
    // scene file stays small and keeps naming its provenance rather than inlining a copy.
    ...(definition.terrain ? { terrain: deepClone(definition.terrain) } : {}),
    ...(definition.water ? { water: deepClone(definition.water) } : {}),
    ...(definition.flock ? { flock: deepClone(definition.flock) } : {}),
    ...(definition.forceField ? { forceField: deepClone(definition.forceField) } : {}),
    ...(definition.physics ? { physics: deepClone(definition.physics) } : {}),
    intensity: definition.intensity,
    distance: definition.distance,
    // Only emitted when false, so ordinary authored documents stay unchanged.
    ...(definition.marker === false ? { marker: false } : {}),
    visible: definition.visible,
    castShadow: definition.castShadow,
    receiveShadow: definition.receiveShadow,
    // Only emitted when true, so ordinary authored documents stay unchanged.
    ...(definition.ephemeral ? { ephemeral: true } : {}),
    tags: [...definition.tags],
    behaviors: deepClone(definition.behaviors),
    interactions: deepClone(definition.interactions)
  };
}

function roundVector(vector: Vector3): AgentWorldVector3 {
  return [Number(vector.x.toFixed(3)), Number(vector.y.toFixed(3)), Number(vector.z.toFixed(3))];
}

function roundCannonVector(vector: Vec3): AgentWorldVector3 {
  return [Number(vector.x.toFixed(3)), Number(vector.y.toFixed(3)), Number(vector.z.toFixed(3))];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, 32);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function findParticleSystem(object: Object3D): AgentWorldParticleSystem | null {
  const system = object.userData.graphysxParticleSystem;
  return system instanceof AgentWorldParticleSystem ? system : null;
}

function disposeObjectTree(root: Object3D): void {
  root.userData.graphysxDisposed = true;
  root.traverse((child) => {
    const particles = findParticleSystem(child);
    if (particles) {
      particles.dispose();
      return;
    }
    const water = findWaterSurface(child);
    if (water) {
      water.dispose();
      return;
    }
    const flock = findFlockSystem(child);
    if (flock) {
      flock.dispose();
      return;
    }
    const dna = findDnaSystem(child);
    if (dna) {
      dna.dispose();
      return;
    }
    const field = findForceFieldVisual(child);
    if (field) {
      field.dispose();
      return;
    }
    if (!(child instanceof Mesh) && !(child instanceof Line)) return;
    child.geometry?.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      if (material.userData.graphysxAgentTexture instanceof Texture) {
        (material.userData.graphysxAgentTexture as Texture).dispose();
      }
      if (material instanceof MeshPhongMaterial) material.map?.dispose();
      material.dispose();
    });
  });
}
