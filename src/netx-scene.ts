/**
 * The home network as a v2 world document: the neighbourhood around the router.
 *
 * The router's hub stands at the centre. Every device is placed by its address (the last octet
 * around the circle) on the ring of its observation state — online inside, recently seen in the
 * middle, no longer seen outside — so a device that goes quiet drifts outward sweep after sweep
 * and the DHCP ranges read as full or empty arcs. The collectors are lighthouses between the
 * hub and the online ring: a live one sweeps a beam, a silent one is dark. Nameless, vendorless
 * devices no longer seen (randomised MACs, almost surely) line the passages arc past the last
 * ring as faint ghosts, not a building each.
 *
 * What a device looks like is decided by what Data says and nothing more: a body by its
 * recorded type, else a translucent crate; a tint by its vendor family (colour only, never a
 * claim); the state colour under it; an amber beacon when it is new; a dotted cage when nobody
 * named or acknowledged it. Every device is one principal entity whose tags carry its key
 * (`netx-device:<mac>`), the way the house carries `eco-node:<id>`; an agent reads "who is
 * online" with `api.query({ tag: "netx-state:online" })`.
 */
import type { AgentWorldDefinition, AgentWorldEntityDefinition } from "./agent-world-runtime";
import { NETX_COLLECTOR_RADIUS, NETX_HALF, NETX_PASSAGES_ARC, NETX_PASSAGES_RADIUS, NETX_RING, placeCollector, placeDevices, type NetxCollector, type NetxDevice, type NetxFamily, type NetxInventory, type NetxPlacement, type NetxState, type NetxType } from "./netx-data";

export const NETX_WORLD_ID = "agentx-netx";
export const NETX_TAG = "netx";
export const NETX_DEVICE_TAG = "netx-device";
export const NETX_DEVICE_PREFIX = "netx-device:";
export const NETX_COLLECTOR_TAG = "netx-collector";
export const NETX_COLLECTOR_PREFIX = "netx-collector:";
export const NETX_STATE_PREFIX = "netx-state:";
export const NETX_HUB_ID = "netx-hub";
export { NETX_HALF };

export const NETX_COLOURS = {
  cyan: "#4ff2ff", teal: "#35d6b0", amber: "#ffb13b", lavender: "#b48cff", ivory: "#f2ecdc", blue: "#5ea2ff", magenta: "#ff4fd8", warm: "#ffd9a0",
  slate: "#6f86a6", rose: "#ff7a9e", lime: "#b8ff5a", white: "#ffffff",
} as const;
/** Ring colours: the state made visible without a legend. */
export const STATE_COLOUR: Record<NetxState, string> = { online: NETX_COLOURS.cyan, recent: NETX_COLOURS.teal, historical: NETX_COLOURS.slate, never_confirmed: NETX_COLOURS.lavender };
export const STATE_LABEL: Record<NetxState, string> = { online: "En ligne", recent: "Vu récemment", historical: "Plus vu", never_confirmed: "Jamais confirmé" };
export const PASSAGES_LABEL = "Passages";
/** Tints by vendor family. Colour only: a tint never says what a device is. */
export const FAMILY_COLOUR: Record<NetxFamily, string> = {
  pi: NETX_COLOURS.rose, iot: NETX_COLOURS.lime, google: NETX_COLOURS.blue, amazon: NETX_COLOURS.amber, apple: NETX_COLOURS.ivory, samsung: NETX_COLOURS.blue,
  sony: NETX_COLOURS.magenta, microsoft: NETX_COLOURS.teal, pc: NETX_COLOURS.cyan, network: NETX_COLOURS.warm, vr: NETX_COLOURS.lavender, other: NETX_COLOURS.slate, unknown: "#8ea0b8",
};

/** Read the device key an entity stands for, or null for scenery, the hub and the lighthouses. */
export function netxDeviceKeyOf(tags: readonly string[] | undefined): string | null {
  const tag = tags?.find((entry) => entry.startsWith(NETX_DEVICE_PREFIX));
  return tag ? tag.slice(NETX_DEVICE_PREFIX.length) : null;
}
export function netxCollectorIdOf(tags: readonly string[] | undefined): string | null {
  const tag = tags?.find((entry) => entry.startsWith(NETX_COLLECTOR_PREFIX));
  return tag ? tag.slice(NETX_COLLECTOR_PREFIX.length) : null;
}
/** A document-safe id from a device key (a MAC with colons, or `ip:<address>`). */
export const netxEntityId = (key: string): string => `netx-dev-${key.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}`;

