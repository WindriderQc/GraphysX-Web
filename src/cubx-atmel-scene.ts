import { Euler, Quaternion, Vector3 } from "three";
import { sampleKeyframeTrack, type KeyframeTrackBehavior } from "./agent-world-motion";
import type { AgentWorldCommand, AgentWorldDefinition, AgentWorldEntityDefinition } from "./agent-world-runtime";
import { cubzSourceTrack, sourceActorMesh, sourceActorTransform, type CubzActor } from "./cubz-menu-scene";

type Tuple3 = [number, number, number];
type SourceMesh = Parameters<typeof sourceActorMesh>[0];
type SourceModel = { id: string; source: string; sourceSha256: string; vertexCount: number; triangleCount: number };
export type CubxAtmelSource = {
  schema: "graphysx.cubx-atmel-source/v1";
  actors: Record<string, CubzActor>; studies: Record<string, CubzActor>; clicks: SourceMesh[];
  models: Record<string, SourceModel>; glyphs: Record<string, SourceMesh>;
  terrain: { size: number; heightScale: number; segments: number; heights: number[] };
};
export const ATMEL_SOURCE_URL = "/assets/ports/archive-cubx-atmel.json";
export const ATMEL_SCALE = .03;
export const ATMEL_MACHINE = "atmel-machine";
export const ATMEL_INDICATOR_SLOT = "mesh:0:sphere-tvm:material:0:gold-01-jpg-source-host-override";
export const ATMEL_WORLD = "archive-cubx-atmel";
export const ATMEL_CLOCKS = ["main", "light-on", "light-off", "fan-on", "fan-off"] as const;
export type AtmelClockId = typeof ATMEL_CLOCKS[number];
export type AtmelPhase = "idle" | "aligning" | "rotating" | "opening" | "opened" | "closing" | "returning" | "saver" | "unavailable";
const degrees = 180 / Math.PI;
const rig = (id: string) => `atmel-rig-${id}`;
const nodeId = (id: string, node: number) => `atmel-${id}-n${node}`;
const actorIds = ["get2", "get3", "get4", "get5", "get6", "get7", "get8", "open"];
const clockNames: Record<AtmelClockId, string> = { main: "Horloge capturée", "light-on": "Lumière · démarrage", "light-off": "Lumière · arrêt", "fan-on": "Ventilateur · démarrage", "fan-off": "Ventilateur · arrêt" };

export async function loadCubxAtmelSource(signal?: AbortSignal): Promise<CubxAtmelSource> {
  const response = await fetch(import.meta.env.BASE_URL + ATMEL_SOURCE_URL.slice(1), { signal });
  if (!response.ok) throw new Error(`CubX Atmel source: HTTP ${response.status}`);
  const source = await response.json() as CubxAtmelSource;
  if (source.schema !== "graphysx.cubx-atmel-source/v1" || source.clicks?.length !== 8 || actorIds.some(id => source.actors?.[id]?.meshes.length !== 23) || !source.models?.domotics) throw new Error("Invalid CubX Atmel source");
  return source;
}

function sourcePosition(value: Tuple3): Tuple3 { return [value[0] * ATMEL_SCALE, value[1] * ATMEL_SCALE, -value[2] * ATMEL_SCALE]; }
function model(data: CubxAtmelSource, key: string, id: string, parentId: string | undefined, position: Tuple3, scale: number, label: string): AgentWorldEntityDefinition {
  return { id, type: "model", parentId, label, asset: { id: data.models[key].id }, transform: { position: sourcePosition(position), scale: [scale * ATMEL_SCALE, scale * ATMEL_SCALE, scale * ATMEL_SCALE] }, tags: ["atmel-native-model", `source-${key}`] };
}

