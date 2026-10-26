/**
 * The animation list of the Janitor show: what a host page (or Nestor, through Core) asks the
 * city to play, as a short comma-separated vocabulary, and the player that walks it.
 *
 *   play="overview,duplicates,pairs,target,summary"
 *   play="duplicates,tour-5,summary"
 *   play="group-<sha256>,target"
 *
 * Every step is a picture. None of them reads anything but the report, and none acts on a file:
 * decisions and actions belong to Data, never to the city. Pure: no three.js, no DOM.
 */

export type ShowSceneKind = "overview" | "duplicates" | "pairs" | "target" | "summary";
export type ShowStep =
  | { kind: ShowSceneKind }
  | { kind: "tour"; count: number }
  | { kind: "group"; sha256: string };

export const DEFAULT_SHOW_SCRIPT = "overview,duplicates,pairs,target,summary";
export const SHOW_MAX_STEPS = 24;
export const SHOW_MAX_TOUR = 20;
const SCENES: readonly ShowSceneKind[] = ["overview", "duplicates", "pairs", "target", "summary"];

/** Seconds a step holds while playing. A tour is replaced by its group steps once the largest groups are read. */
export const SHOW_STEP_SECONDS: Record<ShowStep["kind"], number> = {
  overview: 4, duplicates: 7, pairs: 8, target: 7, summary: 10, tour: 30, group: 8,
};

/** Parse a `play` list. Unknown words are refused, not skipped: the host asked for something. */
export function parseShowScript(text: string): ShowStep[] {
  if (typeof text !== "string" || text.length > 2000) throw new Error("play must be a short list of steps");
  const words = text.split(",").map((word) => word.trim().toLowerCase()).filter(Boolean);
  if (!words.length) throw new Error("play must name at least one step");
  if (words.length > SHOW_MAX_STEPS) throw new Error(`play names at most ${SHOW_MAX_STEPS} steps`);
  return words.map((word): ShowStep => {
    if ((SCENES as readonly string[]).includes(word)) return { kind: word as ShowSceneKind };
    const tour = /^tour-(\d{1,2})$/.exec(word);
    if (tour) {
      const count = Number(tour[1]);
      if (count < 1 || count > SHOW_MAX_TOUR) throw new Error(`play: tour-N takes 1 to ${SHOW_MAX_TOUR} groups`);
      return { kind: "tour", count };
    }
    const group = /^group-([0-9a-f]{64})$/.exec(word);
    if (group) return { kind: "group", sha256: group[1] };
    throw new Error(`unknown play step: ${word.slice(0, 80)}`);
  });
}

export const showScriptText = (steps: readonly ShowStep[]): string => steps.map((step) =>
  step.kind === "tour" ? `tour-${step.count}` : step.kind === "group" ? `group-${step.sha256}` : step.kind).join(",");

export function showStepLabel(step: ShowStep): string {
  switch (step.kind) {
    case "overview": return "Vue d’ensemble";
    case "duplicates": return "Doublons seulement";
    case "pairs": return "Copies reliées";
    case "target": return "Vers la cible";
    case "summary": return "Résumé";
    case "tour": return `Visite des ${step.count} plus gros groupes`;
    case "group": return `Groupe ${step.sha256.slice(0, 8)}`;
  }
}

/**
 * Walks the list on the host's frame clock. Playing advances step by step; the last step holds.
 * `expand` replaces a tour with its group steps once the ledger knows the largest groups.
 */
export function createShowPlayer(initial: readonly ShowStep[]) {
  let steps: ShowStep[] = [...initial];
  let index = 0, elapsed = 0, playing = false;
  const clamp = (value: number): number => Math.max(0, Math.min(steps.length - 1, value));
  return {
    state: () => ({ index, count: steps.length, playing, elapsed, step: steps[index] ?? null,
      seconds: steps[index] ? SHOW_STEP_SECONDS[steps[index].kind] : 0 }),
    steps: (): readonly ShowStep[] => steps,
    replace(next: readonly ShowStep[]): void { if (!next.length) throw new Error("empty show"); steps = [...next]; index = 0; elapsed = 0; },
    expand(at: number, next: readonly ShowStep[]): void {
      if (at < 0 || at >= steps.length) return;
      steps.splice(at, 1, ...next);
      steps = steps.slice(0, SHOW_MAX_STEPS + SHOW_MAX_TOUR);
      if (!steps.length) steps = [{ kind: "summary" }];
      index = clamp(index); elapsed = 0;
    },
    play(): void { if (index === steps.length - 1 && elapsed >= SHOW_STEP_SECONDS[steps[index].kind]) { index = 0; elapsed = 0; } playing = true; },
    pause(): void { playing = false; },
    goto(next: number): boolean { const target = clamp(next); const moved = target !== index; index = target; elapsed = 0; return moved; },
    next(): boolean { return this.goto(index + 1); },
    previous(): boolean { return this.goto(index - 1); },
    /** Advance the clock. Returns true when the step changed. */
    tick(delta: number): boolean {
      if (!playing || !Number.isFinite(delta) || delta <= 0) return false;
      elapsed += delta;
      if (elapsed < SHOW_STEP_SECONDS[steps[index].kind]) return false;
      if (index >= steps.length - 1) { playing = false; elapsed = SHOW_STEP_SECONDS[steps[index].kind]; return false; }
      index += 1; elapsed = 0;
      return true;
    },
  };
}
export type ShowPlayer = ReturnType<typeof createShowPlayer>;
