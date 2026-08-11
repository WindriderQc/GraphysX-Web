// Where a proposal can come from, when it does not come from Nestor's own hands.
//
// Slice 4 shipped the queue: Nestor composes a bounded change, a human reads it, narrows it,
// and accepts or discards it. The composing was local — three curated demonstrations. This is
// the seam that lets a model compose one instead, and it is deliberately a seam rather than an
// integration: **no provider is configured by default, and the Center is fully useful without
// one.** A front door that needed an API key to open would not be a front door.
//
// The security posture is the whole design. A provider is a remote party that returns
// *commands to mutate the user's scene*, so its output is untrusted input in the strongest
// sense — treated exactly like a hostile payload until it has been checked here. Three things
// make that safe:
//
//   1. **A provider proposes; it can never commit.** The returned commands become a
//      `CoauthorProposal`, which is inert until a human presses Apply. That is not a policy
//      this module enforces by being careful — it is the only thing the type can do.
//   2. **Structure is validated before the proposal exists at all.** A malformed reply is a
//      refusal with a reason, not a half-rendered card promising changes it cannot make.
//   3. **Host-only namespaces are refused**, using the same policy module the runtime enforces
//      on commit, so a provider cannot forge a live-session avatar or a mission board.
//
// What is deliberately NOT here: prompt text, model names, retries, streaming. Those belong to
// whatever implements `ProposalProvider`. This module only cares what comes back.

import { hostOnlyEntityIdPrefix } from "../server/host-entity-id-policy.mjs";
import type { AgentWorldCommand } from "./agent-world-runtime";

/** Every `op` the runtime understands. A reply naming anything else is refused. */
export const PROPOSABLE_OPS: ReadonlySet<string> = new Set([
  "spawn", "spawn-prefab", "update", "remove",
  "add-joint", "update-joint", "remove-joint",
  "attach-behavior", "detach-behavior",
  "interact", "steer", "set-environment", "select",
]);

/**
 * Bounds, so a runaway or hostile reply cannot produce a card nobody can read or a transaction
 * nobody can review. These are review limits rather than engine limits: the runtime would
 * happily apply more, but a human being asked to approve two hundred changes is not reviewing
 * them, and an unreviewable proposal defeats the point of proposing.
 */
export const PROVIDER_LIMITS = {
  commands: 40,
  intentChars: 200,
  replyBytes: 256 * 1024,
} as const;

export type ProposalRequest = {
  /** What the human asked for, verbatim. */
  request: string;
  /** The revision the scene is at, so the proposal can be born against a known world. */
  revision: number;
  /** A bounded description of what is in the scene. Never the whole document. */
  scene: { id: string; label: string; entities: { id: string; type: string; label: string }[] };
};

export type ProviderProposal = { intent: string; commands: AgentWorldCommand[] };

export type ProviderResult =
  | { ok: true; proposal: ProviderProposal }
  /** Why not. Shown to the human, so it has to be a sentence rather than a status code. */
  | { ok: false; reason: string };

