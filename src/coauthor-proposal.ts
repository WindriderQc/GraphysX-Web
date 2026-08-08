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
  };
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

/** One line for the panel header: "4 changes · 3 entities · from revision 12". */
export function summarizeProposal(proposal: CoauthorProposal): string {
  const changes = `${proposal.commandCount} change${proposal.commandCount === 1 ? "" : "s"}`;
  const entities = proposal.touches.length
    ? ` · ${proposal.touches.length} entit${proposal.touches.length === 1 ? "y" : "ies"}`
    : "";
  return `${changes}${entities} · from revision ${proposal.expectedRevision}`;
}
