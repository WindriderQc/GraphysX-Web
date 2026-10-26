/**
 * NetX — the home network as data.
 *
 * AgentX Data publishes the LAN inventory its native collectors feed (`network/devices`), the
 * collectors themselves (`network/agents`) and whether Data could scan on its own
 * (`network/capability`). This module turns those three bodies — live or from the synthetic
 * fixture — into one `NetxInventory`: devices with a stable key, an observation state, a
 * vendor family and a deterministic place around the router; collectors with their
 * liveness; a freshness sentence in Data's own words.
 *
 * Two rules come from Data and are reproduced here so the fixture and the live feed read the
 * same way (`data/services/networkObservation.js`, `core/src/services/networkInventory.js`):
 * - the raw `status: "online"` flag never turns off by itself, so the state is derived from the
 *   age of `lastSeen`: `online` (≤ online window, reported online), `recent` (≤ 24 h),
 *   `historical`, `never_confirmed`;
 * - a device is "known" when it carries an alias or a `knownAt` mark — the same reading the
 *   Toolbox and the new-device alert use.
 *
 * Pure: no DOM, no three.js. `netx-scene.ts` turns it into a world, `netx-app.ts` shows it.
 */

export type NetxState = "online" | "recent" | "historical" | "never_confirmed";
export const NETX_STATES: readonly NetxState[] = ["online", "recent", "historical", "never_confirmed"];

/** The Toolbox's fixed list; anything else Data stores (seen: `3d-printer-controller`) is kept as `typeRaw` and drawn as `other`. */
export type NetxType = "computer" | "server" | "phone-tablet" | "iot" | "network" | "media" | "printer" | "other";
export const NETX_TYPES: readonly NetxType[] = ["computer", "server", "phone-tablet", "iot", "network", "media", "printer", "other"];
export const NETX_TYPE_LABEL: Record<NetxType, string> = {
  computer: "Ordinateur", server: "Serveur", "phone-tablet": "Téléphone ou tablette", iot: "Objet connecté",
  network: "Équipement réseau", media: "Média", printer: "Imprimante", other: "Autre",
};

/** Vendor families, for colour only: a family never decides what the device is. */
export type NetxFamily = "pi" | "iot" | "google" | "amazon" | "apple" | "samsung" | "sony" | "microsoft" | "pc" | "network" | "vr" | "other" | "unknown";
const FAMILY_RULES: readonly [RegExp, NetxFamily][] = [
  [/raspberry/i, "pi"], [/espressif|tuya|shelly|sonoff|itead/i, "iot"], [/google/i, "google"], [/amazon/i, "amazon"], [/apple/i, "apple"],
  [/samsung/i, "samsung"], [/sony/i, "sony"], [/microsoft/i, "microsoft"], [/oculus|meta platforms/i, "vr"],
  [/tp-?link|netgear|ubiquiti|cisco|d-link|zyxel|mikrotik|aruba/i, "network"],
  [/dell|hewlett|\bhp\b|asus|intel|lenovo|gigabyte|msi|acer|wistron|compal|quanta|fugui|foxconn|liteon|azurewave|realtek/i, "pc"],
];
export function vendorFamily(vendor: string | null | undefined): NetxFamily {
  const text = String(vendor ?? "").trim();
  if (!text) return "unknown";
  for (const [pattern, family] of FAMILY_RULES) if (pattern.test(text)) return family;
  return "other";
}

/** The Toolbox's five filters, in its words. */
export type NetxFilter = "all" | "unnamed" | "online" | "new" | "unacknowledged";
export const NETX_FILTERS: readonly { id: NetxFilter; label: string }[] = [
  { id: "all", label: "Tous" }, { id: "unnamed", label: "Sans nom" }, { id: "online", label: "En ligne" },
  { id: "new", label: "Nouveaux (24 h)" }, { id: "unacknowledged", label: "Non reconnus" },
];

export const DEFAULT_SWEEP_INTERVAL_MS = 15 * 60 * 1000;
export const DEFAULT_ONLINE_TTL_MS = 2 * DEFAULT_SWEEP_INTERVAL_MS;
export const DEFAULT_RECENT_TTL_MS = 24 * 60 * 60 * 1000;
export const NEW_WINDOW_MS = 24 * 60 * 60 * 1000;
/** A collector whose heartbeat is older than this is silent (Data's ACTIVE_WINDOW_MS). */
export const COLLECTOR_ACTIVE_MS = 90 * 1000;

export type NetxRules = { onlineTtlMs: number; recentTtlMs: number };

