// Pure vocabulary shared by document storage, command validation and the browser runtime.
export const WORLD_SCHEMA = "graphysx.agent-world/v2";
export const WORLD_ENTITY_TYPES = Object.freeze([
  "group", "agent", "box", "sphere", "icosahedron", "cylinder", "cone", "torus", "plane",
  "spline", "model", "emitter", "terrain", "water", "flock", "crowd", "force-field",
  "formula-field", "dna-tree", "sound", "ambient-light", "directional-light", "point-light",
]);

export function assertWorldDefinition(definition) {
  if (!definition || definition.schema !== WORLD_SCHEMA) throw new Error(`World schema must be ${WORLD_SCHEMA}`);
  if (typeof definition.id !== "string" || !definition.id.trim() || typeof definition.label !== "string" || !definition.label.trim()) {
    throw new Error("World id and label are required");
  }
  if (!Array.isArray(definition.entities)) throw new Error("World entities must be an array");
  if (definition.joints !== undefined && !Array.isArray(definition.joints)) throw new Error("World joints must be an array");
  for (const entity of definition.entities) {
    if (!entity || !WORLD_ENTITY_TYPES.includes(entity.type)) throw new Error(`Unsupported entity type: ${String(entity?.type)}`);
  }
}

const RULES_SCHEMA = "graphysx.agent-rules/v1";

export function assertRulesDefinition(rules, knownIds) {
  if (!rules || typeof rules !== "object") throw new Error("Rules must be an object");
  for (const key of ["checkpoints", "subjects"]) {
    if (rules[key] !== undefined && !Array.isArray(rules[key])) throw new Error(`Rules ${key} must be an array`);
  }
  if (rules.collectibles?.triggerIds !== undefined && !Array.isArray(rules.collectibles.triggerIds)) {
    throw new Error("Rules collectible triggerIds must be an array");
  }
  if (rules.schema !== RULES_SCHEMA) {
    throw new Error(`Rules schema must be ${RULES_SCHEMA}`);
  }
  const require = (id, what) => {
    if (!knownIds.has(id)) throw new Error(`Rules ${what} references unknown entity: ${id}`);
  };
  if (rules.subjectId) require(rules.subjectId, "subject");
  if (rules.spawn) require(rules.spawn.entityId, "spawn");
  if (rules.finish) require(rules.finish.triggerId, "finish");
  for (const checkpoint of rules.checkpoints ?? []) require(checkpoint.triggerId, "checkpoint");
  for (const id of rules.collectibles?.triggerIds ?? []) require(id, "collectible");

  const seen = new Set();
  for (const checkpoint of rules.checkpoints ?? []) {
    // A repeated gate in the ordered set would need the subject to cross the same volume
    // twice without leaving it, which AABB occupancy makes impossible — the second crossing
    // never fires and the lap deadlocks. Better to refuse the authoring than to ship a
    // course that cannot be finished.
    if (seen.has(checkpoint.triggerId)) throw new Error(`Rules repeat checkpoint: ${checkpoint.triggerId}`);
    seen.add(checkpoint.triggerId);
  }
  if (rules.laps !== undefined && (!Number.isFinite(rules.laps) || rules.laps < 1)) {
    throw new Error("Rules laps must be a positive number");
  }
  if (rules.subjects) {
    if (rules.subjects.length === 0) throw new Error("Rules subjects must not be an empty list");
    const subjectIds = new Set();
    for (const subject of rules.subjects) {
      require(subject.id, "race subject");
      if (subjectIds.has(subject.id)) throw new Error(`Rules repeat race subject: ${subject.id}`);
      subjectIds.add(subject.id);
    }
    // The primary must be a racer: a `status()` that answered for a subject outside the race
    // would rank nobody and desync every HUD built on it.
    if (rules.subjectId && !subjectIds.has(rules.subjectId)) {
      throw new Error(`Rules subjectId must be one of the race subjects: ${rules.subjectId}`);
    }
  }
  if (rules.timer?.limitSeconds !== undefined && !(rules.timer.limitSeconds > 0)) {
    throw new Error("Rules timer limitSeconds must be a positive number");
  }
  if (
    rules.collectibles?.targetCount !== undefined
    && (!Number.isInteger(rules.collectibles.targetCount) || rules.collectibles.targetCount < 1)
  ) {
    throw new Error("Rules collectibles.targetCount must be a positive integer");
  }
  if (!rules.finish && !rules.checkpoints?.length && !rules.collectibles) {
    // A block with a spawn and a clock and nothing to reach is almost certainly a half-typed
    // course rather than an intent. Say so now.
    throw new Error("Rules need at least a finish, a checkpoint or a collectible to be reachable");
  }
}
