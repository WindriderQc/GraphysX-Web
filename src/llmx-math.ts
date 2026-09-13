import type { AgentWorldCommand, AgentWorldEntityDefinition, AgentWorldEntityPatch, AgentWorldVector3 } from "./agent-world-runtime";

/** Scene-native arithmetic: one user step moves one unit, with no clock or parallel store. */
export type LlmXMathOperation = "count" | "add" | "subtract";
export type LlmXMathConfig = { operation: LlmXMathOperation; left: number; right: number; step: number };
export type LlmXMathBuildZone = { center: AgentWorldVector3; radius: number };
export type LlmXMathLabels = {
  title: string; initial: string; action: string; result: string; equation: string;
  leftGroup: string; rightGroup: string; nextAction: string;
};
export type LlmXMathLesson = {
  config: LlmXMathConfig;
  buildZone: LlmXMathBuildZone;
  result: number;
  stepCount: number;
  complete: boolean;
  quantities: { left: number; right: number; total: number };
  labels: LlmXMathLabels;
  narrative: string;
  entities: AgentWorldEntityDefinition[];
  commands: AgentWorldCommand[];
};

/** Prefer exportDocument(); state() exposes rounded world positions and local scales flat. */
type MathEntity = Pick<AgentWorldEntityDefinition, "id" | "type" | "label" | "tags" | "visible" | "ephemeral" | "material" | "geometry" | "castShadow" | "receiveShadow"> & {
  parentId?: string | null;
  transform?: AgentWorldEntityDefinition["transform"];
  position?: AgentWorldVector3;
  rotationDegrees?: AgentWorldVector3;
  scale?: AgentWorldVector3;
};
export type LlmXMathWorld = { entities: readonly MathEntity[] };

export const LLMX_MATH_ROOT_ID = "llmx-created-math";
export const LLMX_MATH_TAG = "llmx-math-v1";
const UNIT_TAG = "llmx-math-unit";
const BASE_RADIUS = 2.6;
const UNIT_EDGE = 0.22;
const LEFT_X = -0.88;
const RIGHT_X = 0.88;
const ZERO: AgentWorldVector3 = [0, 0, 0];
const ONE: AgentWorldVector3 = [1, 1, 1];
const ownsMathId = (id: string | undefined): boolean => id === LLMX_MATH_ROOT_ID || !!id?.startsWith(`${LLMX_MATH_ROOT_ID}-`);

export class LlmXMathError extends Error {}

function integer(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 20) {
    throw new LlmXMathError(`${name} must be an integer from 0 to 20`);
  }
  return value;
}

export function validateLlmXMathConfig(source: LlmXMathConfig): LlmXMathConfig {
  if (!source || !["count", "add", "subtract"].includes(source.operation)) throw new LlmXMathError("Unknown arithmetic operation");
  const left = integer(source.left, "left");
  const right = integer(source.right, "right");
  const step = integer(source.step, "step");
  if (source.operation === "count" && right !== 0) throw new LlmXMathError("Counting has only one starting quantity; right must be zero");
  if (source.operation === "add" && left + right > 20) throw new LlmXMathError("The sum must stay within 0 to 20");
  if (source.operation === "subtract" && right > left) throw new LlmXMathError("Subtraction cannot go below zero");
  const stepCount = source.operation === "count" ? left : right;
  if (step > stepCount) throw new LlmXMathError("The step exceeds the number of units to move");
  return { operation: source.operation, left, right, step };
}

function vector(value: unknown, name: string): AgentWorldVector3 {
  if (!Array.isArray(value) || value.length !== 3 || value.some(v => typeof v !== "number" || !Number.isFinite(v))) {
    throw new LlmXMathError(`${name} must contain three finite coordinates`);
  }
  return [...value] as AgentWorldVector3;
}