export type NetxSceneOptions = { motes?: boolean; sky?: boolean; label?: string };

type Material = AgentWorldEntityDefinition["material"];
type Geometry = AgentWorldEntityDefinition["geometry"];
type Vec3 = [number, number, number];
const round = (value: number): number => Math.round(value * 1000) / 1000;
const v3 = (x: number, y: number, z: number): Vec3 => [round(x), round(y), round(z)];

const M = {
  metal: { color: "#171c26", roughness: 0.32, metalness: 0.78 } as Material,
  bezel: { color: "#2a3344", roughness: 0.55, metalness: 0.35 } as Material,
  dark: { color: "#0c1018", roughness: 0.5, metalness: 0.5 } as Material,
  white: { color: "#e9eef4", roughness: 0.45, metalness: 0.05, emissive: "#8fd0ff", emissiveIntensity: 0.04 } as Material,
  silver: { color: "#aeb8c6", roughness: 0.3, metalness: 0.9 } as Material,
  pcb: { color: "#2f8a4c", roughness: 0.6, metalness: 0.1, texture: { id: "electronic-board", repeat: [1, 1] } } as Material,
  slate: { color: "#131a28", roughness: 0.78, metalness: 0.12, texture: { id: "concrete", repeat: [10, 10] } } as Material,
  led: (colour: string, intensity = 1.4): Material => ({ color: colour, emissive: colour, emissiveIntensity: intensity, roughness: 0.3, metalness: 0 }),
  screen: (tint: string): Material => ({ color: "#07101c", emissive: tint, emissiveIntensity: 0.5, roughness: 0.2, metalness: 0.1 }),
  tinted: (tint: string): Material => ({ color: "#121a2a", roughness: 0.4, metalness: 0.5, emissive: tint, emissiveIntensity: 0.12 }),
  cage: (colour: string): Material => ({ color: colour, emissive: colour, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0, wireframe: true, opacity: 0.8 }),
  crate: (colour: string): Material => ({ color: colour, emissive: colour, emissiveIntensity: 0.18, roughness: 0.15, metalness: 0.1, opacity: 0.32 }),
  ghost: (colour: string): Material => ({ color: colour, emissive: colour, emissiveIntensity: 0.2, roughness: 0.3, metalness: 0, opacity: 0.14 }),
};
const SPIN = (speedDegrees: number): AgentWorldEntityDefinition["behaviors"] => [{ type: "spin", axis: "y", speedDegrees }];
const PULSE = (frequencyHz: number, phaseDegrees = 0): AgentWorldEntityDefinition["behaviors"] => [{ type: "pulse", minimumScale: 0.85, maximumScale: 1.15, frequencyHz, phaseDegrees }];

/** Footprint of each body, so the halo, the cage and the labels know the size. */
export const BODY_SIZE: Record<NetxType | "unknown" | "transient", Vec3> = {
  computer: [0.9, 1.5, 0.5], server: [1.5, 0.5, 1.0], "phone-tablet": [0.55, 1.1, 0.12], iot: [0.9, 0.4, 0.9], network: [1.3, 0.35, 0.9],
  media: [1.2, 0.4, 0.9], printer: [1.2, 0.9, 1.0], other: [0.9, 0.9, 0.9], unknown: [0.95, 0.95, 0.95], transient: [0.5, 0.5, 0.5],
};
export const bodyKind = (device: NetxDevice): NetxType | "unknown" | "transient" => (device.transient ? "transient" : device.type ?? "unknown");

/** Builder of the parts under one principal entity. Positions are relative to the body's centre. */
function kit(id: string, label: string, tags: readonly string[]) {
  let count = 0;
  const part = (suffix: string, what: string, type: AgentWorldEntityDefinition["type"], geometry: Geometry, position: Vec3, material: Material,
    extra: Partial<Pick<AgentWorldEntityDefinition, "behaviors" | "surface">> & { rotationDegrees?: Vec3 } = {}): AgentWorldEntityDefinition => ({
    id: `${id}-${suffix}`, label: `${label} (${what})`, type, parentId: id, geometry,
    transform: { position, ...(extra.rotationDegrees ? { rotationDegrees: extra.rotationDegrees } : {}) },
    material, castShadow: false, receiveShadow: false, tags: [...tags],
    ...(extra.behaviors ? { behaviors: extra.behaviors } : {}), ...(extra.surface ? { surface: extra.surface } : {}),
  });
  const next = (prefix: string): string => `${prefix}-${count++}`;
  return { part, next };
}

