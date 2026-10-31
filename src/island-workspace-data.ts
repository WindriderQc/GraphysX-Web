/** Read-only views of evidence received from the world. No simulation or inferred intent. */
import { describeWorldAction, type WorldAction } from "./island-world-feed";
import { explorerValue, type ExplorerItem, type ExplorerModel } from "./island-explorer-data";

export type ObservedChange = { id: string; tick: number; target: string; text: string };
export type TimelineEntry = { id: string; tick: number; target: string | null; subject?: string; text: string; kind: string };
export const actionIdentity = (a: WorldAction): string => a.id || JSON.stringify([a.instanceId, a.tick, a.agent, a.input, a.result]);
export function mergeWorldActions(previous: WorldAction[], incoming: WorldAction[], instanceId?: string, limit = 2000): WorldAction[] {
  const unique = new Map<string, WorldAction>();
  for (const action of [...previous, ...incoming]) {
    if (instanceId && action.instanceId && action.instanceId !== instanceId) continue;
    unique.set(actionIdentity(action), action);
  }
  return [...unique.values()].sort((a, b) => a.tick - b.tick || (a.sequence || 0) - (b.sequence || 0)).slice(-limit);
}
export function timelineEntries(model: ExplorerModel, changes: ObservedChange[] = []): TimelineEntry[] {
  const resolve = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const direct = model.items.find(item => item.id === value);
    const named = model.items.filter(item => item.name === value);
    return direct?.id || (named.length === 1 ? named[0].id : null);
  };
  return [...model.actions.map(a => ({ id: actionIdentity(a), tick: a.tick,
    subject: a.agent, target: resolve(a.input.data?.target ?? a.input.data?.name ?? a.input.data?.entityId) || resolve(a.agent),
    text: `${a.agent} · ${describeWorldAction(a)}`, kind: a.input.type === "Say" ? "Message" : "Action" })),
    ...(model.messages || []).filter(m => m.role !== "tool").map(m => ({ id: m.id, tick: m.tick, target: null, text: m.text, kind: "Message" })),
    ...changes.map(c => ({ ...c, kind: "Changement observé" }))].sort((a, b) => b.tick - a.tick);
}

export type LineageNode = { item: ExplorerItem; level: number; parent: string | null; incomplete: boolean };
export function lineageNodes(model: ExplorerModel): LineageNode[] {
  const trees = model.items.filter(i => i.category === "trees");
  const byId = new Map(trees.map(i => [i.id, i]));
  return trees.map(item => {
    const parent = item.relations.find(r => r.label === "Parent")?.id || null;
    let cursor = item, level = 0, incomplete = !model.metadata || !Object.prototype.hasOwnProperty.call(item.attributes, "Parent");
    const seen = new Set([item.id]);
    while (cursor.attributes.Parent) {
      const id = cursor.relations.find(r => r.label === "Parent")?.id;
      const next = id && byId.get(id);
      if (!next || seen.has(next.id)) { incomplete = true; break; }
      seen.add(next.id); cursor = next; level++;
      if (!Object.prototype.hasOwnProperty.call(cursor.attributes, "Parent")) incomplete = true;
    }
    return { item, level, parent, incomplete };
  });
}

export type TreeSnapshot = { item: ExplorerItem; world: string; instance: string | null; recording: string | null; journalGeneration: string | null; tick: number; tickHz: number; mode: string };
export function treeSnapshot(model: ExplorerModel, item: ExplorerItem): TreeSnapshot {
  return { item: structuredClone(item), world: model.label, instance: model.instanceId || null, recording: model.recordingId || null, journalGeneration: model.journalGeneration || null, tick: model.tick, tickHz: model.tickHz, mode: model.mode };
}
export function compareTreeProperties(a: TreeSnapshot, b: TreeSnapshot) {
  const properties = (s: TreeSnapshot) => new Map(s.item.properties.filter(p => p.group !== "Physique" && !p.label.startsWith("Position")).map(p => [p.label, p.value]));
  const left = properties(a), right = properties(b);
  return [...new Set([...left.keys(), ...right.keys()])].map(label => ({ label, a: left.get(label) || "Non renseigné", b: right.get(label) || "Non renseigné", changed: left.get(label) !== right.get(label) }));
}
export const snapshotProvenance = (s: TreeSnapshot): string => `${s.world} · ${s.mode} · ${Math.floor(s.tick / s.tickHz)} s · instance ${s.instance || "non transmise"} · enregistrement ${s.recording || "non transmis"}${s.journalGeneration ? ` · journal ${s.journalGeneration}` : ""}`;

/** Map uses world x/z; children of a logical object do not become duplicate markers. */
export function mapItems(model: ExplorerModel): ExplorerItem[] {
  return model.items.filter(i => i.position && !i.parent && !["technical", "decor"].includes(i.category)
    && !(i.id.endsWith("-grass") && model.items.some(owner => owner.id === i.id.slice(0, -6) && owner.visible && owner.category === "terrain")));
}
export function mapBounds(items: ExplorerItem[]): { x: number; z: number; span: number } {
  const points = items.filter(i => i.kind !== "water" && i.category !== "forces").map(i => i.position!).filter(Boolean);
  const xs = points.map(p => p[0]), zs = points.map(p => p[2]);
  const minX = Math.min(-60, ...xs), maxX = Math.max(60, ...xs), minZ = Math.min(-60, ...zs), maxZ = Math.max(60, ...zs);
  return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, span: Math.max(maxX - minX, maxZ - minZ) + 12 };
}
export const mapLabel = (item: ExplorerItem): string => `${item.name} · ${explorerValue(item.position)}${item.visible ? "" : " · invisible"}`;
