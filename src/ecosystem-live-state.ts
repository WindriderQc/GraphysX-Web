/** Bounded Core observations. This renderer neither collects nor owns operational state. */
import { DEFAULT_ECOSYSTEM_CATALOG, validCompositionRead, type EcosystemCatalog } from "./ecosystem-catalog";

export type EcosystemLiveRead = {
  contract: "agentx.presentation-read/v1";
  id: string;
  revision: string;
  source: "core.ecosystem.live";
  observedAt: string;
  expiresAt: string;
};
export type EcosystemLiveNode = {
  id: string;
  state: "online" | "offline" | "degraded" | "busy" | "parked" | "unknown";
  source: "inference_endpoints" | "product_service" | "native_process" | "host_collector" | "monitoring_collector" | "storage_health" | "network_presence" | "http_interface" | "unobserved" | "observation";
  observedAt: string | null;
  expiresAt: string | null;
  freshness: "current" | "stale" | "unknown";
};
export type EcosystemLivePayload = {
  contract: "agentx.ecosystem-live/v1" | "agentx.ecosystem-live/v2";
  generatedAt: string;
  expiresAt: string;
  nodes: EcosystemLiveNode[];
  read: EcosystemLiveRead;
};
export type EcosystemLiveObservation = { status: "available" | "stale" | "unavailable"; read: EcosystemLiveRead | null };
export type EcosystemLiveView = EcosystemLiveObservation & {
  generatedAt: string | null;
  nodes: (EcosystemLiveNode & { displayState: EcosystemLiveNode["state"]; label: string; colour: string })[];
};

const STATES = new Set(["online", "offline", "degraded", "busy", "parked", "unknown"]);
const SOURCES = new Set(["inference_endpoints", "product_service", "native_process", "host_collector", "monitoring_collector", "storage_health", "network_presence", "http_interface", "unobserved", "observation"]);
const FRESHNESS = new Set(["current", "stale", "unknown"]);
const COLOURS = { online: "#35d6b0", offline: "#ff667a", degraded: "#ffb13b", busy: "#4ff2ff", parked: "#b48cff", unknown: "#9aa8be" };
const LABELS = { online: "Disponible", offline: "Indisponible", degraded: "Dégradé", busy: "Occupé", parked: "Au repos", unknown: "État inconnu" };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, allowed: string[]): boolean => Object.keys(value).every(key => allowed.includes(key));

/** ISO UTC, with optional millisecond precision. Reject normalized invalid dates (Feb 30). */
function timestamp(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString() === (value.includes(".") ? value : value.replace("Z", ".000Z"));
}

export function parseEcosystemLivePayload(value: unknown, catalog: EcosystemCatalog = DEFAULT_ECOSYSTEM_CATALOG): EcosystemLivePayload | null {
  if (!record(value) || !keys(value, ["contract", "generatedAt", "expiresAt", "nodes", "read", "composition"]) || !["agentx.ecosystem-live/v1", "agentx.ecosystem-live/v2"].includes(String(value.contract))) return null;
  if (!timestamp(value.generatedAt) || !timestamp(value.expiresAt) || Date.parse(value.expiresAt) <= Date.parse(value.generatedAt)) return null;
  if (!Array.isArray(value.nodes) || (value.nodes.length > (value.contract === "agentx.ecosystem-live/v2" ? 64 : 32)) || !record(value.read)) return null;
  if (value.composition !== undefined) {
    const claim = value.composition;
    if (!record(claim) || !keys(claim, ["contentRevision", "read"]) || typeof claim.contentRevision !== "string"
      || !/^[a-f0-9]{64}$/.test(claim.contentRevision) || !validCompositionRead(claim.read)) return null;
  }
  const read = value.read;
  if (!keys(read, ["contract", "id", "revision", "source", "observedAt", "expiresAt"]) || read.contract !== "agentx.presentation-read/v1" || read.source !== "core.ecosystem.live") return null;
  if (typeof read.revision !== "string" || !/^[a-f0-9]{64}$/.test(read.revision) || read.id !== `view_${read.revision}`) return null;
  if (read.observedAt !== value.generatedAt || read.expiresAt !== value.expiresAt) return null;
  const seen = new Set<string>();
  const nodes: EcosystemLiveNode[] = [];
  for (const item of value.nodes) {
    if (!record(item) || !keys(item, ["id", "state", "source", "observedAt", "expiresAt", "freshness"])) return null;
    if (typeof item.id !== "string" || !catalog.ecoNode(item.id) || seen.has(item.id)) return null;
    if (value.contract === "agentx.ecosystem-live/v1" && !["inference_endpoints", "product_service"].includes(String(item.source))) return null;
    if (item.source === "unobserved" && (item.state !== "unknown" || item.freshness !== "unknown" || item.observedAt !== null || item.expiresAt !== null)) return null;
    if (!STATES.has(String(item.state)) || !SOURCES.has(String(item.source)) || !FRESHNESS.has(String(item.freshness))) return null;
    if (item.observedAt !== null && !timestamp(item.observedAt) || item.expiresAt !== null && !timestamp(item.expiresAt)) return null;
    if (item.observedAt && Date.parse(String(item.observedAt)) > Date.parse(value.generatedAt)) return null;
    if (item.observedAt && item.expiresAt && Date.parse(String(item.expiresAt)) <= Date.parse(String(item.observedAt))) return null;
    if (item.freshness === "current" && (!item.observedAt || !item.expiresAt)) return null;
    seen.add(item.id);
    nodes.push({ id: item.id, state: item.state as EcosystemLiveNode["state"], source: item.source as EcosystemLiveNode["source"],
      observedAt: item.observedAt as string | null, expiresAt: item.expiresAt as string | null, freshness: item.freshness as EcosystemLiveNode["freshness"] });
  }
  return { contract: value.contract as EcosystemLivePayload["contract"], generatedAt: value.generatedAt, expiresAt: value.expiresAt, nodes,
    read: { contract: "agentx.presentation-read/v1", id: read.id as string, revision: read.revision, source: "core.ecosystem.live", observedAt: read.observedAt as string, expiresAt: read.expiresAt as string } };
}

