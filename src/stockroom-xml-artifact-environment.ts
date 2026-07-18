import {
  AmbientLight,
  BoxGeometry,
  DirectionalLight,
  GridHelper,
  Group,
  LoadingManager,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3
} from "three";
import archiveJson from "./legacy/stockroom-xml-artifacts.json";

export type StockroomXmlArtifactId = "base-scene" | "test1";

type Tuple3 = [number, number, number];

type SerializedObject = {
  index: number;
  type: number;
  action: string;
  name: string;
  enabled: boolean;
  mass: number;
  massAttributeName: "Masse" | "masse" | null;
  meshControlled: boolean;
  newtonMaterial: number;
  position: Tuple3 | null;
  rotation: Tuple3 | null;
  scale: Tuple3 | null;
  pathToMesh: string;
  textureName: string;
  absentSerializedFields: string[];
  signatureSha256: string;
};

type SourceCopy = {
  source: string;
  bytes: number;
  sha256: string;
  whitespaceSemanticSha256: string;
};

type ArtifactDocument = {
  id: StockroomXmlArtifactId;
  label: string;
  canonicalSource: string;
  bytes: number;
  sha256: string;
  semanticSha256: string;
  copies: SourceCopy[];
  copiesByteIdentical: boolean;
  copiesSemanticallyEquivalent: boolean;
  root: "Scene3D";
  schemaGeneration: string;
  classification: string;
  assessment: string;
  header: {
    version: "V1_1" | "V1_2";
    actions: Record<string, string>;
    physicsMaterials: Record<string, string>;
  };
  filepathASCII: string;
  mapSize: number | null;
  ringPositionCount: number;
  ringPositionListSerialized: boolean;
  objectCount: number;
  uniqueObjectSignatureCount: number;
  distinctSerializedTransformCount: number;
  exactOverlapGroupSizes: number[];
  objects: SerializedObject[];
  unresolvedRecords: Array<Record<string, unknown>>;
  serializedSubsystems: Record<string, boolean>;
};

type ArchiveData = {
  schema: "graphysx.stockroom-xml-artifacts/v1";
  classification: {
    distinctAssembledScenes: number;
    serializerArtifacts: number;
    conclusion: string;
  };
  textureCandidate: {
    serializedToken: string;
    status: string;
    source: string;
    bytes: number;
    sha256: string;
    browserPath: string;
    policy: string;
  };
  documents: ArtifactDocument[];
  fidelityBoundary: {
    exact: string[];
    unresolved: string[];
    forbiddenInference: string[];
  };
};

const DATA = archiveJson as unknown as ArchiveData;

export type StockroomXmlArtifactObjectState = {
  index: number;
  name: string;
  action: string;
  enabled: boolean;
  mass: number;
  massAttributeName: "Masse" | "masse" | null;
  meshControlled: boolean;
  newtonMaterial: number;
  position: Tuple3 | null;
  sourceRotation: Tuple3 | null;
  appliedInspectionRotation: Tuple3;
  scale: Tuple3 | null;
  textureName: string;
  signatureSha256: string;
  rendered: boolean;
  exactTransform: boolean;
};

export type StockroomXmlArtifactEnvironmentState = {
  schema: ArchiveData["schema"];
  mode: "serializer-artifact-inspection";
  selectedArtifactId: StockroomXmlArtifactId;
  source: string;
  sourceSha256: string;
  sourceBytes: number;
  sourceCopies: SourceCopy[];
  copyEquivalence: {
    byteIdentical: boolean;
    semanticEquivalent: boolean;
  };
  version: "V1_1" | "V1_2";
  root: "Scene3D";
  classification: string;
  assessment: string;
  distinctAssembledScene: false;
  ready: boolean;
  disposed: boolean;
  visible: boolean;
  objectCount: number;
  renderedObjectCount: number;
  uniqueObjectSignatureCount: number;
  distinctSerializedTransformCount: number;
  exactOverlapGroupSizes: number[];
  mapSize: number | null;
  ringPositionCount: number;
  serializedSubsystems: Record<string, boolean>;
  material: {
    serializedTokens: string[];
    candidateTextureEnabled: boolean;
    candidateTextureReady: boolean;
    candidateStatus: string;
    candidateSource: string;
    candidateSha256: string;
    candidatePolicy: string;
    inspectionFallback: string;
  };
  physics: {
    metadataPreserved: true;
    simulated: false;
    zeroMassRecordCount: number;
    reason: string;
  };
  inspectionAdapters: {
    identityRotationForAbsentSourceFieldCount: number;
    inspectionLightCount: number;
    gridIsSourceContent: false;
    objectsRepositioned: false;
  };
  camera: {
    position: Tuple3;
    lookAt: Tuple3;
    orbitAngleRadians: number;
  };
  objects: StockroomXmlArtifactObjectState[];
  unresolvedRecords: Array<Record<string, unknown>>;
  evidenceBoundary: ArchiveData["fidelityBoundary"];
};

