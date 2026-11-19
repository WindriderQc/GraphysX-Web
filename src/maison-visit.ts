import { buildMaisonExplorer } from "./archive-worlds";
import type { AgentWorldDefinition, AgentWorldEntityDefinition, AgentWorldVector3 } from "./agent-world-runtime";

export type MaisonVisitView = "house" | "kitchen";
export type MaisonLight = "day" | "night";
export const MAISON_MODELS = ["maison-source-model", "cuisine-model"] as const;
export const MAISON_VIEWS = ["house", "kitchen", "massing"] as const;
export type MaisonStop = { title: string; position: AgentWorldVector3; target: AgentWorldVector3 };
export const MAISON_STOPS: Record<MaisonVisitView, readonly MaisonStop[]> = {
  house: [
    { title: "L’ensemble", position: [12, 9, 15], target: [-6.5, 1.7, 1.5] },
    { title: "Les volumes", position: [-17, 11, 13], target: [-2.8, 1.8, -.7] },
    { title: "Les passages", position: [-13, 9, -16], target: [-2.8, 1.8, -.7] },
  ],
  kitchen: [
    { title: "La pièce", position: [-3.002289, 1.36, -2.731321], target: [1.935196, 1.15, -2.8] },
    { title: "Les meubles", position: [-3.002289, 1.55, -3.6], target: [2.2, 1.1, -5.2] },
    { title: "Une autre perspective", position: [-3.002289, 1.7, -2], target: [2.2, 1.1, -4.3] },
  ],
};

const palette = (look: MaisonLight) => look === "night"
  ? { background: "#152337", ambient: .4, ambientColor: "#9db9dd", ibl: .15, ground: "#263b4b", key: 2, keyColor: "#97c9ff", keyPosition: [-8, 16, -12] as AgentWorldVector3, fill: 1.4, rear: .6, rearColor: "#e8cba7", lantern: 50 }
  : { background: "#d8ddd9", ambient: .22, ambientColor: "#dce8ef", ibl: .22, ground: "#d5d2c6", key: 3.4, keyColor: "#fff1d6", keyPosition: [8, 16, 12] as AgentWorldVector3, fill: .5, rear: 1.6, rearColor: "#b7d3e6", lantern: 0 };

/** Native model data/placement are retained. Stage, lighting and camera are current adapters. */
export function buildMaisonVisit(view: MaisonVisitView = "house", look: MaisonLight = "day"): AgentWorldDefinition {
  const document = structuredClone(buildMaisonExplorer());
  document.id = "archive-maison-visit"; document.label = "Maison & Cuisine · la visite retrouvée";
  document.environment = { ...document.environment, ground: { size: 70, color: "#d5d2c6", grid: false, gridColor: "#687b87", ...document.environment?.ground, visible: false } };
  for (const entity of document.entities) {
    if (MAISON_VIEWS.some(id => entity.id === "maison-" + id)) entity.visible = entity.id === "maison-" + view;
    if (MAISON_MODELS.some(id => entity.id === id)) { entity.castShadow = true; entity.receiveShadow = false; }
  }
  document.entities.push(
    { id: "maison-visit-stage", type: "box", label: "Sol de présentation actuel", geometry: { width: 70, height: .16, depth: 70 }, transform: { position: [0, -.18, 0] },
      material: { roughness: .88, metalness: .02 }, castShadow: false, receiveShadow: true, tags: ["adapted-presentation"] },
    { id: "maison-visit-key", type: "directional-light", label: "Lumière de visite", castShadow: true, tags: ["adapted-lighting"] },
    { id: "maison-visit-fill", type: "directional-light", label: "Lumière de lecture", transform: { position: [12, 9, 15] }, material: { color: "#b9d6ee" }, castShadow: false, tags: ["adapted-lighting"] },
    { id: "maison-visit-rear", type: "directional-light", label: "Lumière des façades arrière", transform: { position: [-14, 12, -18] }, castShadow: false, tags: ["adapted-lighting"] },
    { id: "maison-visit-lantern", type: "point-light", label: "Ambiance du soir", distance: 14, marker: false, transform: { position: [-3, 2.3, -.5] }, material: { color: "#ffb770" }, tags: ["adapted-lighting"] },
  );
  const commands = maisonLookCommands(document, look);
  for (const command of commands) {
    if (command.op === "set-environment") document.environment = command.environment;
    else { const entity = document.entities.find(item => item.id === command.id); if (entity) Object.assign(entity, command.patch); }
  }
  return document;
}

export const maisonViewCommands = (view: MaisonVisitView) => MAISON_VIEWS.map(id => ({
  op: "update" as const, id: "maison-" + id, patch: { visible: id === view },
}));

/** A deliberate lighting preset only touches its own stage/lights; authored objects survive. */
export function maisonLookCommands(document: AgentWorldDefinition, look: MaisonLight) {
  const p = palette(look);
  const lights: { id: string; patch: Partial<AgentWorldEntityDefinition> }[] = [
    { id: "archive-world-fill", patch: { intensity: p.ambient, material: { color: p.ambientColor } } },
    { id: "maison-visit-stage", patch: { material: { color: p.ground, roughness: .88, metalness: .02 } } },
    { id: "maison-visit-key", patch: { intensity: p.key, transform: { position: p.keyPosition }, material: { color: p.keyColor } } },
    { id: "maison-visit-fill", patch: { intensity: p.fill } },
    { id: "maison-visit-rear", patch: { intensity: p.rear, material: { color: p.rearColor } } },
    { id: "maison-visit-lantern", patch: { intensity: p.lantern, visible: look === "night" } },
  ];
  return [
    { op: "set-environment" as const, environment: { ...document.environment, background: p.background,
      lighting: { source: "studio" as const, intensity: p.ibl, yawDegrees: 25, backgroundIntensity: 1, backgroundBlur: 0 } } },
    ...lights.map(({ id, patch }) => ({ op: "update" as const, id, patch })),
  ];
}

/** Keep native Phong surfaces; reduce default emission without replacing authored overrides. */
export function maisonMaterialCommands(document: AgentWorldDefinition, models: readonly { id: string; materialSlots?: readonly { id: string }[] | null }[]) {
  return MAISON_MODELS.flatMap(id => {
    const entity = document.entities.find(item => item.id === id), slots = models.find(model => model.id === id)?.materialSlots;
    if (!entity || !slots?.length) return [];
    const overrides = { ...entity.modelMaterialOverrides };
    for (const slot of slots) {
      const current = overrides[slot.id] ?? {};
      overrides[slot.id] = { ...current, emissive: current.emissive ?? "#000000", emissiveIntensity: current.emissiveIntensity ?? 0 };
    }
    return [{ op: "update" as const, id, patch: { modelMaterialOverrides: overrides } }];
  });
}
