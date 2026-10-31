/** Pure projections for the island explorer. The server remains the only world owner. */
import type { ClawObservation, ClawVec3, IslandMessage } from "./island-feed";
import type { InspectionEntity } from "./island-inspection";
import type { WorldAction, WorldScene } from "./island-world-feed";

export const EXPLORER_CATEGORIES = [
  ["agents", "Agents", "Qui habite l’île"], ["objects", "Objets", "Blocs, roche et anneau"],
  ["trees", "Arbres", "Croissance, gènes et lignées"], ["birds", "Oiseaux et volées", "Groupes et individus"],
  ["terrain", "Terrain", "Sol, relief et océan"], ["forces", "Forces", "Vent et attracteurs"],
  ["decor", "Décor et lumière", "Habillage du monde"], ["technical", "Éléments techniques", "Limites et collisions"],
] as const;
export type ExplorerCategory = typeof EXPLORER_CATEGORIES[number][0];
export type ExplorerProperty = { label: string; value: string; group: string };
export type ExplorerItem = {
  id: string; entityId: string; name: string; category: ExplorerCategory; kind: string;
  position: ClawVec3 | null; properties: ExplorerProperty[]; attributes: Record<string, unknown>;
  relations: { id: string; label: string }[]; parent: string | null; raw: unknown; visible: boolean;
};
export type ExplorerModel = {
  journalGeneration?: string; ageMs?: number; instanceId?: string; recordingId?: string; journalTruncated?: boolean; key: string; label: string; mode: string; connected: boolean; tick: number; tickHz: number;
  items: ExplorerItem[]; counts: Record<ExplorerCategory, number>; actions: WorldAction[]; messages?: IslandMessage[]; metadata: boolean;
};
export type ExplorerInput = {
  legacyConnection?: number; ageMs?: number; world: WorldScene | null; claw: ClawObservation | null; mode: string; connected: boolean;
  actions: WorldAction[]; messages?: IslandMessage[]; position?: (id: string) => ClawVec3 | null;
  swarms?: { id: string; positions: number[]; velocities: number[] | null }[];
};

const rec = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const vec = (v: unknown): ClawVec3 | null => Array.isArray(v) && v.length >= 3 && v.slice(0, 3).every((n) => typeof n === "number" && Number.isFinite(n)) ? v.slice(0, 3) as ClawVec3 : null;
export const explorerValue = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "Non renseigné";
  if (typeof v === "boolean") return v ? "Oui" : "Non";
  if (typeof v === "number") return Number.isFinite(v) ? Number(v.toFixed(3)).toLocaleString("fr-CA") : "Non renseigné";
  if (Array.isArray(v)) return v.map(explorerValue).join(" · ");
  return typeof v === "object" ? JSON.stringify(v) : String(v);
};
const LABELS: Record<string, string> = {
  Generation: "Génération de mutation", Ready: "Prêt à donner une graine", ReadyIn: "Repos restant (s)", Parent: "Arbre parent",
  ParentGeneration: "Génération du parent", Lineage: "Lignée", SownBy: "Semé par", LeafColor: "Couleur du feuillage",
  Height: "Hauteur", Branches: "Branches", Leaves: "Feuilles", TrunkLength: "Longueur du tronc", LengthRatio: "Rapport des branches",
  BranchAngle: "Angle des branches (rad)", RollTurns: "Rotation des branches", Depth: "Profondeur de ramification", SplitChance: "Probabilité de ramification",
  LeafSize: "Taille des feuilles", LeafHue: "Teinte des feuilles", HeldSeed: "Graine portée", HeldSeedColor: "Couleur de la graine",
  LeafHueSpread: "Variation de teinte", BranchThickness: "Épaisseur des branches",
  Presence: "Présence", HeldObject: "Objet porté", LastActionResult: "Dernier résultat", Members: "Oiseaux dans la volée", Spread: "Rayon de dispersion",
  MeanSpeed: "Vitesse moyenne", Startled: "Volée effrayée", IsCarryable: "Transportable", CarryKind: "Type d’objet", ItemColorName: "Couleur",
};
const GENES = new Set(["TrunkLength", "LengthRatio", "BranchAngle", "RollTurns", "Depth", "SplitChance", "LeafSize", "LeafHue", "LeafHueSpread", "BranchThickness"]);
const ignore = new Set(["RenderRole", "Root", "IsLiving", "ModelUrl", "ModelYawOffsetDeg", "ViewOriginX", "ViewOriginY", "ViewOriginZ", "ViewForwardX", "ViewForwardY", "ViewForwardZ", "ViewFovDeg"]);

