/** The existing connected-house tour, carried by the already relayed DiskX bundle. */
import { mountEcosystemApp, type EcosystemApplication, type EcosystemEvent } from "./ecosystem-app";
import { ecosystemObservation, type EcosystemViewState } from "./ecosystem-presentation";
import { PlatformHost } from "./platform-host";

declare const __GRAPHYSX_EMBED_VERSION__: string;

export class AgentxEcosystemElement extends HTMLElement {
  private host: PlatformHost | null = null;
  private app: EcosystemApplication | null = null;
  private unsubscribe: (() => void) | null = null;
  private pending = new Map<EcosystemEvent, Record<string, unknown>>();
  private unsubscribeWorld: (() => void) | null = null;
  private documentRevision = 0;
  private revisionDirty = false;
  private displayed: Record<string, unknown> | null = null;
  private sequence = 0;
  private instance = "";
  private mountedAt = "";
  static get observedAttributes(): string[] { return ["play"]; }

  connectedCallback(): void {
    if (this.host) return;
    this.instance = crypto.randomUUID();
    this.mountedAt = new Date().toISOString();
    this.sequence = 0;
    this.displayed = null;
    const stage = document.createElement("div");
    stage.style.cssText = "position:absolute;inset:0;overflow:hidden";
    this.replaceChildren(stage);
    try {
      this.host = new PlatformHost(stage, { interactive: false, editorVisible: false, autoOrbit: false, intro: false });
      this.app = mountEcosystemApp(stage, this.host, () => { this.emit("closed", {}); this.release(); }, {
        play: this.getAttribute("play"), embedded: true,
        onEvent: (type, detail) => this.pending.set(type, detail),
      });
      this.documentRevision = this.host.world.getState().revision;
      this.unsubscribeWorld = this.host.world.subscribeEvents(() => { this.revisionDirty = true; });
      // A constructor or an opening intention is not a display receipt. Capture only after
      // the shared host actually renders; no extra frame loop, fetch, provider or proxy.
      this.unsubscribe = this.host.subscribeAfterRender(() => {
        if (!this.app || !this.host) return;
        if (this.revisionDirty) { this.documentRevision = this.host.world.getState().revision; this.revisionDirty = false; }
        const state = this.app.state() as EcosystemViewState;
        const observation = ecosystemObservation(state);
        this.displayed = { ...state, presentation: { ...observation,
          presentationId: this.getAttribute("presentation-id"), instance: this.instance,
          mountedAt: this.mountedAt, observedAt: new Date().toISOString(), sequence: ++this.sequence,
          version: __GRAPHYSX_EMBED_VERSION__, documentRevision: this.documentRevision } };
        for (const [type, detail] of this.pending) this.emit(type, { ...detail, instance: this.instance, sequence: this.sequence });
        this.pending.clear();
      });
    } catch (error) { this.fail(error); }
  }

  attributeChangedCallback(name: string, previous: string | null, value: string | null): void {
    if (name !== "play" || previous === value || !this.app) return;
    try { if (value) this.app.tour.setScript(value, true); }
    catch (error) { this.emit("error", { stage: "play", message: String(error) }); }
  }

  state(): unknown { return this.displayed; }
  get tour(): EcosystemApplication["tour"] | undefined { return this.app?.tour; }

  disconnectedCallback(): void { this.release(); }
  private release(): void {
    this.unsubscribe?.(); this.unsubscribe = null;
    this.unsubscribeWorld?.(); this.unsubscribeWorld = null;
    const app = this.app, host = this.host;
    this.app = null; this.host = null; this.displayed = null; this.pending.clear();
    try { app?.dispose(); } finally { host?.dispose(); this.replaceChildren(); }
  }
  private emit(type: string, detail: Record<string, unknown>): void {
    this.dispatchEvent(new CustomEvent(`ecosystem-${type}`, { detail, bubbles: true, composed: true }));
  }
  private fail(error: unknown): void {
    this.release();
    const note = document.createElement("p"); note.setAttribute("role", "alert");
    note.textContent = "Visite indisponible : " + String(error); this.replaceChildren(note);
    this.emit("error", { stage: "mount", message: String(error) });
  }
}

if (!customElements.get("agentx-ecosystem")) customElements.define("agentx-ecosystem", AgentxEcosystemElement);