export type StockroomXmlArtifactEnvironmentOptions = {
  loadingManager?: LoadingManager;
};

const LOOK_AT = new Vector3(0, 0, 0);

function documentById(id: StockroomXmlArtifactId): ArtifactDocument {
  const document = DATA.documents.find((entry) => entry.id === id);
  if (!document) throw new RangeError(`Unknown StockRoom XML artifact: ${id}`);
  return document;
}

/**
 * Exact-transform inspection for BaseScene.xml and test1.xml.
 *
 * The source group never separates coincident records or adds authored world
 * content. Lighting, grid, camera and the neutral fallback material are kept as
 * disclosed inspection adapters. The exact same-folder twoway.jpg candidate is
 * opt-in because the extensionless v1.1 runtime binding is not source-proven.
 */
export class StockroomXmlArtifactEnvironment {
  readonly group = new Group();
  readonly ready: Promise<void>;

  private readonly sourceGroup = new Group();
  private readonly inspectionGroup = new Group();
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly baseMaterial = new MeshStandardMaterial({
    color: 0x79b7d7,
    roughness: 0.72,
    metalness: 0.02,
    name: "BaseScene inspection fallback (not serialized)"
  });
  private readonly testMaterial = new MeshStandardMaterial({
    color: 0xd0dde6,
    roughness: 0.78,
    metalness: 0,
    name: "test1 inspection fallback (no texture serialized)"
  });
  private readonly textureLoader: TextureLoader;
  private candidateTexture: Texture | null = null;
  private candidateTextureReady = false;
  private candidateTextureEnabled = false;
  private selectedArtifactId: StockroomXmlArtifactId = "base-scene";
  private renderedMeshes: Mesh[] = [];
  private grid: GridHelper | null = null;
  private orbitAngle = 0;
  private cameraPosition = new Vector3();
  private disposed = false;

  constructor(options: StockroomXmlArtifactEnvironmentOptions = {}) {
    this.textureLoader = new TextureLoader(options.loadingManager);
    this.group.name = "StockRoom XML serializer artifact inspection";
    this.sourceGroup.name = "Exact serialized source records";
    this.inspectionGroup.name = "Disclosed non-source inspection aids";
    this.group.add(this.sourceGroup, this.inspectionGroup);

    const ambient = new AmbientLight(0xc9e3ef, 1.35);
    ambient.name = "Inspection ambient (not serialized)";
    const key = new DirectionalLight(0xfff0d7, 2.7);
    key.name = "Inspection key (not serialized)";
    key.position.set(8, 14, 10);
    const rim = new DirectionalLight(0x73c8ff, 1.25);
    rim.name = "Inspection rim (not serialized)";
    rim.position.set(-9, 7, -8);
    this.inspectionGroup.add(ambient, key, rim);

    this.rebuildSource();
    this.updateCameraPosition();
    this.ready = this.loadCandidateTexture();
  }

  selectArtifact(id: StockroomXmlArtifactId, camera?: PerspectiveCamera): StockroomXmlArtifactEnvironmentState {
    documentById(id);
    this.selectedArtifactId = id;
    if (id !== "base-scene") this.candidateTextureEnabled = false;
    this.orbitAngle = 0;
    this.rebuildSource();
    this.updateCameraPosition();
    if (camera) this.applyToCamera(camera);
    return this.getState();
  }

