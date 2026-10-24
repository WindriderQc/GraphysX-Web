/**
 * Story mode "Jobe": the film's VR scenes as chapters, in film order, then the inspired boards,
 * ending with Cyberjobe. Each success makes Jobe a little faster, as his mind grows in the film.
 */
import type { SectorKind } from "./track";

export type Objective =
  | { kind: "time"; seconds: number }
  | { kind: "win" }
  | { kind: "rings"; count: number }
  | { kind: "hits"; max: number }
  | { kind: "survive" };

export interface Chapter {
  id: number;
  title: string;
  /** Where the scene comes from (film timestamp or "inspiré"). */
  source: string;
  plan: SectorKind[];
  /** Metres per board. */
  perSector: number;
  /** Peter races as the computer; otherwise Jobe flies alone. */
  rival: boolean;
  objective: Objective;
  story: string;
  /** Optional film clip name in film/ (story-N.mp4), cut by the extraction script. */
  clip: string;
}

export const CHAPTERS: Chapter[] = [
  {
    id: 1,
    title: "LE JEU DE GUERRE",
    source: "00:01:36",
    plan: ["thorns"],
    perSector: 1100,
    rival: false,
    objective: { kind: "time", seconds: 18 },
    story:
      "Laboratoire Virtual Space Industries. Le programme militaire entraîne ses sujets dans un jeu de guerre virtuel : collines dorées, épines, troncs piégés. Prouve que le simulateur peut être piloté.",
    clip: "story-1"
  },
  {
    id: 2,
    title: "LA COURSE AVEC PETER",
    source: "00:40:17",
    plan: ["tunnel", "mines", "shards"],
    perSector: 800,
    rival: true,
    objective: { kind: "win" },
    story:
      "Dans la remise, Jobe et Peter branchent les casques. Le menu bleu, la boule noire, et la course commence : le tunnel vert, les mines, les cristaux. Peter connaît le jeu par cœur. Bats-le.",
    clip: "story-2"
  },
  {
    id: 3,
    title: "ACCÉLÉRATION",
    source: "01:00:20",
    plan: ["kaleido"],
    perSector: 1000,
    rival: false,
    objective: { kind: "rings", count: 4 },
    story:
      "Les séances s'intensifient. L'esprit de Jobe absorbe tout : une spirale de dalles, des sceaux électriques, des éclairs. Attrape le savoir au vol : au moins quatre anneaux.",
    clip: "story-3"
  },
  {
    id: 4,
    title: "LE RÉSEAU",
    source: "01:14:15",
    plan: ["wave"],
    perSector: 1100,
    rival: false,
    objective: { kind: "time", seconds: 19 },
    story:
      "Jobe tend la main vers le réseau. WARNING. Une nappe d'or se soulève au-dessus du globe électrique. Traverse-la avant que le système ne réagisse.",
    clip: "story-4"
  },
  {
    id: 5,
    title: "PARE-FEU",
    source: "inspiré de 01:57:40",
    plan: ["network"],
    perSector: 1100,
    rival: false,
    objective: { kind: "hits", max: 2 },
    story:
      "NETWORK ACCESS GRANTED. Les couloirs de données de l'entreprise s'ouvrent, gardés par des pare-feux. Trouve la case ouverte à chaque barrage : deux chocs au plus.",
    clip: "story-5"
  },
  {
    id: 6,
    title: "LA COLÈRE",
    source: "inspiré de 01:35:20",
    plan: ["furnace"],
    perSector: 1100,
    rival: true,
    objective: { kind: "win" },
    story:
      "Le pouvoir monte trop vite. Le monde virtuel s'embrase : colonnes de feu, mer de lave. Peter tente de te suivre pour te ramener. Reste devant.",
    clip: "story-6"
  },
  {
    id: 7,
    title: "CYBERJOBE",
    source: "02:04:58",
    plan: ["vortex"],
    perSector: 1300,
    rival: false,
    objective: { kind: "survive" },
    story:
      "Jobe abandonne son corps et devient Cyberjobe. Dans le monde hexagonal, il lance le compte à rebours et ferme les portes : ACCESS DENIED. Traverse le vortex avant zéro.",
    clip: "story-7"
  }
];

export interface StoryProgress {
  /** Highest chapter completed (0 = none). */
  completed: number;
}

const KEY = "graphysx.cyberRace.story";

export function loadProgress(): StoryProgress {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (raw && typeof raw === "object" && Number.isInteger((raw as StoryProgress).completed)) {
      const completed = Math.max(0, Math.min(CHAPTERS.length, (raw as StoryProgress).completed));
      return { completed };
    }
  } catch {
    // Fall through to a fresh start.
  }
  return { completed: 0 };
}

export function saveProgress(progress: StoryProgress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    // Progress simply is not kept.
  }
}

/** Jobe's growth after `completed` chapters: multipliers on cruise, turbo and agility. */
export function evolution(completed: number): { cruise: number; boost: number; agility: number } {
  return {
    cruise: 1 + 0.035 * completed,
    boost: 1 + 0.08 * completed,
    agility: 1 + 0.05 * completed
  };
}

export function objectiveText(o: Objective): string {
  switch (o.kind) {
    case "time":
      return `ARRIVER EN MOINS DE ${o.seconds} S`;
    case "win":
      return "ARRIVER AVANT PETER";
    case "rings":
      return `PRENDRE AU MOINS ${o.count} ANNEAUX ET ARRIVER`;
    case "hits":
      return `ARRIVER AVEC ${o.max} CHOCS AU PLUS`;
    case "survive":
      return "ARRIVER AVANT LA FIN DU COMPTE À REBOURS";
  }
}

export interface ChapterRun {
  finished: boolean;
  destroyed: boolean;
  place: number;
  time: number;
  rings: number;
  hits: number;
}

export function objectiveMet(o: Objective, run: ChapterRun): boolean {
  if (!run.finished || run.destroyed) return false;
  switch (o.kind) {
    case "time":
      return run.time <= o.seconds;
    case "win":
      return run.place === 1;
    case "rings":
      return run.rings >= o.count;
    case "hits":
      return run.hits <= o.max;
    case "survive":
      return true;
  }
}
