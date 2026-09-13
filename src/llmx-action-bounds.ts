import { Box3, Euler, Matrix4, Quaternion, Vector3 } from "three";
import type { AgentWorldDefinition, AgentWorldEntityDefinition } from "./agent-world-runtime";

export type LlmXCreationBuildZone = { center: readonly [number, number, number]; radius: number };
const fail = () => new Error("Cette création dépasse l’espace de construction. Réduis sa taille ou rapproche-la du centre.");
const malformed = () => new Error("Les dimensions ou les ancrages de cette création sont invalides.");
const supported = new Set(["box", "sphere", "icosahedron", "cylinder", "cone", "torus", "plane", "group", "point-light"]);
const epsilon = 1e-8;

function vector(value: readonly number[], minimum = -Infinity, maximum = Infinity): Vector3 {
  if (!Array.isArray(value) || value.length !== 3 || value.some(n => !Number.isFinite(n) || n < minimum || n > maximum)) throw malformed();
  return new Vector3(...value);
}

/** Conservative local bounds matching agent-world-runtime DEFAULT_GEOMETRY/createGeometry. */
function localBounds(entity: AgentWorldEntityDefinition): Box3 | null {
  if (!supported.has(entity.type)) throw malformed();
  if (entity.type === "group") return null;
  const geometry = entity.geometry ?? {};
  const dimension = (key: keyof typeof geometry, fallback: number): number => {
    const value = geometry[key] ?? fallback;
    if (!Number.isFinite(value) || value <= 0) throw malformed();
    return value;
  };
  let half: Vector3;
  switch (entity.type) {
    case "box": half = new Vector3(dimension("width", 1) / 2, dimension("height", 1) / 2, dimension("depth", 1) / 2); break;
    case "sphere": case "icosahedron": half = new Vector3().setScalar(dimension("radius", 0.5)); break;
    case "cylinder": case "cone": {
      const radius = dimension("radius", 0.5);
      half = new Vector3(radius, dimension("height", 1) / 2, radius); break;
    }
    case "torus": {
      const tube = dimension("tube", 0.12), radius = dimension("radius", 0.5) + tube;
      half = new Vector3(radius, radius, tube); break;
    }
    // The runtime rotates its plane into XZ before applying the entity transform.
    case "plane": half = new Vector3(dimension("width", 1) / 2, 0, dimension("depth", 1) / 2); break;
    // The light owns a radius-.12 marker, retained even when temporarily hidden.
    case "point-light": half = new Vector3().setScalar(0.12); break;
    default: throw malformed();
  }
  return new Box3(half.clone().negate(), half);
}

/** Check the complete preflight document before committing any native commands. No scene objects are allocated. */
export function validateLlmXCreationBounds(world: AgentWorldDefinition, buildZone: LlmXCreationBuildZone, mathZone: LlmXCreationBuildZone = buildZone): void {
  const center = vector(buildZone.center);
  if (!Number.isFinite(buildZone.radius) || buildZone.radius <= 0) throw malformed();
  const allowed = new Box3(new Vector3(center.x - buildZone.radius, center.y - 0.15, center.z - buildZone.radius),
    new Vector3(center.x + buildZone.radius, center.y + 6, center.z + buildZone.radius));
  const mathCenter = vector(mathZone.center);
  if (!Number.isFinite(mathZone.radius) || mathZone.radius <= 0) throw malformed();
  const mathAllowed = new Box3(new Vector3(mathCenter.x - mathZone.radius, mathCenter.y - 0.15, mathCenter.z - mathZone.radius),
    new Vector3(mathCenter.x + mathZone.radius, mathCenter.y + 6, mathCenter.z + mathZone.radius));
  const entities = new Map<string, AgentWorldEntityDefinition>();
  for (const entity of world.entities) {
    if (!entity.id) continue;
    if (entities.has(entity.id)) throw malformed();
    entities.set(entity.id, entity);
  }
  const matrices = new Map<string, Matrix4>(), visiting = new Set<string>();
  const worldMatrix = (id: string): Matrix4 => {
    const cached = matrices.get(id);
    if (cached) return cached;
    const entity = entities.get(id);
    if (!entity || visiting.has(id)) throw malformed();
    visiting.add(id);
    const transform = entity.transform;
    const position = vector(transform?.position ?? [0, 0, 0], -10000, 10000);
    const rotation = vector(transform?.rotationDegrees ?? [0, 0, 0], -360000, 360000).multiplyScalar(Math.PI / 180);
    const scale = vector(transform?.scale ?? [1, 1, 1], 0.001, 1000);
    const quaternion = new Quaternion().setFromEuler(new Euler(rotation.x, rotation.y, rotation.z, "XYZ"));
    const matrix = new Matrix4().compose(position, quaternion, scale);
    if (entity.parentId) matrix.premultiply(worldMatrix(entity.parentId));
    if (matrix.elements.some(value => !Number.isFinite(value))) throw malformed();
    matrices.set(id, matrix); visiting.delete(id);
    return matrix;
  };
  for (const [id, entity] of entities) {
    if (!id.startsWith("llmx-created-")) continue;
    const bounds = localBounds(entity), matrix = worldMatrix(id);
    if (!bounds) continue; // Empty groups add no artificial unit cube.
    bounds.applyMatrix4(matrix);
    const { min, max } = bounds;
    const area = id === 'llmx-created-math' || id.startsWith('llmx-created-math-') ? mathAllowed : allowed;
    if ([...min.toArray(), ...max.toArray()].some(value => !Number.isFinite(value)) ||
        min.x < area.min.x - epsilon || max.x > area.max.x + epsilon ||
        min.y < area.min.y - epsilon || max.y > area.max.y + epsilon ||
        min.z < area.min.z - epsilon || max.z > area.max.z + epsilon) throw fail();
  }
}
