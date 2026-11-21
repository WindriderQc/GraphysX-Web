import { Euler, ExtrudeGeometry, Matrix4, Quaternion, Shape, Vector3 } from "three";
import { CUBZ_MENUS, cubzButtonId, cubzButtonNumber } from "./cubz-menu-buttons";
export { CUBZ_ACTIONS, type CubzAction } from "./cubz-menu-buttons";
import { sampleKeyframeTrack, type KeyframeTrackBehavior } from "./agent-world-motion";
import type { AgentWorldCommand, AgentWorldDefinition, AgentWorldEntityDefinition, AgentWorldTransform } from "./agent-world-runtime";

export const CUBZ_SOURCE_URL = "/assets/ports/archive-cubz-menu.json";
export const CUBZ_ACTORS = ["rotation", "open", "screensaver"] as const;
export type CubzActorId = typeof CUBZ_ACTORS[number];
type SourceNode = { id: number; parent: number; name: string; localMatrix: number[]; worldMatrix: number[] };
type SourceTrack = { nodeId: number; positions: number[][]; rotations: number[][]; scales: number[][] };
export type CubzActor = {
  source: string; sha256: string; nodes: SourceNode[];
  meshes: { nodeId: number; positions: number[]; normals: number[]; uvs: number[]; indices: number[] }[];
  ranges: { id: number; start: number; end: number; fps: number }[]; tracks: SourceTrack[];
};
export type CubzSource = { schema: "graphysx.cubz-menu-source/v1"; actors: Record<CubzActorId, CubzActor> };
type Tuple3 = [number, number, number];
type QuaternionKey = [number, number, number, number, number];
type VectorKey = [number, number, number, number];
export const CUBZ_COLORS = ["#64d8cb", "#70a8e0", "#b6a2e8", "#df9ab2", "#e5ae6a", "#d3ca83", "#91b797", "#88b4c4"];
const radiansToDegrees = 180 / Math.PI;
const reflection = new Matrix4().makeScale(1, 1, -1);
const nativeDisplayScale = 0.04;
const nodeId = (actor: CubzActorId, id: number) => `cubz-${actor}-n${id}`;
export const cubzRigId = (actor: CubzActorId) => `cubz-${actor}-rig`;
const buttonRoot = (choice: number) => `cubz-menu-${choice}`;
const buttonRoots = (choice: number) => [buttonRoot(choice), `${buttonRoot(choice)}-right`];

/** Keys are real children of the source panels, never world-space overlays. */
export function cubzPanelMount(data: CubzSource, panel: "Left08" | "Right08" | "Top08"): Pick<AgentWorldEntityDefinition, "parentId" | "transform"> {
  const actor = data.actors.open, pivot = actor.nodes.find(node => node.name === panel);
  const mesh = actor.meshes.find(mesh => actor.nodes[mesh.nodeId].parent === pivot?.id);
  if (!mesh) throw new Error(`Missing CubZ panel: ${panel}`);
  const minimum = [Infinity, Infinity, Infinity], maximum = [-Infinity, -Infinity, -Infinity];
  mesh.positions.forEach((value, index) => {
    const axis = index % 3, reflected = axis === 2 ? -value : value;
    minimum[axis] = Math.min(minimum[axis], reflected); maximum[axis] = Math.max(maximum[axis], reflected);
  });
  const axis = panel === "Left08" ? 2 : panel === "Right08" ? 0 : 1;
  const position = minimum.map((value, index) => (value + maximum[index]) / 2) as Tuple3;
  // All three inner faces point toward the closed core along their negative local
  // thin axis. The mesh's back bevel is -.015; leave just 1 mm above the panel.
  position[axis] = minimum[axis] - (0.015 + 0.001) / nativeDisplayScale;
  return { parentId: nodeId("open", mesh.nodeId), transform: { position,
    rotationDegrees: panel === "Left08" ? [0, 180, 0] : panel === "Right08" ? [0, -90, 0] : [90, 0, 0],
    scale: [1 / nativeDisplayScale, 1 / nativeDisplayScale, 1 / nativeDisplayScale] } };
}

