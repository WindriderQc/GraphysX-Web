/**
 * DiskX — the city as a v2 world document.
 *
 * A layout from `diskx-data.ts` becomes ordinary scene vocabulary: dark glass blocks for the
 * folders of the current level, a neon cap and underglow in the folder's category colour so
 * bloom lifts them, smaller lit buildings on each roof for the folder's largest children, one
 * low plaza tile for the current folder's own files, three coloured point lights and a slow
 * drift of data motes. Every entity is a plain `box`, `point-light` or `emitter`, so the city
 * is selectable in the editor, exportable, and an agent can read "where are the bytes" through
 * the same `api.query` a human click goes through.
 *
 * Which folder a block stands for is carried in the entity's own tags (`diskx-path:<path>`),
 * the way the showroom's `portal-to:` tags carry a destination: the mapping survives export
 * and reload and lives in the scene, not in a TypeScript table beside it.
 */

import type { AgentWorldDefinition, AgentWorldEntityDefinition } from "./agent-world-runtime";
import { DISKX_PALETTE, DISKX_REST_PATH, formatBytes, type DiskxBlock, type DiskxCityLayout } from "./diskx-data";

export const DISKX_WORLD_ID = "diskx-city";
export const DISKX_TAG = "diskx";
export const DISKX_DISTRICT_TAG = "diskx-district";
export const DISKX_BUILDING_TAG = "diskx-building";
/** A volume's free space, drawn as one low translucent tile beside the disks it serves. */
export const DISKX_FREE_TAG = "diskx-free";
export const DISKX_PATH_TAG_PREFIX = "diskx-path:";

/** Read the folder path a DiskX entity stands for, or null for scenery. */
export function diskxPathOf(tags: readonly string[] | undefined): string | null {
  const tag = tags?.find((entry) => entry.startsWith(DISKX_PATH_TAG_PREFIX));
  return tag ? tag.slice(DISKX_PATH_TAG_PREFIX.length) : null;
}

const CAP_THICKNESS = 0.08;
const RIM_THICKNESS = 0.05;
const BODY = "#0a1220";

const round = (value: number): number => Math.round(value * 1000) / 1000;

