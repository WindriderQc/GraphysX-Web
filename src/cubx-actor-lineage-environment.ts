import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3
} from "three";
import lineageJson from "./legacy/cubx-actor-lineage.json";
import geometryJson from "./legacy/cubx-actor-inspection-geometry.json";

export type CubxActorClipFamily = "closed" | "get" | "rot" | "open-full" | "open-solo";
export type CubxActorPlaybackDirection = 1 | -1;
export type CubxActorPairIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type CubxActorClickIndex = CubxActorPairIndex | 8;

type NumericKey = number[];

type AuditHierarchyNode = {
  id: number;
  parent: number;
  name: string;
  meshDataIndex: number;
  initialLocalMatrix: number[];
};

type AuditGeometry = {
  hierarchyNodeId: number;
  ownerName: string;
  vertexCount: number;
  triangleCount: number;
  geometryPayloadSha256: string;
};

type AuditTrack = {
  nodeId: number;
  nodeName: string;
  substantive: { position: boolean; rotation: boolean; scale: boolean };
  positions: NumericKey[];
  rotations: NumericKey[];
  scales: NumericKey[];
};

type AuditAsset = {
  id: string;
  family: string;
  filename: string;
  sha256: string;
  timing: {
    rangeStartFrame: number;
    rangeEndFrame: number;
    framesPerSecond: number;
    durationSeconds: number;
    motionCompletedAtFrame: number;
    motionDurationSeconds: number;
    terminalHoldFrames: number;
    terminalHoldSeconds: number;
  };
  hierarchy: AuditHierarchyNode[];
  geometryTotals: { vertices: number; triangles: number };
  geometry: AuditGeometry[];
  decodedSubstantiveTracks: AuditTrack[];
};

type ClickFlow = {
  clickIndex: number;
  clickedMesh: string;
  clickedMeshLocalCenter: number[];
  exactSpatialBoxLabel: string;
  sourceSelectedCube: number;
  actorArrayIndex: number;
  actorSlotInitialized: boolean;
  actorFilename: string | null;
  actorFilenameBoxLabel: string | null;
  renderedByHostLoop: boolean;
  result: string;
};

type ActorGeometryPayload = {
  geometryPayloadSha256: string;
  vertexCount: number;
  triangleCount: number;
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
};

type CompanionGeometry = {
  filename: string;
  sourceSha256: string;
  vertexCount: number;
  triangleCount: number;
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
};

type LineageData = {
  schema: string;
  clickFlow: ClickFlow[];
  hostSourceAudit: { defects: string[] };
  mappingAssessment: { resolvesMissingCubzClickToBoxMapping: boolean; whyNotResolved: string; safeReuse: string };
  materialAndHostTransform: {
    actorPosition: number[];
    constructorSizeArgument: number;
    scaleStatus: string;
    materialOverride: Record<string, unknown>;
  };
  assetCensus: { assetPathEvidence: Record<string, unknown> };
  assets: AuditAsset[];
};

type InspectionGeometryData = {
  schema: string;
  coordinateBoundary: string;
  actorGeometryPayloads: ActorGeometryPayload[];
  companionGeometryAssets: Record<string, CompanionGeometry>;
};

function isFiniteNumberArray(value: unknown, length?: number): value is number[] {
  return Array.isArray(value) && (length === undefined || value.length === length) && value.every((field) => typeof field === "number" && Number.isFinite(field));
}

