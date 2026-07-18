import {
  AmbientLight,
  Box3,
  Box3Helper,
  BufferGeometry,
  ColorRepresentation,
  DirectionalLight,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Vector3
} from "three";
import levelJson from "./legacy/ballz2011-level1.json";

type Tuple3 = readonly [number, number, number];

type BoundsData = {
  min: Tuple3;
  max: Tuple3;
  size: Tuple3;
};

type GroupData = {
  vertexCount: number;
  vertexStart: number;
  triangleCount: number;
  triangleStart: number;
};

type ComponentData = {
  vertexCount: number;
  bounds: BoundsData;
};

type LevelData = {
  id: "ballz2011-level1";
  name: string;
  source: string;
  sourceSha256: string;
  bytes: number;
  format: string;
  objectName: string;
  vertexStride: number;
  vertexCount: number;
  triangleCount: number;
  archiveBounds: BoundsData;
  normalization: {
    status: "inferred-display-only";
    method: string;
    anchor: Tuple3;
    displayScale: number;
    inverse: string;
    preservesAspectAndOrientation: boolean;
    maxArchiveRoundTripError: number;
  };
  displayBounds: BoundsData;
  topology: {
    connectedComponents: ComponentData[];
    edgeCount: number;
    edgeUseCounts: Record<string, number>;
    closedTwoManifold: boolean;
    adjacentXSeamGap: number;
  };
  materialEvidence: {
    exact: boolean;
    groups: GroupData[];
    materialIndices: number[];
    allUvsAreIdentical: boolean;
    decodedUv: readonly [number, number];
    embeddedTextureNames: string[];
    assessment: string;
  };
  interpretation: {
    exact: string;
    inferred: string;
  };
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
  materialIndexByTriangle: number[];
};

const LEVEL = levelJson as unknown as LevelData;

export type Ballz2011Level1EnvironmentOptions = {
  /** Presentation-only neutral color: Level1.TVM contains no recoverable texture binding. */
  color?: ColorRepresentation;
  edgeColor?: ColorRepresentation;
  includeLighting?: boolean;
  showEdges?: boolean;
  showBounds?: boolean;
  castShadow?: boolean;
};

export type Ballz2011Level1EnvironmentState = {
  id: "ballz2011-level1";
  source: string;
  sourceSha256: string;
  objectName: string;
  ready: true;
  visible: boolean;
  disposed: boolean;
  vertexCount: number;
  triangleCount: number;
  archiveBounds: BoundsData;
  displayBounds: BoundsData;
  componentCount: number;
  componentVertexCounts: number[];
  closedTwoManifold: boolean;
  normalization: LevelData["normalization"];
  materialEvidence: LevelData["materialEvidence"];
  presentation: {
    exactGeometry: true;
    inferredMaterial: true;
    edgesVisible: boolean;
    boundsVisible: boolean;
    color: string;
    edgeColor: string;
  };
  archiveInterpretation: LevelData["interpretation"];
  recommendedCamera: {
    position: [number, number, number];
    target: [number, number, number];
    fovDegrees: number;
    near: number;
    far: number;
  };
};

export const BALLZ2011_LEVEL1_EVIDENCE = Object.freeze({
  id: LEVEL.id,
  source: LEVEL.source,
  sourceSha256: LEVEL.sourceSha256,
  objectName: LEVEL.objectName,
  vertexCount: LEVEL.vertexCount,
  triangleCount: LEVEL.triangleCount,
  archiveBounds: LEVEL.archiveBounds,
  displayBounds: LEVEL.displayBounds,
  normalization: LEVEL.normalization,
  topology: LEVEL.topology,
  materialEvidence: LEVEL.materialEvidence,
  interpretation: LEVEL.interpretation
});

