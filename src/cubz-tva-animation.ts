import auditJson from "./legacy/cubz-tva-animations.json";

export type CubzQuaternion = readonly [x: number, y: number, z: number, w: number];
export type CubzRotationSelection = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type CubzPlaybackDirection = "forward" | "reverse";
export type CubzOpenPanelName = "Right08" | "Top08" | "Left08";

type RawRotationKey = readonly [frame: number, x: number, y: number, z: number, w: number];

type RawRange = {
  id: number;
  name: string;
  sourceAnimation: number;
  startFrame: number;
  endFrame: number;
  framesPerSecond: number;
  durationSeconds: number;
};

type RawTrack = {
  nodeId: number;
  nodeName: string;
  counts: { position: number; rotation: number; scale: number };
  frameBounds: {
    position: [number, number];
    rotation: [number, number];
    scale: [number, number];
  };
  fixedPositionAtFirstKey: [number, number, number, number];
  fixedScaleAtFirstKey: [number, number, number, number];
  rotationKeys: RawRotationKey[];
  maximumQuaternionNormError: number;
  rawChunkSha256: string;
};

type RawAsset = {
  id: "cube-rotation" | "cube-open";
  filename: string;
  source: string;
  bytes: number;
  sha256: string;
  ranges: RawRange[];
  decodedSubstantiveTracks: RawTrack[];
};

type AuditData = {
  schema: string;
  decoder: {
    rotationInterpretation: string;
    coordinateBoundary: string;
  };
  assets: RawAsset[];
  playbackSource: {
    binaryConfirmedPitfall: {
      reverseExpression: string;
      decodedValidAnimationIds: [number, number];
      resultingReverseIds: [number, number];
      assessment: string;
    };
  };
};

const AUDIT = auditJson as unknown as AuditData;
const ROTATION_ASSET = AUDIT.assets.find((asset) => asset.id === "cube-rotation");
const OPEN_ASSET = AUDIT.assets.find((asset) => asset.id === "cube-open");

if (!ROTATION_ASSET || !OPEN_ASSET) throw new Error("CubZ TVA audit is missing CubeRot or CubeOpen.");

const globalCubeTrack = ROTATION_ASSET.decodedSubstantiveTracks.find((track) => track.nodeName === "GlobalCube");
if (!globalCubeTrack) throw new Error("CubeRot TVA audit is missing the GlobalCube transform track.");
const GLOBAL_CUBE_TRACK: RawTrack = globalCubeTrack;

const OPEN_PANEL_NAMES: readonly CubzOpenPanelName[] = ["Right08", "Top08", "Left08"];
const OPEN_PANEL_TRACKS = new Map<CubzOpenPanelName, RawTrack>();
for (const panelName of OPEN_PANEL_NAMES) {
  const track = OPEN_ASSET.decodedSubstantiveTracks.find((candidate) => candidate.nodeName === panelName);
  if (!track) throw new Error(`CubeOpen TVA audit is missing ${panelName}.`);
  OPEN_PANEL_TRACKS.set(panelName, track);
}

const ROTATION_RANGES = new Map<CubzRotationSelection, RawRange>();
for (let selection = 1; selection <= 7; selection += 1) {
  const range = ROTATION_ASSET.ranges.find((candidate) => candidate.id === selection);
  if (!range) throw new Error(`CubeRot TVA audit is missing animation range ${selection}.`);
  ROTATION_RANGES.set(selection as CubzRotationSelection, range);
}

const OPEN_RANGE = OPEN_ASSET.ranges[0];
if (!OPEN_RANGE) throw new Error("CubeOpen TVA audit has no source animation range.");

