// The sound vocabulary: curated archive samples plus runtime imports, following the
// texture registry's shape exactly — a curated array the release manifest scrapes, a
// dynamic array the media library fills, and one lookup both feed.
//
// A `sound` ENTITY (agent-world-runtime.ts) is a placed source: a marker you can select,
// with volume/loop/positional config that lives in the document. Actually making air move
// is the host's job (agent-world-audio.ts) — same split as force fields (entity for
// identity, host pass for effect), because audio needs the camera's listener and a user
// gesture, both of which the runtime deliberately knows nothing about.

export type AgentWorldSoundDescriptor = {
  id: string;
  label: string;
  url: string;
  category: "effect" | "music" | "voice" | "imported";
  description: string;
  /** Provenance. Curated entries name their archive; imports name their datalake path. */
  source: string;
};

/**
 * The four samples with surviving archive callsites, vendored under public/assets/audio.
 * Registered here so they ship in the release manifest (product-assets.mjs scrapes this
 * file's `url:` literals) — until now they 404'd in production and only legacy dev played
 * them.
 */
export const GRAPHYSX_AGENT_WORLD_SOUNDS: readonly AgentWorldSoundDescriptor[] = [
  {
    id: "coin",
    label: "Coin",
    url: "/assets/audio/ballz2015/coin.wav",
    category: "effect",
    description: "The BallZ ring-collection chime (Anneaux.cpp::deleteRing).",
    source: "BallZ 2015 archive"
  },
  {
    id: "jump",
    label: "Jump",
    url: "/assets/audio/ballz2015/Jump.wav",
    category: "effect",
    description: "The BallZ jump blip (CLBallZ.cpp jump branch).",
    source: "BallZ 2015 archive"
  },
  {
    id: "ready-beep",
    label: "Ready Beep",
    url: "/assets/audio/ballz18/beepShort.mp3",
    category: "effect",
    description: "The BallZ18 countdown 'get ready' beep (Countdown.cs).",
    source: "BallZ 18 archive"
  },
  {
    id: "go-beep",
    label: "Go Beep",
    url: "/assets/audio/ballz18/beep01.mp3",
    category: "effect",
    description: "The BallZ18 countdown 'go' beep (Countdown.cs).",
    source: "BallZ 18 archive"
  }
];

/** Runtime imports from the media library, replaced wholesale on each manifest refresh. */
const DYNAMIC_SOUNDS: AgentWorldSoundDescriptor[] = [];

export function registerAgentWorldSounds(descriptors: readonly AgentWorldSoundDescriptor[]): void {
  const curated = new Set(GRAPHYSX_AGENT_WORLD_SOUNDS.map((sound) => sound.id));
  DYNAMIC_SOUNDS.length = 0;
  for (const descriptor of descriptors) {
    if (curated.has(descriptor.id)) continue; // a curated id always wins
    DYNAMIC_SOUNDS.push(descriptor);
  }
}

export function allAgentWorldSounds(): readonly AgentWorldSoundDescriptor[] {
  return DYNAMIC_SOUNDS.length ? [...GRAPHYSX_AGENT_WORLD_SOUNDS, ...DYNAMIC_SOUNDS] : GRAPHYSX_AGENT_WORLD_SOUNDS;
}

export function findAgentWorldSound(id: string): AgentWorldSoundDescriptor | null {
  return (
    GRAPHYSX_AGENT_WORLD_SOUNDS.find((sound) => sound.id === id)
    ?? DYNAMIC_SOUNDS.find((sound) => sound.id === id)
    ?? null
  );
}

/** The scene-vocabulary field on a `sound` entity. Only `source` is required. */
export type AgentWorldSound = {
  /** A sound id (curated or imported), or a direct URL. */
  source: string;
  /** 0..1, default 0.8. */
  volume?: number;
  /** Default true — a placed sound is usually ambience. */
  loop?: boolean;
  /** Start when the world (and the audio context) is ready. Default true. */
  autoplay?: boolean;
  /** Attenuate and pan with distance from the camera. Default true. */
  positional?: boolean;
  /** Distance at which positional volume starts to fall off, world units. Default 8. */
  refDistance?: number;
};

export type ResolvedAgentWorldSound = Required<AgentWorldSound>;

export function resolveAgentWorldSound(
  input?: AgentWorldSound,
  current?: ResolvedAgentWorldSound,
): ResolvedAgentWorldSound {
  const source = (input?.source ?? current?.source ?? "").trim();
  if (!source) throw new Error("A sound entity requires sound.source (a sound id or URL)");
  const volume = input?.volume ?? current?.volume ?? 0.8;
  if (!Number.isFinite(volume) || volume < 0 || volume > 1) throw new Error("sound.volume must be between 0 and 1");
  const refDistance = input?.refDistance ?? current?.refDistance ?? 8;
  if (!Number.isFinite(refDistance) || refDistance <= 0 || refDistance > 1000) {
    throw new Error("sound.refDistance must be between 0 and 1000 world units");
  }
  return {
    source,
    volume,
    loop: input?.loop ?? current?.loop ?? true,
    autoplay: input?.autoplay ?? current?.autoplay ?? true,
    positional: input?.positional ?? current?.positional ?? true,
    refDistance,
  };
}

/**
 * Where the bytes live. Resolution happens at PLAY time, not at spawn: a document can
 * reference an imported sound before the media manifest has been pulled, exactly as a
 * model's asset id resolves when the loader runs.
 */
export function agentWorldSoundUrl(source: string): string | null {
  const descriptor = findAgentWorldSound(source);
  if (descriptor) return descriptor.url;
  return /^(https?:)?\//i.test(source) ? source : null;
}
