// A change an agent wants to make, shown to a human before it happens.
//
// Until now Nestor's demonstrations went straight from "the human clicked a button" to
// `api.commit()`. Everything about that commit was inspectable *afterwards* — actor, intent,
// revision, undo — which is a real property, and still the wrong moment. The person watching
// had no way to know what was about to change until it already had.
//
// A proposal is the pause. It is the exact `commit()` argument list, held rather than sent,
// with enough summary to read at a glance: how many commands, which entities they touch, and
// the revision the agent was looking at when it decided.
//
// Two things this deliberately is NOT:
//
//   - It is not a second command format. A proposal carries the same typed
//     `AgentWorldCommand[]` the API already validates, so accepting is a plain `commit()` and
//     there is no translation layer to drift.
//   - It is not an approval *record*. Nothing here is persisted, nothing enters the document,
//     and a discarded proposal leaves no trace in history — because nothing happened. The
//     authored scene only ever changes through an accepted commit.

import type { AgentWorldCommand, AgentWorldCommitSummary } from "./agent-world-runtime";

export type CoauthorActor = { id: string; label: string; kind: "agent" | "human" | "system" };

/** One entity the proposal would touch, and what it would do to it. */
export type CoauthorTouch = { id: string; op: AgentWorldCommand["op"] };

export type CoauthorProposal = {
  /** Deterministic within a session: intent plus the revision it was composed against. */
  id: string;
  actor: CoauthorActor;
  intent: string;
  /** The revision the agent read. Accepting sends this, so a moved world refuses the commit. */
  expectedRevision: number;
  commands: AgentWorldCommand[];
  commandCount: number;
  /** Entity ids in first-touch order, so the preview reads the way the change happens. */
  touches: CoauthorTouch[];
  /** Human-readable one-liner per command, for the expandable detail list. */
  lines: string[];
  /**
   * Command indices the human has taken out. Empty on arrival — a proposal starts as the
   * whole thing the agent asked for, and narrowing it is a deliberate act.
   */
  excluded: number[];
};

export type CoauthorOutcome =
  | { status: "accepted"; proposal: CoauthorProposal; commit: AgentWorldCommitSummary | null }
  | { status: "discarded"; proposal: CoauthorProposal }
  | { status: "stale"; proposal: CoauthorProposal; currentRevision: number }
  | { status: "rejected"; proposal: CoauthorProposal; error: string };

/**
 * The entity a command acts on, or null when it acts on the world rather than an entity.
 *
 * `set-environment` and `select` are the two that legitimately have no entity id. They are
 * still shown in the preview — a change to the sky is exactly the kind of thing someone would
 * want to see coming — they simply do not contribute a row to the touched-entities list.
 */
export function commandEntityId(command: AgentWorldCommand): string | null {
  switch (command.op) {
    case "spawn":
      return command.entity.id ?? null;
    case "spawn-prefab":
      return command.options?.idPrefix ?? null;
    case "update":
    case "remove":
    case "attach-behavior":
    case "detach-behavior":
    case "interact":
    case "steer":
    case "update-joint":
    case "remove-joint":
      return command.id;
    case "add-joint":
      return command.joint.id ?? null;
    default:
      return null;
  }
}

/** A short sentence a person can read, not a JSON dump. */
export function describeCommand(command: AgentWorldCommand): string {
  switch (command.op) {
    case "spawn":
      return `Create ${command.entity.label ?? command.entity.id} (${command.entity.type})`;
    case "spawn-prefab":
      return `Assemble the ${command.prefabId} prefab`;
    case "update": {
      const fields = Object.keys(command.patch ?? {});
      const shown = fields.slice(0, 3).join(", ");
      const rest = fields.length > 3 ? ` +${fields.length - 3} more` : "";
      return fields.length ? `Change ${command.id}: ${shown}${rest}` : `Change ${command.id}`;
    }
    case "remove":
      return `Delete ${command.id}`;
    case "attach-behavior":
      return `Give ${command.id} a ${command.behavior.type} behaviour`;
    case "detach-behavior":
      return `Remove a behaviour from ${command.id}`;
    case "interact":
      return `Trigger ${command.id}`;
    case "steer":
      return `Steer ${command.id}`;
    case "add-joint":
      return `Connect ${command.joint.bodyA} to ${command.joint.bodyB}`;
    case "update-joint":
      return `Retune joint ${command.id}`;
    case "remove-joint":
      return `Disconnect joint ${command.id}`;
    case "set-environment":
      return "Change the environment";
    case "select":
      return `Select ${command.ids.length} entit${command.ids.length === 1 ? "y" : "ies"}`;
    default:
      return "Unknown change";
  }
}

/**
 * Builds the proposal. Pure: it reads the commands and the revision, and touches nothing.
 *
 * First-touch order rather than a sorted set, because the preview is a description of what is
 * about to happen and the order it happens in is part of that. A sorted list would read as an
 * inventory of affected things, which is a different and less useful claim.
 */
