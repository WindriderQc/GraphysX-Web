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

type StaticBox = { name: string; position: Vec3; size: Vec3; color: Vec3; role?: string; material?: string; transparency?: number };

const STATIC_BOXES: StaticBox[] = [
  { name: "GroundCenter", position: [-2, -5, 0], size: [96, 10, 100], color: GROUND, role: "Ground", material: "SmoothPlastic" },
  { name: "GroundN", position: [10, -5, 56], size: [42, 10, 14], color: GROUND, role: "Ground", material: "SmoothPlastic" },
  { name: "GroundS", position: [-12, -5, -55], size: [36, 10, 14], color: GROUND, role: "Ground", material: "SmoothPlastic" },
  { name: "GroundW", position: [-56, -5, -3], size: [14, 10, 40], color: GROUND, role: "Ground", material: "SmoothPlastic" },
  { name: "GroundE", position: [48, -5, 5], size: [10, 10, 58], color: GROUND, role: "Ground", material: "SmoothPlastic" },
  { name: "BoundaryNorth", position: [0, 40, 83], size: [160, 80, 6], color: WALL, transparency: 1 },
  { name: "BoundarySouth", position: [0, 40, -83], size: [160, 80, 6], color: WALL, transparency: 1 },
  { name: "BoundaryEast", position: [83, 40, 0], size: [6, 80, 160], color: WALL, transparency: 1 },
  { name: "BoundaryWest", position: [-83, 40, 0], size: [6, 80, 160], color: WALL, transparency: 1 },
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
    material: { color: hex(SLATE), roughness: 0.78, metalness: 0.04 },
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

// ---- the look ------------------------------------------------------------------------------
//
// The island viewer dresses a Clawblox island (src/island-feed.ts): grass-textured ground, a
// grass cap on every mesa, a reflecting sea. A GraphysX world is drawn from its own document,
// so the same dressing lives here as decor entities without physics: bodies, observation and
// every rule stay exactly what they were. The ground's physics slabs are hidden and each one gets
// a grass slab; overlapping slabs share their top plane, so smaller ones sit a few centimetres
// lower (as in the viewer's Clawblox mapping) instead of flickering.

const GRASS_TEXTURE = "grass-sample";
/** Same constants as the viewer's Clawblox mapping (src/island-feed.ts). */
const GROUND_STEP = 0.04;
const WATER_HORIZON = 6;
const grassRepeat = (w: number, d: number): [number, number] => [Math.round(Math.max(1, w / 6) * 1000) / 1000, Math.round(Math.max(1, d / 6) * 1000) / 1000];

function groundGrass(box: StaticBox, rank: number): AgentWorldEntityDefinition {
  const [w, h, d] = box.size;
  return {
    id: `${box.name.toLowerCase()}-grass`, label: `${box.name} grass`, type: "box",
    geometry: { width: w, height: h, depth: d },
    transform: { position: [box.position[0], box.position[1] - GROUND_STEP * rank, box.position[2]] },
    material: { color: "#a9dc8c", roughness: 0.92, metalness: 0, texture: { id: GRASS_TEXTURE, repeat: grassRepeat(w, d) } },
    castShadow: false, receiveShadow: true, tags: ["decor", "land"],
  };
}

function mesaCap(box: StaticBox): AgentWorldEntityDefinition {
  const [w, h, d] = box.size;
  const cap = Math.min(0.35, h * 0.2);
  return {
    id: `${box.name.toLowerCase()}-grass`, label: `${box.name} grass`, type: "box",
    geometry: { width: w + 0.04, height: cap, depth: d + 0.04 },
    transform: { position: [box.position[0], box.position[1] + h / 2 - cap / 2 + 0.02, box.position[2]] },
    material: { color: "#9fd38c", roughness: 0.9, metalness: 0, texture: { id: GRASS_TEXTURE, repeat: grassRepeat(w, d) } },
    castShadow: false, receiveShadow: true, tags: ["decor"],
  };
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

  // The Clawblox ocean slab stays (hidden) so the observation keeps it; the sea is drawn by a
  // reflecting water surface on its top face, out to the horizon.
  add(
    { id: "ocean", label: "Ocean", type: "box", transform: { position: [0, -0.725, 0], scale: [600, 0.45, 600] }, material: { color: "#3480a8", opacity: 0.82 }, visible: false },
    { name: "Ocean", shape: "Block", material: "Glass", color: [0.204, 0.502, 0.659], size: [600, 0.45, 600], mass: 0, transparency: 0.18, attributes: { RenderRole: "Ocean" }, decorative: true },
  );
  const decor: AgentWorldEntityDefinition[] = [{
    id: "ocean-surface", label: "Sea", type: "water", transform: { position: [0, -0.5, 0] },
    water: { size: 600 * WATER_HORIZON, color: "#0e4f63", sunColor: "#fff3d6", rippleScale: 4, distortionScale: 0.9, flowSpeed: 0.45, tintStrength: 0.75, tintDistance: 180, reflection: true, reflectionResolution: 512 },
    tags: ["decor"],
  }];
  const groundRank = new Map(STATIC_BOXES.filter((box) => box.role === "Ground")
    .sort((a, b) => b.size[0] * b.size[2] - a.size[0] * a.size[2])
    .map((box, rank) => [box.name, rank]));
  for (const box of STATIC_BOXES) {
    const ground = box.role === "Ground";
    add(
      // Clawblox's boundary walls are fully transparent (Transparency = 1): they block, nobody sees
      // them. Ground slabs block too but are drawn by their grass slab.
      { id: box.name.toLowerCase(), label: box.name, type: "box", transform: { position: box.position, scale: box.size }, material: { color: hex(box.color), roughness: 0.9, metalness: 0 }, physics: { mode: "static", ...TERRAIN_SURFACE }, ...((box.transparency !== undefined && box.transparency >= 1) || ground ? { visible: false } : {}), ...(box.role === "Mesa" ? { castShadow: true, receiveShadow: true } : {}) },
      { name: box.name, shape: "Block", material: box.material ?? "Plastic", color: box.color, size: box.size, mass: 0, static: true, ...(box.transparency !== undefined ? { transparency: box.transparency } : {}), ...(box.role ? { attributes: { RenderRole: box.role } } : {}) },
    );
    if (ground) decor.push(groundGrass(box, groundRank.get(box.name)!));
    else if (box.role === "Mesa") decor.push(mesaCap(box));
  }
  BLOCK_SPAWNS.forEach((position, index) => {
    const name = `Block_${index + 1}`;
    add(blockEntity(name.toLowerCase(), name, position), blockMeta(name));
  });
  add(
    { id: ROCK_ID, label: "Rock_1", type: "box", transform: { position: [-31.4, 3.05, 26.9], scale: ROCK_SIZE }, material: { color: "#34312c", roughness: 0.96, metalness: 0.02 }, physics: { mode: "dynamic", mass: ROCK_MASS, friction: 0.9, restitution: 0 }, tags: ["pickup"] },
    { name: "Rock_1", shape: "Block", material: "Slate", color: [0.204, 0.192, 0.173], size: ROCK_SIZE, mass: ROCK_MASS, attributes: pickupAttributes("Slate", "Rock") },
  );
  // A torus gets a flat box collider (diameter x tube, thin along local Y) from the runtime,
  // matching the Clawblox ring part. Whether the rendered torus lies flat with it is a check
  // for the viewer (the Three torus is thin along Z).
  add(
    { id: "ring_1", label: "Ring_1", type: "torus", geometry: { radius: 1.52, tube: 0.28, radialSegments: 32 }, transform: { position: [40, 0.28, -42], rotationDegrees: [0, 32, 0] }, material: { color: "#e8c04a", roughness: 0.35, metalness: 0.55, emissive: "#e8c04a", emissiveIntensity: 0.12 }, physics: { mode: "dynamic", mass: RING_MASS, friction: 0.35, restitution: 0.18 }, tags: ["pickup"] },
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
      // The island viewer's lights for a Clawblox island (src/island-app.ts), so both look alike.
      { id: "ambient", type: "ambient-light", intensity: 0.55, material: { color: "#dfeeff" } },
      { id: "sun", type: "directional-light", intensity: 2.6, transform: { position: [60, 90, 40] }, material: { color: "#fff1d8" }, castShadow: true },
      ...entities,
      ...decor,
    ],
  };
  return { document, meta };
}
