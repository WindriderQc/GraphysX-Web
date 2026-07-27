/**
 * The three recovered BallZ appearances as explicit, scene-native vocabulary.
 *
 * Geometry is never substituted: every appearance is assembled from the decoded 2011
 * BallShell / BallCtrl / BallFire TVM meshes. "Classic" binds the archived GridXL bitmap
 * to a faithful BallCtrl geometry variant, per the revival ledger. The preset changes the
 * visible model assets only; all three use the same modern v2 steering/physics contract.
 */

export type BallzBallPresetId = "revival" | "classic" | "fire";

export type BallzBallPresetDescriptor = {
  id: BallzBallPresetId;
  label: string;
  summary: string;
  shellAssetId: string;
  aimAssetId: string;
};

export const BALLZ_BALL_PRESETS: readonly BallzBallPresetDescriptor[] = [
  {
    id: "revival",
    label: "Revival",
    summary: "BallShell cage + FireArrow controller",
    shellAssetId: "archive-ballshell",
    aimAssetId: "archive-ballfire",
  },
  {
    id: "classic",
    label: "Classic",
    summary: "BallShell cage + recovered GridXL skin",
    shellAssetId: "archive-ballshell",
    aimAssetId: "archive-ballctrl-gridxl",
  },
  {
    id: "fire",
    label: "Fire",
    summary: "BallFire shell + BallCtrl core",
    shellAssetId: "archive-ballfire",
    aimAssetId: "archive-ballctrl",
  },
] as const;

const STORAGE_KEY = "graphysx.ballz.ball-preset.v2";

export function getBallzBallPreset(id: string | null | undefined): BallzBallPresetDescriptor {
  return BALLZ_BALL_PRESETS.find((preset) => preset.id === id) ?? BALLZ_BALL_PRESETS[0];
}

export function loadBallzBallPreset(): BallzBallPresetDescriptor {
  try {
    return getBallzBallPreset(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return BALLZ_BALL_PRESETS[0];
  }
}

export function saveBallzBallPreset(id: BallzBallPresetId): BallzBallPresetDescriptor {
  const preset = getBallzBallPreset(id);
  try {
    window.localStorage.setItem(STORAGE_KEY, preset.id);
  } catch {
    // Private browsing / embedded hosts can reject storage. The selected menu state still
    // works for this visit; the materialiser falls back to Revival on the next one.
  }
  return preset;
}