/** The parts that make a typed body recognisable; the body itself is the principal entity. */
function bodyParts(device: NetxDevice, tint: string, k: ReturnType<typeof kit>): AgentWorldEntityDefinition[] {
  const [w, h, d] = BODY_SIZE[bodyKind(device)];
  const top = h / 2, front = d / 2;
  switch (bodyKind(device)) {
    case "computer": return [
      k.part("stripe", "voyant", "box", { width: 0.08, height: h - 0.5, depth: 0.05 }, v3(w / 2 - 0.2, 0.1, front + 0.02), M.led(tint, 1.1)),
      k.part("vent", "aération", "box", { width: w - 0.3, height: 0.05, depth: 0.05 }, v3(0, top - 0.25, front + 0.02), M.dark),
    ];
    case "server": return [
      ...[0, 1, 2, 3].map((i) => k.part(`led-${i}`, "voyant", "sphere", { radius: 0.05, radialSegments: 8 }, v3(-w / 2 + 0.25 + i * 0.3, 0.1, front + 0.03), M.led(i === 3 ? NETX_COLOURS.amber : tint, 1.8))),
      k.part("tray", "baie", "box", { width: w - 0.3, height: 0.18, depth: 0.06 }, v3(0.05, -0.1, front + 0.02), M.metal),
    ];
    case "phone-tablet": return [k.part("screen", "écran", "box", { width: w - 0.1, height: h - 0.16, depth: 0.03 }, v3(0, 0, front + 0.01), M.screen(tint))];
    case "iot": return [
      k.part("led", "voyant", "sphere", { radius: 0.07, radialSegments: 8 }, v3(0, top + 0.05, 0), M.led(tint, 2), { behaviors: PULSE(0.9) }),
      k.part("board", "carte", "cylinder", { radius: w / 2 - 0.08, height: 0.05, radialSegments: 20 }, v3(0, top + 0.01, 0), M.pcb),
    ];
    case "network": return [
      ...[-0.4, 0.4].map((x, i) => k.part(`antenna-${i}`, "antenne", "cylinder", { radius: 0.03, height: 0.9, radialSegments: 6 }, v3(x, top + 0.45, -front + 0.15), M.silver)),
      ...[0, 1, 2].map((i) => k.part(`port-${i}`, "voyant", "sphere", { radius: 0.045, radialSegments: 8 }, v3(-0.3 + i * 0.3, 0, front + 0.03), M.led(tint, 1.6))),
    ];
    case "media": return [
      k.part("front", "façade", "box", { width: w - 0.2, height: h - 0.15, depth: 0.04 }, v3(0, 0, front + 0.01), M.screen(tint)),
      k.part("eye", "voyant", "sphere", { radius: 0.05, radialSegments: 8 }, v3(w / 2 - 0.2, 0, front + 0.05), M.led(tint, 1.8)),
    ];
    case "printer": return [
      k.part("paper", "papier", "box", { width: w - 0.4, height: 0.04, depth: d - 0.5 }, v3(0, top + 0.03, 0.1), { color: "#f4f6fb", roughness: 0.6, metalness: 0 }),
      k.part("panel", "panneau", "box", { width: 0.4, height: 0.2, depth: 0.04 }, v3(0.3, 0.1, front + 0.02), M.screen(tint)),
    ];
    case "other": return [k.part("mark", "marque", "box", { width: w - 0.3, height: 0.06, depth: 0.06 }, v3(0, top - 0.15, front + 0.02), M.led(tint, 1))];
    case "unknown": return [
      // A translucent crate with a question: a dark bead floating inside, the way an unknown reads from afar.
      k.part("cage", "à identifier", "box", { width: w + 0.04, height: h + 0.04, depth: d + 0.04 }, v3(0, 0, 0), M.cage(tint)),
      k.part("bead", "inconnu", "sphere", { radius: 0.16, radialSegments: 12 }, v3(0, 0.05, 0), M.led(tint, 0.8), { behaviors: PULSE(0.5) }),
    ];
    case "transient": return [];
  }
}

