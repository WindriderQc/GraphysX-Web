import { PUSH_DIRECTIONS } from "./ballz-level-scene";
import type { GraphysXAgentWorldApi } from "./agent-world-runtime";

/**
 * The thin play layer over a materialised level: arrow keys push the ball, a HUD reads the
 * runtime's event stream to say what is happening, and a completion panel when the level is won.
 *
 * Deliberately thin, and deliberately not a game engine. It holds no *scene* state — the ball's
 * steering is four `apply-impulse` interactions that live on the ball itself, and a ring hides
 * itself through its own trigger interaction, so a key press and a collection are ordinary API
 * operations an agent could make too. What this layer owns is *rules* state: which rings have
 * been collected, and whether the finish has been reached with the set complete. That is exactly
 * the layer the runtime deliberately refuses to be — "what a crossing *means* (a lap, a win) sits
 * above the scene", per `ballz-level-scene.ts`. Delete this file and the level still simulates
 * correctly; it simply stops keeping score.
 *
 * The win rule is intentionally forgiving-but-real: collect every ring, then reach the finish.
 * Crossing the finish with rings still out does not win — you have to come back to it — which is
 * what makes the rings matter rather than being scenery you can ignore.
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

  const totalRings = api.query({ tag: "collectible" }).length;
  const hasFinish = api.query({ ids: ["ballz-finish-gate"] }).length > 0;
  // A Set, not a counter: rolling back through a ring you already took must not inflate the
  // tally, and the raw event count would. Collection is monotonic and unique by construction.
  const collectedRings = new Set<string>();
  let won = false;
  // Only events after mount matter; replaying the level's construction would count nothing.
  let since = api.events().sequence;

  const hud = document.createElement("div");
  hud.className = "gx-bz-hud";
  const status = document.createElement("div");
  status.className = "gx-bz-status";
  const hint = document.createElement("div");
  hint.className = "gx-bz-hint";
  hint.textContent = totalRings > 0 ? "collect the rings, then reach the finish" : "arrow keys to roll";
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
    const parts: string[] = [];
    if (totalRings > 0) parts.push(`${collectedRings.size} / ${totalRings} rings`);
    // Only when every ring is in do we tell the player the finish is now live — before that,
    // announcing the finish would invite them to run straight at a gate that will not count.
    if (totalRings > 0 && collectedRings.size >= totalRings && !won) parts.push("finish is open");
    status.textContent = parts.join("  ·  ") || "roll the ball";
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

  // Poll the stream rather than subscribing: this is HUD text, and reading a few events every
  // 200 ms costs nothing next to a frame, while a per-event subscription would re-render the
  // DOM inside the simulation tick.
  const poll = window.setInterval(() => {
    if (won) return;
    const page = api.events(since);
    since = page.sequence;
    let changed = false;
    for (const event of page.events) {
      if (event.type !== "trigger.enter") continue;
      const triggerId = String(event.data?.triggerId ?? "");
      if (triggerId.startsWith("ballz-ring-")) {
        if (!collectedRings.has(triggerId)) { collectedRings.add(triggerId); changed = true; }
      } else if (triggerId === "ballz-finish-gate" && hasFinish) {
        // The win is judged at the moment of crossing, against the rings collected *by then*.
        // Cross early and it simply does not fire; the finish stays a place you return to.
        if (collectedRings.size >= totalRings) { win(); return; }
      }
    }
    if (changed) renderHud();
  }, 200);

  function win(): void {
    won = true;
    hud.remove();
    container.append(buildWinPanel(api, totalRings, onExit));
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
  onExit?: () => void,
): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "gx-bz-win";

  const title = document.createElement("div");
  title.className = "gx-bz-win-title";
  title.textContent = "✓ Level Complete";

  const sub = document.createElement("div");
  sub.className = "gx-bz-win-sub";
  sub.textContent = totalRings > 0 ? `all ${totalRings} rings · finish reached` : "finish reached";

  const actions = document.createElement("div");
  actions.className = "gx-bz-win-actions";

  const worldId = api.state()?.world.id ?? "";
  const levelId = worldId.startsWith("ballz-level-") ? worldId.slice("ballz-level-".length) : null;
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

  panel.append(title, sub, actions);
  return panel;
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
  font:12px/1.2 system-ui,sans-serif;text-shadow:0 1px 3px rgba(0,0,0,.75)}
.gx-bz-status{color:#eaf6ff;letter-spacing:.08em;font-weight:600}
.gx-bz-hint{color:rgba(234,246,255,.55);font-size:10px;letter-spacing:.06em}
/* The HUD is pointer-events:none so it never eats a click meant for the scene; the one
   interactive child opts back in. */
.gx-bz-exit{pointer-events:auto;margin-top:4px;background:rgba(10,22,30,.72);border:1px solid rgba(120,240,208,.4);
  border-radius:4px;color:#bff3ff;cursor:pointer;font:10px/1 system-ui,sans-serif;padding:5px 9px}
.gx-bz-exit:hover{background:rgba(18,40,52,.86);border-color:#78f0d0}
/* The completion panel. Centred and modal-feeling but not a full backdrop — the level you just
   beat stays visible behind it, which is the reward. */
.gx-bz-win{position:absolute;left:50%;top:34%;transform:translate(-50%,-50%);z-index:8;
  display:flex;flex-direction:column;align-items:center;gap:10px;padding:24px 34px;
  background:rgba(9,22,31,.92);border:1px solid rgba(95,224,180,.5);border-radius:16px;
  box-shadow:0 18px 60px rgba(0,0,0,.5);font-family:system-ui,sans-serif;text-align:center}
.gx-bz-win-title{color:#5fe0b4;font-size:26px;font-weight:800;letter-spacing:.04em;
  text-shadow:0 3px 24px rgba(95,224,180,.4)}
.gx-bz-win-sub{color:#b3dae5;font-size:13px;letter-spacing:.05em}
.gx-bz-win-actions{display:flex;gap:10px;margin-top:6px}
.gx-bz-win-btn{cursor:pointer;border-radius:10px;padding:10px 18px;font:600 13px system-ui,sans-serif;
  background:rgba(16,38,50,.9);border:1px solid rgba(120,240,208,.36);color:#cfeef6}
.gx-bz-win-btn:hover{background:rgba(24,56,72,.96);border-color:#78f0d0}
.gx-bz-win-again{background:linear-gradient(180deg,#2f9e7f,#1d6f5a);border-color:#5fe0b4;color:#eafaff}
.gx-bz-win-again:hover{filter:brightness(1.08)}
`;
