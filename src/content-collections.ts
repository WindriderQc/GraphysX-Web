/** Editorial destinations. Unknown experiments stay in the lab until deliberately promoted. */
export type ContentCollection = "creations" | "archive" | "lab";

const SCENE_CREATIONS = new Set([
  "glow-garden", "signal-outpost", "signal-trail", "living-systems",
  "math-lab", "surfaces-showcase", "family-iss-live",
]);
const GAME_CREATIONS = new Set(["ballz", "ballsy-slime", "cyber-race-1992"]);

export function sceneCollection(id: string): ContentCollection {
  if (SCENE_CREATIONS.has(id)) return "creations";
  if (/^archive-|^maison|^milky-way|^nature-/.test(id)) return "archive";
  return "lab";
}

export function gameCollection(id: string): ContentCollection {
  if (GAME_CREATIONS.has(id)) return "creations";
  return /^archive-|^graphysx-archive-/.test(id) ? "archive" : "lab";
}

export const CONTENT_COLLECTIONS = [
  { id: "creations", label: "Créations", description: "Les mondes et expériences à découvrir en premier." },
  { id: "archive", label: "Archives", description: "Les reprises historiques. Chaque scène conserve ses limites de fidélité." },
  { id: "lab", label: "Laboratoire", description: "Prototypes, études et outils de construction en cours d’exploration." },
  { id: "all", label: "Tout", description: "Le catalogue complet, avec une seule entrée par destination." },
] as const;