/** A device row as Data publishes it (fields optional: a collector sees what it sees). */
export type NetxDeviceRecord = {
  _id?: unknown; ip?: unknown; mac?: unknown; vendor?: unknown; hostname?: unknown; alias?: unknown; notes?: unknown; location?: unknown;
  status?: unknown; online?: unknown; lastSeen?: unknown; firstSeen?: unknown; knownAt?: unknown; scanSource?: unknown; lastScanAt?: unknown;
  hardware?: { type?: unknown; os?: unknown } | null; openPorts?: unknown;
  observation?: { state?: unknown; lastSeenAt?: unknown; ageMs?: unknown; source?: unknown } | null;
};
export type NetxScannerRecord = {
  scannerId?: unknown; id?: unknown; hostname?: unknown; ip?: unknown; platform?: unknown; cidr?: unknown; agentVersion?: unknown;
  firstSeen?: unknown; lastSeen?: unknown; lastScanAt?: unknown; active?: unknown; capabilities?: { nmap?: unknown; privileged?: unknown } | null;
};
export type NetxDevicesBody = { devices?: unknown; summary?: { referenceTime?: unknown; onlineTtlMs?: unknown; recentTtlMs?: unknown } | null };
export type NetxAgentsBody = { scanners?: unknown; active?: unknown };
export type NetxCapabilityBody = { nmap?: unknown };

export type NetxPort = { port: number; protocol: string; service: string };
export type NetxDevice = {
  /** The MAC when Data has one, else `ip:<address>`: the way the Toolbox addresses a device. */
  key: string;
  ip: string;
  mac: string | null;
  vendor: string | null;
  family: NetxFamily;
  hostname: string | null;
  alias: string | null;
  /** What to call it: alias, then hostname, then the address. */
  name: string;
  type: NetxType | null;
  typeRaw: string | null;
  os: string | null;
  openPorts: NetxPort[];
  location: string | null;
  notes: string | null;
  known: boolean;
  state: NetxState;
  /** True when Data classified it; false when this module derived the state itself. */
  stateFromData: boolean;
  lastSeen: string | null;
  firstSeen: string | null;
  ageMs: number | null;
  source: string | null;
  isNew: boolean;
  /** No name, no vendor, no longer seen: almost surely a randomised MAC that never returns. */
  transient: boolean;
  /** Last octet of the IPv4 address, or null when the address is not one. */
  octet: number | null;
};
export type NetxCollector = {
  id: string; hostname: string | null; ip: string | null; platform: string | null; cidr: string | null; version: string | null;
  privileged: boolean | null; firstSeen: string | null; lastSeen: string | null; lastScanAt: string | null; active: boolean; octet: number | null;
};
export type NetxFreshness = { stale: boolean; text: string; lastScanAt: string | null };
export type NetxCounts = Record<NetxState, number> & { total: number; known: number; unnamed: number; new: number; unacknowledged: number; transient: number };
export type NetxInventory = {
  referenceTime: string;
  rules: NetxRules;
  devices: NetxDevice[];
  collectors: NetxCollector[];
  activeCollectors: number;
  /** Whether Data itself can run nmap; false in production, where the native collectors scan. */
  dataCanScan: boolean | null;
  freshness: NetxFreshness;
  counts: NetxCounts;
};

const MAC_PATTERN = /^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/;
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export const text = (value: unknown, max = 160): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
};
const timeOf = (value: unknown): number | null => {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
};
const isoOf = (value: unknown): string | null => { const ms = timeOf(value); return ms === null ? null : new Date(ms).toISOString(); };
export const normalizeMac = (value: unknown): string | null => {
  const mac = String(value ?? "").trim().toUpperCase().replace(/-/g, ":");
  return MAC_PATTERN.test(mac) ? mac : null;
};
export const isIPv4 = (value: unknown): value is string => typeof value === "string" && IPV4.test(value) && value.split(".").every((octet) => Number(octet) <= 255);
export const lastOctet = (ip: unknown): number | null => (isIPv4(ip) ? Number(ip.split(".")[3]) : null);
/** An address as one number so .9 sorts before .10; anything else sorts last. */
export const ipKey = (ip: unknown): number => (isIPv4(ip) ? ip.split(".").reduce((sum, octet) => sum * 256 + Number(octet), 0) : Number.POSITIVE_INFINITY);

