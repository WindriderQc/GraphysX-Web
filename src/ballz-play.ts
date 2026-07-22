import { PUSH_DIRECTIONS } from "./ballz-level-scene";
import { describeRun, formatClock, type GraphysXAgentWorldApi } from "./agent-world-runtime";
import { ARCHIVE_BALLZ_LEVELS } from "./archive-ballz-levels";
import {
  LevelRecordStore,
  formatMedal,
  formatRaceTime,
  formatTimeDelta,
  type LevelFinishSummary,
} from "./scoreboard";

/**
 * The thin play layer over a materialised level: arrow keys push the ball, a HUD that renders
 * the run, and a completion panel when the level is won.
 *
 * **This file used to own the rules and no longer does.** It held the win condition in
 * TypeScript and found the pieces by string-matching entity ids — `startsWith("ballz-ring-")`
 * for a pickup, `=== "ballz-finish-gate"` for the goal — so "collect everything, then reach
 * the end" was expressible by exactly one world, was invisible to `export()` and the store,
 * and no agent could read or change it. That is the private code path the invariant forbids,
 * and it is now a `rules` block in the scene document judged by `agent-world-rules.ts`.
 *
 * What is left here is genuinely a *view*: it reads `api.rules.status()` and draws it. The
 * consequence worth noting is that this file no longer knows what BallZ is. Point it at any
 * scene carrying a rules block and a steerable subject and the HUD is correct, which is what
 * makes the World 1 / Great Slide ports a scene each rather than a play layer each.
 *
 * It still owns no scene state: the ball's steering is four `apply-impulse` interactions on
 * the ball itself, so a key press is an ordinary API call an agent could make too.
 */
export function mountBallzPlay(
  api: GraphysXAgentWorldApi,
  container: HTMLElement,
  onExit?: () => void,
): () => void {
  const ballId = "ballz-ball";
  const ball = api.query({ ids: [ballId] })[0];
  // A level with no start tile has no ball, and is a layout rather than something to play.
  if (!ball) return () => {};

  // Self-injecting, so playing works on any route. The editor's stylesheet is loaded lazily and
  // only when someone opens the editor — an agent that calls `levels.play()` on the showroom
  // route would otherwise get a correct but invisible HUD.
  injectStyleOnce();

  // The run is armed by the runtime when the scene loads, so there is nothing to start here
  // and — importantly — no second cursor into the event stream. This layer never reads
  // `events()` at all now, which is what removed its ability to disagree with the runtime
  // about whether you had won.
  const initial = api.rules.status();
  let won = initial?.phase === "complete";

  const hud = document.createElement("div");
  hud.className = "gx-bz-hud";
  const status = document.createElement("div");
  status.className = "gx-bz-status";
  const hint = document.createElement("div");
  hint.className = "gx-bz-hint";
  hint.textContent = (initial?.collectibleCount ?? 0) > 0 ? "collect the rings, then reach the finish" : "arrow keys to roll";
  hud.append(status, hint);
  // Play is a place you can leave. Without this the only way out of a game is a page reload,
  // which is the sort of dead end that makes a mode feel like a trap rather than a surface.
  if (onExit) {
    const exit = document.createElement("button");
    exit.type = "button";
    exit.className = "gx-bz-exit";
    exit.textContent = "✕ Exit play";
    exit.addEventListener("click", () => onExit());
    hud.append(exit);
  }
  container.append(hud);

  const renderHud = (): void => {
    const run = api.rules.status();
    if (!run) {
      status.textContent = "roll the ball";
      return;
    }
    const parts = [describeRun(run)];
    // Only when the lap's requirements are met do we say the finish is live — announcing it
    // earlier invites a run straight at a gate that will not count.
    const ringsIn = run.collected.length >= run.collectibleCount;
    const gatesIn = run.checkpointIndex >= run.checkpointCount;
    if (run.phase === "running" && ringsIn && gatesIn && (run.collectibleCount > 0 || run.checkpointCount > 0)) {
      parts.push("finish is open");
    }
    status.textContent = parts.join("  ·  ");
  };
  renderHud();

  // Arrow keys only, on purpose: the editor already binds W/E/R to gizmo modes and Delete to
  // remove, so WASD would fight it the moment someone plays a level with the editor open.
  const pushBy = new Map<string, string>(PUSH_DIRECTIONS.map((direction) => [direction.key, direction.id]));
  const onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    // Never steal a keystroke from a field — the level workbench is full of them.
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    const interactionId = pushBy.get(event.key);
    if (!interactionId) return;
    event.preventDefault();
    api.interact(ballId, interactionId);
  };
  window.addEventListener("keydown", onKeyDown);

  // Poll the *run*, not the stream. 200 ms is a HUD refresh rate, and the run it reads is
  // advanced inside the simulation tick — so unlike the old cursor-into-`events()` version,
  // a slow or backgrounded tab cannot cause this layer to miss a crossing. The worst a lagging
  // poll costs now is a late repaint; it can no longer lose a ring.
  const poll = window.setInterval(() => {
    if (won) return;
    const run = api.rules.status();
    if (run?.phase === "complete") {
      win(run.collectibleCount, run.elapsedSeconds, run.desynced);
      return;
    }
    renderHud();
  }, 200);

  function win(totalRings: number, seconds: number, desynced: boolean): void {
    won = true;
    hud.remove();
    container.append(buildWinPanel(api, totalRings, seconds, desynced, onExit));
  }

  return () => {
    window.clearInterval(poll);
    window.removeEventListener("keydown", onKeyDown);
    hud.remove();
    container.querySelector(".gx-bz-win")?.remove();
  };
}