export const CUBZ_TVA_FIDELITY = Object.freeze({
  schema: "graphysx.cubz-tva-fidelity/v1" as const,
  dataSchema: AUDIT.schema,
  sourceIdentity: {
    cubeRotation: {
      source: ROTATION_ASSET.source,
      filename: ROTATION_ASSET.filename,
      bytes: ROTATION_ASSET.bytes,
      sha256: ROTATION_ASSET.sha256
    },
    cubeOpen: {
      source: OPEN_ASSET.source,
      filename: OPEN_ASSET.filename,
      bytes: OPEN_ASSET.bytes,
      sha256: OPEN_ASSET.sha256
    }
  },
  decodedExact: {
    timing: "MANS source ranges and 30 fps are decoded exactly.",
    storedKeys: "Stored MANI quaternion keys are returned in original float32 source order at exact source frames.",
    rotationTrack: "CubeRot materially changes only GlobalCube.",
    openTracks: "CubeOpen materially changes only Right08, Top08 and Left08."
  },
  interpolation: {
    status: "deterministic-inference-engine-routine-not-recovered" as const,
    method: "normalized shortest-arc quaternion SLERP between the two surrounding decoded keys",
    rationale: "Quaternion interpolation is the narrowest transform-preserving interpolation supported by the decoded unit-quaternion evidence; no authored easing curve is invented."
  },
  coordinateSpace: {
    status: "raw-tv3d-source-order-no-web-conversion" as const,
    rotationInterpretation: AUDIT.decoder.rotationInterpretation,
    boundary: AUDIT.decoder.coordinateBoundary
  },
  reverseRepair: {
    status: "intentional-source-defect-repair" as const,
    archivedExpression: AUDIT.playbackSource.binaryConfirmedPitfall.reverseExpression,
    archivedValidIds: AUDIT.playbackSource.binaryConfirmedPitfall.decodedValidAnimationIds,
    archivedResultingReverseIds: AUDIT.playbackSource.binaryConfirmedPitfall.resultingReverseIds,
    implementedBehavior: "Reverse traverses the same animation ID/range used by forward playback, from its decoded end frame to its decoded start frame.",
    reason: AUDIT.playbackSource.binaryConfirmedPitfall.assessment
  }
});

export type CubzQuaternionSample = {
  quaternion: CubzQuaternion;
  exactStoredKey: boolean;
  lowerFrame: number;
  upperFrame: number;
  interpolationAlpha: number;
  interpolation: "exact-key" | "shortest-arc-slerp";
};

export type CubzClipCursor = {
  direction: CubzPlaybackDirection;
  elapsedSeconds: number;
  durationSeconds: number;
  progress: number;
  sourceFrame: number;
  startFrame: number;
  endFrame: number;
  framesPerSecond: 30;
  finished: boolean;
};

export type CubzRotationSample = {
  schema: "graphysx.cubz-tva-playback/v1";
  kind: "cube-rotation";
  selection: CubzRotationSelection;
  animationId: CubzRotationSelection;
  rangeName: string;
  cursor: CubzClipCursor;
  globalCube: CubzQuaternionSample & {
    nodeId: number;
    nodeName: "GlobalCube";
  };
  reverseBehavior: {
    repairedSameRange: true;
    animationId: CubzRotationSelection;
    archivedWouldRequest: number;
    archivedRequestIsValid: boolean;
  };
  fidelity: typeof CUBZ_TVA_FIDELITY;
};

export type CubzOpenPanelSample = CubzQuaternionSample & {
  nodeId: number;
  nodeName: CubzOpenPanelName;
  fixedPosition: readonly [x: number, y: number, z: number];
  fixedScale: readonly [x: number, y: number, z: number];
};

export type CubzOpenSample = {
  schema: "graphysx.cubz-tva-playback/v1";
  kind: "cube-open";
  animationId: 0;
  rangeName: string;
  cursor: CubzClipCursor;
  panels: Record<CubzOpenPanelName, CubzOpenPanelSample>;
  fidelity: typeof CUBZ_TVA_FIDELITY;
};

export type CubzTvaPlaybackSample = CubzRotationSample | CubzOpenSample;

