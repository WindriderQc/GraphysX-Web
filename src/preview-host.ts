// The workshop preview index: one place from which every restoration harness is reachable.
//
// Dev-only, mounted from `main.ts` at `?host=previews`. It owns the single canvas, the
// single renderer and the single frame loop (`preview-bootstrap.ts`); a preview supplies
// scene content and a step function and nothing else.
//
// The index lists every harness in `preview-registry.ts`, including the ones that have not
// been converted yet — those are shown, disabled, with the canvas id they still query. An
// index that silently omitted them would recreate the problem it exists to fix.

import { createPreviewRunner, type PreviewModule, type PreviewRunner } from "./preview-bootstrap";
import { PREVIEWS, type PreviewEntry } from "./preview-registry";

const HOST_CSS = `
.gx-pv { position: fixed; inset: 0; display: grid; grid-template-columns: 280px 1fr;
  font: 13px/1.5 "Space Grotesk", system-ui, sans-serif; color: #e9eef5; background: #0a0e14; }
.gx-pv-side { overflow-y: auto; border-right: 1px solid rgba(255,255,255,0.12); padding: 12px; }
.gx-pv-side h1 { font-size: 13px; letter-spacing: .08em; text-transform: uppercase; margin: 0 0 4px; }
.gx-pv-note { color: #9fb0c4; font-size: 11px; margin: 0 0 12px; }
.gx-pv-group { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: #7fb0c0;
  margin: 14px 0 6px; }
.gx-pv-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.gx-pv-item button { width: 100%; text-align: left; font: inherit; color: inherit; cursor: pointer;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12);
  border-radius: 6px; padding: 6px 8px; }
.gx-pv-item button:hover:not(:disabled) { background: rgba(255,255,255,0.12); }
.gx-pv-item button:focus-visible { outline: 2px solid #7dd3fc; outline-offset: 1px; }
.gx-pv-item button[aria-current="true"] { border-color: #7dd3fc; background: rgba(125,211,252,0.14); }
.gx-pv-item button:disabled { opacity: .45; cursor: not-allowed; }
.gx-pv-label { display: block; font-weight: 600; }
.gx-pv-summary { display: block; font-size: 11px; color: #9fb0c4; }
.gx-pv-stage { position: relative; }
.gx-pv-canvas { width: 100%; height: 100%; display: block; }
.gx-pv-controls { position: absolute; left: 12px; bottom: 12px; display: flex; gap: 8px; flex-wrap: wrap; }
.gx-pv-error { position: absolute; inset: auto 12px 12px 12px; background: rgba(80,12,12,.92);
  border: 1px solid #f87171; border-radius: 6px; padding: 8px 10px; font-size: 12px;
  white-space: pre-wrap; max-height: 40%; overflow: auto; }
.gx-pv-error[hidden] { display: none; }
@media (max-width: 720px) { .gx-pv { grid-template-columns: 1fr; grid-template-rows: 40% 1fr; }
  .gx-pv-side { border-right: 0; border-bottom: 1px solid rgba(255,255,255,0.12); } }
`;

export type PreviewHost = {
  runner: PreviewRunner;
  open: (id: string) => Promise<void>;
  dispose: () => void;
};