function validateData(lineageValue: unknown, geometryValue: unknown): { lineage: LineageData; geometry: InspectionGeometryData } {
  if (typeof lineageValue !== "object" || lineageValue === null) throw new TypeError("CubXActor lineage audit must be an object.");
  if (typeof geometryValue !== "object" || geometryValue === null) throw new TypeError("CubXActor inspection geometry must be an object.");
  const lineage = lineageValue as Record<string, unknown>;
  const geometry = geometryValue as Record<string, unknown>;
  if (lineage.schema !== "graphysx.cubx-actor-lineage-audit/v1" || !Array.isArray(lineage.assets) || !Array.isArray(lineage.clickFlow)) {
    throw new TypeError("CubXActor lineage audit schema is incompatible.");
  }
  if (geometry.schema !== "graphysx.cubx-actor-inspection-geometry/v1" || !Array.isArray(geometry.actorGeometryPayloads)) {
    throw new TypeError("CubXActor inspection geometry schema is incompatible.");
  }
  for (const asset of lineage.assets as Array<Record<string, unknown>>) {
    if (typeof asset.id !== "string" || !Array.isArray(asset.hierarchy) || !Array.isArray(asset.geometry) || !Array.isArray(asset.decodedSubstantiveTracks)) {
      throw new TypeError("CubXActor audit contains an invalid asset record.");
    }
    for (const node of asset.hierarchy as Array<Record<string, unknown>>) {
      if (!isFiniteNumberArray(node.initialLocalMatrix, 16)) throw new TypeError(`CubXActor node ${String(node.name)} has no 4x4 local matrix.`);
    }
    for (const track of asset.decodedSubstantiveTracks as Array<Record<string, unknown>>) {
      for (const [field, width] of [["positions", 4], ["rotations", 5], ["scales", 4]] as const) {
        if (!Array.isArray(track[field]) || !(track[field] as unknown[]).every((key) => isFiniteNumberArray(key, width))) {
          throw new TypeError(`CubXActor track ${String(track.nodeName)} has invalid ${field}.`);
        }
      }
    }
  }
  for (const payload of geometry.actorGeometryPayloads as Array<Record<string, unknown>>) {
    if (typeof payload.geometryPayloadSha256 !== "string" || !isFiniteNumberArray(payload.positions) || !isFiniteNumberArray(payload.normals) || !isFiniteNumberArray(payload.uvs) || !isFiniteNumberArray(payload.indices)) {
      throw new TypeError("CubXActor geometry payload is invalid.");
    }
  }
  return {
    lineage: lineageValue as unknown as LineageData,
    geometry: geometryValue as unknown as InspectionGeometryData
  };
}

const { lineage: LINEAGE, geometry: INSPECTION_GEOMETRY } = validateData(lineageJson, geometryJson);
const ASSETS = new Map(LINEAGE.assets.map((asset) => [asset.id, asset]));
const ACTOR_PAYLOADS = new Map(INSPECTION_GEOMETRY.actorGeometryPayloads.map((payload) => [payload.geometryPayloadSha256, payload]));

export const CUBX_ACTOR_LINEAGE_FIDELITY = Object.freeze({
  status: "isolated-source-evidence-inspector",
  separateFromCubz: true,
  reason: LINEAGE.mappingAssessment.whyNotResolved,
  exact: Object.freeze([
    "TVA/TVM hashes, decoded geometry, hierarchy, bind matrices, source frame ranges and stored MANI keys",
    "click mesh geometry and click -> actor-slot host calls",
    "30 fps timing including Get/Open terminal holds",
    "host position, unit scale caused by commented Size scaling, and StdMat constants"
  ]),
  inferred: Object.freeze([
    "raw TV3D source-order matrices/quaternions are applied directly to Three.js for inspection",
    "fractional frames use normalized shortest-arc quaternion interpolation and linear vector interpolation",
    "diagnostic colors, lighting, grid, camera and click-proxy visibility are modern inspection aids"
  ]),
  notClaimed: Object.freeze([
    "TV3D handedness or original engine interpolation",
    "visual continuity between separately authored actor swaps",
    "a stable semantic click-index -> BoxNN mapping",
    "host execution of CubXRot1..7 or CubeOpensolo"
  ]),
  coordinateBoundary: INSPECTION_GEOMETRY.coordinateBoundary
});

export const CUBX_ACTOR_CLICK_FLOW = Object.freeze(LINEAGE.clickFlow.map((flow) => Object.freeze({ ...flow })));

