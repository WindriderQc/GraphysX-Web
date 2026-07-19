/**
 * The scene browser: the visible face of the scene store.
 *
 * Until now a stored scene could only be opened by editing the URL and saved only from the
 * console, which made the whole shared-scene idea invisible. This panel is where you see
 * which scenes exist, switch between them, save the one you are in, and — the part that
 * matters — watch an agent change it while you are standing in it.
 *
 * Attribution is the reason the live row exists rather than a spinner. With Hermes,
 * OpenClaw and AgentX all writing to the same store, "revision 14" means nothing on its
 * own; "hermes · added a red cube" is the thing worth putting on screen.
 *
 * DOM chrome, like `showroom-welcome.ts`. It borrows the editor's custom properties so the
 * two panels cannot drift apart visually.
 */

import type { GraphysXAgentWorldApi } from "./agent-world-runtime";
import {
  connectSceneStore,
  SceneStoreError,
  type SceneStoreClient,
  type SceneStoreRecord,
  type SceneStoreSession,
  type SceneStoreSummary,
} from "./scene-store-client";

export type SceneBrowserOptions = {
  api: GraphysXAgentWorldApi;
  client: SceneStoreClient;
  /** Scene to open on mount. Omitted leaves the browser idle on whatever is on screen. */
  initialScene?: string | null;
  /** Identifies this tab's writes. */
  actor?: string;
  /** Called when a scene is opened, so the host can hand the pointer back to the scene. */
  onSceneOpened?: (record: SceneStoreRecord) => void;
};

export type SceneBrowser = {
  readonly element: HTMLElement;
  session(): SceneStoreSession | null;
  open(name: string): Promise<void>;
  save(): Promise<void>;
  refresh(): Promise<void>;
  dispose(): void;
};

