import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  Group,
  LoadingManager,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  RepeatWrapping,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Texture,
  TextureLoader
} from "three";
import suzanne2Json from "./legacy/suzanne2-ascii-scene.json";

type Tuple3 = readonly [number, number, number];
type Tuple4 = readonly [number, number, number, number];
type LoadStatus = "loading" | "ready" | "error" | "disposed";

type WallCell = {
  symbol: "#" | "Z" | "z";
  x: number;
  z: number;
  position: Tuple3;
};

type ChainCell = {
  symbol: "c";
  x: number;
  z: number;
  basePosition: Tuple3;
  linkPositions: readonly [Tuple3, Tuple3];
};

type RingCell = {
  symbol: "R";
  x: number;
  z: number;
  position: Tuple3;
  radius: number;
  rotatesDegreesPerElapsedMillisecond: number;
};

type EffectEmitter = {
  color: Tuple4;
  particleCapacity: number;
};

type EffectCell = {
  symbol: "s";
  x: number;
  z: number;
  position: Tuple3;
  emitters: readonly [EffectEmitter, EffectEmitter];
};

type PistonCell = {
  symbol: "0" | "3" | "6" | "9";
  x: number;
  z: number;
  position: Tuple3;
  rotationDegrees: Tuple3;
  barScale: Tuple3;
  plateScale: Tuple3;
  triggerScale: Tuple3;
  linearLimits: readonly [number, number];
};

type LapMarkerCell = {
  symbol: "F" | "f" | "H" | "h";
  x: number;
  z: number;
  position: Tuple3;
  gate: "finish" | "halfway";
  color: "red" | "blue";
  scale: Tuple3;
};

type DirectXMaterial = {
  name: string;
  color: Tuple4;
  specularPower: number;
  specular: Tuple3;
  emissive: Tuple3;
  texture: string | null;
};

type DirectXMesh = {
  name: string;
  positions: number[];
  uvs: number[] | null;
  indices: number[];
  groups: Array<{ start: number; count: number; materialIndex: number }>;
  materials: DirectXMaterial[];
  vertexCount: number;
  faceCount: number;
  triangleCount: number;
};

type DirectXAsset = {
  id: string;
  source: { path: string; sha256: string; bytes: number };
  bounds: { min: Tuple3; max: Tuple3 };
  meshCount: number;
  vertexCount: number;
  faceCount: number;
  triangleCount: number;
  animation: {
    present: boolean;
    setNames: string[];
    targets: string[];
    tracks: number;
    keysPerTrack: number;
    ticksPerSecond: number;
    lastAuthoredTick: number;
  };
  meshes: DirectXMesh[];
};

type XmlObject = {
  name: string;
  type: number;
  typeName: string;
  geometry: number;
  geometryName: string;
  enabled: boolean;
  mass: number;
  meshControlled: boolean;
  newtonMaterial: number;
  position: Tuple3;
  scale: Tuple3;
  mesh: string;
  texture: string;
};

type Suzanne2Data = {
  schema: string;
  id: "suzanne2-ascii-arena";
  title: string;
  status: string;
  evidenceBoundary: {
    statement: string;
    screenshotFound: false;
    copiedFacts: string;
    excludedFromLevelIdentity: string[];
  };
  provenance: {
    copies: Record<string, { path: string; sha256: string; bytes: number }>;
    assets: Record<string, { path: string; sha256: string; bytes: number }>;
    code: Record<string, { path: string; sha256: string; bytes: number }>;
  };
  grid: { width: number; height: number; rows: string[]; symbolCounts: Record<string, number> };
  sceneDefaults: {
    floor: { center: Tuple3; size: Tuple3; texture: string; addedBy: string };
    camera: { position: Tuple3; lookAt: string; note: string };
    player: {
      implementation: string;
      position: Tuple3;
      physicsRadius: number;
      cageMesh: string;
      cageScale: Tuple3;
      insideShape: string;
      insideRadius: number;
      insideRotationDegrees: Tuple3;
      insideTexture: string;
    };
    gates: Record<"finishStart" | "finishEnd" | "halfStart" | "halfEnd", Tuple3>;
    finishBoard: {
      position: Tuple3;
      scale: Tuple3;
      texture: string;
      looksAt: Tuple3;
      text: { value: string; font: string; size: number; color: string; position: Tuple3; rotationDegrees: Tuple3 };
    };
    ringRuntime: {
      authoredInventory: number;
      victoryThresholdActuallyImplemented: number;
      pickupDistance: number;
      radius: number;
      colorArgumentActuallyUsed: string;
      configuredButIgnored: Record<string, unknown>;
    };
    lapRuntime: { rule: string; targetOrVictoryCondition: null; note: string };
    controls: Record<string, string>;
  };
  counts: {
    wallCubesFromHashZz: number;
    wallCubesBySymbol: { hash: number; grassZ: number; podiumz: number };
    effectWallCubes: number;
    totalAsciiCollisionCubes: number;
    rings: number;
    chainAssemblies: number;
    chainRigidBodies: number;
    pistonAssemblies: number;
    pistonBodiesIncludingHiddenTriggers: number;
    lapGatePosts: number;
    gateSegments: number;
    effectCells: number;
    particleEmitters: number;
    particleCapacity: number;
    cubxActorAnchors: number;
    xmlObjects: number;
  };
  walls: WallCell[];
  chains: ChainCell[];
  rings: RingCell[];
  effects: EffectCell[];
  pistons: PistonCell[];
  lapMarkers: LapMarkerCell[];
  cubxAnchors: Array<{ position: Tuple3; actorPosition: Tuple3 }>;
  xmlObjects: XmlObject[];
  meshAssets: { airplane: DirectXAsset; bonedGate: DirectXAsset; playerCage: DirectXAsset };
  comparisonToSuzanne1: { differences: string[] } & Record<string, unknown>;
  laterEditorSemanticDrift: { status: string; changes: string[] };
  hostGlobals: { includedInIsolatedCandidate: boolean; objects: string[]; rationale: string };
  unresolved: string[];
};

