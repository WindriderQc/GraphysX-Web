import type { GraphysXAgentWorldApi } from "./agent-world-runtime";

/**
 * "Browse Scenes" — §5's third front-door destination, beside Scene Editor and Games.
 *
 * It lists the curated starter scenes (`api.starters()`) and opens the chosen one for editing.
 * These are real, complete `graphysx.agent-world/v2` scenes — the same ones an agent loads with
 * `api.loadStarter` — so "load an existing 3D scene" is exactly what a row does, no store or
 * network required (the production deploy is static). The scene-store browser (`scene-browser.ts`)
 * remains the path for *saved* scenes once a store is reachable; this is the always-available
 * gallery of what ships.
 *
 * Sibling to `games-shelf.ts` on purpose: same modal-over-the-showroom shape, different verb.
 * Games rows enter *play* mode with a ball; Browse rows enter the *editor* with a scene to work
 * on. Keeping them as two focused modules rather than one parameterised shelf keeps each row's
 * copy honest to what clicking it does.
 */

/**
 * A curated scene that is *composed* rather than loaded from a starter definition — the recovered
 * archive scenes are built by a function that spawns their entities, so they cannot be a static
 * starter object. Supplied by the caller rather than imported here, which keeps this shelf from
 * having to know what a garage is.
 */
export type ComposedSceneEntry = {
  id: string;
  label: string;
  summary: string;
  meta: string;
  open: () => void | Promise<void>;
};

export type BrowseShelfOptions = {
  api: GraphysXAgentWorldApi;
  /** Called after a starter is loaded, so the caller can take the showroom down and open the editor. */
  onOpen?: (starterId: string) => void;
  /** Composed archive scenes, listed above the starters because they are the recovered ones. */
  composed?: readonly ComposedSceneEntry[];
  /** Called when the ✕ dismisses the shelf without opening, so the caller can restore the front door. */
  onClose?: () => void;
};

export function mountBrowseShelf(container: HTMLElement, options: BrowseShelfOptions): () => void {
  const { api, onOpen, composed = [], onClose } = options;
  injectStyleOnce();

  const overlay = document.createElement("div");
  overlay.className = "gx-browse";

  const card = document.createElement("div");
  card.className = "gx-browse-card";

  const head = document.createElement("div");
  head.className = "gx-browse-head";
  const title = document.createElement("h2");
  title.textContent = "Browse Scenes";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "gx-browse-close";
  close.textContent = "✕";
  close.title = "Back to the showroom";
  head.append(title, close);

  const blurb = document.createElement("p");
  blurb.className = "gx-browse-blurb";
  blurb.textContent = "Curated scenes on the platform runtime. Open one to explore and edit it.";

  const list = document.createElement("div");
  list.className = "gx-browse-list";

  // Recovered scenes first — they are the reason someone opens this shelf.
  for (const scene of composed) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "gx-browse-row";
    row.dataset.sceneId = scene.id;

    const name = document.createElement("span");
    name.className = "gx-browse-name";
    name.textContent = scene.label;

    const summary = document.createElement("span");
    summary.className = "gx-browse-summary";
    summary.textContent = scene.summary;

    const meta = document.createElement("span");
    meta.className = "gx-browse-meta";
    meta.textContent = scene.meta;

    row.append(name, summary, meta);
    row.addEventListener("click", () => {
      dispose();
      void scene.open();
    });
    list.append(row);
  }

  for (const starter of api.starters()) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "gx-browse-row";
    row.dataset.starterId = starter.id;

    const name = document.createElement("span");
    name.className = "gx-browse-name";
    name.textContent = starter.label;

    const summary = document.createElement("span");
    summary.className = "gx-browse-summary";
    summary.textContent = starter.summary;

    const meta = document.createElement("span");
    meta.className = "gx-browse-meta";
    meta.textContent = [
      `${starter.entityCount} entities`,
      starter.prefabCount > 0 ? `${starter.prefabCount} prefabs` : null,
    ].filter(Boolean).join("  ·  ");

    row.append(name, summary, meta);
    row.addEventListener("click", () => {
      const result = api.loadStarter(starter.id);
      if (!result.ok) {
        summary.textContent = result.error ?? "Could not open that scene";
        row.classList.add("gx-browse-row--error");
        return;
      }
      dispose();
      onOpen?.(starter.id);
    });
    list.append(row);
  }

  card.append(head, blurb, list);
  overlay.append(card);
  container.append(overlay);

  const dispose = (): void => {
    overlay.remove();
  };
  close.addEventListener("click", () => {
    dispose();
    onClose?.();
  });
  return dispose;
}

const STYLE_ID = "gx-browse-shelf-css";

function injectStyleOnce(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = BROWSE_CSS;
  document.head.append(style);
}

const BROWSE_CSS = `
.gx-browse{position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;
  background:var(--gx-scrim);font-family:var(--gx-font);padding:24px}
.gx-browse-card{width:min(560px,100%);max-height:80vh;display:flex;flex-direction:column;gap:12px;
  background:rgba(9,22,31,.96);border:1px solid rgba(79,208,230,.34);border-radius:14px;
  padding:20px 22px;box-shadow:0 18px 60px rgba(0,0,0,.5)}
.gx-browse-head{display:flex;align-items:center;gap:12px}
.gx-browse-head h2{margin:0;flex:1;font-size:19px;letter-spacing:.04em;color:var(--gx-ink);font-weight:700}
.gx-browse-close{background:transparent;border:1px solid rgba(120,240,208,.3);border-radius:6px;
  color:var(--gx-ink-soft);cursor:pointer;font:12px/1 var(--gx-font);padding:6px 9px}
.gx-browse-close:hover{border-color:var(--gx-accent);color:var(--gx-ink)}
.gx-browse-blurb{margin:0;color:var(--gx-ink-faint);font-size:12.5px;line-height:1.5}
.gx-browse-list{display:flex;flex-direction:column;gap:8px;overflow-y:auto}
.gx-browse-row{display:flex;flex-direction:column;align-items:flex-start;gap:3px;text-align:left;
  background:rgba(16,38,50,.8);border:1px solid rgba(79,208,230,.2);border-radius:10px;
  padding:12px 15px;cursor:pointer;color:inherit}
.gx-browse-row:hover{background:rgba(24,56,72,.92);border-color:var(--gx-accent-edge)}
.gx-browse-row--error{border-color:#f95f4c}
.gx-browse-name{color:var(--gx-ink);font-size:14px;font-weight:600}
.gx-browse-summary{color:var(--gx-ink-soft);font-size:12px;line-height:1.4}
.gx-browse-meta{color:var(--gx-ink-faint);font-size:11px;letter-spacing:.03em;margin-top:2px}
`;