function category(type: string, tags: string[], visible: boolean, physics: Record<string, unknown>, name: string): ExplorerCategory {
  if (type === "agent") return "agents";
  if (type === "dna-tree") return "trees";
  if (type === "flock") return "birds";
  if (type === "force-field") return "forces";
  if (tags.includes("trunk") || /^Boundary/i.test(name) || (!visible && !!physics.mode)) return "technical";
  if (tags.includes("pickup") || ["Rock", "Ring"].includes(name) || /^(Block|Impact|rock_|ring_)/i.test(name)) return "objects";
  if (type === "water" || tags.includes("land") || /^(Ground|Ocean|LowStep|LargeMesa|SmallPlateau|SteppingStone|Ridge|TallMesa|HighShelf|Peak|TowerBase|Summit|Spire)/.test(name)) return "terrain";
  if (type.includes("light") || tags.includes("decor") || tags.includes("lighting")) return "decor";
  return physics.mode === "dynamic" ? "objects" : "technical";
}

function makeItem(def: Record<string, unknown> & { id: string }, meta: InspectionEntity | undefined, input: ExplorerInput): ExplorerItem {
  const type = String(def.type || meta?.shape || "élément");
  const tags = Array.isArray(def.tags) ? def.tags.map(String) : [];
  const attrs = meta?.attributes || {};
  const physics = rec(def.physics);
  const name = meta?.name || String(def.label || def.id);
  const visible = def.visible !== false && !(type === "force-field" && rec(def.forceField).visualize === false);
  const position = input.position?.(def.id) || vec(meta?.position) || vec(rec(def.transform).position);
  const properties: ExplorerProperty[] = [];
  const prop = (label: string, value: unknown, group = "État") => { if (value !== undefined && value !== null) properties.push({ label, value: explorerValue(value), group }); };
  prop("Position (x · y · z)", position);
  const scale = vec(rec(def.transform).scale);
  const geometry = rec(def.geometry);
  let size = vec(meta?.size);
  let geometrySize = false;
  if (type === "cylinder" && typeof geometry.height === "number") {
    const radius = Number(geometry.radius ?? Math.max(Number(geometry.radiusTop || 0), Number(geometry.radiusBottom || 0)));
    geometrySize = true;
    size = [radius * 2, geometry.height, radius * 2].map((v, i) => v * Math.abs(scale?.[i] ?? 1)) as ClawVec3;
  }
  if (type === "box") {
    const dimensions = [geometry.width, geometry.height, geometry.depth];
    if (dimensions.every(v => typeof v === "number")) { geometrySize = true; size = dimensions.map((v, i) => Number(v) * Math.abs(scale?.[i] ?? 1)) as ClawVec3; }
  }
  if (type === "sphere" && typeof geometry.radius === "number") {
    geometrySize = true; size = [0,1,2].map(i => Number(geometry.radius) * 2 * Math.abs(scale?.[i] ?? 1)) as ClawVec3;
  }
  if (type === "torus" && typeof geometry.radius === "number" && typeof geometry.tube === "number") {
    geometrySize = true;
    size = [(geometry.radius + geometry.tube) * 2, (geometry.radius + geometry.tube) * 2, geometry.tube * 2].map((v,i) => v * Math.abs(scale?.[i] ?? 1)) as ClawVec3;
  }
  prop("Origine de la taille", geometrySize ? "Géométrie déclarée · axes locaux" : size ? "Observation transmise par le serveur" : "Non renseigné", "Physique");
  prop("Dimensions (unités du monde)", size || "Non renseigné", "Physique");
  if (geometrySize && meta?.size && JSON.stringify(size) !== JSON.stringify(meta.size)) prop("Dimensions reçues (différentes de la géométrie)", meta.size, "Physique");
  prop("Échelle de transformation", scale || "Non renseigné", "Physique");
  prop("Forme", meta?.shape || type, "Physique");
  prop("Matière", meta?.material, "Physique");
  prop("Masse", meta?.mass ?? physics.mass, "Physique");
  prop("Fixe", meta?.anchored ?? (physics.mode ? physics.mode === "static" : undefined), "Physique");
  prop("Visible dans la scène", visible, "Physique");
  for (const [key, value] of Object.entries(attrs)) if (!ignore.has(key)) {
    const none = value === "" && ["HeldSeed", "HeldObject", "Parent", "SownBy"].includes(key);
    prop(LABELS[key] || key, key === "Presence" ? value === "active" ? "Active (requête récente)" : value === "idle" ? "Inactive (avatar conservé)" : value : none ? "Aucun" : value, GENES.has(key) ? "Gènes exprimés" : "État");
  }
  prop("Couleur de matière", rec(def.material).color, "Apparence");
  if (type.includes("light")) prop("Intensité lumineuse", def.intensity, "Lumière");
  if (type === "water") prop("Étendue configurée", rec(def.water).size, "Surface d’eau");
  const dna = rec(def.dna);
  if (type === "dna-tree") {
    for (const gene of GENES) if (attrs[gene] === undefined) prop(LABELS[gene] || gene, "Non renseigné", "Gènes exprimés");
    if (attrs.Generation === undefined) prop("Génération de mutation", dna.generation, "Génétique");
    prop("Graine déterministe", dna.seed, "Génétique");
    prop("Taux de mutation", dna.mutationRate, "Génétique");
  }
  const force = rec(def.forceField);
  if (type === "force-field") {
    const kinds: Record<string, string> = { flow: "Vent / flux", attractor: "Attracteur", drag: "Traînée", vortex: "Tourbillon" };
    prop("Effet", kinds[String(force.kind)] || force.kind, "Champ de force");
    for (const [key, label] of Object.entries({ strength: "Intensité", radius: "Rayon", direction: "Direction", affectsBodies: "Agit sur les objets", affectsFlocks: "Agit sur les oiseaux", affectsParticles: "Agit sur les particules" })) prop(label, force[key], "Champ de force");
  }
  if (type === "flock") prop("Population configurée", rec(def.flock).count ?? rec(def.flock).memberCount, "Volée");
  return { id: def.id, entityId: def.id, name, category: category(type, tags, visible, physics, name), kind: type, position,
    properties, attributes: attrs, relations: [], parent: null, raw: { definition: def, observation: meta || null }, visible };
}