  setCandidateTextureEnabled(enabled: boolean): StockroomXmlArtifactEnvironmentState {
    this.candidateTextureEnabled = Boolean(enabled);
    this.applyMaterials();
    return this.getState();
  }

  update(deltaSeconds: number, orbitInput = 0, camera?: PerspectiveCamera): StockroomXmlArtifactEnvironmentState {
    if (!this.disposed && Number.isFinite(deltaSeconds) && Number.isFinite(orbitInput)) {
      this.orbitAngle = MathUtils.euclideanModulo(
        this.orbitAngle + MathUtils.clamp(orbitInput, -1, 1) * Math.max(0, deltaSeconds) * 0.48,
        Math.PI * 2
      );
      this.updateCameraPosition();
    }
    if (camera) this.applyToCamera(camera);
    return this.getState();
  }

  orbitByRadians(delta: number, camera?: PerspectiveCamera): StockroomXmlArtifactEnvironmentState {
    if (!this.disposed && Number.isFinite(delta)) {
      this.orbitAngle = MathUtils.euclideanModulo(this.orbitAngle + delta, Math.PI * 2);
    }
    if (camera) this.applyToCamera(camera);
    return this.getState();
  }

  resetOrbit(camera?: PerspectiveCamera): StockroomXmlArtifactEnvironmentState {
    this.orbitAngle = 0;
    this.updateCameraPosition();
    if (camera) this.applyToCamera(camera);
    return this.getState();
  }

