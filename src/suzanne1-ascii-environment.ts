import {
  AmbientLight,
  BoxGeometry,
  ClampToEdgeWrapping,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Euler,
  Group,
  LoadingManager,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  RepeatWrapping,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Texture,
  TextureLoader
} from "three";
import suzanneAsciiJson from "./legacy/suzanne1-ascii-scene.json";

type Tuple3 = readonly [number, number, number];
type LoadStatus = "loading" | "ready" | "error" | "disposed";
export type SuzannePresentationProfile = "reference2016" | "source2017";

type WallCell = {
  symbol: "#" | "Z" | "z";
  x: number;
  z: number;
  position: Tuple3;
  texture: string;
};

type ChainCell = {
  symbol: "c";
  x: number;
  z: number;
  basePosition: Tuple3;
  linkPositions: readonly [Tuple3, Tuple3];
  baseScale: Tuple3;
  linkScales: readonly [Tuple3, Tuple3];
};

type RingCell = {
  symbol: "R";
  x: number;
  z: number;
  position: Tuple3;
  radius: number;
  pickupDistance: number;
  rotatesDegreesPerElapsedMillisecond: number;
};

type EffectCell = {
  symbol: "s";
  x: number;
  z: number;
  position: Tuple3;
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
  color: "red" | "blue";
  scale: Tuple3;
};

type SuzanneAsciiData = {
  schema: string;
  id: string;
  title: string;
  status: string;
  provenance: {
    note: string;
    sources: Record<string, { path: string; sha256: string; bytes: number }>;
    referenceScreenshot: { dimensions: readonly [number, number]; visualFacts: string[] };
  };
  grid: { width: number; height: number; rows: string[]; symbolCounts: Record<string, number> };
  presentationProfiles: Record<
    SuzannePresentationProfile,
    {
      evidence: string;
      floorTexture: string;
      hashWallTexture: string;
      ringRadius: number;
      chainScaleMultiplier: number;
      background: string;
    }
  >;
  sceneDefaults: {
    floor: { center: Tuple3; size: Tuple3; archivedSubdivision: readonly [number, number] };
    player: { position: Tuple3; visualRadius: number; internalRadius: number; internalTexture: string };
    gates: Record<"finishStart" | "finishEnd" | "halfStart" | "halfEnd", Tuple3>;
    laps: number;
    rings: { total: number; sphereRadius: number; texture: string; particleTexture: string };
    cameraBranches: Array<{ source: string; position: Tuple3; lookAt: Tuple3 | string; mode: string }>;
    lights: Array<{ type: string; position: Tuple3; diffuseRgb255: Tuple3; ambientRgb255: Tuple3; range: number }>;
    hud: { screenshotBranch: string[]; laterBranch: string[] };
    controls: Record<string, string>;
    gameplay: Record<string, string>;
  };
  xmlBranches: Record<string, Array<Record<string, unknown>>>;
  objects: Array<WallCell | ChainCell | RingCell | EffectCell | PistonCell | LapMarkerCell | Record<string, unknown>>;
  walls: WallCell[];
  chains: ChainCell[];
  rings: RingCell[];
  effects: EffectCell[];
  pistons: PistonCell[];
  cubxAnchors: Array<{ position: Tuple3; actorPosition: Tuple3 }>;
  unresolved: string[];
};

export type SuzanneAsciiEnvironmentOptions = {
  /** Screenshot-matching profile is the restoration default; source2017 preserves the later exact binding table. */
  profile?: SuzannePresentationProfile;
  assetBaseUrl?: string;
  archiveAssetBaseUrl?: string;
  loadingManager?: LoadingManager;
  pointLightIntensity?: number;
  showCubxAnchors?: boolean;
};

export type SuzanneAsciiEnvironmentState = {
  id: "suzanne1-ascii-arena";
  title: string;
  status: string;
  profile: SuzannePresentationProfile;
  profileEvidence: string;
  loadStatus: LoadStatus;
  loadError: string | null;
  ready: boolean;
  visible: boolean;
  disposed: boolean;
  grid: { width: number; height: number };
  counts: {
    walls: number;
    chains: number;
    ringsVisible: number;
    ringsTotal: number;
    pistons: number;
    effects: number;
    cubxAnchors: number;
  };
  playerStart: Tuple3;
  gates: Record<"finishStart" | "finishEnd" | "halfStart" | "halfEnd", Tuple3>;
  activePistons: number[];
  sourceObjectsAwaitingIntegration: string[];
  referenceScreenshot: { dimensions: readonly [number, number]; sha256: string };
  unresolved: string[];
};

