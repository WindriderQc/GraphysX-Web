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
  /** Called after Close detaches from a scene, so the host can bring the front door back. */
  onSceneClosed?: () => void;
};

export type SceneBrowser = {
  readonly element: HTMLElement;
  session(): SceneStoreSession | null;
  /** Cede scene authority while leaving read-only scene-list refresh available. */
  setEnabled(enabled: boolean): void;
  open(name: string): Promise<void>;
  save(): Promise<void>;
  /** Store what is on screen under a new name. Create-only: an existing name is refused. */
  saveAs(name: string): Promise<void>;
  /** Detach from the open scene without saving. The store keeps its copy. */
  close(): void;
  refresh(): Promise<void>;
  dispose(): void;
};

const REFRESH_MS = 4000;

/** Mirrors the store's assertName — reject locally so the user gets a sentence, not a 400. */
const NAME_RULE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/;

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
  const { api, client, actor = "browser", onSceneOpened, onSceneClosed } = options;

  const style = document.createElement("style");
  style.textContent = BROWSER_CSS;

  const panel = document.createElement("aside");
  panel.className = "gx-sb";
  panel.setAttribute("aria-label", "Stored scenes");
  panel.innerHTML = `
    <header class="gx-sb-head">
      <div class="gx-sb-title">
        <span class="gx-sb-dot" data-role="dot"></span>
        <strong>Scenes</strong>
      </div>
      <button type="button" class="gx-sb-icon" data-action="collapse" title="Collapse stored scenes" aria-label="Collapse stored scenes" aria-expanded="true" aria-controls="gx-scene-browser-body">–</button>
    </header>
    <div class="gx-sb-body" id="gx-scene-browser-body">
      <ul class="gx-sb-list" data-role="list"></ul>
      <div class="gx-sb-live" data-role="live" role="status" aria-live="polite" aria-atomic="true" hidden></div>
      <footer class="gx-sb-foot">
        <button type="button" data-action="save">Save</button>
        <button type="button" data-action="save-as" title="Store what is on screen as a new named scene">Save as…</button>
        <button type="button" data-action="revert" title="Discard local changes and reload the stored scene">Revert</button>
        <button type="button" data-action="close" title="Stop following this scene and return to the front door — the store keeps its copy" aria-label="Stop following this scene and return to AgentX Center">✕</button>
      </footer>
      <form class="gx-sb-saveas" data-role="saveas" aria-label="Save scene under a new name" hidden>
        <input data-role="saveas-name" type="text" aria-label="New scene name" placeholder="scene-name" spellcheck="false" autocomplete="off" maxlength="80" />
        <button type="submit">Store</button>
        <button type="button" data-action="saveas-cancel" title="Cancel Save as" aria-label="Cancel Save as">✕</button>
      </form>
      <p class="gx-sb-status" data-role="status" role="status" aria-live="polite" aria-atomic="true"></p>
    </div>
  `;

  const list = panel.querySelector<HTMLUListElement>("[data-role=list]")!;
  const live = panel.querySelector<HTMLDivElement>("[data-role=live]")!;
  const status = panel.querySelector<HTMLParagraphElement>("[data-role=status]")!;
  const dot = panel.querySelector<HTMLSpanElement>("[data-role=dot]")!;
  const collapseButton = panel.querySelector<HTMLButtonElement>("[data-action=collapse]")!;
  const saveButton = panel.querySelector<HTMLButtonElement>("[data-action=save]")!;
  const revertButton = panel.querySelector<HTMLButtonElement>("[data-action=revert]")!;
  const closeButton = panel.querySelector<HTMLButtonElement>("[data-action=close]")!;
  const saveAsForm = panel.querySelector<HTMLFormElement>("[data-role=saveas]")!;
  const saveAsName = panel.querySelector<HTMLInputElement>("[data-role=saveas-name]")!;
  const storeHost = client.baseUrl.replace(/^https?:\/\//, "");

  let session: SceneStoreSession | null = null;
  let scenes: SceneStoreSummary[] = [];
  let refreshTimer: number | null = null;
  let refreshInFlight: Promise<void> | null = null;
  let liveTimer: number | null = null;
  let disposed = false;
  let enabled = true;
  // Invalidates delayed work from a store-follow session that was closed, replaced, or
  // detached when another authority (for example a live session) took over the world.
  let sessionAuthority = 0;

  const setStatus = (message: string, tone: "idle" | "busy" | "error" = "idle"): void => {
    status.textContent = message;
    status.dataset.tone = tone;
  };

  const setOnline = (online: boolean): void => {
    dot.dataset.online = String(online);
    dot.title = online ? `Connected to ${client.baseUrl}` : `Cannot reach ${client.baseUrl}`;
    dot.setAttribute("role", "img");
    dot.setAttribute("aria-label", online ? "Scene store connected" : "Scene store unavailable");
  };

  const setCollapsed = (collapsed: boolean): void => {
    panel.classList.toggle("gx-sb-collapsed", collapsed);
    collapseButton.setAttribute("aria-expanded", String(!collapsed));
    collapseButton.textContent = collapsed ? "+" : "–";
    collapseButton.title = collapsed ? "Expand stored scenes" : "Collapse stored scenes";
    collapseButton.setAttribute("aria-label", collapseButton.title);
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

  /** Save/Revert only make sense with a scene open; say why instead of erroring later. */
  const syncFooter = (): void => {
    const openName = session?.name ?? null;
    saveButton.disabled = openName === null;
    saveButton.title = openName === null
      ? "No stored scene open — Save as… stores what is on screen under a new name"
      : `Save what is on screen to “${openName}”`;
    revertButton.disabled = openName === null;
    closeButton.disabled = openName === null;
  };

  const hasSessionAuthority = (authority: number): boolean =>
    enabled && !disposed && authority === sessionAuthority;

  /**
   * Stopping a store session closes its poller and EventSource, but a fetch already across
   * the network boundary can still resolve afterward. Gate every API operation that its
   * retained session handle can use to replace or write a world, so stale pulls, deltas and
   * pushes are harmless after this browser cedes authority.
   */
  const authorityApi = (authority: number): GraphysXAgentWorldApi => new Proxy(api, {
    get(target, property, receiver) {
      if (property === "load") {
        return (...args: Parameters<GraphysXAgentWorldApi["load"]>) => {
          if (!hasSessionAuthority(authority)) return { ok: false, error: "Scene browser is disabled" };
          return target.load(...args);
        };
      }
      if (property === "transaction") {
        return (...args: Parameters<GraphysXAgentWorldApi["transaction"]>) => {
          if (!hasSessionAuthority(authority)) return { ok: false, error: "Scene browser is disabled" };
          return target.transaction(...args);
        };
      }
      if (property === "exportDocument") {
        return (...args: Parameters<GraphysXAgentWorldApi["exportDocument"]>) => {
          if (!hasSessionAuthority(authority)) return null;
          return target.exportDocument(...args);
        };
      }
      return Reflect.get(target, property, receiver);
    },
  });

  const render = (): void => {
    const activeName = session?.name ?? null;
    if (scenes.length === 0) {
      list.innerHTML = `<li class="gx-sb-empty">Nothing stored yet. <strong>Save as…</strong> stores what is on screen as a named scene at <code>${escapeHtml(storeHost)}</code> — no need to load anything first.</li>`;
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

  const refresh = (): Promise<void> => {
    // Live observer mode makes this browser deliberately inert. Do not keep opening store
    // connections behind the hidden panel, and do not let a slow poll overlap the next tick.
    if (!enabled || disposed) return Promise.resolve();
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
      try {
        const listed = await client.list();
        if (!enabled || disposed) return;
        scenes = listed;
        setOnline(true);
        render();
      } catch (error) {
        if (!enabled || disposed) return;
        if (error instanceof SceneStoreError && error.status === 0) {
          setOnline(false);
          setStatus("Scene store offline", "error");
        }
      } finally {
        refreshInFlight = null;
      }
    })();
    return refreshInFlight;
  };

  const open = async (name: string): Promise<void> => {
    if (!enabled || disposed) return;
    if (session?.name === name) return;
    const previousSession = session;
    session = null;
    const authority = ++sessionAuthority;
    previousSession?.stop();
    setStatus(`Opening ${name}…`, "busy");
    const openedSession = connectSceneStore({
      api: authorityApi(authority),
      client,
      name,
      actor,
      onPulled: (record, remote) => {
        if (!hasSessionAuthority(authority)) return;
        if (remote) {
          announce(record);
          // A remote write changes the list too — entity counts and attribution move.
          void refresh();
        }
        setStatus(`${record.name} · rev ${record.revision}`);
        onSceneOpened?.(record);
      },
      onOnlineChange: (online) => {
        if (!hasSessionAuthority(authority)) return;
        setOnline(online);
        if (!online) setStatus("Scene store offline", "error");
      },
      onError: () => {},
    });
    session = openedSession;
    try {
      await openedSession.pull();
      if (!hasSessionAuthority(authority) || session !== openedSession) return;
      render();
    } catch (error) {
      if (!hasSessionAuthority(authority) || session !== openedSession) return;
      setStatus(error instanceof Error ? error.message : String(error), "error");
    }
    if (hasSessionAuthority(authority) && session === openedSession) syncFooter();
  };

  const save = async (): Promise<void> => {
    if (!enabled || disposed) return;
    if (!session) {
      // Reachable through the returned API only — the button is disabled in this state.
      // Saving something new is a naming problem, not an error: hand over to Save as….
      openSaveAs();
      return;
    }
    const activeSession = session;
    const authority = sessionAuthority;
    saveButton.disabled = true;
    setStatus("Saving…", "busy");
    try {
      const result = await activeSession.push("saved from the browser");
      if (!hasSessionAuthority(authority) || session !== activeSession) return;
      setStatus(`Saved · rev ${result.revision}`);
      await refresh();
    } catch (error) {
      if (!hasSessionAuthority(authority) || session !== activeSession) return;
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
      if (enabled && !disposed) syncFooter();
    }
  };

  const suggestName = (): string => {
    if (session) return `${session.name}-copy`;
    const id = api.exportDocument()?.id;
    return typeof id === "string" && NAME_RULE.test(id) ? id : "my-scene";
  };

  const openSaveAs = (): void => {
    if (!enabled || disposed) return;
    saveAsForm.hidden = false;
    saveAsName.value = suggestName();
    saveAsName.focus();
    saveAsName.select();
  };

  const hideSaveAs = (): void => {
    saveAsForm.hidden = true;
  };

  const closeSaveAs = (): void => {
    if (!enabled || disposed) return;
    hideSaveAs();
  };

  const saveAs = async (rawName: string): Promise<void> => {
    if (!enabled || disposed) return;
    const name = rawName.trim().toLowerCase().replace(/\s+/g, "-");
    if (!NAME_RULE.test(name)) {
      setStatus("Start with a letter or digit; then letters, digits, dots, dashes", "error");
      return;
    }
    const definition = api.exportDocument();
    if (!definition) {
      setStatus("Nothing on screen to store yet", "error");
      return;
    }
    const authority = sessionAuthority;
    setStatus(`Storing ${name}…`, "busy");
    try {
      // expectedRevision 0 makes this create-only: a name that already exists comes back
      // as a 409 instead of being overwritten by a scene that merely shares its name.
      await client.put(name, definition, 0, { actor, intent: "created from the browser" });
      if (!hasSessionAuthority(authority)) return;
      hideSaveAs();
      await refresh();
      if (!hasSessionAuthority(authority)) return;
      // Bind the session to what we just stored, so Save and the live stream now target it.
      await open(name);
      if (!enabled || disposed || session?.name !== name) return;
      setStatus(`Stored as ${name} · rev 1`);
    } catch (error) {
      if (!hasSessionAuthority(authority)) return;
      setStatus(
        error instanceof SceneStoreError && error.isConflict
          ? `“${name}” already exists — pick another name, or open it and press Save`
          : error instanceof Error ? error.message : String(error),
        "error",
      );
    }
  };

  /**
   * The way back out. Opening a scene tears the front door down; without this, the only
   * exit was reloading the tab. Detaches the session — the store keeps its copy, and any
   * unsaved local edits stay on screen for the host to replace or keep.
   */
  const close = (): void => {
    if (!enabled || disposed) return;
    if (!session) return;
    const closingSession = session;
    session = null;
    sessionAuthority += 1;
    closingSession.stop();
    hideSaveAs();
    render();
    syncFooter();
    setStatus(`Store: ${storeHost}`);
    onSceneClosed?.();
  };

  const revert = async (): Promise<void> => {
    if (!enabled || disposed || !session) return;
    const activeSession = session;
    const authority = sessionAuthority;
    setStatus("Reloading…", "busy");
    try {
      await activeSession.pull();
      if (!hasSessionAuthority(authority) || session !== activeSession) return;
      setStatus(`Reloaded · rev ${activeSession.revision()}`);
    } catch (error) {
      if (!hasSessionAuthority(authority) || session !== activeSession) return;
      setStatus(error instanceof Error ? error.message : String(error), "error");
    }
  };

  const setEnabled = (next: boolean): void => {
    if (disposed || enabled === next) return;
    enabled = next;
    panel.hidden = !next;
    panel.inert = !next;
    if (next) panel.removeAttribute("aria-hidden");
    else panel.setAttribute("aria-hidden", "true");

    if (!next) {
      const activeSession = session;
      session = null;
      sessionAuthority += 1;
      activeSession?.stop();
      hideSaveAs();
      live.hidden = true;
      if (liveTimer !== null) window.clearTimeout(liveTimer);
      liveTimer = null;
      if (refreshTimer !== null) window.clearInterval(refreshTimer);
      refreshTimer = null;
      render();
      syncFooter();
      return;
    }

    render();
    syncFooter();
    setStatus(`Store: ${storeHost}`);
    void refresh();
    if (refreshTimer === null) refreshTimer = window.setInterval(() => void refresh(), REFRESH_MS);
  };

  panel.addEventListener("click", (event) => {
    if (!enabled || disposed) return;
    const target = event.target as HTMLElement;
    const row = target.closest<HTMLButtonElement>("[data-scene]");
    if (row) {
      void open(row.dataset.scene!);
      return;
    }
    const action = target.closest<HTMLButtonElement>("[data-action]")?.dataset.action;
    if (action === "save") void save();
    if (action === "save-as") openSaveAs();
    if (action === "saveas-cancel") closeSaveAs();
    if (action === "revert") void revert();
    if (action === "close") close();
    if (action === "collapse") setCollapsed(!panel.classList.contains("gx-sb-collapsed"));
  });

  saveAsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!enabled || disposed) return;
    void saveAs(saveAsName.value);
  });
  saveAsName.addEventListener("keydown", (event) => {
    if (!enabled || disposed) return;
    if (event.key === "Escape") closeSaveAs();
  });

  container.append(style, panel);

  // Editor chrome already owns the right side of the viewport. While it is visible, Scenes is
  // another inspector section rather than a floating window over the toolbar. Keeping it as a
  // child of the right rail also makes the phone surface switcher authoritative: Scenes hides
  // and reappears with Inspect instead of floating over the viewport while another tab is active.
  const editorColumn = (): HTMLElement | null => {
    const column = document.querySelector<HTMLElement>(".gx-ed-panel--right");
    if (!column || document.documentElement.dataset.gxEditor !== "visible" || column.style.display === "none") {
      return null;
    }
    return column;
  };
  const reposition = (): void => {
    const column = editorColumn();
    if (column) {
      if (panel.parentElement !== column) column.append(panel);
      panel.classList.add("gx-sb--docked");
      return;
    }
    if (panel.parentElement !== container) container.append(panel);
    panel.classList.remove("gx-sb--docked");
  };
  reposition();
  window.addEventListener("resize", reposition);
  // The editor is mounted once and toggled with inline display. Observe both its lazy arrival
  // and later enter/exit transitions without coupling this store module to PlatformEditor.
  const layoutObserver = typeof MutationObserver === "undefined" ? null : new MutationObserver(reposition);
  layoutObserver?.observe(container, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style"],
  });

  setOnline(true);
  setStatus(`Store: ${storeHost}`);
  syncFooter();
  void refresh();
  if (options.initialScene) void open(options.initialScene);
  refreshTimer = window.setInterval(() => void refresh(), REFRESH_MS);

  return {
    element: panel,
    session: () => session,
    setEnabled,
    open,
    save,
    saveAs,
    close,
    refresh,
    dispose() {
      if (disposed) return;
      disposed = true;
      enabled = false;
      sessionAuthority += 1;
      session?.stop();
      session = null;
      if (refreshTimer !== null) window.clearInterval(refreshTimer);
      if (liveTimer !== null) window.clearTimeout(liveTimer);
      layoutObserver?.disconnect();
      window.removeEventListener("resize", reposition);
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
  /* Accent tokens cascade from platform-theme's :root — no local cyan pair here. */
  --gx-text:#dbeff5;
  --gx-muted:#7fb0c0;
  --gx-field:#0b222c;
  position:fixed;top:12px;right:12px;z-index:25;width:264px;box-sizing:border-box;
  font:12px/1.45 var(--gx-font);color:var(--gx-text);
  background:var(--gx-panel);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  border:1px solid var(--gx-border);border-radius:8px;box-shadow:0 10px 34px rgba(0,10,16,.42);
  overflow:hidden;
}
.gx-sb *{box-sizing:border-box}
.gx-sb--docked{position:static;inset:auto;width:auto;z-index:auto;flex:none;background:transparent;
  backdrop-filter:none;-webkit-backdrop-filter:none;border-color:var(--gx-border-soft);box-shadow:none}
.gx-sb-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-bottom:1px solid var(--gx-border-soft)}
.gx-sb-title{display:flex;align-items:center;gap:7px;letter-spacing:.04em;text-transform:uppercase;font-size:11px}
.gx-sb-dot{width:7px;height:7px;border-radius:50%;background:#4b6572;flex:none;transition:background .2s,box-shadow .2s}
.gx-sb-dot[data-online=true]{background:#3fd39b;box-shadow:0 0 0 3px rgba(63,211,155,.16)}
.gx-sb-dot[data-online=false]{background:#e2685f;box-shadow:0 0 0 3px rgba(226,104,95,.16)}
.gx-sb-icon{background:none;border:none;color:var(--gx-muted);cursor:pointer;font:16px/1 var(--gx-font);padding:0 4px}
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
.gx-sb-empty strong{color:var(--gx-text)}
.gx-sb-empty code{font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--gx-text)}

.gx-sb-live{margin:0 5px;padding:7px 9px;border-radius:6px;background:var(--gx-accent-soft);border:1px solid var(--gx-accent-deep);color:var(--gx-text);font-size:11.5px;line-height:1.45}
.gx-sb-actor{font-weight:700;color:var(--gx-accent)}
.gx-sb-rev{color:var(--gx-muted)}
.gx-sb-flash{animation:gx-sb-pulse 1.1s ease-out}
@keyframes gx-sb-pulse{
  0%{background:var(--gx-accent-glow);border-color:var(--gx-accent)}
  100%{background:var(--gx-accent-soft);border-color:var(--gx-accent-deep)}
}

.gx-sb-foot{display:flex;gap:6px;padding:8px 5px 5px}
.gx-sb-foot button{flex:1;background:var(--gx-field);color:var(--gx-text);border:1px solid var(--gx-border);border-radius:6px;padding:6px 8px;font:inherit;cursor:pointer}
.gx-sb-foot button:hover:not(:disabled){background:var(--gx-raise);border-color:var(--gx-accent-deep)}
.gx-sb-foot button:disabled{opacity:.5;cursor:default}
.gx-sb-foot [data-action=close]{flex:none;padding:6px 9px}
.gx-sb-saveas{display:flex;gap:6px;margin:0;padding:6px 5px 0}
.gx-sb-saveas input{flex:1;min-width:0;background:var(--gx-field);border:1px solid var(--gx-border);border-radius:6px;color:var(--gx-text);font:inherit;padding:6px 8px}
.gx-sb-saveas input:focus{outline:none;border-color:var(--gx-accent)}
.gx-sb-saveas button{flex:none;background:var(--gx-field);color:var(--gx-text);border:1px solid var(--gx-border);border-radius:6px;padding:6px 9px;font:inherit;cursor:pointer}
.gx-sb-saveas button:hover{background:var(--gx-raise);border-color:var(--gx-accent-deep)}
.gx-sb-status{margin:0;padding:0 10px 9px;min-height:15px;color:var(--gx-muted);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gx-sb-status[data-tone=error]{color:#f0938b}
.gx-sb-status[data-tone=busy]{color:var(--gx-accent)}

@media (prefers-reduced-motion:reduce){.gx-sb-flash{animation:none}}
@media (max-width:640px){.gx-sb{left:12px;width:auto}}
`;