function assertLevelData(): void {
  if (LEVEL.vertexCount !== 828 || LEVEL.triangleCount !== 1648) {
    throw new Error("BallZ 2011 Level 1 geometry counts do not match the audited TVM.");
  }
  if (LEVEL.positions.length !== LEVEL.vertexCount * 3 || LEVEL.normals.length !== LEVEL.vertexCount * 3) {
    throw new Error("BallZ 2011 Level 1 vertex attributes are incomplete.");
  }
  if (LEVEL.uvs.length !== LEVEL.vertexCount * 2 || LEVEL.indices.length !== LEVEL.triangleCount * 3) {
    throw new Error("BallZ 2011 Level 1 UV/index data is incomplete.");
  }
  if (LEVEL.positions.some((value) => !Number.isFinite(value)) || LEVEL.normals.some((value) => !Number.isFinite(value))) {
    throw new Error("BallZ 2011 Level 1 contains a non-finite vertex attribute.");
  }
  if (LEVEL.indices.some((index) => !Number.isInteger(index) || index < 0 || index >= LEVEL.vertexCount)) {
    throw new Error("BallZ 2011 Level 1 contains an out-of-range geometry index.");
  }
  if (
    LEVEL.topology.connectedComponents.length !== 2 ||
    LEVEL.topology.connectedComponents.some((component) => component.vertexCount !== 414) ||
    !LEVEL.topology.closedTwoManifold
  ) {
    throw new Error("BallZ 2011 Level 1 topology differs from the audited paired closed solids.");
  }
}

