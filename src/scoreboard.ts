import type { RaceDefinition } from "./race-definitions";

const STORAGE_KEY = "graphysx-ballz-records-v1";

// Legacy scoring scale from ArduinoGUI/Level.cs:
//   ScoreGold = 100, ScoreSilver = 75, ScoreBronze = 50
export type Medal = "gold" | "silver" | "bronze";

export const MEDAL_POINTS: Record<Medal, number> = {
  gold: 100,
  silver: 75,
  bronze: 50
};

const MEDAL_RANK: Record<Medal, number> = { gold: 3, silver: 2, bronze: 1 };

export type MedalThresholds = {
  goldMs: number;
  silverMs: number;
  bronzeMs: number;
};

export function getMedalThresholds(race: RaceDefinition): MedalThresholds {
  return {
    goldMs: Math.round(race.champion.timeMs * 1.1),
    silverMs: race.targetMs,
    bronzeMs: Math.round(race.targetMs * 1.45)
  };
}

export function medalForTime(race: RaceDefinition, elapsedMs: number): Medal | null {
  const thresholds = getMedalThresholds(race);
  if (elapsedMs <= thresholds.goldMs) {
    return "gold";
  }
  if (elapsedMs <= thresholds.silverMs) {
    return "silver";
  }
  if (elapsedMs <= thresholds.bronzeMs) {
    return "bronze";
  }
  return null;
}

type StoredRecord = {
  bestMs: number;
  rings: number;
  completedAt: string;
  medal?: Medal | null;
};

export type RaceRecord = StoredRecord & {
  holder: string;
  isArchiveChampion: boolean;
};

type StoredRecords = Record<string, StoredRecord>;

export class ScoreboardStore {
  private records: StoredRecords = this.load();

  getRecord(race: RaceDefinition): RaceRecord {
    const local = this.records[race.id];
    if (local && local.bestMs < race.champion.timeMs) {
      return {
        ...local,
        holder: "Local Player",
        isArchiveChampion: false
      };
    }

    return {
      bestMs: race.champion.timeMs,
      rings: race.rings.length,
      completedAt: "Archive era",
      medal: local?.medal ?? null,
      holder: race.champion.name,
      isArchiveChampion: true
    };
  }

  registerFinish(race: RaceDefinition, elapsedMs: number, rings: number): RaceRecord {
    const runMedal = medalForTime(race, elapsedMs);
    const current = this.records[race.id];
    const bestMedal = pickBestMedal(runMedal, current?.medal ?? null);

    if (!current || elapsedMs < current.bestMs) {
      this.records[race.id] = {
        bestMs: elapsedMs,
        rings,
        completedAt: new Date().toISOString(),
        medal: bestMedal
      };
      this.save();
    } else if (bestMedal !== (current.medal ?? null)) {
      this.records[race.id] = { ...current, medal: bestMedal };
      this.save();
    }

    return this.getRecord(race);
  }

  /** best medal earned by the local player on this race, if any */
  getMedal(race: RaceDefinition): Medal | null {
    return this.records[race.id]?.medal ?? null;
  }

  /** legacy Level.cs point value for the best medal on this race */
  getScore(race: RaceDefinition): number {
    const medal = this.getMedal(race);
    return medal ? MEDAL_POINTS[medal] : 0;
  }

  /** has the local player ever completed this race */
  hasCompleted(race: RaceDefinition): boolean {
    return Boolean(this.records[race.id]);
  }

  getAllRecords(races: RaceDefinition[]): RaceRecord[] {
    return races.map((race) => this.getRecord(race));
  }

  private load(): StoredRecords {
    try {
      const value = window.localStorage.getItem(STORAGE_KEY);
      return value ? (JSON.parse(value) as StoredRecords) : {};
    } catch {
      return {};
    }
  }

  private save(): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.records));
    } catch {
      // Local storage is optional; gameplay should not fail if the browser blocks it.
    }
  }
}

function pickBestMedal(a: Medal | null, b: Medal | null): Medal | null {
  if (!a) {
    return b;
  }
  if (!b) {
    return a;
  }
  return MEDAL_RANK[a] >= MEDAL_RANK[b] ? a : b;
}

export function formatMedal(medal: Medal | null): string {
  return medal ? medal.toUpperCase() : "—";
}

export function formatRaceTime(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}:${seconds.toFixed(2).padStart(5, "0")}` : `${seconds.toFixed(2)}s`;
}
