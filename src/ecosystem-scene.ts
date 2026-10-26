/**
 * The connected house as a v2 world document.
 *
 * One plateau, laid out like the infographic it comes from: the service row at the back, UGFrank
 * and its NAS in the middle on their plinth, UGAlien to the left, UGBrutal's desk to the right
 * with devX glowing inside the tower's glass, the four Pi boards on wooden pads at the front,
 * the Deco bases on the left edge, the spare hardware in a dotted corner. Every machine is
 * composed from ordinary primitives (towers with bezels and vents, drive trays with LEDs, GPU
 * cards with spinning fans, PCBs on the electronic-board texture, monitors with live generative
 * screens) under one principal entity whose tags carry its id (`eco-node:<id>`), the way DiskX
 * districts carry a folder path. An agent reads "where is UGFrank" with `api.query`.
 *
 * A node listed in the models manifest (`public/assets/ecosystem/models.json`, written by
 * `scripts/vendor-ecosystem-models.mjs` from a Blender or CC0 GLB) is drawn with that model
 * instead of the composed primitives; the tags, the underglow and the amber beacon stay.
 *
 * Status is visible without a legend: an open issue has an amber beacon and an amber glow,
 * planned or spare hardware is a translucent wireframe cage. Nothing here claims health.
 */
import type { AgentWorldDefinition, AgentWorldEntityDefinition } from "./agent-world-runtime";
import { ECOSYSTEM_NODES, ECOSYSTEM_SNAPSHOT_DATE, type EcoKind, type EcoNode, type EcoStatus } from "./ecosystem-data";

export const ECOSYSTEM_WORLD_ID = "agentx-ecosystem";
export const ECO_TAG = "eco";
export const ECO_NODE_TAG = "eco-node";
export const ECO_NODE_PREFIX = "eco-node:";
export const ECO_STATUS_PREFIX = "eco-status:";
/** Half-size of the plateau; the camera and the fog are scaled from it. */
export const ECO_HALF = 24;

export const ECO_COLOURS = {
  cyan: "#4ff2ff", teal: "#35d6b0", amber: "#ffb13b", lavender: "#b48cff", ivory: "#f2ecdc", blue: "#5ea2ff", magenta: "#ff4fd8", warm: "#ffd9a0",
} as const;
export const KIND_COLOUR: Record<EcoKind, string> = {
  host: ECO_COLOURS.cyan, vm: ECO_COLOURS.lavender, service: ECO_COLOURS.teal, storage: ECO_COLOURS.blue, edge: ECO_COLOURS.cyan,
  network: ECO_COLOURS.ivory, spare: ECO_COLOURS.lavender, client: ECO_COLOURS.ivory, external: ECO_COLOURS.lavender,
};
export const STATUS_COLOUR: Record<EcoStatus, string> = { installed: ECO_COLOURS.cyan, planned: ECO_COLOURS.lavender, attention: ECO_COLOURS.amber };

/** Read the node id an entity stands for, or null for scenery. */
export function ecoNodeIdOf(tags: readonly string[] | undefined): string | null {
  const tag = tags?.find((entry) => entry.startsWith(ECO_NODE_PREFIX));
  return tag ? tag.slice(ECO_NODE_PREFIX.length) : null;
}

export type EcoPlacement = { x: number; z: number; width: number; height: number; depth: number; y?: number };
/** Where each node stands on the plateau (world units, centred at x/z, resting on the ground). */
export const ECO_PLACEMENTS: Readonly<Record<string, EcoPlacement>> = {
  // service row at the back, in the order of the infographic
  core: { x: -14, z: -13, width: 3.4, height: 1.2, depth: 2.8 },
  nestor: { x: -10, z: -13, width: 3.4, height: 1.2, depth: 2.8 },
  dsh: { x: -6, z: -13, width: 3.4, height: 1.2, depth: 2.8 },
  imagex: { x: -2, z: -13, width: 3.4, height: 1.2, depth: 2.8 },
  rag: { x: 2, z: -13, width: 3.4, height: 1.2, depth: 2.8 },
  media: { x: 6, z: -13, width: 3.4, height: 1.2, depth: 2.8 },
  homeassistant: { x: 10, z: -13, width: 3.4, height: 1.2, depth: 2.8 },
  monitoring: { x: 14, z: -13, width: 3.4, height: 1.2, depth: 2.8 },
  // the middle: UGFrank tower and its NAS
  ugfrank: { x: 0, z: -3, width: 3.2, height: 7, depth: 3.6 },
  nas: { x: 4.8, z: -3, width: 3, height: 2.8, depth: 3.6 },
  // left: compute; right: the Windows desk with the tower and devX inside it
  ugalien: { x: -13, z: 4, width: 4.4, height: 5.4, depth: 4.4 },
  ugbrutal: { x: 12, z: 4, width: 6.2, height: 4.4, depth: 5 },
  devx: { x: 10.1, z: 4, width: 1.3, height: 1.3, depth: 1.3, y: 1.1 },
  // the edge row at the front: wooden pads
  piusb: { x: -13, z: 15, width: 3.6, height: 0.5, depth: 3 },
  pit: { x: -4.5, z: 15, width: 3.6, height: 0.5, depth: 3 },
  babypi: { x: 4, z: 15, width: 3.6, height: 0.5, depth: 3 },
  pitft: { x: 12.5, z: 15, width: 3.6, height: 0.5, depth: 3 },
  // network and clients at the margins
  deco: { x: -17, z: -4, width: 3.6, height: 1.8, depth: 2 },
  browser: { x: -20, z: -11, width: 2.2, height: 1.4, depth: 1.8 },
  phone: { x: 8.5, z: 19, width: 0.9, height: 1.7, depth: 0.5 },
  gcal: { x: 20, z: -11, width: 2.2, height: 1.4, depth: 1.8 },
  // the dotted corner
  ugsmall: { x: 20, z: -4, width: 2.2, height: 1.4, depth: 2.2 },
  ugstation: { x: 20, z: 0, width: 2.2, height: 1.2, depth: 2.2 },
  "ugfrank-old": { x: 20, z: 4, width: 2.2, height: 2.4, depth: 2.2 },
  pi123: { x: 20, z: 8, width: 1.6, height: 0.5, depth: 1.2 },
};

export type EcoModel = { url: string; size: readonly [number, number, number] };
export type EcosystemSceneOptions = { motes?: boolean; sky?: boolean; label?: string; models?: Readonly<Record<string, EcoModel>>; plants?: boolean };

type Material = AgentWorldEntityDefinition["material"];
type Geometry = AgentWorldEntityDefinition["geometry"];
type Vec3 = [number, number, number];
const round = (value: number): number => Math.round(value * 1000) / 1000;
const v3 = (x: number, y: number, z: number): Vec3 => [round(x), round(y), round(z)];

