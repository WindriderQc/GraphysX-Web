import { ev3FirstDriveScene, EV3_FIRST_MISSION_FINISH_ID, EV3_FIRST_MISSION_MISS_TAG } from "./ev3-robotics-lab";
import type { AgentWorldDefinition, AgentWorldEntityDefinition } from "./agent-world-runtime";

export type KidxMission = {
  id: string; title: string; objective: string; hint: string; skill: string; glyph: string;
  finish: [number, number]; checkpoints: [number, number][]; suggested: string[];
};

/** Original KidX exercises around Robot Trainer's controlled-movement learning objectives. */
export const KIDX_MISSIONS: readonly KidxMission[] = [
  { id: "first-drive", title: "Premier trajet", objective: "Rejoins la zone bleue avant la fin du temps.",
    hint: "Ajoute trois blocs Avancer, puis appuie sur Lancer.", skill: "Avancer en ligne droite", glyph: "↑",
    finish: [0, 10.5], checkpoints: [], suggested: ["forward", "forward", "forward"] },
  { id: "right-turn", title: "Un quart de tour", objective: "Tourne à droite, puis rejoins la zone bleue.",
    hint: "Commence par Droite. Ajoute ensuite des blocs Avancer.", skill: "Prévoir un virage", glyph: "↱",
    finish: [6.5, 17], checkpoints: [], suggested: ["right", "forward", "forward", "forward"] },
  { id: "left-turn", title: "À gauche toute", objective: "Rejoins la zone bleue située à ta gauche.",
    hint: "Essaie Gauche, puis trois blocs Avancer. Observe le sens du robot.", skill: "Comparer gauche et droite", glyph: "↰",
    finish: [-6.5, 17], checkpoints: [], suggested: ["left", "forward", "forward", "forward"] },
  { id: "delivery", title: "La livraison", objective: "Passe par le repère jaune, puis livre à droite, dans la zone bleue.",
    hint: "Avance jusqu’au jaune, tourne à droite, puis avance vers le bleu.", skill: "Enchaîner deux déplacements", glyph: "↗",
    finish: [5.6, 12.6], checkpoints: [[0, 12.6]], suggested: ["forward", "forward", "right", "forward", "forward"] },
  { id: "return-home", title: "Retour à la base", objective: "Atteins le repère jaune, fais demi-tour et reviens au bleu.",
    hint: "Deux blocs Gauche font presque un demi-tour. Prévois aussi le retour !", skill: "Construire un aller-retour", glyph: "↶",
    finish: [0, 17], checkpoints: [[0, 12.6]], suggested: ["forward", "forward", "left", "left", "forward", "forward"] },
];

export const KIDX_LESSON_SOURCE = "https://education.lego.com/en-us/lessons/ev3-robot-trainer/1-moves-and-turns/";

export function kidxMissionScene(mission: KidxMission): AgentWorldDefinition {
  const scene = ev3FirstDriveScene();
  scene.id = `graphysx-kidx-${mission.id}`;
  scene.label = `KidX · ${mission.title}`;
  if (mission.id === "first-drive") return scene;
  const entities = scene.entities;
  const finish = entities.find((item) => item.id === EV3_FIRST_MISSION_FINISH_ID)!;
  finish.transform = { position: [mission.finish[0], .3, mission.finish[1]] };
  for (const item of entities) {
    if (item.tags?.includes(EV3_FIRST_MISSION_MISS_TAG)) item.transform = {
      position: [item.id?.endsWith("left") ? -11 : 11, .3, 14],
    };
    // The old gate bricks belong to the straight course; the new courses use a flat landing zone.
    if (item.id?.startsWith("ev3-kit-finish-")) item.visible = false;
  }
  mission.checkpoints.forEach(([x, z], index) => {
    const id = `kidx-checkpoint-${index}`;
    entities.push({ id, label: `Repère ${index + 1}`, type: "box", transform: { position: [x, .3, z] },
      geometry: { width: 2.7, height: .22, depth: 1.5 }, material: { color: "#f4c247", opacity: 0 },
      physics: { mode: "trigger" }, tags: ["kidx", "checkpoint"] });
    entities.push({ id: `${id}-print`, label: "Repère jaune", type: "plane", transform: { position: [x, .025, z] },
      geometry: { width: 2.7, depth: 1.5 }, material: { color: "#f4c247", roughness: .95 }, receiveShadow: true });
  });
  scene.rules!.checkpoints = mission.checkpoints.map((_, index) => ({ triggerId: `kidx-checkpoint-${index}`, label: `Repère ${index + 1}` }));
  return scene;
}

export function kidxBuildScene(parts: AgentWorldEntityDefinition[]): AgentWorldDefinition {
  const base = ev3FirstDriveScene();
  const lights = base.entities.filter((entity) => entity.tags?.includes("lighting"));
  return { schema: "graphysx.agent-world/v2", id: "kidx-build-table", label: "KidX · Construction 3D",
    // Keep the entire orbit clear, including the underside of the assembly.
    environment: base.environment, entities: [...lights, ...parts],
  };
}
