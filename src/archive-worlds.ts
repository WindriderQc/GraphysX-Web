import common from "./content/common-scenes.json" with { type: "json" };
import houseRecord from "./content/inspection-maison.json" with { type: "json" };
import { buildArchiveBuilding } from "./archive-buildings";
import { buildArchiveCuisine } from "./archive-revival-scenes";
import { buildCubzTracks, buildFlightX } from "./archive-world-motion";
import type { AgentWorldDefinition, AgentWorldEntityDefinition, AgentWorldVector3 } from "./agent-world-runtime";

export type ArchiveWorldId = "maison" | "arena" | "common-room" | "notes" | "cubz" | "flightx";
const ground = { visible: false, size: 60, color: "#263039", grid: false, gridColor: "#263039" };
const fill = (intensity = 0.9): AgentWorldEntityDefinition => ({ id: "archive-world-fill", type: "ambient-light", intensity,
  material: { color: "#e0e9ee" }, tags: ["adapted-lighting"] });
const environment = { background: "#b8c3c4", ground,
  lighting: { source: "studio" as const, intensity: 0.6, yawDegrees: 0, backgroundIntensity: 1, backgroundBlur: 0 } };
export const ARCHIVE_WORLD_LABELS: Record<ArchiveWorldId, string> = {
  maison: "Maison & Cuisine", arena: "Unity Arena", "common-room": "Common Room", notes: "Notes 3D · CubX",
  cubz: "CubZ · pistes TVA en 3D", flightx: "FlightX · vol cinématique",
};
export const MAISON_VIEWS = ["house", "kitchen", "massing"] as const;
export type MaisonView = typeof MAISON_VIEWS[number];

export function buildMaisonExplorer(): AgentWorldDefinition {
  const kitchen = buildArchiveCuisine().entities.filter((entity) => entity.type !== "ambient-light");
  const massing = buildArchiveBuilding().entities;
  return { schema: "graphysx.agent-world/v2", id: "archive-maison-explorer", label: "Maison & Cuisine · source-separated explorer", environment,
    entities: [fill(),
      { id: "maison-house", type: "group", label: "House · complete source geometry", visible: true, tags: ["archive", "maison-view:house"] },
      { id: "maison-kitchen", type: "group", label: "Kitchen · complete source geometry", visible: false, tags: ["archive", "maison-view:kitchen"] },
      { id: "maison-massing", type: "group", label: "Earlier massing adaptation", visible: false, tags: ["archive", "maison-view:massing", "adapted"] },
      { id: "maison-source-model", type: "model", parentId: "maison-house", label: "House · 24 source mesh parts",
        asset: { id: "archive-maison", fitSize: 17.9687165 }, transform: { position: [-2.8890234, 2.2987227, -0.7030624] },
        tags: ["archive", "faithful-geometry", "source:maison.blend"] },
      ...kitchen.map((entity) => ({ ...entity, parentId: "maison-kitchen" })),
      ...massing.map((entity) => ({ ...entity, parentId: entity.parentId ?? "maison-massing" })),
    ] };
}

export function buildUnityArena(): AgentWorldDefinition {
  return { schema: "graphysx.agent-world/v2", id: "archive-unity-arena", label: "Unity Arena · authored environment, no gameplay", environment,
    entities: [fill(0.8),
      { id: "arena-source-model", type: "model", label: "Arena · source OBJ and painted atlas", asset: { id: "archive-unity-arena", fitSize: 40 },
        transform: { position: [1.4151101, 0.69250107, -1.6516027] }, tags: ["archive", "source:Arena.unity", "no-gameplay"] },
      { id: "arena-source-sun", type: "directional-light", intensity: 1, transform: { position: [0, 7.51, -13.44], rotationDegrees: [50, -49.32, 0] },
        material: { color: "#fff4e7" }, tags: ["archive", "adapted-lighting"] },
    ] };
}

