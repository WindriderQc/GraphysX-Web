// The Clawblox Mesa island, re-expressed as a GraphysX agent-world/v2 document.
//
// Geometry, colours and pickup metadata come from a real `GET /observe` of
// clawblox/worlds/mesa-island (fixtures/mesa-island-observe.json). Clawblox studs are used
// as GraphysX units one-to-one so agent coordinates stay identical across both worlds.

import type { AgentWorldDefinition, AgentWorldEntityDefinition } from "../../src/agent-world-runtime";

export type Vec3 = [number, number, number];

/** Clawblox attributes that agents read from `world.entities[].attributes`. */
export type MesaAttributes = Record<string, string | number | boolean>;

/** Per-entity facts the world service needs and the v2 document has no field for. */
export interface MesaEntityMeta {
  /** Clawblox `name`, kept so agent prompts and memories transfer unchanged. */
  name: string;
  /** Clawblox `shape` (Block, Ring, Cylinder). */
  shape: string;
  material: string;
  color: Vec3;
  size: Vec3;
  attributes?: MesaAttributes;
  transparency?: number;
  /** Visual only: no rigid body (the ocean). */
  decorative?: boolean;
}

const GROUND: Vec3 = [0.333, 0.937, 0.769];
const MESA: Vec3 = [0.784, 0.627, 0.392];
const WALL: Vec3 = [0.6, 0.6, 0.6];
const SLATE: Vec3 = [0.58, 0.53, 0.49];

type StaticBox = { name: string; position: Vec3; size: Vec3; color: Vec3; role?: string; material?: string };

const STATIC_BOXES: StaticBox[] = [
  { name: "GroundCenter", position: [-2, -5, 0], size: [96, 10, 100], color: GROUND, role: "Ground", material: "SmoothPlastic" },
  { name: "GroundN", position: [10, -5, 56], size: [42, 10, 14], color: GROUND, role: "Ground", material: "SmoothPlastic" },
  { name: "GroundS", position: [-12, -5, -55], size: [36, 10, 14], color: GROUND, role: "Ground", material: "SmoothPlastic" },
  { name: "GroundW", position: [-56, -5, -3], size: [14, 10, 40], color: GROUND, role: "Ground", material: "SmoothPlastic" },
  { name: "GroundE", position: [48, -5, 5], size: [10, 10, 58], color: GROUND, role: "Ground", material: "SmoothPlastic" },
  { name: "BoundaryNorth", position: [0, 40, 83], size: [160, 80, 6], color: WALL },
  { name: "BoundarySouth", position: [0, 40, -83], size: [160, 80, 6], color: WALL },
  { name: "BoundaryEast", position: [83, 40, 0], size: [6, 80, 160], color: WALL },
  { name: "BoundaryWest", position: [-83, 40, 0], size: [6, 80, 160], color: WALL },
  { name: "LowStep", position: [8, 1, 18], size: [8, 2, 10], color: MESA, role: "Mesa" },
  { name: "LargeMesa", position: [20, 2, 20], size: [20, 4, 16], color: MESA, role: "Mesa" },
  { name: "SmallPlateau", position: [-30, 1, 28], size: [10, 2, 8], color: MESA, role: "Mesa" },
  { name: "SteppingStone", position: [-18, 1.25, -12], size: [8, 2.5, 8], color: MESA, role: "Mesa" },
  { name: "Ridge", position: [35, 1.5, -10], size: [6, 3, 25], color: MESA, role: "Mesa" },
  { name: "TallMesa", position: [-25, 3, -20], size: [12, 6, 10], color: MESA, role: "Mesa" },
  { name: "HighShelf", position: [25, 3.5, 28], size: [10, 7, 8], color: MESA, role: "Mesa" },
  { name: "Peak", position: [28, 5.5, 32], size: [5, 11, 5], color: MESA, role: "Mesa" },
  { name: "TowerBase", position: [-28, 3.5, -26], size: [8, 7, 8], color: MESA, role: "Mesa" },
  { name: "Summit", position: [-28, 5, -30], size: [6, 10, 6], color: MESA, role: "Mesa" },
  { name: "Spire", position: [-30, 10, -33], size: [4, 20, 4], color: MESA, role: "Mesa" },
];

/** Clawblox drops its twelve blocks as a loose pile; these are the pile's spawn points. */
const BLOCK_SPAWNS: Vec3[] = [
  [14.37, 5.09, -1.92], [15.15, 5.53, -1.24], [15.98, 6.01, -1.83], [14.78, 6.46, -0.9],
  [15.76, 6.83, -1.2], [14.88, 7.33, -1.81], [14.54, 7.69, -0.89], [15.6, 8.25, -1.5],
  [15.2, 8.34, -0.52], [15.32, 9.15, -1.3], [14.82, 10.13, -1.98], [15.4, 10.06, -1.0],
];

