import type { VolcanoState, VolcanoCommand } from "../src/ballsy-volcano";
export type BallsySnapshot = {
  roundId: string;
  phase: "lobby" | "countdown" | "racing" | "paused" | "results";
  ally: number | null;
  volcano: VolcanoState;
  players: Array<{ id: string; position: [number, number, number]; lap: number; finished: boolean }>;
};
export function parseGiantCommand(value: unknown): VolcanoCommand | null;
export function isBallsySnapshot(value: unknown): value is BallsySnapshot;