export function buildCommonRoom(): AgentWorldDefinition {
  const source = common.scenes.find((scene) => scene.id === "common-room")!;
  const indices = source.indices.slice();
  for (let index = 0; index < indices.length; index += 3) [indices[index + 1], indices[index + 2]] = [indices[index + 2], indices[index + 1]];
  return { schema: "graphysx.agent-world/v2", id: "archive-common-room", label: "Common Room · exact decoded shell", environment: { ...environment, background: "#102131" },
    entities: [fill(1.25),
      { id: "common-room-shell", type: "mesh", label: "room.tvm · 180 vertices / 250 triangles",
        mesh: { positions: source.positions.map((value, index) => index % 3 === 2 ? -value : value),
          normals: source.normals.map((value, index) => index % 3 === 2 ? -value : value),
          uvs: source.uvs!.map((value, index) => index % 2 === 1 ? 1 - value : value), indices },
        material: { color: "#ffffff", roughness: 0.68, metalness: 0,
          texture: { id: "common-tv3dlogo-diffuse" }, normalTexture: { id: "common-tv3dlogo-normal" } },
        tags: ["archive", "faithful-geometry", "adapted-camera-and-light", "source:common/room.tvm"] },
      { id: "common-room-light", type: "point-light", intensity: 80, distance: 35, marker: false,
        transform: { position: [0, 18, 0] }, material: { color: "#ffd8a8" }, tags: ["adapted-lighting"] },
    ] };
}

export function buildNotesBlock(): AgentWorldDefinition {
  const entities: AgentWorldEntityDefinition[] = [fill()];
  for (let index = 0; index < 50; index++) entities.push({
    id: `note-plate-${index}`, type: "box", label: `Plaque ${index + 1}`, visible: false,
    geometry: { width: 0.5, height: 0.5, depth: 0.1 },
    transform: { position: [Math.floor(index / 10) * 0.75, 0.5, -(index % 10) * 0.2] },
    material: { color: "#cccccc", roughness: 0.7, texture: { id: "notes-marble10" } },
    tags: ["archive", "note-plate", "source:BlocNote.cpp"],
  });
  for (let index = 0; index <= 50; index++) entities.push({
    id: `note-add-${index}`, type: "box", label: index === 50 ? "Bloc complet · 50 plaques" : "Ajouter une plaque",
    visible: index === 0, geometry: { width: 0.3, height: 0.3, depth: 0.3 }, transform: { position: [0, -2.5, 0] },
    material: { color: index === 50 ? "#7e9d85" : "#cccccc", roughness: 0.7, texture: { id: "notes-marble10" } },
    interactions: index === 50 ? [] : [{ id: "add-note", type: "toggle-visibility", targetIds: [`note-plate-${index}`, `note-add-${index}`, `note-add-${index + 1}`] }],
    tags: ["archive", "note-add", "adapted-sequential-control"],
  });
  return { schema: "graphysx.agent-world/v2", id: "archive-notes", label: "CubX notes · spatial plates, no text editor",
    environment: { ...environment, background: "#172a3a" }, entities };
}

export function buildArchiveWorld(id: ArchiveWorldId): AgentWorldDefinition {
  if (id === "maison") return buildMaisonExplorer();
  if (id === "arena") return buildUnityArena();
  if (id === "common-room") return buildCommonRoom();
  if (id === "cubz") return buildCubzTracks();
  if (id === "flightx") return buildFlightX();
  return buildNotesBlock();
}

export function maisonSourceView(view: MaisonView): { position: AgentWorldVector3; target: AgentWorldVector3 } {
  if (view === "kitchen") return { position: [-3.002289, 1.140502, -2.731321], target: [1.935196, 0.965262, -1.962851] };
  if (view === "massing") return { position: [0, 24, 34], target: [0, 3, 0] };
  const camera = houseRecord.objects.find((object) => object.type === "CAMERA")!.camera!;
  const position: AgentWorldVector3 = [camera.worldLocation[0], camera.worldLocation[2], -camera.worldLocation[1]];
  return { position, target: [position[0] + camera.worldForward[0] * 8, position[1] + camera.worldForward[2] * 8, position[2] - camera.worldForward[1] * 8] };
}