// ---- finishes -------------------------------------------------------------------------------
const M = {
  metal: { color: "#171c26", roughness: 0.32, metalness: 0.78, emissive: "#000000", emissiveIntensity: 0 } as Material,
  bezel: { color: "#2a3344", roughness: 0.55, metalness: 0.35 } as Material,
  dark: { color: "#0c1018", roughness: 0.5, metalness: 0.5 } as Material,
  white: { color: "#e9eef4", roughness: 0.45, metalness: 0.05, emissive: "#8fd0ff", emissiveIntensity: 0.04 } as Material,
  silver: { color: "#aeb8c6", roughness: 0.3, metalness: 0.9 } as Material,
  pcb: { color: "#2f8a4c", roughness: 0.6, metalness: 0.1, texture: { id: "electronic-board", repeat: [1, 1] } } as Material,
  chip: { color: "#0a0c12", roughness: 0.35, metalness: 0.6 } as Material,
  glass: { color: "#8fd0ff", roughness: 0.06, metalness: 0.1, opacity: 0.28, emissive: "#8fd0ff", emissiveIntensity: 0.05 } as Material,
  wood: { color: "#c8925c", roughness: 0.7, metalness: 0, texture: { id: "wood-floor", repeat: [2, 1.5] } } as Material,
  plank: { color: "#b07a4a", roughness: 0.75, metalness: 0, texture: { id: "worn-wood", repeat: [4, 2] } } as Material,
  slate: { color: "#1a2234", roughness: 0.75, metalness: 0.15, texture: { id: "concrete", repeat: [8, 8] } } as Material,
  led: (colour: string, intensity = 1.4): Material => ({ color: colour, emissive: colour, emissiveIntensity: intensity, roughness: 0.3, metalness: 0 }),
  screen: (tint: string): Material => ({ color: "#07101c", emissive: tint, emissiveIntensity: 0.5, roughness: 0.2, metalness: 0.1 }),
  cage: (colour: string): Material => ({ color: colour, emissive: colour, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0, wireframe: true, opacity: 0.8 }),
  ghost: (colour: string): Material => ({ color: colour, emissive: colour, emissiveIntensity: 0.22, roughness: 0.3, metalness: 0, opacity: 0.18 }),
};
const SCREEN = (sketch: "waveform" | "grid-pulse" | "plasma", tint: string): AgentWorldEntityDefinition["surface"] => ({ sketch, tint, fps: 18, resolution: 256, emissive: true });
const SPIN = (speedDegrees: number): AgentWorldEntityDefinition["behaviors"] => [{ type: "spin", axis: "y", speedDegrees }];
const PULSE = (frequencyHz: number, phaseDegrees = 0): AgentWorldEntityDefinition["behaviors"] => [{ type: "pulse", minimumScale: 0.85, maximumScale: 1.15, frequencyHz, phaseDegrees }];

/** Builder of the parts under one principal entity. Positions are relative to the body's centre. */
function kit(id: string, node: EcoNode) {
  const idTag = `${ECO_NODE_PREFIX}${node.id}`;
  const tags = [ECO_TAG, idTag];
  let count = 0;
  const part = (suffix: string, label: string, type: AgentWorldEntityDefinition["type"], geometry: Geometry, position: Vec3, material: Material,
    extra: Partial<Pick<AgentWorldEntityDefinition, "behaviors" | "surface">> & { rotationDegrees?: Vec3 } = {}): AgentWorldEntityDefinition => ({
    id: `${id}-${suffix}`, label, type, parentId: id, geometry,
    transform: { position, ...(extra.rotationDegrees ? { rotationDegrees: extra.rotationDegrees } : {}) },
    material, castShadow: false, receiveShadow: false, tags,
    ...(extra.behaviors ? { behaviors: extra.behaviors } : {}), ...(extra.surface ? { surface: extra.surface } : {}),
  });
  const next = (prefix: string): string => `${prefix}-${count++}`;
  /** A fan: a dark disc facing +z that spins, with a lit ring around it. */
  const fan = (position: Vec3, radius: number, colour: string, speed = 240): AgentWorldEntityDefinition[] => [
    part(next("fan"), `${node.name} (ventilateur)`, "cylinder", { radius, height: 0.08, radialSegments: 7 }, position, { color: "#1a2030", roughness: 0.5, metalness: 0.6 }, { rotationDegrees: [90, 0, 0], behaviors: SPIN(speed) }),
    part(next("fanring"), `${node.name} (anneau)`, "torus", { radius: radius + 0.05, tube: 0.03, radialSegments: 8 }, position, M.led(colour, 1.2)),
  ];
  const leds = (positions: Vec3[], colour: string, radius = 0.06): AgentWorldEntityDefinition[] =>
    positions.map((position) => part(next("led"), `${node.name} (voyant)`, "sphere", { radius, radialSegments: 8 }, position, M.led(colour, 2)));
  return { part, fan, leds, next };
}

