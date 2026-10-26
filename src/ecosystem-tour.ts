/**
 * Nestor's tour of the house: the list of stops a host page (or Nestor through Core) asks the
 * view to play, as a short comma-separated vocabulary, and the player that walks it.
 *
 *   play="overview,frank,services,alien,brutal,network,edge,voice,image,memory,garage,watch,summary"
 *   play="watch"                      — only the open issues
 *   play="node-babypi,garage"         — one machine, then its workflow
 *
 * Every stop is a picture plus a narration: which nodes to light, which arcs to draw, what
 * Nestor says. None of it edits the scene document or reaches any service. Pure: no three.js,
 * no DOM, so the same module is tested under Node and bundled for the page.
 */
import { describeNode, ecoCounts, ecoIssues, ecoLinksOf, ecoNode, ecoPlanned, ecoServicesOn, ecoWorkflow, ECOSYSTEM_LINKS, ECOSYSTEM_SNAPSHOT_DATE, type EcoLink, type EcoWorkflowStop } from "./ecosystem-data";

export type TourSceneKind = "overview" | "frank" | "services" | "alien" | "brutal" | "network" | "edge" | "spare" | "voice" | "image" | "memory" | "garage" | "watch" | "summary";
export type TourStep = { kind: TourSceneKind } | { kind: "node"; id: string };
const SCENES: readonly TourSceneKind[] = ["overview", "frank", "services", "alien", "brutal", "network", "edge", "spare", "voice", "image", "memory", "garage", "watch", "summary"];
export const DEFAULT_TOUR = "overview,frank,services,alien,brutal,network,edge,voice,image,memory,garage,watch,summary";
export const TOUR_MAX_STEPS = 32;

/** Seconds a stop holds while playing. Long enough to read Nestor, short enough not to wait. */
export function tourStepSeconds(step: TourStep): number {
  switch (step.kind) {
    case "overview": return 7;
    case "summary": return 12;
    case "voice": case "memory": return 12;
    case "node": return 9;
    default: return 10;
  }
}

/** Parse a `play` list. Unknown words are refused, not skipped: the host asked for something. */
export function parseTour(text: string): TourStep[] {
  if (typeof text !== "string" || text.length > 2000) throw new Error("play must be a short list of stops");
  const words = text.split(",").map((word) => word.trim().toLowerCase()).filter(Boolean);
  if (!words.length) throw new Error("play must name at least one stop");
  if (words.length > TOUR_MAX_STEPS) throw new Error(`play names at most ${TOUR_MAX_STEPS} stops`);
  return words.map((word): TourStep => {
    if ((SCENES as readonly string[]).includes(word)) return { kind: word as TourSceneKind };
    const node = /^node-([a-z0-9-]{2,24})$/.exec(word);
    if (node && ecoNode(node[1])) return { kind: "node", id: node[1] };
    throw new Error(`unknown play stop: ${word.slice(0, 80)}`);
  });
}
export const tourText = (steps: readonly TourStep[]): string => steps.map((step) => (step.kind === "node" ? `node-${step.id}` : step.kind)).join(",");

export function tourStepLabel(step: TourStep): string {
  switch (step.kind) {
    case "overview": return "Vue d'ensemble";
    case "frank": return "UGFrank";
    case "services": return "Les services";
    case "alien": return "UGAlien";
    case "brutal": return "UGBrutal · devX";
    case "network": return "Le réseau";
    case "edge": return "En bordure";
    case "spare": return "En réserve";
    case "voice": return "Parler avec Nestor";
    case "image": return "Créer une image";
    case "memory": return "Mémoire & organisation";
    case "garage": return "Garage · BabyPi";
    case "watch": return "Surveillance & points ouverts";
    case "summary": return "Résumé";
    case "node": return ecoNode(step.id)?.name ?? step.id;
  }
}

/** What a stop lights and says. `focus` are outlined, `flow` arcs carry a moving bead, `amber` marks issues. */
export type TourPicture = {
  title: string;
  narration: string;
  focus: readonly string[];
  amber: readonly string[];
  flow: readonly { from: string; to: string; label?: string }[];
  /** Frame the whole plateau instead of the focus. */
  wide: boolean;
};

