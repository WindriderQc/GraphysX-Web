export const QUEST_PROFILES = {
  quality: { scale: 1, foveation: .25, targetHz: 90 },
  balanced: { scale: .85, foveation: .5, targetHz: 90 },
  economy: { scale: .7, foveation: .7, targetHz: 72 },
} as const;
export type QuestProfile = keyof typeof QUEST_PROFILES;

/** Negotiate capabilities, never infer the headset or promise a requested refresh rate. */
export async function negotiateQuestRate(session: XRSession, profile: QuestProfile): Promise<{ requestedHz: number | null; activeHz: number | null; error: string | null }> {
  const desired = QUEST_PROFILES[profile].targetHz;
  const supported = Array.from(session.supportedFrameRates ?? []).filter(Number.isFinite).sort((a, b) => b - a);
  const requestedHz = supported.find(rate => rate <= desired) ?? supported.at(-1) ?? null;
  let error: string | null = null;
  if (requestedHz !== null && session.updateTargetFrameRate) {
    try { await session.updateTargetFrameRate(requestedHz); }
    catch { error = "The runtime refused the requested refresh rate; its current rate is retained."; }
  }
  return { requestedHz, activeHz: session.frameRate ?? null, error };
}