/** Full source constellation and the distinct eight-choice CubXActor family. */
export function buildCubxAtmel(data: CubxAtmelSource, capturedTime = "11:11"): AgentWorldDefinition {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(capturedTime)) throw new Error("Invalid initial source clock");
  const entities: AgentWorldEntityDefinition[] = [
    { id: "atmel-fill", type: "ambient-light", intensity: 1.1, material: { color: "#ffffff" } },
    { id: "atmel-key", type: "directional-light", intensity: 2.3, transform: { position: [12, 45, 24] }, material: { color: "#fff0cf" } },
    { id: "atmel-main", type: "group", label: "Accueil Atmel · constellation source" },
    { id: "atmel-controls", type: "group", label: "Panneau Atmel · réglages locaux", visible: false },
    { id: ATMEL_MACHINE, type: "group", parentId: "atmel-main", label: "CubXActor · origine et pivots natifs", transform: { position: sourcePosition([-400, 500, 0]), scale: [ATMEL_SCALE, ATMEL_SCALE, ATMEL_SCALE] }, tags: ["atmel-source-machine"] },
    { id: rig("closed"), type: "group", parentId: ATMEL_MACHINE, label: "CubXMesh · assemblage fermé" },
    { id: "atmel-closed-model", type: "model", parentId: rig("closed"), label: "CubXMesh.tvm · origine conservée", asset: { id: data.models.closed.id }, tags: ["atmel-native-model", "atmel-closed-model"] },
    { id: "atmel-terrain", type: "terrain", parentId: "atmel-main", label: "heightmapSplit.jpg · relief retrouvé", terrain: { size: data.terrain.size * ATMEL_SCALE, heightScale: data.terrain.heightScale * ATMEL_SCALE, segments: data.terrain.segments, heights: [...data.terrain.heights], heightOffset: 0, flattenRadius: 0, flattenFalloff: 0 },
      material: { color: "#9ea991", roughness: .98, texture: { id: "cubx-atmel-grass", repeat: [10, 10] } }, tags: ["atmel-source-heightmap", "adapted-terrain-sampling"] },
  ];
  data.clicks.forEach((mesh, i) => entities.push({ id: `atmel-click-${i + 1}`, type: "mesh", parentId: rig("closed"), label: `CubXBtn${i + 1}.tvm · volume de sélection d’origine`, visible: false,
    mesh: sourceActorMesh(mesh), tags: ["atmel-source-click", `atmel-choice-${i + 1}`] }));
  for (const id of actorIds) {
    const actor = data.actors[id];
    entities.push({ id: rig(id), type: "group", parentId: ATMEL_MACHINE, label: `${id} · acteur TVA complet`, visible: false });
    for (const node of actor.nodes) entities.push({ id: nodeId(id, node.id), type: "group", label: `${node.name} · ${id}`, parentId: node.parent < 0 ? rig(id) : nodeId(id, node.parent), transform: sourceActorTransform(node.localMatrix), tags: ["atmel-source-node"] });
    for (const mesh of actor.meshes) entities.push({ id: `atmel-${id}-mesh-${mesh.nodeId}`, type: "mesh", parentId: nodeId(id, mesh.nodeId), label: `${actor.nodes[mesh.nodeId].name} · ${id} · maillage natif`,
      mesh: sourceActorMesh(mesh), material: { color: "#b9c5cf", metalness: .3, roughness: .34 }, castShadow: true, receiveShadow: true, tags: ["atmel-source-mesh", `atmel-actor-${id}`] });
  }
  entities.push(
    model(data, "system", "atmel-system", "atmel-main", [-800, 300, -250], 10, "SYSTEM · cube et icône d’origine"),
    model(data, "tools", "atmel-tools", "atmel-main", [-1100, 300, -500], 10, "TOOLS · cube et icône d’origine"),
    model(data, "earth", "atmel-earth", "atmel-main", [800, 500, 350], 10, "Terre · modèle et texture d’origine"),
    { ...model(data, "grid", "atmel-grid", "atmel-main", [800, 500, 350], 1.2, "Grille terrestre · transparence noire d’origine"), asset: { id: data.models.grid.id, colorKey: "#000000", colorKeyTolerance: .01, alphaTest: .1 } },
    { ...model(data, "arrow", "atmel-arrow", "atmel-main", [1000, 600, 300], 1, "Flèche · retour à l’accueil Atmel"), transform: { ...model(data, "arrow", "unused", undefined, [1000, 600, 300], 1, "").transform, rotationDegrees: [0, -180, 0] } },
    model(data, "domotics", "atmel-domotics", "atmel-controls", [-350, 250, 0], 8, "MenuDomo.TVM · panneau d’origine"),
    { id: "atmel-sun", type: "box", parentId: "atmel-main", label: "Soleil · boîte source", geometry: { width: 20 * ATMEL_SCALE, height: 20 * ATMEL_SCALE, depth: 20 * ATMEL_SCALE }, transform: { position: sourcePosition([0, 500, 0]) }, material: { color: "#ed674c", emissive: "#e3502b", emissiveIntensity: .35 }, tags: ["source-procedural-box"] },
  );
  for (const [channel, position] of [["light", [-1250, 800, 0]], ["fan", [-1250, 300, 0]]] as const) entities.push({ id: `atmel-${channel}-indicator`, type: "model", parentId: "atmel-controls", label: channel === "light" ? "État lumière · aperçu local" : "État ventilateur · aperçu local", asset: { id: data.models.indicator.id }, transform: { position: sourcePosition([...position]), scale: [.3 * ATMEL_SCALE, .3 * ATMEL_SCALE, .3 * ATMEL_SCALE] }, modelMaterialOverrides: { [ATMEL_INDICATOR_SLOT]: { color: "#ffdf55" } }, tags: ["atmel-local-indicator"] });
  // MenuDomo's light OFF/ON lettering is reversed relative to the C++ display names.
  // Match the engraved labels for editing; retain the original host as pinned evidence.
  const schedules: [AtmelClockId, Tuple3, number][] = [["main", [600, 975, 0], 3], ["light-on", [-400, 700, 0], 1], ["light-off", [-400, 850, 0], 1], ["fan-on", [-400, 350, 0], 1], ["fan-off", [-400, 200, 0], 1]];
  for (const [key, position, size] of schedules) {
    const digits = (key === "main" ? capturedTime : "11:11").replace(":", "");
    if (!/^\d{4}$/.test(digits)) throw new Error("Invalid initial source clock");
    entities.push({ id: `atmel-time-${key}`, type: "group", parentId: key === "main" ? "atmel-main" : "atmel-controls", label: clockNames[key] });
    [0, 55, 165, 220].forEach((offset, i) => entities.push({ id: `atmel-time-${key}-${i}`, type: "mesh", parentId: `atmel-time-${key}`, label: `${clockNames[key]} · chiffre ${i + 1}`, mesh: sourceActorMesh(data.glyphs["digit-" + digits[i]]), material: { color: "#1455ff", roughness: .4 }, transform: { position: sourcePosition([position[0] + offset * size, position[1], position[2]]), scale: [size * ATMEL_SCALE, size * ATMEL_SCALE, size * ATMEL_SCALE], rotationDegrees: [90, 0, 0] }, tags: ["atmel-native-digit", "atmel-digit-" + digits[i]] }));
    [15, 50].forEach((offset, i) => entities.push({ id: `atmel-time-${key}-dot-${i}`, type: "sphere", parentId: `atmel-time-${key}`, geometry: { radius: 10 * size * ATMEL_SCALE }, transform: { position: sourcePosition([position[0] + 110 * size, position[1] + offset * size, position[2]]) }, material: { color: "#387aff", roughness: .4 }, tags: ["source-procedural-clock-colon"] }));
  }
  return { schema: "graphysx.agent-world/v2", id: ATMEL_WORLD, label: "CubX · l’accueil Atmel retrouvé", entities,
    environment: { background: "#102532", ground: { visible: false, size: 160, color: "#283d35", grid: false, gridColor: "#456057" }, lighting: { source: "hdri", hdri: "studio-small-08", intensity: .65, yawDegrees: -25, backgroundIntensity: .4, backgroundBlur: .3 }, envelope: { cameraFar: 1200, fogNear: 300, fogFar: 800 } } };
}

