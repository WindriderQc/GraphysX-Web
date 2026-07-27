import type { GraphysXAgentWorldApi } from "./agent-world-runtime";
import { createLevelThumbnail, SHELF_THUMBNAIL_CSS } from "./shelf-thumbnails";

/**
 * The BallZ title screen — the game's own front door, one level up from a bare list of
 * levels. The Games shelf shows ONE branded BallZ card; clicking it opens this menu:
 * the title, the pitch, Start Game (the first course), and the course roster. Picking a
 * course drops into play mode, where the play layer runs the 3 · 2 · 1 · GO start.
 *
 * A menu and not a scene, deliberately: the archive's BallZ launched through GDI dialogs
 * around the TV3D window, so a DOM overlay IS the faithful shape of "the game's menu" —
 * and it costs nothing per frame once dismissed.
 */

/** The courses that make up the game, in play order. Ids resolve against the level library. */
const BALLZ_COURSES = [
  { id: "first-course", title: "First Course", tagline: "learn the arrow — rings, ice, a hazard" },
  { id: "archive-ballz-level1", title: "Level 1 — T Course", tagline: "the 2011 archive course · 20 rings · 3 tours" },
  { id: "archive-ballz-level2", title: "Level 2 — Z Maze", tagline: "the 2011 archive course · 3 tours" },
] as const;

/** The level ids the shelf should NOT list generically — they live inside the game's menu. */
export const BALLZ_MENU_LEVEL_IDS: readonly string[] = BALLZ_COURSES.map((course) => course.id);

export type BallzMenuOptions = {
  api: GraphysXAgentWorldApi;
  /** Called after a course is materialised; the caller tears the front door down. */
  onPlay?: (levelId: string) => void;
  /** Called when the menu closes without playing. */
  onClose?: () => void;
};

export function mountBallzMenu(container: HTMLElement, options: BallzMenuOptions): () => void {
  const { api, onPlay, onClose } = options;
  injectStyleOnce();

  const overlay = document.createElement("div");
  overlay.className = "gx-bzmenu";

  const card = document.createElement("div");
  card.className = "gx-bzmenu-card";

  const mark = document.createElement("div");
  mark.className = "gx-bzmenu-mark";
  mark.textContent = "BallZ";
  const sub = document.createElement("div");
  sub.className = "gx-bzmenu-sub";
  sub.textContent = "the revival · point the fire arrow, roll the caged ball, take every ring, three tours to the finish";

  const start = document.createElement("button");
  start.type = "button";
  start.className = "gx-bzmenu-start";
  start.textContent = "▶ Start Game";

  const roster = document.createElement("div");
  roster.className = "gx-bzmenu-roster";

  const play = (levelId: string, feedback: HTMLElement): void => {
    const result = api.levels.play(levelId);
    if (!result.ok) {
      feedback.textContent = result.error ?? "Could not start the course";
      return;
    }
    dispose();
    onPlay?.(levelId);
  };
  start.addEventListener("click", () => play(BALLZ_COURSES[0].id, sub));

  for (const course of BALLZ_COURSES) {
    const level = api.levels.get(course.id);
    if (!level) continue; // an unseeded archive course is absent, not broken
    const row = document.createElement("button");
    row.type = "button";
    row.className = "gx-bzmenu-course";
    row.dataset.levelId = course.id;
    const visual = document.createElement("span");
    visual.className = "gx-bzmenu-visual";
    visual.append(createLevelThumbnail(level));
    const copy = document.createElement("span");
    copy.className = "gx-bzmenu-copy";
    const name = document.createElement("span");
    name.className = "gx-bzmenu-name";
    name.textContent = course.title;
    const meta = document.createElement("span");
    meta.className = "gx-bzmenu-meta";
    meta.textContent = course.tagline;
    copy.append(name, meta);
    row.append(visual, copy);
    row.addEventListener("click", () => play(course.id, meta));
    roster.append(row);
  }

  const back = document.createElement("button");
  back.type = "button";
  back.className = "gx-bzmenu-back";
  back.textContent = "← Back";
  back.addEventListener("click", () => {
    dispose();
    onClose?.();
  });

  card.append(mark, sub, start, roster, back);
  overlay.append(card);
  container.append(overlay);

  const dispose = (): void => {
    overlay.remove();
  };
  return dispose;
}