export function mountPreviewHost(container: HTMLElement): PreviewHost {
  const style = document.createElement("style");
  style.textContent = HOST_CSS;

  const root = document.createElement("div");
  root.className = "gx-pv";
  root.innerHTML = `
    <aside class="gx-pv-side">
      <h1>Workshop previews</h1>
      <p class="gx-pv-note">Restoration harnesses, not product. Development only — the
        production bundle does not include them.</p>
      <p class="gx-pv-group">Runnable</p>
      <ul class="gx-pv-list" data-role="mountable"></ul>
      <p class="gx-pv-group">Not yet converted</p>
      <p class="gx-pv-note">Still own a renderer and a frame loop, and query a canvas id no
        page provides, so they cannot run. Recipe: <code>docs/PREVIEWS.md</code>.</p>
      <ul class="gx-pv-list" data-role="unconverted"></ul>
    </aside>
    <div class="gx-pv-stage">
      <canvas class="gx-pv-canvas" data-role="canvas"></canvas>
      <div class="gx-pv-controls" data-role="controls"></div>
      <p class="gx-pv-error" data-role="error" role="alert" hidden></p>
    </div>
  `;
  container.append(style, root);

  const find = <T extends HTMLElement>(role: string): T => root.querySelector<T>(`[data-role="${role}"]`)!;
  const canvas = find<HTMLCanvasElement>("canvas");
  const controls = find("controls");
  const errorBox = find("error");

  const reportError = (error: unknown): void => {
    const message = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
    errorBox.textContent = message;
    errorBox.hidden = false;
    console.error("[graphysx preview]", error);
  };

  const runner = createPreviewRunner(canvas, controls, reportError);
  let active: string | null = null;

  const button = (entry: PreviewEntry): HTMLLIElement => {
    const item = document.createElement("li");
    item.className = "gx-pv-item";
    const control = document.createElement("button");
    control.type = "button";
    control.dataset.preview = entry.id;
    control.disabled = entry.state !== "mountable";
    control.innerHTML = `<span class="gx-pv-label"></span><span class="gx-pv-summary"></span>`;
    control.querySelector(".gx-pv-label")!.textContent = entry.label;
    control.querySelector(".gx-pv-summary")!.textContent = entry.state === "mountable"
      ? entry.summary
      : `${entry.summary}${entry.legacyCanvasId ? ` · needs ${entry.legacyCanvasId}` : ""}`;
    if (entry.state === "mountable") control.addEventListener("click", () => void open(entry.id));
    item.append(control);
    return item;
  };

  find<HTMLUListElement>("mountable").replaceChildren(
    ...PREVIEWS.filter((entry) => entry.state === "mountable").map(button));
  find<HTMLUListElement>("unconverted").replaceChildren(
    ...PREVIEWS.filter((entry) => entry.state !== "mountable").map(button));

  async function open(id: string): Promise<void> {
    const entry = PREVIEWS.find((candidate) => candidate.id === id);
    if (!entry?.load) {
      reportError(new Error(`Preview '${id}' is not mountable yet. See docs/PREVIEWS.md.`));
      return;
    }
    errorBox.hidden = true;
    errorBox.textContent = "";
    active = id;
    for (const control of root.querySelectorAll<HTMLButtonElement>("[data-preview]")) {
      control.setAttribute("aria-current", String(control.dataset.preview === id));
    }
    try {
      const module = (await entry.load()) as unknown as PreviewModule;
      await runner.mount(module);
    } catch (error) {
      reportError(error);
    }
  }

  // The browser-harness contract the individual previews used to install on `window`,
  // now installed once by the host and delegating to whichever preview is mounted.
  const testWindow = window as typeof window & {
    render_game_to_text?: () => string;
    advanceTime?: (milliseconds: number) => number;
    __GRAPHYSX_PREVIEWS__?: unknown;
  };
  testWindow.render_game_to_text = () => JSON.stringify({
    mode: "workshop-preview-index",
    active,
    frames: runner.frames(),
    mountable: PREVIEWS.filter((entry) => entry.state === "mountable").map((entry) => entry.id),
    unconverted: PREVIEWS.filter((entry) => entry.state !== "mountable").map((entry) => entry.id),
    preview: runner.describe(),
  });
  testWindow.advanceTime = (milliseconds: number) => runner.advanceTime(milliseconds);
  testWindow.__GRAPHYSX_PREVIEWS__ = { runner, open, previews: PREVIEWS };

  return {
    runner,
    open,
    dispose: () => {
      runner.dispose();
      root.remove();
      style.remove();
    },
  };
}