const REFRESH_MS = 4000;

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return "just now";
  if (seconds < 90) return "a minute ago";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86400)} d ago`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] ?? character
  ));
}

export function mountSceneBrowser(container: HTMLElement, options: SceneBrowserOptions): SceneBrowser {
  const { api, client, actor = "browser", onSceneOpened } = options;

  const style = document.createElement("style");
  style.textContent = BROWSER_CSS;

  const panel = document.createElement("aside");
  panel.className = "gx-sb";
  panel.innerHTML = `
    <header class="gx-sb-head">
      <div class="gx-sb-title">
        <span class="gx-sb-dot" data-role="dot"></span>
        <strong>Scenes</strong>
      </div>
      <button type="button" class="gx-sb-icon" data-action="collapse" title="Collapse">–</button>
    </header>
    <div class="gx-sb-body">
      <ul class="gx-sb-list" data-role="list"></ul>
      <div class="gx-sb-live" data-role="live" hidden></div>
      <footer class="gx-sb-foot">
        <button type="button" data-action="save">Save to store</button>
        <button type="button" data-action="revert" title="Discard local changes and reload the stored scene">Revert</button>
      </footer>
      <p class="gx-sb-status" data-role="status"></p>
    </div>
  `;

  const list = panel.querySelector<HTMLUListElement>("[data-role=list]")!;
  const live = panel.querySelector<HTMLDivElement>("[data-role=live]")!;
  const status = panel.querySelector<HTMLParagraphElement>("[data-role=status]")!;
  const dot = panel.querySelector<HTMLSpanElement>("[data-role=dot]")!;
  const saveButton = panel.querySelector<HTMLButtonElement>("[data-action=save]")!;

  let session: SceneStoreSession | null = null;
  let scenes: SceneStoreSummary[] = [];
  let refreshTimer: number | null = null;
  let liveTimer: number | null = null;
  let disposed = false;

  const setStatus = (message: string, tone: "idle" | "busy" | "error" = "idle"): void => {
    status.textContent = message;
    status.dataset.tone = tone;
  };

  const setOnline = (online: boolean): void => {
    dot.dataset.online = String(online);
    dot.title = online ? `Connected to ${client.baseUrl}` : `Cannot reach ${client.baseUrl}`;
  };

  /**
   * The moment worth designing for: someone else changed the scene you are standing in.
   * Named, attributed, and briefly highlighted rather than a silent reload.
   */
  const announce = (record: SceneStoreRecord): void => {
    const who = record.actor ?? "someone";
    const what = record.intent ?? "changed the scene";
    live.innerHTML = `<span class="gx-sb-actor">${escapeHtml(who)}</span> ${escapeHtml(what)} <span class="gx-sb-rev">rev ${record.revision}</span>`;
    live.hidden = false;
    live.classList.remove("gx-sb-flash");
    // Restart the animation rather than letting a second change land silently mid-flash.
    void live.offsetWidth;
    live.classList.add("gx-sb-flash");
    if (liveTimer !== null) window.clearTimeout(liveTimer);
    liveTimer = window.setTimeout(() => { live.hidden = true; }, 9000);
  };

  const render = (): void => {
    const activeName = session?.name ?? null;
    if (scenes.length === 0) {
      list.innerHTML = `<li class="gx-sb-empty">No scenes stored yet — open one in the editor and press Save.</li>`;
      return;
    }
    list.innerHTML = scenes
      .map((scene) => {
        const active = scene.name === activeName;
        const by = scene.actor ? ` · ${escapeHtml(scene.actor)}` : "";
        return `
          <li>
            <button type="button" class="gx-sb-row${active ? " gx-sb-on" : ""}" data-scene="${escapeHtml(scene.name)}" ${active ? 'aria-current="true"' : ""}>
              <span class="gx-sb-name">${escapeHtml(scene.label ?? scene.name)}</span>
              <span class="gx-sb-meta">${scene.entityCount} objects · rev ${scene.revision}${by}</span>
              <span class="gx-sb-when">${timeAgo(scene.updatedAt)}</span>
            </button>
          </li>
        `;
      })
      .join("");
  };

  const refresh = async (): Promise<void> => {
    try {
      scenes = await client.list();
      setOnline(true);
      render();
    } catch (error) {
      if (error instanceof SceneStoreError && error.status === 0) {
        setOnline(false);
        setStatus("Scene store offline", "error");
      }
    }
  };

  const open = async (name: string): Promise<void> => {
    if (session?.name === name) return;
    session?.stop();
    setStatus(`Opening ${name}…`, "busy");
    session = connectSceneStore({
      api,
      client,
      name,
      actor,
      onPulled: (record, remote) => {
        if (remote) {
          announce(record);
          // A remote write changes the list too — entity counts and attribution move.
          void refresh();
        }
        setStatus(`${record.name} · rev ${record.revision}`);
        onSceneOpened?.(record);
      },
      onOnlineChange: (online) => {
        setOnline(online);
        if (!online) setStatus("Scene store offline", "error");
      },
      onError: () => {},
    });
    try {
      await session.pull();
      render();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), "error");
    }
  };

  const save = async (): Promise<void> => {
    if (!session) {
      setStatus("Open a scene before saving", "error");
      return;
    }
    saveButton.disabled = true;
    setStatus("Saving…", "busy");
    try {
      const result = await session.push("saved from the browser");
      setStatus(`Saved · rev ${result.revision}`);
      await refresh();
    } catch (error) {
      // A conflict here is meaningful: an agent moved the scene under you. Say so plainly
      // rather than reporting a generic failure.
      const conflict = error instanceof SceneStoreError && error.isConflict;
      setStatus(
        conflict
          ? "Someone else changed this scene — Revert, then redo your edit"
          : error instanceof Error ? error.message : String(error),
        "error",
      );
    } finally {
      saveButton.disabled = false;
    }
  };

  const revert = async (): Promise<void> => {
    if (!session) return;
    setStatus("Reloading…", "busy");
    try {
      await session.pull();
      setStatus(`Reloaded · rev ${session.revision()}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), "error");
    }
  };

  panel.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const row = target.closest<HTMLButtonElement>("[data-scene]");
    if (row) {
      void open(row.dataset.scene!);
      return;
    }
    const action = target.closest<HTMLButtonElement>("[data-action]")?.dataset.action;
    if (action === "save") void save();
    if (action === "revert") void revert();
    if (action === "collapse") panel.classList.toggle("gx-sb-collapsed");
  });

  container.append(style, panel);
  setOnline(true);
  setStatus("");
  void refresh();
  if (options.initialScene) void open(options.initialScene);
  refreshTimer = window.setInterval(() => void refresh(), REFRESH_MS);

  return {
    element: panel,
    session: () => session,
    open,
    save,
    refresh,
    dispose() {
      if (disposed) return;
      disposed = true;
      session?.stop();
      if (refreshTimer !== null) window.clearInterval(refreshTimer);
      if (liveTimer !== null) window.clearTimeout(liveTimer);
      panel.remove();
      style.remove();
    },
  };
}

