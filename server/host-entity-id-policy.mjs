// Host-only entity ids identify transient projections owned by the browser shell. They are
// deliberately valid stable ids — the runtime needs to resolve them like ordinary entities —
// but authored documents and commands must never claim or reference their namespaces.

export const HOST_ONLY_ENTITY_ID_PREFIXES = Object.freeze([
  "live-agent:",
  "live-mission:",
  "live-nestor:",
]);

const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export function hostOnlyEntityIdPrefix(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return HOST_ONLY_ENTITY_ID_PREFIXES.find((prefix) => normalized.startsWith(prefix)) ?? null;
}

function violation(value, path) {
  const prefix = hostOnlyEntityIdPrefix(value);
  return prefix ? { id: value, path, prefix } : null;
}

function prefabPrefixViolation(value, path) {
  const direct = violation(value, path);
  if (direct || typeof value !== "string") return direct;
  // Prefab children are emitted as `${idPrefix}:part`. Validate the trimmed value
  // used by the runtime so an apparently safe root cannot expand into a host namespace.
  const generatedChildPrefix = `${value.trim()}:`;
  const prefix = hostOnlyEntityIdPrefix(generatedChildPrefix);
  return prefix ? { id: value, path, prefix } : null;
}

function behaviorViolation(behavior, path) {
  if (!isRecord(behavior)) return null;
  return violation(behavior.targetId, `${path}.targetId`)
    ?? violation(behavior.splineId, `${path}.splineId`);
}

function interactionViolation(interaction, path) {
  if (!isRecord(interaction) || !Array.isArray(interaction.targetIds)) return null;
  for (let index = 0; index < interaction.targetIds.length; index += 1) {
    const found = violation(interaction.targetIds[index], `${path}.targetIds[${index}]`);
    if (found) return found;
  }
  return null;
}

function entityViolation(entity, path) {
  if (!isRecord(entity)) return null;
  const direct = violation(entity.id, `${path}.id`)
    ?? violation(entity.parentId, `${path}.parentId`)
    ?? violation(entity.steering?.arrowId, `${path}.steering.arrowId`);
  if (direct) return direct;
  for (let index = 0; index < (entity.behaviors?.length ?? 0); index += 1) {
    const found = behaviorViolation(entity.behaviors[index], `${path}.behaviors[${index}]`);
    if (found) return found;
  }
  for (let index = 0; index < (entity.interactions?.length ?? 0); index += 1) {
    const found = interactionViolation(entity.interactions[index], `${path}.interactions[${index}]`);
    if (found) return found;
  }
  return null;
}

function patchViolation(patch, path) {
  if (!isRecord(patch)) return null;
  const direct = violation(patch.parentId, `${path}.parentId`)
    ?? violation(patch.steering?.arrowId, `${path}.steering.arrowId`);
  if (direct) return direct;
  for (let index = 0; index < (patch.behaviors?.length ?? 0); index += 1) {
    const found = behaviorViolation(patch.behaviors[index], `${path}.behaviors[${index}]`);
    if (found) return found;
  }
  for (let index = 0; index < (patch.interactions?.length ?? 0); index += 1) {
    const found = interactionViolation(patch.interactions[index], `${path}.interactions[${index}]`);
    if (found) return found;
  }
  return null;
}

function rulesViolation(rules, path) {
  if (!isRecord(rules)) return null;
  const direct = violation(rules.subjectId, `${path}.subjectId`)
    ?? violation(rules.spawn?.entityId, `${path}.spawn.entityId`)
    ?? violation(rules.finish?.triggerId, `${path}.finish.triggerId`);
  if (direct) return direct;
  for (let index = 0; index < (rules.checkpoints?.length ?? 0); index += 1) {
    const found = violation(rules.checkpoints[index]?.triggerId, `${path}.checkpoints[${index}].triggerId`);
    if (found) return found;
  }
  for (let index = 0; index < (rules.collectibles?.triggerIds?.length ?? 0); index += 1) {
    const found = violation(rules.collectibles.triggerIds[index], `${path}.collectibles.triggerIds[${index}]`);
    if (found) return found;
  }
  for (let index = 0; index < (rules.subjects?.length ?? 0); index += 1) {
    const found = violation(rules.subjects[index]?.id, `${path}.subjects[${index}].id`);
    if (found) return found;
  }
  return null;
}

export function findHostOnlyEntityIdInWorld(definition) {
  if (!isRecord(definition)) return null;
  for (let index = 0; index < (definition.entities?.length ?? 0); index += 1) {
    const found = entityViolation(definition.entities[index], `entities[${index}]`);
    if (found) return found;
  }
  for (let index = 0; index < (definition.joints?.length ?? 0); index += 1) {
    const joint = definition.joints[index];
    if (!isRecord(joint)) continue;
    const found = violation(joint.bodyA, `joints[${index}].bodyA`)
      ?? violation(joint.bodyB, `joints[${index}].bodyB`);
    if (found) return found;
  }
  return rulesViolation(definition.rules, "rules");
}

export function findHostOnlyEntityIdInCommand(command) {
  if (!isRecord(command)) return null;
  if (command.op === "spawn") return entityViolation(command.entity, "spawn.entity");
  if (command.op === "spawn-prefab") return prefabPrefixViolation(command.options?.idPrefix, "spawn-prefab.options.idPrefix");
  if (command.op === "update") {
    return violation(command.id, "update.id") ?? patchViolation(command.patch, "update.patch");
  }
  if (["remove", "attach-behavior", "detach-behavior", "interact", "steer"].includes(command.op)) {
    const target = violation(command.id, `${command.op}.id`);
    if (target || command.op !== "attach-behavior") return target;
    return behaviorViolation(command.behavior, "attach-behavior.behavior");
  }
  if (command.op === "add-joint") {
    return violation(command.joint?.bodyA, "add-joint.joint.bodyA")
      ?? violation(command.joint?.bodyB, "add-joint.joint.bodyB");
  }
  if (command.op === "update-joint") {
    return violation(command.patch?.bodyA, "update-joint.patch.bodyA")
      ?? violation(command.patch?.bodyB, "update-joint.patch.bodyB");
  }
  return null;
}

function namespaceError(found) {
  return new Error(
    `Authored ${found.path} cannot use host-only entity namespace '${found.prefix}': ${found.id}`,
  );
}

export function assertAuthoredWorldEntityNamespaces(definition) {
  const found = findHostOnlyEntityIdInWorld(definition);
  if (found) throw namespaceError(found);
}

export function assertAuthoredSceneCommandNamespaces(command) {
  const found = findHostOnlyEntityIdInCommand(command);
  if (found) throw namespaceError(found);
}