export type Suzanne2AsciiEnvironmentOptions = {
  sharedAssetBaseUrl?: string;
  archiveAssetBaseUrl?: string;
  suzanne2AssetBaseUrl?: string;
  ballAssetBaseUrl?: string;
  classicAssetBaseUrl?: string;
  loadingManager?: LoadingManager;
  showCubxAnchors?: boolean;
  showPlayer?: boolean;
  showXmlAttachments?: boolean;
};

export type Suzanne2AsciiEnvironmentState = {
  id: "suzanne2-ascii-arena";
  title: string;
  status: string;
  loadStatus: LoadStatus;
  loadError: string | null;
  ready: boolean;
  visible: boolean;
  disposed: boolean;
  screenshotEvidence: false;
  grid: { width: 40; height: 40 };
  counts: Suzanne2Data["counts"] & { ringsVisible: number; xmlMeshesVisible: number; cubxAnchorsVisible: number };
  player: { implementation: string; position: Tuple3; physicsRadius: number; insideRadius: number; visible: boolean };
  gates: Suzanne2Data["sceneDefaults"]["gates"];
  rules: { authoredRingInventory: number; implementedVictoryThreshold: number; lapVictoryTarget: null };
  activePistons: number[];
  xmlAttachments: Array<{ name: string; position: Tuple3; visible: boolean }>;
  hostGlobalsIncluded: false;
  evidenceBoundary: string;
  unresolved: string[];
};

type TrackableMaterial = MeshStandardMaterial | MeshPhysicalMaterial | MeshBasicMaterial | PointsMaterial | SpriteMaterial;
type TrackableGeometry = BoxGeometry | ConeGeometry | CylinderGeometry | SphereGeometry | BufferGeometry;
type PistonAssembly = { source: PistonCell; group: Group; plate: Mesh<BoxGeometry, MeshStandardMaterial>; activation: number };

const DATA = suzanne2Json as unknown as Suzanne2Data;
const SHARED_ASSET_BASE = "/assets/textures/suzanne1";
const ARCHIVE_ASSET_BASE = "/assets/textures/archive";
const SUZANNE2_ASSET_BASE = "/assets/textures/suzanne2";
const BALL_ASSET_BASE = "/assets/textures/ball";
const CLASSIC_ASSET_BASE = "/assets/textures/classic";

function setTuple(target: { set(x: number, y: number, z: number): unknown }, value: Tuple3): void {
  target.set(value[0], value[1], value[2]);
}

function eulerDegrees(value: Tuple3): Euler {
  return new Euler(MathUtils.degToRad(value[0]), MathUtils.degToRad(value[1]), MathUtils.degToRad(value[2]), "XYZ");
}

function joinedUrl(base: string, file: string): string {
  return `${base.replace(/\/$/, "")}/${file}`;
}