type PistonAssembly = {
  source: PistonCell;
  group: Group;
  plate: Mesh<BoxGeometry, MeshStandardMaterial>;
  activation: number;
};

const DATA = suzanneAsciiJson as unknown as SuzanneAsciiData;
const DEFAULT_ASSET_BASE_URL = "/assets/textures/suzanne1";
const DEFAULT_ARCHIVE_ASSET_BASE_URL = "/assets/textures/archive";

function setTuple(target: { set(x: number, y: number, z: number): unknown }, value: Tuple3): void {
  target.set(value[0], value[1], value[2]);
}

function radiansEuler(value: Tuple3): Euler {
  return new Euler(MathUtils.degToRad(value[0]), MathUtils.degToRad(value[1]), MathUtils.degToRad(value[2]), "XYZ");
}

function joinedUrl(base: string, file: string): string {
  return `${base.replace(/\/$/, "")}/${file}`;
}

/**
 * Standalone visual assembly for the authored Suzanne1.ASCII arena.
 * It intentionally does not create a BallZ controller or physics world; integration can use
 * the exact collision cells, ring pickup radii, gates, and piston limits exposed in `data`.
 */
export class SuzanneAsciiEnvironment {
  static readonly data = DATA;

  readonly group = new Group();
  readonly ringMeshes: Array<Mesh<SphereGeometry, MeshStandardMaterial>> = [];
  readonly pistonAssemblies: PistonAssembly[] = [];
  readonly cubxAnchors = DATA.cubxAnchors;
  readonly xmlAttachments = DATA.xmlBranches;
  readonly ready: Promise<void>;

  private readonly profile: SuzannePresentationProfile;
  private readonly assetBaseUrl: string;
  private readonly archiveAssetBaseUrl: string;
  private readonly textureLoader: TextureLoader;
  private readonly materials = new Set<MeshStandardMaterial | MeshBasicMaterial | SpriteMaterial>();
  private readonly geometries = new Set<BoxGeometry | ConeGeometry | CylinderGeometry | SphereGeometry>();
  private readonly textures = new Set<Texture>();
  private readonly hashWalls: Array<Mesh<BoxGeometry, MeshStandardMaterial>> = [];
  private readonly grassWalls: Array<Mesh<BoxGeometry, MeshStandardMaterial>> = [];
  private readonly podiumWalls: Array<Mesh<BoxGeometry, MeshStandardMaterial>> = [];
  private readonly chainLinks: Array<Mesh<ConeGeometry, MeshStandardMaterial>> = [];
  private readonly effectBlocks: Array<Mesh<BoxGeometry, MeshStandardMaterial>> = [];
  private readonly floorMaterial: MeshStandardMaterial;
  private readonly hashWallMaterial: MeshStandardMaterial;
  private readonly grassWallMaterial: MeshStandardMaterial;
  private readonly podiumWallMaterial: MeshStandardMaterial;
  private readonly chainMaterial: MeshStandardMaterial;
  private readonly ringMaterial: MeshStandardMaterial;
  private readonly effectMaterial: MeshStandardMaterial;
  private readonly magicianMaterial: SpriteMaterial;
  private status: LoadStatus = "loading";
  private errorMessage: string | null = null;
  private isDisposed = false;

