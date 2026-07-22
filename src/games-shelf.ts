import type { GraphysXAgentWorldApi } from "./agent-world-runtime";
import { createLevelThumbnail, createSceneThumbnail, SHELF_THUMBNAIL_CSS } from "./shelf-thumbnails";

/**
 * The "Games & Playgrounds" front-door shelf.
 *
 * §5 wants three destinations off the showroom — Scene Editor, Browse Scenes, Games & Apps —
 * and until now a playable level was reachable only by opening the editor, opening the Levels
 * workbench and pressing Play. Playing was a side door off authoring, which is precisely the
 * confusion the mode split was meant to end.
 *
 * The shelf is a list, not a launcher framework: every row is `api.levels.play(id)`, the same
 * call the workbench button and an agent both make. It adds no concept — the host already
 * switches to play mode when a world containing a player arrives.
 */

/**
 * One hand-authored course, seeded on first visit so the shelf opens with something worth
 * playing rather than only the 11x11 fallback starter.
 *
 * Authored as ASCII because that is the level vocabulary: it goes through `importAscii` like
 * any level a person paints, lands in the same library, and can be opened and edited in the
 * workbench afterwards. Nothing here is a special built-in.
 *
 * No `^` fire tile on purpose — a launcher throws the ball upward and these courses have no
 * ceiling, so it is a good tile in a level designed around it and a way to lose the ball here.
 */
const FIRST_COURSE = {
  id: "first-course",
  label: "First Course",
  cellSize: 2.6,
  rows: [
    "#############",
    "#S....#.....#",
    "#.###.#.###.#",
    "#.#o#.....#o#",
    "#.#.#####.#.#",
    "#.#.....~.#.#",
    "#.###.#.###.#",
    "#...!.#.....#",
    "#.#####.###.#",
    "#....o..#..F#",
    "#############",
  ],
};

/**
 * A course composed as a whole scene rather than a grid level — the archive ports. The
 * shelf stays a list: a composed row's `play` does its own `api.create`, and the host
 * enters play mode the same way it does for a materialised level, keyed on content.
 */
export type GamesShelfComposedRow = {
  id: string;
  label: string;
  meta: string;
  play: () => void | Promise<void>;
};

export type GamesShelfOptions = {
  api: GraphysXAgentWorldApi;
  /** Archive courses and other composed playables, listed above the level library. */
  composed?: GamesShelfComposedRow[];
  /** Called after a level is materialised, so the caller can take the showroom down with it. */
  onPlay?: (levelId: string) => void;
  /** Called when the ✕ dismisses the shelf without playing, so the caller can restore the front door. */
  onClose?: () => void;
};

