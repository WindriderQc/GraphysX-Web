import { findVoxelFace } from "./agent-world-face";
import type { LlmXApplication } from "./llmx-contracts";
import { createLlmXEntrance } from "./llmx-entrance";
import { createLlmXForge, LLMX_FACE_ID, readLlmXEnvironment, saveLlmXEnvironment } from "./llmx-environment";
import { FORGE_INTRO, forgeCameraAt, forgeIntroAt } from "./llmx-forge";
import { mountForgePresentation } from "./llmx-forge-presentation";
import type { PlatformHost } from "./platform-host";
import { motionIsReduced } from "./platform-theme";
import "./llmx.css";

/** First product slice: a persistent visual room. Conversation/voice are not simulated here. */
export function mountLlmXApp(root: HTMLElement, host: PlatformHost, onExit: () => void): LlmXApplication {
  const forge = createLlmXForge();
  let notice = "";
  let saved = false;
  let world = forge.document;
  try {
    const stored = readLlmXEnvironment(window.localStorage);
    if (stored) { world = stored; saved = true; }
  } catch {
    notice = "La sauvegarde n’a pas pu être ouverte. Elle est conservée; voici la Forge d’origine.";
  }
  const loaded = host.api.load(world);
  if (!loaded.ok) {
    if (world === forge.document) throw new Error(loaded.error);
    const fallback = host.api.load(forge.document);
    if (!fallback.ok) throw new Error(fallback.error);
    notice = "La sauvegarde n’a pas pu être ouverte. Elle est conservée; voici la Forge d’origine.";
    saved = false;
  }
  host.api.pause(false);
  host.applyEnvironment();
  const presentation = mountForgePresentation(host.scene, forge.anchors);
  const requireFace = () => {
    const object = host.world.getEntityObject(LLMX_FACE_ID);
    const face = object && findVoxelFace(object);
    if (!face) throw new Error("The LLMx face is missing from the world");
    return face;
  };
  let face = requireFace();
  let disposed = false;
  let entrance = makeEntrance();
  let lastPhase = "";
  let cameraOwned = true;

  const surface = document.createElement("section");
  surface.className = "gx-llmx";
  surface.setAttribute("aria-label", "LLMx");
  surface.innerHTML = `
    <header class="gx-llmx-header">
      <div><span class="gx-llmx-eyebrow">LLMx</span><h1>Forge nocturne</h1></div>
      <button type="button" data-action="exit">Quitter LLMx</button>
    </header>
    <footer class="gx-llmx-footer">
      <p class="gx-llmx-phase" role="status" aria-live="polite"></p>
      <nav aria-label="La Forge">
        <button type="button" data-action="skip">Passer l’entrée</button>
        <button type="button" data-action="replay" hidden>Rejouer l’entrée</button>
        <button type="button" data-action="environments">Environnements</button>
        <button type="button" data-action="save">Sauvegarder</button>
      </nav>
      <p class="gx-llmx-caption">Le lieu prend vie. Le dialogue arrive bientôt.</p>
      <p class="gx-llmx-notice" role="status" aria-live="polite"></p>
    </footer>
    <dialog aria-labelledby="llmx-environments-title" class="gx-llmx-environments">
      <h2 id="llmx-environments-title">Vos environnements</h2>
      <p>Un premier lieu pour LLMx.</p>
      <button class="gx-llmx-world" type="button" data-action="load">
        <strong>Forge nocturne</strong><span class="gx-llmx-saved"></span>
      </button>
      <p class="gx-llmx-caption">Sauvegardé dans ce navigateur. Effacer ses données efface aussi la sauvegarde.</p>
      <button type="button" data-action="close">Retour à la Forge</button>
    </dialog>`;
  const element = <T extends HTMLElement>(selector: string): T => surface.querySelector<T>(selector)!;
  const button = (action: string) => element<HTMLButtonElement>(`[data-action="${action}"]`);
  const dialog = element<HTMLDialogElement>("dialog");
  const render = () => {
    const phase = entrance.state().phase;
    if (phase !== lastPhase) {
      element(".gx-llmx-phase").textContent = phase === "entering" ? "La Forge s’éveille…" : "Bienvenue dans la Forge";
      button("skip").hidden = phase !== "entering";
      button("replay").hidden = phase === "entering";
      lastPhase = phase;
    }
    element(".gx-llmx-notice").textContent = notice;
    element(".gx-llmx-saved").textContent = saved ? "Reprendre votre sauvegarde" : "Environnement d’origine";
  };

  function makeEntrance() {
    return createLlmXEntrance({ cameraSeconds: FORGE_INTRO.seconds, assemblyDelaySeconds: FORGE_INTRO.assembly.start, assemblySeconds: FORGE_INTRO.assembly.end - FORGE_INTRO.assembly.start }, motionIsReduced());
  }
  const frame = (delta: number) => {
    if (disposed) return;
    // Reacquire after an ordinary API load/undo; the application never keeps an orphaned rig.
    const object = host.world.getEntityObject(LLMX_FACE_ID);
    const currentFace = object && findVoxelFace(object);
    if (!currentFace) return;
    face = currentFace;
    face.setLevel(host.qualityProfile.name);
    const previousPhase = entrance.state().phase;
    if (motionIsReduced() && previousPhase === "entering") entrance.skip();
    const state = entrance.advance(Math.min(0.1, Math.max(0, delta)));
    const intro = forgeIntroAt(state.elapsedSeconds);
    presentation.setIntro(intro);
    const drivers = { build: intro.assembly, blink: 1 - intro.wake, attention: 0.25 + 0.4 * intro.wake };
    if (state.phase === "ready" && previousPhase === "entering") face.snapDrivers(drivers);
    else face.setDrivers(drivers);
    if (cameraOwned) {
      const pose = forgeCameraAt(forge.anchors, intro.approach);
      host.frameView(pose.position, pose.target, 0);
      if (state.phase === "ready") cameraOwned = false;
    }
    presentation.setActivity({ speaking: false, build: intro.assembly });
    presentation.update(motionIsReduced() ? 0 : delta);
    if (lastPhase !== state.phase) render();
  };
  const restart = () => {
    entrance.dispose();
    entrance = makeEntrance();
    face.snapDrivers({ build: 0, blink: 1, speak: 0, think: 0 });
    cameraOwned = true;
    // The mask is bundled and synchronous, as are the essential floor/lighting meshes.
    // Sky/HDRI may refine the background later; neither is conversation readiness.
    entrance.assetsReady();
    if (entrance.state().phase === "ready") face.snapDrivers({ build: 1, blink: 0 });
    frame(0);
    render();
  };
  button("exit").addEventListener("click", onExit);
  button("replay").addEventListener("click", restart);
  button("skip").addEventListener("click", () => {
    entrance.skip();
    face.snapDrivers({ build: 1, blink: 0 });
    frame(0);
    button("replay").focus();
  });
  const interruptCamera = () => {
    if (entrance.state().phase !== "entering") return;
    cameraOwned = false;
    entrance.skip();
    face.snapDrivers({ build: 1, blink: 0 });
    frame(0);
  };
  host.renderer.domElement.addEventListener("pointerdown", interruptCamera);
  button("environments").addEventListener("click", () => { render(); dialog.showModal(); });
  button("close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => button("environments").focus());
  button("save").addEventListener("click", () => {
    try {
      const document = host.api.exportDocument();
      if (!document) throw new Error("The scene cannot be exported");
      saveLlmXEnvironment(window.localStorage, document);
      saved = true;
      notice = "Votre Forge est sauvegardée dans ce navigateur.";
    } catch { notice = "La sauvegarde a échoué. Votre Forge reste ouverte."; }
    render();
  });
  button("load").addEventListener("click", () => {
    try {
      const stored = readLlmXEnvironment(window.localStorage);
      const result = host.api.load(stored ?? forge.document);
      if (!result.ok) throw new Error(result.error);
      host.applyEnvironment();
      face = requireFace();
      saved = stored !== null;
      notice = "";
      dialog.close();
      restart();
    } catch {
      notice = "Cet environnement n’a pas pu être rechargé. La sauvegarde est conservée.";
      dialog.close();
      render();
    }
  });
  root.append(surface);
  restart();
  const unsubscribe = host.subscribeFrame(frame);
  const state = () => ({
    application: "llmx", environment: "llmx-nocturnal-forge", entrance: entrance.state(),
    face: disposed ? null : face.describe(), conversation: "unavailable", saved, notice,
  });
  return {
    state,
    advanceTime(milliseconds) {
      if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new RangeError("Invalid elapsed time");
      let remaining = milliseconds / 1000;
      while (remaining > 0 && !disposed) {
        const delta = Math.min(remaining, 1 / 60);
        frame(delta);
        host.api.step(delta);
        remaining -= delta;
      }
      return state();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      entrance.dispose();
      unsubscribe();
      host.renderer.domElement.removeEventListener("pointerdown", interruptCamera);
      presentation.dispose();
      surface.remove();
      // Runtime owns the face and releases it on the next load/dispose.
    },
  };
}
