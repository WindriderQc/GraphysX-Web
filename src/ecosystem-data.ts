/**
 * The AgentX ecosystem as data: hosts, the VM one of them carries, the services that live on
 * them, the Pi devices at the edge of the network, the network itself, the spare hardware
 * with no role yet, the links worth drawing, and the four workflows the owner cares about.
 *
 * Transcribed from the three dated infographics of agentx-home
 * (`assets/infographies/2026-10-25/`, themselves drawn from `docs/ECOSYSTEM.md`): installed
 * and planned roles are kept apart, open issues are named, and nothing is marked healthy —
 * this is a relationship map, not a monitoring feed. When live alerts, work queues and
 * bottlenecks arrive, they attach to these ids; the picture does not need to change shape.
 *
 * Pure: no DOM, no three.js. `ecosystem-scene.ts` turns it into a world, `ecosystem-tour.ts`
 * walks it.
 */

export const ECOSYSTEM_SNAPSHOT_DATE = "2026-10-25";
export const ECOSYSTEM_SOURCE = "agentx-home · docs/ECOSYSTEM.md · infographies du 25 octobre 2026";

export type EcoKind = "host" | "vm" | "service" | "storage" | "edge" | "network" | "spare" | "client" | "external";
/** `installed` is received and running something; `planned` is drawn dashed; `attention` has an open issue. */
export type EcoStatus = "installed" | "planned" | "attention";
export type EcoNode = {
  id: string;
  name: string;
  subtitle: string;
  kind: EcoKind;
  status: EcoStatus;
  /** The host this service or VM lives on. Drawn as nesting or proximity, never as a wire. */
  host?: string;
  specs?: readonly string[];
  roles?: readonly string[];
  /** An open issue, shown in amber. */
  attention?: string;
  /** A role that is not installed yet, shown dashed. */
  planned?: string;
};
export type EcoLinkKind = "lan" | "dns" | "storage" | "media" | "audio" | "compute" | "metrics";
export type EcoLink = { from: string; to: string; kind: EcoLinkKind; label?: string };
export type EcoWorkflowStop = { node: string; label: string; note?: string };
export type EcoWorkflow = { id: string; title: string; stops: readonly EcoWorkflowStop[]; branches?: readonly (readonly EcoWorkflowStop[])[]; note?: string };

