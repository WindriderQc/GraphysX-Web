import type { GraphysXAgentWorldApi } from "./agent-world-runtime";
import { createLevelThumbnail, createSceneThumbnail, SHELF_THUMBNAIL_CSS } from "./shelf-thumbnails";
import { BALLZ_MENU_LEVEL_IDS, mountBallzMenu } from "./ballz-menu";
import { mountArchiveCup, type ArchiveCupCourse } from "./archive-cup";

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
  /** Ordered campaign rounds. When present the shelf promotes them as the Archive Cup. */
  archiveCup?: ArchiveCupCourse[];
  /** Return from a campaign race directly to its refreshed standings. */
  openArchiveCup?: boolean;
  /** Called after a level is materialised, so the caller can take the showroom down with it. */
  onPlay?: (levelId: string) => void;
  /** Called when the ✕ dismisses the shelf without playing, so the caller can restore the front door. */
  onClose?: () => void;
};

export function mountGamesShelf(container: HTMLElement, options: GamesShelfOptions): () => void {
  const { api, composed, archiveCup, openArchiveCup, onPlay, onClose } = options;
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

  const openCup = (): void => {
    if (!archiveCup?.length) return;
    mountArchiveCup(container, {
      courses: archiveCup,
      onPlay: (course) => {
        dispose();
        onPlay?.(course.id);
      },
    });
  };

  if (archiveCup?.length) {
    const cup = document.createElement("button");
    cup.type = "button";
    cup.className = "gx-shelf-cup";
    cup.dataset.gameId = "archive-cup";
    const cupMark = document.createElement("span");
    cupMark.className = "gx-shelf-cup-mark";
    cupMark.textContent = "Archive Cup";
    const cupCopy = document.createElement("span");
    cupCopy.className = "gx-shelf-hero-copy";
    cupCopy.textContent = "nine recovered courses · persistent unlocks · medals · personal ghosts";
    const cupCta = document.createElement("span");
    cupCta.className = "gx-shelf-cup-cta";
    cupCta.textContent = "▶ Tour";
    cup.append(cupMark, cupCopy, cupCta);
    cup.addEventListener("click", openCup);
    list.append(cup);
  }

  // THE GAME gets a hero card, not a bare level row. "First Course" as a top-level button
  // read as a test fixture; BallZ is a title, and clicking it opens the game's own menu
  // (title screen, Start Game, the course roster). The shelf's generic level list below
  // excludes the game's courses so they are not listed twice.
  const hero = document.createElement("button");
  hero.type = "button";
  hero.className = "gx-shelf-hero";
  hero.dataset.gameId = "ballz";
  const heroMark = document.createElement("span");
  heroMark.className = "gx-shelf-hero-mark";
  heroMark.textContent = "BallZ";
  const heroCopy = document.createElement("span");
  heroCopy.className = "gx-shelf-hero-copy";
  heroCopy.textContent = "the revival — fire arrow, caged ball, every ring, three tours";
  const heroCta = document.createElement("span");
  heroCta.className = "gx-shelf-hero-cta";
  heroCta.textContent = "▶ Play";
  hero.append(heroMark, heroCopy, heroCta);
  hero.addEventListener("click", () => {
    mountBallzMenu(container, {
      api,
      onPlay: (levelId) => {
        dispose();
        onPlay?.(levelId);
      },
      // Back from the title screen lands on the shelf, which never went away.
    });
  });
  list.append(hero);

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
    if (BALLZ_MENU_LEVEL_IDS.includes(summary.id)) continue; // listed inside the BallZ menu
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
  if (openArchiveCup) queueMicrotask(openCup);
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
.gx-shelf-hero{grid-column:1 / -1;display:flex;align-items:center;gap:16px;cursor:pointer;text-align:left;
  padding:16px 20px;border-radius:12px;border:1px solid rgba(255,138,54,.45);
  background:
    radial-gradient(130% 160% at 8% 20%,rgba(255,122,26,.28),rgba(9,22,31,0) 52%),
    linear-gradient(100deg,rgba(38,20,8,.92),rgba(16,32,44,.92));
  box-shadow:0 8px 30px rgba(255,110,26,.14)}
.gx-shelf-hero:hover{border-color:#ffb054;box-shadow:0 10px 36px rgba(255,110,26,.28)}
.gx-shelf-cup{grid-column:1 / -1;display:flex;align-items:center;gap:16px;cursor:pointer;text-align:left;padding:16px 20px;
  border-radius:12px;border:1px solid rgba(112,239,255,.42);background:radial-gradient(120% 160% at 8% 20%,rgba(52,191,190,.25),transparent 53%),linear-gradient(100deg,rgba(7,37,44,.96),rgba(14,27,39,.94));box-shadow:0 8px 30px rgba(52,191,190,.12)}
.gx-shelf-cup:hover{border-color:#86f3de;box-shadow:0 10px 36px rgba(52,191,190,.24)}
.gx-shelf-cup-mark{font:850 25px/1 var(--gx-font);letter-spacing:.03em;color:#86f3de;text-shadow:0 0 22px rgba(112,239,255,.36)}
.gx-shelf-cup-cta{color:#031216;font:800 13px var(--gx-font);letter-spacing:.06em;padding:9px 18px;border-radius:9px;background:linear-gradient(180deg,#8af5d7,#48c7c4);box-shadow:0 4px 18px rgba(72,199,196,.26)}
.gx-shelf-hero-mark{font:900 30px/1 var(--gx-font);letter-spacing:.04em;
  background:linear-gradient(180deg,#ffe14d,#ff9a2a 55%,#ff2e17);
  -webkit-background-clip:text;background-clip:text;color:transparent;
  filter:drop-shadow(0 2px 12px rgba(255,110,26,.4))}
.gx-shelf-hero-copy{flex:1;color:var(--gx-ink-soft);font-size:12px;letter-spacing:.05em;line-height:1.4}
.gx-shelf-hero-cta{color:#1b0d02;font:800 13px var(--gx-font);letter-spacing:.06em;padding:9px 18px;border-radius:9px;
  background:linear-gradient(180deg,#ffd24d,#ff8a2a);box-shadow:0 4px 18px rgba(255,138,42,.3)}
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