function deviceEntities(device: NetxDevice, place: NetxPlacement): AgentWorldEntityDefinition[] {
  const id = netxEntityId(device.key);
  const kind = bodyKind(device);
  const [w, h, d] = BODY_SIZE[kind];
  const tint = FAMILY_COLOUR[device.family];
  const state = STATE_COLOUR[device.state];
  const tags = [NETX_TAG, NETX_DEVICE_TAG, `${NETX_DEVICE_PREFIX}${device.key}`, `${NETX_STATE_PREFIX}${device.state}`, `netx-type:${device.type ?? "unknown"}`, `netx-family:${device.family}`,
    `netx-known:${device.known}`, ...(device.source ? [`netx-source:${device.source}`] : []), ...(device.isNew ? ["netx-new"] : []), ...(device.transient ? ["netx-transient"] : [])];
  const label = device.name === device.ip && device.vendor ? `${device.vendor} · ${device.ip}` : `${device.name}${device.ip && device.name !== device.ip ? ` · ${device.ip}` : ""}`;
  const k = kit(id, device.name, tags.filter((tag) => tag !== NETX_DEVICE_TAG));
  // Bodies face the hub: rotate by the placement angle so fronts look inward.
  const yaw = -(place.angle * 180 / Math.PI) + 90;
  const body: AgentWorldEntityDefinition = {
    id, label, type: kind === "iot" ? "cylinder" : "box",
    geometry: kind === "iot" ? { radius: w / 2, height: h, radialSegments: 20 } : { width: w, height: h, depth: d },
    transform: { position: v3(place.x, h / 2, place.z), rotationDegrees: [0, round(yaw), 0] },
    material: kind === "transient" ? M.ghost(tint) : kind === "unknown" ? M.crate(tint) : kind === "phone-tablet" ? M.dark : kind === "iot" ? M.white : M.tinted(tint),
    castShadow: false, receiveShadow: false, tags,
  };
  if (kind === "transient") return [body];
  const parts = bodyParts(device, tint, k);
  // Underglow in the state colour, so each device floats on its state from the overview.
  parts.push(k.part("rim", "halo", "box", { width: w + 0.4, height: 0.05, depth: d + 0.4 }, v3(0, -h / 2 + 0.03, 0),
    { color: state, emissive: state, emissiveIntensity: device.state === "online" ? 0.45 : 0.25, roughness: 0.4, metalness: 0, opacity: 0.9 }));
  // Nobody named or acknowledged it: a dotted cage, the house's "à confirmer".
  if (!device.known && kind !== "unknown") parts.push(k.part("cage", "non reconnu", "box", { width: w + 0.3, height: h + 0.3, depth: d + 0.3 }, v3(0, 0, 0), { ...M.cage(NETX_COLOURS.lavender), emissiveIntensity: 0.5, opacity: 0.55 }));
  if (device.isNew) parts.push(
    k.part("beacon", "nouveau", "sphere", { radius: 0.16, radialSegments: 12 }, v3(0, h / 2 + 1.2, 0), M.led(NETX_COLOURS.amber, 2.4), { behaviors: PULSE(0.8) }),
    k.part("mast", "mât", "cylinder", { radius: 0.02, height: 1.1, radialSegments: 6 }, v3(0, h / 2 + 0.6, 0), M.led(NETX_COLOURS.amber, 0.8)),
  );
  return [body, ...parts];
}

/** A lighthouse: lit and sweeping when the collector reports, dark when it is silent. */
function collectorEntities(collector: NetxCollector, index: number): AgentWorldEntityDefinition[] {
  const id = `netx-col-${collector.id.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}`;
  const { x, z } = placeCollector(collector, index);
  const tags = [NETX_TAG, NETX_COLLECTOR_TAG, `${NETX_COLLECTOR_PREFIX}${collector.id}`, `netx-collector-active:${collector.active}`];
  const name = collector.hostname ?? collector.id;
  const k = kit(id, name, tags.filter((tag) => tag !== NETX_COLLECTOR_TAG));
  const height = 2.4;
  const colour = collector.active ? NETX_COLOURS.cyan : NETX_COLOURS.slate;
  const body: AgentWorldEntityDefinition = {
    id, label: `${name} · collecteur${collector.active ? "" : " silencieux"}`, type: "cylinder", geometry: { radius: 0.32, height, radialSegments: 12 },
    transform: { position: v3(x, height / 2, z) }, material: collector.active ? M.silver : M.dark, castShadow: false, receiveShadow: false, tags,
  };
  const parts = [
    k.part("base", "socle", "cylinder", { radius: 0.6, height: 0.16, radialSegments: 16 }, v3(0, -height / 2 + 0.08, 0), M.bezel),
    k.part("lamp", "lampe", "sphere", { radius: 0.3, radialSegments: 14 }, v3(0, height / 2 + 0.25, 0), collector.active ? M.led(colour, 2.2) : { ...M.dark, emissive: colour, emissiveIntensity: 0.12 }, collector.active ? { behaviors: PULSE(0.6) } : {}),
    k.part("rim", "halo", "cylinder", { radius: 0.8, height: 0.05, radialSegments: 20 }, v3(0, -height / 2 + 0.03, 0), { color: colour, emissive: colour, emissiveIntensity: collector.active ? 0.5 : 0.15, roughness: 0.4, metalness: 0, opacity: 0.9 }),
  ];
  if (collector.active) parts.push(k.part("beam", "faisceau", "box", { width: 9, height: 0.06, depth: 0.22 }, v3(0, height / 2 + 0.25, 0), { ...M.led(colour, 1.2), opacity: 0.45 }, { behaviors: SPIN(36) }));
  return [body, ...parts];
}