function buildGeometry(): BufferGeometry {
  assertLevelData();
  const geometry = new BufferGeometry();
  geometry.name = "BallZ 2011 Level1.TVM — Line01 normalized geometry";
  geometry.setAttribute("position", new Float32BufferAttribute(LEVEL.positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(LEVEL.normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(LEVEL.uvs, 2));
  geometry.setIndex(LEVEL.indices);
  for (const group of LEVEL.materialEvidence.groups) {
    geometry.addGroup(group.triangleStart * 3, group.triangleCount * 3, 0);
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Isolated recovery of the distinct BallZ 2011 Release/Media/Level1.TVM.
 * Geometry, normals, winding, topology and aspect are source-exact. The neutral
 * material, lighting, wire edges and 0.1 display scale are explicitly inferred.
 */
export class Ballz2011Level1Environment {
  readonly group = new Group();
  readonly course: Mesh<BufferGeometry, MeshBasicMaterial>;
  readonly edgeOverlay: LineSegments<EdgesGeometry, LineBasicMaterial>;
  readonly boundsHelper: Box3Helper;
  readonly staticData = BALLZ2011_LEVEL1_EVIDENCE;

  private readonly courseMaterial: MeshBasicMaterial;
  private readonly edgeMaterial: LineBasicMaterial;
  private readonly ownedLights: Array<AmbientLight | DirectionalLight> = [];
  private isDisposed = false;

  constructor(options: Ballz2011Level1EnvironmentOptions = {}) {
    const geometry = buildGeometry();
    this.courseMaterial = new MeshBasicMaterial({
      name: "Inferred unlit neutral analysis material — no TVM texture binding exists",
      color: options.color ?? 0xf0d76e,
      side: DoubleSide
    });
    this.course = new Mesh(geometry, this.courseMaterial);
    this.course.name = "Level1.TVM / Line01 exact mesh";
    this.course.castShadow = options.castShadow ?? true;
    this.course.receiveShadow = true;
    this.group.add(this.course);

    this.edgeMaterial = new LineBasicMaterial({
      name: "Inferred diagnostic edge overlay",
      color: options.edgeColor ?? 0x8ae9ff,
      transparent: true,
      opacity: 0.42,
      depthWrite: false
    });
    this.edgeOverlay = new LineSegments(new EdgesGeometry(geometry, 24), this.edgeMaterial);
    this.edgeOverlay.name = "Level1 diagnostic edges (presentation only)";
    this.edgeOverlay.visible = options.showEdges ?? true;
    this.group.add(this.edgeOverlay);

    const box = new Box3(
      new Vector3(...LEVEL.displayBounds.min),
      new Vector3(...LEVEL.displayBounds.max)
    );
    this.boundsHelper = new Box3Helper(box, 0x70e3ff);
    this.boundsHelper.name = "Level1 decoded bounds (presentation only)";
    this.boundsHelper.visible = options.showBounds ?? false;
    this.group.add(this.boundsHelper);

    if (options.includeLighting ?? true) {
      const ambient = new AmbientLight(0xcce1f5, 1.7);
      ambient.name = "Level1 inferred ambient fill";
      const key = new DirectionalLight(0xfff0c7, 3.1);
      key.name = "Level1 inferred key light";
      key.position.set(42, 96, 54);
      key.castShadow = false;
      const rim = new DirectionalLight(0x7bb7ff, 1.6);
      rim.name = "Level1 inferred rim light";
      rim.position.set(-48, 34, -62);
      this.ownedLights.push(ambient, key, rim);
      this.group.add(ambient, key, rim);
    }

    this.group.name = "BallZ 2011 Level 1 — isolated TVM environment";
    this.group.userData.archiveEnvironment = {
      id: LEVEL.id,
      source: LEVEL.source,
      sha256: LEVEL.sourceSha256,
      geometry: "exact",
      material: "inferred-neutral",
      normalization: LEVEL.normalization
    };
  }

  setEdgesVisible(visible: boolean): void {
    this.edgeOverlay.visible = visible;
  }

  setBoundsVisible(visible: boolean): void {
    this.boundsHelper.visible = visible;
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  archiveToDisplay(source: Tuple3, target = new Vector3()): Vector3 {
    const { anchor, displayScale } = LEVEL.normalization;
    return target.set(
      (source[0] - anchor[0]) * displayScale,
      (source[1] - anchor[1]) * displayScale,
      (source[2] - anchor[2]) * displayScale
    );
  }

  displayToArchive(source: Tuple3, target = new Vector3()): Vector3 {
    const { anchor, displayScale } = LEVEL.normalization;
    return target.set(
      source[0] / displayScale + anchor[0],
      source[1] / displayScale + anchor[1],
      source[2] / displayScale + anchor[2]
    );
  }

  getState(): Ballz2011Level1EnvironmentState {
    return {
      id: LEVEL.id,
      source: LEVEL.source,
      sourceSha256: LEVEL.sourceSha256,
      objectName: LEVEL.objectName,
      ready: true,
      visible: this.group.visible && this.group.parent !== null,
      disposed: this.isDisposed,
      vertexCount: LEVEL.vertexCount,
      triangleCount: LEVEL.triangleCount,
      archiveBounds: LEVEL.archiveBounds,
      displayBounds: LEVEL.displayBounds,
      componentCount: LEVEL.topology.connectedComponents.length,
      componentVertexCounts: LEVEL.topology.connectedComponents.map((component) => component.vertexCount),
      closedTwoManifold: LEVEL.topology.closedTwoManifold,
      normalization: LEVEL.normalization,
      materialEvidence: LEVEL.materialEvidence,
      presentation: {
        exactGeometry: true,
        inferredMaterial: true,
        edgesVisible: this.edgeOverlay.visible,
        boundsVisible: this.boundsHelper.visible,
        color: `#${this.courseMaterial.color.getHexString()}`,
        edgeColor: `#${this.edgeMaterial.color.getHexString()}`
      },
      archiveInterpretation: LEVEL.interpretation,
      recommendedCamera: {
        position: [76, 112, 104],
        target: [0, 22, 0],
        fovDegrees: 48,
        near: 0.1,
        far: 500
      }
    };
  }

  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.group.removeFromParent();
    this.group.clear();
    this.course.geometry.dispose();
    this.edgeOverlay.geometry.dispose();
    this.courseMaterial.dispose();
    this.edgeMaterial.dispose();
    this.boundsHelper.geometry.dispose();
    if (Array.isArray(this.boundsHelper.material)) {
      this.boundsHelper.material.forEach((material) => material.dispose());
    } else {
      this.boundsHelper.material.dispose();
    }
    this.ownedLights.length = 0;
  }
}

export function createBallz2011Level1Environment(
  options: Ballz2011Level1EnvironmentOptions = {}
): Ballz2011Level1Environment {
  return new Ballz2011Level1Environment(options);
}
