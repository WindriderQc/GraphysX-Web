import type { GraphysXAgentWorldApi } from "./agent-world-runtime";
import { createSceneThumbnail, SHELF_THUMBNAIL_CSS } from "./shelf-thumbnails";

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
  /** One editorial spotlight above the scrolling gallery; scene data remains unchanged. */
  featuredStarter?: { id: string; eyebrow: string; badges: readonly string[] };
  /** Called after a starter is loaded, so the caller can take the showroom down and open the editor. */
  onOpen?: (starterId: string) => void;
  /** Composed archive scenes, listed above the starters because they are the recovered ones. */
  composed?: readonly ComposedSceneEntry[];
  /** Called when the ✕ dismisses the shelf without opening, so the caller can restore the front door. */
  onClose?: () => void;
};

export function mountBrowseShelf(container: HTMLElement, options: BrowseShelfOptions): () => void {
  const { api, featuredStarter, onOpen, composed = [], onClose } = options;
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

  const starters = api.starters();
  const featured = featuredStarter
    ? starters.find((starter) => starter.id === featuredStarter.id)
    : undefined;
  let featuredRow: HTMLButtonElement | null = null;

  if (featured && featuredStarter) {
    featuredRow = document.createElement("button");
    featuredRow.type = "button";
    featuredRow.className = "gx-browse-row gx-browse-row--featured";
    featuredRow.dataset.starterId = featured.id;

    const visual = document.createElement("span");
    visual.className = "gx-shelf-visual gx-browse-featured-visual";
    visual.append(createSceneThumbnail(featured.id, featured.label));

    const copy = document.createElement("span");
    copy.className = "gx-shelf-copy gx-browse-featured-copy";
    const eyebrow = document.createElement("span");
    eyebrow.className = "gx-browse-eyebrow";
    eyebrow.textContent = featuredStarter.eyebrow;
    const name = document.createElement("span");
    name.className = "gx-browse-name";
    name.textContent = featured.label;
    const badges = document.createElement("span");
    badges.className = "gx-browse-badges";
    for (const label of featuredStarter.badges) {
      const badge = document.createElement("span");
      badge.className = "gx-browse-badge";
      badge.textContent = label;
      badges.append(badge);
    }
    const summary = document.createElement("span");
    summary.className = "gx-browse-summary";
    summary.textContent = featured.summary;
    const meta = document.createElement("span");
    meta.className = "gx-browse-meta";
    meta.textContent = `${featured.entityCount} entities  ·  open in editor`;
    copy.append(eyebrow, name, badges, summary, meta);
    featuredRow.append(visual, copy);
    featuredRow.addEventListener("click", () => {
      const result = api.loadStarter(featured.id);
      if (!result.ok) {
        summary.textContent = result.error ?? "Could not open that scene";
        featuredRow?.classList.add("gx-browse-row--error");
        return;
      }
      dispose();
      onOpen?.(featured.id);
    });
  }

  // Recovered scenes first — they are the reason someone opens this shelf.
  for (const scene of composed) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "gx-browse-row";
    row.dataset.sceneId = scene.id;

    const visual = document.createElement("span");
    visual.className = "gx-shelf-visual";
    visual.append(createSceneThumbnail(scene.id, scene.label));

    const copy = document.createElement("span");
    copy.className = "gx-shelf-copy";

    const name = document.createElement("span");
    name.className = "gx-browse-name";
    name.textContent = scene.label;

    const summary = document.createElement("span");
    summary.className = "gx-browse-summary";
    summary.textContent = scene.summary;

    const meta = document.createElement("span");
    meta.className = "gx-browse-meta";
    meta.textContent = scene.meta;

    copy.append(name, summary, meta);
    row.append(visual, copy);
    row.addEventListener("click", () => {
      dispose();
      void scene.open();
    });
    list.append(row);
  }

  for (const starter of starters) {
    if (starter.id === featured?.id) continue;
    const row = document.createElement("button");
    row.type = "button";
    row.className = "gx-browse-row";
    row.dataset.starterId = starter.id;

    const visual = document.createElement("span");
    visual.className = "gx-shelf-visual";
    visual.append(createSceneThumbnail(starter.id, starter.label));

    const copy = document.createElement("span");
    copy.className = "gx-shelf-copy";

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

    copy.append(name, summary, meta);
    row.append(visual, copy);
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

  card.append(head, blurb);
  if (featuredRow) card.append(featuredRow);
  card.append(list);
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
${SHELF_THUMBNAIL_CSS}
.gx-browse{position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;
  background:var(--gx-scrim);font-family:var(--gx-font);padding:24px}
.gx-browse-card{width:min(900px,100%);max-height:86vh;display:flex;flex-direction:column;gap:12px;
  background:rgba(9,22,31,.96);border:1px solid rgba(79,208,230,.34);border-radius:14px;
  padding:20px 22px;box-shadow:0 18px 60px rgba(0,0,0,.5)}
.gx-browse-head{display:flex;align-items:center;gap:12px}
.gx-browse-head h2{margin:0;flex:1;font-size:19px;letter-spacing:.04em;color:var(--gx-ink);font-weight:700}
.gx-browse-close{background:transparent;border:1px solid rgba(120,240,208,.3);border-radius:6px;
  color:var(--gx-ink-soft);cursor:pointer;font:12px/1 var(--gx-font);padding:6px 9px}
.gx-browse-close:hover{border-color:var(--gx-accent);color:var(--gx-ink)}
.gx-browse-blurb{margin:0;color:var(--gx-ink-faint);font-size:12.5px;line-height:1.5}
.gx-browse-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;overflow-y:auto;
  padding:1px 5px 1px 1px}