/** The hub at the centre: the network itself, drawn like the Deco pair of the house. */
function hubEntities(cidr: string | null): AgentWorldEntityDefinition[] {
  const id = NETX_HUB_ID;
  const tags = [NETX_TAG, "netx-hub"];
  const label = `Réseau · ${cidr ?? "LAN"}`;
  const k = kit(id, "Réseau", tags);
  const height = 1.8;
  return [
    { id, label, type: "cylinder", geometry: { radius: 1.9, height: 0.3, radialSegments: 32 }, transform: { position: v3(0, 0.15, 0) }, material: { color: "#0f1521", roughness: 0.6, metalness: 0.3, emissive: NETX_COLOURS.cyan, emissiveIntensity: 0.08 }, castShadow: false, receiveShadow: false, tags },
    ...[-0.9, 0.9].map((x, i) => k.part(`base-${i}`, `borne ${i + 1}`, "cylinder", { radius: 0.62, height: height - 0.3, radialSegments: 28 }, v3(x, 0.15 + (height - 0.3) / 2, 0), M.white)),
    ...[-0.9, 0.9].map((x, i) => k.part(`cap-${i}`, "dessus", "cylinder", { radius: 0.5, height: 0.14, radialSegments: 28 }, v3(x, height - 0.05, 0), M.white)),
    ...[-0.9, 0.9].map((x, i) => k.part(`glow-${i}`, "anneau", "torus", { radius: 0.45, tube: 0.03, radialSegments: 8 }, v3(x, height + 0.03, 0), M.led(NETX_COLOURS.cyan, 1.4), { rotationDegrees: [90, 0, 0], behaviors: PULSE(0.5, i * 90) })),
    ...[0.35, 0.6, 0.85].map((r, i) => k.part(`wifi-${i}`, "Wi-Fi", "torus", { radius: r, tube: 0.025, radialSegments: 8 }, v3(0, height + 0.6, 0), M.led(NETX_COLOURS.cyan, 0.9 - i * 0.2))),
  ];
}