export const CUBZ_TVA_CLIPS = Object.freeze({
  framesPerSecond: 30 as const,
  rotation: Array.from(ROTATION_RANGES.entries()).map(([selection, range]) => ({
    selection,
    animationId: selection,
    name: range.name,
    startFrame: range.startFrame,
    endFrame: range.endFrame,
    durationSeconds: range.durationSeconds
  })),
  open: {
    animationId: 0 as const,
    name: OPEN_RANGE.name,
    startFrame: OPEN_RANGE.startFrame,
    endFrame: OPEN_RANGE.endFrame,
    durationSeconds: OPEN_RANGE.durationSeconds,
    panels: OPEN_PANEL_NAMES
  }
});

function assertSelection(selection: number): asserts selection is CubzRotationSelection {
  if (!Number.isInteger(selection) || selection < 1 || selection > 7) {
    throw new RangeError(`CubZ rotation selection must be an integer from 1 through 7; received ${selection}.`);
  }
}

function clampElapsed(elapsedSeconds: number, durationSeconds: number): number {
  if (!Number.isFinite(elapsedSeconds)) throw new TypeError("CubZ TVA elapsed time must be finite.");
  return Math.min(durationSeconds, Math.max(0, elapsedSeconds));
}

function clipCursor(range: RawRange, elapsedSeconds: number, direction: CubzPlaybackDirection): CubzClipCursor {
  if (range.framesPerSecond !== 30) throw new Error(`Unsupported CubZ TVA frame rate ${range.framesPerSecond}.`);
  const elapsed = clampElapsed(elapsedSeconds, range.durationSeconds);
  const progress = range.durationSeconds === 0 ? 1 : elapsed / range.durationSeconds;
  const forwardFrame = range.startFrame + (range.endFrame - range.startFrame) * progress;
  const sourceFrame = direction === "forward"
    ? forwardFrame
    : range.endFrame - (range.endFrame - range.startFrame) * progress;
  return {
    direction,
    elapsedSeconds: elapsed,
    durationSeconds: range.durationSeconds,
    progress,
    sourceFrame,
    startFrame: range.startFrame,
    endFrame: range.endFrame,
    framesPerSecond: 30,
    finished: elapsed >= range.durationSeconds
  };
}

function quaternionFromKey(key: RawRotationKey): CubzQuaternion {
  return [key[1], key[2], key[3], key[4]];
}

function normalizeQuaternion(quaternion: CubzQuaternion): CubzQuaternion {
  const norm = Math.hypot(...quaternion);
  if (norm === 0) throw new Error("Cannot normalize a zero CubZ TVA quaternion.");
  return [quaternion[0] / norm, quaternion[1] / norm, quaternion[2] / norm, quaternion[3] / norm];
}

function slerpShortestArc(left: CubzQuaternion, right: CubzQuaternion, alpha: number): CubzQuaternion {
  let target: CubzQuaternion = right;
  let dot = left[0] * right[0] + left[1] * right[1] + left[2] * right[2] + left[3] * right[3];
  if (dot < 0) {
    target = [-right[0], -right[1], -right[2], -right[3]];
    dot = -dot;
  }
  dot = Math.min(1, Math.max(-1, dot));
  if (dot > 0.9995) {
    return normalizeQuaternion([
      left[0] + (target[0] - left[0]) * alpha,
      left[1] + (target[1] - left[1]) * alpha,
      left[2] + (target[2] - left[2]) * alpha,
      left[3] + (target[3] - left[3]) * alpha
    ]);
  }
  const theta = Math.acos(dot);
  const sinTheta = Math.sin(theta);
  const leftWeight = Math.sin((1 - alpha) * theta) / sinTheta;
  const rightWeight = Math.sin(alpha * theta) / sinTheta;
  return normalizeQuaternion([
    left[0] * leftWeight + target[0] * rightWeight,
    left[1] * leftWeight + target[1] * rightWeight,
    left[2] * leftWeight + target[2] * rightWeight,
    left[3] * leftWeight + target[3] * rightWeight
  ]);
}

