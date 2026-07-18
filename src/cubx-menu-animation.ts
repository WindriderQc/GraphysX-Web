import { Quaternion } from "three";
import cubxAnimationData from "./legacy/cubx-anim.json";

type PositionKey = [time: number, x: number, y: number, z: number];
type RotationKey = [time: number, x: number, y: number, z: number, w: number];
type ScaleKey = [time: number, x: number, y: number, z: number];

type CubXTrack = {
  node: string;
  pos: PositionKey[];
  rot: RotationKey[];
  scale: ScaleKey[];
};

export type CubXOpenNodeSample = {
  position: [number, number, number];
  rotation: [number, number, number, number];
  scale: [number, number, number];
};

export type CubXOpenSample = {
  sourceTime: number;
  nodes: Record<string, CubXOpenNodeSample>;
};

function parseNumericKeys<T extends PositionKey | RotationKey | ScaleKey>(
  value: unknown,
  width: number,
  label: string
): T[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
  return value.map((key, index) => {
    if (!Array.isArray(key) || key.length !== width || !key.every((field) => typeof field === "number" && Number.isFinite(field))) {
      throw new TypeError(`${label}[${index}] must contain exactly ${width} finite numbers.`);
    }
    return key as unknown as T;
  });
}

function parseCubXTracks(value: unknown): CubXTrack[] {
  if (!Array.isArray(value)) throw new TypeError("CubX open tracks must be an array.");
  return value.map((candidate, index) => {
    if (typeof candidate !== "object" || candidate === null) throw new TypeError(`CubX open track ${index} must be an object.`);
    const record = candidate as Record<string, unknown>;
    if (typeof record.node !== "string" || record.node.length === 0) throw new TypeError(`CubX open track ${index} has no node name.`);
    return {
      node: record.node,
      pos: parseNumericKeys<PositionKey>(record.pos, 4, `${record.node}.pos`),
      rot: parseNumericKeys<RotationKey>(record.rot, 5, `${record.node}.rot`),
      scale: parseNumericKeys<ScaleKey>(record.scale, 4, `${record.node}.scale`)
    };
  });
}

const OPEN_TRACKS = parseCubXTracks(cubxAnimationData.animations.open.tracks);

export const CUBX_OPEN_SOURCE_RANGE = [0, 100] as const;
export const CUBX_OPEN_TRACK_NAMES = OPEN_TRACKS.map((track) => track.node);
export const CUBX_OPEN_CUBE_TRACK_NAMES = Array.from({ length: 8 }, (_, index) => `Bo_te${String(index + 1).padStart(2, "0")}`);
export const CUBX_OPEN_MISSING_CUBE_TRACK_NAMES = CUBX_OPEN_CUBE_TRACK_NAMES.filter(
  (name) => !CUBX_OPEN_TRACK_NAMES.includes(name)
);

function sampleVector3(keys: PositionKey[] | ScaleKey[], time: number): [number, number, number] {
  if (keys.length === 0) return [0, 0, 0];
  if (time <= keys[0][0]) return [keys[0][1], keys[0][2], keys[0][3]];
  const last = keys[keys.length - 1];
  if (time >= last[0]) return [last[1], last[2], last[3]];

  const upperIndex = keys.findIndex((key) => key[0] >= time);
  const lower = keys[Math.max(0, upperIndex - 1)];
  const upper = keys[upperIndex];
  const span = Math.max(Number.EPSILON, upper[0] - lower[0]);
  const alpha = (time - lower[0]) / span;
  return [
    lower[1] + (upper[1] - lower[1]) * alpha,
    lower[2] + (upper[2] - lower[2]) * alpha,
    lower[3] + (upper[3] - lower[3]) * alpha
  ];
}

function sampleQuaternion(keys: RotationKey[], time: number): [number, number, number, number] {
  if (keys.length === 0) return [0, 0, 0, 1];
  if (time <= keys[0][0]) return [keys[0][1], keys[0][2], keys[0][3], keys[0][4]];
  const last = keys[keys.length - 1];
  if (time >= last[0]) return [last[1], last[2], last[3], last[4]];

  const upperIndex = keys.findIndex((key) => key[0] >= time);
  const lower = keys[Math.max(0, upperIndex - 1)];
  const upper = keys[upperIndex];
  const span = Math.max(Number.EPSILON, upper[0] - lower[0]);
  const alpha = (time - lower[0]) / span;
  const quaternion = new Quaternion(lower[1], lower[2], lower[3], lower[4]).slerp(
    new Quaternion(upper[1], upper[2], upper[3], upper[4]),
    alpha
  );
  return [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
}

export function sampleCubXOpen(progress: number): CubXOpenSample {
  const normalized = Math.min(1, Math.max(0, progress));
  const sourceTime = CUBX_OPEN_SOURCE_RANGE[0] + normalized * (CUBX_OPEN_SOURCE_RANGE[1] - CUBX_OPEN_SOURCE_RANGE[0]);
  const nodes: Record<string, CubXOpenNodeSample> = {};

  for (const track of OPEN_TRACKS) {
    nodes[track.node] = {
      position: sampleVector3(track.pos, sourceTime),
      rotation: sampleQuaternion(track.rot, sourceTime),
      scale: sampleVector3(track.scale, sourceTime)
    };
  }

  return { sourceTime, nodes };
}

export const CUBX_OPEN_BIND_SAMPLE = sampleCubXOpen(0);