export const BLOCK_SIZE = 0.75;

// Clawblox parts use Roblox-like surfaces (Slate friction 0.4, Plastic 0.3) and density x
// volume for mass. GraphysX's "default" preset (friction 0.18) lets a nudged block slide
// ten studs, so the island states its surfaces explicitly.
const SLATE_SURFACE = { friction: 0.4, restitution: 0.2 } as const;

function hex([r, g, b]: Vec3): string {
  const part = (value: number) => Math.round(value * 255).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

function pickupAttributes(color: string, kind: string): MesaAttributes {
  return { RenderRole: kind, ItemColorName: color, IsPickupObject: true, IsCarryable: true, CarryKind: kind };
}

export interface MesaIsland {
  document: AgentWorldDefinition;
  meta: Map<string, MesaEntityMeta>;
}

export function buildMesaIsland(): MesaIsland {
  const entities: AgentWorldEntityDefinition[] = [];
  const meta = new Map<string, MesaEntityMeta>();
  const add = (entity: AgentWorldEntityDefinition, info: MesaEntityMeta) => {
    entities.push(entity);
    if (!entity.id) throw new Error("Island entities need ids");
    meta.set(entity.id, info);
  };

  add(
    { id: "ocean", label: "Ocean", type: "box", transform: { position: [0, -0.73, 0], scale: [600, 0.45, 600] }, material: { color: "#3480a8", opacity: 0.82 } },
    { name: "Ocean", shape: "Block", material: "Glass", color: [0.204, 0.502, 0.659], size: [600, 0.45, 600], transparency: 0.18, attributes: { RenderRole: "Ocean" }, decorative: true },
  );
  for (const box of STATIC_BOXES) {
    add(
      { id: box.name.toLowerCase(), label: box.name, type: "box", transform: { position: box.position, scale: box.size }, material: { color: hex(box.color) }, physics: { mode: "static", friction: 0.3, restitution: 0.2 } },
      { name: box.name, shape: "Block", material: box.material ?? "Plastic", color: box.color, size: box.size, ...(box.role ? { attributes: { RenderRole: box.role } } : {}) },
    );
  }
  BLOCK_SPAWNS.forEach((position, index) => {
    const name = `Block_${index + 1}`;
    add(
      { id: name.toLowerCase(), label: name, type: "box", transform: { position, scale: [BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE] }, material: { color: hex(SLATE) }, physics: { mode: "dynamic", mass: 1.14, ...SLATE_SURFACE }, tags: ["pickup"] },
      { name, shape: "Block", material: "Slate", color: SLATE, size: [BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE], attributes: pickupAttributes("Slate", "PickupObject") },
    );
  });
  add(
    { id: "rock_1", label: "Rock_1", type: "box", transform: { position: [-31.4, 3.05, 26.9], scale: [3.2, 2.1, 2.8] }, material: { color: "#34312c" }, physics: { mode: "dynamic", mass: 50.6, ...SLATE_SURFACE }, tags: ["pickup"] },
    { name: "Rock_1", shape: "Block", material: "Slate", color: [0.204, 0.192, 0.173], size: [3.2, 2.1, 2.8], attributes: pickupAttributes("Slate", "Rock") },
  );
  // A torus gets a flat box collider (diameter x tube, thin along local Y) from the runtime,
  // matching the Clawblox ring's 3.6 x 0.56 x 3.6 part. Whether the rendered torus lies flat
  // with it is a visual check for the viewer phase (the Three torus is thin along Z).
  add(
    { id: "ring_1", label: "Ring_1", type: "torus", geometry: { radius: 1.52, tube: 0.28, radialSegments: 32 }, transform: { position: [40, 0.28, -42] }, material: { color: "#e8bf4a" }, physics: { mode: "dynamic", mass: 5.1, friction: 0.3, restitution: 0.2 }, tags: ["pickup"] },
    { name: "Ring_1", shape: "Ring", material: "Plastic", color: [0.91, 0.75, 0.29], size: [3.6, 0.56, 3.6], attributes: pickupAttributes("Yellow", "Ring") },
  );

  const document: AgentWorldDefinition = {
    schema: "graphysx.agent-world/v2",
    id: "mesa-island",
    label: "Mesa island (GraphysX world service spike)",
    environment: {
      background: "#9fd3ec",
      ground: { visible: false, size: 0, color: "#000000", grid: false, gridColor: "#000000" },
      // Clawblox's world gravity. Characters use their own, heavier gravity (see character.ts).
      physics: { gravity: [0, -30, 0] },
    },
    entities: [
      { id: "ambient", type: "ambient-light", intensity: 0.8 },
      { id: "sun", type: "directional-light", intensity: 2.4, transform: { position: [-40, 80, 30] }, castShadow: true },
      ...entities,
    ],
  };
  return { document, meta };
}
