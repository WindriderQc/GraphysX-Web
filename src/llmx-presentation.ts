import type { LlmXConversationPhase, LlmXFacePresentation, LlmXSpeechSample } from "./llmx-contracts";

const unit = (value: number): number => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

/** Maps observable conversation/output state to art direction, never to inferred emotions. */
export function llmxFacePresentation(input: {
  assembly: number;
  phase: LlmXConversationPhase;
  speech: Readonly<LlmXSpeechSample>;
}): LlmXFacePresentation {
  const speaking = input.speech.playing;
  return {
    build: unit(input.assembly),
    speak: speaking ? unit(input.speech.amplitude) : 0,
    speakTone: speaking && Number.isFinite(input.speech.brightness) ? unit(input.speech.brightness) : 0.5,
    gazeX: 0,
    gazeY: 0,
    attention: input.phase === "listening" ? 1 : 0.25,
    think: !speaking && (input.phase === "waiting" || input.phase === "generating") ? 1 : 0,
    // A discreet smile while talking or being talked to; the application adds more when the
    // visitor points at the mask.
    warmth: speaking || input.phase === "listening" ? 0.35 : 0,
  };
}
