/**
 * The welcome overlay for the showroom front door.
 *
 * Deliberately anchored to the lower-left rather than centred: the showroom exists to show
 * the engine at a glance, and a centred block sits exactly where the composed scene's
 * content is. The copy reads over a bottom scrim so the middle of the frame — the part
 * worth looking at — stays clear while the idle orbit moves through it.
 *
 * This is DOM chrome, not scene vocabulary, so it lives apart from `showroom-scene.ts`.
 * Class names are load-bearing: the headless smokes select `.gx-welcome` and its button.
 */
export function mountWelcome(
  container: HTMLElement,
  onEnter: () => void,
  onGames?: () => void,
  onBrowse?: () => void,
): () => void {
  const style = document.createElement("style");
  style.textContent = `
    .gx-welcome{position:fixed;inset:0;z-index:30;pointer-events:none;font-family:var(--gx-font);display:flex;align-items:flex-end;justify-content:flex-start;padding:clamp(20px,4vw,54px)}
    .gx-welcome::before{content:"";position:absolute;inset:auto 0 0 0;height:46%;background:linear-gradient(180deg,rgba(3,12,20,0),rgba(3,12,20,.7));pointer-events:none}
    .gx-welcome-card{position:relative;max-width:430px;display:flex;flex-direction:column;align-items:flex-start;gap:13px;text-align:left}
    .gx-welcome h1{margin:0;font-size:clamp(27px,4.2vw,44px);letter-spacing:.05em;font-weight:800;color:var(--gx-ink);line-height:1.05;text-shadow:0 4px 38px rgba(70,220,235,.38)}
    .gx-welcome p{margin:0;color:var(--gx-ink-soft);font-size:14.5px;line-height:1.55;text-shadow:0 1px 12px rgba(3,12,20,.7)}
    .gx-welcome .gx-actions{display:flex;gap:12px;flex-wrap:wrap;pointer-events:auto}
    .gx-welcome button{background:linear-gradient(180deg,var(--gx-accent-deep),#1d7f96);color:#fff;border:1px solid var(--gx-accent-edge);border-radius:12px;padding:12px 24px;font:600 15px var(--gx-font);cursor:pointer;box-shadow:0 8px 30px rgba(30,127,150,.42)}
    .gx-welcome button:hover{filter:brightness(1.08)}
    .gx-welcome .gx-go-games{background:linear-gradient(180deg,#2f9e7f,#1d6f5a);border-color:var(--gx-life);box-shadow:0 8px 30px rgba(29,111,90,.42)}
    .gx-welcome .gx-go-browse{background:linear-gradient(180deg,#5a6fb0,#3a4a80);border-color:var(--gx-violet);box-shadow:0 8px 30px rgba(58,74,128,.42)}
    .gx-welcome .gx-hint{color:var(--gx-ink-faint);font-size:12px;text-shadow:0 1px 10px rgba(3,12,20,.8)}
    /*
     * The title treatment, staged against the host's 2.6s entry move: each line rises and
     * fades in slightly after the one above it, so the card assembles while the camera is
     * still settling rather than being fully present over a moving shot.
     *
     * Staggered with a delay per child rather than one animation on the card, because the
     * point is the cascade -- a card that fades in as a block reads as a loading state.
     * The last line lands at 1.5s, comfortably before the camera stops at 2.6s, so the
     * visitor is never waiting on chrome.
     */
    @keyframes gx-welcome-rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
    .gx-welcome-card > *{animation:gx-welcome-rise .72s cubic-bezier(.22,.68,.32,1) both}
    .gx-welcome-card > h1{animation-delay:.28s}
    .gx-welcome-card > p{animation-delay:.55s}
    .gx-welcome-card > .gx-actions{animation-delay:.82s}
    .gx-welcome-card > .gx-hint{animation-delay:1.05s}
    /*
     * Anyone who has asked the OS for less motion gets the card immediately and unanimated.
     * A decorative entrance is exactly the kind of thing this setting exists to suppress.
     */
    @media (prefers-reduced-motion:reduce){
      .gx-welcome-card > *{animation:none}
    }
    @media (max-width:640px){
      .gx-welcome{justify-content:center;align-items:flex-end}
      .gx-welcome-card{align-items:center;text-align:center}
    }
  `;
  const overlay = document.createElement("div");
  overlay.className = "gx-welcome";
  overlay.innerHTML = `
    <div class="gx-welcome-card">
      <h1>GRAPHYSX WEB</h1>
      <p>A browser engine for 3D + physics scenes that humans and AI agents create and inhabit together — composed from the same vocabulary you build with.</p>
      <div class="gx-actions"><button type="button" class="gx-go-editor">Enter Scene Editor</button></div>
      <div class="gx-hint">click the stack to knock it through the chime ring · click the ground to drop a ball · drag to look around</div>
    </div>
  `;
  const dispose = () => { overlay.remove(); style.remove(); };
  overlay.querySelector(".gx-go-editor")?.addEventListener("click", () => { onEnter(); dispose(); });
  // The second destination from §5. Added only when a caller supplies it, so the button can
  // never be a dead control — the front door should not advertise a room that is not there.
  if (onGames) {
    const games = document.createElement("button");
    games.type = "button";
    games.className = "gx-go-games";
    games.textContent = "Games & Playgrounds";
    games.addEventListener("click", () => { onGames(); dispose(); });
    overlay.querySelector(".gx-actions")?.append(games);
  }
  // §5's third destination. Same rule: added only when wired, so it is never a dead button.
  if (onBrowse) {
    const browse = document.createElement("button");
    browse.type = "button";
    browse.className = "gx-go-browse";
    browse.textContent = "Browse Scenes";
    browse.addEventListener("click", () => { onBrowse(); dispose(); });
    overlay.querySelector(".gx-actions")?.append(browse);
  }
  container.append(style, overlay);
  return dispose;
}
