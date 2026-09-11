import { ev3FirstDriveScene, EV3_FIRST_MISSION_FINISH_ID, EV3_FIRST_MISSION_MISS_TAG } from "./ev3-robotics-lab";
import type { AgentWorldDefinition, AgentWorldEntityDefinition } from "./agent-world-runtime";
import type { KidxInstruction } from "./kidx-code";

export type KidxMission = {
  id: string; title: string; objective: string; hint: string; skill: string; glyph: string;
  finish: [number, number]; checkpoints: [number, number][]; suggested: string[];
  code?: KidxInstruction[];
  build?: string;
  challenge?: "cargo" | "sensor" | "ramp" | "slalom";
};

/** Original KidX exercises around Robot Trainer's controlled-movement learning objectives. */
export const KIDX_MISSIONS: readonly KidxMission[] = [
  { id: "first-drive", title: "Premier trajet", objective: "Rejoins la zone bleue avant la fin du temps.",
    hint: "Ajoute trois blocs Avancer, puis appuie sur Démarrer.", skill: "Avancer en ligne droite", glyph: "↑",
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
  { id: "reverse-parking", title: "Le garage en marche arrière", objective: "Recule jusqu’à la place bleue sans faire demi-tour.",
    hint: "Essaie deux blocs Reculer. Observe les roues et le sens du robot.", skill: "Maîtriser la marche arrière", glyph: "↓",
    finish: [0, 22], checkpoints: [], suggested: ["backward", "backward"] },
  { id: "cargo-push", title: "Le déménageur", objective: "Pousse la caisse jaune jusque dans la zone bleue.",
    hint: "La caisse doit arriver au bleu. Avance doucement et garde-la devant toi.", skill: "Pousser une charge", glyph: "▣", build: "track3r", challenge: "cargo",
    finish: [0, 7], checkpoints: [], suggested: ["forward", "forward", "forward", "forward"],
    code: [{ kind: "motors", left: 100, right: 100, seconds: 8 }] },
  { id: "sensor-retreat", title: "Je vois le mur !", objective: "Passe au jaune, détecte le mur et recule jusqu’au bleu.",
    hint: "Ouvre Blocs avancés et l’exemple de la mission. Le capteur décidera quand reculer.", skill: "Réagir à une distance", glyph: "◉", build: "track3r", challenge: "sensor",
    finish: [0, 20], checkpoints: [[0, 12]], suggested: [],
    code: [{ kind: "until", left: 65, right: 65, seconds: 15, condition: { sensor: "distance", operator: "lt", value: 5 } }, { kind: "motors", left: -100, right: -100, seconds: 6 }] },
  { id: "ramp-crossing", title: "La petite rampe", objective: "Monte la rampe et rejoins le plateau bleu.",
    hint: "Compare une puissance faible puis forte dans Blocs avancés. Le robot doit grimper.", skill: "Explorer les forces", glyph: "▰", build: "spike3r", challenge: "ramp",
    finish: [0, 8], checkpoints: [[0, 12]], suggested: ["forward", "forward", "forward", "forward"],
    code: [{ kind: "motors", left: 100, right: 100, seconds: 7 }] },
  { id: "color-detect", title: "Le détective des couleurs", objective: "Passe au jaune, détecte le bleu et reviens te garer.",
    hint: "Le bleu porte le numéro 2. Regarde la valeur changer sur l’écran EV3.", skill: "Programmer avec la couleur", glyph: "◈", challenge: "slalom",
    finish: [0, 20], checkpoints: [[0, 12]], suggested: [],
    code: [{ kind: "until", left: 70, right: 70, seconds: 12, condition: { sensor: "color", operator: "eq", value: 2 } }, { kind: "wait", seconds: .5 }, { kind: "motors", left: -100, right: -100, seconds: 6 }] },
  { id: "touch-and-back", title: "Un contact, puis demi-tour", objective: "Touche doucement le mur, puis recule jusqu’au garage bleu.",
    hint: "Le contact passe de 0 à 1. Le bloc Si choisit alors la marche arrière.", skill: "Tester une condition", glyph: "☝", challenge: "sensor", build: "spike3r",
    finish: [0, 20], checkpoints: [[0, 12]], suggested: [],
    code: [{ kind: "until", left: 80, right: 80, seconds: 15, condition: { sensor: "touch", operator: "eq", value: 1 } }, { kind: "if", condition: { sensor: "touch", operator: "eq", value: 1 }, body: [{ kind: "motors", left: -100, right: -100, seconds: 6 }], otherwise: [{ kind: "wait", seconds: 1 }] }] },
];

export const KIDX_LESSON_SOURCE = "https://education.lego.com/en-us/lessons/ev3-robot-trainer/1-moves-and-turns/";

export function kidxMissionScene(mission: KidxMission): AgentWorldDefinition {
  const scene = ev3FirstDriveScene();
  scene.id = `graphysx-kidx-${mission.id}`;
  scene.label = `KidX · ${mission.title}`;
  if (mission.id === "first-drive") {
    scene.entities.find(e => e.id === EV3_FIRST_MISSION_FINISH_ID)!.tags!.push("kidx-color", "kidx-color:2");
    return scene;
  }
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
  for (const marker of entities.filter(e => e.id?.endsWith("-print"))) marker.tags = ["kidx-color", "kidx-color:4"];
  finish.tags = [...(finish.tags ?? []), "kidx-color", "kidx-color:2"];
  if (mission.challenge) {
    scene.rules!.timer = { limitSeconds: 90 };
    entities.find(e => e.id === "ev3-drive-base")!.tags!.push("kidx-reset");
    const box = (id: string, position: [number, number, number], size: [number, number, number], color: string, dynamic = false): AgentWorldEntityDefinition => ({
      id, label: id === "kidx-cargo" ? "Caisse à livrer" : "Obstacle du parcours", type: "box", transform: { position },
      geometry: { width: size[0], height: size[1], depth: size[2] }, material: { color, roughness: .72 }, castShadow: true, receiveShadow: true,
      physics: { mode: dynamic ? "dynamic" : "static", mass: .45, friction: .38, restitution: .05 }, tags: ["kidx-sensed", ...(dynamic ? ["kidx-reset"] : [])],
    });
    if (mission.challenge === "cargo") {
      entities.push(box("kidx-cargo", [0, .72, 12], [2.2, 1.4, 1.6], "#efba3e", true));
      for (const x of [-.6, .6]) for (const z of [-.4, .4]) entities.push({ id: `kidx-cargo-stud-${x}-${z}`, label: "Tenon de la caisse", type: "cylinder", parentId: "kidx-cargo",
        transform: { position: [x, .76, z] }, geometry: { radius: .22, height: .14, radialSegments: 16 }, material: { color: "#efba3e", roughness: .4 }, castShadow: true });
      scene.rules!.subjectId = "kidx-cargo";
      scene.rules!.spawn = { entityId: "kidx-cargo", position: [0, .72, 12] };
    }
    if (mission.challenge === "sensor") {
      entities.push(box("kidx-wall", [0, 1, 6], [7, 2, .7], "#dd6750"));
      for (let i = 0; i < 6; i++) entities.push({ id: `kidx-wall-stud-${i}`, label: "Tenon du mur", type: "cylinder", parentId: "kidx-wall",
        transform: { position: [-2.75 + i * 1.1, 1.07, 0] }, geometry: { radius: .27, height: .14, radialSegments: 16 }, material: { color: "#dd6750", roughness: .45 }, castShadow: true });
    }
    if (mission.challenge === "ramp") {
      const ramp = box("kidx-ramp", [0, .1, 12], [7, .32, 6], "#9aafb0");
      ramp.transform!.rotationDegrees = [5, 0, 0]; entities.push(ramp);
      entities.push(box("kidx-platform", [0, .2, 8], [7, .4, 3], "#68969d"));
    }
    if (mission.challenge === "slalom") {
      entities.push(box("kidx-side-left", [-4.8, .6, 11], [1.2, 1.2, 3], "#e25b48"), box("kidx-side-right", [4.8, .6, 8], [1.2, 1.2, 3], "#e25b48"));
      entities.push({ id: "kidx-blue-line", label: "Ligne bleue à détecter", type: "plane", transform: { position: [0, .04, 8] },
        geometry: { width: 7, depth: 1.4 }, material: { color: "#288dc5", roughness: 1 }, tags: ["kidx-color", "kidx-color:2"] });
    }
    // A visible ultrasonic pair sits on the front beam; readings use its forward origin.
    for (const side of [-1, 1]) entities.push({ id: `kidx-ultrasonic-${side}`, label: "Capteur ultrason simulé", type: "cylinder", parentId: "ev3-drive-base:heading",
      transform: { position: [side * .28, .4, -1.8], rotationDegrees: [90, 0, 0] }, geometry: { radius: .22, height: .2, radialSegments: 16 },
      material: { color: "#606b71", metalness: .4, roughness: .4 }, tags: ["kidx-sensor-housing"] });
    entities.push({ id: "kidx-sensor-ray", label: "Faisceau du capteur de distance", type: "box", parentId: "ev3-drive-base:heading",
      transform: { position: [0, .4, -4.95] }, geometry: { width: .035, height: .035, depth: 1 },
      material: { color: "#f6c448", emissive: "#d9a93f", emissiveIntensity: .4, opacity: .65 }, tags: ["kidx-sensor-ray"] });
  }
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