export function mountGamesShelf(container: HTMLElement, options: GamesShelfOptions): () => void {
  const { api, composed, onPlay, onClose } = options;
  injectStyleOnce();

  // Seed once. A returning visitor who edited or deleted this course keeps their version —
  // re-seeding over their edits would make the library feel like it fights them.
  if (!api.levels.get(FIRST_COURSE.id)) api.levels.importAscii(FIRST_COURSE);

  const overlay = document.createElement("div");
  overlay.className = "gx-shelf";

  const card = document.createElement("div");
  card.className = "gx-shelf-card";

  const head = document.createElement("div");
  head.className = "gx-shelf-head";
  const title = document.createElement("h2");
  title.textContent = "Games & Playgrounds";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "gx-shelf-close";
  close.textContent = "✕";
  close.title = "Back to the showroom";
  head.append(title, close);

  const blurb = document.createElement("p");
  blurb.className = "gx-shelf-blurb";
  blurb.textContent = "Levels authored in the level workbench, played on the same runtime. Arrow keys to roll.";

  const list = document.createElement("div");
  list.className = "gx-shelf-list";

  for (const course of composed ?? []) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "gx-shelf-row";
    row.dataset.courseId = course.id;
    const visual = document.createElement("span");
    visual.className = "gx-shelf-visual";
    visual.append(createSceneThumbnail(course.id, course.label));
    const copy = document.createElement("span");
    copy.className = "gx-shelf-copy";
    const name = document.createElement("span");
    name.className = "gx-shelf-name";
    name.textContent = course.label;
    const meta = document.createElement("span");
    meta.className = "gx-shelf-meta";
    meta.textContent = course.meta;
    copy.append(name, meta);
    row.append(visual, copy);
    row.addEventListener("click", async () => {
      if (row.disabled) return;
      row.disabled = true;
      row.classList.add("gx-shelf-row--busy");
      const originalMeta = meta.textContent;
      meta.textContent = "Loading course…";
      try {
        await course.play();
        dispose();
        onPlay?.(course.id);
      } catch (error) {
        meta.textContent = error instanceof Error ? error.message : String(error);
        row.classList.add("gx-shelf-row--error");
        row.disabled = false;
      } finally {
        row.classList.remove("gx-shelf-row--busy");
        if (row.isConnected && !row.classList.contains("gx-shelf-row--error")) {
          meta.textContent = originalMeta;
          row.disabled = false;
        }
      }
    });
    list.append(row);
  }

  // Read the library rather than a curated manifest: anything a person or an agent authors
  // shows up here without a second registration step.
  for (const summary of api.levels.list()) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "gx-shelf-row";
    row.dataset.levelId = summary.id;

    const visual = document.createElement("span");
    visual.className = "gx-shelf-visual";
    const level = api.levels.get(summary.id);
    if (level) visual.append(createLevelThumbnail(level));
    const copy = document.createElement("span");
    copy.className = "gx-shelf-copy";

    const name = document.createElement("span");
    name.className = "gx-shelf-name";
    name.textContent = summary.label || summary.id;

    // What the level actually contains, so a row is informative before you commit to it —
    // and so a layout with no start tile is visibly a playground rather than a course.
    const rings = summary.counts?.ring ?? 0;
    const playable = (summary.counts?.start ?? 0) > 0;
    const meta = document.createElement("span");
    meta.className = "gx-shelf-meta";
    meta.textContent = [
      `${summary.width}×${summary.height}`,
      rings > 0 ? `${rings} ring${rings === 1 ? "" : "s"}` : null,
      (summary.counts?.finish ?? 0) > 0 ? "finish" : null,
      playable ? null : "no start — layout only",
    ].filter(Boolean).join("  ·  ");

    copy.append(name, meta);
    row.append(visual, copy);
    row.addEventListener("click", () => {
      const result = api.levels.play(summary.id);
      if (!result.ok) {
        meta.textContent = result.error ?? "Could not play that level";
        row.classList.add("gx-shelf-row--error");
        return;
      }
      dispose();
      onPlay?.(summary.id);
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

const STYLE_ID = "gx-games-shelf-css";

function injectStyleOnce(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = SHELF_CSS;
  document.head.append(style);
}

const SHELF_CSS = `
${SHELF_THUMBNAIL_CSS}
.gx-shelf{position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;
  background:var(--gx-scrim);font-family:var(--gx-font);padding:24px}
.gx-shelf-card{width:min(900px,100%);max-height:86vh;display:flex;flex-direction:column;gap:12px;
  background:rgba(9,22,31,.96);border:1px solid rgba(79,208,230,.34);border-radius:14px;
  padding:20px 22px;box-shadow:0 18px 60px rgba(0,0,0,.5)}
.gx-shelf-head{display:flex;align-items:center;gap:12px}
.gx-shelf-head h2{margin:0;flex:1;font-size:19px;letter-spacing:.04em;color:var(--gx-ink);font-weight:700}
.gx-shelf-close{background:transparent;border:1px solid rgba(120,240,208,.3);border-radius:6px;
  color:var(--gx-ink-soft);cursor:pointer;font:12px/1 var(--gx-font);padding:6px 9px}
.gx-shelf-close:hover{border-color:var(--gx-accent);color:var(--gx-ink)}
.gx-shelf-blurb{margin:0;color:var(--gx-ink-faint);font-size:12.5px;line-height:1.5}
.gx-shelf-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;overflow-y:auto;
  padding:1px 5px 1px 1px}
.gx-shelf-row{display:flex;flex-direction:column;align-items:flex-start;gap:3px;text-align:left;
  background:rgba(16,38,50,.8);border:1px solid rgba(79,208,230,.2);border-radius:10px;
  padding:7px;cursor:pointer;color:inherit;min-width:0}
.gx-shelf-row:hover{background:rgba(24,56,72,.92);border-color:var(--gx-accent-edge)}
.gx-shelf-row--error{border-color:#f95f4c}
.gx-shelf-row--busy{cursor:progress;opacity:.72}
.gx-shelf-row:focus-visible{outline:2px solid var(--gx-accent);outline-offset:2px}
.gx-shelf-name{color:var(--gx-ink);font-size:14px;font-weight:600}
.gx-shelf-meta{color:var(--gx-ink-faint);font-size:11.5px;letter-spacing:.03em}
@media (max-width:640px){.gx-shelf{padding:12px}.gx-shelf-card{padding:16px;max-height:92vh}
  .gx-shelf-list{grid-template-columns:1fr}}
`;