function sampleTrack(track: RawTrack, sourceFrame: number): CubzQuaternionSample {
  const keys = track.rotationKeys;
  if (keys.length === 0) throw new Error(`CubZ TVA track ${track.nodeName} contains no rotation keys.`);
  const epsilon = 0.000001;
  if (sourceFrame <= keys[0][0] + epsilon) {
    return {
      quaternion: quaternionFromKey(keys[0]),
      exactStoredKey: Math.abs(sourceFrame - keys[0][0]) <= epsilon,
      lowerFrame: keys[0][0],
      upperFrame: keys[0][0],
      interpolationAlpha: 0,
      interpolation: "exact-key"
    };
  }
  if (sourceFrame >= keys.at(-1)![0] - epsilon) {
    const key = keys.at(-1)!;
    return {
      quaternion: quaternionFromKey(key),
      exactStoredKey: Math.abs(sourceFrame - key[0]) <= epsilon,
      lowerFrame: key[0],
      upperFrame: key[0],
      interpolationAlpha: 0,
      interpolation: "exact-key"
    };
  }

  let low = 0;
  let high = keys.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const frame = keys[middle][0];
    if (Math.abs(frame - sourceFrame) <= epsilon) {
      return {
        quaternion: quaternionFromKey(keys[middle]),
        exactStoredKey: true,
        lowerFrame: frame,
        upperFrame: frame,
        interpolationAlpha: 0,
        interpolation: "exact-key"
      };
    }
    if (frame < sourceFrame) low = middle + 1;
    else high = middle - 1;
  }

  const lower = keys[Math.max(0, high)];
  const upper = keys[Math.min(keys.length - 1, low)];
  const alpha = (sourceFrame - lower[0]) / (upper[0] - lower[0]);
  return {
    quaternion: slerpShortestArc(quaternionFromKey(lower), quaternionFromKey(upper), alpha),
    exactStoredKey: false,
    lowerFrame: lower[0],
    upperFrame: upper[0],
    interpolationAlpha: alpha,
    interpolation: "shortest-arc-slerp"
  };
}

export function sampleCubzRotation(
  selection: CubzRotationSelection,
  elapsedSeconds: number,
  direction: CubzPlaybackDirection = "forward"
): CubzRotationSample {
  assertSelection(selection);
  const range = ROTATION_RANGES.get(selection)!;
  const cursor = clipCursor(range, elapsedSeconds, direction);
  const rotation = sampleTrack(GLOBAL_CUBE_TRACK, cursor.sourceFrame);
  const archivedWouldRequest = selection + 1;
  return {
    schema: "graphysx.cubz-tva-playback/v1",
    kind: "cube-rotation",
    selection,
    animationId: selection,
    rangeName: range.name,
    cursor,
    globalCube: {
      nodeId: GLOBAL_CUBE_TRACK.nodeId,
      nodeName: "GlobalCube",
      ...rotation
    },
    reverseBehavior: {
      repairedSameRange: true,
      animationId: selection,
      archivedWouldRequest,
      archivedRequestIsValid: archivedWouldRequest <= 7
    },
    fidelity: CUBZ_TVA_FIDELITY
  };
}

export function sampleCubzRotationForward(
  selection: CubzRotationSelection,
  elapsedSeconds: number
): CubzRotationSample {
  return sampleCubzRotation(selection, elapsedSeconds, "forward");
}

export function sampleCubzRotationReverse(
  selection: CubzRotationSelection,
  elapsedSeconds: number
): CubzRotationSample {
  return sampleCubzRotation(selection, elapsedSeconds, "reverse");
}

