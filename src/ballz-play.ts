import { PUSH_DIRECTIONS } from "./ballz-level-scene";
import type { GraphysXAgentWorldApi } from "./agent-world-runtime";

/**
 * The thin play layer over a materialised level: arrow keys push the ball, and a HUD reads the
 * runtime's event stream to say what is happening.
 *
 * Deliberately thin, and deliberately not a game engine. It holds no scene state and no rules
 * beyond counting: the ball's steering is four `apply-impulse` interactions that live on the
 * ball itself, so a key press is `api.interact(ball, "push-north")` — the identical operation an
 * agent makes. Rings "collect" themselves through their own trigger interaction; this layer only
 * *observes* that it happened. If this file were deleted the level would still simulate
 * correctly, which is the test for whether a host layer has quietly become the product.
 *
 * The rules that a crossing *means* something ("you win") stop here, at a status line. Anything
 * richer — laps, scoring, failure — belongs in a real rules layer above the runtime, and the
 * spec's tenet is that a playground is not a game until that is deliberate.
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
  let collected = 0;
  let finished = false;
  // Only events after mount matter; replaying the level's construction would count nothing.
  let since = api.events().sequence;

  const hud = document.createElement("div");
  hud.className = "gx-bz-hud";
  const status = document.createElement("div");
  status.className = "gx-bz-status";
  const hint = document.createElement("div");
  hint.className = "gx-bz-hint";
  hint.textContent = "arrow keys to roll";
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

  const render = (): void => {
    const parts: string[] = [];
    if (totalRings > 0) parts.push(`${collected} / ${totalRings} rings`);
    if (finished) parts.push("FINISH");
    status.textContent = parts.join("  ·  ") || "roll the ball";
    status.classList.toggle("gx-bz-status--won", finished);
  };
  render();

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
    const page = api.events(since);
    since = page.sequence;
    for (const event of page.events) {
      if (event.type !== "trigger.enter") continue;
      const triggerId = String(event.data?.triggerId ?? "");
      if (triggerId.startsWith("ballz-ring-")) collected += 1;
      else if (triggerId === "ballz-finish-gate" && hasFinish) finished = true;
    }
    if (page.events.length > 0) render();
  }, 200);

  return () => {
    window.clearInterval(poll);
    window.removeEventListener("keydown", onKeyDown);
    hud.remove();
  };
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
.gx-bz-status--won{color:#5fe0b4}
.gx-bz-hint{color:rgba(234,246,255,.55);font-size:10px;letter-spacing:.06em}
/* The HUD is pointer-events:none so it never eats a click meant for the scene; the one
   interactive child opts back in. */
.gx-bz-exit{pointer-events:auto;margin-top:4px;background:rgba(10,22,30,.72);border:1px solid rgba(120,240,208,.4);
  border-radius:4px;color:#bff3ff;cursor:pointer;font:10px/1 system-ui,sans-serif;padding:5px 9px}
.gx-bz-exit:hover{background:rgba(18,40,52,.86);border-color:#78f0d0}
`;
