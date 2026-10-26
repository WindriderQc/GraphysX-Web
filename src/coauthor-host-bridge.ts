// The Center's end of the host bridge: a framed Center talking to the AgentX Core page around it.
//
// Two things come through here, and both end as an ordinary `CoauthorProposal`:
//
//   - **Pull.** The host is a `ProposalProvider` like any other: the person's request goes up
//     as a message, the host asks Core on its own origin (no key, no relay, no cross-site
//     POST), and the reply comes back down to be read by the same `readProviderReply` the
//     HTTP provider uses. The card cannot tell which transport composed it.
//   - **Push.** The host hands down a proposal Core composed because Nestor, in a conversation,
//     announced an intention on the world. It is validated here exactly like a provider reply,
//     plus the two fields a push carries that a reply does not — who proposes, and the revision
//     it was composed against — and then it is a card, inert until a person presses Apply. A
//     receipt goes back up saying whether it was shown, so Core can tell Nestor the truth.
//
// The bridge trusts one host: the first allow-listed origin that says hello. Everything from
// any other origin, or from a window that is not the parent, is ignored without a reply — a
// framing page that is not on the list learns nothing, not even that the Center is here.
//
// DOM-free: `post` and the message events are injected, so the unit tests run in Node.

import type { AgentWorldCommand } from "./agent-world-runtime";
import {
  CENTER_BRIDGE_SCHEMA,
  isAllowedHostOrigin,
  isBridgeMessage,
  type CenterState,
  type CenterToHostMessage,
} from "./center-bridge-protocol";
import type { CoauthorActor } from "./coauthor-proposal";
import {
  readProviderReply,
  PROPOSAL_TIMEOUT_MS,
  type ProposalProvider,
  type ProposalRequest,
  type ProviderResult,
} from "./coauthor-provider";

export { CENTER_BRIDGE_SCHEMA, isAllowedHostOrigin, isLoopbackOrigin, parseHostOriginAllowList } from "./center-bridge-protocol";
export type { CenterState } from "./center-bridge-protocol";

/** A proposal that arrived from the host, checked. */
export type PushedProposal = {
  /** Core's id for this push; the receipt carries it back. */
  id: string;
  actor: CoauthorActor;
  intent: string;
  commands: AgentWorldCommand[];
  /** The revision Core composed against. A moved scene shows the card stale. */
  expectedRevision: number;
};

export type PushReceipt =
  | { status: "shown"; proposalId: string; stale: boolean }
  | { status: "refused"; reason: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/;
const ACTOR_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,39}$/;
const ACTOR_LABEL_CHARS = 40;

/**
 * A pushed proposal, or why it will not become one.
 *
 * The intent and commands are read by `readProviderReply` — the same structural checks, the
 * same reserved-namespace refusal, the same limits as a typed request's reply. On top: the
 * push id (so the receipt can name it), an actor that is an agent (a push can never claim to
 * be the person or the system), and an integer revision. Whether the commands make sense in
 * the scene is still the runtime's call on commit, as it is for every other proposal.
 */
export function readPushedProposal(raw: unknown): { ok: true; proposal: PushedProposal } | { ok: false; reason: string } {
  if (!isRecord(raw)) return { ok: false, reason: "The pushed proposal was not an object." };
  if (typeof raw.id !== "string" || !ID_PATTERN.test(raw.id)) return { ok: false, reason: "The pushed proposal had no usable id." };
  const actor = raw.actor;
  if (!isRecord(actor) || typeof actor.id !== "string" || !ACTOR_ID_PATTERN.test(actor.id)
    || typeof actor.label !== "string" || actor.label.trim().length === 0 || actor.label.length > ACTOR_LABEL_CHARS
    || /[\u0000-\u001f\u007f]/.test(actor.label) || actor.kind !== "agent") {
    return { ok: false, reason: "The pushed proposal did not say which agent proposes it." };
  }
  if (!Number.isInteger(raw.expectedRevision) || (raw.expectedRevision as number) < 0) {
    return { ok: false, reason: "The pushed proposal did not say which revision it was composed against." };
  }
  const reply = readProviderReply({ intent: raw.intent, commands: raw.commands });
  if (!reply.ok) return reply;
  return {
    ok: true,
    proposal: {
      id: raw.id,
      actor: { id: actor.id, label: actor.label.trim(), kind: "agent" },
      intent: reply.proposal.intent,
      commands: reply.proposal.commands,
      expectedRevision: raw.expectedRevision as number,
    },
  };
}

export type HostBridgeOptions = {
  /** `window.location.origin`: a same-origin host is always allowed. */
  selfOrigin: string;
  /** `VITE_GRAPHYSX_HOST_ORIGINS`, parsed. */
  allowedOrigins: readonly string[];
  /**
   * Whether a loopback host is allowed. Defaults to "the Center itself is on loopback"; a
   * development build passes true. The production build on its public origin leaves it unset,
   * so a local page on a visitor's machine cannot frame it as a host.
   */
  allowLoopback?: boolean;
  /** `window.parent.postMessage(message, targetOrigin)`, injected. */
  post: (message: CenterToHostMessage, targetOrigin: string) => void;
  /** The window a genuine host message comes from (`window.parent`). Any other source is ignored. */
  hostSource?: unknown;
  /** The revision and the bounded scene summary, or null before the scene exists. */
  readState: () => CenterState | null;
  /** Show a pushed proposal as a card, or say why not. Called only with a validated proposal. */
  onPush: (proposal: PushedProposal) => PushReceipt;
  /** The host said hello and was accepted: the Center now has a provider. */
  onHost?: (origin: string) => void;
  /** How long a request may wait for the host's reply. Core's composition takes tens of seconds. */
  timeoutMs?: number;
  /** What the UI calls this provider. */
  label?: string;
};