export const ECOSYSTEM_NODES: readonly EcoNode[] = [
  // ---- the three hosts and the VM ----------------------------------------------------------
  { id: "ugfrank", name: "UGFrank", subtitle: "HP Z440 · Services & données", kind: "host", status: "installed",
    specs: ["Xeon E5-1660 v4", "64 Go RAM", "RTX 3080 Ti · 12 Go", "ZFS · 2 × 8 To en miroir"],
    roles: ["Core · OpenClaw · Hermes · DSH", "Whisper GPU · Pocket TTS CPU", "Home Assistant · Immich · Plex", "Prometheus · Grafana", "Voie GPU :11434 · LLM local, gardien, Gemma résident", "Voie CPU :11435 · LLM CPU, travail de fond, zéro VRAM"] },
  { id: "nas", name: "Stockage ZFS", subtitle: "NAS miroir d'UGFrank", kind: "storage", status: "installed", host: "ugfrank",
    specs: ["2 × 8 To en miroir", "Volumes ZFS · Archives et médias"], roles: ["Archives", "Clips du garage · 30 jours", "Médias"] },
  { id: "ugalien", name: "UGAlien", subtitle: "Aurora R12 · IA locale", kind: "host", status: "installed",
    specs: ["Core i9-11900F", "128 Go RAM", "2 × RTX 3090 · 24 Go chacune"],
    roles: ["IA locale · Embeddings · ComfyUI", "Voie GPU · 2 cartes", "Voie CPU :11435 · LLM CPU, embeddings de secours"] },
  { id: "ugbrutal", name: "UGBrutal", subtitle: "Poste Windows · Jeux · Copies", kind: "host", status: "attention",
    specs: ["Ryzen 7 3700X", "64 Go RAM", "RTX 5070 Ti · 16 Go"], roles: ["Poste personnel", "Jeux", "Copies", "Héberge la VM devX"],
    attention: "Disque système : espace libre critique au relevé du 25 octobre" },
  { id: "devx", name: "devX", subtitle: "VM Hyper-V · Développement", kind: "vm", status: "installed", host: "ugbrutal",
    specs: ["8 vCPU · 16 Go attribués", "Debian 12", "Ressources prises sur UGBrutal, sans GPU"], roles: ["Code & tests", "Worktrees"] },
  // ---- services on UGFrank -----------------------------------------------------------------
  { id: "core", name: "AgentX Core", subtitle: "Mémoire · Tâches · Finance", kind: "service", status: "installed", host: "ugfrank",
    roles: ["Conversations", "Tâches à cocher", "Mémoire", "Finance", "Admission STT et GPU", "Réponse canonique"] },
  { id: "nestor", name: "Nestor", subtitle: "OpenClaw / Hermes", kind: "service", status: "installed", host: "ugfrank",
    roles: ["Deux backends de conversation, au choix", "OpenClaw : outils et mémoire du domaine via Core", "Hermes Nestor : historique d'exécution natif"] },
  { id: "dsh", name: "DSH", subtitle: "Code", kind: "service", status: "installed", host: "ugfrank", roles: ["Assistant de code"] },
  { id: "imagex", name: "Hermes imageX", subtitle: "Atelier", kind: "service", status: "installed", host: "ugfrank",
    roles: ["Prépare le brief et les références", "Distinct de Hermes Nestor", "Ne rend rien sans la file Core"] },
  { id: "rag", name: "RAG", subtitle: "Mongo · Qdrant", kind: "service", status: "installed", host: "ugfrank", roles: ["Recherche documentaire", "Vecteurs"] },
  { id: "media", name: "Immich · Plex", subtitle: "Life Atlas", kind: "service", status: "installed", host: "ugfrank", roles: ["Photos", "Vidéos", "Life Atlas"] },
  { id: "homeassistant", name: "Home Assistant", subtitle: "MQTT", kind: "service", status: "installed", host: "ugfrank", roles: ["Capteurs", "Prises", "Caméras", "Smartphone"] },
  { id: "monitoring", name: "Prometheus · Grafana", subtitle: "Supervision de l'ensemble", kind: "service", status: "installed", host: "ugfrank",
    roles: ["Exporters → Prometheus → Grafana", "Observation, pas d'exécution"] },
  // ---- the edge ----------------------------------------------------------------------------
  { id: "piusb", name: "piUSB", subtitle: "Pi 3B+ · Pi-hole + Gatus", kind: "edge", status: "attention",
    specs: ["Debian 13 · USB 8 Go"], roles: ["DNS de la maison", "Sondes indépendantes"], attention: "Alimentation à corriger (sous-tension)" },
  { id: "pit", name: "PI-T", subtitle: "Pi 3B+ · OctoPrint + OctoDash", kind: "edge", status: "attention",
    specs: ["OctoPi · Tactile 3,5 pouces"], roles: ["OctoPrint · OctoDash · EG2", "Imprimante 3D"], attention: "Impression de validation à faire" },
  { id: "babypi", name: "BabyPi", subtitle: "Pi 3B · Garage", kind: "edge", status: "attention",
    specs: ["Wi-Fi · Bluetooth"], roles: ["Caméra · Micro", "Enceinte Bluetooth du téléphone", "Clips vidéo + son vers le NAS · 30 jours"], attention: "IR nocturne / endurance à qualifier" },
  { id: "pitft", name: "piTFT", subtitle: "Pi 4 · 8 Go · Écran 7 pouces", kind: "edge", status: "installed",
    specs: ["Debian 13"], roles: ["Écran installé et accessible"], planned: "Bureau · tableau de bord à préparer (rien d'installé)" },
  // ---- network, clients, outside -----------------------------------------------------------
  { id: "deco", name: "Deco X90", subtitle: "Réseau domestique · 2 bornes", kind: "network", status: "installed", roles: ["Wi-Fi maison", "Appareils connectés"] },
  { id: "browser", name: "Micro / Navigateur", subtitle: "Là où on parle à Nestor", kind: "client", status: "installed" },
  { id: "phone", name: "Téléphone", subtitle: "Audio Bluetooth vers BabyPi", kind: "client", status: "installed", roles: ["La musique est lue sur le téléphone"] },
  { id: "gcal", name: "Google Calendar", subtitle: "Événements & rappels", kind: "external", status: "installed", roles: ["Gestion dans Google, pas de miroir dans Core"] },
  // ---- spare, no role yet ------------------------------------------------------------------
  { id: "ugsmall", name: "UGSmall", subtitle: "Cuisine", kind: "spare", status: "planned", planned: "Cuisine à préparer" },
  { id: "ugstation", name: "UGStation", subtitle: "En réserve", kind: "spare", status: "planned", planned: "Rôle à décider" },
  { id: "ugfrank-old", name: "Ancien UGFrank", subtitle: "En réserve", kind: "spare", status: "planned", planned: "Rôle à décider" },
  { id: "pi123", name: "Pi .123", subtitle: "Identité à confirmer", kind: "spare", status: "planned", planned: "À identifier" },
];