/** Rebuilt tactile key, explicitly separate from every pinned native actor mesh. */
function buttonMesh(): NonNullable<AgentWorldEntityDefinition["mesh"]> {
  const shape = new Shape();
  shape.moveTo(-.28, -.165); shape.lineTo(.28, -.165); shape.lineTo(.325, -.12);
  shape.lineTo(.325, .12); shape.lineTo(.28, .165); shape.lineTo(-.28, .165);
  shape.lineTo(-.325, .12); shape.lineTo(-.325, -.12); shape.closePath();
  const geometry = new ExtrudeGeometry(shape, { depth: .07, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: .015, bevelThickness: .015 });
  const positions = Array.from(geometry.attributes.position.array), normals = Array.from(geometry.attributes.normal.array), uvs = Array.from(geometry.attributes.uv.array);
  geometry.dispose();
  return { positions, normals, uvs, indices: Array.from({ length: positions.length / 3 }, (_, i) => i) };
}

function slotGlyph(slot: number): NonNullable<AgentWorldEntityDefinition["mesh"]> {
  const segments: Record<string, number[]> = { a: [0, .105, .11, .025], g: [0, 0, .11, .025], d: [0, -.105, .11, .025],
    b: [.055, .0525, .025, .08], c: [.055, -.0525, .025, .08], f: [-.055, .0525, .025, .08], e: [-.055, -.0525, .025, .08] };
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  for (const segment of ["bc", "abged", "abgcd", "fgbc"][slot]) {
    const [x, y, w, h] = segments[segment], offset = positions.length / 3;
    positions.push(x-w/2,y-h/2,.091, x+w/2,y-h/2,.091, x+w/2,y+h/2,.091, x-w/2,y+h/2,.091);
    normals.push(0,0,1, 0,0,1, 0,0,1, 0,0,1); indices.push(offset,offset+1,offset+2, offset,offset+2,offset+3);
  }
  return { positions, normals, indices };
}

export async function loadCubzSource(): Promise<CubzSource> {
  const response = await fetch(import.meta.env.BASE_URL + CUBZ_SOURCE_URL.slice(1));
  if (!response.ok) throw new Error(`CubZ source data: HTTP ${response.status}`);
  const data = await response.json() as CubzSource;
  if (data.schema !== "graphysx.cubz-menu-source/v1" || CUBZ_ACTORS.some(id => data.actors?.[id]?.meshes?.length !== 44)) throw new Error("Invalid CubZ source data");
  return data;
}

export function sourceActorTransform(matrix: number[]): Partial<AgentWorldTransform> {
  const position = new Vector3(), quaternion = new Quaternion(), scale = new Vector3();
  reflection.clone().multiply(new Matrix4().fromArray(matrix)).multiply(reflection).decompose(position, quaternion, scale);
  const rotation = new Euler().setFromQuaternion(quaternion);
  return { position: position.toArray(), rotationDegrees: [rotation.x, rotation.y, rotation.z].map(value => value * radiansToDegrees) as Tuple3, scale: scale.toArray() };
}

/** MAMD vertices are local. Reflect both geometry and MHI2 transforms once at this boundary. */
export function sourceActorMesh(mesh: Pick<CubzActor["meshes"][number], "positions" | "normals" | "uvs" | "indices">): NonNullable<AgentWorldEntityDefinition["mesh"]> {
  const positions = mesh.positions.map((value, index) => index % 3 === 2 ? -value : value);
  const normals = mesh.normals.map((value, index) => index % 3 === 2 ? -value : value);
  const indices = [...mesh.indices];
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), normal = new Vector3();
  // Source normal orientation is retained. Reflection changes winding; verify every
  // triangle against its exported normals rather than hiding backfaces with DoubleSide.
  for (let at = 0; at < indices.length; at += 3) {
    a.fromArray(positions, indices[at] * 3); b.fromArray(positions, indices[at + 1] * 3); c.fromArray(positions, indices[at + 2] * 3);
    normal.set(0, 0, 0);
    for (let corner = 0; corner < 3; corner++) normal.add(new Vector3().fromArray(normals, indices[at + corner] * 3));
    if (b.sub(a).cross(c.sub(a)).dot(normal) < 0) [indices[at + 1], indices[at + 2]] = [indices[at + 2], indices[at + 1]];
  }
  return { positions, normals, uvs: [...mesh.uvs], indices };
}

function boxOwner(actor: CubzActor, id: number): number | null {
  let node: SourceNode | undefined = actor.nodes[id];
  while (node) {
    const match = /^Box0([1-8])$/.exec(node.name);
    if (match) return Number(match[1]) - 1;
    node = actor.nodes[node.parent];
  }
  return null;
}

