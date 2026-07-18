import {
  AmbientLight,
  Box3,
  Box3Helper,
  BufferGeometry,
  DirectionalLight,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshPhongMaterial,
  Vector3
} from "three";
import familyJson from "./legacy/ballz-slide-track-family.json";

type Tuple3 = readonly [number, number, number];
type CameraProfile = "overview" | "source-chase";

type BoundsData = {
  min: Tuple3;
  max: Tuple3;
  size: Tuple3;
};

type GeometryData = {
  positions: number[];
  normals: number[];
  uvs: number[] | null;
  indices: number[];
  materialIndexByTriangle: number[];
};

type AssetData = {
  id: string;
  label: string;
  role: string;
  source: string;
  bytes: number;
  sha256: string;
  geometrySha256: string;
  vertexCount: number;
  triangleCount: number;
  bounds: BoundsData;
  objectNames: string[];
  groups: Array<{ vertexCount: number; vertexStart: number; triangleCount: number; triangleStart: number }>;
  materialIndices: number[];
  uv: { present: boolean; uniquePairCount: number; allIdentical: boolean; finite: boolean };
  embeddedTextureNames: string[];
  topology: {
    edgeCount: number;
    edgeUseCounts: Record<string, number>;
    boundaryEdgeCount: number;
    nonManifoldEdgeCount: number;
    connectedComponents: Array<{ vertexCount: number; bounds: BoundsData }>;
  };
  loaderEvidence: string[];
  geometry?: GeometryData;
};

type FamilyData = {
  note: string;
  deDuplication: {
    exactBinaryAliases: Array<{ ids: string[]; sha256: string; assessment: string }>;
    sameNameDistinctBinaries: Array<{ name: string; ids: string[]; hashes: string[]; assessment: string }>;
  };
  sourceBehavior: {
    selectedAssembly: {
      exact: boolean;
      slide: { position: Tuple3; scale: Tuple3; staticMeshBody: boolean };
      ball: { source: string; position: Tuple3; scale: Tuple3; mass: number };
      camera: { kind: string; offset: Tuple3; lookAtOffset: Tuple3; smoothing: number };
      physics: {
        gravity: Tuple3;
        slideDefaultFriction: readonly [number, number];
        ballSlideFriction: readonly [number, number];
        ballSlideBounciness: number;
        softness: number;
      };
      material: {
        ambient: readonly [number, number, number, number];
        diffuse: readonly [number, number, number, number];
        specular: readonly [number, number, number, number];
        power: number;
        emissive: readonly [number, number, number, number];
        textureOverride: null;
      };
      rings: { count: number; first: Tuple3; last: Tuple3; status: string; evidence: string };
      controls: { directions: string[]; impulseMagnitude: number; status: string; evidence: string };
    };
  };
  selection: {
    assetId: string;
    recommendation: string;
    rationale: string;
    exactBoundary: string;
    inferredBoundary: string;
    displayNormalization: {
      status: "inferred-display-only";
      method: string;
      sourceWorldBounds: BoundsData;
      anchor: Tuple3;
      displayScale: number;
      displayBounds: BoundsData;
      inverse: string;
      preservesAspectAndOrientation: boolean;
    };
  };
  statusRecommendations: Array<{ id: string; status: string; reason: string }>;
  assets: AssetData[];
  selectedCompanion: AssetData;
};

const FAMILY = familyJson as unknown as FamilyData;
const BALL = FAMILY.selectedCompanion;
const ASSEMBLY = FAMILY.sourceBehavior.selectedAssembly;
const NORMALIZATION = FAMILY.selection.displayNormalization;

function selectedSlide(): AssetData {
  const asset = FAMILY.assets.find((candidate) => candidate.id === FAMILY.selection.assetId);
  if (!asset?.geometry) throw new Error("The selected Slide1 geometry is absent from the slide-track audit data.");
  return asset;
}

const SLIDE = selectedSlide();
if (!BALL.geometry) throw new Error("The selected Ball geometry is absent from the slide-track audit data.");

export type BallzSlide1EnvironmentOptions = {
  includeSourceLighting?: boolean;
  showBall?: boolean;
  showEdges?: boolean;
  showBounds?: boolean;
};