export type HostBridge = {
  /** The host as a provider. Refuses, with a sentence, until a host has said hello. */
  provider: ProposalProvider;
  /** Feed a `message` event. Returns whether it was one of ours, from the host. */
  receive: (event: { origin: string; source?: unknown; data: unknown }) => boolean;
  /** Tell the host the scene moved. No-op before a host is known. */
  announce: () => void;
  hostOrigin: () => string | null;
  dispose: () => void;
};

export function createHostBridge(options: HostBridgeOptions): HostBridge {
  const { selfOrigin, allowedOrigins, allowLoopback, post, hostSource, readState, onPush, onHost, timeoutMs = PROPOSAL_TIMEOUT_MS, label = "AgentX Core" } = options;
  const allowedHost = (origin: string): boolean => (allowLoopback === undefined
    ? isAllowedHostOrigin(origin, selfOrigin, allowedOrigins)
    : isAllowedHostOrigin(origin, selfOrigin, allowedOrigins, allowLoopback));
  let host: string | null = null;
  let disposed = false;
  let counter = 0;
  const pending = new Map<string, { resolve: (result: ProviderResult) => void; timer: ReturnType<typeof setTimeout>; onAbort: (() => void) | null; signal?: AbortSignal }>();

  const send = (message: CenterToHostMessage): void => {
    if (host && !disposed) post(message, host);
  };

  const settle = (id: string, result: ProviderResult): void => {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    clearTimeout(entry.timer);
    if (entry.onAbort) entry.signal?.removeEventListener("abort", entry.onAbort);
    entry.resolve(result);
  };

  const provider: ProposalProvider = {
    id: "host-bridge",
    label,
    propose(request: ProposalRequest, signal?: AbortSignal): Promise<ProviderResult> {
      if (!host || disposed) return Promise.resolve({ ok: false, reason: "No AgentX host page has connected to this Center." });
      if (signal?.aborted) return Promise.resolve({ ok: false, reason: "The request was cancelled." });
      counter += 1;
      const id = `request-${counter}`;
      return new Promise<ProviderResult>((resolve) => {
        const timer = setTimeout(() => settle(id, { ok: false, reason: "The host page did not answer in time." }), timeoutMs);
        const onAbort = signal ? (): void => settle(id, { ok: false, reason: "The request was cancelled." }) : null;
        if (onAbort) signal?.addEventListener("abort", onAbort, { once: true });
        pending.set(id, { resolve, timer, onAbort, signal });
        send({ schema: CENTER_BRIDGE_SCHEMA, type: "propose-request", id, request });
      });
    },
  };

  const receive = (event: { origin: string; source?: unknown; data: unknown }): boolean => {
    if (disposed) return false;
    // The parent window and nothing else: a popup or a sibling frame on an allowed origin is
    // still not the host.
    if (hostSource !== undefined && event.source !== hostSource) return false;
    const { data } = event;
    if (!isBridgeMessage(data)) return false;
    if (!allowedHost(event.origin)) return false;

    if (data.type === "hello") {
      if (host === null) {
        host = event.origin;
        onHost?.(host);
      } else if (host !== event.origin) {
        // One host per page. A second allow-listed origin saying hello does not take over.
        return false;
      }
      send({ schema: CENTER_BRIDGE_SCHEMA, type: "ready", state: readState() });
      return true;
    }
    if (host === null || event.origin !== host) return false;

    if (data.type === "propose-reply") {
      if (typeof data.id !== "string") return false;
      settle(data.id, readProviderReply(data.reply));
      return true;
    }
    if (data.type === "push") {
      const checked = readPushedProposal(data.proposal);
      const id = isRecord(data.proposal) && typeof data.proposal.id === "string" && ID_PATTERN.test(data.proposal.id) ? data.proposal.id : "unknown";
      if (!checked.ok) {
        send({ schema: CENTER_BRIDGE_SCHEMA, type: "push-receipt", id, status: "refused", reason: checked.reason });
        return true;
      }
      const receipt = onPush(checked.proposal);
      send(receipt.status === "shown"
        ? { schema: CENTER_BRIDGE_SCHEMA, type: "push-receipt", id, status: "shown", proposalId: receipt.proposalId, stale: receipt.stale }
        : { schema: CENTER_BRIDGE_SCHEMA, type: "push-receipt", id, status: "refused", reason: receipt.reason });
      return true;
    }
    // A message type the Center sends, echoed back, or one from a newer protocol: ignored.
    return false;
  };

  return {
    provider,
    receive,
    announce: () => send({ schema: CENTER_BRIDGE_SCHEMA, type: "state", state: readState() }),
    hostOrigin: () => host,
    dispose: () => {
      disposed = true;
      for (const id of [...pending.keys()]) settle(id, { ok: false, reason: "The Center is closing." });
    },
  };
}