.gx-browse-row{display:flex;flex-direction:column;align-items:flex-start;gap:3px;text-align:left;
  background:rgba(16,38,50,.8);border:1px solid rgba(79,208,230,.2);border-radius:10px;
  padding:7px;cursor:pointer;color:inherit;min-width:0}
.gx-browse-row:hover{background:rgba(24,56,72,.92);border-color:var(--gx-accent-edge)}
.gx-browse-row:focus-visible{outline:2px solid var(--gx-accent);outline-offset:2px}
.gx-browse-row--error{border-color:#f95f4c}
.gx-browse-name{color:var(--gx-ink);font-size:14px;font-weight:600}
.gx-browse-summary{color:var(--gx-ink-soft);font-size:12px;line-height:1.4}
.gx-browse-meta{color:var(--gx-ink-faint);font-size:11px;letter-spacing:.03em;margin-top:2px}
.gx-browse-row--featured{display:grid;grid-template-columns:minmax(250px,.92fr) minmax(0,1.08fr);gap:16px;
  padding:9px;background:linear-gradient(120deg,rgba(18,48,62,.96),rgba(12,30,42,.9));
  border-color:rgba(120,240,208,.48);box-shadow:0 10px 34px rgba(0,0,0,.2)}
.gx-browse-row--featured:hover{transform:translateY(-1px);box-shadow:0 14px 38px rgba(0,0,0,.28)}
.gx-browse-featured-copy{align-self:center;gap:7px;padding:6px 10px 6px 0}
.gx-browse-featured-visual .gx-shelf-thumb{aspect-ratio:16/7.6}
.gx-browse-eyebrow{color:var(--gx-life);font-size:9px;font-weight:750;letter-spacing:.18em}
.gx-browse-row--featured .gx-browse-name{font-size:18px;letter-spacing:.015em}
.gx-browse-badges{display:flex;flex-wrap:wrap;gap:6px}
.gx-browse-badge{padding:3px 7px;border:1px solid rgba(79,208,230,.3);border-radius:999px;
  background:rgba(79,208,230,.08);color:var(--gx-accent);font-size:9px;font-weight:650;letter-spacing:.05em}
@media (max-width:640px){.gx-browse{padding:12px}.gx-browse-card{padding:16px;max-height:92vh}
  .gx-browse-list{grid-template-columns:1fr}.gx-browse-summary{display:none}
  .gx-browse-row--featured{grid-template-columns:1fr;gap:8px}.gx-browse-featured-copy{padding:2px 4px 5px}
  .gx-browse-row--featured .gx-browse-summary{display:block}}
@media (prefers-reduced-motion:reduce){.gx-browse-row--featured:hover{transform:none}}
`;