const chain = (stops: readonly EcoWorkflowStop[]): { from: string; to: string; label?: string }[] => {
  const arcs: { from: string; to: string; label?: string }[] = [];
  for (let index = 1; index < stops.length; index += 1) {
    if (stops[index - 1].node !== stops[index].node) arcs.push({ from: stops[index - 1].node, to: stops[index].node, label: stops[index].label });
  }
  return arcs;
};
const workflowPicture = (id: string, narration: string): TourPicture => {
  const workflow = ecoWorkflow(id);
  if (!workflow) throw new Error(`unknown workflow ${id}`);
  const stops = [...workflow.stops, ...(workflow.branches ?? []).flat()];
  return {
    title: workflow.title, narration: `${narration} ${workflow.note ?? ""}`.trim(),
    focus: [...new Set(stops.map((stop) => stop.node))], amber: [],
    flow: [...chain(workflow.stops), ...(workflow.branches ?? []).flatMap(chain)], wide: false,
  };
};
const names = (ids: readonly string[]): string => ids.map((id) => ecoNode(id)?.name ?? id).join(", ");

export function tourPicture(step: TourStep): TourPicture {
  const counts = ecoCounts();
  const issues = ecoIssues();
  switch (step.kind) {
    case "overview": return {
      title: "AgentX · La maison connectée", wide: true, focus: [], amber: [], flow: [],
      narration: `Bienvenue dans la maison, telle qu'elle est le ${ECOSYSTEM_SNAPSHOT_DATE}. ${counts.hosts} hôtes physiques, ${counts.vms} machine virtuelle, ${counts.services} services qui vivent presque tous sur UGFrank, ${counts.edge} Raspberry Pi en bordure du réseau, et ${counts.spare} machines en réserve. Plein : installé. Pointillé : prévu. Ambre : un point à régler. Rien ici ne prétend que tout va bien ; c'est une carte des relations, pas un tableau de bord.`,
    };
    case "frank": return {
      title: "UGFrank · Services & données", wide: false, focus: ["ugfrank", "nas"], amber: [],
      flow: [{ from: "ugfrank", to: "nas", label: "Stockage ZFS" }],
      narration: `UGFrank est le cœur de la maison : un HP Z440, Xeon E5-1660 v4, 64 Go de RAM, une RTX 3080 Ti de 12 Go, et deux disques de 8 To en miroir ZFS. Il porte Core, OpenClaw, Hermes et DSH, Whisper sur le GPU et Pocket TTS sur le CPU, Home Assistant, Immich, Plex, Prometheus et Grafana. Deux voies d'inférence cohabitent : la voie GPU sur le port 11434, avec le gardien et Gemma résident, et la voie CPU sur le port 11435, zéro VRAM, pour le travail de fond. Le miroir ZFS est du stockage, pas une sauvegarde indépendante.`,
    };
    case "services": {
      const services = ecoServicesOn("ugfrank").map((node) => node.id);
      return {
        title: "Les services, tous sur UGFrank", wide: false, focus: services, amber: [],
        flow: services.map((id) => ({ from: id, to: "ugfrank" })),
        narration: `Huit groupes logiques, tous sur UGFrank. AgentX Core tient les conversations, les tâches, la mémoire et la finance. Nestor a deux backends de conversation au choix : OpenClaw, qui passe par Core pour les outils et la mémoire du domaine, et Hermes Nestor, qui garde son historique d'exécution natif. DSH pour le code, Hermes imageX pour l'atelier d'images, distinct de Hermes Nestor. RAG sur Mongo et Qdrant. Immich, Plex et Life Atlas pour les médias. Home Assistant et MQTT pour la maison. Prometheus et Grafana pour regarder l'ensemble.`,
      };
    }
    case "alien": return {
      title: "UGAlien · IA locale", wide: false, focus: ["ugalien"], amber: [],
      flow: [{ from: "ugfrank", to: "ugalien", label: "Files GPU" }],
      narration: `UGAlien, un Aurora R12 : Core i9-11900F, 128 Go de RAM et exactement deux RTX 3090 de 24 Go. C'est la voie GPU lourde de la maison : IA locale, embeddings et ComfyUI, une voie GPU qui s'étend sur les deux cartes et une voie CPU sur le port 11435 pour le LLM de fond et les embeddings de secours. Les files viennent de Core, sur UGFrank.`,
    };
    case "brutal": return {
      title: "UGBrutal héberge devX", wide: false, focus: ["ugbrutal", "devx"], amber: ["ugbrutal"], flow: [],
      narration: `UGBrutal, le poste Windows : Ryzen 7 3700X, 64 Go de RAM, RTX 5070 Ti de 16 Go. Poste personnel, jeux, copies. À l'intérieur, en pointillé, devX : une VM Hyper-V sous Debian 12 avec 8 vCPU et 16 Go pris sur UGBrutal, sans GPU. C'est là que le code se développe et se teste. devX n'est jamais un serveur à part : si UGBrutal s'éteint, devX aussi. Point ouvert au relevé du 25 octobre : l'espace libre du disque système est critique.`,
    };
    case "network": return {
      title: "Le réseau domestique", wide: false, focus: ["deco", "piusb", "ugfrank", "ugalien", "ugbrutal"], amber: [],
      flow: ECOSYSTEM_LINKS.filter((link) => link.kind === "lan" || link.kind === "dns").map((link) => ({ from: link.from, to: link.to, label: link.label })),
      narration: `Deux bornes Deco X90 font le Wi-Fi de la maison et relient les trois hôtes. Le DNS de tout le monde passe par piUSB, avec Pi-hole, et Gatus y fait des sondes indépendantes du reste. Les commutateurs de réserve ne sont pas branchés : ils ne sont pas dessinés comme actifs.`,
    };
    case "edge": return {
      title: "Périphériques en bordure du réseau", wide: false, focus: ["piusb", "pit", "babypi", "pitft"], amber: issues.filter((node) => node.kind === "edge").map((node) => node.id), flow: [],
      narration: `Quatre Raspberry Pi. piUSB, un Pi 3B+ sous Debian 13 sur clé USB : Pi-hole et Gatus, et une alimentation à corriger. PI-T, un Pi 3B+ sous OctoPi avec son écran tactile : OctoPrint et OctoDash pour l'imprimante 3D, une impression de validation encore à faire. BabyPi, un Pi 3B au garage : caméra, micro, audio Bluetooth du téléphone, et des clips envoyés au NAS pour trente jours. piTFT, un Pi 4 de 8 Go avec un écran de 7 pouces : l'écran est installé et accessible, le tableau de bord du bureau, lui, n'existe pas encore.`,
    };
    case "spare": return {
      title: "Prévu / sans rôle", wide: false, focus: ecoPlanned().filter((node) => node.status === "planned").map((node) => node.id), amber: [], flow: [],
      narration: `Dans le coin pointillé, le matériel reçu sans rôle : UGSmall, destiné à la cuisine ; UGStation ; l'ancien UGFrank ; et un Pi en .123 dont l'identité reste à confirmer. Rien de tout cela n'est opérationnel, et la liste ne prétend pas être complète.`,
    };
    case "voice": return workflowPicture("voice", "Parler avec Nestor. Le micro ou le navigateur envoie la voix à Core, qui l'admet ; Whisper transcrit sur le GPU de Frank ; la réponse vient d'OpenClaw ou de Hermes Nestor, au choix ; Core la rend canonique ; Pocket TTS la lit sur le CPU. Aucun nom de modèle n'est gravé ici.");
    case "image": return workflowPicture("image", "Créer une image. imageX prépare le brief et les références ; l'utilisateur valide ; la file Core admet le travail sur le GPU ; ComfyUI rend sur UGAlien ; l'archive vérifiée revient au stockage.");
    case "memory": return workflowPicture("memory", "Mémoire et organisation. L'activité et les archives sont collectées, synthétisées et promues dans la mémoire Core, que Nestor restitue dans Life Atlas. À côté, deux fourches distinctes : les tâches à cocher vont dans Core, les événements et rappels dans Google Calendar.");
    case "garage": return workflowPicture("garage", "Le garage. La caméra et le micro de BabyPi envoient des clips vidéo et son au NAS d'UGFrank, gardés trente jours. Le téléphone joue sa musique sur l'enceinte de BabyPi en Bluetooth.");
    case "watch": return {
      title: "Surveillance et points ouverts", wide: false,
      focus: ["monitoring", ...issues.map((node) => node.id)], amber: issues.map((node) => node.id),
      flow: ECOSYSTEM_LINKS.filter((link) => link.kind === "metrics").map((link) => ({ from: link.from, to: link.to, label: link.label })),
      narration: `Les exporters remontent vers Prometheus, Grafana dessine les tableaux ; c'est de l'observation, pas une permission d'agir. piUSB sonde à part. ${issues.length} points ouverts, en ambre : ${issues.map((node) => `${node.name}, ${node.attention!.toLowerCase()}`).join(" ; ")}. Quand les alertes vivantes arriveront, c'est ici qu'elles s'allumeront.`,
    };
    case "summary": return {
      title: "Résumé", wide: true, focus: [], amber: issues.map((node) => node.id), flow: [],
      narration: `${counts.hosts} hôtes, ${counts.vms} VM hébergée, ${counts.services} services sur UGFrank, ${counts.edge} Pi en bordure, ${counts.spare} machines en réserve, ${counts.links} liens dessinés, ${counts.issues} points ouverts. Installé ne veut pas dire entièrement qualifié. Source : docs/ECOSYSTEM.md, au ${ECOSYSTEM_SNAPSHOT_DATE}.`,
    };
    case "node": {
      const node = ecoNode(step.id)!;
      const links = ecoLinksOf(node.id);
      const neighbours = links.map((link) => (link.from === node.id ? link.to : link.from));
      const related = node.kind === "host" ? ecoServicesOn(node.id).map((service) => service.id) : node.host ? [node.host] : [];
      return {
        title: `${node.name} · ${node.subtitle}`, wide: false,
        focus: [node.id, ...related, ...neighbours], amber: node.attention ? [node.id] : [],
        flow: links.map((link: EcoLink) => ({ from: link.from, to: link.to, label: link.label })),
        narration: `${describeNode(node)}${neighbours.length ? ` Relié à : ${names(neighbours)}.` : ""}${related.length && node.kind === "host" ? ` Porte : ${names(related)}.` : ""}`,
      };
    }
  }
}