function zoneOf(source: LlmXMathBuildZone): LlmXMathBuildZone {
  const center = vector(source?.center, "buildZone.center");
  if (typeof source?.radius !== "number" || !Number.isFinite(source.radius) || source.radius <= 0) {
    throw new LlmXMathError("buildZone.radius must be positive and finite");
  }
  return { center, radius: source.radius };
}

function configTags(config: LlmXMathConfig): string[] {
  return [LLMX_MATH_TAG, "llmx-math-config", ...Object.entries(config).map(([key, value]) => `llmx-math:${key}:${value}`)];
}

/** Counted units always occupy a single layer, in rows of five with an explicit gap. */
function slot(group: "left" | "right", index: number): AgentWorldVector3 {
  return [(group === "left" ? LEFT_X : RIGHT_X) + (index % 5 - 2) * 0.26, 0.13, -0.23 + Math.floor(index / 5) * 0.26];
}

const material = (color: string) => ({ color, emissive: color, emissiveIntensity: 0.12, metalness: 0, roughness: 0.9 });

function box(id: string, label: string, position: AgentWorldVector3, scale: AgentWorldVector3, color: string, tags: string[] = []): AgentWorldEntityDefinition {
  return {
    id: `${LLMX_MATH_ROOT_ID}-${id}`, type: "box", label, parentId: LLMX_MATH_ROOT_ID,
    transform: { position, scale, rotationDegrees: [...ZERO] }, material: material(color),
    visible: true, castShadow: false, receiveShadow: false, tags: [LLMX_MATH_TAG, ...tags],
  };
}

// Native box segments, lying on the tabletop. No canvas texture, font download or extra renderer.
const DIGITS: Record<string, string> = { "0": "abcdef", "1": "bc", "2": "abged", "3": "abgcd", "4": "fgbc", "5": "afgcd", "6": "afgecd", "7": "abc", "8": "abcdefg", "9": "abfgcd" };
const SEGMENTS: Record<string, [number, number, number, number]> = {
  a: [0, -0.15, 0.15, 0.035], b: [0.075, -0.075, 0.035, 0.15], c: [0.075, 0.075, 0.035, 0.15],
  d: [0, 0.15, 0.15, 0.035], e: [-0.075, 0.075, 0.035, 0.15], f: [-0.075, -0.075, 0.035, 0.15],
  g: [0, 0, 0.15, 0.035], v: [0, 0, 0.035, 0.19], u: [0, -0.045, 0.15, 0.035], l: [0, 0.045, 0.15, 0.035],
};

function glyphs(id: string, text: string, x: number, z: number): AgentWorldEntityDefinition[] {
  return [...text].flatMap((character, index) => {
    const segments = DIGITS[character] ?? (character === "+" ? "gv" : character === "−" ? "g" : character === "=" ? "ul" : "");
    return [...segments].map(segment => {
      const [dx, dz, width, depth] = SEGMENTS[segment];
      return box(`${id}-${index}-${segment}`, `${text} · repère`, [x + (index - (text.length - 1) / 2) * 0.245 + dx, 0.035, z + dz],
        [width, 0.015, depth], "#f1f4ed", ["llmx-math-marker"]);
    });
  });
}