export function buildCubzMenu(data: CubzSource): AgentWorldDefinition {
  const entities: AgentWorldEntityDefinition[] = [
    { id: "cubz-fill", type: "ambient-light", intensity: 1.3 },
    { id: "cubz-key", type: "point-light", intensity: 65, distance: 35, marker: false, transform: { position: [5, 11, 9] }, material: { color: "#b9e9ff" } },
    { id: "cubz-rim", type: "point-light", intensity: 45, distance: 26, marker: false, transform: { position: [-7, 7, -4] }, material: { color: "#edb47e" } },
  ];
  for (const id of CUBZ_ACTORS) {
    const actor = data.actors[id];
    entities.push({ id: cubzRigId(id), type: "group", label: `${id} · complete source TVA actor`, visible: id === "rotation",
      transform: { position: [1.9, 4.6, 2], scale: [nativeDisplayScale, nativeDisplayScale, nativeDisplayScale] }, tags: ["cubz-source-rig", "archive", "adapted-display-scale"] });
    if (id === "screensaver") {
      const centre = data.actors.rotation.nodes.find(node => node.name === "GlobalCube")!.worldMatrix.slice(12, 15) as Tuple3;
      centre[2] *= -1;
      entities.push({ id: "cubz-screensaver-pivot", type: "group", parentId: cubzRigId(id), label: "Rigid waiting rotation · adapted central pivot",
        transform: { position: centre }, tags: ["cubz-rigid-pivot", "adapted-waiting-motion"] });
      entities.push({ id: "cubz-screensaver-offset", type: "group", parentId: "cubz-screensaver-pivot", label: "Preserve the original source bind coordinates",
        transform: { position: centre.map(value => -value) as Tuple3 } });
    }
    for (const node of actor.nodes) entities.push({ id: nodeId(id, node.id), type: "group", label: `${node.name} · ${id}`,
      parentId: node.parent < 0 ? id === "screensaver" ? "cubz-screensaver-offset" : cubzRigId(id) : nodeId(id, node.parent), transform: sourceActorTransform(node.localMatrix), tags: ["cubz-source-node", `source-node-${node.id}`] });
    for (const mesh of actor.meshes) {
      const choice = boxOwner(actor, mesh.nodeId);
      entities.push({ id: `cubz-${id}-m${mesh.nodeId}`, type: "mesh", parentId: nodeId(id, mesh.nodeId), label: `${actor.nodes[mesh.nodeId].name} · source mesh`,
        mesh: sourceActorMesh(mesh), material: { color: "#a8c1c6", metalness: 0.48, roughness: 0.29 }, castShadow: true, receiveShadow: true,
        tags: ["cubz-source-mesh", ...(id === "rotation" && choice !== null ? [`cubz-choice-${choice}`] : []), `cubz-color-${choice ?? 0}`] });
    }
  }
  const keyMesh = buttonMesh();
  for (let choice = 0; choice < 8; choice++) {
    for (const [side, panel] of (["Left08", "Right08"] as const).entries()) entities.push({
      id: buttonRoots(choice)[side], type: "group", label: `Menu ${choice + 1} · ${side === 0 ? "Panneau gauche" : "Panneau droit"}`, visible: false,
      ...cubzPanelMount(data, panel), tags: ["cubz-adapted-buttons", "missing-source-button-geometry", "cubz-panel-mount", `cubz-panel-${panel}`] });
    CUBZ_MENUS[choice].buttons.forEach(({ action, label }, index) => {
      entities.push({ id: cubzButtonId(choice, action), type: "mesh", parentId: buttonRoots(choice)[index < 2 ? 0 : 1],
      label: `Btn${cubzButtonNumber(choice, index)} · ${label} · reconstructed model / current action`,
      mesh: keyMesh, transform: { position: [0, index % 2 ? -0.36 : 0.36, 0] },
      material: { color: CUBZ_COLORS[choice], emissive: CUBZ_COLORS[choice], emissiveIntensity: 0.15, metalness: 0.25, roughness: 0.4 },
      tags: [`cubz-action-${action}`, `cubz-button-${cubzButtonNumber(choice, index)}`, "adapted-menu-action", "reconstructed-button-model"] });
      entities.push({ id: `cubz-slot-${choice}-${index}`, type: "mesh", parentId: cubzButtonId(choice, action), label: `Slot ${index + 1} · current marking`, mesh: slotGlyph(index),
        material: { color: "#12343d", roughness: .8 }, tags: [`cubz-action-${action}`, "adapted-button-marking"] });
    });
  }
  entities.push({ id: "cubz-exit", type: "group", label: "BtnExit · reconstructed shared return key", visible: false,
    ...cubzPanelMount(data, "Top08"), tags: ["reconstructed-button-model", "cubz-shared-exit", "cubz-panel-mount", "cubz-panel-Top08"] });
  entities.push({ id: "cubz-exit-face", type: "mesh", parentId: "cubz-exit", label: "Refermer et revenir aux huit cubes", mesh: keyMesh,
    transform: { scale: [2.25, .7, 1] }, material: { color: "#d7e9e3", metalness: .35, roughness: .32 }, tags: ["cubz-action-close"] });
  entities.push({ id: "cubz-exit-arrow", type: "mesh", parentId: "cubz-exit", label: "Return arrow · reconstructed marking",
    mesh: { positions: [-.18,0,.091, -.05,.09,.091, -.05,.035,.091, .18,.035,.091, .18,-.035,.091, -.05,-.035,.091, -.05,-.09,.091],
      normals: Array.from({ length: 7 }, () => [0,0,1]).flat(), indices: [0,2,1,0,5,2,0,6,5,2,4,3,2,5,4] },
    material: { color: "#12343d", roughness: .8 }, tags: ["cubz-action-close", "adapted-button-marking"] });
  return { schema: "graphysx.agent-world/v2", id: "archive-cubz-menu", label: "CubZ · recovered mechanical menu",
    environment: { background: "#091c28", ground: { visible: true, size: 50, color: "#102c37", grid: false, gridColor: "#234551" },
      lighting: { source: "studio", intensity: 0.75, yawDegrees: 25, backgroundIntensity: 1, backgroundBlur: 0 } }, entities };
}