export const CUBX_ACTOR_LINEAGE_CLIPS = Object.freeze({
  get: Object.freeze(Array.from({ length: 7 }, (_, index) => {
    const asset = ASSETS.get(`get-${index + 2}`)!;
    return Object.freeze({ pairIndex: index + 1, assetId: asset.id, filename: asset.filename, ...asset.timing });
  })),
  rot: Object.freeze(Array.from({ length: 7 }, (_, index) => {
    const asset = ASSETS.get(`rot-${index + 1}`)!;
    return Object.freeze({ pairIndex: index + 1, assetId: asset.id, filename: asset.filename, ...asset.timing });
  })),
  openFull: Object.freeze({ assetId: "open-full", filename: ASSETS.get("open-full")!.filename, ...ASSETS.get("open-full")!.timing }),
  openSolo: Object.freeze({ assetId: "open-solo", filename: ASSETS.get("open-solo")!.filename, ...ASSETS.get("open-solo")!.timing })
});

export type CubxActorLineageState = {
  schema: "graphysx.cubx-actor-lineage-inspector/v1";
  isolatedFromCubz: true;
  clip: {
    family: CubxActorClipFamily;
    pairIndex: CubxActorPairIndex | null;
    assetId: string | null;
    filename: string;
    sourceFrame: number;
    startFrame: number;
    endFrame: number;
    framesPerSecond: number;
    motionCompletedAtFrame: number;
    terminalHoldFrames: number;
    terminalHoldActive: boolean;
    exactStoredRotationKey: boolean;
    playing: boolean;
    direction: CubxActorPlaybackDirection;
  };
  geometry: {
    actorVisible: boolean;
    hierarchyNodes: number;
    meshChunks: number;
    vertices: number;
    triangles: number;
    buttonsVisible: boolean;
    buttonMeshes: number;
    buttonVertices: number;
    buttonTriangles: number;
    diagnosticColors: boolean;
  };
  clickInspection: ClickFlow | null;
  hostEvidence: {
    position: number[];
    constructorSize: number;
    scaleStatus: string;
    pathEvidence: Record<string, unknown>;
    defects: string[];
  };
  fidelity: typeof CUBX_ACTOR_LINEAGE_FIDELITY;
};

