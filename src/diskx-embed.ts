/**
 * The DiskX LAN embed (`dist/embed/diskx.js`): one self-contained ES module an AgentX Core page
 * relays from its own origin, like `llmx-face.js`. It defines `<diskx-city>`, which mounts the
 * DiskX city full-size inside itself and reads Core's Data Toolbox routes on the page's origin.
 *
 *   <diskx-city api-base="/api/data-toolbox" roots="/mnt/datalake,/mnt/media"
 *               janitor="latest" group="<sha256>" focus="/mnt/datalake/ISO"></diskx-city>
 *
 * GET only. It carries no inventory of its own (no fixture is used). Events bubble as
 * `diskx-ready`, `diskx-group-shown` {sha256, places, links, outside} and `diskx-error`
 * {stage, message}: presentation receipts, never proof that a file was moved or deleted.
 */
import { mountDiskxApp, type DiskxApplication } from "./diskx-app";
import { parseDiskxCityAttributes } from "./diskx-embed-attributes";
import { PlatformHost } from "./platform-host";

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
    this.append(stage);
    this.stage = stage;
    try {
      this.host = new PlatformHost(stage, { interactive: false, editorVisible: false, autoOrbit: false, intro: false });
      this.app = mountDiskxApp(stage, this.host, () => undefined, {
        live: { endpoints: options.endpoints, roots: options.roots, origin: window.location.host },
        focus: options.focus, janitor: options.janitor, group: options.group, embedded: true,
        onEvent: (type, detail) => this.dispatchEvent(new CustomEvent(`diskx-${type}`, { detail, bubbles: true, composed: true })),
      });
    } catch (error) {
      this.fail("mount", error);
    }
  }

  disconnectedCallback(): void {
    this.app?.dispose();
    this.host?.dispose();
    this.stage?.remove();
    this.app = null; this.host = null; this.stage = null;
  }

  /** The city's own text state, for the host page's checks (same shape as the GraphysX app's). */
  state(): unknown { return this.app?.state() ?? null; }

  private fail(stage: string, error: unknown): void {
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