export function createProposal(input: {
  actor: CoauthorActor;
  intent: string;
  expectedRevision: number;
  commands: AgentWorldCommand[];
}): CoauthorProposal {
  const touches: CoauthorTouch[] = [];
  const seen = new Set<string>();
  for (const command of input.commands) {
    const id = commandEntityId(command);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    touches.push({ id, op: command.op });
  }
  return {
    id: `${input.intent}@${input.expectedRevision}`,
    actor: input.actor,
    intent: input.intent,
    expectedRevision: input.expectedRevision,
    commands: input.commands,
    commandCount: input.commands.length,
    touches,
    lines: input.commands.map(describeCommand),
    excluded: [],
  };
}

/**
 * The entity a command brings into existence, if any.
 *
 * This is what makes exclusion safe to offer. `api.commit` is atomic, so a subset that
 * updates something it no longer creates does not corrupt anything — it fails whole. But
 * failing whole after the person carefully unchecked one line is a bad answer to give them,
 * so the dependency is resolved before the commit rather than reported after it.
 */
export function introducedEntityId(command: AgentWorldCommand): string | null {
  if (command.op === "spawn") return command.entity.id ?? null;
  if (command.op === "spawn-prefab") return command.options?.idPrefix ?? null;
  if (command.op === "add-joint") return command.joint.id ?? null;
  return null;
}

/** Whether `command` needs `id` to already exist. Prefab children are `${idPrefix}:part`. */
function dependsOnEntity(command: AgentWorldCommand, id: string): boolean {
  const target = commandEntityId(command);
  if (target === id) return true;
  if (target !== null && target.startsWith(`${id}:`)) return true;
  // A joint names two bodies and neither is its own `commandEntityId`.
  if (command.op === "add-joint") return command.joint.bodyA === id || command.joint.bodyB === id;
  return false;
}

/**
 * Include or exclude one command, keeping the selection internally consistent.
 *
 * Excluding something that creates an entity also drops everything later that needs it;
 * re-including a dependent brings its creator back. Both directions are required — a rule
 * that only cascaded one way would let the person assemble a selection that cannot commit,
 * which is precisely the outcome offering this control is supposed to avoid.
 */
export function toggleCommandInclusion(proposal: CoauthorProposal, index: number): CoauthorProposal {
  if (index < 0 || index >= proposal.commands.length) return proposal;
  const excluded = new Set(proposal.excluded);

  if (excluded.has(index)) {
    excluded.delete(index);
    // Walk backwards: whatever this one needs must come back with it, transitively.
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      if (!excluded.has(cursor)) continue;
      const introduced = introducedEntityId(proposal.commands[cursor]);
      if (introduced && dependsOnEntity(proposal.commands[index], introduced)) excluded.delete(cursor);
    }
  } else {
    excluded.add(index);
    const introduced = introducedEntityId(proposal.commands[index]);
    if (introduced) {
      for (let cursor = index + 1; cursor < proposal.commands.length; cursor += 1) {
        if (dependsOnEntity(proposal.commands[cursor], introduced)) excluded.add(cursor);
      }
    }
  }

  return { ...proposal, excluded: [...excluded].sort((a, b) => a - b) };
}

/** The commands an accept would actually send, in their original order. */
export function includedCommands(proposal: CoauthorProposal): AgentWorldCommand[] {
  const excluded = new Set(proposal.excluded);
  return proposal.commands.filter((_, index) => !excluded.has(index));
}

/** True when the person has narrowed the proposal to nothing; there is then nothing to apply. */
export function isProposalEmpty(proposal: CoauthorProposal): boolean {
  return proposal.excluded.length >= proposal.commands.length;
}

/**
 * Whether the world moved since the agent composed this.
 *
 * The runtime enforces this too — accepting sends the original `expectedRevision`, so a stale
 * commit is refused there regardless of what this says. This exists so the person is told
 * *before* they press a button that cannot work, rather than being handed a rejection they
 * did not cause.
 */
export function isProposalStale(proposal: CoauthorProposal, currentRevision: number): boolean {
  return proposal.expectedRevision !== currentRevision;
}

/**
 * One line for the panel header: "4 changes · 3 entities · from revision 12".
 *
 * Counts what an accept would *send*, not what the agent originally composed. Once the person
 * can narrow a proposal, a header describing the untouched original would be describing
 * something that is no longer going to happen — and this line is the summary they are
 * consenting against. When anything has been taken out it says so explicitly, so a reduced
 * proposal never looks like a smaller proposal that simply arrived that way.
 */
export function summarizeProposal(proposal: CoauthorProposal): string {
  const commands = includedCommands(proposal);
  const ids = new Set<string>();
  for (const command of commands) {
    const id = commandEntityId(command);
    if (id) ids.add(id);
  }
  const changes = `${commands.length} change${commands.length === 1 ? "" : "s"}`;
  const entities = ids.size ? ` · ${ids.size} entit${ids.size === 1 ? "y" : "ies"}` : "";
  const removed = proposal.excluded.length ? ` · ${proposal.excluded.length} removed` : "";
  return `${changes}${entities}${removed} · from revision ${proposal.expectedRevision}`;
}
