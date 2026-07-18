export const GRAPHYSX_WORLD_RECIPE_SCHEMA = "graphysx.world/v1" as const;

export type GraphysXWorldStudyId = "flock-planet" | "forces-garden" | "living-forest" | "orbital-observatory";

export type GraphysXWorldParameter =
  | "separation"
  | "alignment"
  | "cohesion"
  | "speed"
  | "attraction"
  | "flowStrength"
  | "mutationRate"
  | "cycleSeconds"
  | "orbitSpeed"
  | "earthSpin"
  | "detectionRadiusKm"
  | "quakeScale";

export type GraphysXWorldLayer = "trails" | "clouds" | "trajectory" | "quakes" | "observer";

export type GraphysXWorldObserver = {
  label: string;
  latitude: number;
  longitude: number;
};

export type GraphysXWorldRecipe = {
  schema: typeof GRAPHYSX_WORLD_RECIPE_SCHEMA;
  id: string;
  label: string;
  study: GraphysXWorldStudyId;
  /** Optional focused demonstration inside a world. Older v1 recipes remain valid without it. */
  lesson?: string;
  seed: number;
  settings: Partial<Record<GraphysXWorldParameter, number>>;
  layers: Partial<Record<GraphysXWorldLayer, boolean>>;
  observer?: GraphysXWorldObserver;
};

export const GRAPHYSX_WORLD_RECIPES: readonly GraphysXWorldRecipe[] = [
  {
    schema: GRAPHYSX_WORLD_RECIPE_SCHEMA,
    id: "sbqc.flock-planet.v1",
    label: "SBQC Flock Planet",
    study: "flock-planet",
    lesson: "flock-complete",
    seed: 1977,
    settings: { separation: 1.5, alignment: 1, cohesion: 1, speed: 1 },
    layers: { trails: true, clouds: true }
  },
  {
    schema: GRAPHYSX_WORLD_RECIPE_SCHEMA,
    id: "sbqc.forces-garden.v1",
    label: "SBQC Forces & Flow Garden",
    study: "forces-garden",
    lesson: "forces-combined",
    seed: 1977,
    settings: { attraction: 1.15, flowStrength: 0.72, speed: 1 },
    layers: {}
  },
  {
    schema: GRAPHYSX_WORLD_RECIPE_SCHEMA,
    id: "sbqc.living-forest.v1",
    label: "SBQC Living Forest",
    study: "living-forest",
    lesson: "forest-life-cycle",
    seed: 1977,
    settings: { mutationRate: 0.08, cycleSeconds: 17 },
    layers: {}
  },
  {
    schema: GRAPHYSX_WORLD_RECIPE_SCHEMA,
    id: "sbqc.orbital-observatory.v1",
    label: "SBQC Orbital Observatory",
    study: "orbital-observatory",
    lesson: "orbital-live",
    seed: 1977,
    settings: { orbitSpeed: 1, earthSpin: 0.2, detectionRadiusKm: 1500, quakeScale: 1 },
    layers: { clouds: true, trajectory: true, quakes: true, observer: true },
    observer: { label: "Québec City", latitude: 46.8139, longitude: -71.208 }
  }
] as const;

export function findWorldRecipe(id: string): GraphysXWorldRecipe | null {
  return GRAPHYSX_WORLD_RECIPES.find((recipe) => recipe.id === id) ?? null;
}

export function isGraphysXWorldRecipe(value: unknown): value is GraphysXWorldRecipe {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<GraphysXWorldRecipe>;
  return (
    candidate.schema === GRAPHYSX_WORLD_RECIPE_SCHEMA &&
    typeof candidate.id === "string" &&
    typeof candidate.label === "string" &&
    typeof candidate.seed === "number" &&
    ["flock-planet", "forces-garden", "living-forest", "orbital-observatory"].includes(candidate.study ?? "") &&
    Boolean(candidate.settings && typeof candidate.settings === "object") &&
    Boolean(candidate.layers && typeof candidate.layers === "object")
  );
}