function blockEntities(block: DiskxBlock, index: number): AgentWorldEntityDefinition[] {
  const { rect, height, node, level } = block;
  const colour = DISKX_PALETTE[node.category].color;
  const cx = round(rect.x + rect.width / 2);
  const cz = round(rect.z + rect.depth / 2);
  const isRest = node.path === DISKX_REST_PATH;
  if (block.kind === "free") return freeTileEntities(block, index);
  const baseY = level === 0 ? 0 : blockTop(block);
  const prefix = level === 0 ? `diskx-d${index}` : `diskx-b${index}`;
  const label = isRest ? node.name : `${node.name} · ${node.totalSize ? sizeLabel(node.totalSize) : ""}`.trim();
  const pathTag = `${DISKX_PATH_TAG_PREFIX}${node.path}`;
  const tags = [DISKX_TAG, level === 0 ? DISKX_DISTRICT_TAG : DISKX_BUILDING_TAG, pathTag];
  const partTags = [DISKX_TAG, pathTag];
  const part = (id: string, label: string, geometry: { width: number; height: number; depth: number }, position: [number, number, number], material: AgentWorldEntityDefinition["material"]): AgentWorldEntityDefinition => ({
    id, label, type: "box", parentId: prefix, geometry, transform: { position }, material, castShadow: false, receiveShadow: false, tags: partTags,
  });
  // Dark glass volume: the category only tints it. The light is on the edges.
  const body: AgentWorldEntityDefinition = {
    id: prefix,
    label,
    type: "box",
    geometry: { width: round(rect.width), height: round(height), depth: round(rect.depth) },
    transform: { position: [cx, round(baseY + height / 2), cz] },
    material: level === 0
      ? { color: isRest ? "#121826" : BODY, roughness: 0.42, metalness: 0.5, emissive: colour, emissiveIntensity: isRest ? 0.008 : 0.018 }
      : { color: tint(BODY, 0.06), roughness: 0.36, metalness: 0.42, emissive: colour, emissiveIntensity: 0.03 + 0.015 * ((index * 7) % 3) },
    castShadow: false,
    receiveShadow: false,
    tags,
  };
  const top = round(height / 2);
  // Roof plate: a dim glow that reads as the folder's colour from above without blooming.
  const plate = part(`${prefix}-cap`, `${node.name} (toit)`,
    { width: round(rect.width * 0.985), height: CAP_THICKNESS, depth: round(rect.depth * 0.985) },
    [0, round(top + CAP_THICKNESS / 2), 0],
    { color: tint(colour, -0.72), emissive: colour, emissiveIntensity: level === 0 ? (isRest ? 0.02 : 0.05) : 0.09, roughness: 0.3, metalness: 0.1 });
  if (level === 1) return [body, plate];
  // Neon rails along the roof's four edges: thin, over-bright, the part bloom is for.
  const railY = round(top + RAIL / 2 + 0.005);
  const rails = [
    part(`${prefix}-rail-n`, `${node.name} (rail)`, { width: round(rect.width), height: RAIL, depth: RAIL }, [0, railY, round(-rect.depth / 2 + RAIL / 2)], RAIL_MATERIAL(colour, isRest)),
    part(`${prefix}-rail-s`, `${node.name} (rail)`, { width: round(rect.width), height: RAIL, depth: RAIL }, [0, railY, round(rect.depth / 2 - RAIL / 2)], RAIL_MATERIAL(colour, isRest)),
    part(`${prefix}-rail-w`, `${node.name} (rail)`, { width: RAIL, height: RAIL, depth: round(rect.depth) }, [round(-rect.width / 2 + RAIL / 2), railY, 0], RAIL_MATERIAL(colour, isRest)),
    part(`${prefix}-rail-e`, `${node.name} (rail)`, { width: RAIL, height: RAIL, depth: round(rect.depth) }, [round(rect.width / 2 - RAIL / 2), railY, 0], RAIL_MATERIAL(colour, isRest)),
  ];
  // Underglow: a slightly wider sliver at street level, so each district floats on its colour.
  const rim = part(`${prefix}-rim`, `${node.name} (underglow)`,
    { width: round(rect.width + 0.2), height: RIM_THICKNESS, depth: round(rect.depth + 0.2) },
    [0, round(-height / 2 + RIM_THICKNESS / 2 + 0.01), 0],
    { color: colour, emissive: colour, emissiveIntensity: isRest ? 0.15 : 0.45, roughness: 0.4, metalness: 0 });
  return [body, plate, ...rails, rim];
}

/**
 * Free space: a see-through slab at street level, cyan, with soft rails — visibly a place
 * where nothing stands yet, and clickable only for its card. Same byte-to-area scale as the
 * districts around it, which is the whole point of drawing it at all.
 */
function freeTileEntities(block: DiskxBlock, index: number): AgentWorldEntityDefinition[] {
  const { rect, height, node } = block;
  const colour = FREE_COLOUR;
  const cx = round(rect.x + rect.width / 2);
  const cz = round(rect.z + rect.depth / 2);
  const prefix = `diskx-f${index}`;
  const pathTag = `${DISKX_PATH_TAG_PREFIX}${node.path}`;
  const slab: AgentWorldEntityDefinition = {
    id: prefix,
    label: `${node.name} · ${sizeLabel(node.totalSize)}`,
    type: "box",
    geometry: { width: round(rect.width), height: round(height), depth: round(rect.depth) },
    transform: { position: [cx, round(height / 2), cz] },
    material: { color: "#0a2a33", emissive: colour, emissiveIntensity: 0.05, roughness: 0.15, metalness: 0.2, opacity: 0.55 },
    castShadow: false,
    receiveShadow: false,
    tags: [DISKX_TAG, DISKX_DISTRICT_TAG, DISKX_FREE_TAG, pathTag],
  };
  const railY = round(height / 2 + RAIL / 2);
  const rail = (id: string, geometry: { width: number; height: number; depth: number }, position: [number, number, number]): AgentWorldEntityDefinition => ({
    id, label: `${node.name} (rail)`, type: "box", parentId: prefix, geometry, transform: { position },
    material: { color: colour, emissive: colour, emissiveIntensity: 0.42, roughness: 0.3, metalness: 0, opacity: 0.8 },
    castShadow: false, receiveShadow: false, tags: [DISKX_TAG, pathTag],
  });
  const thin = RAIL * 0.7;
  return [
    slab,
    rail(`${prefix}-rail-n`, { width: round(rect.width), height: thin, depth: thin }, [0, railY, round(-rect.depth / 2 + thin / 2)]),
    rail(`${prefix}-rail-s`, { width: round(rect.width), height: thin, depth: thin }, [0, railY, round(rect.depth / 2 - thin / 2)]),
    rail(`${prefix}-rail-w`, { width: thin, height: thin, depth: round(rect.depth) }, [round(-rect.width / 2 + thin / 2), railY, 0]),
    rail(`${prefix}-rail-e`, { width: thin, height: thin, depth: round(rect.depth) }, [round(rect.width / 2 - thin / 2), railY, 0]),
  ];
}

