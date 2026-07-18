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
export function mountWelcome(container: HTMLElement, onEnter: () => void): () => void {
  const style = document.createElement("style");
  style.textContent = `
    .gx-welcome{position:fixed;inset:0;z-index:30;pointer-events:none;font-family:system-ui,sans-serif;display:flex;align-items:flex-end;justify-content:flex-start;padding:clamp(20px,4vw,54px)}
    .gx-welcome::before{content:"";position:absolute;inset:auto 0 0 0;height:46%;background:linear-gradient(180deg,rgba(3,12,20,0),rgba(3,12,20,.7));pointer-events:none}
    .gx-welcome-card{position:relative;max-width:430px;display:flex;flex-direction:column;align-items:flex-start;gap:13px;text-align:left}
    .gx-welcome h1{margin:0;font-size:clamp(27px,4.2vw,44px);letter-spacing:.05em;font-weight:800;color:#eafaff;line-height:1.05;text-shadow:0 4px 38px rgba(70,220,235,.38)}
    .gx-welcome p{margin:0;color:#b3dae5;font-size:14.5px;line-height:1.55;text-shadow:0 1px 12px rgba(3,12,20,.7)}
    .gx-welcome .gx-actions{display:flex;gap:12px;flex-wrap:wrap;pointer-events:auto}
    .gx-welcome button{background:linear-gradient(180deg,#2fb6d0,#1d7f96);color:#fff;border:1px solid #4fd0e6;border-radius:12px;padding:12px 24px;font:600 15px system-ui,sans-serif;cursor:pointer;box-shadow:0 8px 30px rgba(30,127,150,.42)}
    .gx-welcome button:hover{filter:brightness(1.08)}
    .gx-welcome .gx-hint{color:#7fc2d3;font-size:12px;text-shadow:0 1px 10px rgba(3,12,20,.8)}
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
      <div class="gx-actions"><button type="button">Enter Scene Editor</button></div>
      <div class="gx-hint">click the stack to knock it over · click the ground to drop a ball · drag to look around</div>
    </div>
  `;
  const dispose = () => { overlay.remove(); style.remove(); };
  overlay.querySelector("button")?.addEventListener("click", () => { onEnter(); dispose(); });
  container.append(style, overlay);
  return dispose;
}