export function readRules(summary: NetxDevicesBody["summary"]): NetxRules {
  const online = Number(summary?.onlineTtlMs);
  const recent = Number(summary?.recentTtlMs);
  const onlineTtlMs = Number.isFinite(online) && online > 0 ? online : DEFAULT_ONLINE_TTL_MS;
  const recentTtlMs = Math.max(Number.isFinite(recent) && recent > 0 ? recent : DEFAULT_RECENT_TTL_MS, onlineTtlMs);
  return { onlineTtlMs, recentTtlMs };
}

/** Data's classification, reproduced: age of `lastSeen` against the windows, never the raw flag alone. */
export function classifyDevice(record: NetxDeviceRecord, nowMs: number, rules: NetxRules): { state: NetxState; ageMs: number | null } {
  const lastSeenMs = timeOf(record.lastSeen);
  const ageMs = lastSeenMs === null ? null : Math.max(0, nowMs - lastSeenMs);
  const reportedOnline = record.status === "online" || record.online === true;
  if (ageMs === null) return { state: "never_confirmed", ageMs };
  if (reportedOnline && ageMs <= rules.onlineTtlMs) return { state: "online", ageMs };
  if (ageMs <= rules.recentTtlMs) return { state: "recent", ageMs };
  return { state: "historical", ageMs };
}

export function normaliseDevice(record: NetxDeviceRecord, nowMs: number, rules: NetxRules): NetxDevice | null {
  const ip = isIPv4(record.ip) ? record.ip : null;
  const mac = normalizeMac(record.mac);
  if (!ip && !mac) return null;
  const alias = text(record.alias, 80);
  const hostname = text(record.hostname, 120);
  const vendor = text(record.vendor, 120);
  const given = record.observation?.state;
  const fromData = typeof given === "string" && (NETX_STATES as readonly string[]).includes(given);
  const derived = classifyDevice(record, nowMs, rules);
  const state = fromData ? (given as NetxState) : derived.state;
  const ageMs = fromData && Number.isFinite(Number(record.observation?.ageMs)) ? Math.max(0, Number(record.observation?.ageMs)) : derived.ageMs;
  const typeRaw = text(record.hardware?.type, 40);
  const firstSeen = isoOf(record.firstSeen);
  const known = Boolean(alias || record.knownAt);
  const ports = Array.isArray(record.openPorts) ? record.openPorts : [];
  return {
    key: mac ?? `ip:${ip}`,
    ip: ip ?? "",
    mac, vendor, family: vendorFamily(vendor), hostname, alias,
    name: alias ?? hostname ?? ip ?? mac ?? "?",
    type: typeRaw && (NETX_TYPES as readonly string[]).includes(typeRaw) ? (typeRaw as NetxType) : null,
    typeRaw,
    os: text(record.hardware?.os, 120),
    openPorts: ports.flatMap((entry) => {
      const port = Number((entry as { port?: unknown })?.port);
      return Number.isInteger(port) && port > 0 && port < 65536
        ? [{ port, protocol: text((entry as { protocol?: unknown }).protocol, 8) ?? "tcp", service: text((entry as { service?: unknown }).service, 40) ?? "unknown" }] : [];
    }),
    location: text(record.location, 80),
    notes: text(record.notes, 500),
    known,
    state, stateFromData: fromData,
    lastSeen: isoOf(record.observation?.lastSeenAt) ?? isoOf(record.lastSeen),
    firstSeen,
    ageMs,
    source: text(record.observation?.source) ?? text(record.scanSource),
    isNew: firstSeen !== null && nowMs - new Date(firstSeen).getTime() < NEW_WINDOW_MS,
    transient: !alias && !hostname && !vendor && !known && (state === "historical" || state === "never_confirmed"),
    octet: lastOctet(ip),
  };
}

export function normaliseCollector(record: NetxScannerRecord, nowMs: number): NetxCollector | null {
  const id = text(record.scannerId, 60) ?? text(record.id, 60);
  if (!id) return null;
  const lastSeenMs = timeOf(record.lastSeen);
  const active = typeof record.active === "boolean" ? record.active : lastSeenMs !== null && nowMs - lastSeenMs <= COLLECTOR_ACTIVE_MS;
  const ip = isIPv4(record.ip) ? record.ip : null;
  return {
    id, hostname: text(record.hostname, 80), ip, platform: text(record.platform, 20), cidr: text(record.cidr, 40), version: text(record.agentVersion, 20),
    privileged: typeof record.capabilities?.privileged === "boolean" ? record.capabilities.privileged : null,
    firstSeen: isoOf(record.firstSeen), lastSeen: isoOf(record.lastSeen), lastScanAt: isoOf(record.lastScanAt), active, octet: lastOctet(ip),
  };
}

