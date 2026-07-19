// The agent-facing surface for the scene store: what Hermes calls.
//
// Milestone A applies commands to the *document*, not to a running world. The runtime's
// own `commit()` needs three + cannon and therefore a browser; here we edit the JSON and
// let whichever client has the scene open reload it. That trade is what makes this
// reachable from a Telegram bot on another machine with no browser involved.
//
// The command vocabulary is a deliberate subset of AgentWorldCommand
// (agent-world-runtime.ts:319) — spawn / update / remove / set-environment. Those are the
// ones that mean something to a document with no simulation running. `interact` and the
// behavior ops need a live world, so they stay on the in-page bridge.
//
// Usage as a library:
//   import { editScene } from "./tools/graphysx-scene-agent.mjs";
//   await editScene("http://localhost:8788", "welcome", [{ op: "spawn", entity: {...} }]);

const WORLD_SCHEMA = "graphysx.agent-world/v2";
const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/;

/** Conflicts are expected when a human and an agent share a scene, so we rebase and retry. */
const DEFAULT_RETRIES = 3;

class SceneAgentError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "SceneAgentError";
    this.status = status;
  }
}

async function api(baseUrl, path, init) {
  const root = baseUrl.replace(/\/+$/, "");
  let response;
  try {
    response = await fetch(`${root}${path}`, init);
  } catch (error) {
    throw new SceneAgentError(`Scene store unreachable at ${root}: ${error?.message ?? error}`);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new SceneAgentError(payload?.error ?? `Scene store responded ${response.status}`, response.status);
    if (typeof payload?.revision === "number") error.revision = payload.revision;
    throw error;
  }
  return payload;
}

export function listScenes(baseUrl) {
  return api(baseUrl, "/scenes").then((payload) => payload.scenes);
}

export function openScene(baseUrl, name) {
  return api(baseUrl, `/scenes/${encodeURIComponent(name)}`);
}