export function ecosystemLiveScope(source: EcosystemLiveNode["source"]): string {
  return ({ inference_endpoints: "Inférence", product_service: "Santé du service", native_process: "Processus",
    host_collector: "Collecteur hôte", monitoring_collector: "Collecteur de supervision", storage_health: "Stockage observé",
    network_presence: "Présence réseau", http_interface: "Interface HTTP", unobserved: "Sans sonde", observation: "Observation" })[source];
}

/** No timers or effects: the existing host frame derives expiration from wall-clock time. */
export function createEcosystemLiveState(catalog: EcosystemCatalog = DEFAULT_ECOSYSTEM_CATALOG) {
  let last: EcosystemLivePayload | null = null;
  let enabled = false;
  let available = false;
  return {
    set(value: unknown): boolean {
      if (value === null) { enabled = true; available = false; return true; }
      const next = parseEcosystemLivePayload(value, catalog);
      if (!next) return false;
      if (last) {
        const delta = Date.parse(next.generatedAt) - Date.parse(last.generatedAt);
        if (delta < 0 || delta === 0 && JSON.stringify(next) !== JSON.stringify(last)) return false;
      }
      last = next; enabled = true; available = true;
      return true;
    },
    view(now = Date.now()): EcosystemLiveView | null {
      if (!enabled) return null;
      const expired = !!last && now >= Date.parse(last.expiresAt);
      const status = !available || !last ? "unavailable" : expired ? "stale" : "available";
      return {
        status, read: last ? { ...last.read } : null, generatedAt: last?.generatedAt ?? null,
        nodes: (last?.nodes ?? []).map(node => {
          const stale = expired || node.freshness === "stale" || !!node.expiresAt && now >= Date.parse(node.expiresAt);
          const freshness = stale ? "stale" : !available ? "unknown" : node.freshness;
          const current = available && freshness === "current";
          const knownLabel = node.source === "unobserved" ? "Non observé" : node.source === "network_presence" && node.state === "offline" ? "Non vu"
            : ["host_collector", "monitoring_collector"].includes(node.source) && node.state === "offline" ? "Collecteur inaccessible" : LABELS[node.state];
          const label = node.source === "unobserved" ? "Non observé" : !available ? `Source indisponible${stale ? " · relevé périmé" : ""} · dernier état : ${knownLabel}`
            : freshness === "stale" ? `Périmé · dernier état : ${knownLabel}`
            : freshness === "unknown" ? "État inconnu" : knownLabel;
          const displayState = current ? node.state : "unknown";
          return { ...node, freshness, displayState, label, colour: COLOURS[displayState] };
        }),
      };
    },
  };
}