export type BallzSlide1EnvironmentState = {
  id: "slide1-atmel-active";
  mode: "source-backed-non-race-visit";
  ready: true;
  visible: boolean;
  disposed: boolean;
  playable: false;
  playabilityReason: string;
  slide: {
    source: string;
    sha256: string;
    vertexCount: number;
    triangleCount: number;
    localBounds: BoundsData;
    sourceTransform: { position: Tuple3; scale: Tuple3 };
    visible: boolean;
  };
  ball: {
    source: string;
    sha256: string;
    vertexCount: number;
    triangleCount: number;
    sourceTransform: { position: Tuple3; scale: Tuple3 };
    displayPosition: [number, number, number];
    visible: boolean;
    mass: number;
  };
  normalization: FamilyData["selection"]["displayNormalization"];
  sourceAssembly: FamilyData["sourceBehavior"]["selectedAssembly"];
  evidenceBoundary: {
    exact: string;
    inferred: string;
    sourceEmbeddedTexturesIgnored: string[];
    reasonTexturesIgnored: string;
  };
  diagnostics: {
    edgesVisible: boolean;
    boundsVisible: boolean;
  };
  cameraProfiles: Record<CameraProfile, { status: "exact-translated" | "inferred-overview"; position: [number, number, number]; target: [number, number, number]; fovDegrees: number }>;
  familyStatusRecommendations: Array<{ id: string; status: string; reason: string }>;
};

export const BALLZ_SLIDE_TRACK_FAMILY_EVIDENCE = Object.freeze({
  deDuplication: FAMILY.deDuplication,
  selection: FAMILY.selection,
  statusRecommendations: FAMILY.statusRecommendations,
  assets: FAMILY.assets.map((asset) => ({
    id: asset.id,
    label: asset.label,
    role: asset.role,
    source: asset.source,
    sha256: asset.sha256,
    vertexCount: asset.vertexCount,
    triangleCount: asset.triangleCount,
    bounds: asset.bounds,
    materialIndices: asset.materialIndices,
    uv: asset.uv,
    topology: asset.topology,
    loaderEvidence: asset.loaderEvidence
  }))
});

function assertGeometry(asset: AssetData): GeometryData {
  const geometry = asset.geometry;
  if (!geometry) throw new Error(`${asset.id} has no exported geometry.`);
  if (geometry.positions.length !== asset.vertexCount * 3 || geometry.normals.length !== asset.vertexCount * 3) {
    throw new Error(`${asset.id} has incomplete vertex attributes.`);
  }
  if (geometry.uvs && geometry.uvs.length !== asset.vertexCount * 2) {
    throw new Error(`${asset.id} has incomplete UV data.`);
  }
  if (geometry.indices.length !== asset.triangleCount * 3) {
    throw new Error(`${asset.id} has incomplete triangle data.`);
  }
  if (geometry.indices.some((index) => !Number.isInteger(index) || index < 0 || index >= asset.vertexCount)) {
    throw new Error(`${asset.id} has an out-of-range triangle index.`);
  }
  return geometry;
}