export function buildIslandExplorer(input: ExplorerInput): ExplorerModel {
  const world = input.world;
  const items: ExplorerItem[] = [];
  if (world) {
    const meta = new Map([...(world.inspection?.entities || []), ...(world.inspection?.agents || [])].map(row => [row.id, row]));
    for (const def of world.entities) items.push(makeItem(def, meta.get(def.id), input));
    for (const swarm of input.swarms || []) {
      const flock = items.find(item => item.id === swarm.id);
      if (!flock) continue;
      const origin = input.position?.(swarm.id) || flock.position || [0, 0, 0];
      for (let index = 0; index < swarm.positions.length / 3; index += 1) {
        const position = swarm.positions.slice(index * 3, index * 3 + 3).map((value, axis) => value + origin[axis]) as ClawVec3;
        const velocity = swarm.velocities?.slice(index * 3, index * 3 + 3);
        items.push({ id: `${flock.id}:bird:${index}`, entityId: flock.id, name: `Oiseau ${index + 1}`, category: "birds", kind: "bird",
          position, parent: flock.id, attributes: {}, visible: true, raw: { index, position, velocity: velocity || null },
          properties: [{ label: "Position (x · y · z)", value: explorerValue(position), group: "État" },
            { label: "Vitesse", value: explorerValue(velocity ? Math.hypot(...velocity) : undefined), group: "État" },
            { label: "Identité", value: "Numéro dans la volée, stable pendant cet épisode", group: "État" }], relations: [{ id: flock.id, label: "Volée" }] });
      }
    }
  } else if (input.claw) {
    const claw = input.claw;
    const roots = new Map(claw.players.map(p => [p.root_part_id, p]));
    for (const entity of claw.entities) {
      const player = roots.get(entity.id);
      const role = entity.render?.role || String(entity.attributes?.RenderRole || "");
      const def = { id: `island-e${entity.id}`, label: player?.name || entity.name || `Élément ${entity.id}`,
        type: player ? "agent" : role === "Ocean" ? "water" : "box",
        visible: entity.render?.visible !== false && entity.render?.transparency !== 1,
        transform: { position: entity.position, scale: entity.size }, tags: [role === "PickupObject" || role === "Rock" || role === "Ring" ? "pickup" : ""],
        physics: { mode: entity.render?.static ? "static" : "dynamic" } };
      items.push(makeItem(def, { id: def.id, name: String(def.label), shape: entity.shape || undefined, size: entity.size || undefined,
        attributes: { ...entity.attributes, ...player?.attributes } }, input));
    }
  }
  const byName = new Map<string, ExplorerItem[]>();
  for (const item of items) byName.set(item.name, [...(byName.get(item.name) || []), item]);
  const byId = new Map(items.map(item => [item.id, item]));
  for (const item of items) {
    const relation = (reference: unknown, label: string): void => {
      if (typeof reference !== "string" || !reference) return;
      const matches = byName.get(reference) || [];
      const target = byId.get(reference) || (matches.length === 1 ? matches[0] : undefined);
      if (target && target.id !== item.id && !item.relations.some(r => r.id === target.id && r.label === label)) item.relations.push({ id: target.id, label });
    };
    relation(item.attributes.Parent, "Parent");
    relation(item.attributes.SownBy, "Semé par");
    relation(item.attributes.HeldObject, "Objet porté");
    if (typeof item.attributes.HeldSeed === "string") relation(item.attributes.HeldSeed.split("@")[0], "Graine de");
    for (const name of String(item.attributes.Lineage || "").split(">")) relation(name, "Lignée");
    for (const child of items) if (child.attributes.Parent === item.name) relation(child.id, "Descendant");
    if (item.kind === "dna-tree") {
      relation(`${item.id}-trunk`, "Collision du tronc");
      relation(`${item.id}-perch`, "Attracteur des oiseaux");
    }
    if (typeof rec(item.raw).definition === "object") {
      const parent = rec(rec(item.raw).definition).parentId;
      if (typeof parent === "string" && byId.has(parent)) { item.parent = parent; relation(parent, "Appartient à"); }
    }
  }
  for (const item of items.filter(i => i.kind === "dna-tree")) {
    const visited = new Set([item.id]);
    let cursor = item, depth = 0, known = Object.prototype.hasOwnProperty.call(item.attributes, "Parent");
    while (cursor.attributes.Parent) {
      const parent = cursor.relations.find(r => r.label === "Parent");
      const next = parent && byId.get(parent.id);
      if (!next || visited.has(next.id)) { known = false; break; }
      visited.add(next.id); depth++; cursor = next;
      if (!Object.prototype.hasOwnProperty.call(cursor.attributes, "Parent")) known = false;
    }
    item.properties.push({ label: "Profondeur de lignée", value: !world?.inspection || !known ? "Non renseigné (lignée incomplète)" : String(depth), group: "Génétique" });
  }
  const counts = Object.fromEntries(EXPLORER_CATEGORIES.map(([id]) => [id, items.filter(item => item.category === id).length])) as ExplorerModel["counts"];
  const id = world?.inspection?.worldId || world?.worldId;
  const label = id === "living-island" ? "Île vivante" : id === "mesa-island" ? "Île Mesa" : world?.label || "Île Clawblox";
  return { journalGeneration: world?.journal?.generation, ageMs: input.ageMs, instanceId: world?.instanceId, recordingId: world?.recordingId, journalTruncated: world?.journal?.truncated, key: `${world ? "graphysx" : "clawblox"}:${world?.instanceId || input.claw?.instance_id || `${id || "island"}:${input.legacyConnection || 0}`}`, label,
    mode: input.mode === "replay" ? "Relecture" : input.mode === "fixture" ? "Démonstration" : "Direct",
    connected: input.connected, tick: world?.tick || input.claw?.tick || 0, tickHz: world?.tickHz || 60,
    items, counts, actions: input.actions, messages: input.messages, metadata: world ? !!world.inspection : true };
}

export function filterExplorerItems(model: ExplorerModel, categoryId: string | null, search = ""): ExplorerItem[] {
  const normalize = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const query = normalize(search.trim());
  return model.items.filter(item => (!categoryId || item.category === categoryId) && (!query || normalize(
    `${item.name} ${item.id} ${item.kind} ${EXPLORER_CATEGORIES.find(row => row[0] === item.category)?.[1] || ""} ${item.properties.map(p => `${p.label} ${p.value}`).join(" ")} ${explorerValue(item.attributes)}`
  ).includes(query)));
}

export function islandDashboardLink(value: string | null, run: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    if (run && /^[a-f0-9-]{36}$/.test(run)) url.hash = `memory=${run}`;
    return url.href;
  } catch { return null; }
}