/**
 * Walks the list on the host's frame clock. Playing advances stop by stop; the last stop holds.
 */
export function createTourPlayer(initial: readonly TourStep[]) {
  let steps: TourStep[] = [...initial];
  let index = 0, elapsed = 0, playing = false;
  const clamp = (value: number): number => Math.max(0, Math.min(steps.length - 1, value));
  return {
    state: () => ({ index, count: steps.length, playing, elapsed, step: steps[index] ?? null, seconds: steps[index] ? tourStepSeconds(steps[index]) : 0 }),
    steps: (): readonly TourStep[] => steps,
    replace(next: readonly TourStep[]): void { if (!next.length) throw new Error("empty tour"); steps = [...next]; index = 0; elapsed = 0; },
    play(): void { if (index === steps.length - 1 && elapsed >= tourStepSeconds(steps[index])) { index = 0; elapsed = 0; } playing = true; },
    pause(): void { playing = false; },
    goto(next: number): boolean { const target = clamp(next); const moved = target !== index; index = target; elapsed = 0; return moved; },
    next(): boolean { return this.goto(index + 1); },
    previous(): boolean { return this.goto(index - 1); },
    /** Advance the clock. Returns true when the stop changed. */
    tick(delta: number): boolean {
      if (!playing || !Number.isFinite(delta) || delta <= 0) return false;
      elapsed += delta;
      if (elapsed < tourStepSeconds(steps[index])) return false;
      if (index >= steps.length - 1) { playing = false; elapsed = tourStepSeconds(steps[index]); return false; }
      index += 1; elapsed = 0;
      return true;
    },
  };
}
export type TourPlayer = ReturnType<typeof createTourPlayer>;
