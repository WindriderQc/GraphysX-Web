/**
 * The DiskX LAN embed (`dist/embed/diskx.js`): one self-contained ES module an AgentX Core page
 * relays from its own origin, like `llmx-face.js`. It defines `<diskx-city>`, which mounts the
 * DiskX city full-size inside itself and reads Core's Data Toolbox routes on the page's origin.
 *
 *   <diskx-city api-base="/api/data-toolbox" roots="/mnt/datalake,/mnt/media"
 *               janitor="latest" group="<sha256>" focus="/mnt/datalake/ISO"></diskx-city>
 *
 * GET only. It carries no inventory of its own (no fixture is used). Events bubble as
 * `diskx-ready`, `diskx-report-read`, `diskx-group-shown` {sha256, places, links, outside},
 * `diskx-scene-changed`, `diskx-coverage`, `diskx-block-selected` and `diskx-error`
 * {stage, message}: presentation receipts, never proof that a file was moved or deleted.
 *
 * `play` is the Janitor show's animation list (`diskx-show-script.ts`); changing it on a mounted
 * element replaces the list and plays it. `actions-href` links the page where files are acted on.
 */
import { mountDiskxApp, type DiskxApplication } from "./diskx-app";
import { parseDiskxCityAttributes, parsePlayAttribute } from "./diskx-embed-attributes";
import { PlatformHost } from "./platform-host";
import "./ecosystem-embed";

/**
 * A default box for the element, at zero specificity and first in <head>: any rule of the host
 * page (for example `diskx-city{position:fixed;inset:0}`) wins. An inline style would not.
 */
function installDefaultStyle(): void {
  if (document.querySelector("style[data-diskx-city-default]")) return;
  const style = document.createElement("style");
  style.dataset.diskxCityDefault = "";
  style.textContent = ":where(diskx-city){display:block;position:relative;min-height:360px}";
  document.head.prepend(style);
}

export class DiskxCityElement extends HTMLElement {
  private host: PlatformHost | null = null;
  private app: DiskxApplication | null = null;
  private stage: HTMLDivElement | null = null;
  static get observedAttributes(): string[] { return ["play"]; }

  connectedCallback(): void {
    if (this.app) return;
    installDefaultStyle();
    let options: ReturnType<typeof parseDiskxCityAttributes>;
    try {
      options = parseDiskxCityAttributes((name) => this.getAttribute(name));
    } catch (error) {
      this.fail("attributes", error);
      return;
    }
    const stage = document.createElement("div");
    stage.style.cssText = "position:absolute;inset:0;overflow:hidden";
    this.replaceChildren(stage);
    this.stage = stage;
    try {
      this.host = new PlatformHost(stage, { interactive: false, editorVisible: false, autoOrbit: false, intro: false });
      this.app = mountDiskxApp(stage, this.host, () => undefined, {
        live: { endpoints: options.endpoints, roots: options.roots, origin: window.location.host },
        focus: options.focus, janitor: options.janitor, group: options.group, report: options.report, embedded: true,
        play: options.play, actionsHref: options.actionsHref,
        onEvent: (type, detail) => this.dispatchEvent(new CustomEvent(`diskx-${type}`, { detail, bubbles: true, composed: true })),
      });
    } catch (error) {
      this.fail("mount", error);
    }
  }

  /** A new `play` list on a mounted city replaces the animation list and plays it. */
  attributeChangedCallback(name: string, previous: string | null, value: string | null): void {
    if (name !== "play" || previous === value || !this.app) return;
    try {
      const script = parsePlayAttribute(value);
      if (script) this.app.show.setScript(script, true);
    } catch (error) {
      this.dispatchEvent(new CustomEvent("diskx-error", { detail: { stage: "play", message: error instanceof Error ? error.message : String(error) }, bubbles: true, composed: true }));
    }
  }

  /** Host controls of the animation list. Presentation only, like the rest of the element. */
  play(): void { this.app?.show.play(); }
  pause(): void { this.app?.show.pause(); }
  next(): void { this.app?.show.next(); }
  previous(): void { this.app?.show.previous(); }

  disconnectedCallback(): void {
    this.release();
  }

  private release(): void {
    const app = this.app, host = this.host, stage = this.stage;
    this.app = null; this.host = null; this.stage = null;
    try { app?.dispose(); }
    finally {
      try { host?.dispose(); }
      finally { stage?.remove(); }
    }
  }

  /** The city's own text state, for the host page's checks (same shape as the GraphysX app's). */
  state(): unknown { return this.app?.state() ?? null; }

  private fail(stage: string, error: unknown): void {
    this.release();
    const message = error instanceof Error ? error.message : String(error);
    const note = document.createElement("p");
    note.setAttribute("role", "alert");
    note.textContent = `DiskX indisponible : ${message}`;
    note.style.cssText = "margin:16px;color:#ffcf78;font:14px system-ui,sans-serif";
    this.replaceChildren(note);
    this.dispatchEvent(new CustomEvent("diskx-error", { detail: { stage, message }, bubbles: true, composed: true }));
  }
}

if (!customElements.get("diskx-city")) customElements.define("diskx-city", DiskxCityElement);