function serviceParts(node: EcoNode, place: EcoPlacement, k: ReturnType<typeof kit>): AgentWorldEntityDefinition[] {
  const top = place.height / 2;
  const colour = KIND_COLOUR.service;
  const parts: AgentWorldEntityDefinition[] = [
    // frosted lit lid over a dark tray, like a module on a rack shelf
    k.part("lid", `${node.name} (plaque)`, "box", { width: place.width - 0.3, height: 0.08, depth: place.depth - 0.3 }, v3(0, top + 0.04, 0), { color: "#0f2a2a", emissive: colour, emissiveIntensity: 0.35, roughness: 0.2, metalness: 0.2, opacity: 0.9 }),
    k.part("edge", `${node.name} (liseré)`, "box", { width: place.width - 0.2, height: 0.05, depth: 0.05 }, v3(0, top - 0.05, place.depth / 2 - 0.08), M.led(colour, 1.1)),
  ];
  const y = top + 0.1;
  switch (node.id) {
    case "core": // the hub: a sphere in a ring, and four small blocks (conversations, tasks, memory, finance)
      parts.push(k.part("hub", "Core", "sphere", { radius: 0.38, radialSegments: 20 }, v3(0, y + 0.5, 0), M.led(colour, 0.9), { behaviors: PULSE(0.4) }),
        k.part("ring", "Core (anneau)", "torus", { radius: 0.62, tube: 0.035, radialSegments: 8 }, v3(0, y + 0.5, 0), M.led(ECO_COLOURS.cyan, 1.2), { rotationDegrees: [90, 0, 0], behaviors: SPIN(30) }),
        ...[-1.1, -0.37, 0.37, 1.1].map((x, i) => k.part(`block-${i}`, "Core (fonction)", "box", { width: 0.5, height: 0.3, depth: 0.5 }, v3(x, y + 0.15, 0.95), M.led([ECO_COLOURS.cyan, ECO_COLOURS.teal, ECO_COLOURS.lavender, ECO_COLOURS.amber][i], 0.5))));
      break;
    case "nestor": // two backends, two heads, side by side
      parts.push(...[-0.65, 0.65].map((x, i) => k.part(`head-${i}`, i ? "Hermes Nestor" : "OpenClaw", "sphere", { radius: 0.4, radialSegments: 18 }, v3(x, y + 0.5, 0), i ? M.dark : M.white)),
        ...[-0.65, 0.65].map((x, i) => k.part(`eye-${i}`, "Nestor (visière)", "box", { width: 0.42, height: 0.12, depth: 0.1 }, v3(x, y + 0.55, 0.36), M.led(i ? ECO_COLOURS.amber : ECO_COLOURS.cyan, 1.6))),
        k.part("ou", "Nestor (au choix)", "box", { width: 0.06, height: 0.7, depth: 0.06 }, v3(0, y + 0.45, 0), M.led(ECO_COLOURS.ivory, 0.6)));
      break;
    case "dsh": // a code pane
      parts.push(k.part("pane", "DSH (écran)", "box", { width: 2.2, height: 1.1, depth: 0.08 }, v3(0, y + 0.6, -0.2), M.screen(ECO_COLOURS.cyan), { rotationDegrees: [-12, 0, 0], surface: SCREEN("grid-pulse", ECO_COLOURS.teal) }),
        ...[0, 1, 2, 3].map((i) => k.part(`line-${i}`, "DSH (ligne)", "box", { width: 0.5 + (i * 7 % 4) * 0.3, height: 0.05, depth: 0.03 }, v3(-0.7 + (i % 2) * 0.2, y + 0.95 - i * 0.2, 0.0), M.led([ECO_COLOURS.cyan, ECO_COLOURS.lavender, ECO_COLOURS.amber, ECO_COLOURS.teal][i], 1.4))));
      break;
    case "imagex": // an easel with a plasma canvas
      parts.push(k.part("canvas", "imageX (toile)", "box", { width: 1.5, height: 1.1, depth: 0.08 }, v3(0.2, y + 0.65, 0), { color: "#101828", roughness: 0.4, metalness: 0.1, emissive: ECO_COLOURS.magenta, emissiveIntensity: 0.3 }, { rotationDegrees: [-15, 0, 0], surface: SCREEN("plasma", "#ffb3e6") }),
        k.part("brush", "imageX (pinceau)", "cylinder", { radius: 0.04, height: 1.1, radialSegments: 6 }, v3(-1.0, y + 0.5, 0.3), M.wood, { rotationDegrees: [0, 0, 25] }),
        k.part("tip", "imageX (pinceau)", "cone", { radius: 0.07, height: 0.2, radialSegments: 6 }, v3(-1.25, y + 1.03, 0.3), M.led(ECO_COLOURS.amber, 1), { rotationDegrees: [0, 0, 25] }));
      break;
    case "rag": // stacked discs for Mongo and Qdrant
      parts.push(...[0, 1, 2].map((i) => k.part(`disc-${i}`, "RAG (base)", "cylinder", { radius: 0.5, height: 0.22, radialSegments: 20 }, v3(-0.7, y + 0.15 + i * 0.3, 0), i % 2 ? M.bezel : M.metal)),
        ...[0, 1, 2].map((i) => k.part(`disc-b-${i}`, "RAG (vecteurs)", "cylinder", { radius: 0.5, height: 0.22, radialSegments: 20 }, v3(0.7, y + 0.15 + i * 0.3, 0), i % 2 ? M.bezel : M.metal)),
        k.part("vec", "RAG (vecteur)", "icosahedron", { radius: 0.3 }, v3(0.7, y + 1.35, 0), M.led(ECO_COLOURS.lavender, 1), { behaviors: SPIN(50) }),
        k.part("leaf", "RAG (feuille)", "sphere", { radius: 0.22, radialSegments: 10 }, v3(-0.7, y + 1.2, 0), M.led("#3dffb0", 0.8)));
      break;
    case "media": // two framed pictures and a book
      parts.push(k.part("frame-a", "Immich (cadre)", "box", { width: 1.1, height: 0.8, depth: 0.08 }, v3(-0.8, y + 0.5, 0), M.screen(ECO_COLOURS.blue), { rotationDegrees: [-10, 8, 0], surface: SCREEN("plasma", "#9fd0ff") }),
        k.part("frame-b", "Plex (cadre)", "box", { width: 0.9, height: 0.7, depth: 0.08 }, v3(0.5, y + 0.45, 0.3), M.screen(ECO_COLOURS.amber), { rotationDegrees: [-10, -8, 0], surface: SCREEN("waveform", "#ffcf78") }),
        k.part("book", "Life Atlas (livre)", "box", { width: 0.5, height: 0.7, depth: 0.16 }, v3(1.3, y + 0.35, -0.4), { color: "#2b3a8f", roughness: 0.6, metalness: 0.1, emissive: ECO_COLOURS.blue, emissiveIntensity: 0.2 }));
      break;
    case "homeassistant": // a tiny house with a lit window and an MQTT antenna
      parts.push(k.part("house", "Home Assistant (maison)", "box", { width: 1.3, height: 0.8, depth: 1.1 }, v3(-0.3, y + 0.4, 0), M.white),
        k.part("roof", "Home Assistant (toit)", "cone", { radius: 1.0, height: 0.6, radialSegments: 4 }, v3(-0.3, y + 1.1, 0), { color: "#2e6ad8", roughness: 0.6, metalness: 0.1, emissive: ECO_COLOURS.blue, emissiveIntensity: 0.25 }, { rotationDegrees: [0, 45, 0] }),
        k.part("window", "Home Assistant (fenêtre)", "box", { width: 0.3, height: 0.3, depth: 0.05 }, v3(-0.3, y + 0.45, 0.56), M.led(ECO_COLOURS.warm, 1.6)),
        k.part("mast", "MQTT (antenne)", "cylinder", { radius: 0.03, height: 1.2, radialSegments: 6 }, v3(1.0, y + 0.6, 0), M.silver),
        k.part("mqtt", "MQTT", "sphere", { radius: 0.12, radialSegments: 8 }, v3(1.0, y + 1.25, 0), M.led("#3dffb0", 1.8), { behaviors: PULSE(1.2) }));
      break;
    case "monitoring": // a bar chart and a scope
      parts.push(...[0.35, 0.7, 0.5, 0.95, 0.6].map((h, i) => k.part(`bar-${i}`, "Grafana (barre)", "box", { width: 0.22, height: h, depth: 0.22 }, v3(-1.1 + i * 0.35, y + h / 2, 0.3), M.led(i === 3 ? ECO_COLOURS.amber : ECO_COLOURS.teal, 0.9))),
        k.part("scope", "Prometheus (courbe)", "box", { width: 1.0, height: 0.7, depth: 0.08 }, v3(0.9, y + 0.5, -0.4), M.screen(ECO_COLOURS.amber), { rotationDegrees: [-10, -15, 0], surface: SCREEN("waveform", ECO_COLOURS.amber) }));
      break;
  }
  return parts;
}