/**
 * The completion panel. "Play again" re-materialises the same level: the source level id is
 * recoverable from the world id (`composeBallzLevel` names the world `ballz-level-<id>`), so no
 * caller has to thread it through — the panel reads it back out of the scene it is standing in.
 */
function buildWinPanel(
  api: GraphysXAgentWorldApi,
  totalRings: number,
  seconds: number,
  desynced: boolean,
  onExit?: () => void,
): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "gx-bz-win";

  const title = document.createElement("div");
  title.className = "gx-bz-win-title";
  title.textContent = "✓ Level Complete";

  const sub = document.createElement("div");
  sub.className = "gx-bz-win-sub";
  const summary = totalRings > 0 ? `all ${totalRings} rings · ${formatClock(seconds)}` : `finish reached · ${formatClock(seconds)}`;
  // A time whose evidence had a gap in it is shown, and labelled. Honesty over theatre: the
  // run is still won, but this is not a number to put on a board.
  sub.textContent = desynced ? `${summary} · time unverified (stream gap)` : summary;

  const actions = document.createElement("div");
  actions.className = "gx-bz-win-actions";

  const worldId = api.state()?.world.id ?? "";
  const levelId = worldId.startsWith("ballz-level-") ? worldId.slice("ballz-level-".length) : null;

  // The scoreboard finally drawn (ROADMAP Horizon 3 §6): time, medal, best, delta-to-best, fed
  // from the rules run this panel already renders plus the level record store. A desynced run
  // is summarised but never recorded — an unverified time must not become a stored best.
  if (levelId) {
    const store = new LevelRecordStore();
    const elapsedMs = Math.round(seconds * 1000);
    const referenceMs = archiveReferenceMs(levelId);
    const finish = desynced
      ? store.summarize(levelId, elapsedMs, referenceMs)
      : store.registerFinish(levelId, elapsedMs, referenceMs);
    panel.append(title, sub, buildScoreRow(finish), actions);
  } else {
    panel.append(title, sub, actions);
  }
  if (levelId) {
    const again = document.createElement("button");
    again.type = "button";
    again.className = "gx-bz-win-btn gx-bz-win-again";
    again.textContent = "↻ Play again";
    // Re-materialising fires world.loaded, which tears down this whole play layer and mounts a
    // fresh one — so the panel does not need to reset anything, it just replays the level.
    again.addEventListener("click", () => api.levels.play(levelId));
    actions.append(again);
  }

  if (onExit) {
    const back = document.createElement("button");
    back.type = "button";
    back.className = "gx-bz-win-btn";
    back.textContent = "← Back to games";
    back.addEventListener("click", () => onExit());
    actions.append(back);
  }

  return panel;
}

/**
 * The medal/best strip inside the win panel. Built with textContent throughout — the level id
 * and any stored strings never pass through innerHTML.
 */
function buildScoreRow(finish: LevelFinishSummary): HTMLElement {
  const row = document.createElement("div");
  row.className = "gx-bz-win-score";

  const stat = (label: string, value: string, extraClass?: string): HTMLElement => {
    const cell = document.createElement("div");
    cell.className = "gx-bz-win-stat";
    const name = document.createElement("span");
    name.className = "gx-bz-win-stat-label";
    name.textContent = label;
    const figure = document.createElement("span");
    figure.className = `gx-bz-win-stat-value${extraClass ? ` ${extraClass}` : ""}`;
    figure.textContent = value;
    cell.append(name, figure);
    return cell;
  };

  row.append(stat("time", formatRaceTime(finish.elapsedMs)));
  // A level with no recovered reference time has no medal scale; showing "—" would read as a
  // failed run rather than an unscored level, so the medal cell only exists when it can judge.
  if (finish.medal) row.append(stat("medal", formatMedal(finish.medal), `gx-bz-medal-${finish.medal}`));
  if (finish.isNewBest) {
    row.append(stat(
      "best",
      finish.previousBestMs === null
        ? `${formatRaceTime(finish.bestMs)} · first clear`
        : `${formatRaceTime(finish.bestMs)} · ${formatTimeDelta(finish.elapsedMs - finish.previousBestMs)}`,
      "gx-bz-win-best",
    ));
  } else if (finish.previousBestMs !== null) {
    row.append(stat("best", `${formatRaceTime(finish.bestMs)} · ${formatTimeDelta(finish.elapsedMs - finish.bestMs)}`));
  } else {
    // A desynced first clear: there is no stored best to measure against, and this run's
    // unverified time never became one, so the cell states the time without inventing a delta.
    row.append(stat("best", formatRaceTime(finish.bestMs)));
  }
  return row;
}

