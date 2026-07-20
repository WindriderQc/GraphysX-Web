import type { GraphysXAgentWorldApi } from "./agent-world-runtime";

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

export type GamesShelfOptions = {
  api: GraphysXAgentWorldApi;
  /** Called after a level is materialised, so the caller can take the showroom down with it. */
  onPlay?: (levelId: string) => void;
};

export function mountGamesShelf(container: HTMLElement, options: GamesShelfOptions): () => void {
  const { api, onPlay } = options;
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

  // Read the library rather than a curated manifest: anything a person or an agent authors
  // shows up here without a second registration step.
  for (const summary of api.levels.list()) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "gx-shelf-row";
    row.dataset.levelId = summary.id;

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

    row.append(name, meta);
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
  close.addEventListener("click", () => dispose());
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
.gx-shelf{position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;
  background:var(--gx-scrim);font-family:var(--gx-font);padding:24px}
.gx-shelf-card{width:min(520px,100%);max-height:80vh;display:flex;flex-direction:column;gap:12px;
  background:rgba(9,22,31,.96);border:1px solid rgba(79,208,230,.34);border-radius:14px;
  padding:20px 22px;box-shadow:0 18px 60px rgba(0,0,0,.5)}
.gx-shelf-head{display:flex;align-items:center;gap:12px}
.gx-shelf-head h2{margin:0;flex:1;font-size:19px;letter-spacing:.04em;color:var(--gx-ink);font-weight:700}
.gx-shelf-close{background:transparent;border:1px solid rgba(120,240,208,.3);border-radius:6px;
  color:#9fd6e4;cursor:pointer;font:12px/1 var(--gx-font);padding:6px 9px}
.gx-shelf-close:hover{border-color:var(--gx-accent);color:var(--gx-ink)}
.gx-shelf-blurb{margin:0;color:#8fb9c7;font-size:12.5px;line-height:1.5}
.gx-shelf-list{display:flex;flex-direction:column;gap:8px;overflow-y:auto}
.gx-shelf-row{display:flex;flex-direction:column;align-items:flex-start;gap:3px;text-align:left;
  background:rgba(16,38,50,.8);border:1px solid rgba(79,208,230,.2);border-radius:10px;
  padding:11px 14px;cursor:pointer;color:inherit}
.gx-shelf-row:hover{background:rgba(24,56,72,.92);border-color:var(--gx-accent-edge)}
.gx-shelf-row--error{border-color:#f95f4c}
.gx-shelf-name{color:var(--gx-ink);font-size:14px;font-weight:600}
.gx-shelf-meta{color:#7fa9b9;font-size:11.5px;letter-spacing:.03em}
`;