function machineParts(node: EcoNode, place: EcoPlacement, k: ReturnType<typeof kit>): AgentWorldEntityDefinition[] {
  const top = place.height / 2, front = place.depth / 2;
  const parts: AgentWorldEntityDefinition[] = [];
  switch (node.id) {
    case "ugfrank": {
      // HP Z440: bezel, vents, the hp ring, a power LED, drive door, two inference lanes on the front.
      parts.push(k.part("bezel", "UGFrank (façade)", "box", { width: place.width - 0.3, height: place.height - 0.3, depth: 0.14 }, v3(0, 0, front - 0.02), M.bezel),
        ...[0, 1, 2, 3, 4].map((i) => k.part(`vent-${i}`, "UGFrank (aération)", "box", { width: place.width - 0.8, height: 0.06, depth: 0.06 }, v3(0, top - 0.5 - i * 0.18, front + 0.08), M.dark)),
        k.part("hp", "UGFrank (hp)", "torus", { radius: 0.32, tube: 0.05, radialSegments: 8 }, v3(-0.8, top - 1.9, front + 0.1), M.led(ECO_COLOURS.blue, 1.4)),
        k.part("door", "UGFrank (baie)", "box", { width: 1.3, height: 1.5, depth: 0.06 }, v3(0.6, top - 2.0, front + 0.08), M.metal),
        ...k.leds([v3(0.9, top - 1.4, front + 0.14)], ECO_COLOURS.cyan, 0.07),
        k.part("lane-gpu", "Voie GPU · :11434", "box", { width: 1.1, height: 2.2, depth: 0.1 }, v3(-0.75, -top + 1.4, front + 0.1), M.screen(ECO_COLOURS.cyan), { surface: SCREEN("waveform", ECO_COLOURS.cyan) }),
        k.part("lane-cpu", "Voie CPU · :11435", "box", { width: 1.1, height: 2.2, depth: 0.1 }, v3(0.75, -top + 1.4, front + 0.1), M.screen(ECO_COLOURS.teal), { surface: SCREEN("grid-pulse", ECO_COLOURS.teal) }),
        // side intake grille and a GPU slot glowing through it
        ...[0, 1, 2, 3, 4, 5].map((i) => k.part(`grille-${i}`, "UGFrank (grille)", "box", { width: 0.05, height: 2.4, depth: 0.08 }, v3(-place.width / 2 - 0.01, -top + 2.0, -0.9 + i * 0.36), M.silver)),
        k.part("gpu", "UGFrank (RTX 3080 Ti)", "box", { width: 0.1, height: 0.9, depth: 2.0 }, v3(-place.width / 2 - 0.05, -top + 2.0, 0), M.led(ECO_COLOURS.cyan, 0.6)),
        ...k.fan(v3(0, top - 0.9, -front - 0.05), 0.5, ECO_COLOURS.cyan, 180));
      break;
    }
    case "nas": {
      // Four hot-swap trays, two in the mirror lit brighter, a handle bar on top.
      parts.push(k.part("bezel", "NAS (façade)", "box", { width: place.width - 0.2, height: place.height - 0.3, depth: 0.1 }, v3(0, 0, front - 0.02), M.bezel),
        ...[0, 1, 2, 3].map((i) => k.part(`tray-${i}`, `NAS (baie ${i + 1})`, "box", { width: 0.55, height: 2.0, depth: 0.12 }, v3(-1.0 + i * 0.66, 0, front + 0.08), i < 2 ? M.metal : M.dark)),
        ...k.leds([0, 1, 2, 3].map((i) => v3(-1.0 + i * 0.66, 0.85, front + 0.18)), ECO_COLOURS.blue, 0.05),
        ...[0, 1].map((i) => k.part(`mirror-${i}`, "NAS (miroir ZFS)", "box", { width: 0.4, height: 0.08, depth: 0.04 }, v3(-1.0 + i * 0.66, -0.9, front + 0.17), M.led(ECO_COLOURS.blue, 1.6))),
        k.part("handle", "NAS (poignée)", "box", { width: place.width - 0.6, height: 0.08, depth: 0.3 }, v3(0, top + 0.04, -0.6), M.silver),
        ...k.fan(v3(0, 0.2, -front - 0.05), 0.42, ECO_COLOURS.blue, 150));
      break;
    }
    case "ugalien": {
      // Aurora R12: a rounded tower with the vertical light strip and the alien ring, two RTX 3090 cards in front.
      parts.push(k.part("strip", "UGAlien (bandeau)", "box", { width: 0.16, height: place.height - 1.6, depth: 0.08 }, v3(0, 0.2, place.width / 2 - 0.02), M.led(ECO_COLOURS.cyan, 0.8)),
        k.part("head", "UGAlien (emblème)", "torus", { radius: 0.4, tube: 0.05, radialSegments: 8 }, v3(0, top - 0.7, place.width / 2 + 0.02), M.led(ECO_COLOURS.cyan, 1.6)),
        k.part("cap", "UGAlien (capot)", "cylinder", { radius: place.width / 2 - 0.1, height: 0.12, radialSegments: 28 }, v3(0, top + 0.05, 0), M.bezel),
        ...k.fan(v3(-1.2, top - 1.6, place.width / 2 - 0.3), 0.36, ECO_COLOURS.cyan, 300),
        ...k.fan(v3(1.2, top - 1.6, place.width / 2 - 0.3), 0.36, ECO_COLOURS.cyan, 280));
      for (const [index, y] of [[0, -top + 0.45], [1, -top + 1.15]] as const) {
        const z = front + 0.75;
        parts.push(k.part(`gpu-${index}`, `UGAlien (RTX 3090 n° ${index + 1})`, "box", { width: 3.4, height: 0.5, depth: 1.2 }, v3(0.2, y, z), M.metal),
          k.part(`gpu-${index}-shroud`, "UGAlien (carénage)", "box", { width: 3.3, height: 0.1, depth: 1.1 }, v3(0.2, y + 0.3, z), M.bezel),
          k.part(`gpu-${index}-logo`, "GEFORCE RTX", "box", { width: 1.2, height: 0.06, depth: 0.2 }, v3(0.8, y + 0.36, z - 0.4), M.led(ECO_COLOURS.teal, 1.2)),
          ...[-0.9, 0.3].map((x) => k.part(k.next(`gpu-${index}-fan`), "UGAlien (ventilateur)", "cylinder", { radius: 0.36, height: 0.06, radialSegments: 7 }, v3(x, y + 0.33, z + 0.1), { color: "#1a2030", roughness: 0.5, metalness: 0.6 }, { behaviors: SPIN(260 + index * 40) })),
          ...[-0.9, 0.3].map((x) => k.part(k.next(`gpu-${index}-ring`), "UGAlien (anneau)", "torus", { radius: 0.4, tube: 0.03, radialSegments: 8 }, v3(x, y + 0.33, z + 0.1), M.led(ECO_COLOURS.cyan, 1.2), { rotationDegrees: [90, 0, 0] })));
      }
      break;
    }
    case "ugbrutal": {
      // The Windows desk: the tower (principal) with a glass side on +x showing devX, a desk, a monitor, a keyboard, a mouse.
      const towerX = -1.9;
      parts.push(k.part("back", "UGBrutal (dos)", "box", { width: 2.2, height: place.height, depth: 0.12 }, v3(towerX, 0, -2.3), M.metal),
        k.part("side", "UGBrutal (flanc)", "box", { width: 0.12, height: place.height, depth: 4.6 }, v3(towerX - 1.1, 0, 0), M.metal),
        k.part("top", "UGBrutal (capot)", "box", { width: 2.2, height: 0.12, depth: 4.6 }, v3(towerX, top - 0.06, 0), M.metal),
        k.part("bottom", "UGBrutal (socle)", "box", { width: 2.2, height: 0.12, depth: 4.6 }, v3(towerX, -top + 0.06, 0), M.metal),
        k.part("front", "UGBrutal (façade)", "box", { width: 2.2, height: place.height, depth: 0.12 }, v3(towerX, 0, 2.3), M.bezel),
        k.part("stripe", "UGBrutal (liseré)", "box", { width: 0.08, height: place.height - 0.8, depth: 0.06 }, v3(towerX + 0.8, 0, 2.3), M.led(ECO_COLOURS.amber, 1.2)),
        ...k.fan(v3(towerX, top - 0.8, 2.3), 0.45, ECO_COLOURS.magenta, 220),
        k.part("gpu", "UGBrutal (RTX 5070 Ti)", "box", { width: 1.6, height: 0.3, depth: 2.2 }, v3(towerX, -top + 1.9, -0.3), M.metal),
        k.part("gpu-glow", "UGBrutal (RTX 5070 Ti)", "box", { width: 1.5, height: 0.04, depth: 2.0 }, v3(towerX, -top + 2.07, -0.3), M.led(ECO_COLOURS.cyan, 0.9)),
        // desk and monitor beside the tower
        k.part("desk", "UGBrutal (bureau)", "box", { width: 3.6, height: 0.12, depth: 2.6 }, v3(1.3, -top + 1.45, 0), M.wood),
        ...[-1.5, 1.5].map((x, i) => k.part(`leg-${i}`, "UGBrutal (pied)", "box", { width: 0.1, height: 1.4, depth: 2.2 }, v3(1.3 + x, -top + 0.7, 0), M.dark)),
        k.part("stand", "UGBrutal (pied d'écran)", "cylinder", { radius: 0.35, height: 0.06, radialSegments: 16 }, v3(1.6, -top + 1.54, -0.6), M.dark),
        k.part("neck", "UGBrutal (pied d'écran)", "box", { width: 0.12, height: 0.7, depth: 0.1 }, v3(1.6, -top + 1.9, -0.6), M.dark),
        k.part("monitor", "UGBrutal (écran)", "box", { width: 2.6, height: 1.5, depth: 0.08 }, v3(1.6, -top + 2.9, -0.55), M.bezel),
        k.part("screen", "UGBrutal (Windows)", "box", { width: 2.45, height: 1.35, depth: 0.04 }, v3(1.6, -top + 2.9, -0.49), M.screen(ECO_COLOURS.blue), { surface: SCREEN("plasma", "#7fb8ff") }),
        k.part("keyboard", "UGBrutal (clavier)", "box", { width: 1.5, height: 0.06, depth: 0.5 }, v3(1.4, -top + 1.54, 0.5), M.dark),
        k.part("mouse", "UGBrutal (souris)", "sphere", { radius: 0.12, radialSegments: 10 }, v3(2.5, -top + 1.6, 0.5), M.dark));
      break;
    }
    case "devx": {
      parts.push(k.part("core", "devX (noyau)", "box", { width: place.width * 0.55, height: place.height * 0.55, depth: place.depth * 0.55 }, v3(0, 0, 0), M.led(ECO_COLOURS.lavender, 1.6), { behaviors: SPIN(40) }),
        k.part("cage", "devX (VM)", "box", { width: place.width + 0.2, height: place.height + 0.2, depth: place.depth + 0.2 }, v3(0, 0, 0), M.cage(ECO_COLOURS.lavender)));
      break;
    }
    case "deco": {
      // Two white Deco X90 bases with their soft ring, a little Wi-Fi arc over the pair.
      parts.push(...[-0.9, 0.9].map((x, i) => k.part(`base-${i}`, `Deco X90 (borne ${i + 1})`, "cylinder", { radius: 0.62, height: place.height - 0.3, radialSegments: 28 }, v3(x, -0.05, 0), M.white)),
        ...[-0.9, 0.9].map((x, i) => k.part(`cap-${i}`, "Deco X90 (dessus)", "cylinder", { radius: 0.5, height: 0.14, radialSegments: 28 }, v3(x, top - 0.1, 0), M.white)),
        ...[-0.9, 0.9].map((x, i) => k.part(`glow-${i}`, "Deco X90 (anneau)", "torus", { radius: 0.45, tube: 0.03, radialSegments: 8 }, v3(x, top - 0.02, 0), M.led(ECO_COLOURS.cyan, 1.4), { rotationDegrees: [90, 0, 0], behaviors: PULSE(0.5, i * 90) })),
        ...[0.35, 0.6, 0.85].map((r, i) => k.part(`wifi-${i}`, "Deco X90 (Wi-Fi)", "torus", { radius: r, tube: 0.025, radialSegments: 8 }, v3(0, top + 0.5, 0), M.led(ECO_COLOURS.cyan, 0.9 - i * 0.2))));
      break;
    }
    case "browser": {
      // A laptop whose screen shows the voice waveform, and a microphone beside it.
      parts.push(k.part("lid", "Navigateur (écran)", "box", { width: 1.7, height: 1.1, depth: 0.06 }, v3(0.2, 0.25, -0.5), M.bezel, { rotationDegrees: [-20, 0, 0] }),
        k.part("screen", "Navigateur (onde)", "box", { width: 1.55, height: 0.95, depth: 0.04 }, v3(0.2, 0.25, -0.46), M.screen(ECO_COLOURS.cyan), { rotationDegrees: [-20, 0, 0], surface: SCREEN("waveform", ECO_COLOURS.cyan) }),
        k.part("mic", "Micro", "cylinder", { radius: 0.09, height: 0.5, radialSegments: 10 }, v3(-0.85, -top + 0.3, 0.3), M.silver),
        k.part("mic-head", "Micro (capsule)", "sphere", { radius: 0.16, radialSegments: 10 }, v3(-0.85, -top + 0.65, 0.3), M.dark),
        k.part("mic-led", "Micro (voyant)", "sphere", { radius: 0.05, radialSegments: 8 }, v3(-0.85, -top + 0.65, 0.46), M.led(ECO_COLOURS.magenta, 2), { behaviors: PULSE(1.5) }));
      break;
    }
    case "phone": {
      parts.push(k.part("screen", "Téléphone (écran)", "box", { width: place.width - 0.14, height: place.height - 0.2, depth: 0.04 }, v3(0, 0, place.depth / 2), M.screen(ECO_COLOURS.lavender), { surface: SCREEN("plasma", "#c9b3ff") }),
        k.part("note", "Téléphone (musique)", "sphere", { radius: 0.12, radialSegments: 8 }, v3(0.4, top + 0.3, 0), M.led(ECO_COLOURS.lavender, 1.6), { behaviors: PULSE(1, 45) }));
      break;
    }
    case "gcal": {
      parts.push(k.part("cage", "Google Calendar (externe)", "box", { width: place.width + 0.1, height: place.height + 0.1, depth: place.depth + 0.1 }, v3(0, 0, 0), M.cage(ECO_COLOURS.lavender)),
        k.part("page", "Google Calendar (31)", "box", { width: 1.2, height: 0.9, depth: 0.08 }, v3(0, 0.05, 0), { color: "#f4f6fb", roughness: 0.5, metalness: 0, opacity: 0.85 }),
        k.part("band", "Google Calendar (bandeau)", "box", { width: 1.2, height: 0.25, depth: 0.1 }, v3(0, 0.38, 0), M.led("#4285f4", 0.9)));
      break;
    }
  }
  if (node.kind === "edge") parts.push(...piParts(node, place, k));
  if (node.kind === "spare") parts.push(k.part("cage", `${node.name} (prévu)`, "box", { width: place.width + 0.1, height: place.height + 0.1, depth: place.depth + 0.1 }, v3(0, 0, 0), M.cage(ECO_COLOURS.lavender)));
  return parts;
}

