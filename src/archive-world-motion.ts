import { Quaternion, Vector3, Euler } from "three";
import audit from "./content/cubz-tva-animations.json";
import { sampleCubzOpen, sampleCubzRotation, type CubzRotationSelection } from "./cubz-tva-animation";
import type { KeyframeTrackBehavior } from "./agent-world-motion";
import type { AgentWorldDefinition, AgentWorldEntityDefinition, GraphysXAgentWorldApi } from "./agent-world-runtime";
import { buildRecoveredFlightX } from "./flightx-revival";

const panels = ["Right08", "Top08", "Left08"] as const;
const sourceCenters = [[0, 25, 0], [0, 25, 100], [-95, 25, 100], [-95, 25, 0], [0, -70, 0], [0, -70, 100], [-95, -70, 100], [-95, -70, 0]];
const displayScale = 1.56 / 58;
const metal = { color: "#9fe9dc", roughness: 0.3, metalness: 0.45 };

/** Original key times/values, reflected from TV3D Z, with explicit range endpoints. */
export function cubzTrack(kind: "rotation" | "open", selection: CubzRotationSelection, node: string, startSeconds: number, reverse = false): KeyframeTrackBehavior {
  const asset = audit.assets.find(item => item.id === (kind === "rotation" ? "cube-rotation" : "cube-open"))!;
  const range = asset.ranges.find(item => item.id === (kind === "rotation" ? selection : 0))!;
  const track = asset.decodedSubstantiveTracks.find(item => item.nodeName === node)!;
  const endpoint = (seconds: number): readonly number[] => kind === "rotation" ? sampleCubzRotation(selection, seconds).globalCube.quaternion : sampleCubzOpen(seconds).panels[node as typeof panels[number]].quaternion;
  const keys: [number, number, number, number, number][] = [];
  const append = (time: number, values: readonly number[]): void => { keys.push([time, -values[0], -values[1], values[2], values[3]]); };
  append(0, endpoint(0));
  for (const key of track.rotationKeys) if (key[0] > range.startFrame && key[0] < range.endFrame) append((key[0] - range.startFrame) / range.framesPerSecond, key.slice(1));
  append(range.durationSeconds, endpoint(range.durationSeconds));
  const rotations = reverse ? keys.reverse().map(([time, ...quaternion]): [number, number, number, number, number] => [range.durationSeconds - time, ...quaternion]) : keys;
  return { id: "source-clip", type: "keyframes", durationSeconds: range.durationSeconds, startSeconds, rotations };
}

export function playCubzTrack(api: GraphysXAgentWorldApi, kind: "rotation" | "open", selection: CubzRotationSelection, reverse = false): void {
  const elapsed = api.state()?.elapsedSeconds ?? 0;
  const targets = kind === "rotation" ? ["cubz-assembly"] : panels.map(node => `cubz-${node}`);
  const commands = targets.flatMap(id => {
    const state = api.query({ ids: [id] })[0];
    if (!state) throw new Error(`Missing CubZ track target: ${id}`);
    return [
      ...state.behaviors.map(behavior => ({ op: "detach-behavior" as const, id, behaviorId: behavior.id })),
      { op: "attach-behavior" as const, id, behavior: cubzTrack(kind, selection, id === "cubz-assembly" ? "GlobalCube" : id.slice(5), elapsed, reverse) },
    ];
  });
  const result = api.transaction(commands);
  if (!result.ok) throw new Error(result.error ?? "Could not play source clip");
}

export function buildCubzTracks(): AgentWorldDefinition {
  const entities: AgentWorldEntityDefinition[] = [
    { id: "cubz-light", type: "ambient-light", intensity: 1.1 },
    { id: "cubz-assembly", type: "group", label: "GlobalCube · source rotation", transform: { position: [-3.6, 3.5, 0] },
      behaviors: [cubzTrack("rotation", 1, "GlobalCube", 0)], tags: ["source-track", "adapted-display-geometry", "archive-motion"] },
    { id: "cubz-open-study", type: "group", label: "CubeOpen · separate hinge study", transform: { position: [3, 3.5, 0] }, tags: ["adapted-display-geometry"] },
  ];
  const centers = sourceCenters.map(([x, y, z]) => new Vector3((x + 47.5) * displayScale, (y + 22.5) * displayScale, -(z - 50) * displayScale));
  centers.forEach((center, index) => entities.push({ id: `cubz-cell-${index}`, type: "box", parentId: "cubz-assembly", label: `Source hit box ${index + 1}`,
    geometry: { width: 1.56, height: 1.56, depth: 1.56 }, transform: { position: center.toArray() }, material: metal }));
  for (let a = 0; a < centers.length; a++) for (let b = a + 1; b < centers.length; b++) {
    if (sourceCenters[a].filter((value, axis) => value !== sourceCenters[b][axis]).length !== 1) continue;
    const direction = centers[b].clone().sub(centers[a]);
    const rotation = new Euler().setFromQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.clone().normalize()));
    entities.push({ id: `cubz-link-${a}-${b}`, type: "cylinder", parentId: "cubz-assembly", geometry: { radius: 0.085, height: direction.length() - 1.12 },
      transform: { position: centers[a].clone().add(centers[b]).multiplyScalar(0.5).toArray(), rotationDegrees: [rotation.x, rotation.y, rotation.z].map(value => value * 180 / Math.PI) as [number, number, number] }, material: { ...metal, color: "#bacbd2" } });
  }
  const h = 1.1, size = h * 2;
  const specs = [
    { node: "Right08", pivot: [h, -h, 0], offset: [0, h, 0], dims: [0.075, size, size] },
    { node: "Top08", pivot: [0, h, -h], offset: [0, 0, h], dims: [size, 0.075, size] },
    { node: "Left08", pivot: [-h, 0, h], offset: [h, 0, 0], dims: [size, size, 0.075] },
  ] as const;
  entities.push({ id: "cubz-interior", type: "box", parentId: "cubz-open-study", geometry: { width: 1.85, height: 1.85, depth: 1.85 }, material: { color: "#102b3a" } });
  for (const spec of specs) entities.push(
    { id: `cubz-${spec.node}`, type: "group", parentId: "cubz-open-study", label: `${spec.node} · native quaternion track`, transform: { position: [...spec.pivot] }, tags: ["source-track", "adapted-hinge-pivot", "archive-motion"] },
    { id: `cubz-${spec.node}-face`, type: "box", parentId: `cubz-${spec.node}`, transform: { position: [...spec.offset] },
      geometry: { width: spec.dims[0], height: spec.dims[1], depth: spec.dims[2] }, material: metal },
  );
  return { schema: "graphysx.agent-world/v2", id: "archive-cubz-tracks", label: "CubZ · exact TVA tracks on disclosed geometric studies",
    environment: { background: "#112637", ground: { visible: true, size: 40, color: "#183442", grid: true, gridColor: "#345767" } }, entities };
}

export function buildFlightX(): AgentWorldDefinition {
  return buildRecoveredFlightX();
}
