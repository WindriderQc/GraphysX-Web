import { growAgentWorldDnaForest, resolveAgentWorldDna, type AgentWorldDna } from "./agent-world-dna";
import type { AgentWorldCommand, AgentWorldDefinition, AgentWorldEntityDefinition, AgentWorldVector3 } from "./agent-world-runtime";

export const DNA_CREATION_ID = "dna-seed-studio";
export const DNA_SIDES = ["reference", "variant"] as const;
export type DnaSide = typeof DNA_SIDES[number];
export const DNA_MUTATIONS = [
  { id: "height", name: "Plus haut", gene: "trunkLength", value: 1.75, description: "Allonge le tronc et ses branches." },
  { id: "spread", name: "Plus ouvert", gene: "branchAngle", value: 0.85, description: "Écarte les branches du tronc." },
  { id: "branches", name: "Plus ramifié", gene: "splitChance", value: 0.82, description: "Multiplie les bifurcations." },
] as const;
export type DnaMutation = typeof DNA_MUTATIONS[number];
export const DNA_BASE: AgentWorldDna = {
  preset: "single-specimen", seed: 1207, generation: 1, mutationRate: 0,
  trees: 1, columns: 1, layoutJitter: 0, growSeconds: 0, seasonSeconds: 0,
  genome: { trunkLength: 1.1, lengthRatio: 0.69, branchAngle: 0.44, depth: 5, splitChance: 0.18, leafHue: 0.4, leafSize: 0.15, branchThickness: 0.065 },
};
const X = { reference: -3.5, variant: 3.5 };
const COLOR = { reference: "#91e5dd", variant: "#ffba80" };
export const DNA_PAD_TOP = 0.25;
export const DNA_SEED_RADIUS = 0.16;

export function dnaForMutation(mutation?: DnaMutation): AgentWorldDna {
  return { ...DNA_BASE, genome: { ...DNA_BASE.genome, ...(mutation ? { [mutation.gene]: mutation.value } : {}) } };
}

/** Read the very same deterministic growth form used by the renderer, in scene units. */
export function measureDna(dna: AgentWorldDna) {
  const form = growAgentWorldDnaForest(resolveAgentWorldDna(dna));
  let height = 0;
  for (const segment of form.segments) height = Math.max(height, segment.start.y, segment.end.y);
  return { height, branches: form.segments.length, leaves: form.leaves.length, truncated: form.truncated };
}

export function dnaCreationMeasurements(document: AgentWorldDefinition | null) {
  return Object.fromEntries(DNA_SIDES.map((side) => {
    const dna = document?.entities.find((entity) => entity.id === "dna-" + side)?.dna;
    return [side, dna ? measureDna(dna) : null];
  })) as Record<DnaSide, ReturnType<typeof measureDna> | null>;
}

export function dnaCreationMutation(document: AgentWorldDefinition | null): DnaMutation | undefined {
  const dna = document?.entities.find((entity) => entity.id === "dna-variant")?.dna;
  if (!dna) return undefined;
  const resolved = resolveAgentWorldDna(dna);
  return DNA_MUTATIONS.find((mutation) => JSON.stringify(resolved) === JSON.stringify(resolveAgentWorldDna(dnaForMutation(mutation))));
}

const launchPosition = (side: DnaSide, height: number): AgentWorldVector3 => [X[side], DNA_PAD_TOP + height, 3.1];
const seedPhysics = () => ({ mode: "dynamic" as const, mass: 1, friction: 0.2, restitution: 0.72, linearVelocity: [0, 0, 0] as AgentWorldVector3, angularVelocity: [0, 0, 0] as AgentWorldVector3 });

export function dnaSeedResetCommands(document: AgentWorldDefinition | null, sides: readonly DnaSide[] = DNA_SIDES): AgentWorldCommand[] {
  const measurements = dnaCreationMeasurements(document);
  return sides.flatMap((side): AgentWorldCommand[] => measurements[side] ? [{
    op: "update", id: "dna-seed-" + side, patch: {
      transform: { position: launchPosition(side, measurements[side]!.height), rotationDegrees: [0, 0, 0] }, physics: seedPhysics(),
    },
  }] : []);
}