  applyToCamera(camera: PerspectiveCamera): void {
    const isBase = this.selectedArtifactId === "base-scene";
    camera.position.copy(this.cameraPosition);
    camera.lookAt(LOOK_AT);
    camera.fov = isBase ? 42 : 40;
    camera.near = 0.05;
    camera.far = isBase ? 100 : 30;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  getState(): StockroomXmlArtifactEnvironmentState {
    const document = documentById(this.selectedArtifactId);
    const renderedIndices = new Set(this.renderedMeshes.map((mesh) => mesh.userData.sourceIndex as number));
    const serializedTokens = [...new Set(document.objects.map((object) => object.textureName).filter(Boolean))];
    return {
      schema: DATA.schema,
      mode: "serializer-artifact-inspection",
      selectedArtifactId: document.id,
      source: document.canonicalSource,
      sourceSha256: document.sha256,
      sourceBytes: document.bytes,
      sourceCopies: document.copies,
      copyEquivalence: {
        byteIdentical: document.copiesByteIdentical,
        semanticEquivalent: document.copiesSemanticallyEquivalent
      },
      version: document.header.version,
      root: document.root,
      classification: document.classification,
      assessment: document.assessment,
      distinctAssembledScene: false,
      ready: this.candidateTextureReady,
      disposed: this.disposed,
      visible: this.group.visible && this.group.parent !== null,
      objectCount: document.objectCount,
      renderedObjectCount: renderedIndices.size,
      uniqueObjectSignatureCount: document.uniqueObjectSignatureCount,
      distinctSerializedTransformCount: document.distinctSerializedTransformCount,
      exactOverlapGroupSizes: document.exactOverlapGroupSizes,
      mapSize: document.mapSize,
      ringPositionCount: document.ringPositionCount,
      serializedSubsystems: document.serializedSubsystems,
      material: {
        serializedTokens,
        candidateTextureEnabled: this.candidateTextureEnabled,
        candidateTextureReady: this.candidateTextureReady,
        candidateStatus: DATA.textureCandidate.status,
        candidateSource: DATA.textureCandidate.source,
        candidateSha256: DATA.textureCandidate.sha256,
        candidatePolicy: DATA.textureCandidate.policy,
        inspectionFallback: document.id === "base-scene"
          ? "Blue neutral inspection material; not serialized."
          : "White neutral inspection material; TextureName is empty."
      },
      physics: {
        metadataPreserved: true,
        simulated: false,
        zeroMassRecordCount: document.objects.filter((object) => object.mass === 0).length,
        reason: "No gravity, timestep, ground or interaction configuration is serialized; later host lineage treats mass 0 physics primitives as static."
      },
      inspectionAdapters: {
        identityRotationForAbsentSourceFieldCount: document.objects.filter((object) => object.rotation === null).length,
        inspectionLightCount: 3,
        gridIsSourceContent: false,
        objectsRepositioned: false
      },
      camera: {
        position: this.cameraPosition.toArray(),
        lookAt: LOOK_AT.toArray(),
        orbitAngleRadians: this.orbitAngle
      },
      objects: document.objects.map((object) => ({
        index: object.index,
        name: object.name,
        action: object.action,
        enabled: object.enabled,
        mass: object.mass,
        massAttributeName: object.massAttributeName,
        meshControlled: object.meshControlled,
        newtonMaterial: object.newtonMaterial,
        position: object.position,
        sourceRotation: object.rotation,
        appliedInspectionRotation: object.rotation ?? [0, 0, 0],
        scale: object.scale,
        textureName: object.textureName,
        signatureSha256: object.signatureSha256,
        rendered: renderedIndices.has(object.index),
        exactTransform: object.position !== null && object.scale !== null
      })),
      unresolvedRecords: document.unresolvedRecords,
      evidenceBoundary: DATA.fidelityBoundary
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.group.removeFromParent();
    this.group.clear();
    this.geometry.dispose();
    this.baseMaterial.dispose();
    this.testMaterial.dispose();
    this.candidateTexture?.dispose();
    this.renderedMeshes.length = 0;
    this.grid = null;
  }

  private rebuildSource(): void {
    this.sourceGroup.clear();
    this.renderedMeshes.length = 0;
    const document = documentById(this.selectedArtifactId);
    for (const object of document.objects) {
      if (!object.enabled || object.action !== "PHYSICCUBE" || !object.position || !object.scale) continue;
      const mesh = new Mesh(this.geometry, document.id === "base-scene" ? this.baseMaterial : this.testMaterial);
      mesh.name = `${document.label} Obj3D[${object.index}] ${object.name}`;
      mesh.position.set(...object.position);
      const rotation = object.rotation ?? [0, 0, 0];
      mesh.rotation.set(...rotation.map(MathUtils.degToRad) as Tuple3);
      mesh.scale.set(...object.scale);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.userData.sourceIndex = object.index;
      mesh.userData.sourceRotationSerialized = object.rotation !== null;
      this.sourceGroup.add(mesh);
      this.renderedMeshes.push(mesh);
    }
    if (this.grid) this.inspectionGroup.remove(this.grid);
    const isBase = document.id === "base-scene";
    this.grid = new GridHelper(isBase ? 40 : 8, isBase ? 20 : 16, 0x3d7187, 0x27414d);
    this.grid.name = "Inspection grid (not serialized)";
    this.grid.position.y = isBase ? -5.02 : -0.52;
    this.inspectionGroup.add(this.grid);
    this.applyMaterials();
  }

  private applyMaterials(): void {
    const baseHasCandidate = this.candidateTextureEnabled && this.candidateTextureReady && this.candidateTexture;
    this.baseMaterial.map = baseHasCandidate ? this.candidateTexture : null;
    this.baseMaterial.color.setHex(baseHasCandidate ? 0xffffff : 0x79b7d7);
    this.baseMaterial.needsUpdate = true;
  }

  private updateCameraPosition(): void {
    const isBase = this.selectedArtifactId === "base-scene";
    const radius = isBase ? 25 : 5.7;
    const height = isBase ? 14 : 3.1;
    this.cameraPosition.set(
      Math.sin(this.orbitAngle + 0.72) * radius,
      height,
      Math.cos(this.orbitAngle + 0.72) * radius
    );
  }

  private async loadCandidateTexture(): Promise<void> {
    const texture = await this.textureLoader.loadAsync(DATA.textureCandidate.browserPath);
    if (this.disposed) {
      texture.dispose();
      return;
    }
    texture.colorSpace = SRGBColorSpace;
    this.candidateTexture = texture;
    this.candidateTextureReady = true;
    this.applyMaterials();
  }
}

export async function createStockroomXmlArtifactEnvironment(
  options: StockroomXmlArtifactEnvironmentOptions = {}
): Promise<StockroomXmlArtifactEnvironment> {
  const environment = new StockroomXmlArtifactEnvironment(options);
  await environment.ready;
  return environment;
}
