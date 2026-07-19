// Applying commands to a scene *document* — no runtime, no three, no cannon.
//
// This lives on the server side of the tree because the store is what arbitrates document
// semantics: it decides what a change means and what the resulting revision is. The agent
// CLI is a client of that, not the owner of it, so it imports from here rather than the
// other way round.
//
// The vocabulary is a deliberate subset of AgentWorldCommand (agent-world-runtime.ts):
// spawn / update / remove / set-environment — the ops that mean something to a document
// with no simulation running. `interact` and the behaviour ops need a live world.

const WORLD_SCHEMA = "graphysx.agent-world/v2";
const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/;

export class SceneCommandError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "SceneCommandError";
    this.status = status;
  }
}

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (Math.imul(31, hash) + value.charCodeAt(index)) | 0;
  return hash;
}

/**
 * Applies one command in place. Narrow and loud: a malformed command should fail here with
 * a clear message rather than produce a document that fails to load in a browser later.
 */
function applyCommand(definition, command) {
  const entities = definition.entities;

  if (command.op === "spawn") {
    const entity = command.entity;
    if (!entity || typeof entity !== "object") throw new SceneCommandError("spawn requires an entity");
    if (!entity.type) throw new SceneCommandError("spawn requires an entity type");
    // Everything written to the store is authoring, and authoring persists by definition.
    // Throwing something into a scene someone is living in is a live-channel act.
    if (entity.ephemeral) {
      throw new SceneCommandError("Cannot store a session-only entity: the scene store holds authored content, not session state");
    }
    if (entity.id !== undefined && !ID_PATTERN.test(entity.id)) throw new SceneCommandError(`Invalid entity id: ${entity.id}`);
    const id = entity.id ?? `agent-${Math.abs(hashString(JSON.stringify(entity) + entities.length)).toString(36).slice(0, 8)}`;
    if (entities.some((existing) => existing.id === id)) throw new SceneCommandError(`Entity id already exists: ${id}`);
    entities.push({ ...entity, id });
    return { op: "spawn", id };
  }

  if (command.op === "update") {
    const index = entities.findIndex((entity) => entity.id === command.id);
    if (index === -1) throw new SceneCommandError(`Unknown entity: ${command.id}`);
    const current = entities[index];
    const patch = command.patch ?? {};
    // Merge one level deep for the nested groups agents actually patch; a shallow spread
    // would silently drop the rest of a transform when only `position` is sent.
    entities[index] = {
      ...current,
      ...patch,
      transform: patch.transform ? { ...current.transform, ...patch.transform } : current.transform,
      material: patch.material ? { ...current.material, ...patch.material } : current.material,
      physics: patch.physics === null ? undefined : patch.physics ? { ...current.physics, ...patch.physics } : current.physics,
    };
    return { op: "update", id: command.id };
  }

  if (command.op === "remove") {
    if (!entities.some((entity) => entity.id === command.id)) throw new SceneCommandError(`Unknown entity: ${command.id}`);
    // Children would otherwise dangle onto a parent that no longer exists.
    const removed = [command.id];
    for (let pass = 0; pass < entities.length; pass += 1) {
      for (const entity of entities) {
        if (entity.parentId && removed.includes(entity.parentId) && !removed.includes(entity.id)) removed.push(entity.id);
      }
    }
    definition.entities = entities.filter((entity) => !removed.includes(entity.id));
    return { op: "remove", ids: removed };
  }

  if (command.op === "set-environment") {
    definition.environment = { ...definition.environment, ...command.environment };
    return { op: "set-environment" };
  }

  throw new SceneCommandError(`Unsupported command for document editing: ${command.op}`);
}

export function applyCommands(definition, commands) {
  if (!Array.isArray(commands) || commands.length === 0) throw new SceneCommandError("At least one command is required");
  const next = structuredClone(definition);
  if (next.schema !== WORLD_SCHEMA) throw new SceneCommandError(`Scene schema must be ${WORLD_SCHEMA}`);
  if (!Array.isArray(next.entities)) throw new SceneCommandError("Scene entities must be an array");
  const outputs = commands.map((command) => applyCommand(next, command));
  return { definition: next, outputs };
}

/** A short human sentence for a change, used when the caller supplies no intent. */
export function describeCommands(commands, outputs) {
  if (commands.length === 1) {
    const [command] = commands;
    if (command.op === "spawn") return `added ${command.entity.label ?? command.entity.type} ${outputs[0]?.id ?? ""}`.trim();
    if (command.op === "remove") return `removed ${outputs[0]?.ids?.join(", ") ?? command.id}`;
    if (command.op === "update") return `changed ${command.id}`;
    if (command.op === "set-environment") return "changed the environment";
  }
  return `applied ${commands.length} changes`;
}