const owns = (entity: AgentWorldEntityDefinition, behavior: { id?: string }): boolean =>
  (entity.id === ATMEL_MACHINE || /^atmel-(?:rig-(?:closed|get[2-8]|open)|(?:get[2-8]|open)-n\d+)$/.test(entity.id ?? "")) &&
  (behavior.id === "atmel-source" || behavior.id === "atmel-visibility" || /^atmel-program-(?:open|return|saver)-[1-8]-[01]$/.test(behavior.id ?? ""));
export function atmelState(document: AgentWorldDefinition | null, elapsed: number): { phase: AtmelPhase; choice: number | null; progress: number } {
  const root = document?.entities.find(entity => entity.id === ATMEL_MACHINE);
  if (document?.id !== ATMEL_WORLD || !root || !document.entities.some(entity => entity.id === rig("open"))) return { phase: "unavailable", choice: null, progress: 0 };
  const program = root.behaviors?.find(b => b.id?.startsWith("atmel-program-")) as KeyframeTrackBehavior | undefined;
  if (!program) return { phase: "idle", choice: null, progress: 0 };
  const match = /^atmel-program-(open|return|saver)-([1-8])-([01])$/.exec(program.id!);
  if (!match) return { phase: "unavailable", choice: null, progress: 0 };
  const start = program.startSeconds ?? 0, time = Math.max(0, elapsed - start), choice = Number(match[2]);
  const alignment = match[3] === "1" ? .45 : 0, motion = choice === 1 ? 0 : 100 / 30, opening = 100 / 30;
  if (match[1] === "saver") return { phase: "saver", choice: null, progress: (time % program.durationSeconds) / program.durationSeconds };
  // Compare absolute boundaries: subtracting a late start can round just below a key.
  const finished = elapsed >= start + program.durationSeconds, progress = finished ? 1 : Math.min(1, time / program.durationSeconds);
  if (match[1] === "return") return { phase: finished ? "idle" : elapsed < start + opening ? "closing" : "returning", choice: finished ? null : choice, progress };
  return { phase: finished ? "opened" : elapsed < start + alignment ? "aligning" : elapsed < start + alignment + motion ? "rotating" : "opening", choice, progress };
}