/** Relationships worth a line. Hosting (devX in UGBrutal, services on UGFrank) is nesting, not a wire. */
export const ECOSYSTEM_LINKS: readonly EcoLink[] = [
  { from: "deco", to: "ugfrank", kind: "lan", label: "Réseau local" },
  { from: "deco", to: "ugalien", kind: "lan" },
  { from: "deco", to: "ugbrutal", kind: "lan" },
  { from: "deco", to: "piusb", kind: "dns", label: "DNS" },
  { from: "ugfrank", to: "nas", kind: "storage", label: "Stockage ZFS" },
  { from: "ugfrank", to: "ugalien", kind: "compute", label: "Files GPU" },
  { from: "babypi", to: "nas", kind: "media", label: "Clips vidéo + son · 30 jours" },
  { from: "phone", to: "babypi", kind: "audio", label: "Audio Bluetooth" },
  { from: "ugfrank", to: "monitoring", kind: "metrics" },
  { from: "ugalien", to: "monitoring", kind: "metrics" },
  { from: "ugbrutal", to: "monitoring", kind: "metrics" },
  { from: "piusb", to: "monitoring", kind: "metrics", label: "Sondes indépendantes" },
];

export const ECOSYSTEM_WORKFLOWS: readonly EcoWorkflow[] = [
  { id: "voice", title: "Parler avec Nestor", note: "Capacités partagées via Core. Les deux backends se choisissent, ils ne s'enchaînent pas.",
    stops: [
      { node: "browser", label: "Micro / Navigateur" },
      { node: "core", label: "Core · Admission STT" },
      { node: "ugfrank", label: "Whisper · Frank GPU" },
      { node: "nestor", label: "OpenClaw ou Hermes Nestor" },
      { node: "core", label: "Réponse canonique Core" },
      { node: "ugfrank", label: "Pocket TTS · CPU" },
      { node: "browser", label: "La voix revient" },
    ] },
  { id: "image", title: "Créer une image", note: "imageX est distinct de Hermes Nestor. L'action de l'utilisateur précède la file ; Core gère l'opération et l'archive.",
    stops: [
      { node: "imagex", label: "Brief & références" },
      { node: "core", label: "Action utilisateur → File Core · Admission GPU" },
      { node: "ugalien", label: "ComfyUI" },
      { node: "nas", label: "Archive vérifiée" },
    ] },
  { id: "memory", title: "Mémoire & organisation", note: "Sources, révisions et reçus conservés. Tâches dans Core, événements dans Google : pas de miroir.",
    stops: [
      { node: "media", label: "Activité & archives" },
      { node: "core", label: "Collecte / synthèse / promotion → Mémoire Core" },
      { node: "nestor", label: "Nestor · Life Atlas" },
    ],
    branches: [
      [{ node: "nestor", label: "Nestor" }, { node: "core", label: "Tâches à cocher → Core" }],
      [{ node: "nestor", label: "Nestor" }, { node: "gcal", label: "Événements & rappels → Google Calendar" }],
    ] },
  { id: "garage", title: "Garage · BabyPi", note: "Pas de serveur de musique sur BabyPi : la musique est lue sur le téléphone. IR nocturne et endurance restent à qualifier.",
    stops: [
      { node: "babypi", label: "Caméra + micro · Wi-Fi" },
      { node: "nas", label: "UGFrank · Clips NAS · rétention 30 jours" },
    ],
    branches: [[{ node: "phone", label: "Téléphone" }, { node: "babypi", label: "Audio Bluetooth · enceinte" }]] },
];

