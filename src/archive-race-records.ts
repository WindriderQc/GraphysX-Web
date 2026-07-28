import { ARCHIVE_BALLZ_LEVELS } from "./archive-ballz-levels";

/** The id shared by the win board, Archive Cup and personal-ghost storage. */
export function raceRecordIdForWorld(worldId: string): string | null {
  if (!worldId) return null;
  return worldId.startsWith("ballz-level-") ? worldId.slice("ballz-level-".length) : worldId;
}

/** Recovered ScoreBest reference, where the archive actually preserved one. */
export function archiveReferenceMs(recordId: string): number | null {
  const level = ARCHIVE_BALLZ_LEVELS.find((entry) => entry.id === recordId);
  const value = level?.provenance.levelListFacts.scoreBestMs;
  if (typeof value === "number" && value > 0) return value;
  return recordId === "archive-level3-v2" ? 158507.313 : null;
}