/** Build one complete authored state. `commands` is the initial spawn transaction. */
export function buildLlmXMath(source: LlmXMathConfig, placement: LlmXMathBuildZone): LlmXMathLesson {
  const config = validateLlmXMathConfig(source);
  const buildZone = zoneOf(placement);
  const { operation, left, right, step } = config;
  const result = operation === "add" ? left + right : operation === "subtract" ? left - right : left;
  const stepCount = operation === "count" ? left : right;
  const complete = step === stepCount;
  const quantities = operation === "add" ? { left: left + step, right: right - step, total: result }
    : { left: left - step, right: step, total: left };
  const labels: LlmXMathLabels = {
    title: operation === "count" ? "Compter les cubes" : operation === "add" ? "Réunir les cubes" : "Retirer des cubes",
    initial: operation === "add" ? `Au départ : ${left} cubes et ${right} cubes.` : `Au départ : ${left} cubes.`,
    action: operation === "count" ? `${step} cube${step === 1 ? "" : "s"} compté${step === 1 ? "" : "s"}.`
      : operation === "add" ? `${step} cube${step === 1 ? "" : "s"} ajouté${step === 1 ? "" : "s"} sur ${right}.`
        : `${step} cube${step === 1 ? "" : "s"} retiré${step === 1 ? "" : "s"} sur ${right}.`,
    result: operation === "subtract" ? `Résultat final : ${result} cubes restants.` : `Quantité totale : ${result} cubes.`,
    equation: operation === "count" ? `${left}=${result}` : `${left}${operation === "add" ? "+" : "−"}${right}=${result}`,
    leftGroup: operation === "count" ? "À compter" : operation === "subtract" ? "Restants" : "Réunis",
    rightGroup: operation === "count" ? "Comptés" : operation === "subtract" ? "Retirés" : "À ajouter",
    nextAction: complete ? "Tous les déplacements sont terminés" : operation === "count" ? "Compter un cube"
      : operation === "add" ? "Ajouter un cube" : "Retirer un cube",
  };
  const scale = buildZone.radius / BASE_RADIUS;
  const entities: AgentWorldEntityDefinition[] = [{
    id: LLMX_MATH_ROOT_ID, type: "group", label: labels.title,
    transform: { position: [...buildZone.center], rotationDegrees: [...ZERO], scale: [scale, scale, scale] },
    tags: configTags(config), visible: true,
  },
  box("left-board", labels.leftGroup, [LEFT_X, 0, 0], [1.55, 0.04, 1.78], "#1b2937", ["llmx-math-zone:left"]),
  box("right-board", labels.rightGroup, [RIGHT_X, 0, 0], [1.55, 0.04, 1.78], "#2b2930", ["llmx-math-zone:right"]),
  ...glyphs("left-quantity", String(quantities.left), LEFT_X, -0.64),
  ...glyphs("right-quantity", String(quantities.right), RIGHT_X, -0.64),
  ...glyphs("equation", labels.equation, 0, 1.22)];

  const unit = (sourceGroup: "a" | "b", index: number, destination: "left" | "right", destinationIndex: number) => {
    entities.push(box(`unit-${sourceGroup}-${index}`, `Cube ${index + 1} · ${destination === "left" ? labels.leftGroup : labels.rightGroup}`,
      slot(destination, destinationIndex), [UNIT_EDGE, UNIT_EDGE, UNIT_EDGE], sourceGroup === "a" ? "#6fd9ef" : "#efbb68",
      [UNIT_TAG, `llmx-math:source:${sourceGroup}`, `llmx-math:index:${index}`, `llmx-math:zone:${destination}`]));
  };
  for (let index = 0; index < left; index += 1) {
    if (operation === "count" && index < step) unit("a", index, "right", index);
    else if (operation === "subtract" && index >= left - step) unit("a", index, "right", left - 1 - index);
    else unit("a", index, "left", index);
  }
  if (operation === "add") for (let index = 0; index < right; index += 1) {
    if (index < step) unit("b", index, "left", left + index);
    else unit("b", index, "right", index);
  }
  return { config, buildZone, result, stepCount, complete, quantities, labels,
    narrative: `${labels.initial} ${labels.action} ${complete ? labels.result : labels.nextAction + "."}`,
    entities, commands: entities.map(entity => ({ op: "spawn", entity })) };
}

export function advanceLlmXMath(source: LlmXMathConfig, direction: 1 | -1 = 1): LlmXMathConfig {
  const config = validateLlmXMathConfig(source);
  if (direction !== 1 && direction !== -1) throw new LlmXMathError("Step direction must be 1 or -1");
  const maximum = config.operation === "count" ? config.left : config.right;
  return { ...config, step: Math.max(0, Math.min(maximum, config.step + direction)) };
}

