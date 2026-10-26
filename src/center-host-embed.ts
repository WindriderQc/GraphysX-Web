// `<graphysx-center>`: the host's end of the bridge, for an AgentX Core page.
//
// Built alone to `dist/embed/center-host.js` (vite.center-host.config.ts) and relayed by Core
// from its own origin, like `diskx.js`. The element frames the Center from a configured
// GraphysX origin, says hello to it, and from then on does two bounded jobs on the page's own
// origin — which is Core's, so no key, no relay and no cross-site POST are involved:
//
//   - a request typed in the Center is posted to `${api-base}/propose` and the reply is handed
//     back down as it came (the Center validates it; this element does not read commands);
//   - `${api-base}/center/events` is Core's stream for this page. Core says hello with a page
//     id, the element reports the Center's revision and bounded scene summary to
//     `${api-base}/center/state` whenever they change, and when Core pushes a proposal the
//     element hands it down and reports the Center's receipt to `${api-base}/center/receipts` —
//     first whether the card was shown, then what the person decided (accepted at which
//     revision, discarded, stale, rejected), on the same route under the same push id.
//
// Nothing here applies a change or holds scene state. The element relays; the Center decides
// what becomes a card, and a person decides what becomes a commit.

import {
  CENTER_BRIDGE_SCHEMA,
  isBridgeMessage,
  type CenterState,
  type CenterToHostMessage,
  type HostToCenterMessage,
  type PushOutcomeStatus,
} from "./center-bridge-protocol";

const TAG = "graphysx-center";
const DEFAULT_API_BASE = "/api/graphysx";
const HELLO_INTERVAL_MS = 1000;
const HELLO_ATTEMPTS = 60;
const STATE_DEBOUNCE_MS = 250;
/** `PROVIDER_LIMITS.replyBytes` in coauthor-provider.ts: more than this is not a reply the Center will read. */
const REPLY_MAX_BYTES = 256 * 1024;
const PROPOSE_TIMEOUT_MS = 120_000;
const PUSH_MAX_BYTES = 256 * 1024;

export type CenterHostAttributes = { center: string; origin: string; apiBase: string };

/**
 * The two attributes, checked. `center` is the Center's URL: http(s), no credentials, no
 * fragment. `api-base` is a same-origin path (default `/api/graphysx`): an absolute URL is
 * refused, so the page's markup cannot send Core's routes elsewhere.
 */
export function readCenterHostAttributes(center: string | null, apiBase: string | null): { ok: true; value: CenterHostAttributes } | { ok: false; reason: string } {
  const text = String(center ?? "").trim();
  if (!text) return { ok: false, reason: "The center attribute is required: the URL of the GraphysX Center to frame." };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, reason: "The center attribute must be an absolute http(s) URL." };
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || url.hash) {
    return { ok: false, reason: "The center attribute must be an http(s) URL without credentials or fragment." };
  }
  const base = apiBase === null || apiBase.trim() === "" ? DEFAULT_API_BASE : apiBase.trim();
  if (!base.startsWith("/") || base.startsWith("//") || /[\s\u0000-\u001f\u007f?#\\]/.test(base)) {
    return { ok: false, reason: "The api-base attribute must be a same-origin path." };
  }
  return { ok: true, value: { center: url.href, origin: url.origin, apiBase: base.replace(/\/+$/, "") || "/" } };
}

type ReceiptBody =
  | { pageId: string; id: string; status: "shown" | "refused"; proposalId?: string; stale?: boolean; reason?: string }
  | { pageId: string; id: string; status: PushOutcomeStatus; proposalId: string; revision: number; commitId?: string; reason?: string };

const STYLE_ID = "graphysx-center-style";
function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  // Zero specificity: the host page's own rule for the element always wins.
  style.textContent = `:where(${TAG}){display:block;position:relative;min-height:240px;background:#03060c}:where(${TAG})>iframe{position:absolute;inset:0;width:100%;height:100%;border:0}:where(${TAG})>p[role=alert]{margin:0;padding:12px;color:#f5b041;font:14px/1.4 system-ui,sans-serif}`;
  document.head.append(style);
}

export class GraphysXCenterElement extends HTMLElement {
  #frame: HTMLIFrameElement | null = null;
  #attributes: CenterHostAttributes | null = null;
  #ready = false;
  #pageId: string | null = null;
  #state: CenterState | null = null;
  #events: EventSource | null = null;
  #helloTimer: ReturnType<typeof setInterval> | null = null;
  #stateTimer: ReturnType<typeof setTimeout> | null = null;
  #pushes = 0;
  #outcomes = 0;
  readonly #onMessage = (event: MessageEvent): void => { this.#receive(event); };

