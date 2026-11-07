export const BALLSY_SPARKLE_SECONDS = 3;
export type BallsyFinish = { subjectId: string; elapsedSeconds: number; sparkleSeconds: number };
export type BallsyFinishStanding = { subjectId: string; run: { phase: string; elapsedSeconds: number } };

/** Presentation follows the authoritative standings. It never awards a lap or a winner. */
export function advanceBallsyFinishes(
  finishes: readonly BallsyFinish[], standings: readonly BallsyFinishStanding[], seconds: number, paused = false,
): BallsyFinish[] {
  return standings.filter(entry => entry.run.phase === "complete").map(entry => {
    const previous = finishes.find(finish => finish.subjectId === entry.subjectId);
    return { subjectId: entry.subjectId, elapsedSeconds: entry.run.elapsedSeconds,
      sparkleSeconds: previous ? Math.min(BALLSY_SPARKLE_SECONDS, previous.sparkleSeconds + (paused ? 0 : Math.max(0, seconds))) : 0 };
  });
}

export function ballsyFinishPlace(index: number): string { return index === 0 ? "1er" : `${index + 1}e`; }
export function ballsyFinishTime(seconds: number): string { return `${seconds.toFixed(3)} s`; }
