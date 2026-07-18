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
  GRAPHYSX_AGENT_WORLD_SKIES,
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

export type AgentWorldPhysicsMode = "static" | "dynamic" | "kinematic";
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
  agent?: AgentWorldAgentProfile;
  physics?: AgentWorldPhysics;
  intensity?: number;
  distance?: number;
  visible?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
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
  tags?: string[];
  intensity?: number;
  distance?: number;
  physics?: Partial<AgentWorldPhysics> | null;
  agent?: AgentWorldAgentProfile;
  /** Patch the emitter of an `emitter` entity. Merged over the current configuration. */
  emitter?: AgentWorldEmitter;
  interactions?: AgentWorldInteraction[];
};

export type AgentWorldEnvironment = {
  background: string;
  /**
   * Per-scene skybox selection, or null for the flat background colour. Scoped to the
   * scene by design — there is deliberately no global sky (see PRODUCT_SPEC section 11).
   */
  sky: AgentWorldSkyId | null;
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
  visible: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
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
  assets(): readonly AgentWorldAssetDescriptor[];
  textures(): readonly AgentWorldTextureDescriptor[];
  /** The curated per-scene skybox sets recovered from the archive. */
  skies(): readonly AgentWorldSkyDescriptor[];
  /** The curated particle-emitter presets decoded from the TV3D archive library. */
  emitters(): readonly AgentWorldEmitterDescriptor[];
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
  undo(): AgentWorldResult<AgentWorldState>;
  select(ids: string[]): string[];
  query(query?: AgentWorldQuery): AgentWorldEntityState[];
  observe(query?: AgentWorldQuery): AgentWorldObservation | null;
  pause(paused: boolean): AgentWorldResult<boolean>;
  step(seconds?: number): AgentWorldResult<number>;
  export(): AgentWorldDefinition | null;
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
  physics: ResolvedAgentWorldPhysics | null;
  intensity: number;
  distance: number;
  visible: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
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

  listSkies(): readonly AgentWorldSkyDescriptor[] {
    return deepClone(GRAPHYSX_AGENT_WORLD_SKIES);
  }

  /** The archive particle-emitter presets, as scene vocabulary. */
  listEmitters(): readonly AgentWorldEmitterDescriptor[] {
    return deepClone(GRAPHYSX_AGENT_WORLD_EMITTERS) as AgentWorldEmitterDescriptor[];
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

  exportDefinition(): AgentWorldDefinition {
    return {
      schema: GRAPHYSX_AGENT_WORLD_SCHEMA,
      id: this.definition.id,
      label: this.definition.label,
      environment: deepClone(this.environment),
      entities: [...this.entities.values()].map(({ definition }) => serializeEntity(definition))
    };
  }

  save(name: string): AgentWorldResult<string> {
    const safeName = name.trim();
    if (!safeName) return this.failure("Snapshot name cannot be empty");
    const definition = this.exportDefinition();
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
    if (patch.tags) definition.tags = uniqueStrings(patch.tags);
    if (patch.intensity !== undefined) definition.intensity = clamp(patch.intensity, 0, 100);
    if (patch.distance !== undefined) definition.distance = clamp(patch.distance, 0, 1000);
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
    if (patch.interactions) definition.interactions = this.resolveInteractions(patch.interactions);
    this.applyResolvedEntity(runtime);
    if (patch.transform || patch.physics !== undefined || patch.parentId !== undefined) this.rebuildPhysicsBody(runtime);
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
  }

  private attachBehaviorInternal(id: string, behavior: AgentWorldBehavior): string {
    const runtime = this.requireEntity(id);
    validateBehavior(behavior, this.entities);
    if (runtime.definition.physics && runtime.definition.physics.mode !== "kinematic" && isMotionBehavior(behavior)) {
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
      if (runtime.definition.physics?.mode === "kinematic" && runtime.body) syncObjectToBody(runtime.object, runtime.body);
    }
    if (deltaSeconds > 0) this.physicsWorld.step(1 / 60, deltaSeconds, 4);
    for (const runtime of this.entities.values()) {
      if (runtime.definition.physics?.mode === "dynamic" && runtime.body) syncBodyToObject(runtime.body, runtime.object);
    }
    // Emitters tick inside updateSimulation, so they inherit pause/step for free.
    for (const runtime of this.entities.values()) {
      const particles = findParticleSystem(runtime.object);
      if (particles) particles.update(deltaSeconds);
    }
    for (const runtime of this.entities.values()) {
      for (const behavior of runtime.definition.behaviors) {
        if (behavior.type === "look-at") {
          const target = this.entities.get(behavior.targetId);
          if (target) runtime.object.lookAt(target.object.getWorldPosition(new Vector3()));
        }
      }
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

  private rebuildPhysicsBody(runtime: RuntimeEntity): void {
    if (runtime.body) this.physicsWorld.removeBody(runtime.body);
    runtime.body = runtime.definition.physics ? createPhysicsBody(runtime.definition) : null;
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
    object.position.set(...definition.transform.position);
    object.rotation.set(...definition.transform.rotationDegrees.map((value) => value * Math.PI / 180) as AgentWorldVector3);
    object.scale.set(...definition.transform.scale);
    object.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = definition.castShadow;
        child.receiveShadow = definition.receiveShadow;
        if (child.material instanceof MeshStandardMaterial) {
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
    const physics = source.physics ? resolvePhysics(source.physics, source.type, source.parentId ?? null, behaviors) : null;
    return {
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
      physics,
      intensity: clamp(source.intensity ?? 1, 0, 100),
      distance: clamp(source.distance ?? 0, 0, 1000),
      visible: source.visible ?? true,
      castShadow: source.castShadow ?? true,
      receiveShadow: source.receiveShadow ?? true,
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
    return {
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
      visible: runtime.object.visible,
      castShadow: runtime.definition.castShadow,
      receiveShadow: runtime.definition.receiveShadow,
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
      physics: runtime.definition.physics && runtime.body ? {
        mode: runtime.definition.physics.mode,
        mass: runtime.definition.physics.mass,
        material: runtime.definition.physics.material,
        linearVelocity: roundCannonVector(runtime.body.velocity),
        angularVelocity: roundCannonVector(runtime.body.angularVelocity),
        sleeping: runtime.body.sleepState === Body.SLEEPING
      } : null,
      path: runtime.definition.path ? { pointCount: runtime.definition.path.points.length, closed: runtime.definition.path.closed } : null,
      asset: runtime.assetState ? deepClone(runtime.assetState) : null,
      agent: runtime.definition.agent ? deepClone(runtime.definition.agent) : null,
      emitter: runtime.definition.emitter
        ? { ...deepClone(runtime.definition.emitter), liveParticles: findParticleSystem(runtime.object)?.activeCount ?? 0 }
        : null
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
  if (definition.type === "spline" && definition.path) {
    const curve = createSplineCurve(definition.path);
    const geometry = new BufferGeometry().setFromPoints(curve.getPoints(Math.max(24, definition.path.points.length * 16)));
    return new Line(geometry, new LineBasicMaterial({ color: definition.material.color, transparent: definition.material.opacity < 1, opacity: definition.material.opacity }));
  }
  if (definition.type === "ambient-light") return new AmbientLight(definition.material.color, definition.intensity);
  if (definition.type === "directional-light") return new DirectionalLight(definition.material.color, definition.intensity);
  if (definition.type === "point-light") {
    const group = new Group();
    const light = new PointLight(definition.material.color, definition.intensity, definition.distance);
    const marker = new Mesh(
      new SphereGeometry(0.12, 12, 8),
      new MeshStandardMaterial({ color: definition.material.color, emissive: definition.material.emissive, emissiveIntensity: Math.max(1, definition.material.emissiveIntensity) })
    );
    marker.userData.agentLightMarker = true;
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
    throw new Error(`Unknown sky: ${sky}. Use one of ${GRAPHYSX_AGENT_WORLD_SKIES.map((s) => s.id).join(", ")}`);
  }
  return {
    background: source?.background ?? DEFAULT_ENVIRONMENT.background,
    sky,
    ground: { ...DEFAULT_ENVIRONMENT.ground, ...(source?.ground ?? {}) },
    physics: {
      gravity: sanitizeVector(source?.physics?.gravity ?? DEFAULT_ENVIRONMENT.physics.gravity, -1000, 1000, "physics.gravity")
    }
  };
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
  if (!source || !["static", "dynamic", "kinematic"].includes(source.mode)) throw new Error(`Unsupported physics mode: ${String(source?.mode)}`);
  if (["group", "spline", "ambient-light", "directional-light", "point-light"].includes(entityType)) throw new Error(`Entity type cannot have physics: ${entityType}`);
  if (entityType === "plane" && source.mode === "dynamic") throw new Error("Plane physics can only be static or kinematic");
  if (parentId) throw new Error("Physics entities must be spawned at the world root");
  if (source.mode !== "kinematic" && behaviors.some(isMotionBehavior)) throw new Error("Transform behaviors require kinematic physics");
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
    angularDamping: physics.mode === "dynamic" ? 0.08 : 0
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

function syncObjectToBody(object: Object3D, body: Body): void {
  body.position.set(object.position.x, object.position.y, object.position.z);
  body.quaternion.set(object.quaternion.x, object.quaternion.y, object.quaternion.z, object.quaternion.w);
  body.aabbNeedsUpdate = true;
  body.wakeUp();
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
  return ["group", "agent", "box", "sphere", "icosahedron", "cylinder", "cone", "torus", "plane", "spline", "model", "emitter", "ambient-light", "directional-light", "point-light"].includes(String(value));
}

function serializeEntity(definition: ResolvedEntity): AgentWorldEntityDefinition {
  return {
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
    ...(definition.physics ? { physics: deepClone(definition.physics) } : {}),
    intensity: definition.intensity,
    distance: definition.distance,
    visible: definition.visible,
    castShadow: definition.castShadow,
    receiveShadow: definition.receiveShadow,
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
