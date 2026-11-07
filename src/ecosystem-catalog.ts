/** Instance-scoped composition. The bundled October scene remains an explicit historical fallback. */
import { ECOSYSTEM_NODES, ECOSYSTEM_LINKS, ECOSYSTEM_WORKFLOWS, ECOSYSTEM_SNAPSHOT_DATE, ECOSYSTEM_SOURCE, type EcoNode, type EcoLink, type EcoWorkflow } from "./ecosystem-data";
import type { EcoPlacement } from "./ecosystem-scene";

export type CompositionRead = { contract: string; source: string; id: string; revision: string; observedAt: string; expiresAt: string };
export type EcosystemComposition = {
  version: 1; reviewedAt: string; source: string; nodes: readonly EcoNode[]; links: readonly EcoLink[];
  workflows: readonly EcoWorkflow[]; placements: Readonly<Record<string, EcoPlacement>>;
  narration?: Readonly<Partial<Record<"overview" | "frank" | "services" | "alien" | "brutal" | "network" | "edge" | "spare" | "watch" | "summary", string>>>;
  pronunciations?: readonly { name: string; spoken: string }[];
};
export type CompositionView = { contentRevision: string; read: CompositionRead; data: EcosystemComposition };
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);
const id = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9][a-z0-9-]{1,23}$/.test(v);
export function validCompositionRead(value: unknown): value is CompositionRead {
  if (!record(value)) return false;
  return value.contract === "agentx.presentation-read/v1" && value.source === "core.ecosystem.composition"
    && typeof value.revision === "string" && /^[a-f0-9]{64}$/.test(value.revision) && value.id === "view_" + value.revision
    && [value.observedAt, value.expiresAt].every(v => typeof v === "string" && Number.isFinite(Date.parse(v)))
    && Date.parse(String(value.expiresAt)) > Date.parse(String(value.observedAt));
}
export function parseComposition(value: unknown): CompositionView {
  const fail = (): never => { throw new Error("Composition de l’écosystème invalide ; aucune carte historique substituée."); };
  if (!record(value) || typeof value.contentRevision !== "string" || !/^[a-f0-9]{64}$/.test(value.contentRevision)
    || !validCompositionRead(value.read) || !record(value.data)) return fail();
  const data = value.data;
  if (data.version !== 1 || !text(data.reviewedAt, 10) || !/^\d{4}-\d\d-\d\d$/.test(data.reviewedAt)
    || !Number.isFinite(Date.parse(data.reviewedAt)) || new Date(data.reviewedAt).toISOString().slice(0, 10) !== data.reviewedAt
    || !text(data.source, 240) || !Array.isArray(data.nodes) || !data.nodes.length || data.nodes.length > 64
    || !Array.isArray(data.links) || data.links.length > 128 || !Array.isArray(data.workflows) || data.workflows.length > 16
    || !record(data.placements) || JSON.stringify(value).length > 65536) return fail();
  const ids = new Set<string>();
  const scenes = ["overview", "frank", "services", "alien", "brutal", "network", "edge", "spare", "watch", "summary"];
  if (data.narration !== undefined && (!record(data.narration) || Object.entries(data.narration).some(([key, value]) => !scenes.includes(key) || !text(value, 1000)))) return fail();
  if (data.pronunciations !== undefined) {
    if (!Array.isArray(data.pronunciations) || data.pronunciations.length > 32) return fail();
    const names = new Set<string>();
    for (const row of data.pronunciations) {
      if (!record(row) || Object.keys(row).some(key => !["name", "spoken"].includes(key)) || !text(row.name, 100) || !text(row.spoken, 120) || names.has(row.name.toLowerCase())) return fail();
      names.add(row.name.toLowerCase());
    }
  }
  for (const node of data.nodes) {
    if (!record(node) || !id(node.id) || ids.has(node.id) || !text(node.name, 100) || !text(node.subtitle, 180)
      || !["host", "vm", "service", "storage", "edge", "network", "spare", "client", "external"].includes(String(node.kind))
      || !["installed", "planned", "attention"].includes(String(node.status))) return fail();
    for (const key of ["specs", "roles"]) if (node[key] !== undefined && (!Array.isArray(node[key]) || (node[key] as unknown[]).length > 12 || !(node[key] as unknown[]).every(v => text(v, 240)))) return fail();
    for (const key of ["attention", "planned", "evidence"]) if (node[key] !== undefined && !text(node[key], 500)) return fail();
    if (node.narration !== undefined && !text(node.narration, 500)) return fail();
    if (JSON.stringify(node).length > 3000) return fail();
    if (node.status === "attention" && !node.attention) return fail();
    const place = data.placements[node.id];
    if (!record(place) || !["x", "z", "width", "height", "depth"].every(k => typeof place[k] === "number" && Number.isFinite(place[k]))
      || Math.abs(Number(place.x)) > 23 || Math.abs(Number(place.z)) > 23
      || [place.width, place.height, place.depth].some(v => Number(v) < 0.3 || Number(v) > 10)
      || (place.y !== undefined && (typeof place.y !== "number" || !Number.isFinite(place.y) || place.y < 0 || place.y > 10))) return fail();
    ids.add(node.id);
  }
  if (Object.keys(data.placements).some(key => !ids.has(key))) return fail();
  for (const node of data.nodes) if (node.host !== undefined && !ids.has(String(node.host))) return fail();
  for (const link of data.links) if (!record(link) || !ids.has(String(link.from)) || !ids.has(String(link.to)) || link.from === link.to
    || !["lan", "dns", "storage", "media", "audio", "compute", "metrics"].includes(String(link.kind)) || (link.label !== undefined && !text(link.label, 160))) return fail();
  const flows = new Set<string>();
  for (const flow of data.workflows) {
    if (!record(flow) || !id(flow.id) || flows.has(flow.id) || !text(flow.title, 160) || (flow.note !== undefined && !text(flow.note, 1000))
      || (flow.narration !== undefined && !text(flow.narration, 1000))
      || !Array.isArray(flow.stops) || flow.stops.length < 2 || flow.stops.length > 12
      || (flow.branches !== undefined && (!Array.isArray(flow.branches) || flow.branches.length > 4 || !flow.branches.every(row => Array.isArray(row) && row.length >= 2 && row.length <= 12)))) return fail();
    for (const stop of [...flow.stops, ...((flow.branches as unknown[][] | undefined) ?? []).flat()]) {
      if (!record(stop) || !ids.has(String(stop.node)) || !text(stop.label, 160) || (stop.note !== undefined && !text(stop.note, 500))) return fail();
    }
    flows.add(flow.id);
  }
  return structuredClone(value) as CompositionView;
}
/** Check the actual manifest bytes before any custom scene is mounted. */
export async function verifyComposition(view: CompositionView): Promise<void> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(view.data)));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  if (hash !== view.contentRevision) throw new Error("La composition ne correspond pas à la révision Core annoncée.");
}
export function createEcosystemCatalog(view?: CompositionView) {
  const nodes = view?.data.nodes ?? ECOSYSTEM_NODES, links = view?.data.links ?? ECOSYSTEM_LINKS;
  const workflows = view?.data.workflows ?? ECOSYSTEM_WORKFLOWS;
  const byId = new Map(nodes.map(node => [node.id, node]));
  const ecoNode = (id: string): EcoNode | null => byId.get(id) ?? null;
  const pronunciations = [...(view?.data.pronunciations ?? [])].sort((a, b) => b.name.length - a.name.length);
  const aliases = new Map(pronunciations.map(row => [row.name.toLowerCase(), row.spoken]));
  // Literal, whole-name, one-pass replacements: aliases never rename nodes or expand each other.
  const escaped = pronunciations.map(row => [...row.name].map(char => ".+*?^$[]{}()|\\".includes(char) ? "\\" + char : char).join(""));
  const pattern = escaped.length ? new RegExp("(?<![\\p{L}\\p{N}_])(" + escaped.join("|") + ")(?![\\p{L}\\p{N}_])", "giu") : null;
  const speak = (text: string): string => pattern ? text.replace(pattern, name => aliases.get(name.toLowerCase()) ?? name) : text;
  const describeNode = (node: EcoNode): string => {
    const host = node.host ? ecoNode(node.host) : null;
    return [`${node.name} · ${node.subtitle}.`, host ? `${node.kind === "vm" ? "VM hébergée par" : "Vit sur"} ${host.name}.` : "",
      node.specs?.length ? node.specs.join(" · ") + "." : "", node.roles?.length ? "Rôles : " + node.roles.join(" ; ") + "." : "",
      node.attention ? "Point ouvert : " + node.attention + "." : "", node.planned ? "Prévu : " + node.planned + "." : "",
      node.evidence ? "Preuve : " + node.evidence + "." : ""].filter(Boolean).join(" ");
  };
  return { custom: Boolean(view), nodes, links, workflows, placements: view?.data.placements,
    date: view?.data.reviewedAt ?? ECOSYSTEM_SNAPSHOT_DATE, source: view?.data.source ?? ECOSYSTEM_SOURCE,
    ecoNode, describeNode, speak, narration: view?.data.narration,
    narrateNode: (node: EcoNode): string => node.narration ? `${node.name}. ${node.narration}` : describeNode(node),
    ecoIssues: () => nodes.filter(node => node.attention),
    ecoServicesOn: (host: string) => nodes.filter(node => node.host === host && node.kind === "service"),
    ecoLinksOf: (id: string) => links.filter(link => link.from === id || link.to === id),
    ecoWorkflow: (id: string) => workflows.find(flow => flow.id === id) ?? null };
}
export type EcosystemCatalog = ReturnType<typeof createEcosystemCatalog>;
export const DEFAULT_ECOSYSTEM_CATALOG = createEcosystemCatalog();
