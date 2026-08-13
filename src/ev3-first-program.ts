import type { AgentWorldSteerInput } from "./agent-world-runtime";

/** A deliberately tiny first language: enough to express and debug motion, nothing more. */
export type Ev3FirstProgramBlockId = "forward" | "left" | "right" | "stop";

export type Ev3FirstProgramBlock = {
  id: Ev3FirstProgramBlockId;
  label: string;
  shortLabel: string;
  glyph: string;
  durationSeconds: number;
  input: AgentWorldSteerInput;
};

export const EV3_FIRST_PROGRAM_MAX_BLOCKS = 6;

export const EV3_FIRST_PROGRAM_BLOCKS: Readonly<Record<Ev3FirstProgramBlockId, Ev3FirstProgramBlock>> = {
  forward: {
    id: "forward",
    label: "Forward",
    shortLabel: "Fwd",
    glyph: "▲",
    durationSeconds: 0.9,
    // Preserve the heading established by an earlier turn. A Forward block that writes an
    // absolute north heading makes every Left / Right block before it decorative.
    input: { thrust: 1, turn: 0 },
  },
  left: {
    id: "left",
    label: "Left",
    shortLabel: "Left",
    glyph: "↶",
    // The EV3 scene turns at 160°/s, so 0.55s is a readable near-quarter-turn (88°).
    durationSeconds: 0.55,
    input: { thrust: 0, turn: -1 },
  },
  right: {
    id: "right",
    label: "Right",
    shortLabel: "Right",
    glyph: "↷",
    durationSeconds: 0.55,
    input: { thrust: 0, turn: 1 },
  },
  stop: {
    id: "stop",
    label: "Stop",
    shortLabel: "Stop",
    glyph: "■",
    durationSeconds: 0.45,
    input: { thrust: 0, turn: 0 },
  },
};

export type Ev3FirstProgramRunnerState = {
  running: boolean;
  activeIndex: number | null;
  blockElapsedSeconds: number;
};

export type Ev3FirstProgramRunner = {
  start: (program: readonly Ev3FirstProgramBlockId[]) => boolean;
  advance: (deltaSeconds: number) => void;
  stop: () => void;
  state: () => Ev3FirstProgramRunnerState;
};

/**
 * Executes a bounded sequence as inputs over time.
 *
 * It knows nothing about the mission or DOM. The caller supplies the same steer path used by a
 * human or an agent, and decides what a completed sequence means in the current scene.
 */
export function createEv3FirstProgramRunner(
  applyInput: (input: AgentWorldSteerInput) => void,
  onBlock: (index: number, block: Ev3FirstProgramBlock) => void,
  onFinished: () => void,
): Ev3FirstProgramRunner {
  let program: Ev3FirstProgramBlockId[] = [];
  let running = false;
  let activeIndex: number | null = null;
  let blockElapsedSeconds = 0;

  const stopInput = (): void => applyInput({ thrust: 0, turn: 0 });
  const applyActive = (): void => {
    if (activeIndex === null) return;
    const block = EV3_FIRST_PROGRAM_BLOCKS[program[activeIndex]];
    applyInput(block.input);
    onBlock(activeIndex, block);
  };

  const stop = (): void => {
    running = false;
    activeIndex = null;
    blockElapsedSeconds = 0;
    stopInput();
  };

  return {
    start(nextProgram) {
      stop();
      program = nextProgram.slice(0, EV3_FIRST_PROGRAM_MAX_BLOCKS);
      if (program.length === 0) return false;
      running = true;
      activeIndex = 0;
      applyActive();
      return true;
    },
    advance(deltaSeconds) {
      if (!running || activeIndex === null || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
      blockElapsedSeconds += deltaSeconds;
      while (running && activeIndex !== null) {
        const duration = EV3_FIRST_PROGRAM_BLOCKS[program[activeIndex]].durationSeconds;
        if (blockElapsedSeconds < duration) break;
        blockElapsedSeconds -= duration;
        activeIndex += 1;
        if (activeIndex >= program.length) {
          stop();
          onFinished();
          break;
        }
        applyActive();
      }
    },
    stop,
    state: () => ({ running, activeIndex, blockElapsedSeconds }),
  };
}