/** A Raspberry Pi on its wooden pad: the board, its chip, ports and header, plus what the device carries. */
function piParts(node: EcoNode, place: EcoPlacement, k: ReturnType<typeof kit>): AgentWorldEntityDefinition[] {
  const top = place.height / 2;
  const bx = -0.6, bz = 0.3, by = top + 0.09; // board centre on the pad
  const parts: AgentWorldEntityDefinition[] = [
    k.part("board", `${node.name} (carte)`, "box", { width: 1.7, height: 0.08, depth: 1.1 }, v3(bx, by, bz), M.pcb),
    k.part("soc", `${node.name} (SoC)`, "box", { width: 0.35, height: 0.08, depth: 0.35 }, v3(bx - 0.2, by + 0.08, bz + 0.05), M.chip),
    k.part("usb-a", `${node.name} (USB)`, "box", { width: 0.3, height: 0.26, depth: 0.32 }, v3(bx + 0.72, by + 0.17, bz - 0.2), M.silver),
    k.part("usb-b", `${node.name} (USB)`, "box", { width: 0.3, height: 0.26, depth: 0.32 }, v3(bx + 0.72, by + 0.17, bz + 0.2), M.silver),
    k.part("eth", `${node.name} (Ethernet)`, "box", { width: 0.3, height: 0.26, depth: 0.32 }, v3(bx + 0.72, by + 0.17, bz - 0.55), M.dark),
    k.part("gpio", `${node.name} (GPIO)`, "box", { width: 1.1, height: 0.14, depth: 0.1 }, v3(bx - 0.1, by + 0.11, bz - 0.48), M.chip),
    ...k.leds([v3(bx - 0.78, by + 0.08, bz + 0.45), v3(bx - 0.78, by + 0.08, bz + 0.35)], "#3dffb0", 0.035),
  ];
  switch (node.id) {
    case "piusb": // the USB key it boots from, and a shield for Pi-hole
      parts.push(k.part("key", "piUSB (clé USB)", "box", { width: 0.55, height: 0.14, depth: 0.2 }, v3(bx + 1.15, by + 0.17, bz - 0.2), M.white),
        k.part("shield", "Pi-hole (bouclier)", "cone", { radius: 0.3, height: 0.5, radialSegments: 5 }, v3(1.1, top + 0.35, -0.5), M.led(ECO_COLOURS.cyan, 0.7), { rotationDegrees: [180, 0, 0] }));
      break;
    case "pit": { // a 3D printer frame with its bed, hot end and the 3.5" touch screen
      const px = 0.95, pz = -0.3;
      parts.push(...[[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]].map(([x, z], i) => k.part(`post-${i}`, "PI-T (montant)", "box", { width: 0.06, height: 1.5, depth: 0.06 }, v3(px + x, top + 0.75, pz + z), M.silver)),
        k.part("beam", "PI-T (traverse)", "box", { width: 1.0, height: 0.06, depth: 0.06 }, v3(px, top + 1.5, pz - 0.45), M.silver),
        k.part("gantry", "PI-T (portique)", "box", { width: 1.0, height: 0.06, depth: 0.06 }, v3(px, top + 0.95, pz), M.silver),
        k.part("bed", "PI-T (plateau)", "box", { width: 0.9, height: 0.05, depth: 0.9 }, v3(px, top + 0.12, pz), M.dark),
        k.part("hotend", "PI-T (buse)", "cone", { radius: 0.08, height: 0.25, radialSegments: 8 }, v3(px - 0.1, top + 0.8, pz), M.led(ECO_COLOURS.amber, 1.2), { rotationDegrees: [180, 0, 0] }),
        k.part("print", "PI-T (pièce)", "cylinder", { radius: 0.18, height: 0.3, radialSegments: 8 }, v3(px - 0.1, top + 0.3, pz), M.led(ECO_COLOURS.teal, 0.4)),
        k.part("screen", "OctoDash (écran 3,5 pouces)", "box", { width: 0.8, height: 0.55, depth: 0.05 }, v3(bx - 0.1, by + 0.5, bz + 0.75), M.screen(ECO_COLOURS.cyan), { rotationDegrees: [-25, 0, 0], surface: SCREEN("grid-pulse", ECO_COLOURS.cyan) }));
      break;
    }
    case "babypi": // camera on a stalk, the speaker, the Bluetooth bead
      parts.push(k.part("stalk", "BabyPi (pied de caméra)", "cylinder", { radius: 0.04, height: 0.9, radialSegments: 6 }, v3(1.0, top + 0.45, -0.4), M.silver),
        k.part("camera", "BabyPi (caméra)", "cylinder", { radius: 0.22, height: 0.6, radialSegments: 14 }, v3(1.0, top + 0.95, -0.2), M.white, { rotationDegrees: [80, 0, 0] }),
        k.part("lens", "BabyPi (objectif)", "sphere", { radius: 0.12, radialSegments: 10 }, v3(1.0, top + 0.9, 0.1), M.chip),
        k.part("ir", "BabyPi (IR nocturne)", "sphere", { radius: 0.05, radialSegments: 8 }, v3(1.15, top + 1.0, 0.08), M.led("#ff5a5a", 1.6), { behaviors: PULSE(0.7) }),
        k.part("speaker", "BabyPi (enceinte)", "cylinder", { radius: 0.32, height: 0.6, radialSegments: 16 }, v3(1.1, top + 0.3, 0.8), M.dark),
        k.part("speaker-ring", "BabyPi (enceinte)", "torus", { radius: 0.3, tube: 0.03, radialSegments: 8 }, v3(1.1, top + 0.61, 0.8), M.led(ECO_COLOURS.lavender, 1.2), { rotationDegrees: [90, 0, 0] }),
        k.part("bt", "BabyPi (Bluetooth)", "sphere", { radius: 0.09, radialSegments: 8 }, v3(1.5, top + 1.0, 0.8), M.led(ECO_COLOURS.blue, 1.8), { behaviors: PULSE(1.1, 120) }));
      break;
    case "pitft": // the 7" screen on a stand, a dashed planned dashboard floating over it
      parts.push(k.part("stand", "piTFT (support)", "box", { width: 1.6, height: 0.5, depth: 0.08 }, v3(0.6, top + 0.3, -0.55), M.dark, { rotationDegrees: [-20, 0, 0] }),
        k.part("screen-frame", "piTFT (écran 7 pouces)", "box", { width: 2.3, height: 1.4, depth: 0.08 }, v3(0.6, top + 0.85, -0.4), M.bezel, { rotationDegrees: [-20, 0, 0] }),
        k.part("screen", "piTFT (affichage)", "box", { width: 2.15, height: 1.25, depth: 0.04 }, v3(0.6, top + 0.86, -0.34), M.screen(ECO_COLOURS.blue), { rotationDegrees: [-20, 0, 0], surface: SCREEN("grid-pulse", ECO_COLOURS.blue) }),
        k.part("planned", "piTFT (tableau de bord prévu)", "box", { width: 2.5, height: 1.6, depth: 0.3 }, v3(0.6, top + 0.9, -0.4), M.cage(ECO_COLOURS.lavender), { rotationDegrees: [-20, 0, 0] }));
      break;
  }
  return parts;
}