function seededUnit(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * Isolated reconstruction of Suzanne2.ASCII plus Suzanne2.xml using the active March 2017 loader.
 * Physics behavior is exposed as integration data/API; this class supplies deterministic scene geometry.
 */
export class Suzanne2AsciiEnvironment {
  static readonly data = DATA;

  readonly group = new Group();
  readonly ringMeshes: Array<Mesh<SphereGeometry, MeshStandardMaterial>> = [];
  readonly pistonAssemblies: PistonAssembly[] = [];
  readonly xmlAttachmentGroups: Group[] = [];
  readonly cubxAnchorGroup = new Group();
  readonly playerGroup = new Group();
  readonly ready: Promise<void>;

  private readonly sharedAssetBaseUrl: string;
  private readonly archiveAssetBaseUrl: string;
  private readonly suzanne2AssetBaseUrl: string;
  private readonly ballAssetBaseUrl: string;
  private readonly classicAssetBaseUrl: string;
  private readonly textureLoader: TextureLoader;
  private readonly materials = new Set<TrackableMaterial>();
  private readonly geometries = new Set<TrackableGeometry>();
  private readonly textures = new Set<Texture>();
  private readonly particleClouds: Points[] = [];
  private readonly xMaterialBindings: Array<{ material: MeshStandardMaterial | MeshPhysicalMaterial; texture: string }> = [];

  private readonly floorMaterial: MeshStandardMaterial;
  private readonly hashWallMaterial: MeshStandardMaterial;
  private readonly grassWallMaterial: MeshStandardMaterial;
  private readonly podiumWallMaterial: MeshStandardMaterial;
  private readonly chainMaterial: MeshStandardMaterial;
  private readonly ringMaterial: MeshStandardMaterial;
  private readonly effectMaterial: MeshStandardMaterial;
  private readonly billboardMaterial: SpriteMaterial;
  private readonly insideBallMaterial: MeshStandardMaterial;
  private readonly finishMaterial: MeshStandardMaterial;
  private status: LoadStatus = "loading";
  private errorMessage: string | null = null;
  private isDisposed = false;
  private elapsedSeconds = 0;

  constructor(options: Suzanne2AsciiEnvironmentOptions = {}) {
    this.assertData();
    this.sharedAssetBaseUrl = options.sharedAssetBaseUrl ?? SHARED_ASSET_BASE;
    this.archiveAssetBaseUrl = options.archiveAssetBaseUrl ?? ARCHIVE_ASSET_BASE;
    this.suzanne2AssetBaseUrl = options.suzanne2AssetBaseUrl ?? SUZANNE2_ASSET_BASE;
    this.ballAssetBaseUrl = options.ballAssetBaseUrl ?? BALL_ASSET_BASE;
    this.classicAssetBaseUrl = options.classicAssetBaseUrl ?? CLASSIC_ASSET_BASE;
    this.textureLoader = new TextureLoader(options.loadingManager);

    this.group.name = "Suzanne 2 — recovered isolated ASCII/XML environment";
    this.group.userData.archiveEnvironment = {
      id: DATA.id,
      schema: DATA.schema,
      sourceSha256: DATA.provenance.copies.canonicalAscii.sha256,
      xmlSha256: DATA.provenance.copies.canonicalXml.sha256,
      screenshotEvidence: false,
      hostGlobalsIncluded: false
    };

    this.floorMaterial = this.trackMaterial(new MeshStandardMaterial({ color: 0x6e9852, roughness: 0.94 }));
    this.hashWallMaterial = this.trackMaterial(new MeshStandardMaterial({ color: 0x7d5237, roughness: 0.84 }));
    this.grassWallMaterial = this.trackMaterial(new MeshStandardMaterial({ color: 0x467e38, roughness: 0.96 }));
    this.podiumWallMaterial = this.trackMaterial(new MeshStandardMaterial({ color: 0x655249, roughness: 0.86 }));
    this.chainMaterial = this.trackMaterial(new MeshStandardMaterial({ color: 0xa9282f, roughness: 0.42, metalness: 0.16 }));
    this.ringMaterial = this.trackMaterial(
      new MeshStandardMaterial({ color: 0xffffff, emissive: new Color(0x251600), emissiveIntensity: 0.2, roughness: 0.3, metalness: 0.12, side: DoubleSide })
    );
    this.effectMaterial = this.trackMaterial(new MeshStandardMaterial({ color: 0xffffff, emissive: new Color(0x2c092e), emissiveIntensity: 0.28, roughness: 0.52 }));
    this.billboardMaterial = this.trackMaterial(new SpriteMaterial({ color: 0xffffff, transparent: true }));
    this.insideBallMaterial = this.trackMaterial(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.1 }));
    this.finishMaterial = this.trackMaterial(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.65 }));

    this.buildFloor();
    this.buildWalls();
    this.buildChains();
    this.buildLapGates();
    this.buildRings();
    this.buildPistons();
    this.buildEffects();
    this.buildXmlObjects();
    this.buildPlayer();
    this.buildCubxAnchors();
    this.buildLighting();

    this.playerGroup.visible = options.showPlayer ?? true;
    this.setXmlAttachmentsVisible(options.showXmlAttachments ?? true);
    this.cubxAnchorGroup.visible = options.showCubxAnchors ?? false;

    this.ready = this.loadTextures()
      .then(() => {
        if (!this.isDisposed) this.status = "ready";
      })
      .catch((error: unknown) => {
        if (!this.isDisposed) {
          this.status = "error";
          this.errorMessage = error instanceof Error ? error.message : String(error);
        }
        throw error;
      });
  }

  getState(): Suzanne2AsciiEnvironmentState {
    return {
      id: "suzanne2-ascii-arena",
      title: DATA.title,
      status: DATA.status,
      loadStatus: this.status,
      loadError: this.errorMessage,
      ready: this.status === "ready",
      visible: this.group.visible,
      disposed: this.isDisposed,
      screenshotEvidence: false,
      grid: { width: 40, height: 40 },
      counts: {
        ...DATA.counts,
        ringsVisible: this.ringMeshes.filter((ring) => ring.visible).length,
        xmlMeshesVisible: this.xmlAttachmentGroups.filter((attachment) => attachment.visible).length,
        cubxAnchorsVisible: this.cubxAnchorGroup.visible ? DATA.cubxAnchors.length : 0
      },
      player: {
        implementation: DATA.sceneDefaults.player.implementation,
        position: DATA.sceneDefaults.player.position,
        physicsRadius: DATA.sceneDefaults.player.physicsRadius,
        insideRadius: DATA.sceneDefaults.player.insideRadius,
        visible: this.playerGroup.visible
      },
      gates: DATA.sceneDefaults.gates,
      rules: {
        authoredRingInventory: DATA.sceneDefaults.ringRuntime.authoredInventory,
        implementedVictoryThreshold: DATA.sceneDefaults.ringRuntime.victoryThresholdActuallyImplemented,
        lapVictoryTarget: null
      },
      activePistons: this.pistonAssemblies
        .map((assembly, index) => (assembly.activation > 0 ? index : -1))
        .filter((index) => index >= 0),
      xmlAttachments: DATA.xmlObjects.map((object, index) => ({
        name: object.name,
        position: object.position,
        visible: this.xmlAttachmentGroups[index]?.visible ?? false
      })),
      hostGlobalsIncluded: false,
      evidenceBoundary: DATA.evidenceBoundary.statement,
      unresolved: DATA.unresolved
    };
  }

  update(deltaSeconds: number): void {
    if (this.isDisposed || !Number.isFinite(deltaSeconds)) return;
    const delta = Math.max(0, deltaSeconds);
    this.elapsedSeconds += delta;
    const angularSpeed = MathUtils.degToRad(DATA.rings[0]?.rotatesDegreesPerElapsedMillisecond ?? 0) * 1000;
    for (const ring of this.ringMeshes) ring.rotation.y += angularSpeed * delta;
    this.particleClouds.forEach((cloud, index) => {
      cloud.rotation.y = this.elapsedSeconds * (index % 2 === 0 ? 0.38 : -0.31);
      cloud.position.y = Math.sin(this.elapsedSeconds * 1.7 + index) * 0.08;
    });
  }

  setRingVisible(index: number, visible: boolean): void {
    const ring = this.ringMeshes[index];
    if (!ring) throw new RangeError(`Suzanne 2 ring ${index} does not exist.`);
    ring.visible = visible;
  }

  resetRings(): void {
    for (const ring of this.ringMeshes) ring.visible = true;
  }

  setPistonActivation(index: number, activation: number): void {
    const assembly = this.pistonAssemblies[index];
    if (!assembly) throw new RangeError(`Suzanne 2 piston ${index} does not exist.`);
    assembly.activation = MathUtils.clamp(activation, 0, 1);
    assembly.plate.position.x = MathUtils.lerp(assembly.source.linearLimits[0], assembly.source.linearLimits[1], assembly.activation);
  }

  setXmlAttachmentsVisible(visible: boolean): void {
    for (const attachment of this.xmlAttachmentGroups) attachment.visible = visible;
  }

  setCubxAnchorsVisible(visible: boolean): void {
    this.cubxAnchorGroup.visible = visible;
  }

  setPlayerVisible(visible: boolean): void {
    this.playerGroup.visible = visible;
  }

  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.status = "disposed";
    this.group.removeFromParent();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const texture of this.textures) texture.dispose();
    this.geometries.clear();
    this.materials.clear();
    this.textures.clear();
  }

  private assertData(): void {
    if (DATA.grid.width !== 40 || DATA.grid.height !== 40) throw new Error("Suzanne 2 grid is not 40x40.");
    if (DATA.walls.length !== 313 || DATA.effects.length !== 2 || DATA.counts.totalAsciiCollisionCubes !== 315) {
      throw new Error("Suzanne 2 collision-cell counts differ from the audited archive.");
    }
    if (DATA.rings.length !== 15 || DATA.chains.length !== 3 || DATA.pistons.length !== 3 || DATA.lapMarkers.length !== 4) {
      throw new Error("Suzanne 2 authored actor counts differ from the audited archive.");
    }
    for (const asset of Object.values(DATA.meshAssets)) {
      if (asset.meshes.length !== asset.meshCount) throw new Error(`${asset.id} mesh count mismatch.`);
      for (const mesh of asset.meshes) {
        if (mesh.positions.length !== mesh.vertexCount * 3 || mesh.indices.length !== mesh.triangleCount * 3) {
          throw new Error(`${asset.id}/${mesh.name} geometry length mismatch.`);
        }
        if (mesh.uvs && mesh.uvs.length !== mesh.vertexCount * 2) throw new Error(`${asset.id}/${mesh.name} UV length mismatch.`);
        if (mesh.positions.some((value) => !Number.isFinite(value))) throw new Error(`${asset.id}/${mesh.name} has non-finite positions.`);
        if (mesh.indices.some((index) => !(index >= 0 && index < mesh.vertexCount))) throw new Error(`${asset.id}/${mesh.name} has invalid indices.`);
        if (mesh.groups.reduce((sum, group) => sum + group.count, 0) !== mesh.indices.length) throw new Error(`${asset.id}/${mesh.name} material groups do not cover all indices.`);
      }
    }
  }

  private trackMaterial<T extends TrackableMaterial>(material: T): T {
    this.materials.add(material);
    return material;
  }

  private trackGeometry<T extends TrackableGeometry>(geometry: T): T {
    this.geometries.add(geometry);
    return geometry;
  }

  private buildFloor(): void {
    const source = DATA.sceneDefaults.floor;
    const geometry = this.trackGeometry(new BoxGeometry(source.size[0], source.size[1], source.size[2]));
    const mesh = new Mesh(geometry, this.floorMaterial);
    mesh.name = "Suzanne 2 GrassSample floor";
    setTuple(mesh.position, source.center);
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  private buildWalls(): void {
    const geometry = this.trackGeometry(new BoxGeometry(1, 1, 1));
    for (const wall of DATA.walls) {
      const material = wall.symbol === "#" ? this.hashWallMaterial : wall.symbol === "Z" ? this.grassWallMaterial : this.podiumWallMaterial;
      const mesh = new Mesh(geometry, material);
      mesh.name = `Suzanne2 ASCII ${wall.symbol} wall ${wall.x},${wall.z}`;
      setTuple(mesh.position, wall.position);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  private buildChains(): void {
    const baseGeometry = this.trackGeometry(new BoxGeometry(0.25, 0.25, 0.25));
    const firstLinkGeometry = this.trackGeometry(new ConeGeometry(0.25 / 1.75, 0.25, 18));
    const secondLinkGeometry = this.trackGeometry(new ConeGeometry(0.25 / 1.5, 0.25, 18));
    for (const chain of DATA.chains) {
      const base = new Mesh(baseGeometry, this.chainMaterial);
      base.name = `Suzanne2 chain base ${chain.x},${chain.z}`;
      setTuple(base.position, chain.basePosition);
      base.castShadow = true;
      this.group.add(base);
      chain.linkPositions.forEach((position, index) => {
        const link = new Mesh(index === 0 ? firstLinkGeometry : secondLinkGeometry, this.chainMaterial);
        link.name = `Suzanne2 chain link ${index + 1} ${chain.x},${chain.z}`;
        setTuple(link.position, position);
        link.castShadow = true;
        this.group.add(link);
      });
    }
  }

  private buildLapGates(): void {
    const red = this.trackMaterial(new MeshStandardMaterial({ color: 0xf02028, roughness: 0.42 }));
    const blue = this.trackMaterial(new MeshStandardMaterial({ color: 0x174eff, roughness: 0.4 }));
    for (const marker of DATA.lapMarkers) {
      const geometry = this.trackGeometry(new CylinderGeometry(marker.scale[0], marker.scale[2], marker.scale[1], 20));
      const mesh = new Mesh(geometry, marker.color === "red" ? red : blue);
      mesh.name = `Suzanne2 ${marker.gate ?? marker.color} gate post ${marker.symbol}`;
      setTuple(mesh.position, marker.position);
      mesh.castShadow = true;
      this.group.add(mesh);
    }

    const board = DATA.sceneDefaults.finishBoard;
    const boardGeometry = this.trackGeometry(new BoxGeometry(board.scale[0], board.scale[1], board.scale[2]));
    const boardMesh = new Mesh(boardGeometry, this.finishMaterial);
    boardMesh.name = "GamePlayScreen checkerboard finish board";
    setTuple(boardMesh.position, board.position);
    boardMesh.lookAt(board.looksAt[0], board.looksAt[1], board.looksAt[2]);
    boardMesh.castShadow = true;
    this.group.add(boardMesh);

    const label = this.createFinishLabel();
    setTuple(label.position, board.text.position);
    label.name = "GamePlayScreen Finish Arial 42 text bridge";
    this.group.add(label);
  }

  private createFinishLabel(): Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 160;
    const context = canvas.getContext("2d");
    if (context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.font = "bold 92px Arial";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.lineWidth = 10;
      context.strokeStyle = "rgba(0,0,0,0.86)";
      context.strokeText("Finish", canvas.width / 2, canvas.height / 2);
      context.fillStyle = "#2580ff";
      context.fillText("Finish", canvas.width / 2, canvas.height / 2);
    }
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    this.textures.add(texture);
    const material = this.trackMaterial(new SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
    const sprite = new Sprite(material);
    sprite.scale.set(3.2, 1, 1);
    return sprite;
  }

  private buildRings(): void {
    const geometry = this.trackGeometry(new SphereGeometry(DATA.sceneDefaults.ringRuntime.radius, 30, 20));
    DATA.rings.forEach((ring, index) => {
      const mesh = new Mesh(geometry, this.ringMaterial);
      mesh.name = `Suzanne2 ZRing sphere ${index + 1} (${ring.x},${ring.z})`;
      setTuple(mesh.position, ring.position);
      mesh.castShadow = true;
      this.ringMeshes.push(mesh);
      this.group.add(mesh);
    });
  }

  private buildPistons(): void {
    const material = this.trackMaterial(new MeshStandardMaterial({ color: 0x373b40, roughness: 0.42, metalness: 0.52 }));
    for (const source of DATA.pistons) {
      const assembly = new Group();
      assembly.name = `Suzanne2 piston ${source.symbol} (${source.x},${source.z})`;
      setTuple(assembly.position, source.position);
      assembly.rotation.copy(eulerDegrees(source.rotationDegrees));
      const bar = new Mesh(this.trackGeometry(new BoxGeometry(source.barScale[0], source.barScale[1], source.barScale[2])), material);
      bar.name = "PistonBar";
      bar.castShadow = true;
      assembly.add(bar);
      const plate = new Mesh(this.trackGeometry(new BoxGeometry(source.plateScale[0], source.plateScale[1], source.plateScale[2])), material);
      plate.name = "PushPlate";
      plate.position.x = source.linearLimits[0];
      plate.castShadow = true;
      assembly.add(plate);
      this.pistonAssemblies.push({ source, group: assembly, plate, activation: 0 });
      this.group.add(assembly);
    }
  }

  private buildEffects(): void {
    const blockGeometry = this.trackGeometry(new BoxGeometry(1, 1, 1));
    DATA.effects.forEach((effect, effectIndex) => {
      const block = new Mesh(blockGeometry, this.effectMaterial);
      block.name = `Suzanne2 Zack effect wall ${effect.x},${effect.z}`;
      setTuple(block.position, effect.position);
      block.castShadow = true;
      this.group.add(block);
      effect.emitters.forEach((emitter, emitterIndex) => {
        const geometry = this.trackGeometry(new BufferGeometry());
        const positions = new Float32Array(emitter.particleCapacity * 3);
        for (let index = 0; index < emitter.particleCapacity; index += 1) {
          const seed = effectIndex * 10000 + emitterIndex * 1000 + index;
          const angle = seededUnit(seed + 1) * Math.PI * 2;
          const radius = 0.12 + seededUnit(seed + 2) * 0.7;
          positions[index * 3] = Math.cos(angle) * radius;
          positions[index * 3 + 1] = 0.45 + seededUnit(seed + 3) * 1.8;
          positions[index * 3 + 2] = Math.sin(angle) * radius;
        }
        geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
        const color = new Color().setRGB(emitter.color[0], emitter.color[1], emitter.color[2]);
        const material = this.trackMaterial(new PointsMaterial({ color, size: 0.11, transparent: true, opacity: 0.86, depthWrite: false, sizeAttenuation: true }));
        const points = new Points(geometry, material);
        points.name = `Suzanne2 source-capacity ${emitter.color[0] === 1 ? "magenta" : "blue"} emitter (${emitter.particleCapacity})`;
        setTuple(points.position, effect.position);
        this.particleClouds.push(points);
        this.group.add(points);
      });
    });
  }

  private buildXmlObjects(): void {
    const airplaneObject = DATA.xmlObjects.find((object) => object.mesh.includes("Airplane.x"));
    const gateObject = DATA.xmlObjects.find((object) => object.mesh.includes("BonedGate.x"));
    const billboardObject = DATA.xmlObjects.find((object) => object.typeName === "BILLBOARD");
    if (!airplaneObject || !gateObject || !billboardObject) throw new Error("Suzanne2.xml object identities are incomplete.");

    const airplane = this.buildDirectXAsset(DATA.meshAssets.airplane, "airplane");
    airplane.name = "Suzanne2.xml Airplane.x PHYSICCUSTOM";
    setTuple(airplane.position, airplaneObject.position);
    setTuple(airplane.scale, airplaneObject.scale);
    this.xmlAttachmentGroups.push(airplane);
    this.group.add(airplane);

    const bonedGate = this.buildDirectXAsset(DATA.meshAssets.bonedGate, "boned-gate");
    bonedGate.name = "Suzanne2.xml BonedGate.x static bind pose (mesh loader path)";
    setTuple(bonedGate.position, gateObject.position);
    setTuple(bonedGate.scale, gateObject.scale);
    this.xmlAttachmentGroups.push(bonedGate);
    this.group.add(bonedGate);

    const billboardGroup = new Group();
    billboardGroup.name = "Suzanne2.xml Suzanne1.Magician billboard";
    const billboard = new Sprite(this.billboardMaterial);
    setTuple(billboard.position, billboardObject.position);
    billboard.scale.set(billboardObject.scale[0], billboardObject.scale[1], 1);
    billboardGroup.add(billboard);
    this.xmlAttachmentGroups.push(billboardGroup);
    this.group.add(billboardGroup);
  }

  private buildPlayer(): void {
    const source = DATA.sceneDefaults.player;
    this.playerGroup.name = "Suzanne2 active-source ZombieKiller player";
    setTuple(this.playerGroup.position, source.position);

    const cage = this.buildDirectXAsset(DATA.meshAssets.playerCage, "player-cage");
    cage.name = "SuperCage.x at exact source scale";
    setTuple(cage.scale, source.cageScale);
    this.playerGroup.add(cage);

    const insideGeometry = this.trackGeometry(new SphereGeometry(source.insideRadius, 36, 24));
    const inside = new Mesh(insideGeometry, this.insideBallMaterial);
    inside.name = "BallZInside FireArrow800 sphere";
    inside.rotation.copy(eulerDegrees(source.insideRotationDegrees));
    inside.castShadow = true;
    this.playerGroup.add(inside);
    this.group.add(this.playerGroup);
  }

  private buildDirectXAsset(asset: DirectXAsset, role: "airplane" | "boned-gate" | "player-cage"): Group {
    const group = new Group();
    group.userData.directXAsset = { id: asset.id, sourceSha256: asset.source.sha256, bounds: asset.bounds, role };
    for (const source of asset.meshes) {
      const geometry = this.trackGeometry(new BufferGeometry());
      geometry.name = `${asset.id}/${source.name}`;
      geometry.setAttribute("position", new Float32BufferAttribute(source.positions, 3));
      if (source.uvs) geometry.setAttribute("uv", new Float32BufferAttribute(source.uvs, 2));
      geometry.setIndex(source.indices);
      source.groups.forEach((materialGroup) => geometry.addGroup(materialGroup.start, materialGroup.count, materialGroup.materialIndex));
      geometry.computeVertexNormals();
      const materials = source.materials.map((materialSource) => {
        const color = new Color().setRGB(materialSource.color[0], materialSource.color[1], materialSource.color[2]);
        const emissive = new Color().setRGB(materialSource.emissive[0], materialSource.emissive[1], materialSource.emissive[2]);
        const transparent = materialSource.color[3] < 0.999;
        const material = role === "player-cage"
          ? this.trackMaterial(new MeshPhysicalMaterial({ color, emissive, transparent: true, opacity: 0.58, roughness: 0.22, metalness: 0.18, clearcoat: 0.7, clearcoatRoughness: 0.18, wireframe: false }))
          : this.trackMaterial(new MeshStandardMaterial({ color, emissive, transparent, opacity: materialSource.color[3], roughness: role === "airplane" ? 0.62 : 0.42, metalness: role === "boned-gate" ? 0.24 : 0.08, side: DoubleSide }));
        material.name = `${asset.id}/${materialSource.name}`;
        if (materialSource.texture) this.xMaterialBindings.push({ material, texture: materialSource.texture });
        return material;
      });
      const mesh = new Mesh(geometry, materials);
      mesh.name = source.name;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  }

  private buildCubxAnchors(): void {
    this.cubxAnchorGroup.name = "CubX integration anchors — not reconstructed CubX actors";
    const material = this.trackMaterial(new MeshBasicMaterial({ color: 0x54f0cc, wireframe: true, transparent: true, opacity: 0.62 }));
    const geometry = this.trackGeometry(new BoxGeometry(1, 1, 1));
    for (const source of DATA.cubxAnchors) {
      const anchor = new Mesh(geometry, material);
      anchor.name = "C cell createCubX actor anchor at y=5.5";
      setTuple(anchor.position, source.actorPosition);
      this.cubxAnchorGroup.add(anchor);
    }
    this.group.add(this.cubxAnchorGroup);
  }

  private buildLighting(): void {
    const ambient = new AmbientLight(0x8ba078, 1.2);
    ambient.name = "Preview lighting (not Suzanne2 screenshot evidence)";
    this.group.add(ambient);
    const sun = new DirectionalLight(0xffefcf, 2.4);
    sun.name = "Preview directional light (presentation bridge)";
    sun.position.set(25, 38, -16);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -46;
    sun.shadow.camera.right = 46;
    sun.shadow.camera.top = 46;
    sun.shadow.camera.bottom = -46;
    this.group.add(sun);
  }

  private async loadTextures(): Promise<void> {
    const fixedBindings: Array<{ material: TrackableMaterial; slot: "map" | "normalMap"; url: string; repeat?: readonly [number, number] }> = [
      { material: this.floorMaterial, slot: "map", url: joinedUrl(this.sharedAssetBaseUrl, "GrassSample.jpg"), repeat: [10, 10] },
      { material: this.hashWallMaterial, slot: "map", url: joinedUrl(this.sharedAssetBaseUrl, "objet39.jpg") },
      { material: this.grassWallMaterial, slot: "map", url: joinedUrl(this.archiveAssetBaseUrl, "grass.jpg") },
      { material: this.podiumWallMaterial, slot: "map", url: joinedUrl(this.sharedAssetBaseUrl, "Podium.JPG") },
      { material: this.chainMaterial, slot: "map", url: joinedUrl(this.sharedAssetBaseUrl, "3D_Spheres.jpg") },
      { material: this.ringMaterial, slot: "map", url: joinedUrl(this.sharedAssetBaseUrl, "ZRing.png") },
      { material: this.ringMaterial, slot: "normalMap", url: joinedUrl(this.suzanne2AssetBaseUrl, "ball_Normal.png") },
      { material: this.effectMaterial, slot: "map", url: joinedUrl(this.sharedAssetBaseUrl, "Zack.jpg") },
      { material: this.billboardMaterial, slot: "map", url: joinedUrl(this.sharedAssetBaseUrl, "Zack.jpg") },
      { material: this.insideBallMaterial, slot: "map", url: joinedUrl(this.ballAssetBaseUrl, "FireArrow800.jpg") },
      { material: this.finishMaterial, slot: "map", url: joinedUrl(this.classicAssetBaseUrl, "Checkerboard.png") }
    ];
    const airplaneBindings: Array<{ material: TrackableMaterial; slot: "map" | "normalMap"; url: string; repeat?: readonly [number, number] }> = this.xMaterialBindings.map((binding) => ({
      material: binding.material,
      slot: "map" as const,
      url: joinedUrl(joinedUrl(this.suzanne2AssetBaseUrl, "airplane"), binding.texture)
    }));
    const bindings = [...fixedBindings, ...airplaneBindings];
    const cache = new Map<string, Promise<Texture>>();
    const load = (url: string): Promise<Texture> => {
      const existing = cache.get(url);
      if (existing) return existing;
      const promise = this.textureLoader.loadAsync(url);
      cache.set(url, promise);
      return promise;
    };
    const loaded = await Promise.all(bindings.map(async (binding) => ({ binding, texture: await load(binding.url) })));
    if (this.isDisposed) {
      for (const texture of new Set(loaded.map((item) => item.texture))) texture.dispose();
      return;
    }
    for (const { binding, texture } of loaded) {
      texture.colorSpace = binding.slot === "map" ? SRGBColorSpace : "";
      texture.wrapS = ClampToEdgeWrapping;
      texture.wrapT = ClampToEdgeWrapping;
      if (binding.repeat) {
        texture.wrapS = RepeatWrapping;
        texture.wrapT = RepeatWrapping;
        texture.repeat.set(binding.repeat[0], binding.repeat[1]);
      }
      this.textures.add(texture);
      if (binding.slot === "map") binding.material.map = texture;
      else if (binding.material instanceof MeshStandardMaterial || binding.material instanceof MeshPhysicalMaterial) binding.material.normalMap = texture;
      binding.material.needsUpdate = true;
    }
  }
}
