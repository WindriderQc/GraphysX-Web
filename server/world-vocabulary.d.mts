export const WORLD_VOCABULARY_SCHEMA: "graphysx.world-vocabulary/v1";
export const PROPOSAL_LIMITS: { readonly commands: number; readonly intentChars: number; readonly replyBytes: number };
export const OPERATIONS: Readonly<Record<string, { shape: unknown; description: string }>>;
export const EXAMPLES: Readonly<Record<string, unknown[]>>;

export type WorldVocabularyDescriptors = {
  prefabs?: readonly { id: string; label: string; summary: string; entityCount: number }[];
  skies?: readonly { id: string; label: string; description: string }[];
  hdris?: readonly { id: string; label: string; description: string }[];
  overlays?: readonly { id: string; label: string; description: string }[];
  surfaces?: readonly { id: string; label: string; description: string }[];
  emitters?: readonly { id: string; label: string; description: string }[];
  heightmaps?: readonly { id: string; label: string; description: string }[];
  flocks?: readonly { id: string; label: string; description: string }[];
  crowds?: readonly { id: string; label: string; description: string }[];
  formulas?: readonly { id: string; label: string; description: string }[];
  dnas?: readonly { id: string; label: string; description: string }[];
  forceFields?: readonly { id: string; label: string; description: string }[];
};

export function buildWorldVocabulary(options?: { descriptors?: WorldVocabularyDescriptors }): Record<string, unknown>;
export function renderWorldVocabulary(options?: { descriptors?: WorldVocabularyDescriptors }): string;