function panelSample(panelName: CubzOpenPanelName, sourceFrame: number): CubzOpenPanelSample {
  const track = OPEN_PANEL_TRACKS.get(panelName)!;
  const rotation = sampleTrack(track, sourceFrame);
  return {
    nodeId: track.nodeId,
    nodeName: panelName,
    fixedPosition: [
      track.fixedPositionAtFirstKey[1],
      track.fixedPositionAtFirstKey[2],
      track.fixedPositionAtFirstKey[3]
    ],
    fixedScale: [
      track.fixedScaleAtFirstKey[1],
      track.fixedScaleAtFirstKey[2],
      track.fixedScaleAtFirstKey[3]
    ],
    ...rotation
  };
}

export function sampleCubzOpen(
  elapsedSeconds: number,
  direction: CubzPlaybackDirection = "forward"
): CubzOpenSample {
  const cursor = clipCursor(OPEN_RANGE, elapsedSeconds, direction);
  return {
    schema: "graphysx.cubz-tva-playback/v1",
    kind: "cube-open",
    animationId: 0,
    rangeName: OPEN_RANGE.name,
    cursor,
    panels: {
      Right08: panelSample("Right08", cursor.sourceFrame),
      Top08: panelSample("Top08", cursor.sourceFrame),
      Left08: panelSample("Left08", cursor.sourceFrame)
    },
    fidelity: CUBZ_TVA_FIDELITY
  };
}

export function sampleCubzOpenForward(elapsedSeconds: number): CubzOpenSample {
  return sampleCubzOpen(elapsedSeconds, "forward");
}

export function sampleCubzOpenReverse(elapsedSeconds: number): CubzOpenSample {
  return sampleCubzOpen(elapsedSeconds, "reverse");
}

export class CubzTvaPlayback<TSample extends CubzTvaPlaybackSample> {
  readonly kind: TSample["kind"];
  readonly direction: CubzPlaybackDirection;
  readonly durationSeconds: number;
  #elapsedSeconds = 0;
  readonly #sampleAt: (elapsedSeconds: number) => TSample;

  constructor(
    kind: TSample["kind"],
    direction: CubzPlaybackDirection,
    durationSeconds: number,
    sampleAt: (elapsedSeconds: number) => TSample
  ) {
    this.kind = kind;
    this.direction = direction;
    this.durationSeconds = durationSeconds;
    this.#sampleAt = sampleAt;
  }

  get elapsedSeconds(): number {
    return this.#elapsedSeconds;
  }

  get finished(): boolean {
    return this.#elapsedSeconds >= this.durationSeconds;
  }

  sample(): TSample {
    return this.#sampleAt(this.#elapsedSeconds);
  }

  seek(elapsedSeconds: number): TSample {
    this.#elapsedSeconds = clampElapsed(elapsedSeconds, this.durationSeconds);
    return this.sample();
  }

  advance(deltaSeconds: number): TSample {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new RangeError("CubZ TVA playback delta must be a finite non-negative number.");
    }
    return this.seek(this.#elapsedSeconds + deltaSeconds);
  }

  reset(): TSample {
    this.#elapsedSeconds = 0;
    return this.sample();
  }
}

export function createCubzRotationPlayback(
  selection: CubzRotationSelection,
  direction: CubzPlaybackDirection = "forward"
): CubzTvaPlayback<CubzRotationSample> {
  assertSelection(selection);
  const range = ROTATION_RANGES.get(selection)!;
  return new CubzTvaPlayback("cube-rotation", direction, range.durationSeconds, (elapsedSeconds) =>
    sampleCubzRotation(selection, elapsedSeconds, direction)
  );
}

export function createCubzOpenPlayback(
  direction: CubzPlaybackDirection = "forward"
): CubzTvaPlayback<CubzOpenSample> {
  return new CubzTvaPlayback("cube-open", direction, OPEN_RANGE.durationSeconds, (elapsedSeconds) =>
    sampleCubzOpen(elapsedSeconds, direction)
  );
}
