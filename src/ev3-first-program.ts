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

export const EV3_PROGRAM_STORAGE_KEY = "graphysx:kidx:first-drive:programs:v1";
export const EV3_PROGRAM_NAME_MAX_LENGTH = 40;
const PROGRAM_LIBRARY_SCHEMA = "graphysx.kidx-first-drive-programs/v1";

export type Ev3SavedProgram = {
  name: string;
  blocks: Ev3FirstProgramBlockId[];
  updatedAt: number;
};
type ProgramStoreResult<T> = { ok: true; value: T } | { ok: false; error: string };
type ProgramStorage = Pick<Storage, "getItem" | "setItem">;

const programKey = (name: string): string => name.normalize("NFC").trim().toLowerCase();
const sameSavedProgram = (left: Ev3SavedProgram, right: Ev3SavedProgram): boolean =>
  left.name === right.name && left.updatedAt === right.updatedAt
  && JSON.stringify(left.blocks) === JSON.stringify(right.blocks);

export function isEv3FirstProgram(value: unknown): value is Ev3FirstProgramBlockId[] {
  return Array.isArray(value) && value.length > 0 && value.length <= EV3_FIRST_PROGRAM_MAX_BLOCKS
    && Array.from(value).every((id) => typeof id === "string" && Object.hasOwn(EV3_FIRST_PROGRAM_BLOCKS, id));
}

/** Stores the same block ids the runner consumes. Reads stay fresh; failed writes never succeed in memory. */
export function createEv3ProgramStore(storage: () => ProgramStorage, now: () => number = Date.now) {
  const read = (): ProgramStoreResult<Ev3SavedProgram[]> => {
    let raw: string | null;
    try { raw = storage().getItem(EV3_PROGRAM_STORAGE_KEY); }
    catch { return { ok: false, error: "Saved programs are unavailable in this browser. Your current blocks are still here." }; }
    if (raw === null) return { ok: true, value: [] };
    try {
      const data: unknown = JSON.parse(raw);
      if (!data || typeof data !== "object" || !("schema" in data) || data.schema !== PROGRAM_LIBRARY_SCHEMA
        || !("programs" in data) || !Array.isArray(data.programs)) throw new Error("Invalid library");
      const names = new Set<string>();
      const programs: Ev3SavedProgram[] = [];
      for (const item of data.programs) {
        if (!item || typeof item !== "object" || typeof item.name !== "string"
          || !item.name.trim() || item.name.length > EV3_PROGRAM_NAME_MAX_LENGTH
          || !isEv3FirstProgram(item.blocks) || !Number.isFinite(item.updatedAt) || item.updatedAt < 0
          || names.has(programKey(item.name))) throw new Error("Invalid program");
        names.add(programKey(item.name));
        programs.push({ name: item.name, blocks: [...item.blocks], updatedAt: item.updatedAt });
      }
      return { ok: true, value: programs.sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name)) };
    } catch {
      return { ok: false, error: "Saved programs could not be read. The stored data has been left untouched." };
    }
  };
  const write = (programs: Ev3SavedProgram[]): string | null => {
    try {
      storage().setItem(EV3_PROGRAM_STORAGE_KEY, JSON.stringify({ schema: PROGRAM_LIBRARY_SCHEMA, programs }));
      return null;
    } catch { return "Could not save changes in this browser. Your current blocks and previous saved programs are still here."; }
  };
  return {
    read,
    save(name: string, blocks: readonly Ev3FirstProgramBlockId[], previous?: Ev3SavedProgram): ProgramStoreResult<Ev3SavedProgram> {
      const cleanName = name.normalize("NFC").trim();
      if (!cleanName || cleanName.length > EV3_PROGRAM_NAME_MAX_LENGTH) {
        return { ok: false, error: `Choose a name from 1 to ${EV3_PROGRAM_NAME_MAX_LENGTH} characters.` };
      }
      if (!isEv3FirstProgram(blocks)) return { ok: false, error: "Build a program with one to six supported blocks before saving." };
      const loaded = read();
      if (!loaded.ok) return loaded;
      const existing = loaded.value.find((item) => programKey(item.name) === programKey(cleanName));
      if (existing && (!previous || !sameSavedProgram(existing, previous))) {
        return { ok: false, error: "That name is already saved or has changed. Open it again, or choose a new name." };
      }
      if (!existing && previous) return { ok: false, error: "That saved program was removed. Choose a new name to save a copy." };
      const value = { name: cleanName, blocks: [...blocks], updatedAt: Math.max(now(), (existing?.updatedAt ?? -1) + 1) };
      const error = write([...loaded.value.filter((item) => item !== existing), value]);
      return error ? { ok: false, error } : { ok: true, value };
    },
    remove(program: Ev3SavedProgram): ProgramStoreResult<null> {
      const loaded = read();
      if (!loaded.ok) return loaded;
      const existing = loaded.value.find((item) => programKey(item.name) === programKey(program.name));
      if (!existing || !sameSavedProgram(existing, program)) {
        return { ok: false, error: "That saved program changed. Reopen the library before deleting it." };
      }
      const error = write(loaded.value.filter((item) => item !== existing));
      return error ? { ok: false, error } : { ok: true, value: null };
    },
  };
}

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