/** Age in Nestor's words (`networkInventory.js`). */
export function ageLabel(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} jours`;
}

/** The same three sentences Nestor says, so the HUD and the assistant never disagree. */
export function freshnessOf(collectors: readonly NetxCollector[], rules: NetxRules, nowMs: number): NetxFreshness {
  const lastScanMs = collectors.map((collector) => timeOf(collector.lastScanAt)).filter((ms): ms is number => ms !== null).sort((a, b) => b - a)[0] ?? null;
  if (lastScanMs === null) return { stale: true, text: "Aucun scan réseau connu : l'inventaire ne dit pas ce qui est branché maintenant.", lastScanAt: null };
  const lastScanAt = new Date(lastScanMs).toISOString();
  const age = nowMs - lastScanMs;
  if (age > rules.onlineTtlMs) return { stale: true, text: `Inventaire périmé : dernier scan il y a ${ageLabel(age)}. Ce qui est listé n'est pas confirmé maintenant.`, lastScanAt };
  return { stale: false, text: `Dernier scan il y a ${ageLabel(age)}.`, lastScanAt };
}

export function passesFilter(device: NetxDevice, filter: NetxFilter): boolean {
  switch (filter) {
    case "unnamed": return !device.alias;
    case "online": return device.state === "online";
    case "new": return device.isNew;
    case "unacknowledged": return !device.known;
    default: return true;
  }
}

/** Case-insensitive match on what the Toolbox searches: name, hostname, address, MAC in its three spellings, vendor, type, location. */
export function matchesSearch(device: NetxDevice, term: string): boolean {
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  const mac = (device.mac ?? "").toLowerCase();
  const haystack = [device.alias, device.hostname, device.ip, mac, mac.replace(/:/g, ""), mac.replace(/:/g, "-"), device.vendor, device.typeRaw,
    device.type ? NETX_TYPE_LABEL[device.type] : null, device.location, device.source];
  return haystack.some((value) => String(value ?? "").toLowerCase().includes(needle));
}

export function countDevices(devices: readonly NetxDevice[]): NetxCounts {
  const counts: NetxCounts = { online: 0, recent: 0, historical: 0, never_confirmed: 0, total: devices.length, known: 0, unnamed: 0, new: 0, unacknowledged: 0, transient: 0 };
  for (const device of devices) {
    counts[device.state] += 1;
    if (device.known) counts.known += 1;
    if (!device.alias) counts.unnamed += 1;
    if (device.isNew) counts.new += 1;
    if (!device.known) counts.unacknowledged += 1;
    if (device.transient) counts.transient += 1;
  }
  return counts;
}

/** Devices ordered by address, then by key: the stable order every placement and list uses. */
export const sortDevices = (devices: readonly NetxDevice[]): NetxDevice[] =>
  [...devices].sort((a, b) => ipKey(a.ip) - ipKey(b.ip) || a.key.localeCompare(b.key));

export type NetxBodies = { devices: NetxDevicesBody | null; agents: NetxAgentsBody | null; capability: NetxCapabilityBody | null };

/**
 * Build the inventory from Data's three bodies. The reference time is Data's when it gives one
 * (the fixture's capture instant, the live summary's `referenceTime`), else `now`.
 */
export function buildInventory(bodies: NetxBodies, now: Date | number = Date.now()): NetxInventory {
  const summary = bodies.devices?.summary ?? null;
  const nowMs = timeOf(summary?.referenceTime) ?? (now instanceof Date ? now.getTime() : Number(now));
  const rules = readRules(summary);
  const rawDevices = Array.isArray(bodies.devices?.devices) ? (bodies.devices!.devices as NetxDeviceRecord[]) : [];
  const seen = new Set<string>();
  const devices = sortDevices(rawDevices.map((record) => normaliseDevice(record ?? {}, nowMs, rules)).filter((device): device is NetxDevice => {
    if (!device || seen.has(device.key)) return false;
    seen.add(device.key);
    return true;
  }));
  const rawScanners = Array.isArray(bodies.agents?.scanners) ? (bodies.agents!.scanners as NetxScannerRecord[]) : [];
  const collectors = rawScanners.map((record) => normaliseCollector(record ?? {}, nowMs)).filter((collector): collector is NetxCollector => collector !== null)
    .sort((a, b) => Number(b.active) - Number(a.active) || (timeOf(b.lastScanAt) ?? 0) - (timeOf(a.lastScanAt) ?? 0) || a.id.localeCompare(b.id));
  return {
    referenceTime: new Date(nowMs).toISOString(),
    rules, devices, collectors,
    activeCollectors: collectors.filter((collector) => collector.active).length,
    dataCanScan: typeof bodies.capability?.nmap === "boolean" ? bodies.capability.nmap : null,
    freshness: freshnessOf(collectors, rules, nowMs),
    counts: countDevices(devices),
  };
}