function nodeEntities(node: EcoNode, place: EcoPlacement, model: EcoModel | undefined): AgentWorldEntityDefinition[] {
  const id = `eco-${node.id}`;
  const idTag = `${ECO_NODE_PREFIX}${node.id}`;
  const tags = [ECO_TAG, ECO_NODE_TAG, idTag, `eco-kind:${node.kind}`, `${ECO_STATUS_PREFIX}${node.status}`];
  const colour = KIND_COLOUR[node.kind];
  const status = STATUS_COLOUR[node.status];
  const baseY = place.y ?? 0;
  const label = `${node.name} · ${node.subtitle}`;
  const k = kit(id, node);
  const ghost = node.status === "planned" || node.kind === "external";
  const common = { castShadow: false, receiveShadow: false, tags } as const;

  let body: AgentWorldEntityDefinition;
  let parts: AgentWorldEntityDefinition[];
  if (model) {
    // A vendored model: fitted into the placement's largest dimension, centred on its bounds.
    const fitSize = Math.max(place.width, place.height, place.depth);
    const scale = fitSize / Math.max(...model.size, 0.0001);
    const height = model.size[1] * scale;
    body = { id, label, type: "model", asset: { url: model.url, fitSize }, transform: { position: v3(place.x, baseY + height / 2, place.z) }, ...common };
    parts = [];
  } else {
    const bodyMaterial: Material = ghost ? M.ghost(colour)
      : node.kind === "service" ? { color: "#0b1626", roughness: 0.45, metalness: 0.5, emissive: colour, emissiveIntensity: 0.04 }
        : node.kind === "edge" ? M.plank
          : node.kind === "vm" ? M.led(ECO_COLOURS.lavender, 0.5)
            : node.id === "ugbrutal" ? { color: "#0d1420", roughness: 0.1, metalness: 0.3, opacity: 0.3, emissive: "#8fd0ff", emissiveIntensity: 0.03 }
              : node.kind === "client" ? (node.id === "phone" ? M.chip : M.silver)
                : node.kind === "network" ? { color: "#0f1521", roughness: 0.6, metalness: 0.3, opacity: 0.001 } // the Deco pair is all parts; the body is a pick volume
                  : M.metal;
    const geometry = node.id === "ugalien" ? { radius: place.width / 2, height: place.height, radialSegments: 28 }
      : node.id === "ugbrutal" ? { width: 2.2, height: place.height, depth: 4.6 }
        : node.kind === "network" ? { width: place.width, height: place.height, depth: place.depth }
          : { width: place.width, height: place.height, depth: place.depth };
    body = {
      id, label, type: node.id === "ugalien" ? "cylinder" : "box", geometry,
      transform: { position: v3(place.x + (node.id === "ugbrutal" ? -1.9 : 0), baseY + place.height / 2, place.z) },
      material: bodyMaterial, ...common,
    };
    parts = node.kind === "service" ? serviceParts(node, place, k) : machineParts(node, place, k);
  }
  const top = place.height / 2;
  // Underglow in the status colour, so each machine floats on its state from the overview.
  if (!ghost) parts.push(k.part("rim", `${node.name} (halo)`, "box", { width: place.width + 0.4, height: 0.05, depth: place.depth + 0.4 }, v3(node.id === "ugbrutal" ? 1.9 : 0, -top + 0.03, 0),
    { color: status, emissive: status, emissiveIntensity: node.status === "attention" ? 0.6 : 0.3, roughness: 0.4, metalness: 0, opacity: 0.9 }));
  if (node.status === "attention") {
    // An amber beacon over the machine: the open issue, visible from the overview, pulsing.
    parts.push(k.part("beacon", `${node.name} (point ouvert)`, "sphere", { radius: 0.2, radialSegments: 12 }, v3(-1.3, top + 1.5, -1.0), M.led(ECO_COLOURS.amber, 2.4), { behaviors: PULSE(0.8) }),
      k.part("beacon-mast", `${node.name} (mât)`, "cylinder", { radius: 0.02, height: 1.4, radialSegments: 6 }, v3(-1.3, top + 0.75, -1.0), M.led(ECO_COLOURS.amber, 0.8)));
  }
  return [body, ...parts];
}

