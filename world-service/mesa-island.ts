// The Clawblox Mesa island as a GraphysX agent-world/v2 document.
//
// Geometry, colours, physical properties and pickup metadata follow
// clawblox/worlds/mesa-island/main.lua and a real `GET /observe` of it (test fixture).
// Clawblox studs are GraphysX units one to one, so agent coordinates, prompts and memories
// carry over unchanged.

import type { AgentWorldDefinition, AgentWorldEntityDefinition } from "../src/agent-world-runtime";

export type Vec3 = [number, number, number];

/** Clawblox attributes agents read from `world.entities[].attributes`. */
export type MesaAttributes = Record<string, string | number | boolean>;

/** What the observation needs about an entity that the v2 document has no field for. */
export interface MesaEntityMeta {
  /** Clawblox `name`: kept so agent prompts and memories transfer unchanged. */
  name: string;
  shape: string;
  material: string;
  color: Vec3;
  size: Vec3;
  mass: number;
  attributes?: MesaAttributes;
  transparency?: number;
  /** No rigid body (the ocean). */
  decorative?: boolean;
  static?: boolean;
}

export const BLOCK_SIZE = 0.75;
export const ROCK_ID = "rock_1";
export const PLAYER_SPAWN: Vec3 = [0, 5, 0];

const GROUND: Vec3 = [0.333, 0.937, 0.769];
const MESA: Vec3 = [0.784, 0.627, 0.392];
const WALL: Vec3 = [0.6, 0.6, 0.6];
export const SLATE: Vec3 = [0.58, 0.533, 0.486];

/**
 * Mesa's CustomPhysicalProperties. GraphysX clamps friction to [0, 1], so terrain's 1.4 becomes
 * 1; mass is Clawblox density x part volume.
 */
const TERRAIN_SURFACE = { friction: 1, restitution: 0 } as const;
export const BLOCK_SURFACE = { friction: 0.9, restitution: 0.03 } as const;
export const BLOCK_MASS = BLOCK_SIZE ** 3 * 0.7;
const ROCK_SIZE: Vec3 = [3.2, 2.1, 2.8];
const ROCK_MASS = ROCK_SIZE[0] * ROCK_SIZE[1] * ROCK_SIZE[2] * 8;
const RING_SIZE: Vec3 = [3.6, 0.56, 3.6];
const RING_MASS = RING_SIZE[0] * RING_SIZE[1] * RING_SIZE[2] * 0.45;

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

export function hex([r, g, b]: Vec3): string {
  const part = (value: number) => Math.round(value * 255).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

export function pickupAttributes(color: string, kind: string): MesaAttributes {
  return { RenderRole: kind, ItemColorName: color, IsPickupObject: true, IsCarryable: true, CarryKind: kind };
}

/** A loose slate block (the twelve pile blocks and every rock-impact cube). */
export function blockEntity(id: string, name: string, position: Vec3, velocity?: Vec3, spin?: Vec3): AgentWorldEntityDefinition {
  return {
    id, label: name, type: "box",
    transform: { position, scale: [BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE] },
    material: { color: hex(SLATE) },
    physics: {
      mode: "dynamic", mass: BLOCK_MASS, ...BLOCK_SURFACE,
      ...(velocity ? { linearVelocity: velocity } : {}),
      ...(spin ? { angularVelocity: spin } : {}),
    },
    tags: ["pickup"],
  };
}

export function blockMeta(name: string): MesaEntityMeta {
  return { name, shape: "Block", material: "Slate", color: SLATE, size: [BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE], mass: BLOCK_MASS, attributes: pickupAttributes("Slate", "PickupObject") };
}

export interface MesaIsland {
  document: AgentWorldDefinition;
  meta: Map<string, MesaEntityMeta>;
}

export function buildMesaIsland(): MesaIsland {
  const entities: AgentWorldEntityDefinition[] = [];
  const meta = new Map<string, MesaEntityMeta>();
  const add = (entity: AgentWorldEntityDefinition, info: MesaEntityMeta) => {
    if (!entity.id) throw new Error("Island entities need ids");
    entities.push(entity);
    meta.set(entity.id, info);
  };

  add(
    { id: "ocean", label: "Ocean", type: "box", transform: { position: [0, -0.725, 0], scale: [600, 0.45, 600] }, material: { color: "#3480a8", opacity: 0.82 } },
    { name: "Ocean", shape: "Block", material: "Glass", color: [0.204, 0.502, 0.659], size: [600, 0.45, 600], mass: 0, transparency: 0.18, attributes: { RenderRole: "Ocean" }, decorative: true },
  );
  for (const box of STATIC_BOXES) {
    add(
      { id: box.name.toLowerCase(), label: box.name, type: "box", transform: { position: box.position, scale: box.size }, material: { color: hex(box.color) }, physics: { mode: "static", ...TERRAIN_SURFACE } },
      { name: box.name, shape: "Block", material: box.material ?? "Plastic", color: box.color, size: box.size, mass: 0, static: true, ...(box.role ? { attributes: { RenderRole: box.role } } : {}) },
    );
  }
  BLOCK_SPAWNS.forEach((position, index) => {
    const name = `Block_${index + 1}`;
    add(blockEntity(name.toLowerCase(), name, position), blockMeta(name));
  });
  add(
    { id: ROCK_ID, label: "Rock_1", type: "box", transform: { position: [-31.4, 3.05, 26.9], scale: ROCK_SIZE }, material: { color: "#34312c" }, physics: { mode: "dynamic", mass: ROCK_MASS, friction: 0.9, restitution: 0 }, tags: ["pickup"] },
    { name: "Rock_1", shape: "Block", material: "Slate", color: [0.204, 0.192, 0.173], size: ROCK_SIZE, mass: ROCK_MASS, attributes: pickupAttributes("Slate", "Rock") },
  );
  // A torus gets a flat box collider (diameter x tube, thin along local Y) from the runtime,
  // matching the Clawblox ring part. Whether the rendered torus lies flat with it is a check
  // for the viewer (the Three torus is thin along Z).
  add(
    { id: "ring_1", label: "Ring_1", type: "torus", geometry: { radius: 1.52, tube: 0.28, radialSegments: 32 }, transform: { position: [40, 0.28, -42], rotationDegrees: [0, 32, 0] }, material: { color: "#e8c04a" }, physics: { mode: "dynamic", mass: RING_MASS, friction: 0.35, restitution: 0.18 }, tags: ["pickup"] },
    { name: "Ring_1", shape: "Ring", material: "Plastic", color: [0.91, 0.753, 0.29], size: RING_SIZE, mass: RING_MASS, attributes: pickupAttributes("Yellow", "Ring") },
  );

  const document: AgentWorldDefinition = {
    schema: "graphysx.agent-world/v2",
    id: "mesa-island",
    label: "Mesa island",
    environment: {
      background: "#9fd3ec",
      ground: { visible: false, size: 0, color: "#000000", grid: false, gridColor: "#000000" },
      // Clawblox world gravity. Characters fall with their own, heavier gravity.
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