function sampleSource(keys: number[][], frame: number, quaternion: boolean): number[] {
  const next = keys.findIndex(key => key[0] > frame);
  const a = keys[Math.max(0, next < 0 ? keys.length - 1 : next - 1)], b = next < 0 ? a : keys[next];
  const alpha = a === b ? 0 : Math.max(0, (frame - a[0]) / (b[0] - a[0]));
  if (quaternion) return new Quaternion(a[1], a[2], a[3], a[4]).normalize().slerp(new Quaternion(b[1], b[2], b[3], b[4]).normalize(), alpha).toArray();
  return a.slice(1).map((value, index) => value + (b[index + 1] - value) * alpha);
}

/** Clip source frame ranges with sampled endpoints, preserving all interior keys. */
export function cubzSourceTrack(actor: CubzActor, track: SourceTrack, rangeId: number, startSeconds: number, offset: number, reverse: boolean, duration: number): KeyframeTrackBehavior {
  const range = actor.ranges.find(range => range.id === rangeId);
  if (!range) throw new Error(`Missing source range ${rangeId}`);
  const clip = (keys: number[][], quaternion: boolean, reflected: boolean): number[][] | undefined => {
    if (!keys.length) return undefined;
    const frames = [...new Set([range.start, ...keys.filter(key => key[0] > range.start && key[0] < range.end).map(key => key[0]), range.end])];
    return frames.map(frame => {
      const values = sampleSource(keys, frame, quaternion);
      // MANI stores passive rotations: every first key agrees with the independent
      // MHI2 bind matrix only after conjugation. Convert to an active quaternion,
      // then reflect Z like the geometry/matrices: S * R(q^-1) * S = (x,y,-z,w).
      // Reflecting the stored quaternion directly flips cylinders and petal hinges.
      if (quaternion) values[2] *= -1;
      else if (reflected) values[2] *= -1;
      return [offset + (reverse ? range.end - frame : frame - range.start) / range.fps, ...values];
    }).sort((a, b) => a[0] - b[0]);
  };
  return { id: "cubz-source", type: "keyframes", startSeconds, durationSeconds: duration,
    positions: clip(track.positions, false, true) as VectorKey[] | undefined,
    rotations: clip(track.rotations, true, false) as QuaternionKey[] | undefined,
    scales: clip(track.scales, false, false) as VectorKey[] | undefined };
}