function buildGeometry(asset: AssetData): BufferGeometry {
  const data = assertGeometry(asset);
  const geometry = new BufferGeometry();
  geometry.name = `${asset.label} exact TVM geometry`;
  geometry.setAttribute("position", new Float32BufferAttribute(data.positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(data.normals, 3));
  if (data.uvs) geometry.setAttribute("uv", new Float32BufferAttribute(data.uvs, 2));
  geometry.setIndex(data.indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function tupleColor(tuple: readonly [number, number, number, number]): number {
  const red = Math.round(tuple[0] * 255);
  const green = Math.round(tuple[1] * 255);
  const blue = Math.round(tuple[2] * 255);
  return (red << 16) | (green << 8) | blue;
}

/**
 * Source-backed visit of the active Atmel/CubX Slide1 assembly.
 *
 * It deliberately does not simulate gameplay. The original PushBall path is
 * incomplete (only backward remains active), and the 100 source rings are
 * explicitly temporary test positions. Main integration can safely expose the
 * group as a visit now and add collision only under a separately labeled port.
 */
export class BallzSlide1Environment {
  readonly group = new Group();
  readonly sourceAssemblyGroup = new Group();
  readonly slide: Mesh<BufferGeometry, MeshPhongMaterial>;
  readonly ball: Mesh<BufferGeometry, MeshPhongMaterial>;
  readonly edgeOverlay: LineSegments<EdgesGeometry, LineBasicMaterial>;
  readonly boundsHelper: Box3Helper;
  readonly staticData = BALLZ_SLIDE_TRACK_FAMILY_EVIDENCE;

  private readonly slideMaterial: MeshPhongMaterial;
  private readonly ballMaterial: MeshPhongMaterial;
  private readonly edgeMaterial: LineBasicMaterial;
  private readonly ownedLights: Array<AmbientLight | DirectionalLight> = [];
  private isDisposed = false;

  constructor(options: BallzSlide1EnvironmentOptions = {}) {
    const material = ASSEMBLY.material;
    this.slideMaterial = new MeshPhongMaterial({
      name: "TV3D StdMat translation — source overrides every Slide1 group",
      color: tupleColor(material.diffuse),
      specular: tupleColor(material.specular),
      emissive: tupleColor(material.emissive),
      shininess: material.power,
      side: DoubleSide
    });
    this.ballMaterial = this.slideMaterial.clone();
    this.ballMaterial.name = "TV3D StdMat translation — Ball.tvm";

    const slideGeometry = buildGeometry(SLIDE);
    this.slide = new Mesh(slideGeometry, this.slideMaterial);
    this.slide.name = "Active Atmel Slide1.tvm";
    this.slide.position.set(...ASSEMBLY.slide.position);
    this.slide.scale.set(...ASSEMBLY.slide.scale);
    this.slide.castShadow = true;
    this.slide.receiveShadow = true;
    this.sourceAssemblyGroup.add(this.slide);

    const ballGeometry = buildGeometry(BALL);
    this.ball = new Mesh(ballGeometry, this.ballMaterial);
    this.ball.name = "Active Atmel Ball.tvm at exact source spawn";
    this.ball.position.set(...ASSEMBLY.ball.position);
    this.ball.scale.set(...ASSEMBLY.ball.scale);
    this.ball.visible = options.showBall ?? true;
    this.ball.castShadow = true;
    this.ball.receiveShadow = true;
    this.sourceAssemblyGroup.add(this.ball);

    this.edgeMaterial = new LineBasicMaterial({
      name: "Slide1 presentation-only diagnostic edges",
      color: 0x243d54,
      transparent: true,
      opacity: 0.5,
      depthWrite: false
    });
    this.edgeOverlay = new LineSegments(new EdgesGeometry(slideGeometry, 28), this.edgeMaterial);
    this.edgeOverlay.name = "Slide1 presentation-only edge overlay";
    this.edgeOverlay.visible = options.showEdges ?? true;
    this.slide.add(this.edgeOverlay);

    this.sourceAssemblyGroup.name = "Exact Slide1 source-world assembly before display normalization";
    this.sourceAssemblyGroup.scale.setScalar(NORMALIZATION.displayScale);
    this.sourceAssemblyGroup.position.set(
      -NORMALIZATION.anchor[0] * NORMALIZATION.displayScale,
      -NORMALIZATION.anchor[1] * NORMALIZATION.displayScale,
      -NORMALIZATION.anchor[2] * NORMALIZATION.displayScale
    );
    this.group.add(this.sourceAssemblyGroup);

    const displayBox = new Box3(
      new Vector3(...NORMALIZATION.displayBounds.min),
      new Vector3(...NORMALIZATION.displayBounds.max)
    );
    this.boundsHelper = new Box3Helper(displayBox, 0x68ddff);
    this.boundsHelper.name = "Slide1 presentation-only normalized bounds";
    this.boundsHelper.visible = options.showBounds ?? false;
    this.group.add(this.boundsHelper);

    if (options.includeSourceLighting ?? true) {
      // TV3D's material ambient term has no direct Three material equivalent.
      // A 0.1 ambient light plus the exact white directional-light vector is
      // the closest transparent translation, and is reported as such in state.
      const ambient = new AmbientLight(0xffffff, material.ambient[0]);
      ambient.name = "TV3D StdMat ambient-term translation";
      const directional = new DirectionalLight(0xffffff, 1);
      directional.name = "Area.cpp global directional light (-1,-1,+1)";
      directional.position.set(80, 80, -80);
      directional.target.position.set(0, 20, 0);
      this.ownedLights.push(ambient, directional);
      this.group.add(ambient, directional, directional.target);
    }

    this.group.name = "BallZ Slide 1 — source-backed non-race visit";
    this.group.userData.archiveEnvironment = {
      id: SLIDE.id,
      source: SLIDE.source,
      sha256: SLIDE.sha256,
      geometry: "exact",
      assembly: "exact",
      gameplay: "not-implemented-original-input-incomplete",
      normalization: NORMALIZATION
    };
  }

  sourceWorldToDisplay(source: Tuple3, target = new Vector3()): Vector3 {
    return target.set(
      (source[0] - NORMALIZATION.anchor[0]) * NORMALIZATION.displayScale,
      (source[1] - NORMALIZATION.anchor[1]) * NORMALIZATION.displayScale,
      (source[2] - NORMALIZATION.anchor[2]) * NORMALIZATION.displayScale
    );
  }

  displayToSourceWorld(source: Tuple3, target = new Vector3()): Vector3 {
    return target.set(
      source[0] / NORMALIZATION.displayScale + NORMALIZATION.anchor[0],
      source[1] / NORMALIZATION.displayScale + NORMALIZATION.anchor[1],
      source[2] / NORMALIZATION.displayScale + NORMALIZATION.anchor[2]
    );
  }

  getCameraProfile(profile: CameraProfile): BallzSlide1EnvironmentState["cameraProfiles"][CameraProfile] {
    const ballTarget = this.sourceWorldToDisplay(ASSEMBLY.ball.position);
    if (profile === "source-chase") {
      const offset = new Vector3(...ASSEMBLY.camera.offset).multiplyScalar(NORMALIZATION.displayScale);
      return {
        status: "exact-translated",
        position: ballTarget.clone().add(offset).toArray(),
        target: ballTarget.toArray(),
        fovDegrees: 45
      };
    }
    return {
      status: "inferred-overview",
      position: [32, 54, 56],
      target: [0, 22, 0],
      fovDegrees: 48
    };
  }

  setEdgesVisible(visible: boolean): void {
    this.edgeOverlay.visible = visible;
  }

  setBoundsVisible(visible: boolean): void {
    this.boundsHelper.visible = visible;
  }

  setBallVisible(visible: boolean): void {
    this.ball.visible = visible;
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  getState(): BallzSlide1EnvironmentState {
    const ballDisplay = this.sourceWorldToDisplay(ASSEMBLY.ball.position).toArray();
    return {
      id: "slide1-atmel-active",
      mode: "source-backed-non-race-visit",
      ready: true,
      visible: this.group.visible && this.group.parent !== null,
      disposed: this.isDisposed,
      playable: false,
      playabilityReason: FAMILY.selection.recommendation,
      slide: {
        source: SLIDE.source,
        sha256: SLIDE.sha256,
        vertexCount: SLIDE.vertexCount,
        triangleCount: SLIDE.triangleCount,
        localBounds: SLIDE.bounds,
        sourceTransform: { position: ASSEMBLY.slide.position, scale: ASSEMBLY.slide.scale },
        visible: this.slide.visible
      },
      ball: {
        source: BALL.source,
        sha256: BALL.sha256,
        vertexCount: BALL.vertexCount,
        triangleCount: BALL.triangleCount,
        sourceTransform: { position: ASSEMBLY.ball.position, scale: ASSEMBLY.ball.scale },
        displayPosition: ballDisplay,
        visible: this.ball.visible,
        mass: ASSEMBLY.ball.mass
      },
      normalization: NORMALIZATION,
      sourceAssembly: ASSEMBLY,
      evidenceBoundary: {
        exact: FAMILY.selection.exactBoundary,
        inferred: FAMILY.selection.inferredBoundary,
        sourceEmbeddedTexturesIgnored: SLIDE.embeddedTextureNames,
        reasonTexturesIgnored: "CLSlideObject calls SetMaterial(StdMat,-1) with no SetTexture; the source runtime intentionally overrides all TVM material groups with its untextured managed material."
      },
      diagnostics: {
        edgesVisible: this.edgeOverlay.visible,
        boundsVisible: this.boundsHelper.visible
      },
      cameraProfiles: {
        overview: this.getCameraProfile("overview"),
        "source-chase": this.getCameraProfile("source-chase")
      },
      familyStatusRecommendations: FAMILY.statusRecommendations
    };
  }

  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.group.removeFromParent();
    this.group.clear();
    this.slide.geometry.dispose();
    this.ball.geometry.dispose();
    this.edgeOverlay.geometry.dispose();
    this.boundsHelper.geometry.dispose();
    if (Array.isArray(this.boundsHelper.material)) this.boundsHelper.material.forEach((material) => material.dispose());
    else this.boundsHelper.material.dispose();
    this.slideMaterial.dispose();
    this.ballMaterial.dispose();
    this.edgeMaterial.dispose();
    this.ownedLights.length = 0;
  }
}

export function createBallzSlide1Environment(options: BallzSlide1EnvironmentOptions = {}): BallzSlide1Environment {
  return new BallzSlide1Environment(options);
}