/** Compose the whole neighbourhood. One document; nothing in it changes while the visitor looks. */
export function composeNetxWorld(inventory: NetxInventory, options: NetxSceneOptions = {}): AgentWorldDefinition {
  const size = NETX_HALF * 2;
  const scenery = (id: string, label: string, type: AgentWorldEntityDefinition["type"], geometry: Geometry, position: Vec3, material: Material, tag = "ground", extra: Partial<AgentWorldEntityDefinition> = {}): AgentWorldEntityDefinition =>
    ({ id, label, type, geometry, transform: { position }, material, castShadow: false, receiveShadow: false, tags: [NETX_TAG, tag], ...extra });
  const entities: AgentWorldEntityDefinition[] = [
    { id: "netx-ambient", label: "Night ambient", type: "ambient-light", intensity: 1.2, material: { color: "#2a3f6e" }, tags: [NETX_TAG, "lighting"] },
    { id: "netx-key", label: "Moon key", type: "directional-light", intensity: 2.4, transform: { position: [-18, 30, 16] }, material: { color: "#9fc5ff" }, tags: [NETX_TAG, "lighting"] },
    { id: "netx-glow-a", label: "Cyan wash", type: "point-light", intensity: 5, distance: size * 1.3, marker: false, transform: { position: [0, 12, 0] }, material: { color: NETX_COLOURS.cyan }, tags: [NETX_TAG, "lighting"] },
    { id: "netx-glow-b", label: "Lavender wash", type: "point-light", intensity: 4, distance: size * 1.4, marker: false, transform: { position: [-size * 0.4, 14, size * 0.35] }, material: { color: NETX_COLOURS.lavender }, tags: [NETX_TAG, "lighting"] },
    { id: "netx-glow-c", label: "Teal wash", type: "point-light", intensity: 4, distance: size * 1.4, marker: false, transform: { position: [size * 0.42, 13, -size * 0.4] }, material: { color: NETX_COLOURS.teal }, tags: [NETX_TAG, "lighting"] },
    // The ground: one slate disc, and a rail per ring in the state colour.
    scenery("netx-floor", "Le quartier · sol", "cylinder", { radius: NETX_HALF + 1.5, height: 0.3, radialSegments: 64 }, v3(0, -0.16, 0), M.slate, "floor"),
  ];
  for (const state of ["online", "recent", "historical"] as const) {
    const radius = NETX_RING[state];
    entities.push(
      scenery(`netx-ring-${state}`, `${STATE_LABEL[state]} · anneau`, "torus", { radius, tube: 0.06, radialSegments: 8 }, v3(0, 0.04, 0), M.led(STATE_COLOUR[state], state === "online" ? 0.9 : 0.5), "ring", { transform: { position: v3(0, 0.04, 0), rotationDegrees: [90, 0, 0] } }),
      scenery(`netx-band-${state}`, `${STATE_LABEL[state]} · bande`, "torus", { radius, tube: 0.9, radialSegments: 3 }, v3(0, -0.85, 0), { color: STATE_COLOUR[state], emissive: STATE_COLOUR[state], emissiveIntensity: 0.1, roughness: 0.8, metalness: 0, opacity: 0.35 }, "ring", { transform: { position: v3(0, -0.85, 0), rotationDegrees: [90, 0, 0] } }),
    );
  }
  // The passages arc: a dim dashed-looking rail (a wireframe torus) over the sector the ghosts line.
  const arcMid = (NETX_PASSAGES_ARC[0] + NETX_PASSAGES_ARC[1]) / 2;
  entities.push(scenery("netx-passages-pad", `${PASSAGES_LABEL} · bordure`, "box", { width: 0.12, height: 0.12, depth: 9 }, v3(Math.cos(arcMid) * (NETX_PASSAGES_RADIUS + 1.2), 0.06, Math.sin(arcMid) * (NETX_PASSAGES_RADIUS + 1.2)), M.cage(NETX_COLOURS.slate), "ring", { transform: { position: v3(Math.cos(arcMid) * (NETX_PASSAGES_RADIUS + 1.2), 0.06, Math.sin(arcMid) * (NETX_PASSAGES_RADIUS + 1.2)), rotationDegrees: [0, round(-(arcMid * 180 / Math.PI) + 90), 0] } }));
  // The lighthouses' inner ring, faint.
  entities.push(scenery("netx-ring-collectors", "Collecteurs · anneau", "torus", { radius: NETX_COLLECTOR_RADIUS, tube: 0.03, radialSegments: 6 }, v3(0, 0.03, 0), M.led(NETX_COLOURS.ivory, 0.25), "ring", { transform: { position: v3(0, 0.03, 0), rotationDegrees: [90, 0, 0] } }));

  entities.push(...hubEntities(inventory.collectors.find((collector) => collector.cidr)?.cidr ?? null));
  inventory.collectors.forEach((collector, index) => entities.push(...collectorEntities(collector, index)));
  const placements = new Map(placeDevices(inventory.devices).map((placement) => [placement.key, placement]));
  for (const device of inventory.devices) {
    const place = placements.get(device.key);
    if (!place) throw new Error(`no placement for ${device.key}`);
    entities.push(...deviceEntities(device, place));
  }
  if (options.motes !== false) {
    entities.push({
      id: "netx-motes", label: "Packets", type: "emitter", transform: { position: [0, 5, 0] },
      emitter: { preset: "energy-orb", rate: 8, maxParticles: 70, lifetimeSeconds: 9, speed: 0.3, sizeScale: 0.5, volumeScale: size * 0.7, color: "#8fe8ff", gravity: [0, 0.08, 0], spread: 1.4, seed: 23 },
      tags: [NETX_TAG, "effect"],
    });
  }
  return {
    schema: "graphysx.agent-world/v2",
    id: NETX_WORLD_ID,
    label: options.label ?? `AgentX · Le réseau de la maison · ${inventory.referenceTime.slice(0, 10)}`,
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
