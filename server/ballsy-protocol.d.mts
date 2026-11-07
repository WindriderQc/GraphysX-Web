import type { VolcanoState, VolcanoCommand } from "../src/ballsy-volcano";
import type { BallsySlimeCommand, BallsySlimeSnapshot } from "../src/ballsy-slime";
export type GiantCommand = VolcanoCommand | BallsySlimeCommand;
export const BALLSY_SLIME_LIMITS: Readonly<{ gravity:number; maximumSpeed:number; radius:number; cooldown:number; projectileSeconds:number; splatSeconds:number; splatRadius:number; slowSeconds:number; immunitySeconds:number; minimumSpeedFactor:number; maxProjectiles:number; maxSplats:number; maxThrows:number }>;
export type BallsySnapshot = {
  roundId: string;
  phase: "lobby" | "countdown" | "racing" | "paused" | "results";
  ally: number | null;
  volcano: VolcanoState;
  slime?: BallsySlimeSnapshot;
  players: Array<{ id: string; position: [number, number, number]; lap: number; finished: boolean }>;
};
export function parseGiantCommand(value: unknown): GiantCommand | null;
export function isBallsySnapshot(value: unknown): value is BallsySnapshot;

export function isBallsySlimeSnapshot(value: unknown): value is BallsySlimeSnapshot;