type MathTransform = { position: AgentWorldVector3; rotationDegrees: AgentWorldVector3; scale: AgentWorldVector3 };
function transformOf(entity: MathEntity, parent?: MathTransform): MathTransform {
  const transform = {
    position: vector(entity.transform?.position ?? entity.position ?? ZERO, "entity.position"),
    rotationDegrees: vector(entity.transform?.rotationDegrees ?? entity.rotationDegrees ?? ZERO, "entity.rotationDegrees"),
    scale: vector(entity.transform?.scale ?? entity.scale ?? ONE, "entity.scale"),
  };
  if (!entity.transform && parent && entity.parentId === LLMX_MATH_ROOT_ID) {
    transform.position = transform.position.map((value, axis) => (value - parent.position[axis]) / parent.scale[axis]) as AgentWorldVector3;
  }
  return transform;
}

const sameVector = (a: number[], b: number[], tolerance = 1e-6) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < tolerance);

/** Recover arithmetic from the root tags; transforms remain ordinary scene-owned transforms. */
export function recoverLlmXMath(world: LlmXMathWorld | null | undefined): LlmXMathLesson | null {
  if (!world) return null;
  const roots = world.entities.filter(entity => entity.id === LLMX_MATH_ROOT_ID);
  if (!roots.length) {
    if (world.entities.some(entity => ownsMathId(entity.id) && entity.tags?.includes(LLMX_MATH_TAG))) throw new LlmXMathError("The arithmetic workshop has no root");
    return null;
  }
  if (roots.length !== 1) throw new LlmXMathError("The arithmetic workshop has duplicate roots");
  const root = roots[0];
  if (root.type !== "group" || !root.tags?.includes(LLMX_MATH_TAG) || root.parentId || root.visible === false || root.ephemeral) {
    throw new LlmXMathError("The arithmetic root is not a visible authored group");
  }
  const tag = (key: string) => {
    const prefix = `llmx-math:${key}:`;
    const values = root.tags!.filter(value => value.startsWith(prefix)).map(value => value.slice(prefix.length));
    if (values.length !== 1) throw new LlmXMathError(`Missing or duplicate arithmetic ${key}`);
    return values[0];
  };
  const quantity = (key: string) => {
    const value = tag(key);
    if (!/^(0|[1-9][0-9]?)$/.test(value)) throw new LlmXMathError(`Invalid arithmetic ${key}`);
    return Number(value);
  };
  const config = validateLlmXMathConfig({ operation: tag("operation") as LlmXMathOperation, left: quantity("left"), right: quantity("right"), step: quantity("step") });
  const transform = transformOf(root);
  if (!sameVector(transform.rotationDegrees, ZERO) || transform.scale[0] <= 0 || !sameVector(transform.scale, Array(3).fill(transform.scale[0]))) {
    throw new LlmXMathError("The counting table must stay level with a uniform scale");
  }
  const lesson = buildLlmXMath(config, { center: transform.position, radius: transform.scale[0] * BASE_RADIUS });
  const expectedIds = new Set(lesson.entities.map(entity => entity.id));
  if (world.entities.some(entity => entity.parentId && expectedIds.has(entity.parentId) && !expectedIds.has(entity.id))) {
    throw new LlmXMathError("An unrelated object was attached inside the counting table");
  }
  const children = world.entities.filter(entity => ownsMathId(entity.id) && entity.tags?.includes(LLMX_MATH_TAG) && entity.id !== LLMX_MATH_ROOT_ID);
  const expectedChildren = lesson.entities.filter(entity => entity.id !== LLMX_MATH_ROOT_ID);
  if (children.length !== expectedChildren.length) throw new LlmXMathError("The visible workshop no longer matches its saved configuration");
  for (const expected of expectedChildren) {
    const matches = children.filter(entity => entity.id === expected.id);
    if (matches.length !== 1) throw new LlmXMathError("A counting cube, zone or numeric marker is missing or duplicated");
    const actual = matches[0];
    const actualTransform = transformOf(actual, transform);
    const expectedTransform = transformOf(expected);
    // state() rounds both the root and child world coordinates to millimetres. Allow that
    // representation error; exported authored transforms still receive an exact comparison.
    const positionTolerance = actual.transform ? 1e-6 : 0.0025 / transform.scale[0];
    if (actual.type !== "box" || actual.parentId !== LLMX_MATH_ROOT_ID || actual.visible === false || actual.ephemeral
      || (actual.material?.opacity ?? 1) <= 0
      || [actual.geometry?.width ?? 1, actual.geometry?.height ?? 1, actual.geometry?.depth ?? 1].some(value => value !== 1)
      || expected.tags!.some(value => !actual.tags?.includes(value))
      || actual.tags!.filter(value => value.startsWith("llmx-math:")).length !== expected.tags!.filter(value => value.startsWith("llmx-math:")).length
      || !sameVector(actualTransform.position, expectedTransform.position, positionTolerance)
      || !sameVector(actualTransform.scale, expectedTransform.scale)
      || !sameVector(actualTransform.rotationDegrees, ZERO)) {
      throw new LlmXMathError("A cube, zone or numeric marker was changed outside the exercise");
    }
  }
  return lesson;
}