/**
 * The archive's recovered `ScoreBest` for a seeded level, when this run is one of them — the
 * reference the medal scale judges against. Hand-painted levels return null and stay unscored.
 */
function archiveReferenceMs(levelId: string): number | null {
  const level = ARCHIVE_BALLZ_LEVELS.find((entry) => entry.id === levelId);
  const value = level?.provenance.levelListFacts["scoreBestMs"];
  return typeof value === "number" && value > 0 ? value : null;
}

const STYLE_ID = "gx-ballz-play-css";

function injectStyleOnce(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = BALLZ_PLAY_CSS;
  document.head.append(style);
}

const BALLZ_PLAY_CSS = `
/* Top-centre, not bottom-centre. This first shipped at the bottom, where the editor's Library
   panel covered it completely — in the DOM, correctly styled, and invisible. Play mode now
   hides the authoring chrome outright, so there is nothing left to dodge, but the top is still
   the right place for a HUD and a bottom-centre one would break again the moment anything is
   docked there. */
.gx-bz-hud{position:absolute;left:50%;top:22px;transform:translateX(-50%);z-index:6;
  display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none;
  font:12px/1.2 var(--gx-font);text-shadow:0 1px 3px rgba(0,0,0,.75)}
.gx-bz-status{color:var(--gx-ink);letter-spacing:.08em;font-weight:600}
.gx-bz-hint{color:var(--gx-ink-faint);font-size:10px;letter-spacing:.06em}
/* The HUD is pointer-events:none so it never eats a click meant for the scene; the one
   interactive child opts back in. */
.gx-bz-exit{pointer-events:auto;margin-top:4px;background:rgba(10,22,30,.72);border:1px solid var(--gx-accent-glow);
  border-radius:4px;color:var(--gx-ink-soft);cursor:pointer;font:10px/1 var(--gx-font);padding:5px 9px}
.gx-bz-exit:hover{background:rgba(18,40,52,.86);border-color:var(--gx-accent)}
/* The completion panel. Centred and modal-feeling but not a full backdrop — the level you just
   beat stays visible behind it, which is the reward. */
.gx-bz-win{position:absolute;left:50%;top:34%;transform:translate(-50%,-50%);z-index:8;
  display:flex;flex-direction:column;align-items:center;gap:10px;padding:24px 34px;
  background:rgba(9,22,31,.92);border:1px solid rgba(95,224,180,.5);border-radius:16px;
  box-shadow:0 18px 60px rgba(0,0,0,.5);font-family:var(--gx-font);text-align:center}
.gx-bz-win-title{color:var(--gx-life);font-size:26px;font-weight:800;letter-spacing:.04em;
  text-shadow:0 3px 24px rgba(95,224,180,.4)}
.gx-bz-win-sub{color:var(--gx-ink-soft);font-size:13px;letter-spacing:.05em}
/* The scoreboard strip: time / medal / best-with-delta, straight from the level record store. */
.gx-bz-win-score{display:flex;gap:24px;margin-top:2px}
.gx-bz-win-stat{display:flex;flex-direction:column;gap:3px;align-items:center;min-width:64px}
.gx-bz-win-stat-label{font:600 9px/1 var(--gx-font);letter-spacing:.16em;text-transform:uppercase;color:var(--gx-ink-faint)}
.gx-bz-win-stat-value{font:700 15px/1.2 var(--gx-font);color:var(--gx-ink)}
.gx-bz-win-best{color:var(--gx-life)}
.gx-bz-medal-gold{color:#f0c46a;text-shadow:0 0 16px rgba(240,196,106,.45)}
.gx-bz-medal-silver{color:#cdd9e4;text-shadow:0 0 16px rgba(205,217,228,.35)}
.gx-bz-medal-bronze{color:#d8956b;text-shadow:0 0 16px rgba(216,149,107,.35)}
.gx-bz-win-actions{display:flex;gap:10px;margin-top:6px}
.gx-bz-win-btn{cursor:pointer;border-radius:10px;padding:10px 18px;font:600 13px var(--gx-font);
  background:rgba(16,38,50,.9);border:1px solid var(--gx-accent-ring);color:var(--gx-ink-soft)}
.gx-bz-win-btn:hover{background:rgba(24,56,72,.96);border-color:var(--gx-accent)}
.gx-bz-win-again{background:linear-gradient(180deg,#2f9e7f,var(--gx-accent-fill));border-color:var(--gx-life);color:var(--gx-ink)}
.gx-bz-win-again:hover{filter:brightness(1.08)}
`;