export type CubzMenuState = { phase: "idle" | "rotating" | "opening" | "opened" | "closing" | "returning" | "screensaver" | "unavailable"; choice: number | null; progress: number };
const ownsPlayback = (entity: AgentWorldEntityDefinition, behavior: { id?: string }): boolean =>
  /^cubz-(?:(?:rotation|open|screensaver)-(?:n\d+|rig)|screensaver-pivot|menu-[0-7](?:-right)?|exit)$/.test(entity.id ?? "") &&
  (behavior.id === "cubz-source" || behavior.id === "cubz-visibility" || /^cubz-program-(?:open|return|saver)-[0-7]$/.test(behavior.id ?? ""));
export function cubzMenuState(document: AgentWorldDefinition | null, elapsed: number): CubzMenuState {
  const root = document?.entities.find(entity => entity.id === cubzRigId("rotation"));
  if (document?.id !== "archive-cubz-menu" || !root || !document.entities.some(entity => entity.id === cubzRigId("open"))) return { phase: "unavailable", choice: null, progress: 0 };
  const program = root.behaviors?.find(behavior => behavior.id?.startsWith("cubz-program-")) as KeyframeTrackBehavior | undefined;
  if (!program) return { phase: "idle", choice: null, progress: 0 };
  const match = /^cubz-program-(open|return|saver)-([0-7])$/.exec(program.id!);
  if (!match) return { phase: "unavailable", choice: null, progress: 0 };
  const choice = Number(match[2]), time = Math.max(0, elapsed - (program.startSeconds ?? 0));
  const rotationTime = choice === 0 ? 0 : 28 / 30, openTime = 50 / 30;
  const progress = Math.min(1, time / program.durationSeconds);
  if (match[1] === "saver") return { phase: "screensaver", choice: null, progress: (time % program.durationSeconds) / program.durationSeconds };
  if (match[1] === "return") return { phase: time >= program.durationSeconds ? "idle" : time < openTime ? "closing" : "returning", choice: progress === 1 ? null : choice, progress };
  return { phase: time >= program.durationSeconds ? "opened" : time < rotationTime ? "rotating" : "opening", choice, progress };
}

/** Remove only this player's authored tracks; keep arbitrary user entities and edits. */
export function cubzResetCommands(document: AgentWorldDefinition): AgentWorldCommand[] {
  const commands: AgentWorldCommand[] = [];
  for (const entity of document.entities) {
    const owned = entity.behaviors?.filter(behavior => ownsPlayback(entity, behavior)) ?? [];
    for (const behavior of owned) commands.push({ op: "detach-behavior", id: entity.id!, behaviorId: behavior.id! });
    if (owned.length && entity.tags?.some(tag => tag === "cubz-source-node" || tag === "cubz-rigid-pivot")) commands.push({ op: "update", id: entity.id!, patch: { transform: entity.transform } });
  }
  for (const actor of CUBZ_ACTORS) commands.push({ op: "update", id: cubzRigId(actor), patch: { visible: actor === "rotation" } });
  for (let choice = 0; choice < 8; choice++) for (const id of buttonRoots(choice)) if (document.entities.some(entity => entity.id === id)) commands.push({ op: "update", id, patch: { visible: false } });
  if (document.entities.some(entity => entity.id === "cubz-exit")) commands.push({ op: "update", id: "cubz-exit", patch: { visible: false } });
  return commands;
}

