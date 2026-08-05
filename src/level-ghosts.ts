import type { GraphysXAgentWorldApi } from "./agent-world-runtime";
import { LevelRecordStore } from "./scoreboard";

const STORAGE_KEY = "graphysx-level-ghosts-v1";
const SAMPLE_INTERVAL_MS = 150;
const MAX_SAMPLES = 6_000;
const GHOST_ID = "personal-best-ghost";

// Exported: the results layer sends and receives exactly this shape, so a downloaded ghost
// plays back through the interpolator below with no conversion step.
export type GhostSample = { tMs: number; position: [number, number, number] };
export type GhostTrace = { elapsedMs: number; samples: GhostSample[] };

export type PersonalGhostState = {
  recordId: string;
  available: boolean;
  visible: boolean;
  bestMs: number | null;
  recordingSamples: number;
  /** Whose ghost is on track: null for your own, otherwise a leaderboard rival's label. */
  challengerLabel?: string | null;
};

let runtimeState: PersonalGhostState | null = null;

export function getPersonalGhostState(): PersonalGhostState | null {
  return runtimeState ? { ...runtimeState } : null;
}

export function createPersonalGhostSession(
  api: GraphysXAgentWorldApi,
  subjectId: string,
  recordId: string,
  /**
   * A `challenger` replaces the *playback* source with someone else's recording, so a player
   * can race a leaderboard rival instead of themselves. Recording and personal-best storage
   * are untouched by it: whoever you are racing, the trace you produce is still yours, and it
   * is still only stored when it beats your own best.
   */
  options: { challenger?: GhostTrace | null; challengerLabel?: string | null } = {},
): {
  tick(elapsedMs: number): void;
  finish(elapsedMs: number, verified: boolean): void;
  /** The trace recorded this run, once it has at least two samples. For submission. */
  recording(): GhostTrace | null;
  dispose(): void;
} {
  const own = loadTraces()[recordId] ?? null;
  const challenger = options.challenger ?? null;
  // Playback follows the challenger when there is one; storage always follows your own.
  const saved = challenger ?? own;
  const recordedBestMs = new LevelRecordStore().getRecord(recordId)?.bestMs ?? null;
  const recorded: GhostSample[] = [];
  let spawned = false;
  let lastSampleAt = -Infinity;

  runtimeState = {
    recordId,
    available: Boolean(saved),
    visible: false,
    bestMs: saved?.elapsedMs ?? null,
    recordingSamples: 0,
    challengerLabel: challenger ? options.challengerLabel ?? "rival" : null,
  };

  const sampleSubject = (elapsedMs: number, force = false): void => {
    if (!force && elapsedMs - lastSampleAt < SAMPLE_INTERVAL_MS) return;
    const position = api.query({ ids: [subjectId] })[0]?.position;
    if (!position) return;
    const tMs = Math.max(0, Math.round(elapsedMs));
    const last = recorded[recorded.length - 1];
    // The play layer polls once and then force-samples when it observes completion. Both calls
    // can carry the same elapsed time; appending both made an otherwise valid run fail the
    // server's strictly-increasing ghost contract. Keep the finish position, not a duplicate.
    if (last && tMs <= last.tMs) {
      if (force && tMs === last.tMs) last.position = [...position];
      lastSampleAt = Math.max(lastSampleAt, elapsedMs);
      return;
    }
    if (recorded.length >= MAX_SAMPLES) {
      // Preserve the fixed cap but let the forced finish replace the final sample, so the
      // trace duration still describes the submitted run.
      if (force && last) {
        last.tMs = tMs;
        last.position = [...position];
        lastSampleAt = elapsedMs;
      }
      return;
    }
    recorded.push({ tMs, position: [...position] });
    lastSampleAt = elapsedMs;
    if (runtimeState?.recordId === recordId) runtimeState.recordingSamples = recorded.length;
  };

  const ensureGhost = (): void => {
    if (!saved || spawned || saved.samples.length === 0) return;
    const first = saved.samples[0];
    const result = api.spawn({
      id: GHOST_ID,
      type: "sphere",
      label: "Personal Ghost",
      geometry: { radius: 0.48 },
      transform: { position: first.position },
      material: {
        color: "#70efff",
        emissive: "#27b9d2",
        emissiveIntensity: 1.1,
        opacity: 0.38,
        roughness: 0.18,
        metalness: 0.08,
      },
      ephemeral: true,
      tags: ["personal-ghost", "player-visible"],
    });
    spawned = result.ok;
    if (runtimeState?.recordId === recordId) runtimeState.visible = spawned;
  };

  const playbackPosition = (elapsedMs: number): [number, number, number] | null => {
    if (!saved?.samples.length) return null;
    const samples = saved.samples;
    if (elapsedMs <= samples[0].tMs) return samples[0].position;
    const final = samples[samples.length - 1];
    if (elapsedMs >= final.tMs) return final.position;
    let low = 0;
    let high = samples.length - 1;
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2);
      if (samples[middle].tMs <= elapsedMs) low = middle;
      else high = middle;
    }
    const a = samples[low];
    const b = samples[high];
    const span = Math.max(1, b.tMs - a.tMs);
    const mix = Math.max(0, Math.min(1, (elapsedMs - a.tMs) / span));
    return [
      a.position[0] + (b.position[0] - a.position[0]) * mix,
      a.position[1] + (b.position[1] - a.position[1]) * mix,
      a.position[2] + (b.position[2] - a.position[2]) * mix,
    ];
  };

  return {
    tick(elapsedMs) {
      sampleSubject(elapsedMs);
      ensureGhost();
      const position = playbackPosition(elapsedMs);
      if (spawned && position) api.update(GHOST_ID, { transform: { position } });
    },
    finish(elapsedMs, verified) {
      sampleSubject(elapsedMs, true);
      if (!verified || recorded.length < 2) return;
      // `own`, not `saved`: when racing a challenger, `saved` is THEIR time, and gating your
      // personal best on beating someone else's would be a different feature entirely.
      if (own && elapsedMs >= own.elapsedMs) return;
      // Older records may predate trajectory capture. Do not label a later, slower run as the
      // personal best just because it is the first one with samples; wait until the player
      // actually matches or improves the stored board time.
      if (!saved && recordedBestMs !== null && elapsedMs > recordedBestMs) return;
      const traces = loadTraces();
      traces[recordId] = { elapsedMs: Math.round(elapsedMs), samples: recorded };
      saveTraces(traces);
      runtimeState = {
        recordId,
        available: true,
        visible: spawned,
        bestMs: Math.round(elapsedMs),
        recordingSamples: recorded.length,
        challengerLabel: challenger ? options.challengerLabel ?? "rival" : null,
      };
    },
    recording() {
      return recorded.length >= 2
        ? { elapsedMs: recorded[recorded.length - 1].tMs, samples: recorded.map((sample) => ({ ...sample })) }
        : null;
    },
    dispose() {
      if (spawned) api.remove(GHOST_ID);
      if (runtimeState?.recordId === recordId) runtimeState = null;
    },
  };
}

function loadTraces(): Record<string, GhostTrace> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const traces: Record<string, GhostTrace> = {};
    for (const [id, candidate] of Object.entries(parsed)) {
      if (!candidate || typeof candidate !== "object") continue;
      const trace = candidate as Partial<GhostTrace>;
      if (!Number.isFinite(trace.elapsedMs) || (trace.elapsedMs ?? 0) <= 0 || !Array.isArray(trace.samples)) continue;
      const samples = trace.samples.slice(0, MAX_SAMPLES).filter(isGhostSample);
      if (samples.length < 2) continue;
      traces[id] = { elapsedMs: Math.round(trace.elapsedMs as number), samples };
    }
    return traces;
  } catch {
    return {};
  }
}

function isGhostSample(value: unknown): value is GhostSample {
  if (!value || typeof value !== "object") return false;
  const sample = value as Partial<GhostSample>;
  return Number.isFinite(sample.tMs)
    && Array.isArray(sample.position)
    && sample.position.length === 3
    && sample.position.every(Number.isFinite);
}

function saveTraces(traces: Record<string, GhostTrace>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(traces));
  } catch {
    // Ghosts are an enhancement. A blocked or full storage area must never block a finish.
  }
}
