import type { FaceDrivers } from "./llmx-face-pose";
import { llmxFacePresentation } from "./llmx-presentation";

/**
 * The embed's input contract, `agentx.presence.v1`: what a host page (AgentX Household) observes
 * about its own conversation. Observable state only — the mask never infers an emotion.
 */
export type LlmXEmbedPhase = "idle" | "listening" | "waiting" | "generating" | "speaking" | "interrupted" | "error" | "sleeping";

export type LlmXEmbedPresence = Readonly<{
  phase: LlmXEmbedPhase;
  /** Raw RMS of whichever side is audible: the microphone while listening, the reply while speaking. */
  level: number;
  /** Spectral brightness of the reply, raw (0..~0.25). */
  brightness: number;
  /** Streamed tokens per second while generating; 0 when unknown. */
  tokenRate: number;
  /** Monotonic count of tool calls / memory recalls seen so far; each increment is one spark. */
  toolPulses: number;
}>;

export const IDLE_PRESENCE: LlmXEmbedPresence = Object.freeze({ phase: "idle", level: 0, brightness: 0, tokenRate: 0, toolPulses: 0 });

const PHASES: readonly LlmXEmbedPhase[] = ["idle", "listening", "waiting", "generating", "speaking", "interrupted", "error", "sleeping"];
const finite = (value: unknown, max: number): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : 0;

/** Accept a host message defensively: unknown fields are dropped, bad values fall back to idle. */
export function readEmbedPresence(value: unknown, previous: LlmXEmbedPresence = IDLE_PRESENCE): LlmXEmbedPresence {
  if (!value || typeof value !== "object") return previous;
  const source = value as Record<string, unknown>;
  const phase = PHASES.includes(source.phase as LlmXEmbedPhase) ? source.phase as LlmXEmbedPhase : previous.phase;
  return {
    phase,
    level: "level" in source ? finite(source.level, 1) : previous.level,
    brightness: "brightness" in source ? finite(source.brightness, 1) : previous.brightness,
    tokenRate: "tokenRate" in source ? finite(source.tokenRate, 500) : previous.tokenRate,
    toolPulses: "toolPulses" in source ? Math.floor(finite(source.toolPulses, Number.MAX_SAFE_INTEGER)) : previous.toolPulses,
  };
}

/**
 * Presence → face drivers, reusing the full LLMx mapping for the shared phases so the docked mask
 * and the Forge mask read the same. The embed adds three things the Forge does not observe:
 * the listener's own voice level (attention leans in), the token rate (thinking intensity) and
 * sleep (the host's inference is busy elsewhere: eyes close, nothing is expected).
 */
export function embedFaceDrivers(presence: LlmXEmbedPresence, assembly: number): Partial<FaceDrivers> {
  if (presence.phase === "sleeping") {
    return { build: assembly, speak: 0, think: 0, attention: 0, warmth: 0, blink: 1 };
  }
  const speaking = presence.phase === "speaking" && presence.level >= 0.001;
  const phase = presence.phase === "speaking" ? "generating" : presence.phase;
  // The embed owns the gaze (pointer or viewer), so the presentation's neutral gaze is dropped.
  const { gazeX: _gazeX, gazeY: _gazeY, ...drivers } = llmxFacePresentation({
    assembly,
    phase,
    speech: {
      playing: speaking,
      amplitude: Math.min(1, presence.level * 8),
      brightness: Math.min(1, presence.brightness * 4),
    },
  });
  const listeningLevel = presence.phase === "listening" ? Math.min(1, presence.level * 10) : 0;
  // Slow first tokens still read as thinking; a fast stream reads as concentrated.
  const think = drivers.think > 0 ? 0.55 + 0.45 * Math.min(1, presence.tokenRate / 40) : 0;
  return {
    ...drivers,
    think,
    warmth: Math.max(drivers.warmth, listeningLevel * 0.3) - (presence.phase === "error" ? 0.3 : 0),
  };
}

/** One spark per new tool pulse, returned as the number of pulses to play now. */
export function newToolPulses(previous: LlmXEmbedPresence, next: LlmXEmbedPresence): number {
  return next.toolPulses > previous.toolPulses ? Math.min(3, next.toolPulses - previous.toolPulses) : 0;
}