export function cubzSequenceCommands(data: CubzSource, document: AgentWorldDefinition, mode: "open" | "return" | "saver", choice: number, now: number): AgentWorldCommand[] {
  if (!Number.isInteger(choice) || choice < 0 || choice > 7) throw new Error("CubZ choice must be 0..7");
  if (cubzMenuState(document, now).phase === "unavailable") throw new Error("CubZ rig is unavailable");
  const commands = cubzResetCommands(document);
  const rotationTime = choice === 0 ? 0 : 28 / 30, openTime = 50 / 30;
  const duration = mode === "saver" ? 25 : rotationTime + openTime;
  const visibility = (id: string, keys: [number, boolean][], program = false) => commands.push({ op: "attach-behavior", id,
    behavior: { id: program ? `cubz-program-${mode}-${choice}` : "cubz-visibility", type: "keyframes", startSeconds: now, durationSeconds: duration, loop: mode === "saver", visibility: keys } });
  if (mode === "saver") {
    visibility(cubzRigId("rotation"), [[0, false]], true); visibility(cubzRigId("open"), [[0, false]]); visibility(cubzRigId("screensaver"), [[0, true]]);
    // The recorded saver translates individual parts and breaks the connections.
    // Keep its complete bind geometry and raw clip, but honour the owner's rigid
    // menu requirement with one explicitly adapted rotation around GlobalCube's pivot.
    commands.push({ op: "attach-behavior", id: "cubz-screensaver-pivot", behavior: { id: "cubz-source", type: "keyframes", startSeconds: now, durationSeconds: duration, loop: true,
      rotations: Array.from({ length: 5 }, (_, index) => [index * duration / 4, 0, Math.sin(index * Math.PI / 4), 0, Math.cos(index * Math.PI / 4)] as QuaternionKey) } });
    return commands;
  } else {
    visibility(cubzRigId("rotation"), mode === "open" ? (rotationTime ? [[0, true], [rotationTime, false]] : [[0, false]]) : [[0, false], [openTime, true]], true);
    visibility(cubzRigId("open"), mode === "open" ? (rotationTime ? [[0, false], [rotationTime, true]] : [[0, true]]) : [[0, true], [openTime, false]]);
    visibility(cubzRigId("screensaver"), [[0, false]]);
    for (let i = 0; i < 8; i++) for (const id of buttonRoots(i)) if (document.entities.some(entity => entity.id === id)) visibility(id, mode === "open" && i === choice ? [[0, false], [duration, true]] : [[0, false]]);
    if (document.entities.some(entity => entity.id === "cubz-exit")) visibility("cubz-exit", mode === "open" ? [[0, false], [duration, true]] : [[0, false]]);
  }
  const actors: CubzActorId[] = rotationTime ? ["rotation", "open"] : ["open"];
  for (const id of actors) for (const track of data.actors[id].tracks) {
    const offset = mode === "open" ? (id === "open" ? rotationTime : 0) : id === "rotation" ? openTime : 0;
    const behavior = cubzSourceTrack(data.actors[id], track, id === "rotation" ? choice : 0, now, offset, mode === "return", duration);
    commands.push({ op: "attach-behavior", id: nodeId(id, track.nodeId), behavior });
  }
  return commands;
}

export function cubzColorCommands(document: AgentWorldDefinition, diagnostic: boolean): AgentWorldCommand[] {
  return document.entities.filter(entity => entity.tags?.includes("cubz-source-mesh")).map(entity => ({ op: "update", id: entity.id!,
    patch: { material: { color: diagnostic ? CUBZ_COLORS[Number(entity.tags?.find(tag => tag.startsWith("cubz-color-"))?.slice(11) ?? 0)] : "#a8c1c6" } } }));
}

/** A deliberate copy of the visible pose, ready for normal Studio save/export/edit. */
export function cubzStudioPose(document: AgentWorldDefinition, elapsed: number): AgentWorldDefinition {
  if (cubzMenuState(document, elapsed).phase === "unavailable") return structuredClone(document);
  const copy = structuredClone(document);
  for (const entity of copy.entities) {
    const owned = entity.behaviors?.filter(behavior => ownsPlayback(entity, behavior)) ?? [];
    if (!owned.length) continue;
    const position = new Vector3(...(entity.transform?.position ?? [0, 0, 0]));
    const degrees = entity.transform?.rotationDegrees ?? [0, 0, 0];
    const rotation = new Quaternion().setFromEuler(new Euler(...degrees.map(value => value / radiansToDegrees) as Tuple3));
    const pose = { visible: entity.visible ?? true, scale: new Vector3(...(entity.transform?.scale ?? [1, 1, 1])) };
    for (const behavior of owned) if (behavior.type === "keyframes") sampleKeyframeTrack(behavior, elapsed, position, rotation, pose);
    const euler = new Euler().setFromQuaternion(rotation);
    entity.transform = { position: position.toArray(), rotationDegrees: [euler.x, euler.y, euler.z].map(value => value * radiansToDegrees) as Tuple3, scale: pose.scale.toArray() };
    entity.visible = pose.visible;
    if (entity.behaviors) entity.behaviors = entity.behaviors.filter(behavior => !ownsPlayback(entity, behavior));
  }
  // Keep every actor and user child in the copy. Hidden rigs stay available in the
  // outliner; visible-ancestor filtering in Studio prevents them stealing mesh picks.
  copy.id = "archive-cubz-menu-pose"; copy.label = "CubZ · editable visible pose";
  return copy;
}