export type ProposalProvider = {
  /** Stable identifier, for attribution. Never shown raw to a person. */
  id: string;
  /** What to call this in the UI: "Ollama · llama3", "AgentX Ops". */
  label: string;
  propose: (request: ProposalRequest, signal?: AbortSignal) => Promise<ProviderResult>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/**
 * Turns whatever a provider returned into commands, or explains why it will not.
 *
 * Structural only, and on purpose. Whether `update` names an entity that exists, or whether a
 * patch is coherent, is the runtime's job and it already refuses on commit — re-implementing
 * that here would be a second validator drifting away from the first. What this catches is the
 * class the runtime cannot: replies that are not command lists at all, replies too large to
 * review, and ids reaching into namespaces the browser shell owns.
 */
export function validateProviderCommands(raw: unknown): { ok: true; commands: AgentWorldCommand[] } | { ok: false; reason: string } {
  if (!Array.isArray(raw)) return { ok: false, reason: "The reply did not contain a list of commands." };
  if (raw.length === 0) return { ok: false, reason: "The reply contained no changes to make." };
  if (raw.length > PROVIDER_LIMITS.commands) {
    return { ok: false, reason: `The reply asked for ${raw.length} changes; ${PROVIDER_LIMITS.commands} is the most that can be reviewed at once.` };
  }

  for (let index = 0; index < raw.length; index += 1) {
    const command = raw[index];
    const at = `Change ${index + 1}`;
    if (!isRecord(command)) return { ok: false, reason: `${at} was not an object.` };
    if (typeof command.op !== "string" || !PROPOSABLE_OPS.has(command.op)) {
      return { ok: false, reason: `${at} named an unknown operation.` };
    }
    // The same policy the runtime enforces on commit, applied before the card is built rather
    // than after the human has already agreed to it.
    const forged = findForgedNamespace(command);
    if (forged) return { ok: false, reason: `${at} used the reserved id namespace "${forged}", which only this browser may own.` };
  }
  return { ok: true, commands: raw as AgentWorldCommand[] };
}

/** Any string anywhere in the command that reaches into a host-only namespace. */
function findForgedNamespace(command: Record<string, unknown>): string | null {
  let found: string | null = null;
  const walk = (value: unknown, depth: number): void => {
    if (found || depth > 12) return;
    if (typeof value === "string") {
      const prefix = hostOnlyEntityIdPrefix(value);
      if (prefix) found = prefix;
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    if (isRecord(value)) {
      for (const item of Object.values(value)) walk(item, depth + 1);
    }
  };
  walk(command, 0);
  return found;
}

/** An intent a person can read, or a refusal. Intent is what the card is titled with. */
export function validateProviderIntent(raw: unknown): { ok: true; intent: string } | { ok: false; reason: string } {
  if (typeof raw !== "string") return { ok: false, reason: "The reply did not say what it was trying to do." };
  const intent = raw.trim().replace(/\s+/g, " ");
  if (intent.length === 0) return { ok: false, reason: "The reply did not say what it was trying to do." };
  if (intent.length > PROVIDER_LIMITS.intentChars) {
    return { ok: false, reason: `The stated intent was ${intent.length} characters; ${PROVIDER_LIMITS.intentChars} is the most a card can show.` };
  }
  return { ok: true, intent };
}

/**
 * The whole reply, checked.
 *
 * Returns a `ProviderResult` rather than throwing, because every failure here is something a
 * person should be told in the panel: a provider that is misbehaving is a fact about the
 * session, not an exception to swallow.
 */
export function readProviderReply(raw: unknown): ProviderResult {
  if (!isRecord(raw)) return { ok: false, reason: "The reply was not in the expected shape." };
  const intent = validateProviderIntent(raw.intent);
  if (!intent.ok) return intent;
  const commands = validateProviderCommands(raw.commands);
  if (!commands.ok) return commands;
  return { ok: true, proposal: { intent: intent.intent, commands: commands.commands } };
}

/**
 * A bounded description of the scene, for a provider to compose against.
 *
 * Bounded twice over: only ids, types and labels, and only the first `limit` of them. A
 * provider does not need the geometry of every entity to add a lamp, and sending the whole
 * document would mean sending the user's entire scene to a third party on every request.
 */
export function summarizeSceneForProvider(
  entities: readonly { id: string; type: string; label: string }[],
  limit = 60,
): { id: string; type: string; label: string }[] {
  return entities.slice(0, limit).map((entity) => ({ id: entity.id, type: entity.type, label: entity.label }));
}

let active: ProposalProvider | null = null;

/** Register the provider, or `null` to go back to composing locally. */
export function setProposalProvider(provider: ProposalProvider | null): void {
  active = provider;
}

export function proposalProvider(): ProposalProvider | null {
  return active;
}

/**
 * What the UI says about where proposals come from.
 *
 * Always a true sentence, and never an apology: composing locally is the supported default,
 * not a degraded mode. The roadmap's guardrail is explicit that the Center must not require a
 * model, so "no provider" reads as a statement of fact.
 */
export function describeProposalSource(provider: ProposalProvider | null = active): string {
  return provider
    ? `Proposals composed by ${provider.label}. Nothing is applied until you accept it.`
    : "Nestor composes proposals locally. No model provider is configured.";
}

/**
 * A provider that asks an HTTP endpoint for a proposal.
 *
 * The only implementation, and deliberately generic: it posts a JSON request and reads a JSON
 * reply of `{ intent, commands }`. Which model is behind it, what prompt it uses and how it is
 * authenticated are the endpoint's business, not this page's. That is what keeps the seam a
 * seam — swapping Ollama for a hosted model changes nothing here.
 *
 * **No key ever reaches the browser.** The endpoint is expected to be same-origin (`/propose`)
 * and to hold its own credentials server-side, exactly as the scene store does. A build that
 * shipped an API key to every visitor would be handing it out, not using it.
 */
export function createHttpProposalProvider(options: {
  url: string;
  label?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): ProposalProvider {
  const { url, label = "Model provider", timeoutMs = 20_000, fetchImpl = fetch } = options;
  return {
    id: `http:${url}`,
    label,
    async propose(request, signal) {
      // Two ways to stop: the caller's signal, and a timeout of our own. A provider that never
      // answers must not leave the panel saying "composing" forever.
      const controller = new AbortController();
      const onAbort = (): void => controller.abort();
      signal?.addEventListener("abort", onAbort, { once: true });
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(request),
          signal: controller.signal,
        });
        if (!response.ok) return { ok: false, reason: `The provider answered ${response.status}.` };
        const text = await response.text();
        if (text.length > PROVIDER_LIMITS.replyBytes) {
          return { ok: false, reason: "The provider's reply was too large to read." };
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          return { ok: false, reason: "The provider's reply was not valid JSON." };
        }
        return readProviderReply(parsed);
      } catch (error) {
        // Including the abort: from the panel's point of view a timeout and a refusal are the
        // same event — no proposal, and a sentence saying why.
        const aborted = error instanceof Error && error.name === "AbortError";
        return { ok: false, reason: aborted ? "The provider did not answer in time." : "The provider could not be reached." };
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}

/**
 * Whether a URL from the *query string* may be used as a provider.
 *
 * `?propose=<url>` is attacker-supplied: a crafted link is a link someone can be sent. Without
 * this, that link would make the visitor's browser POST a summary of their scene to a host of
 * the attacker's choosing, and then render the attacker's own command list as a card inviting
 * them to press Apply. The human gate and the validation still stand behind it, but neither is
 * a reason to allow the request in the first place.
 *
 * So a session override must be same-origin or loopback: same-origin is the shape production
 * uses anyway, and loopback is what makes the seam exercisable in development. A build-time
 * `VITE_GRAPHYSX_PROPOSAL_URL` is not checked here — it is set by whoever built the site, who
 * is already trusted with the whole bundle.
 */
export function isAllowedSessionProviderUrl(candidate: string, origin: string): boolean {
  // An empty candidate resolves to the origin itself, which is same-origin and meaningless.
  if (typeof candidate !== "string" || candidate.trim() === "") return false;
  let url: URL;
  try {
    url = new URL(candidate, origin);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.origin === origin) return true;
  return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]" || url.hostname === "::1";
}
