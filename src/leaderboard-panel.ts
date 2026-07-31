// The leaderboard strip inside the win panel.
//
// Built with `textContent` throughout — a label on this board is a string another player
// chose, and it never passes through `innerHTML`. The same rule the existing score row
// follows, for the same reason.
//
// The trust line is not decoration. These times are client-attested: validated for shape,
// consistency and plausibility, never replayed. The board says so, in the panel, every time.
// Deleting that line would be a product claim, not a style change.

import { formatMs, type Leaderboard, type LeaderboardEntry, TRUST_LABEL } from "./results-client";

const PANEL_CSS = `
.gx-lb {
  display: flex; flex-direction: column; gap: 6px; margin-top: 10px; width: 100%;
  /* Explicit, not inherited. Relying on the parent's colour made this legible in exactly one
     mount point: rendered anywhere else it inherited the document's black and painted black
     names on a dark panel — text that is present, correct, accessible to a screen reader, and
     invisible. Twenty-three green assertions and one screenshot disagreed; the screenshot was
     right. The product token wins where it exists, so the win panel's theme still drives. */
  color: var(--gx-text, #e9eef5);
}
.gx-lb-head { display: flex; align-items: baseline; gap: 8px; }
.gx-lb-title { font: 600 10px/1.4 var(--gx-font, inherit); letter-spacing: .14em; text-transform: uppercase; opacity: .72; }
.gx-lb-count { font-size: 10px; opacity: .55; margin-left: auto; }
.gx-lb-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.gx-lb-row { display: flex; align-items: baseline; gap: 8px; padding: 3px 6px; border-radius: 5px;
  background: rgba(255,255,255,.05); font-size: 12px; }
.gx-lb-row[data-you="true"] { background: rgba(125,211,252,.16); }
.gx-lb-rank { min-width: 1.6em; opacity: .6; font-variant-numeric: tabular-nums; }
.gx-lb-who { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gx-lb-medal { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; opacity: .7; }
.gx-lb-time { margin-left: auto; font-variant-numeric: tabular-nums; }
.gx-lb-race { font: inherit; font-size: 10px; color: inherit; background: rgba(255,255,255,.1);
  border: 1px solid rgba(255,255,255,.18); border-radius: 4px; padding: 1px 6px; cursor: pointer; }
.gx-lb-race:hover { background: rgba(255,255,255,.18); }
.gx-lb-race:focus-visible { outline: 2px solid #7dd3fc; outline-offset: 1px; }
.gx-lb-trust { font-size: 10px; opacity: .6; margin: 2px 0 0; }
.gx-lb-empty { font-size: 11px; opacity: .6; margin: 0; }
`;

let stylesInstalled = false;

function installStyles(root: HTMLElement): void {
  if (stylesInstalled) return;
  const style = document.createElement("style");
  style.textContent = PANEL_CSS;
  root.ownerDocument.head.append(style);
  stylesInstalled = true;
}

export type LeaderboardPanelOptions = {
  /** Which row is the local player, so it can be marked. */
  actorId: string;
  /** Offered per entry that has a shareable ghost. Absent means no race buttons. */
  onRaceGhost?: (entry: LeaderboardEntry) => void;
};

/**
 * Renders a board. Returns null when there is nothing worth showing — an empty board is
 * noise on a win screen, not information.
 */
export function buildLeaderboardPanel(
  board: Leaderboard | null,
  options: LeaderboardPanelOptions,
): HTMLElement | null {
  if (!board || board.entries.length === 0) return null;

  const root = document.createElement("section");
  root.className = "gx-lb";
  root.setAttribute("aria-label", "Course leaderboard");
  installStyles(root);

  const head = document.createElement("div");
  head.className = "gx-lb-head";
  const title = document.createElement("span");
  title.className = "gx-lb-title";
  title.textContent = "Leaderboard";
  const count = document.createElement("span");
  count.className = "gx-lb-count";
  count.textContent = board.total > board.entries.length
    ? `top ${board.entries.length} of ${board.total}`
    : `${board.total} ${board.total === 1 ? "time" : "times"}`;
  head.append(title, count);

  const list = document.createElement("ol");
  list.className = "gx-lb-list";
  for (const entry of board.entries) {
    const row = document.createElement("li");
    row.className = "gx-lb-row";
    row.dataset.you = String(entry.actorId === options.actorId);
    row.dataset.actor = entry.actorId;

    const rank = document.createElement("span");
    rank.className = "gx-lb-rank";
    rank.textContent = `${entry.rank}.`;

    const who = document.createElement("span");
    who.className = "gx-lb-who";
    who.textContent = entry.label;

    row.append(rank, who);

    if (entry.medal) {
      const medal = document.createElement("span");
      medal.className = "gx-lb-medal";
      medal.textContent = entry.medal;
      row.append(medal);
    }

    const time = document.createElement("span");
    time.className = "gx-lb-time";
    time.textContent = formatMs(entry.bestMs);
    row.append(time);

    // Racing your own ghost is what the personal ghost already does; offering it here would
    // be a second button for the same thing.
    if (entry.hasGhost && options.onRaceGhost && entry.actorId !== options.actorId) {
      const race = document.createElement("button");
      race.type = "button";
      race.className = "gx-lb-race";
      race.textContent = "Race";
      race.setAttribute("aria-label", `Race ${entry.label}'s ghost`);
      race.addEventListener("click", () => options.onRaceGhost?.(entry));
      row.append(race);
    }

    row.setAttribute("aria-label",
      `${entry.rank}. ${entry.label}, ${formatMs(entry.bestMs)}${entry.medal ? `, ${entry.medal}` : ""}`
      + `${entry.actorId === options.actorId ? ", you" : ""}`);
    list.append(row);
  }

  const trust = document.createElement("p");
  trust.className = "gx-lb-trust";
  trust.textContent = TRUST_LABEL;

  root.append(head, list, trust);
  return root;
}