const byId = new Map(ECOSYSTEM_NODES.map((node) => [node.id, node]));
export const ecoNode = (id: string): EcoNode | null => byId.get(id) ?? null;
export const ecoNodeIds = (): string[] => ECOSYSTEM_NODES.map((node) => node.id);
export const ecoLinksOf = (id: string): EcoLink[] => ECOSYSTEM_LINKS.filter((link) => link.from === id || link.to === id);
export const ecoServicesOn = (host: string): EcoNode[] => ECOSYSTEM_NODES.filter((node) => node.host === host && node.kind === "service");
/** Open issues, amber on every picture. The seed of the alert feed that is not plugged in yet. */
export const ecoIssues = (): EcoNode[] => ECOSYSTEM_NODES.filter((node) => node.attention);
export const ecoPlanned = (): EcoNode[] => ECOSYSTEM_NODES.filter((node) => node.status === "planned" || node.planned);
export const ecoWorkflow = (id: string): EcoWorkflow | null => ECOSYSTEM_WORKFLOWS.find((workflow) => workflow.id === id) ?? null;

export function ecoCounts(): { hosts: number; vms: number; services: number; edge: number; spare: number; issues: number; links: number } {
  const of = (kind: EcoKind): number => ECOSYSTEM_NODES.filter((node) => node.kind === kind).length;
  return { hosts: of("host"), vms: of("vm"), services: of("service"), edge: of("edge"), spare: of("spare"), issues: ecoIssues().length, links: ECOSYSTEM_LINKS.length };
}

/** Every reference resolves and no id repeats; the tests call it, the app trusts it. */
export function validateEcosystem(): void {
  const seen = new Set<string>();
  for (const node of ECOSYSTEM_NODES) {
    if (!/^[a-z0-9-]{2,24}$/.test(node.id) || seen.has(node.id)) throw new Error(`invalid or duplicate node id: ${node.id}`);
    seen.add(node.id);
    if (node.host && !byId.has(node.host)) throw new Error(`${node.id} names an unknown host ${node.host}`);
    if (node.status === "attention" && !node.attention) throw new Error(`${node.id} is marked attention without an issue`);
  }
  for (const link of ECOSYSTEM_LINKS) {
    if (!byId.has(link.from) || !byId.has(link.to)) throw new Error(`link names an unknown node: ${link.from} → ${link.to}`);
    if (link.from === link.to) throw new Error(`link loops on ${link.from}`);
  }
  for (const workflow of ECOSYSTEM_WORKFLOWS) {
    for (const stop of [...workflow.stops, ...(workflow.branches ?? []).flat()]) {
      if (!byId.has(stop.node)) throw new Error(`workflow ${workflow.id} stops at an unknown node ${stop.node}`);
    }
    if (workflow.stops.length < 2) throw new Error(`workflow ${workflow.id} has no path`);
  }
}

/** One paragraph about a node, in Nestor's voice: what it is, what it runs, what is open. */
export function describeNode(node: EcoNode): string {
  const parts = [`${node.name} · ${node.subtitle}.`];
  if (node.host) { const host = byId.get(node.host); if (host) parts.push(node.kind === "vm" ? `Une machine virtuelle hébergée par ${host.name}, pas un serveur à part.` : `Vit sur ${host.name}.`); }
  if (node.specs?.length) parts.push(`${node.specs.join(" · ")}.`);
  if (node.roles?.length) parts.push(`Rôles : ${node.roles.join(" ; ")}.`);
  if (node.attention) parts.push(`Point ouvert : ${node.attention}.`);
  if (node.planned) parts.push(`Prévu, pas installé : ${node.planned}.`);
  if (node.status === "planned") parts.push("Matériel en réserve, sans rôle : il n'est pas opérationnel.");
  return parts.join(" ");
}
