import type { AgentWorldDefinition, AgentWorldEntityDefinition } from "./agent-world-runtime";
import { volcanoEntities } from "./ballsy-volcano-scene";

export const BALLSY_PLAYERS = [
  { id: "ballsy-p1", name: "J1", colour: "#22d9e5", spawn: [-4, 0.7, 8] as [number, number, number] },
  { id: "ballsy-p2", name: "J2", colour: "#ff7955", spawn: [-4, 0.7, 10] as [number, number, number] },
] as const;
export const BALLSY_CHECKPOINTS = ["ballsy-east", "ballsy-north", "ballsy-west"];

/** A miniature island circuit. All scenery uses the ordinary, editable v2 vocabulary. */
export function composeBallsyCourse(options: { volcano?: boolean } = {}): AgentWorldDefinition {
  const entities: AgentWorldEntityDefinition[] = [];
  const box = (id: string, position: [number, number, number], size: [number, number, number], color: string, solid = false): void => {
    entities.push({ id, type: "box", transform: { position }, geometry: { width: size[0], height: size[1], depth: size[2] },
      material: { color, roughness: 0.8 }, ...(solid ? { physics: { mode: "static", material: "wall" } as const } : {}), castShadow: solid, tags: ["ballsy"] });
  };
  // The plinth remains the continuous physical floor. Decorative geology never obstructs play.
  box("ballsy-water", [0, -2.2, 0], [120, 0.1, 120], "#153c49");
  box("ballsy-shore", [0, -1.55, 0], [38.8, 0.7, 30.8], "#345b60");
  box("ballsy-plinth", [0, -0.7, 0], [36, 1.4, 28], "#28343e", true);
  box("ballsy-road", [0, 0.015, 0], [33.5, 0.03, 25.5], "#59636a");
  // The east half belongs to the shovel's deformable earth, not an invisible solid box.
  box("ballsy-island", options.volcano ? [-3, 0.35, 0] : [0, 0.35, 0], options.volcano ? [14, 0.7, 10] : [20, 0.7, 10], options.volcano ? "#675246" : "#527e68", true);
  for (const side of [-1, 1]) {
    box(`ballsy-wall-x${side}`, [side * 17, 0.65, 0], [0.65, 1.3, 26.5], "#283f49", true);
    box(`ballsy-wall-z${side}`, [0, 0.65, side * 13], [34.5, 1.3, 0.65], "#283f49", true);
    box(`ballsy-rail-x${side}`, [side * 17, 1.32, 0], [0.7, 0.08, 26.5], "#77b6ad");
    box(`ballsy-rail-z${side}`, [0, 1.32, side * 13], [34.5, 0.08, 0.7], "#77b6ad");
    // A complete perimeter and an inner kerb make the racing surface legible at a glance.
    for (let n = -15; n <= 15; n++) {
      box(`ballsy-curb-z-${side}-${n}`, [n * 1.05, 0.055, side * 12.38], [1.03, 0.08, 0.5], n % 2 === 0 ? "#f3dcb4" : "#d66b4c");
      if (Math.abs(n) <= 9 && (!options.volcano || n * 1.05 < 3.5))
        box(`ballsy-inner-z-${side}-${n}`, [n * 1.05, 0.07, side * 5.3], [1.03, 0.1, 0.42], n % 2 === 0 ? "#f3dcb4" : "#d66b4c");
    }
    for (let n = -11; n <= 11; n++) {
      box(`ballsy-curb-x-${side}-${n}`, [side * 16.38, 0.055, n * 1.05], [0.5, 0.08, 1.03], n % 2 === 0 ? "#f3dcb4" : "#d66b4c");
      if (Math.abs(n) <= 4 && (side < 0 || !options.volcano))
        box(`ballsy-inner-x-${side}-${n}`, [side * 10.3, 0.07, n * 1.05], [0.42, 0.1, 1.03], n % 2 === 0 ? "#f3dcb4" : "#d66b4c");
    }
    for (let n = -6; n <= 6; n++) {
      if (n === 0) continue;
      box(`ballsy-lane-z-${side}-${n}`, [n * 2.3, 0.055, side * 9], [0.9, 0.025, 0.1], "#a8b7b2");
    }
    for (let n = -3; n <= 3; n++) {
      if (n === 0 || (side > 0 && options.volcano)) continue;
      box(`ballsy-lane-x-${side}-${n}`, [side * 13.5, 0.055, n * 2.3], [0.1, 0.025, 0.9], "#a8b7b2");
    }
  }
  // Low-poly basalt outcrops frame the circuit without hiding balls or adding colliders.
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2;
    const x = Math.cos(a) * 19.3, z = Math.sin(a) * 15.8;
    if (Math.abs(x) < 17.8 && Math.abs(z) < 14.5) continue;
    entities.push({ id: `ballsy-shore-rock-${i}`, type: "icosahedron", geometry: { radius: 1.1 },
      transform: { position: [x, -1.1, z], rotationDegrees: [i * 17, i * 31, 12], scale: [1.1 + i % 3 * 0.25, 0.7, 0.9] },
      material: { color: i % 2 ? "#3c4b53" : "#4a5c61", roughness: 1 }, tags: ["ballsy", "scenery"] });
  }
  if (!options.volcano) {
    entities.push({ id: "ballsy-hill", type: "sphere", transform: { position: [-2, 0.6, 0], scale: [4.5, 1.1, 3] },
      geometry: { radius: 1 }, material: { color: "#759a70", roughness: 0.9 }, tags: ["ballsy"] });
    for (const [index, x, z] of [[0, -6, -1], [1, 5, 1], [2, 7, -2]]) {
      entities.push({ id: `ballsy-tree-${index}`, type: "cone", transform: { position: [x, 1.9, z] },
        geometry: { radius: 1, height: 3 }, material: { color: "#3c7065", roughness: 0.9 }, tags: ["ballsy"] });
    }
  }
  const gates = [
    { id: BALLSY_CHECKPOINTS[0], position: [13.5, 1, 0], size: [6.3, 2, 1.2], color: "#e9b965" },
    { id: BALLSY_CHECKPOINTS[1], position: [0, 1, -9], size: [1.2, 2, 6.3], color: "#e9b965" },
    { id: BALLSY_CHECKPOINTS[2], position: [-13.5, 1, 0], size: [6.3, 2, 1.2], color: "#e9b965" },
    { id: "ballsy-finish", position: [0, 1, 9], size: [1.2, 2, 6.3], color: "#83e6db" },
  ];
  for (const [index, gate] of gates.entries()) {
    entities.push({ id: gate.id, type: "box", transform: { position: gate.position as [number, number, number] },
      geometry: { width: gate.size[0], height: gate.size[1], depth: gate.size[2] },
      material: { color: gate.color, opacity: 0 }, physics: { mode: "trigger" }, castShadow: false, tags: ["ballsy", "gate"] });
    const acrossX = gate.size[0] > gate.size[2];
    if (index < 3) box(`${gate.id}-stripe`, [gate.position[0], 0.065, gate.position[2]], acrossX ? [5.7, 0.03, 0.16] : [0.16, 0.03, 5.7], gate.color);
    for (const side of [-1, 1]) {
      const x = gate.position[0] + (acrossX ? side * 3.1 : 0);
      const z = gate.position[2] + (acrossX ? 0 : side * 3.1);
      // Markers are visual, not new barriers at a checkpoint.
      box(`${gate.id}-post-${side}`, [x, 0.85, z], [0.22, 1.7, 0.22], "#263c46");
      box(`${gate.id}-beacon-${side}`, [x, 1.62, z], [0.36, 0.3, 0.36], gate.color);
      // One, two, three bars visibly number the gates without relying on floating text.
      for (let mark = 0; mark < (index < 3 ? index + 1 : 2); mark++)
        box(`${gate.id}-flag-${side}-${mark}`, [x, 1.15 - mark * 0.25, z], acrossX ? [0.5, 0.12, 0.24] : [0.24, 0.12, 0.5], gate.color);
    }
  }
  for (let i = 0; i < 10; i++) for (let j = 0; j < 3; j++) {
    box(`ballsy-checker-${i}-${j}`, [-0.6 + j * 0.6, 0.06, 6.2 + i * 0.6], [0.6, 0.06, 0.6], (i + j) % 2 ? "#fff2ce" : "#1f323c");
  }
  for (const [index, x, z, angle] of [[0, 7, 9, 0], [1, 14.8, -5, 90], [2, -6, -9, 180], [3, -14, 4, -90]]) {
    entities.push({ id: `ballsy-direction-${index}`, type: "mesh",
      mesh: { positions: [-0.9, 0, -0.2, 0.1, 0, -0.2, 0.1, 0, 0.2, -0.9, 0, 0.2, 0, 0, -0.65, 1, 0, 0, 0, 0, 0.65], indices: [0, 2, 1, 0, 3, 2, 4, 6, 5] },
      transform: { position: [x, 0.12, z], rotationDegrees: [0, angle, 0] },
      material: { color: "#f7dc9a", roughness: 1 }, castShadow: false, tags: ["ballsy", "direction"] });
  }
  // Boost pads are decals only; the race controller owns bounded acceleration/cooldowns.
  for (const [index, x, z, angle] of [[0, 3, 8.8, 0], [1, -4, -8.8, 180], [2, -13.5, -2, -90]]) {
    entities.push({ id: `ballsy-boost-${index}`, type: "group", transform: { position: [x, 0.085, z], rotationDegrees: [0, angle, 0] }, tags: ["ballsy", "boost"] });
    entities.push({ id: `ballsy-boost-bed-${index}`, parentId: `ballsy-boost-${index}`, type: "box", geometry: { width: 2.4, height: 0.025, depth: 2.5 }, material: { color: "#205f69", roughness: 1 }, castShadow: false, tags: ["ballsy", "boost"] });
    for (let j = 0; j < 3; j++) entities.push({ id: `ballsy-boost-chevron-${index}-${j}`, parentId: `ballsy-boost-${index}`, type: "mesh",
      transform: { position: [-0.7 + j * 0.65, 0.025, 0] },
      mesh: { positions: [-0.28, 0, -0.8, -0.06, 0, -0.8, 0.38, 0, 0, -0.06, 0, 0.8, -0.28, 0, 0.8, 0.12, 0, 0], indices: [0, 5, 1, 1, 5, 2, 5, 3, 2, 5, 4, 3] },
      material: { color: "#8df7e3", emissive: "#46c4ba", emissiveIntensity: 0.3, roughness: 1 }, castShadow: false, tags: ["ballsy", "boost"] });
  }
  for (const player of BALLSY_PLAYERS) {
    entities.push({ id: player.id, type: "sphere", label: player.name, transform: { position: [...player.spawn] }, geometry: { radius: 0.65, radialSegments: 32 },
      material: { color: player.colour, emissive: player.colour, emissiveIntensity: 0.13, roughness: 0.22, metalness: 0.2 }, physics: { mode: "dynamic", material: "ball", mass: 1.7 },
      steering: { headingDegrees: 90, force: 28, speedCap: 8, turnRateDegrees: 240 }, tags: ["ballsy", "player"] });
  }
  entities.push(
    { id: "ballsy-sun", type: "directional-light", transform: { position: [-15, 24, 14] }, intensity: 2.2, material: { color: "#ffe4c0" }, castShadow: true },
    { id: "ballsy-fill", type: "ambient-light", intensity: 0.65, material: { color: "#b4dbea" } },
  );
  if (options.volcano) entities.push(...volcanoEntities());
  return {
    schema: "graphysx.agent-world/v2", id: options.volcano ? "ballsy-volcano" : "ballsy-handling-course", label: options.volcano ? "Ballsy — Le volcan" : "Ballsy — La piste à deux",
    environment: { background: "#153c49", sky: null, ground: { visible: false, size: 60, color: "#153c49", grid: false, gridColor: "#345b60" }, physics: { gravity: [0, -9.81, 0] },
      envelope: { fogNear: 100, fogFar: 200, cameraFar: 250 } },
    entities,
    rules: { schema: "graphysx.agent-rules/v1", subjectId: BALLSY_PLAYERS[0].id,
      spawn: { entityId: BALLSY_PLAYERS[0].id, position: [...BALLSY_PLAYERS[0].spawn] },
      subjects: BALLSY_PLAYERS.map((player) => ({ id: player.id, label: player.name, spawn: { position: [...player.spawn] } })),
      checkpoints: BALLSY_CHECKPOINTS.map((triggerId) => ({ triggerId })), finish: { triggerId: "ballsy-finish" }, laps: 2 },
  };
}
