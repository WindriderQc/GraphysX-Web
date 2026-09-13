import type { LlmXEntranceTiming } from "./llmx-contracts";

export type LlmXEntranceState = {
  phase: "loading" | "entering" | "ready" | "disposed";
  elapsedSeconds: number;
  assembly: number;
  cameraProgress: number;
};

/** Pure visual clock, advanced by the host. Reaching ready never generates or plays a greeting. */
export function createLlmXEntrance(timing: LlmXEntranceTiming, reducedMotion = false) {
  for (const value of Object.values(timing)) {
    if (!Number.isFinite(value) || value < 0) throw new RangeError("Entrance timing must be finite and non-negative");
  }
  // Copy the authored values: later document edits must not change an entrance already in flight.
  const { cameraSeconds, assemblyDelaySeconds, assemblySeconds } = timing;
  const duration = Math.max(cameraSeconds, assemblyDelaySeconds + assemblySeconds);
  let phase: LlmXEntranceState["phase"] = "loading";
  let elapsedSeconds = 0;
  let skipRequested = reducedMotion;

  const progress = (time: number, length: number): number =>
    length === 0 ? (time >= 0 ? 1 : 0) : Math.min(1, Math.max(0, time / length));

  const state = (): LlmXEntranceState => ({
    phase,
    elapsedSeconds,
    assembly: phase === "loading" || phase === "disposed" ? 0 : progress(elapsedSeconds - assemblyDelaySeconds, assemblySeconds),
    cameraProgress: phase === "loading" || phase === "disposed" ? 0 : progress(elapsedSeconds, cameraSeconds),
  });
  const settle = () => { if (phase === "entering" && elapsedSeconds >= duration) phase = "ready"; };

  return {
    state,
    assetsReady(): LlmXEntranceState {
      if (phase !== "loading") return state();
      phase = "entering";
      if (skipRequested) elapsedSeconds = duration;
      settle();
      return state();
    },
    advance(deltaSeconds: number): LlmXEntranceState {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new RangeError("Entrance delta must be finite and non-negative");
      if (phase === "entering") {
        elapsedSeconds = Math.min(duration, elapsedSeconds + deltaSeconds);
        settle();
      }
      return state();
    },
    skip(): LlmXEntranceState {
      skipRequested = true;
      if (phase === "entering") {
        elapsedSeconds = duration;
        settle();
      }
      return state();
    },
    dispose(): void { phase = "disposed"; },
  };
}