/** Compose the whole house. One document; nothing in it changes during a tour. */
export function composeEcosystemWorld(options: EcosystemSceneOptions = {}): AgentWorldDefinition {
  const size = ECO_HALF * 2;
  const scenery = (id: string, label: string, type: AgentWorldEntityDefinition["type"], geometry: Geometry, position: Vec3, material: Material, tag = "shelf", extra: Partial<AgentWorldEntityDefinition> = {}): AgentWorldEntityDefinition =>
    ({ id, label, type, geometry, transform: { position }, material, castShadow: false, receiveShadow: false, tags: [ECO_TAG, tag], ...extra });
  const entities: AgentWorldEntityDefinition[] = [
    { id: "eco-ambient", label: "Night ambient", type: "ambient-light", intensity: 1.25, material: { color: "#2a3f6e" }, tags: [ECO_TAG, "lighting"] },
    { id: "eco-key", label: "Moon key", type: "directional-light", intensity: 2.6, transform: { position: [-18, 28, 16] }, material: { color: "#9fc5ff" }, tags: [ECO_TAG, "lighting"] },
    { id: "eco-glow-a", label: "Lavender wash", type: "point-light", intensity: 5, distance: size * 1.4, marker: false, transform: { position: [-size * 0.4, 14, -size * 0.35] }, material: { color: ECO_COLOURS.lavender }, tags: [ECO_TAG, "lighting"] },
    { id: "eco-glow-b", label: "Cyan wash", type: "point-light", intensity: 5, distance: size * 1.4, marker: false, transform: { position: [size * 0.42, 13, size * 0.4] }, material: { color: ECO_COLOURS.cyan }, tags: [ECO_TAG, "lighting"] },
    { id: "eco-glow-c", label: "Teal wash", type: "point-light", intensity: 4, distance: size * 1.2, marker: false, transform: { position: [size * 0.1, 16, -size * 0.5] }, material: { color: ECO_COLOURS.teal }, tags: [ECO_TAG, "lighting"] },
    { id: "eco-lamp-desk", label: "Desk lamp", type: "point-light", intensity: 3, distance: 14, marker: false, transform: { position: [13, 6, 6] }, material: { color: ECO_COLOURS.warm }, tags: [ECO_TAG, "lighting"] },
    { id: "eco-lamp-alien", label: "Alien glow", type: "point-light", intensity: 3, distance: 12, marker: false, transform: { position: [-13, 5, 8] }, material: { color: ECO_COLOURS.cyan }, tags: [ECO_TAG, "lighting"] },
    { id: "eco-lamp-edge", label: "Edge amber", type: "point-light", intensity: 2.5, distance: 16, marker: false, transform: { position: [-4, 5, 17] }, material: { color: ECO_COLOURS.amber }, tags: [ECO_TAG, "lighting"] },
    // The house floor: one slate slab, wooden platforms where the infographic has them, low walls.
    scenery("eco-floor", "La maison · plancher", "box", { width: size + 2, height: 0.3, depth: size + 2 }, v3(0, -0.16, 0), M.slate, "floor"),
    scenery("eco-shelf-services", "Services sur UGFrank · étagère", "box", { width: 34.5, height: 0.22, depth: 4.6 }, v3(0, 0.11, -13), M.wood),
    scenery("eco-shelf-services-lip", "Services · liseré", "box", { width: 34.5, height: 0.06, depth: 0.06 }, v3(0, 0.25, -10.7), M.led(ECO_COLOURS.teal, 0.8)),
    scenery("eco-frank-plinth", "UGFrank · plateau", "box", { width: 10.6, height: 0.26, depth: 6.4 }, v3(2.3, 0.13, -3), M.wood),
    scenery("eco-alien-plinth", "UGAlien · plateau", "box", { width: 6.4, height: 0.26, depth: 7.6 }, v3(-13, 0.13, 4.6), M.wood),
    scenery("eco-brutal-plinth", "UGBrutal · plateau", "box", { width: 8.2, height: 0.26, depth: 6.6 }, v3(12.3, 0.13, 4), M.wood),
    scenery("eco-shelf-edge", "Périphériques en bordure du réseau · étagère", "box", { width: 31.5, height: 0.22, depth: 5.2 }, v3(0, 0.11, 15), M.plank),
    scenery("eco-shelf-edge-lip", "Bordure · liseré", "box", { width: 31.5, height: 0.06, depth: 0.06 }, v3(0, 0.25, 12.4), M.led(ECO_COLOURS.cyan, 0.7)),
    scenery("eco-shelf-spare", "Prévu / sans rôle", "box", { width: 4.8, height: 0.16, depth: 16.4 }, v3(20, 0.08, 2), { color: "#120f22", emissive: ECO_COLOURS.lavender, emissiveIntensity: 0.16, roughness: 0.4, metalness: 0.2, opacity: 0.7 }),
    scenery("eco-shelf-spare-cage", "Prévu / sans rôle (pointillé)", "box", { width: 4.8, height: 0.3, depth: 16.4 }, v3(20, 0.15, 2), { ...M.cage(ECO_COLOURS.lavender), emissiveIntensity: 0.35, opacity: 0.45 }),
    scenery("eco-deco-mat", "Réseau · tapis", "cylinder", { radius: 2.4, height: 0.14, radialSegments: 32 }, v3(-17, 0.07, -4), M.wood),
  ];
  // Low walls with openings, so the plateau reads as a room rather than a slab.
  const wall = (id: string, x: number, z: number, width: number, depth: number): AgentWorldEntityDefinition =>
    scenery(id, "La maison · mur", "box", { width, height: 0.6, depth }, v3(x, 0.3, z), { color: "#0c1119", roughness: 0.85, metalness: 0.05 }, "wall");
  const h = ECO_HALF + 0.6;
  entities.push(
    wall("eco-wall-n", 0, -h, size + 1.4, 0.3), wall("eco-wall-w-a", -h, -8.5, 0.3, 32), wall("eco-wall-e-a", h, -8.5, 0.3, 32),
    wall("eco-wall-s-a", -15.5, h, 18, 0.3), wall("eco-wall-s-b", 15.5, h, 18, 0.3),
    scenery("eco-wall-cap", "La maison · corniche", "box", { width: size + 1.4, height: 0.04, depth: 0.04 }, v3(0, 0.62, -h), M.led(ECO_COLOURS.cyan, 0.35), "wall"),
  );
  // Plants in the corners, grown from the Living Forest genome: the infographic's potted greens.
  if (options.plants !== false) {
    for (const [index, [x, z]] of [[-21.5, -21], [21.5, -21], [-21.5, 21], [16.5, 12]].entries()) {
      entities.push(
        scenery(`eco-pot-${index}`, "Plante (pot)", "cylinder", { radius: 0.7, height: 0.9, radialSegments: 14 }, v3(x, 0.45, z), { color: "#3b2a22", roughness: 0.8, metalness: 0 }, "plant"),
        { id: `eco-plant-${index}`, label: "Plante", type: "dna-tree", transform: { position: v3(x, 0.9, z), scale: [0.42, 0.42, 0.42] },
          dna: { preset: "single-specimen", seed: 7 + index * 13, generation: 1, growSeconds: 0, seasonSeconds: 0 }, tags: [ECO_TAG, "plant"] },
      );
    }
  }
  for (const node of ECOSYSTEM_NODES) {
    const place = ECO_PLACEMENTS[node.id];
    if (!place) throw new Error(`no placement for ${node.id}`);
    entities.push(...nodeEntities(node, place, options.models?.[node.id]));
  }
  if (options.motes !== false) {
    entities.push({
      id: "eco-motes", label: "Data motes", type: "emitter", transform: { position: [0, 6, 0] },
      emitter: { preset: "energy-orb", rate: 8, maxParticles: 70, lifetimeSeconds: 9, speed: 0.3, sizeScale: 0.5, volumeScale: size * 0.8, color: "#8fe8ff", gravity: [0, 0.08, 0], spread: 1.4, seed: 11 },
      tags: [ECO_TAG, "effect"],
    });
  }
  return {
    schema: "graphysx.agent-world/v2",
    id: ECOSYSTEM_WORLD_ID,
    label: options.label ?? `AgentX · La maison connectée · ${ECOSYSTEM_SNAPSHOT_DATE}`,
    environment: {
      background: "#04060d",
      ...(options.sky === false ? {} : { sky: "clearnight" as const }),
      lighting: { source: "studio", intensity: 0.5, yawDegrees: 0, backgroundIntensity: 0.6, backgroundBlur: 0 },
      envelope: { fogNear: size * 1.6, fogFar: size * 4.2, cameraFar: size * 9 },
      post: { bloom: { strength: 0.48, threshold: 0.72, radius: 0.5 } },
      ground: { visible: true, size: size * 1.9, color: "#060a14", grid: true, gridColor: "#143a4d" },
      physics: { gravity: [0, -9.81, 0] },
    },
    entities,
  };
}

/** Ground footprint of a node, for tests (no overlaps) and framing. */
export function ecoFootprint(id: string): { minX: number; maxX: number; minZ: number; maxZ: number; top: number } | null {
  const place = ECO_PLACEMENTS[id];
  if (!place) return null;
  const extraZ = id === "ugalien" ? 1.4 : 0;
  return { minX: place.x - place.width / 2, maxX: place.x + place.width / 2, minZ: place.z - place.depth / 2, maxZ: place.z + place.depth / 2 + extraZ, top: (place.y ?? 0) + place.height };
}