const STYLE_ID = "gx-ballz-menu-css";

function injectStyleOnce(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = MENU_CSS;
  document.head.append(style);
}

const MENU_CSS = `
${SHELF_THUMBNAIL_CSS}
.gx-bzmenu{position:fixed;inset:0;z-index:41;display:flex;align-items:center;justify-content:center;
  background:var(--gx-scrim);font-family:var(--gx-font);padding:24px}
.gx-bzmenu-card{width:min(560px,100%);max-height:88vh;overflow-y:auto;display:flex;flex-direction:column;
  align-items:center;gap:14px;padding:34px 30px 24px;border-radius:18px;text-align:center;
  background:
    radial-gradient(120% 90% at 50% 0%,rgba(255,122,26,.16),rgba(9,22,31,0) 55%),
    rgba(9,22,31,.97);
  border:1px solid rgba(255,138,54,.4);box-shadow:0 22px 70px rgba(0,0,0,.55)}
/* The fire-gradient wordmark: yellow into arrow-red, the FireArrow texture as typography. */
.gx-bzmenu-mark{font:900 64px/1 var(--gx-font);letter-spacing:.04em;
  background:linear-gradient(180deg,#ffe14d 0%,#ff9a2a 55%,#ff2e17 100%);
  -webkit-background-clip:text;background-clip:text;color:transparent;
  filter:drop-shadow(0 4px 22px rgba(255,110,26,.45))}
.gx-bzmenu-sub{color:var(--gx-ink-faint);font-size:12.5px;letter-spacing:.05em;line-height:1.55;max-width:420px}
.gx-bzmenu-start{cursor:pointer;margin-top:2px;border-radius:12px;padding:13px 34px;
  font:800 17px var(--gx-font);letter-spacing:.06em;color:#1b0d02;
  background:linear-gradient(180deg,#ffd24d,#ff8a2a);border:1px solid #ffb054;
  box-shadow:0 6px 26px rgba(255,138,42,.35)}
.gx-bzmenu-start:hover{filter:brightness(1.08)}
.gx-bzmenu-roster{display:flex;flex-direction:column;gap:8px;width:100%;margin-top:6px}
.gx-bzmenu-course{display:flex;align-items:center;gap:12px;text-align:left;cursor:pointer;
  background:rgba(16,34,46,.85);border:1px solid rgba(79,208,230,.22);border-radius:10px;padding:8px 12px 8px 8px}
.gx-bzmenu-course:hover{border-color:var(--gx-accent);background:rgba(22,46,60,.92)}
.gx-bzmenu-visual{flex:0 0 84px;height:56px;border-radius:6px;overflow:hidden;display:flex}
.gx-bzmenu-visual canvas{width:100%;height:100%;object-fit:cover}
.gx-bzmenu-copy{display:flex;flex-direction:column;gap:3px;min-width:0}
.gx-bzmenu-name{color:var(--gx-ink);font-size:13.5px;font-weight:700;letter-spacing:.03em}
.gx-bzmenu-meta{color:var(--gx-ink-faint);font-size:11px;letter-spacing:.04em}
.gx-bzmenu-back{margin-top:4px;background:transparent;border:1px solid rgba(120,240,208,.3);border-radius:8px;
  color:var(--gx-ink-soft);cursor:pointer;font:12px/1 var(--gx-font);padding:8px 16px}
.gx-bzmenu-back:hover{border-color:var(--gx-accent);color:var(--gx-ink)}
`;