export function resetAtmel(document: AgentWorldDefinition): AgentWorldCommand[] {
  const commands: AgentWorldCommand[] = [];
  for (const entity of document.entities) {
    const tracks = entity.behaviors?.filter(b => owns(entity, b)) ?? [];
    for (const track of tracks) commands.push({ op: "detach-behavior", id: entity.id!, behaviorId: track.id! });
    if (tracks.length) commands.push({ op: "update", id: entity.id!, patch: { transform: entity.transform } });
  }
  for (const id of ["closed", ...actorIds]) commands.push({ op: "update", id: rig(id), patch: { visible: id === "closed" } });
  return commands;
}

export function atmelSequence(data: CubxAtmelSource, document: AgentWorldDefinition, mode: "open" | "return" | "saver", choice: number, now: number, currentRotation?: Tuple3): AgentWorldCommand[] {
  if (!Number.isInteger(choice) || choice < 1 || choice > 8 || atmelState(document, now).phase === "unavailable") throw new Error("CubX source choice unavailable");
  const machine = document.entities.find(e => e.id === ATMEL_MACHINE)!;
  const baseRotation = machine.transform?.rotationDegrees ?? [0, 0, 0];
  const base = new Quaternion().setFromEuler(new Euler(...baseRotation.map(v => v / degrees) as Tuple3));
  const from = new Quaternion().setFromEuler(new Euler(...(currentRotation ?? baseRotation).map(v => v / degrees) as Tuple3));
  const align = mode === "open" && from.angleTo(base) > .00001 ? .45 : 0;
  // Detach old tracks without snapping a paused object away from the next clip's first key.
  // Definitions retain their authored bind transforms; only the runtime's already sampled
  // pose is held until the shared simulation samples the newly attached tracks.
  const commands = resetAtmel(document).filter(command => command.op !== "update" || !command.patch.transform || (command.id === ATMEL_MACHINE ? !align : mode !== "return"));
  const motion = choice === 1 ? 0 : 100 / 30, opening = 100 / 30;
  const duration = mode === "saver" ? 360 / Math.sqrt(3 * 20 ** 2) : opening + motion + align;
  const visibility = (id: string, keys: [number, boolean][], marker = false) => {
    if (id !== ATMEL_MACHINE) commands.push({ op: "update", id, patch: { visible: keys[0][1] } });
    commands.push({ op: "attach-behavior", id, behavior: { id: marker ? `atmel-program-${mode}-${choice}-${align ? 1 : 0}` : "atmel-visibility", type: "keyframes", startSeconds: now, durationSeconds: duration, loop: mode === "saver", visibility: keys } });
  };
  visibility(ATMEL_MACHINE, [[0, true]], true);
  if (mode === "saver") {
    const axis = new Vector3(1, 1, -1).normalize();
    commands.push({ op: "attach-behavior", id: ATMEL_MACHINE, behavior: { id: "atmel-source", type: "keyframes", startSeconds: now, durationSeconds: duration, loop: true,
      rotations: Array.from({ length: 5 }, (_, i) => [duration * i / 4, ...base.clone().multiply(new Quaternion().setFromAxisAngle(axis, i * Math.PI / 2)).toArray()] as [number, number, number, number, number]) } });
    return commands;
  }
  if (align) commands.push({ op: "attach-behavior", id: ATMEL_MACHINE, behavior: { id: "atmel-source", type: "keyframes", startSeconds: now, durationSeconds: duration, rotations: [[0, ...from.toArray()], [align, ...base.toArray()]] } });
  const selected = `get${choice}`;
  visibility(rig("closed"), mode === "open" ? align ? [[0, true], [align, false]] : [[0, false]] : [[0, false], [duration, true]]);
  if (motion) visibility(rig(selected), mode === "open" ? align ? [[0, false], [align, true], [align + motion, false]] : [[0, true], [motion, false]] : [[0, false], [opening, true], [duration, false]]);
  visibility(rig("open"), mode === "open" ? align + motion ? [[0, false], [align + motion, true]] : [[0, true]] : [[0, true], [opening, false]]);
  for (const id of motion ? [selected, "open"] : ["open"]) for (const track of data.actors[id].tracks) {
    const offset = mode === "open" ? align + (id === "open" ? motion : 0) : id === "open" ? 0 : opening;
    commands.push({ op: "attach-behavior", id: nodeId(id, track.nodeId), behavior: { ...cubzSourceTrack(data.actors[id], track, 0, now, offset, mode === "return", duration), id: "atmel-source" } });
  }
  return commands;
}