/** One semantic step becomes one ordinary host commit, preserving existing cube identities. */
export function reconcileLlmXMathCommands(world: LlmXMathWorld | null | undefined, lesson: LlmXMathLesson): AgentWorldCommand[] {
  const current = world?.entities ?? [];
  const desired = new Map(lesson.entities.map(entity => [entity.id!, entity]));
  const existing = new Map(current.map(entity => [entity.id!, entity]));
  const previousRoot = existing.get(LLMX_MATH_ROOT_ID);
  const parentTransform = previousRoot ? transformOf(previousRoot) : undefined;
  const commands: AgentWorldCommand[] = [];
  for (const entity of current) {
    if (ownsMathId(entity.id) && entity.tags?.includes(LLMX_MATH_TAG) && !desired.has(entity.id!)) commands.push({ op: "remove", id: entity.id! });
  }
  for (const entity of lesson.entities) {
    const previous = existing.get(entity.id!);
    if (!previous) { commands.push({ op: "spawn", entity }); continue; }
    if (!previous.tags?.includes(LLMX_MATH_TAG) || previous.type !== entity.type) throw new LlmXMathError(`Arithmetic entity id is already in use: ${entity.id}`);
    const patch: AgentWorldEntityPatch = {};
    if (previous.label !== entity.label) patch.label = entity.label;
    if ((previous.parentId ?? null) !== (entity.parentId ?? null)) patch.parentId = entity.parentId ?? null;
    const priorTransform = transformOf(previous, parentTransform);
    const nextTransform = transformOf(entity);
    const positionTolerance = previous.transform ? 1e-6 : 0.0025 / (parentTransform?.scale[0] ?? 1);
    if (!sameVector(priorTransform.position, nextTransform.position, positionTolerance) || !sameVector(priorTransform.scale, nextTransform.scale, previous.transform ? 1e-6 : 0.00051)
      || !sameVector(priorTransform.rotationDegrees, nextTransform.rotationDegrees)) patch.transform = nextTransform;
    if (JSON.stringify(previous.tags) !== JSON.stringify(entity.tags)) patch.tags = entity.tags;
    if (entity.material && Object.entries(entity.material).some(([key, value]) => previous.material?.[key as keyof typeof previous.material] !== value)) patch.material = entity.material;
    if (previous.visible === false) patch.visible = true;
    if (previous.ephemeral === true) patch.ephemeral = false;
    if (entity.castShadow !== undefined && previous.castShadow !== entity.castShadow) patch.castShadow = entity.castShadow;
    if (entity.receiveShadow !== undefined && previous.receiveShadow !== entity.receiveShadow) patch.receiveShadow = entity.receiveShadow;
    if (Object.keys(patch).length) commands.push({ op: "update", id: entity.id!, patch });
  }
  return commands;
}