  connectedCallback(): void {
    if (this.#frame) return;
    ensureStyle();
    const checked = readCenterHostAttributes(this.getAttribute("center"), this.getAttribute("api-base"));
    if (!checked.ok) {
      const alert = document.createElement("p");
      alert.setAttribute("role", "alert");
      alert.textContent = checked.reason;
      this.replaceChildren(alert);
      this.#emit("graphysx-center-error", { stage: "attributes", message: checked.reason });
      return;
    }
    this.#attributes = checked.value;
    const frame = document.createElement("iframe");
    frame.title = "GraphysX Center";
    frame.setAttribute("allow", "fullscreen");
    frame.referrerPolicy = "strict-origin";
    frame.addEventListener("load", () => this.#startHello());
    frame.src = checked.value.center;
    this.#frame = frame;
    window.addEventListener("message", this.#onMessage);
    this.replaceChildren(frame);
  }

  disconnectedCallback(): void {
    window.removeEventListener("message", this.#onMessage);
    this.#stopHello();
    if (this.#stateTimer) clearTimeout(this.#stateTimer);
    this.#stateTimer = null;
    this.#events?.close();
    this.#events = null;
    this.#frame = null;
    this.#ready = false;
    this.#pageId = null;
  }

  /** What the page can read about the bridge: no commands, no scene document. */
  state(): { ready: boolean; centerOrigin: string | null; pageId: string | null; revision: number | null; entities: number | null; pushes: number; outcomes: number } {
    return {
      ready: this.#ready,
      centerOrigin: this.#attributes?.origin ?? null,
      pageId: this.#pageId,
      revision: this.#state?.revision ?? null,
      entities: this.#state?.scene.entities.length ?? null,
      pushes: this.#pushes,
      outcomes: this.#outcomes,
    };
  }

  #emit(type: string, detail: Record<string, unknown>): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  #post(message: HostToCenterMessage): void {
    const target = this.#frame?.contentWindow;
    if (!target || !this.#attributes) return;
    target.postMessage(message, this.#attributes.origin);
  }

  #startHello(): void {
    this.#stopHello();
    this.#ready = false;
    let attempts = 0;
    const hello = (): void => {
      attempts += 1;
      if (attempts > HELLO_ATTEMPTS) {
        this.#stopHello();
        this.#emit("graphysx-center-error", { stage: "handshake", message: "The Center did not answer the host within a minute." });
        return;
      }
      this.#post({ schema: CENTER_BRIDGE_SCHEMA, type: "hello" });
    };
    hello();
    this.#helloTimer = setInterval(hello, HELLO_INTERVAL_MS);
  }

  #stopHello(): void {
    if (this.#helloTimer) clearInterval(this.#helloTimer);
    this.#helloTimer = null;
  }

  #receive(event: MessageEvent): void {
    const frame = this.#frame;
    if (!frame || !this.#attributes) return;
    // The framed Center and nothing else: same window, same origin as the attribute names.
    if (event.source !== frame.contentWindow || event.origin !== this.#attributes.origin) return;
    const data: unknown = event.data;
    if (!isBridgeMessage(data)) return;
    const message = data as CenterToHostMessage;
    switch (message.type) {
      case "ready":
        this.#stopHello();
        this.#state = message.state;
        if (!this.#ready) {
          this.#ready = true;
          this.#emit("graphysx-center-ready", { revision: message.state?.revision ?? null });
        }
        this.#openEvents();
        this.#scheduleState();
        return;
      case "state":
        this.#state = message.state;
        this.#emit("graphysx-center-state", { revision: message.state?.revision ?? null });
        this.#scheduleState();
        return;
      case "propose-request":
        if (typeof message.id === "string") void this.#relayRequest(message.id, message.request);
        return;
      case "push-receipt":
        this.#emit("graphysx-center-receipt", { id: message.id, status: message.status, proposalId: message.proposalId ?? null, stale: message.stale ?? false, reason: message.reason ?? null });
        void this.#send("/center/receipts", {
          pageId: this.#pageId ?? "",
          id: message.id,
          status: message.status,
          ...(message.proposalId ? { proposalId: message.proposalId } : {}),
          ...(message.stale !== undefined ? { stale: message.stale } : {}),
          ...(message.reason ? { reason: message.reason } : {}),
        } satisfies ReceiptBody);
        return;
      case "push-outcome":
        // What the person decided, relayed as it came; the status vocabulary is the protocol's
        // and Core checks it again on arrival.
        if (typeof message.id !== "string" || typeof message.proposalId !== "string" || !Number.isInteger(message.revision)) return;
        this.#outcomes += 1;
        this.#emit("graphysx-center-outcome", { id: message.id, status: message.status, proposalId: message.proposalId, revision: message.revision, commitId: message.commitId ?? null, reason: message.reason ?? null });
        void this.#send("/center/receipts", {
          pageId: this.#pageId ?? "",
          id: message.id,
          status: message.status,
          proposalId: message.proposalId,
          revision: message.revision,
          ...(message.commitId ? { commitId: message.commitId } : {}),
          ...(message.reason ? { reason: message.reason } : {}),
        } satisfies ReceiptBody);
        return;
      default:
        return;
    }
  }

  /** One request up to Core, its reply down as it came. The Center reads it; this element does not. */
  async #relayRequest(id: string, request: unknown): Promise<void> {
    const base = this.#attributes?.apiBase ?? DEFAULT_API_BASE;
    let reply: unknown;
    try {
      const response = await fetch(`${base}/propose`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(request),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(PROPOSE_TIMEOUT_MS),
      });
      const text = await response.text();
      if (text.length > REPLY_MAX_BYTES) reply = { ok: false, reason: "Core's reply was too large to read." };
      else {
        try {
          reply = JSON.parse(text);
        } catch {
          reply = { ok: false, reason: `Core answered ${response.status} without JSON.` };
        }
      }
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      reply = { ok: false, reason: timedOut ? "Core did not answer in time." : "Core could not be reached." };
      this.#emit("graphysx-center-error", { stage: "propose", message: String(reply && typeof reply === "object" && "reason" in reply ? (reply as { reason: string }).reason : "") });
    }
    const record = reply && typeof reply === "object" ? reply as Record<string, unknown> : {};
    this.#emit("graphysx-center-request", { id, ok: record.ok !== false && typeof record.intent === "string", intent: typeof record.intent === "string" ? record.intent : null, reason: typeof record.reason === "string" ? record.reason : null });
    this.#post({ schema: CENTER_BRIDGE_SCHEMA, type: "propose-reply", id, reply });
  }