// ---- placement ------------------------------------------------------------------------------

/** Ring radii: the observation state made spatial. A device that goes quiet drifts outward. */
export const NETX_RING: Record<NetxState, number> = { online: 8, recent: 13, historical: 18, never_confirmed: 18 };
/** The passages arc: transients lined up compactly past the last ring, not a building each. */
export const NETX_PASSAGES_RADIUS = 22.5;
export const NETX_PASSAGES_ARC: readonly [number, number] = [Math.PI * 1.08, Math.PI * 1.42];
/** Lighthouses stand between the router and the online ring. */
export const NETX_COLLECTOR_RADIUS = 4.6;
/** Devices sharing an octet (two MACs on one address) step outward by this much, in key order. */
export const NETX_STACK_STEP = 1.35;
export const NETX_HALF = 27;

export type NetxPlacement = { key: string; x: number; z: number; angle: number; radius: number; ring: NetxState | "passages" };

/** Angle of an address: the last octet around the circle, 0 at +x, clockwise as octets grow. */
export const angleOfOctet = (octet: number): number => ((octet % 256) + 256) % 256 / 256 * Math.PI * 2;
const round = (value: number): number => Math.round(value * 1000) / 1000;

/**
 * Deterministic: the same inventory places the same device at the same spot, scan after scan.
 * Angle from the address, radius from the state, a stable outward step when two devices share
 * an address, and the passages arc for transients.
 */
export function placeDevices(devices: readonly NetxDevice[]): NetxPlacement[] {
  const ordered = sortDevices(devices);
  const placements: NetxPlacement[] = [];
  const transients = ordered.filter((device) => device.transient);
  const stacks = new Map<string, number>();
  for (const device of ordered) {
    if (device.transient) continue;
    const octet = device.octet ?? (parseInt(device.key.replace(/[^0-9A-F]/gi, "").slice(-2), 16) || 0);
    const angle = angleOfOctet(octet);
    const stackKey = `${device.state}:${octet}`;
    const stacked = stacks.get(stackKey) ?? 0;
    stacks.set(stackKey, stacked + 1);
    const radius = NETX_RING[device.state] + stacked * NETX_STACK_STEP;
    placements.push({ key: device.key, x: round(Math.cos(angle) * radius), z: round(Math.sin(angle) * radius), angle, radius, ring: device.state });
  }
  transients.forEach((device, index) => {
    const t = transients.length === 1 ? 0.5 : index / (transients.length - 1);
    const angle = NETX_PASSAGES_ARC[0] + (NETX_PASSAGES_ARC[1] - NETX_PASSAGES_ARC[0]) * t;
    placements.push({ key: device.key, x: round(Math.cos(angle) * NETX_PASSAGES_RADIUS), z: round(Math.sin(angle) * NETX_PASSAGES_RADIUS), angle, radius: NETX_PASSAGES_RADIUS, ring: "passages" });
  });
  return placements;
}

export function placeCollector(collector: NetxCollector, index: number): { x: number; z: number; angle: number } {
  const angle = collector.octet !== null ? angleOfOctet(collector.octet) : Math.PI * 0.5 + index * Math.PI * 0.5;
  return { x: round(Math.cos(angle) * NETX_COLLECTOR_RADIUS), z: round(Math.sin(angle) * NETX_COLLECTOR_RADIUS), angle };
}

/** One line for a device card or a label: what is known, nothing more. */
export function describeDevice(device: NetxDevice): string {
  const stateText: Record<NetxState, string> = { online: "en ligne", recent: "vu récemment", historical: "plus vu", never_confirmed: "jamais confirmé" };
  const parts = [
    device.ip || null, device.mac, device.vendor ?? "fabricant inconnu",
    device.type ? NETX_TYPE_LABEL[device.type] : device.typeRaw ? `type « ${device.typeRaw} » (hors liste)` : null,
    device.location ? `à ${device.location}` : null,
    `${stateText[device.state]}${device.ageMs !== null ? ` · il y a ${ageLabel(device.ageMs)}` : ""}`,
    device.source ? `vu par ${device.source}` : null,
    device.isNew ? "nouveau depuis 24 h" : null,
    device.known ? "reconnu" : "non reconnu",
  ];
  return parts.filter((part): part is string => Boolean(part)).join(" · ");
}