function buildGeometry(payload: Pick<ActorGeometryPayload, "positions" | "normals" | "uvs" | "indices">): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(Float32Array.from(payload.positions), 3));
  geometry.setAttribute("normal", new BufferAttribute(Float32Array.from(payload.normals), 3));
  geometry.setAttribute("uv", new BufferAttribute(Float32Array.from(payload.uvs), 2));
  const maximumIndex = Math.max(...payload.indices);
  geometry.setIndex(new BufferAttribute(maximumIndex <= 65535 ? Uint16Array.from(payload.indices) : Uint32Array.from(payload.indices), 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function lowerUpper(keys: NumericKey[], frame: number): { lower: NumericKey; upper: NumericKey; alpha: number; exact: boolean } {
  if (keys.length === 0) throw new RangeError("CubXActor track contains no keys.");
  if (frame <= keys[0][0]) return { lower: keys[0], upper: keys[0], alpha: 0, exact: Math.abs(frame - keys[0][0]) <= 0.000001 };
  const last = keys[keys.length - 1];
  if (frame >= last[0]) return { lower: last, upper: last, alpha: 0, exact: Math.abs(frame - last[0]) <= 0.000001 };
  const upperIndex = keys.findIndex((key) => key[0] >= frame);
  const upper = keys[upperIndex];
  if (Math.abs(frame - upper[0]) <= 0.000001) return { lower: upper, upper, alpha: 0, exact: true };
  const lower = keys[upperIndex - 1];
  return { lower, upper, alpha: (frame - lower[0]) / (upper[0] - lower[0]), exact: false };
}

function sampleVector(keys: NumericKey[], frame: number, fallback: Vector3): Vector3 {
  if (keys.length === 0) return fallback.clone();
  const { lower, upper, alpha } = lowerUpper(keys, frame);
  return new Vector3(
    lower[1] + (upper[1] - lower[1]) * alpha,
    lower[2] + (upper[2] - lower[2]) * alpha,
    lower[3] + (upper[3] - lower[3]) * alpha
  );
}

function sampleQuaternion(keys: NumericKey[], frame: number, fallback: Quaternion): { value: Quaternion; exact: boolean } {
  if (keys.length === 0) return { value: fallback.clone(), exact: false };
  const { lower, upper, alpha, exact } = lowerUpper(keys, frame);
  const value = new Quaternion(lower[1], lower[2], lower[3], lower[4]);
  if (alpha > 0) value.slerp(new Quaternion(upper[1], upper[2], upper[3], upper[4]), alpha);
  return { value: value.normalize(), exact };
}

type NodeBinding = {
  object: Object3D;
  position: Vector3;
  rotation: Quaternion;
  scale: Vector3;
};

export class CubxActorLineageEnvironment {
  readonly group = new Group();
  readonly actorRoot = new Group();
  readonly buttonRoot = new Group();

  private readonly actorGeometryCache = new Map<string, BufferGeometry>();
  private readonly companionGeometryCache = new Map<string, BufferGeometry>();
  private readonly sourceMaterial = new MeshStandardMaterial({ color: 0xcccccc, roughness: 0.6, metalness: 0.08 });
  private readonly diagnosticBoxMaterial = new MeshStandardMaterial({ color: 0x62b6cb, roughness: 0.45, metalness: 0.12 });
  private readonly diagnosticCylinderMaterial = new MeshStandardMaterial({ color: 0xd8a84e, roughness: 0.42, metalness: 0.25 });
  private readonly diagnosticPanelMaterial = new MeshStandardMaterial({ color: 0xc177d1, roughness: 0.42, metalness: 0.12 });
  private readonly buttonMaterials: MeshBasicMaterial[] = [];
  private readonly actorMeshes: Array<{ mesh: Mesh; ownerName: string }> = [];
  private readonly nodeBindings = new Map<number, NodeBinding>();

  private activeAsset: AuditAsset | null = null;
  private family: CubxActorClipFamily = "closed";
  private pairIndex: CubxActorPairIndex | null = null;
  private sourceFrame = 0;
  private direction: CubxActorPlaybackDirection = 1;
  private playing = false;
  private buttonsVisible = true;
  private diagnosticColors = false;
  private selectedClick: CubxActorClickIndex | null = null;

  constructor() {
    this.group.name = "CubXActorLineageInspection";
    this.actorRoot.name = "DecodedActor";
    this.buttonRoot.name = "DecodedClickMeshes";
    this.group.add(this.actorRoot, this.buttonRoot);
    this.buildButtons();
    this.setClip("closed");
  }

  private geometryForActor(hash: string): BufferGeometry {
    const cached = this.actorGeometryCache.get(hash);
    if (cached) return cached;
    const payload = ACTOR_PAYLOADS.get(hash);
    if (!payload) throw new Error(`CubXActor geometry payload ${hash} is missing.`);
    const geometry = buildGeometry(payload);
    this.actorGeometryCache.set(hash, geometry);
    return geometry;
  }

  private geometryForCompanion(filename: string): BufferGeometry {
    const cached = this.companionGeometryCache.get(filename);
    if (cached) return cached;
    const payload = INSPECTION_GEOMETRY.companionGeometryAssets[filename];
    if (!payload) throw new Error(`CubXActor companion geometry ${filename} is missing.`);
    const geometry = buildGeometry(payload);
    this.companionGeometryCache.set(filename, geometry);
    return geometry;
  }

  private diagnosticMaterial(ownerName: string): MeshStandardMaterial {
    if (/^Cylindre/.test(ownerName)) return this.diagnosticCylinderMaterial;
    if (/^(Cube|Right|Top|Left|Box08)/.test(ownerName)) return this.diagnosticPanelMaterial;
    return this.diagnosticBoxMaterial;
  }

  private clearActor(): void {
    this.actorRoot.clear();
    this.actorMeshes.length = 0;
    this.nodeBindings.clear();
  }

  private buildButtons(): void {
    this.buttonRoot.clear();
    this.buttonMaterials.length = 0;
    for (let index = 1; index <= 8; index += 1) {
      const material = new MeshBasicMaterial({
        color: index === 8 ? 0xff5d73 : 0x5ee6a8,
        wireframe: true,
        transparent: true,
        opacity: index === 8 ? 0.86 : 0.5,
        depthWrite: false
      });
      const mesh = new Mesh(this.geometryForCompanion(`CubXBtn${index}.tvm`), material);
      mesh.name = `Click ${index}: ${LINEAGE.clickFlow[index - 1].exactSpatialBoxLabel}`;
      mesh.userData.clickIndex = index;
      mesh.renderOrder = 20;
      this.buttonMaterials.push(material);
      this.buttonRoot.add(mesh);
    }
  }

  private buildClosed(): void {
    this.clearActor();
    const mesh = new Mesh(this.geometryForCompanion("CubXMesh.tvm"), this.sourceMaterial);
    mesh.name = "CubXMesh.tvm exact closed companion";
    this.actorMeshes.push({ mesh, ownerName: "ClosedCubXMesh" });
    this.actorRoot.add(mesh);
  }

  private buildAsset(asset: AuditAsset): void {
    this.clearActor();
    const objects = asset.hierarchy.map((node) => {
      const object = new Object3D();
      object.name = node.name || `unnamed-node-${node.id}`;
      const matrix = new Matrix4().fromArray(node.initialLocalMatrix);
      const position = new Vector3();
      const rotation = new Quaternion();
      const scale = new Vector3();
      matrix.decompose(position, rotation, scale);
      object.position.copy(position);
      object.quaternion.copy(rotation);
      object.scale.copy(scale);
      this.nodeBindings.set(node.id, { object, position: position.clone(), rotation: rotation.clone(), scale: scale.clone() });
      return object;
    });
    for (const node of asset.hierarchy) {
      if (node.parent >= 0) objects[node.parent].add(objects[node.id]);
      else this.actorRoot.add(objects[node.id]);
    }
    for (const geometryRecord of asset.geometry) {
      const mesh = new Mesh(this.geometryForActor(geometryRecord.geometryPayloadSha256), this.sourceMaterial);
      mesh.name = geometryRecord.ownerName || `MAMD-${geometryRecord.hierarchyNodeId}`;
      objects[geometryRecord.hierarchyNodeId].add(mesh);
      this.actorMeshes.push({ mesh, ownerName: geometryRecord.ownerName });
    }
    this.applyFrame();
  }

  private resolveAsset(family: CubxActorClipFamily, pairIndex: CubxActorPairIndex | null): AuditAsset | null {
    if (family === "closed") return null;
    if (family === "get") return ASSETS.get(`get-${(pairIndex ?? 1) + 1}`) ?? null;
    if (family === "rot") return ASSETS.get(`rot-${pairIndex ?? 1}`) ?? null;
    return ASSETS.get(family) ?? null;
  }

  setClip(family: CubxActorClipFamily, pairIndex: CubxActorPairIndex = 1): void {
    if ((family === "get" || family === "rot") && (!Number.isInteger(pairIndex) || pairIndex < 1 || pairIndex > 7)) {
      throw new RangeError("CubXActor pair index must be an integer from 1 through 7.");
    }
    this.family = family;
    this.pairIndex = family === "get" || family === "rot" ? pairIndex : null;
    this.activeAsset = this.resolveAsset(family, this.pairIndex);
    this.playing = false;
    this.direction = 1;
    this.selectedClick = family === "get" ? pairIndex : null;
    if (this.activeAsset) {
      this.sourceFrame = this.activeAsset.timing.rangeStartFrame;
      this.buildAsset(this.activeAsset);
    } else {
      this.sourceFrame = 0;
      this.buildClosed();
    }
    this.applyMaterials();
    this.applyButtonHighlight();
  }

  selectClick(clickIndex: CubxActorClickIndex): void {
    if (!Number.isInteger(clickIndex) || clickIndex < 1 || clickIndex > 8) throw new RangeError("CubXActor click index must be 1 through 8.");
    this.selectedClick = clickIndex;
    if (clickIndex <= 7) this.setClip("get", clickIndex as CubxActorPairIndex);
    else {
      this.playing = false;
      this.applyButtonHighlight();
    }
  }

  setSourceFrame(frame: number): void {
    if (!Number.isFinite(frame)) throw new TypeError("CubXActor source frame must be finite.");
    const start = this.activeAsset?.timing.rangeStartFrame ?? 0;
    const end = this.activeAsset?.timing.rangeEndFrame ?? 0;
    this.sourceFrame = Math.min(end, Math.max(start, frame));
    this.applyFrame();
  }

  stepFrames(frames: number): void {
    if (!Number.isFinite(frames)) throw new TypeError("CubXActor step count must be finite.");
    this.playing = false;
    this.setSourceFrame(this.sourceFrame + frames);
  }

  setDirection(direction: CubxActorPlaybackDirection): void {
    if (direction !== 1 && direction !== -1) throw new RangeError("CubXActor direction must be 1 or -1.");
    this.direction = direction;
  }

  setPlaying(playing: boolean): void {
    if (!this.activeAsset) {
      this.playing = false;
      return;
    }
    const { rangeStartFrame: start, rangeEndFrame: end } = this.activeAsset.timing;
    if (playing && this.direction === 1 && this.sourceFrame >= end) this.sourceFrame = start;
    if (playing && this.direction === -1 && this.sourceFrame <= start) this.sourceFrame = end;
    this.playing = playing;
    this.applyFrame();
  }

  togglePlaying(): void {
    this.setPlaying(!this.playing);
  }

  advance(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new RangeError("CubXActor delta must be finite and non-negative.");
    if (!this.playing || !this.activeAsset) return;
    const timing = this.activeAsset.timing;
    const next = this.sourceFrame + deltaSeconds * timing.framesPerSecond * this.direction;
    if (this.direction === 1 && next >= timing.rangeEndFrame) {
      this.sourceFrame = timing.rangeEndFrame;
      this.playing = false;
    } else if (this.direction === -1 && next <= timing.rangeStartFrame) {
      this.sourceFrame = timing.rangeStartFrame;
      this.playing = false;
    } else {
      this.sourceFrame = next;
    }
    this.applyFrame();
  }

  setButtonsVisible(visible: boolean): void {
    this.buttonsVisible = visible;
    this.buttonRoot.visible = visible;
  }

  setDiagnosticColors(enabled: boolean): void {
    this.diagnosticColors = enabled;
    this.applyMaterials();
  }

  private applyMaterials(): void {
    for (const { mesh, ownerName } of this.actorMeshes) {
      mesh.material = this.diagnosticColors ? this.diagnosticMaterial(ownerName) : this.sourceMaterial;
    }
  }

  private applyButtonHighlight(): void {
    for (let index = 0; index < this.buttonMaterials.length; index += 1) {
      const clickIndex = index + 1;
      const selected = this.selectedClick === clickIndex;
      this.buttonMaterials[index].color.setHex(clickIndex === 8 ? 0xff5d73 : selected ? 0xffd166 : 0x5ee6a8);
      this.buttonMaterials[index].opacity = selected ? 1 : clickIndex === 8 ? 0.86 : 0.5;
    }
  }

  private applyFrame(): void {
    if (!this.activeAsset) return;
    for (const binding of this.nodeBindings.values()) {
      binding.object.position.copy(binding.position);
      binding.object.quaternion.copy(binding.rotation);
      binding.object.scale.copy(binding.scale);
    }
    for (const track of this.activeAsset.decodedSubstantiveTracks) {
      const binding = this.nodeBindings.get(track.nodeId);
      if (!binding) throw new Error(`CubXActor animated node ${track.nodeId} is missing.`);
      binding.object.position.copy(sampleVector(track.positions, this.sourceFrame, binding.position));
      binding.object.quaternion.copy(sampleQuaternion(track.rotations, this.sourceFrame, binding.rotation).value);
      binding.object.scale.copy(sampleVector(track.scales, this.sourceFrame, binding.scale));
    }
  }

  getState(): CubxActorLineageState {
    const timing = this.activeAsset?.timing;
    const exactStoredRotationKey = this.activeAsset
      ? this.activeAsset.decodedSubstantiveTracks.every((track) => track.rotations.some((key) => Math.abs(key[0] - this.sourceFrame) <= 0.000001))
      : true;
    const buttonVertices = LINEAGE.clickFlow.reduce((sum, flow) => sum + INSPECTION_GEOMETRY.companionGeometryAssets[flow.clickedMesh].vertexCount, 0);
    const buttonTriangles = LINEAGE.clickFlow.reduce((sum, flow) => sum + INSPECTION_GEOMETRY.companionGeometryAssets[flow.clickedMesh].triangleCount, 0);
    return {
      schema: "graphysx.cubx-actor-lineage-inspector/v1",
      isolatedFromCubz: true,
      clip: {
        family: this.family,
        pairIndex: this.pairIndex,
        assetId: this.activeAsset?.id ?? null,
        filename: this.activeAsset?.filename ?? "CubXMesh.tvm",
        sourceFrame: this.sourceFrame,
        startFrame: timing?.rangeStartFrame ?? 0,
        endFrame: timing?.rangeEndFrame ?? 0,
        framesPerSecond: timing?.framesPerSecond ?? 0,
        motionCompletedAtFrame: timing?.motionCompletedAtFrame ?? 0,
        terminalHoldFrames: timing?.terminalHoldFrames ?? 0,
        terminalHoldActive: Boolean(timing && timing.terminalHoldFrames > 0 && this.sourceFrame >= timing.motionCompletedAtFrame),
        exactStoredRotationKey,
        playing: this.playing,
        direction: this.direction
      },
      geometry: {
        actorVisible: this.actorRoot.visible,
        hierarchyNodes: this.activeAsset?.hierarchy.length ?? 1,
        meshChunks: this.activeAsset?.geometry.length ?? 1,
        vertices: this.activeAsset?.geometryTotals.vertices ?? INSPECTION_GEOMETRY.companionGeometryAssets["CubXMesh.tvm"].vertexCount,
        triangles: this.activeAsset?.geometryTotals.triangles ?? INSPECTION_GEOMETRY.companionGeometryAssets["CubXMesh.tvm"].triangleCount,
        buttonsVisible: this.buttonsVisible,
        buttonMeshes: 8,
        buttonVertices,
        buttonTriangles,
        diagnosticColors: this.diagnosticColors
      },
      clickInspection: this.selectedClick ? LINEAGE.clickFlow[this.selectedClick - 1] : null,
      hostEvidence: {
        position: [...LINEAGE.materialAndHostTransform.actorPosition],
        constructorSize: LINEAGE.materialAndHostTransform.constructorSizeArgument,
        scaleStatus: LINEAGE.materialAndHostTransform.scaleStatus,
        pathEvidence: LINEAGE.assetCensus.assetPathEvidence,
        defects: [...LINEAGE.hostSourceAudit.defects]
      },
      fidelity: CUBX_ACTOR_LINEAGE_FIDELITY
    };
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const geometry of this.actorGeometryCache.values()) geometry.dispose();
    for (const geometry of this.companionGeometryCache.values()) geometry.dispose();
    this.sourceMaterial.dispose();
    this.diagnosticBoxMaterial.dispose();
    this.diagnosticCylinderMaterial.dispose();
    this.diagnosticPanelMaterial.dispose();
    for (const material of this.buttonMaterials) material.dispose();
    this.actorGeometryCache.clear();
    this.companionGeometryCache.clear();
    this.clearActor();
    this.buttonRoot.clear();
  }
}
