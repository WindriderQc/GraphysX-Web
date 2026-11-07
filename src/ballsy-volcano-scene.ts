import { createEarth, earthMesh } from "./ballsy-earth";
import type { AgentWorldEntityDefinition, GraphysXAgentWorldApi } from "./agent-world-runtime";
import { VOLCANO_CROSSINGS, type VolcanoState } from "./ballsy-volcano";
import type { Object3D } from "three";
import { projectLiveLava } from "./ballsy-live-mesh";

const LAVA = { color: "#f58124", emissive: "#ee4b09", emissiveIntensity: 0.35, roughness: 0.6 };
export function volcanoEntities(): AgentWorldEntityDefinition[] {
  const entities: AgentWorldEntityDefinition[] = [];
  const positions: number[] = [], indices: number[] = [];
  for (let i = 0; i < 32; i++) {
    const angle = i / 32 * Math.PI * 2;
    positions.push(Math.cos(angle) * 4.6, 0.4, Math.sin(angle) * 4.6, Math.cos(angle) * 1.15, 4, Math.sin(angle) * 1.15);
    const a = i * 2, b = ((i + 1) % 32) * 2;
    indices.push(a, b + 1, b, a, a + 1, b + 1);
  }
  entities.push({ id: "volcano-mountain", type: "mesh", mesh: { positions, indices }, material: { color: "#333238", roughness: 0.98 }, tags: ["ballsy", "volcano"] },
    { id: "volcano-crater", type: "torus", geometry: { radius: 1.15, tube: 0.25 }, transform: { position: [0, 4.02, 0], rotationDegrees: [90, 0, 0] }, material: { color: "#4d4856", roughness: 1 }, tags: ["volcano"] },
    { id: "volcano-heart", type: "sphere", geometry: { radius: 1 }, transform: { position: [0, 3.93, 0], scale: [1.1, 0.12, 1.1] }, material: LAVA, tags: ["volcano"] });
  const segment = (id: string, a: [number, number, number], b: [number, number, number]): void => {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    entities.push({ id, type: "box", geometry: { width: Math.hypot(dx, dy, dz), height: 0.09, depth: 1 },
      transform: { position: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], rotationDegrees: [0, -Math.atan2(dz, dx) * 180 / Math.PI, Math.atan2(dy, Math.hypot(dx, dz)) * 180 / Math.PI] },
      material: LAVA, castShadow: false, tags: ["volcano", "lava"] });
  };
  segment("volcano-fall", [1.15, 4.03, 0], [4.5, 1.15, 0]);
  segment("volcano-trunk", [4.2, 0.84, 0], [6.4, 0.84, 0]);
  VOLCANO_CROSSINGS.forEach((z, i) => {
    segment(`volcano-stream-${i}-in`, [6.4, 0.84, 0], [9.9, 0.84, z]);
    segment(`volcano-stream-${i}-fall`, [9.9, 0.84, z], [10.4, 0.105, z]);
    segment(`volcano-stream-${i}-cross`, [10.4, 0.105, z], [14.2, 0.105, z]);
    entities.push({ id: `volcano-lake-${i}`, type: "sphere", geometry: { radius: 1 },
      transform: { position: [12.2, 0.12, z], scale: [2, 0.08, 0.01] }, visible: false,
      material: LAVA, castShadow: false, tags: ["volcano", "lava"] });
  });
  segment("volcano-diversion-fall", [-1.15, 4.03, 0], [-4.2, 0.84, 1.35]);
  segment("volcano-diversion", [-4.2, 0.84, 1.35], [-6.2, 0.84, 2]);
  entities.push({ id: "volcano-basin", type: "torus", geometry: { radius: 1.45, tube: 0.2 }, transform: { position: [5.5, 0.15, 6], rotationDegrees: [90, 0, 0] }, material: { color: "#655c63", roughness: 1 }, tags: ["volcano"] },
    { id: "volcano-basin-lava", type: "sphere", geometry: { radius: 1.3 }, transform: { position: [-6.2, 0.7, 2], scale: [1, 0.08, 1] }, material: LAVA, visible: false, tags: ["volcano", "lava"] },
    { id: "volcano-dry-lane", type: "box", geometry: { width: 1.5, height: 0.045, depth: 12 }, transform: { position: [15.3, 0.05, 0] }, material: { color: "#d9d4ba", roughness: 1 }, castShadow: false, tags: ["volcano", "dry-lane"] });
  entities.push({ id: "volcano-shovel", type: "group", transform: { position: [8, 1.8, 1] }, tags: ["volcano", "giant-tool"] },
    { id: "volcano-shovel-handle", parentId: "volcano-shovel", type: "box", geometry: { width: 0.15, height: 1.3, depth: 0.15 }, material: { color: "#d6a96c", roughness: 0.8 }, tags: ["volcano"] },
    { id: "volcano-shovel-head", parentId: "volcano-shovel", type: "box", geometry: { width: 0.6, height: 0.15, depth: 0.7 }, transform: { position: [0, -0.65, 0.15], rotationDegrees: [20, 0, 0] }, material: { color: "#447b80", roughness: 0.4, metalness: 0.4 }, tags: ["volcano"] });
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2;
    if (Math.cos(a) * 5.3 > 3.2) continue;
    entities.push({ id: `volcano-rock-${i}`, type: "icosahedron", geometry: { radius: 0.7 },
      transform: { position: [Math.cos(a) * 5.3, 0.8, Math.sin(a) * 3.5], scale: [1, 0.7 + i % 3 * 0.3, 1] },
      material: { color: i % 2 ? "#9e7e72" : "#7f7179", roughness: 1 }, tags: ["volcano"] });
  }
  const earth = createEarth();
  entities.push({ id: "volcano-earth", type: "mesh", mesh: earthMesh(earth), physics: { mode: "static", collider: "trimesh", friction: 0.8, restitution: 0.1 }, material: { color: "#b9824f", roughness: 1 }, tags: ["volcano", "diggable"] },
    { id: "volcano-earth-lava", type: "mesh", mesh: earthMesh(earth, true), material: LAVA, castShadow: false, tags: ["volcano", "lava"] });
  return entities;
}

const projected = new WeakMap<GraphysXAgentWorldApi, number>();
export function projectVolcano(api: GraphysXAgentWorldApi, state: VolcanoState, visualObject?: (id: string) => Object3D | null | undefined): void {
  if (projected.get(api) !== state.earth.revision) api.update("volcano-earth", { mesh: earthMesh(state.earth) });
  const lava = earthMesh(state.earth, true);
  if (!visualObject || !projectLiveLava(visualObject("volcano-earth-lava"), lava)) api.update("volcano-earth-lava", { mesh: lava });
  // Historical decorative channel geometry is never the source of truth for the physical game.
  if (!projected.has(api)) for (const id of ["volcano-trunk", "volcano-shovel", "volcano-diversion", "volcano-diversion-fall", "volcano-basin-lava",
    ...[0, 1].flatMap(i => [`volcano-stream-${i}-in`, `volcano-stream-${i}-fall`, `volcano-stream-${i}-cross`, `volcano-lake-${i}`])]) if (api.query({ids:[id]}).length) api.update(id, { visible: false });
  projected.set(api, state.earth.revision);
}
