// The messages between an AgentX Core page and the GraphysX Center it frames.
//
// Phase 2 of `docs/NESTOR_PROPOSALS.md`: Core serves a page under its own origin, that page
// holds the Center in an iframe, and the two talk through `postMessage`. Both ends of the
// protocol live in this repository and ship in the same build — the Center side in the product
// bundle (`coauthor-host-bridge.ts`), the host side in `dist/embed/center-host.js`
// (`center-host-embed.ts`), which Core relays from its own origin like `diskx.js`. One
// definition of every message, so the two ends cannot drift apart; Core carries no copy.
//
// What crosses the boundary and what never does:
//
//   host → center   `hello` (which Core this is), a reply to a request, a pushed proposal
//   center → host   `ready` / `state` (revision and a bounded scene summary), a request in the
//                   person's words, a receipt for each pushed proposal, and the outcome once a
//                   person has decided on one (accepted, discarded, stale, rejected)
//
// Commands cross in one direction only — into the Center, as a proposal. Nothing here can
// commit: a pushed proposal goes through `proposeExternal` and the same card, narrowing,
// stale check and undo as a typed request. The host sees ids, types and labels, never the
// scene document.
//
// This module is DOM-free and small on purpose: it is bundled into both ends.

import type { ProposalRequest } from "./coauthor-provider";

export const CENTER_BRIDGE_SCHEMA = "graphysx.center-bridge/v1";

/** What the Center tells its host about the scene: enough to compose against, never the document. */
export type CenterState = Pick<ProposalRequest, "revision" | "scene">;

export type HostToCenterMessage =
  | { schema: typeof CENTER_BRIDGE_SCHEMA; type: "hello" }
  | { schema: typeof CENTER_BRIDGE_SCHEMA; type: "propose-reply"; id: string; reply: unknown }
  /** A proposal composed elsewhere. Validated by the Center before it becomes a card. */
  | { schema: typeof CENTER_BRIDGE_SCHEMA; type: "push"; proposal: unknown };

export type PushReceiptStatus = "shown" | "refused";

/**
 * What became of a pushed proposal once a person decided. `accepted` is the only status that
 * moved the scene, and it carries the commit; the other three left the document as it was.
 */
export type PushOutcomeStatus = "accepted" | "discarded" | "stale" | "rejected";

export type CenterToHostMessage =
  | { schema: typeof CENTER_BRIDGE_SCHEMA; type: "ready"; state: CenterState | null }
  | { schema: typeof CENTER_BRIDGE_SCHEMA; type: "state"; state: CenterState | null }
  | { schema: typeof CENTER_BRIDGE_SCHEMA; type: "propose-request"; id: string; request: ProposalRequest }
  | {
    schema: typeof CENTER_BRIDGE_SCHEMA;
    type: "push-receipt";
    id: string;
    status: PushReceiptStatus;
    proposalId?: string;
    stale?: boolean;
    reason?: string;
  }
  /**
   * A person decided on a pushed proposal. `id` is Core's push id, `revision` the scene's
   * revision after the decision (the commit's for `accepted`), `commitId` only for `accepted`,
   * `reason` only for `rejected`. Sent once per push, for pushed proposals only.
   */
  | {
    schema: typeof CENTER_BRIDGE_SCHEMA;
    type: "push-outcome";
    id: string;
    status: PushOutcomeStatus;
    proposalId: string;
    revision: number;
    commitId?: string;
    reason?: string;
  };

export type BridgeMessage = HostToCenterMessage | CenterToHostMessage;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Structurally one of ours: the schema tag and a type. Each receiver checks the rest. */
export function isBridgeMessage(data: unknown): data is BridgeMessage {
  return isRecord(data) && data.schema === CENTER_BRIDGE_SCHEMA && typeof data.type === "string";
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** An http(s) origin on the local machine. */
export function isLoopbackOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (url.protocol === "http:" || url.protocol === "https:") && LOOPBACK.has(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Whether a page at `origin` may act as the Center's host.
 *
 * The same posture as `?propose=`: a message's origin is attacker-controlled in the sense that
 * any site can frame the public Center and post to it. Without this, a crafted page would get
 * a scene summary back and could push its own command list as a card inviting the visitor to
 * press Apply. The human gate and the validation still stand behind it; neither is a reason
 * to answer the page at all. So a host is same-origin, or named in the build-time allow-list —
 * set by whoever built the site, who is already trusted with it — or loopback, but only where
 * loopback means development: when the Center itself is served from loopback, or when the
 * caller says so (`import.meta.env.DEV`). The public build framed by a page on a visitor's
 * own machine answers it nothing.
 */
export function isAllowedHostOrigin(
  origin: string,
  selfOrigin: string,
  allowList: readonly string[],
  allowLoopback: boolean = isLoopbackOrigin(selfOrigin),
): boolean {
  if (typeof origin !== "string" || origin === "" || origin === "null") return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  // `origin` as the browser reports it is scheme://host[:port], nothing more; anything else
  // did not come from `event.origin` and is not trusted on its word.
  if (url.origin !== origin) return false;
  if (origin === selfOrigin) return true;
  if (allowLoopback && LOOPBACK.has(url.hostname)) return true;
  return allowList.includes(origin);
}

/**
 * The build-time allow-list, `VITE_GRAPHYSX_HOST_ORIGINS`: origins separated by commas or
 * whitespace. Each must be a bare http(s) origin; anything with a path, credentials or
 * another scheme is dropped rather than guessed at, so a typo cannot widen the list.
 */
export function parseHostOriginAllowList(raw: string | undefined): string[] {
  if (typeof raw !== "string") return [];
  const origins: string[] = [];
  for (const entry of raw.split(/[\s,]+/).filter(Boolean)) {
    let url: URL;
    try {
      url = new URL(entry);
    } catch {
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) continue;
    if (!origins.includes(url.origin)) origins.push(url.origin);
  }
  return origins;
}