/** Same tokens as EDITOR_CSS in platform-editor.ts, so the two panels read as one product. */
const BROWSER_CSS = `
.gx-sb{
  --gx-panel:rgba(8,20,28,.88);
  --gx-raise:rgba(16,38,49,.9);
  --gx-border:#1b3b49;
  --gx-border-soft:#153040;
  --gx-accent:#37b6d3;
  --gx-accent-deep:#1c6a80;
  --gx-text:#dbeff5;
  --gx-muted:#7fb0c0;
  --gx-field:#0b222c;
  position:fixed;top:12px;right:12px;z-index:25;width:264px;box-sizing:border-box;
  font:12px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;color:var(--gx-text);
  background:var(--gx-panel);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  border:1px solid var(--gx-border);border-radius:8px;box-shadow:0 10px 34px rgba(0,10,16,.42);
  overflow:hidden;
}
.gx-sb *{box-sizing:border-box}
.gx-sb-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-bottom:1px solid var(--gx-border-soft)}
.gx-sb-title{display:flex;align-items:center;gap:7px;letter-spacing:.04em;text-transform:uppercase;font-size:11px}
.gx-sb-dot{width:7px;height:7px;border-radius:50%;background:#4b6572;flex:none;transition:background .2s,box-shadow .2s}
.gx-sb-dot[data-online=true]{background:#3fd39b;box-shadow:0 0 0 3px rgba(63,211,155,.16)}
.gx-sb-dot[data-online=false]{background:#e2685f;box-shadow:0 0 0 3px rgba(226,104,95,.16)}
.gx-sb-icon{background:none;border:none;color:var(--gx-muted);cursor:pointer;font:16px/1 system-ui;padding:0 4px}
.gx-sb-icon:hover{color:var(--gx-text)}
.gx-sb-collapsed .gx-sb-body{display:none}

.gx-sb-list{list-style:none;margin:0;padding:5px;max-height:40vh;overflow-y:auto;display:flex;flex-direction:column;gap:3px}
.gx-sb-row{width:100%;display:grid;grid-template-columns:1fr auto;gap:1px 8px;text-align:left;background:none;border:1px solid transparent;border-radius:6px;padding:6px 8px;color:inherit;font:inherit;cursor:pointer}
.gx-sb-row:hover{background:var(--gx-raise);border-color:var(--gx-border)}
.gx-sb-row.gx-sb-on{background:var(--gx-field);border-color:var(--gx-accent-deep)}
.gx-sb-name{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gx-sb-meta{grid-column:1;color:var(--gx-muted);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gx-sb-when{grid-row:1;grid-column:2;color:var(--gx-muted);font-size:11px;white-space:nowrap}
.gx-sb-empty{color:var(--gx-muted);padding:10px 8px;line-height:1.5}

.gx-sb-live{margin:0 5px;padding:7px 9px;border-radius:6px;background:rgba(55,182,211,.1);border:1px solid var(--gx-accent-deep);color:var(--gx-text);font-size:11.5px;line-height:1.45}
.gx-sb-actor{font-weight:700;color:var(--gx-accent)}
.gx-sb-rev{color:var(--gx-muted)}
.gx-sb-flash{animation:gx-sb-pulse 1.1s ease-out}
@keyframes gx-sb-pulse{
  0%{background:rgba(55,182,211,.42);border-color:var(--gx-accent)}
  100%{background:rgba(55,182,211,.1);border-color:var(--gx-accent-deep)}
}

.gx-sb-foot{display:flex;gap:6px;padding:8px 5px 5px}
.gx-sb-foot button{flex:1;background:var(--gx-field);color:var(--gx-text);border:1px solid var(--gx-border);border-radius:6px;padding:6px 8px;font:inherit;cursor:pointer}
.gx-sb-foot button:hover:not(:disabled){background:var(--gx-raise);border-color:var(--gx-accent-deep)}
.gx-sb-foot button:disabled{opacity:.5;cursor:default}
.gx-sb-status{margin:0;padding:0 10px 9px;min-height:15px;color:var(--gx-muted);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gx-sb-status[data-tone=error]{color:#f0938b}
.gx-sb-status[data-tone=busy]{color:var(--gx-accent)}

@media (prefers-reduced-motion:reduce){.gx-sb-flash{animation:none}}
@media (max-width:640px){.gx-sb{left:12px;width:auto}}
`;