/** Helpers never silently rebuild an edited Studio document or reset someone else's bodies. */
export function dnaCreationCanTune(document: AgentWorldDefinition | null): boolean {
  if (document?.id !== DNA_CREATION_ID || document.joints?.length || document.rules) return false;
  if (document.entities.filter((entity) => entity.physics).length !== 4) return false;
  const gravity = document.environment?.physics?.gravity;
  if (gravity && JSON.stringify(gravity) !== "[0,-9.81,0]") return false;
  return DNA_SIDES.every((side) => {
    const tree = document.entities.find((entity) => entity.id === "dna-" + side);
    const pad = document.entities.find((entity) => entity.id === "dna-pad-" + side);
    const seed = document.entities.find((entity) => entity.id === "dna-seed-" + side);
    const guide = document.entities.find((entity) => entity.id === "dna-guide-" + side);
    const matches = (actual: number[] | undefined, expected: number[]) => actual?.every((value, index) => value === expected[index]) && actual.length === expected.length;
    const identity = (entity: AgentWorldEntityDefinition | undefined) =>
      (!entity?.transform?.scale || matches(entity.transform.scale, [1, 1, 1])) &&
      (!entity?.transform?.rotationDegrees || matches(entity.transform.rotationDegrees, [0, 0, 0]));
    const dna = tree?.dna && JSON.stringify(resolveAgentWorldDna(tree.dna));
    const knownDna = dna === JSON.stringify(resolveAgentWorldDna(dnaForMutation())) ||
      side === "variant" && DNA_MUTATIONS.some((mutation) => dna === JSON.stringify(resolveAgentWorldDna(dnaForMutation(mutation))));
    return tree?.type === "dna-tree" && !!tree.dna && !tree.parentId && !tree.behaviors?.length &&
      knownDna && identity(tree) && identity(pad) && identity(seed) &&
      matches(tree.transform?.position, [X[side], DNA_PAD_TOP, -1.2]) &&
      (!tree.transform?.scale || matches(tree.transform.scale, [1, 1, 1])) &&
      (!tree.transform?.rotationDegrees || matches(tree.transform.rotationDegrees, [0, 0, 0])) &&
      pad?.type === "box" && !pad.parentId && !pad.behaviors?.length && pad.physics?.mode === "static" &&
      matches(pad.transform?.position, [X[side], 0.075, 3.1]) &&
      pad.geometry?.width === 1.8 && pad.geometry.height === 0.35 && pad.geometry.depth === 1.8 &&
      seed?.type === "sphere" && !seed.parentId && !seed.behaviors?.length && seed.geometry?.radius === DNA_SEED_RADIUS &&
      seed.physics?.mode === "dynamic" && seed.physics.mass === 1 && seed.physics.restitution === 0.72 && seed.physics.friction === 0.2 &&
      guide?.type === "cylinder" && !guide.parentId && !guide.behaviors?.length &&
      resolveAgentWorldDna(tree.dna).trees === 1 && resolveAgentWorldDna(tree.dna).growSeconds === 0 && resolveAgentWorldDna(tree.dna).seasonSeconds === 0;
  });
}

export function dnaMutationCommands(mutation: DnaMutation): AgentWorldCommand[] {
  const dna = dnaForMutation(mutation);
  const height = measureDna(dna).height;
  return [
    { op: "update", id: "dna-variant", patch: { dna } },
    { op: "update", id: "dna-guide-variant", patch: { transform: { position: [X.variant, DNA_PAD_TOP + height / 2, 3.1], scale: [1, height, 1] } } },
    { op: "update", id: "dna-seed-variant", patch: { transform: { position: launchPosition("variant", height), rotationDegrees: [0, 0, 0] }, physics: seedPhysics() } },
  ];
}

/** Two authored DNA trees and ordinary Rapier bodies; no private simulation or tree collider. */
export function composeDnaCreation(): AgentWorldDefinition {
  const height = measureDna(DNA_BASE).height;
  const specimens = DNA_SIDES.flatMap((side): AgentWorldEntityDefinition[] => [
    { id: "dna-" + side, type: "dna-tree", label: side === "reference" ? "Référence · ADN initial" : "Variante · ton ADN", dna: dnaForMutation(), transform: { position: [X[side], DNA_PAD_TOP, -1.2] } },
    { id: "dna-island-" + side, type: "cylinder", geometry: { radius: 2.75, height: 0.4, radialSegments: 64 }, transform: { position: [X[side], 0.02, -1.2] }, material: { color: "#294a4e", roughness: 0.88 } },
    { id: "dna-ring-" + side, type: "torus", geometry: { radius: 2.58, tube: 0.025, radialSegments: 64 }, transform: { position: [X[side], 0.235, -1.2], rotationDegrees: [90, 0, 0] }, material: { color: COLOR[side], emissive: COLOR[side], emissiveIntensity: 0.55 } },
    { id: "dna-pad-" + side, type: "box", label: "Sol de rebond · " + side, geometry: { width: 1.8, height: 0.35, depth: 1.8 }, transform: { position: [X[side], 0.075, 3.1] }, material: { color: "#344c57", roughness: 0.5, metalness: 0.25 }, physics: { mode: "static", friction: 0.2, restitution: 0.72 } },
    { id: "dna-guide-" + side, type: "cylinder", label: "Repère de hauteur · " + side, geometry: { radius: 0.009, height: 1, radialSegments: 6 }, transform: { position: [X[side], DNA_PAD_TOP + height / 2, 3.1], scale: [1, height, 1] }, material: { color: COLOR[side], emissive: COLOR[side], emissiveIntensity: 0.3, opacity: 0.25 } },
    { id: "dna-seed-" + side, type: "sphere", label: "Graine · " + side, geometry: { radius: DNA_SEED_RADIUS, radialSegments: 24 }, transform: { position: launchPosition(side, height) }, material: { color: COLOR[side], emissive: COLOR[side], emissiveIntensity: 0.35, roughness: 0.28, metalness: 0.2 }, physics: seedPhysics() },
  ]);
  return {
    schema: "graphysx.agent-world/v2", id: DNA_CREATION_ID, label: "Une mutation, un monde",
    environment: { background: "#112e3b", sky: null, ground: { visible: false, size: 60, color: "#142f38", grid: false, gridColor: "#36616a" }, lighting: { source: "studio", intensity: 0.5, yawDegrees: 0, backgroundIntensity: 0.6, backgroundBlur: 0 }, physics: { gravity: [0, -9.81, 0] } },
    entities: [
      { id: "dna-fill", type: "ambient-light", intensity: 1.25, material: { color: "#c1e1ef" } },
      { id: "dna-sun", type: "directional-light", intensity: 2.7, transform: { position: [-5, 11, 7] }, material: { color: "#ffe1bb" } },
      { id: "dna-floor", type: "cylinder", geometry: { radius: 80, height: 0.2, radialSegments: 64 }, transform: { position: [0, -0.45, 0] }, material: { color: "#193942", roughness: 0.95 } },
      ...specimens,
    ],
  };
}