  #openEvents(): void {
    if (this.#events) return;
    const base = this.#attributes?.apiBase ?? DEFAULT_API_BASE;
    const events = new EventSource(`${base}/center/events`);
    events.addEventListener("hello", (event) => {
      const parsed = parseJson((event as MessageEvent).data);
      const pageId = parsed && typeof parsed.pageId === "string" ? parsed.pageId : null;
      if (!pageId) return;
      this.#pageId = pageId;
      this.#emit("graphysx-center-events", { pageId });
      // Core knows this page now; it needs the scene to compose against.
      this.#scheduleState(true);
    });
    events.addEventListener("proposal", (event) => {
      const raw = String((event as MessageEvent).data ?? "");
      const proposal = raw.length <= PUSH_MAX_BYTES ? parseJson(raw) : null;
      if (!proposal) return;
      this.#pushes += 1;
      this.#emit("graphysx-center-pushed", { id: typeof proposal.id === "string" ? proposal.id : null, intent: typeof proposal.intent === "string" ? proposal.intent : null });
      if (!this.#ready) {
        void this.#send("/center/receipts", { pageId: this.#pageId ?? "", id: typeof proposal.id === "string" ? proposal.id : "unknown", status: "refused", reason: "The Center is not ready." } satisfies ReceiptBody);
        return;
      }
      // Handed down as it came: the Center validates, this element does not read commands.
      this.#post({ schema: CENTER_BRIDGE_SCHEMA, type: "push", proposal });
    });
    events.addEventListener("error", () => {
      // EventSource reconnects on its own; Core says hello again with a new page id.
      this.#emit("graphysx-center-error", { stage: "events", message: "The connection to Core's stream was lost; reconnecting." });
    });
    this.#events = events;
  }

  #scheduleState(now = false): void {
    if (this.#stateTimer) clearTimeout(this.#stateTimer);
    this.#stateTimer = setTimeout(() => {
      this.#stateTimer = null;
      void this.#postState();
    }, now ? 0 : STATE_DEBOUNCE_MS);
  }

  async #postState(): Promise<void> {
    if (!this.#pageId || !this.#state) return;
    await this.#send("/center/state", { pageId: this.#pageId, revision: this.#state.revision, scene: this.#state.scene });
  }

  async #send(route: string, body: unknown): Promise<void> {
    const base = this.#attributes?.apiBase ?? DEFAULT_API_BASE;
    try {
      await fetch(`${base}${route}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
        redirect: "error",
        keepalive: true,
      });
    } catch {
      this.#emit("graphysx-center-error", { stage: route.slice(1), message: "Core could not be reached." });
    }
  }
}

function parseJson(text: unknown): Record<string, unknown> | null {
  if (typeof text !== "string") return null;
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

if (typeof window !== "undefined" && typeof customElements !== "undefined" && !customElements.get(TAG)) {
  customElements.define(TAG, GraphysXCenterElement);
}