export function atmelClock(document: AgentWorldDefinition, clock: AtmelClockId): string {
  return [0, 1, 2, 3].map(i => document.entities.find(e => e.id === `atmel-time-${clock}-${i}`)?.tags?.find(tag => /^atmel-digit-\d$/.test(tag))?.slice(-1) ?? "0").join("").replace(/^(\d\d)/, "$1:");
}
export function updateAtmelClock(data: CubxAtmelSource, document: AgentWorldDefinition, clock: AtmelClockId, value: string): AgentWorldCommand[] {
  if (!ATMEL_CLOCKS.includes(clock) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) || atmelState(document, 0).phase === "unavailable") throw new Error("Invalid source clock");
  return value.replace(":", "").split("").map((digit, i) => {
    const id = `atmel-time-${clock}-${i}`, entity = document.entities.find(e => e.id === id);
    if (!entity) throw new Error("Source clock glyph is missing");
    return { op: "update", id, patch: { mesh: sourceActorMesh(data.glyphs["digit-" + digit]), tags: [...(entity.tags ?? []).filter(tag => !/^atmel-digit-\d$/.test(tag)), "atmel-digit-" + digit] } };
  });
}

/** Freeze only this menu's tracks, retaining every native actor and foreign edit. */
export function atmelStudioPose(document: AgentWorldDefinition, elapsed: number): AgentWorldDefinition {
  if (atmelState(document, elapsed).phase === "unavailable") return structuredClone(document);
  const copy = structuredClone(document);
  for (const entity of copy.entities) {
    const owned = entity.behaviors?.filter(b => owns(entity, b)) ?? [];
    if (!owned.length) continue;
    const position = new Vector3(...(entity.transform?.position ?? [0, 0, 0])), scale = new Vector3(...(entity.transform?.scale ?? [1, 1, 1]));
    const rotation = new Quaternion().setFromEuler(new Euler(...(entity.transform?.rotationDegrees ?? [0, 0, 0]).map(v => v / degrees) as Tuple3));
    const pose = { visible: entity.visible ?? true, scale };
    for (const behavior of owned) if (behavior.type === "keyframes") sampleKeyframeTrack(behavior, elapsed, position, rotation, pose);
    const euler = new Euler().setFromQuaternion(rotation);
    entity.transform = { position: position.toArray(), scale: scale.toArray(), rotationDegrees: [euler.x, euler.y, euler.z].map(v => v * degrees) as Tuple3 };
    entity.visible = pose.visible; entity.behaviors = entity.behaviors?.filter(b => !owns(entity, b));
  }
  copy.id = "archive-cubx-atmel-pose"; copy.label = "CubX · accueil et pose modifiables";
  return copy;
}
