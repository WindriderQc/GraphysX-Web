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

// ---------------------------------------------------------------------------
// Platform level records — the win panel's data.
//
// `ScoreboardStore` above is keyed on a legacy `RaceDefinition` (champion time, ring list),
// which a platform grid level does not have. Levels are keyed by their library id and carry
// at most one reference time — the archive's `ScoreBest` where one was recovered — so this
// store keeps its own shape rather than forging fake RaceDefinitions.
// ---------------------------------------------------------------------------

const LEVEL_STORAGE_KEY = "graphysx-level-records-v1";

export type LevelRecord = {
  bestMs: number;
  medal: Medal | null;
  completedAt: string;
};

/** Everything the win panel shows about one finished run. */
export type LevelFinishSummary = {
  levelId: string;
  elapsedMs: number;
  /** Medal for THIS run, or null when the run missed bronze or the level has no reference time. */
  medal: Medal | null;
  /** Best medal ever earned on this level (this run included, when it was recorded). */
  bestMedal: Medal | null;
  /** Best time on this level after this run was considered. */
  bestMs: number;
  /** The best BEFORE this run, or null on a first completion — what the delta reads against. */
  previousBestMs: number | null;
  isNewBest: boolean;
};

/**
 * Medal thresholds against a reference time (the archive's recovered `ScoreBest` for that
 * level). The ratios mirror the legacy Level.cs scale: gold hugs the reference the way
 * `getMedalThresholds` hugs the champion (×1.1), silver and bronze widen the way target
 * (~×1.35 of a champion run) and ×1.45-of-target did.
 */
export function levelMedalForTime(referenceMs: number | null, elapsedMs: number): Medal | null {
  if (referenceMs === null || referenceMs <= 0) return null;
  if (elapsedMs <= referenceMs * 1.1) return "gold";
  if (elapsedMs <= referenceMs * 1.35) return "silver";
  if (elapsedMs <= referenceMs * 1.95) return "bronze";
  return null;
}

export class LevelRecordStore {
  private records: Record<string, LevelRecord> = this.load();

  getRecord(levelId: string): LevelRecord | null {
    return this.records[levelId] ?? null;
  }

  /** Record a verified finish and describe it. Persists the new best/medal when earned. */
  registerFinish(levelId: string, elapsedMs: number, referenceMs: number | null): LevelFinishSummary {
    const previous = this.records[levelId] ?? null;
    const runMedal = levelMedalForTime(referenceMs, elapsedMs);
    const bestMedal = pickBestMedal(runMedal, previous?.medal ?? null);
    const isNewBest = !previous || elapsedMs < previous.bestMs;
    const bestMs = previous ? Math.min(previous.bestMs, elapsedMs) : elapsedMs;
    if (isNewBest || bestMedal !== (previous?.medal ?? null)) {
      this.records[levelId] = {
        bestMs,
        medal: bestMedal,
        completedAt: new Date().toISOString(),
      };
      this.save();
    }
    return {
      levelId,
      elapsedMs,
      medal: runMedal,
      bestMedal,
      bestMs,
      previousBestMs: previous?.bestMs ?? null,
      isNewBest,
    };
  }

  /**
   * Describe a finish WITHOUT recording it — for desynced runs, whose evidence had a gap.
   * The run is still won and still shown; its time just never becomes a stored best.
   */
  summarize(levelId: string, elapsedMs: number, referenceMs: number | null): LevelFinishSummary {
    const previous = this.records[levelId] ?? null;
    return {
      levelId,
      elapsedMs,
      medal: levelMedalForTime(referenceMs, elapsedMs),
      bestMedal: previous?.medal ?? null,
      bestMs: previous?.bestMs ?? elapsedMs,
      previousBestMs: previous?.bestMs ?? null,
      isNewBest: false,
    };
  }

  private load(): Record<string, LevelRecord> {
    try {
      const value = window.localStorage.getItem(LEVEL_STORAGE_KEY);
      return value ? (JSON.parse(value) as Record<string, LevelRecord>) : {};
    } catch {
      return {};
    }
  }

  private save(): void {
    try {
      window.localStorage.setItem(LEVEL_STORAGE_KEY, JSON.stringify(this.records));
    } catch {
      // Local storage is optional; gameplay should not fail if the browser blocks it.
    }
  }
}

/** Signed gap between a run and the best it is measured against, e.g. "+2.41s" / "−0.30s". */
export function formatTimeDelta(deltaMs: number): string {
  const sign = deltaMs >= 0 ? "+" : "−";
  return `${sign}${(Math.abs(deltaMs) / 1000).toFixed(2)}s`;
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