export function putScene(baseUrl, name, definition, expectedRevision, { actor = null, intent = null } = {}) {
  return api(baseUrl, `/scenes/${encodeURIComponent(name)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ definition, expectedRevision, actor, intent }),
  });
}

function vector(value, label) {
  if (!Array.isArray(value) || value.length !== 3 || value.some((n) => typeof n !== "number" || !Number.isFinite(n))) {
    throw new SceneAgentError(`${label} must be three finite numbers`);
  }
  return [...value];
}

/**
 * Applies one command to a definition in place. Kept narrow and loud: an agent sending a
 * malformed command should get a clear error here rather than a scene that fails to load
 * in the browser twenty seconds later.
 */
function applyCommand(definition, command) {
  const entities = definition.entities;

  if (command.op === "spawn") {
    const entity = command.entity;
    if (!entity || typeof entity !== "object") throw new SceneAgentError("spawn requires an entity");
    if (!entity.type) throw new SceneAgentError("spawn requires an entity type");
    // Editing the store is authoring, so everything written here persists by definition.
    // Throwing something into a scene someone is living in is a live-channel act and has
    // no document to land in — that arrives with milestone B.
    if (entity.ephemeral) {
      throw new SceneAgentError("Cannot store a session-only entity: the scene store holds authored content, not session state");
    }
    if (entity.id !== undefined && !ID_PATTERN.test(entity.id)) throw new SceneAgentError(`Invalid entity id: ${entity.id}`);
    const id = entity.id ?? `agent-${Math.abs(hashString(JSON.stringify(entity) + entities.length)).toString(36).slice(0, 8)}`;
    if (entities.some((existing) => existing.id === id)) throw new SceneAgentError(`Entity id already exists: ${id}`);
    entities.push({ ...entity, id });
    return { op: "spawn", id };
  }

  if (command.op === "update") {
    const index = entities.findIndex((entity) => entity.id === command.id);
    if (index === -1) throw new SceneAgentError(`Unknown entity: ${command.id}`);
    const current = entities[index];
    const patch = command.patch ?? {};
    // Merge one level deep for the nested groups an agent actually patches; a shallow
    // spread would silently drop the rest of a transform when only `position` is sent.
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
    const index = entities.findIndex((entity) => entity.id === command.id);
    if (index === -1) throw new SceneAgentError(`Unknown entity: ${command.id}`);
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

  throw new SceneAgentError(`Unsupported command for document editing: ${command.op}`);
}

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (Math.imul(31, hash) + value.charCodeAt(index)) | 0;
  return hash;
}

export function applyCommands(definition, commands) {
  if (!Array.isArray(commands) || commands.length === 0) throw new SceneAgentError("At least one command is required");
  const next = structuredClone(definition);
  if (next.schema !== WORLD_SCHEMA) throw new SceneAgentError(`Scene schema must be ${WORLD_SCHEMA}`);
  if (!Array.isArray(next.entities)) throw new SceneAgentError("Scene entities must be an array");
  const outputs = commands.map((command) => applyCommand(next, command));
  return { definition: next, outputs };
}

/** A short human sentence for the change, used when the caller does not supply an intent. */
function describe(commands, outputs) {
  if (commands.length === 1) {
    const [command] = commands;
    if (command.op === "spawn") return `added ${command.entity.label ?? command.entity.type} ${outputs[0]?.id ?? ""}`.trim();
    if (command.op === "remove") return `removed ${outputs[0]?.ids?.join(", ") ?? command.id}`;
    if (command.op === "update") return `changed ${command.id}`;
    if (command.op === "set-environment") return "changed the environment";
  }
  return `applied ${commands.length} changes`;
}

/**
 * Read, apply, write — retrying from a fresh read when someone else got there first.
 * This is the whole agent write path.
 */
export async function editScene(baseUrl, name, commands, { retries = DEFAULT_RETRIES, actor = "agent", intent = null } = {}) {
  let attempt = 0;
  for (;;) {
    const record = await openScene(baseUrl, name);
    const { definition, outputs } = applyCommands(record.definition, commands);
    try {
      // Attribution is what makes a shared scene legible: the browser shows "hermes added a
      // red cube", not "revision 14".
      const result = await putScene(baseUrl, name, definition, record.revision, {
        actor,
        intent: intent ?? describe(commands, outputs),
      });
      return { ...result, outputs };
    } catch (error) {
      if (error.status === 409 && attempt < retries) {
        attempt += 1;
        continue;
      }
      throw error;
    }
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseFlags(argv) {
  const flags = {};
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token.startsWith("--")) {
      const [key, inline] = token.slice(2).split("=");
      flags[key] = inline ?? (argv[index + 1]?.startsWith("--") ? "true" : argv[++index] ?? "true");
    } else {
      positional.push(token);
    }
  }
  return { flags, positional };
}

function parseVector(value, label) {
  const parts = String(value).split(",").map((part) => Number(part.trim()));
  return vector(parts, label);
}

const USAGE = `graphysx scene agent — edit stored scenes from outside the browser

  list                            list stored scenes
  show <scene>                    print a scene document
  edit <scene> <commands-json>    apply raw AgentWorldCommand JSON (the agent surface)
  spawn <scene>                   --type box --id foo --at 0,6,0 --color '#ff5470' --mass 1.1
  remove <scene> <id>             remove an entity and its children
  seed <scene> --from <file>      upload a whole definition (no revision guard)

  --store <url>                   scene store base url (default $GRAPHYSX_STORE_URL or http://localhost:8788)
`;

async function main(argv) {
  const { flags, positional } = parseFlags(argv);
  const [command, ...rest] = positional;
  const baseUrl = flags.store ?? process.env.GRAPHYSX_STORE_URL ?? "http://localhost:8788";
  // Hermes, OpenClaw and AgentX each pass their own id, so a shared scene stays legible.
  const edit = { actor: flags.actor ?? process.env.GRAPHYSX_ACTOR ?? "agent", intent: flags.intent ?? null };

  if (!command || command === "help") {
    console.log(USAGE);
    return;
  }

  if (command === "list") {
    const scenes = await listScenes(baseUrl);
    if (scenes.length === 0) {
      console.log("no scenes stored yet");
      return;
    }
    for (const scene of scenes) {
      console.log(`${scene.name.padEnd(24)} rev ${String(scene.revision).padStart(4)}  ${String(scene.entityCount).padStart(4)} entities  ${scene.updatedAt}`);
    }
    return;
  }

  const name = rest[0];
  if (!name) throw new SceneAgentError(`${command} requires a scene name`);

  if (command === "show") {
    const record = await openScene(baseUrl, name);
    console.log(JSON.stringify(record, null, 2));
    return;
  }

  if (command === "edit") {
    const raw = rest[1];
    if (!raw) throw new SceneAgentError("edit requires a JSON array of commands");
    let commands;
    try {
      commands = JSON.parse(raw);
    } catch {
      throw new SceneAgentError("commands must be valid JSON");
    }
    const result = await editScene(baseUrl, name, Array.isArray(commands) ? commands : [commands], edit);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "spawn") {
    const entity = { type: flags.type ?? "box" };
    if (flags.id) entity.id = flags.id;
    if (flags.label) entity.label = flags.label;
    if (flags.at) entity.transform = { position: parseVector(flags.at, "--at") };
    if (flags.color) entity.material = { color: flags.color };
    if (flags.mass) entity.physics = { mode: "dynamic", mass: Number(flags.mass) };
    if (flags.radius) entity.geometry = { radius: Number(flags.radius) };
    const result = await editScene(baseUrl, name, [{ op: "spawn", entity }], edit);
    console.log(`spawned ${result.outputs[0].id} in "${name}" → revision ${result.revision}`);
    return;
  }

  if (command === "remove") {
    const id = rest[1];
    if (!id) throw new SceneAgentError("remove requires an entity id");
    const result = await editScene(baseUrl, name, [{ op: "remove", id }], edit);
    console.log(`removed ${result.outputs[0].ids.join(", ")} from "${name}" → revision ${result.revision}`);
    return;
  }

  if (command === "seed") {
    if (!flags.from) throw new SceneAgentError("seed requires --from <file>");
    const { readFile } = await import("node:fs/promises");
    const definition = JSON.parse(await readFile(flags.from, "utf8"));
    // Intentionally unguarded: seeding is how a scene comes into existence.
    const result = await putScene(baseUrl, name, definition.definition ?? definition, undefined, edit);
    console.log(`seeded "${name}" → revision ${result.revision}`);
    return;
  }

  throw new SceneAgentError(`Unknown command: ${command}`);
}

if (process.argv[1] && process.argv[1].endsWith("graphysx-scene-agent.mjs")) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