  constructor(options: SuzanneAsciiEnvironmentOptions = {}) {
    if (DATA.grid.width !== 40 || DATA.grid.height !== 40 || DATA.rings.length !== 15) {
      throw new Error("Suzanne ASCII data failed its authored-layout invariants.");
    }

    this.profile = options.profile ?? "reference2016";
    this.assetBaseUrl = options.assetBaseUrl ?? DEFAULT_ASSET_BASE_URL;
    this.archiveAssetBaseUrl = options.archiveAssetBaseUrl ?? DEFAULT_ARCHIVE_ASSET_BASE_URL;
    this.textureLoader = new TextureLoader(options.loadingManager);

    this.group.name = "Suzanne 1 — recovered 40x40 ASCII arena";
    this.group.userData.archiveEnvironment = {
      id: DATA.id,
      schema: DATA.schema,
      profile: this.profile,
      source: DATA.provenance.sources.ascii.path,
      sourceSha256: DATA.provenance.sources.ascii.sha256,
      referenceSha256: DATA.provenance.sources.reference.sha256,
      kind: "ballz-ascii-arena"
    };

    this.floorMaterial = this.trackMaterial(new MeshStandardMaterial({ color: 0x6b9846, roughness: 0.96 }));
    this.hashWallMaterial = this.trackMaterial(new MeshStandardMaterial({ color: 0x89603e, roughness: 0.82 }));
    this.grassWallMaterial = this.trackMaterial(new MeshStandardMaterial({ color: 0x3d792f, roughness: 0.96 }));
    this.podiumWallMaterial = this.trackMaterial(new MeshStandardMaterial({ color: 0x5d4a43, roughness: 0.88 }));
    this.chainMaterial = this.trackMaterial(new MeshStandardMaterial({ color: 0xa1282c, roughness: 0.42, metalness: 0.2 }));
    this.ringMaterial = this.trackMaterial(
      new MeshStandardMaterial({
        color: 0xffec38,
        emissive: new Color(0x5a1300),
        emissiveIntensity: 0.18,
        roughness: 0.34,
        metalness: 0.08
      })
    );
    this.effectMaterial = this.trackMaterial(
      new MeshStandardMaterial({ color: 0x8f426f, emissive: new Color(0x2f0632), roughness: 0.5 })
    );
    this.magicianMaterial = this.trackMaterial(new SpriteMaterial({ color: 0xffffff, transparent: true }));

    this.buildFloor();
    this.buildWalls();
    this.buildChains();
    this.buildLapMarkers();
    this.buildRings();
    this.buildPistons();
    this.buildEffects();
    this.buildXmlBillboard();
    this.buildLighting(options.pointLightIntensity ?? 28);
    if (options.showCubxAnchors) this.buildCubxIntegrationAnchors();

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

  getState(): SuzanneAsciiEnvironmentState {
    const referenceSource = DATA.provenance.sources.reference;
    return {
      id: "suzanne1-ascii-arena",
      title: DATA.title,
      status: DATA.status,
      profile: this.profile,
      profileEvidence: DATA.presentationProfiles[this.profile].evidence,
      loadStatus: this.status,
      loadError: this.errorMessage,
      ready: this.status === "ready",
      visible: this.group.visible,
      disposed: this.isDisposed,
      grid: { width: DATA.grid.width, height: DATA.grid.height },
      counts: {
        walls: DATA.walls.length,
        chains: DATA.chains.length,
        ringsVisible: this.ringMeshes.filter((ring) => ring.visible).length,
        ringsTotal: DATA.rings.length,
        pistons: DATA.pistons.length,
        effects: DATA.effects.length,
        cubxAnchors: DATA.cubxAnchors.length
      },
      playerStart: DATA.sceneDefaults.player.position,
      gates: DATA.sceneDefaults.gates,
      activePistons: this.pistonAssemblies
        .map((assembly, index) => (assembly.activation > 0 ? index : -1))
        .filter((index) => index >= 0),
      sourceObjectsAwaitingIntegration: ["CubX actors at C cells", "Airplane.x from compact XML", "BallZ physics/controller"],
      referenceScreenshot: {
        dimensions: DATA.provenance.referenceScreenshot.dimensions,
        sha256: referenceSource.sha256
      },
      unresolved: DATA.unresolved
    };
  }

  update(deltaSeconds: number): void {
    if (this.isDisposed || !Number.isFinite(deltaSeconds)) return;
    const angularSpeed = MathUtils.degToRad(DATA.rings[0]?.rotatesDegreesPerElapsedMillisecond ?? 0) * 1000;
    for (const ring of this.ringMeshes) ring.rotation.y += angularSpeed * Math.max(0, deltaSeconds);
  }

  setRingVisible(index: number, visible: boolean): void {
    const ring = this.ringMeshes[index];
    if (!ring) throw new RangeError(`Suzanne ring ${index} does not exist.`);
    ring.visible = visible;
  }

  resetRings(): void {
    for (const ring of this.ringMeshes) ring.visible = true;
  }

  setPistonActivation(index: number, activation: number): void {
    const assembly = this.pistonAssemblies[index];
    if (!assembly) throw new RangeError(`Suzanne piston ${index} does not exist.`);
    const clamped = MathUtils.clamp(activation, 0, 1);
    const [minimum, maximum] = assembly.source.linearLimits;
    assembly.activation = clamped;
    assembly.plate.position.x = MathUtils.lerp(minimum, maximum, clamped);
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

  private trackMaterial<T extends MeshStandardMaterial | MeshBasicMaterial | SpriteMaterial>(material: T): T {
    this.materials.add(material);
    return material;
  }

  private trackGeometry<T extends BoxGeometry | ConeGeometry | CylinderGeometry | SphereGeometry>(geometry: T): T {
    this.geometries.add(geometry);
    return geometry;
  }

  private buildFloor(): void {
    const floor = DATA.sceneDefaults.floor;
    const geometry = this.trackGeometry(new BoxGeometry(floor.size[0], floor.size[1], floor.size[2]));
    const mesh = new Mesh(geometry, this.floorMaterial);
    mesh.name = `${DATA.presentationProfiles[this.profile].floorTexture} arena floor`;
    setTuple(mesh.position, floor.center);
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  private buildWalls(): void {
    const geometry = this.trackGeometry(new BoxGeometry(1, 1, 1));
    for (const wall of DATA.walls) {
      const material = wall.symbol === "#" ? this.hashWallMaterial : wall.symbol === "Z" ? this.grassWallMaterial : this.podiumWallMaterial;
      const mesh = new Mesh(geometry, material);
      mesh.name = `ASCII ${wall.symbol} wall ${wall.x},${wall.z}`;
      setTuple(mesh.position, wall.position);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (wall.symbol === "#") this.hashWalls.push(mesh);
      else if (wall.symbol === "Z") this.grassWalls.push(mesh);
      else this.podiumWalls.push(mesh);
      this.group.add(mesh);
    }
  }

  private buildChains(): void {
    const multiplier = DATA.presentationProfiles[this.profile].chainScaleMultiplier;
    const baseGeometry = this.trackGeometry(new BoxGeometry(0.25 * multiplier, 0.25 * multiplier, 0.25 * multiplier));
    const firstLinkGeometry = this.trackGeometry(new ConeGeometry((0.25 / 1.75) * multiplier, 0.25 * multiplier, 18));
    const secondLinkGeometry = this.trackGeometry(new ConeGeometry((0.25 / 1.5) * multiplier, 0.25 * multiplier, 18));
    const baseMaterial = this.trackMaterial(new MeshStandardMaterial({ color: 0xe3292e, roughness: 0.4, metalness: 0.16 }));
    for (const chain of DATA.chains) {
      const base = new Mesh(baseGeometry, baseMaterial);
      base.name = `ASCII chain base ${chain.x},${chain.z}`;
      base.position.set(chain.basePosition[0], chain.basePosition[1] * multiplier, chain.basePosition[2]);
      base.castShadow = true;
      this.group.add(base);

      chain.linkPositions.forEach((position, index) => {
        const link = new Mesh(index === 0 ? firstLinkGeometry : secondLinkGeometry, this.chainMaterial);
        link.name = `ASCII chain link ${index + 1} ${chain.x},${chain.z}`;
        link.position.set(position[0], position[1] * multiplier, position[2]);
        link.castShadow = true;
        this.chainLinks.push(link);
        this.group.add(link);
      });
    }
  }

  private buildLapMarkers(): void {
    const markerMaterialRed = this.trackMaterial(new MeshStandardMaterial({ color: 0xe42127, roughness: 0.42 }));
    const markerMaterialBlue = this.trackMaterial(new MeshStandardMaterial({ color: 0x144cff, roughness: 0.38 }));
    for (const object of DATA.objects) {
      if (!("kind" in object) || object.kind !== "lap-marker") continue;
      const marker = object as LapMarkerCell;
      const geometry = this.trackGeometry(new CylinderGeometry(marker.scale[0], marker.scale[0], marker.scale[1], 18));
      const mesh = new Mesh(geometry, marker.color === "red" ? markerMaterialRed : markerMaterialBlue);
      mesh.name = `ASCII ${marker.symbol} lap marker ${marker.x},${marker.z}`;
      setTuple(mesh.position, marker.position);
      mesh.castShadow = true;
      this.group.add(mesh);
    }
  }

  private buildRings(): void {
    const geometry = this.trackGeometry(new SphereGeometry(DATA.presentationProfiles[this.profile].ringRadius, 30, 20));
    DATA.rings.forEach((ring, index) => {
      const mesh = new Mesh(geometry, this.ringMaterial);
      mesh.name = `ZRing sphere ${index + 1} (${ring.x},${ring.z})`;
      mesh.position.set(
        ring.position[0],
        this.profile === "reference2016" ? DATA.presentationProfiles.reference2016.ringRadius : ring.position[1],
        ring.position[2]
      );
      mesh.castShadow = true;
      this.ringMeshes.push(mesh);
      this.group.add(mesh);
    });
  }

  private buildPistons(): void {
    const pistonMaterial = this.trackMaterial(new MeshStandardMaterial({ color: 0x353a40, roughness: 0.45, metalness: 0.5 }));
    for (const source of DATA.pistons) {
      const assembly = new Group();
      assembly.name = `ASCII piston ${source.symbol} (${source.x},${source.z})`;
      setTuple(assembly.position, source.position);
      assembly.rotation.copy(radiansEuler(source.rotationDegrees));

      const barGeometry = this.trackGeometry(new BoxGeometry(source.barScale[0], source.barScale[1], source.barScale[2]));
      const bar = new Mesh(barGeometry, pistonMaterial);
      bar.name = "PistonBar";
      bar.castShadow = true;
      assembly.add(bar);

      const plateGeometry = this.trackGeometry(new BoxGeometry(source.plateScale[0], source.plateScale[1], source.plateScale[2]));
      const plate = new Mesh(plateGeometry, pistonMaterial);
      plate.name = "PushPlate";
      plate.position.x = source.linearLimits[0];
      plate.castShadow = true;
      assembly.add(plate);

      this.pistonAssemblies.push({ source, group: assembly, plate, activation: 0 });
      this.group.add(assembly);
    }
  }

  private buildEffects(): void {
    const geometry = this.trackGeometry(new BoxGeometry(1, 1, 1));
    for (const effect of DATA.effects) {
      const mesh = new Mesh(geometry, this.effectMaterial);
      mesh.name = `ASCII s magician particle cell ${effect.x},${effect.z}`;
      setTuple(mesh.position, effect.position);
      mesh.castShadow = true;
      this.effectBlocks.push(mesh);
      this.group.add(mesh);

      const magenta = new PointLight(0xff29dc, 1.2, 5);
      const cyan = new PointLight(0x1678ff, 1.2, 5);
      magenta.position.set(effect.position[0] - 0.15, effect.position[1] + 0.7, effect.position[2]);
      cyan.position.set(effect.position[0] + 0.15, effect.position[1] + 0.7, effect.position[2]);
      this.group.add(magenta, cyan);
    }
  }

  private buildXmlBillboard(): void {
    const sprite = new Sprite(this.magicianMaterial);
    sprite.name = "Suzanne1.Magician XML billboard";
    sprite.position.set(40, 3, 40);
    sprite.scale.set(8, 6, 1);
    this.group.add(sprite);
  }

  private buildLighting(pointLightIntensity: number): void {
    const ambient = new AmbientLight(0x8da075, 1.35);
    ambient.name = "Suzanne archive ambient approximation";
    this.group.add(ambient);
    const directional = new DirectionalLight(0xfff2d6, 2.2);
    directional.name = "GraphysX default directional light";
    directional.position.set(24, 36, -18);
    directional.castShadow = true;
    directional.shadow.mapSize.set(1024, 1024);
    directional.shadow.camera.left = -45;
    directional.shadow.camera.right = 45;
    directional.shadow.camera.top = 45;
    directional.shadow.camera.bottom = -45;
    this.group.add(directional);
    for (const source of DATA.sceneDefaults.lights) {
      const color = new Color().setRGB(
        source.diffuseRgb255[0] / 255,
        source.diffuseRgb255[1] / 255,
        source.diffuseRgb255[2] / 255
      );
      const light = new PointLight(color, pointLightIntensity, source.range, 1.4);
      light.name = `Suzanne authored point light ${source.position.join(",")}`;
      setTuple(light.position, source.position);
      light.castShadow = true;
      light.shadow.mapSize.set(512, 512);
      this.group.add(light);
    }
  }

  private buildCubxIntegrationAnchors(): void {
    const material = this.trackMaterial(new MeshBasicMaterial({ color: 0x58e4c2, wireframe: true, transparent: true, opacity: 0.45 }));
    const geometry = this.trackGeometry(new BoxGeometry(1, 1, 1));
    for (const anchor of DATA.cubxAnchors) {
      const mesh = new Mesh(geometry, material);
      mesh.name = "CubX integration anchor (not a CubX reconstruction)";
      setTuple(mesh.position, anchor.actorPosition);
      this.group.add(mesh);
    }
  }

  private async loadTextures(): Promise<void> {
    const profile = DATA.presentationProfiles[this.profile];
    const textureUrls = {
      floor: profile.floorTexture === "GrassSample.jpg"
        ? joinedUrl(this.assetBaseUrl, "GrassSample.jpg")
        : joinedUrl(this.archiveAssetBaseUrl, "concrete.png"),
      hashWall: profile.hashWallTexture === "wood.jpg"
        ? joinedUrl(this.archiveAssetBaseUrl, "wood.jpg")
        : joinedUrl(this.assetBaseUrl, "objet39.jpg"),
      grassWall: joinedUrl(this.archiveAssetBaseUrl, "grass.jpg"),
      podiumWall: joinedUrl(this.assetBaseUrl, "Podium.JPG"),
      chain: joinedUrl(this.assetBaseUrl, "3D_Spheres.jpg"),
      ring: joinedUrl(this.assetBaseUrl, "ZRing.png"),
      magician: joinedUrl(this.assetBaseUrl, "Zack.jpg")
    };

    const [floor, hashWall, grassWall, podiumWall, chain, ring, magician] = await Promise.all(
      Object.values(textureUrls).map((url) => this.textureLoader.loadAsync(url))
    );
    const loaded = [floor, hashWall, grassWall, podiumWall, chain, ring, magician];
    if (this.isDisposed) {
      for (const texture of loaded) texture.dispose();
      return;
    }
    for (const texture of loaded) {
      texture.colorSpace = SRGBColorSpace;
      texture.wrapS = ClampToEdgeWrapping;
      texture.wrapT = ClampToEdgeWrapping;
      this.textures.add(texture);
    }
    floor.wrapS = RepeatWrapping;
    floor.wrapT = RepeatWrapping;
    floor.repeat.set(10, 10);

    this.floorMaterial.map = floor;
    this.hashWallMaterial.map = hashWall;
    this.grassWallMaterial.map = grassWall;
    this.podiumWallMaterial.map = podiumWall;
    this.chainMaterial.map = chain;
    this.ringMaterial.map = ring;
    this.effectMaterial.map = magician;
    this.magicianMaterial.map = magician;

    // MeshStandardMaterial multiplies a loaded map by its base color. The
    // earlier fallback tints therefore stayed active after loading and made
    // the archived grass, wood, red-sphere and ZRing art much darker/oranger
    // than both the source files and Suzanne1.png. Keep the colors only as
    // loading fallbacks, then render the recovered bitmaps neutrally.
    for (const material of [
      this.floorMaterial,
      this.hashWallMaterial,
      this.grassWallMaterial,
      this.podiumWallMaterial,
      this.chainMaterial,
      this.ringMaterial,
      this.effectMaterial
    ]) {
      material.color.set(0xffffff);
    }
    this.magicianMaterial.color.set(0xffffff);
    for (const material of [
      this.floorMaterial,
      this.hashWallMaterial,
      this.grassWallMaterial,
      this.podiumWallMaterial,
      this.chainMaterial,
      this.ringMaterial,
      this.effectMaterial,
      this.magicianMaterial
    ]) {
      material.needsUpdate = true;
    }
    this.magicianMaterial.rotation = 0;
    this.magicianMaterial.depthWrite = true;
    this.magicianMaterial.transparent = false;
    this.ringMaterial.side = DoubleSide;
  }
}