export const FREE_COLOUR = "#39e0ff";
const RAIL = 0.14;
const RAIL_MATERIAL = (colour: string, dim: boolean): AgentWorldEntityDefinition["material"] =>
  ({ color: colour, emissive: colour, emissiveIntensity: dim ? 0.5 : 1.35, roughness: 0.2, metalness: 0 });

/** World-space y of a district's roof, where its buildings stand. */
export function blockTop(block: DiskxBlock): number {
  // Level-1 blocks sit on their parent district; the layout keeps the parent's height on the
  // level-0 block, which the caller recovers through `parent`. For a level-0 block the roof is
  // its own height. Roof buildings are placed with the cap thickness so they stand on the neon.
  return block.level === 0 ? block.height : (block.parentHeight ?? 0) + CAP_THICKNESS;
}

export type DiskxSceneOptions = {
  /** Scene revision label shown in the editor outliner. */
  label?: string;
  /** Disable the ambient emitter for reduced-motion visitors or deterministic captures. */
  motes?: boolean;
};

/**
 * Compose the whole city for one layout. Called on every dive, so the result replaces the
 * world through `api.create` and the previous level is gone — the previous level is one
 * `api.undo()` away, which is exactly what "back" means here.
 */
export function composeDiskxWorld(layout: DiskxCityLayout, options: DiskxSceneOptions = {}): AgentWorldDefinition {
  const size = layout.size;
  const entities: AgentWorldEntityDefinition[] = [
    { id: "diskx-ambient", label: "Night ambient", type: "ambient-light", intensity: 0.55, material: { color: "#2a3f6e" }, tags: [DISKX_TAG, "lighting"] },
    { id: "diskx-key", label: "Moon key", type: "directional-light", intensity: 1.6, transform: { position: [-18, 26, 14] }, material: { color: "#9fc5ff" }, tags: [DISKX_TAG, "lighting"] },
    { id: "diskx-glow-a", label: "Magenta wash", type: "point-light", intensity: 6, distance: size * 1.8, marker: false, transform: { position: [-size * 0.45, 17, -size * 0.4] }, material: { color: "#ff4fd8" }, tags: [DISKX_TAG, "lighting"] },
    { id: "diskx-glow-b", label: "Cyan wash", type: "point-light", intensity: 6, distance: size * 1.8, marker: false, transform: { position: [size * 0.48, 16, size * 0.42] }, material: { color: "#4ff2ff" }, tags: [DISKX_TAG, "lighting"] },
    { id: "diskx-glow-c", label: "Violet wash", type: "point-light", intensity: 4, distance: size * 1.4, marker: false, transform: { position: [size * 0.1, 20, -size * 0.55] }, material: { color: "#8a6bff" }, tags: [DISKX_TAG, "lighting"] },
  ];

  // Plaza frame: four thin neon kerbs around the city so the level reads as one object.
  const kerb = (id: string, x: number, z: number, width: number, depth: number): AgentWorldEntityDefinition => ({
    id, label: "Plaza kerb", type: "box", geometry: { width, height: 0.06, depth }, transform: { position: [x, 0.03, z] },
    material: { color: "#1b3a4a", emissive: "#2ad4ff", emissiveIntensity: 0.55, roughness: 0.4, metalness: 0.1 }, castShadow: false, receiveShadow: false,
    tags: [DISKX_TAG, "kerb"],
  });
  const half = size / 2 + 0.6;
  entities.push(
    kerb("diskx-kerb-n", 0, -half, size + 1.3, 0.1),
    kerb("diskx-kerb-s", 0, half, size + 1.3, 0.1),
    kerb("diskx-kerb-w", -half, 0, 0.1, size + 1.3),
    kerb("diskx-kerb-e", half, 0, 0.1, size + 1.3),
  );

  if (layout.plaza) {
    const { rect } = layout.plaza;
    entities.push({
      id: "diskx-plaza",
      label: `${layout.plaza.files} fichiers ici · ${sizeLabel(layout.plaza.size)}`,
      type: "box",
      geometry: { width: round(rect.width), height: 0.14, depth: round(rect.depth) },
      transform: { position: [round(rect.x + rect.width / 2), 0.07, round(rect.z + rect.depth / 2)] },
      material: { color: "#0f1a2c", emissive: "#4ff2ff", emissiveIntensity: 0.22, roughness: 0.2, metalness: 0.7 },
      castShadow: false,
      receiveShadow: false,
      tags: [DISKX_TAG, "diskx-plaza", `${DISKX_PATH_TAG_PREFIX}${layout.focus.path}`],
    });
  }

  // Districts first so their heights are known to the buildings standing on them.
  const districtHeight = new Map<string, number>();
  let index = 0;
  for (const block of layout.blocks) {
    if (block.level !== 0) continue;
    districtHeight.set(block.node.path, block.height);
    entities.push(...blockEntities(block, index++));
  }
  for (const block of layout.blocks) {
    if (block.level !== 1) continue;
    const parentHeight = block.parent ? districtHeight.get(block.parent.path) ?? 0 : 0;
    entities.push(...blockEntities({ ...block, parentHeight }, index++));
  }

  if (options.motes !== false) {
    entities.push({
      id: "diskx-motes",
      label: "Data motes",
      type: "emitter",
      transform: { position: [0, 6, 0] },
      emitter: { preset: "energy-orb", rate: 10, maxParticles: 90, lifetimeSeconds: 9, speed: 0.35, sizeScale: 0.55, volumeScale: size * 0.9, color: "#6fe8ff", gravity: [0, 0.08, 0], spread: 1.4, seed: 7 },
      tags: [DISKX_TAG, "effect"],
    });
  }

  return {
    schema: "graphysx.agent-world/v2",
    id: DISKX_WORLD_ID,
    label: options.label ?? `DiskX · ${layout.focus.name}`,
    environment: {
      background: "#04060d",
      sky: "clearnight",
      lighting: { source: "studio", intensity: 0.3, yawDegrees: 0, backgroundIntensity: 0.6, backgroundBlur: 0 },
      envelope: { fogNear: size * 1.6, fogFar: size * 4.2, cameraFar: size * 9 },
      post: { bloom: { strength: 0.55, threshold: 0.68, radius: 0.5 } },
      ground: { visible: true, size: size * 1.9, color: "#060a14", grid: true, gridColor: "#143a4d" },
      physics: { gravity: [0, -9.81, 0] },
    },
    entities,
  };
}

const sizeLabel = formatBytes;

/** Mix a hex colour toward white (amount > 0) or black (amount < 0). */
function tint(hex: string, amount: number): string {
  const value = parseInt(hex.slice(1), 16);
  const toward = amount >= 0 ? 255 : 0;
  const weight = Math.abs(amount);
  const channel = (shift: number): number => Math.round(((value >> shift) & 0xff) * (1 - weight) + toward * weight);
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, "0")).join("")}`;
}
