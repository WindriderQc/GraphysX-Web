import { Vector3 } from "three";
import { findVoxelFace } from "./agent-world-face";
import { POSE_LIMITS } from "./llmx-face-pose";
import type { LlmXApplication } from "./llmx-contracts";
import { createLlmXEntrance } from "./llmx-entrance";
import { createLlmXForge, LLMX_FACE_ID } from "./llmx-environment";
import { LlmXLibrary } from "./llmx-library";
import { createLlmXSceneActions, llmxMathBuildZone, type LlmXSceneReceipt } from "./llmx-actions";
import { buildLlmXMath, recoverLlmXMath, type LlmXMathConfig } from "./llmx-math";
import { FORGE_INTRO, forgeCameraAt, forgeIntroAt, forgeThinkingEmitter, LLMX_THINKING_EMITTER_ID } from "./llmx-forge";
import { mountForgePresentation } from "./llmx-forge-presentation";
import { mountLlmXConversation } from "./llmx-conversation";
import { llmxFacePresentation } from "./llmx-presentation";
import type { PlatformHost } from "./platform-host";
import { motionIsReduced } from "./platform-theme";
import "./llmx.css";

/** Persistent room with one shared AgentX conversation and observed speech presentation. */
export function mountLlmXApp(root: HTMLElement, host: PlatformHost, onExit: () => void): LlmXApplication {
  const forge = createLlmXForge();
  const profile = new URLSearchParams(window.location.search).get('profile') === 'family' ? 'family' : 'personal';
  const library = new LlmXLibrary({ storage: { getItem: key => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value) }, namespace: profile });
  let activeId: string | null = null;
  let worldName = 'Forge nocturne';
  let selectedId: string | null = null;
  let revision = 0;
  let lastAction: LlmXSceneReceipt | undefined;
  let savedRevision = -1;
  let hadEdits = false;
  let notice = "";
  let saved = false;
  let world = forge.document;
  try {
    const snapshot = library.load();
    notice = snapshot.migrationWarning ?? '';
    if (snapshot.activeId) {
      const stored = library.read(snapshot.activeId);
      world = stored.world; activeId = stored.id; worldName = stored.name; saved = true;
    }
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
    activeId = null; worldName = 'Forge nocturne';
  }
  host.api.pause(false);
  savedRevision = host.api.state()!.revision;
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
  let thinking = false;
  const localGaze = new Vector3();

  const surface = document.createElement("section");
  surface.className = "gx-llmx";
  surface.setAttribute("aria-label", "LLMx");
  surface.innerHTML = `
    <header class="gx-llmx-header">
      <div><span class="gx-llmx-eyebrow">LLMx</span><h1>Forge nocturne</h1></div>
      <div class="gx-llmx-header-actions"><button type="button" data-action="profile"></button>
      <button type="button" data-action="exit">Quitter LLMx</button></div>
    </header>
    <footer class="gx-llmx-footer">
      <p class="gx-llmx-phase" role="status" aria-live="polite"></p>
      <nav aria-label="La Forge">
        <button type="button" data-action="skip">Passer l’entrée</button>
        <button type="button" data-action="replay" hidden>Rejouer l’entrée</button>
        <button type="button" data-action="environments">Environnements</button>
        <button type="button" data-action="save">Sauvegarder</button>
        <button type="button" data-action="math">Atelier maths</button>
      </nav>
      <p class="gx-llmx-notice" role="status" aria-live="polite"></p>
    </footer>
    <dialog aria-labelledby="llmx-environments-title" class="gx-llmx-environments">
      <h2 id="llmx-environments-title">Vos environnements</h2>
      <p class="gx-llmx-saved"></p>
      <select data-worlds aria-label="Environnement sauvegardé" size="4"></select>
      <label>Nom <input data-world-name maxlength="80" value="Forge nocturne"></label>
      <div class="gx-llmx-library-actions">
        <button type="button" data-action="load">Ouvrir</button>
        <button type="button" data-action="save-as">Sauvegarder une copie</button>
        <button type="button" data-action="rename">Renommer</button>
        <button type="button" data-action="duplicate">Dupliquer</button>
        <button type="button" data-action="delete">Supprimer</button>
      </div>
      <p data-library-notice role="status"></p>
      <button type="button" data-action="original">Revenir au décor d’origine</button>
      <p class="gx-llmx-caption">Votre travail est sauvegardé ici quand vous changez de monde ou quittez. Effacer les données du navigateur efface aussi ces mondes.</p>
      <button type="button" data-action="close">Retour à la Forge</button>
    </dialog>
    <aside class="gx-llmx-math-panel" aria-label="Atelier maths" hidden>
      <div class="gx-llmx-panel-heading"><h2>Un cube à la fois</h2><button data-action="math-close" type="button" aria-label="Fermer l’atelier">Fermer</button></div>
      <details data-math-settings open><summary>Choisir l’exercice</summary><form data-math-form>
        <label>On apprend à <select data-math-operation><option value="count">Compter</option><option value="add" selected>Additionner</option><option value="subtract">Soustraire</option></select></label>
        <div class="gx-llmx-math-numbers"><label>Au départ <input data-math-left type="number" min="0" max="20" value="3"></label><label data-math-right-label>À ajouter <input data-math-right type="number" min="0" max="20" value="2"></label></div>
        <button type="submit">Préparer les cubes</button>
      </form></details>
      <div data-math-lesson hidden><p data-math-initial></p><p data-math-action></p><strong data-math-result></strong>
        <button data-action="math-next" type="button">Un cube de plus</button>
        <button data-action="math-start" type="button">Recommencer</button></div>
      <p data-math-notice role="status" aria-live="polite"></p>
      <p class="gx-llmx-caption">De 0 à 20. Chaque cube vaut 1.</p>
    </aside>
    <div class="gx-llmx-edit-actions"><button data-action="undo" type="button">Annuler</button><button data-action="redo" type="button">Rétablir</button><button data-action="face" type="button">Voir le visage</button></div>`;
  const element = <T extends HTMLElement>(selector: string): T => surface.querySelector<T>(selector)!;
  const button = (action: string) => element<HTMLButtonElement>(`[data-action="${action}"]`);
  const dialog = element<HTMLDialogElement>("dialog");
  const nameInput = element<HTMLInputElement>('[data-world-name]');
  const worlds = element<HTMLSelectElement>('[data-worlds]');
  const mathPanel = element<HTMLElement>('.gx-llmx-math-panel');
  const identity = () => ({ environmentId: activeId ?? `${profile}-forge-draft`, revision: `${revision}:${host.api.state()!.revision}` });
  const actions = createLlmXSceneActions(host.api, identity, forge.anchors.buildZone, receipt => {
    saved = false;
    notice = receipt.message ?? 'Création appliquée.';
    cameraOwned = false;
    const lesson = recoverLlmXMath(host.api.exportDocument()!);
    if (!motionIsReduced()) presentation.announceCreation(lesson && receipt.entityIds.some(id => id.startsWith('llmx-created-math'))
      ? lesson.buildZone.center : forge.anchors.buildZone.center);
    if (lesson && receipt.entityIds.some(id => id.startsWith('llmx-created-math'))) {
      openMath(); element<HTMLDetailsElement>('[data-math-settings]').open = false;
    }
    else host.frameView(forge.anchors.cameraCreation.position, forge.anchors.cameraCreation.target, motionIsReduced() ? 0 : 0.8);
    renderMath(); render();
  });
  const conversation = mountLlmXConversation(surface, () => ({
    schemaVersion: 1,
    environment: { id: identity().environmentId, name: worldName },
    revision: identity().revision,
    capabilities: { commandsVersion: 1, mathVersion: 1 },
    buildZone: forge.anchors.buildZone,
    ...(lastAction ? { lastAction } : {}),
    ...mathContext(),
    entities: (host.api.exportDocument()?.entities ?? [])
      .filter(entity => entity.id === LLMX_FACE_ID || entity.id?.startsWith('llmx-created-'))
      .slice(0, 24).map(entity => ({ id: (entity.id ?? "entity").slice(0, 80), type: entity.type,
        ...(entity.id === 'llmx-created-math' ? { name: mathObservation() } : entity.label ? { name: entity.label.slice(0, 120) } : {}),
        ...(entity.transform?.position ? { position: entity.transform.position } : {}) })),
  }), { profile, onSceneProposal: (proposal, turnId) => {
    lastAction = actions.apply(proposal, turnId);
    notice = lastAction.message ?? ''; render(); return lastAction;
  } });
  const render = () => {
    const phase = entrance.state().phase;
    if (phase !== lastPhase) {
      element(".gx-llmx-phase").textContent = phase === "entering" ? "La Forge s’éveille…" : "Bienvenue dans la Forge";
      button("skip").hidden = phase !== "entering";
      button("replay").hidden = phase === "entering";
      lastPhase = phase;
    }
    element(".gx-llmx-notice").textContent = notice;
    element('h1').textContent = worldName;
    button('profile').textContent = profile === 'family' ? 'En famille · quitter' : 'Passer en famille';
    element(".gx-llmx-saved").textContent = profile === 'family' ? 'Vos mondes en famille. Les mondes personnels restent dans leur espace.' : 'Vos mondes personnels, dans ce navigateur.';
    button('save').textContent = saved && savedRevision === host.api.state()?.revision ? 'Sauvegardé' : 'Sauvegarder';
    hadEdits ||= !!host.api.exportDocument()?.entities.some(entity => entity.id?.startsWith('llmx-created-'));
    element('.gx-llmx-edit-actions').hidden = !hadEdits;
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
    face.setQualityCeiling(host.qualityProfile.name);
    const previousPhase = entrance.state().phase;
    if (motionIsReduced() && previousPhase === "entering") entrance.skip();
    const state = entrance.advance(Math.min(0.1, Math.max(0, delta)));
    const intro = forgeIntroAt(state.elapsedSeconds);
    if (state.phase === "ready") conversation.ready();
    const speech = conversation.sample();
    const presence = llmxFacePresentation({ assembly: intro.assembly, phase: conversation.phase(), speech });
    const nextThinking = presence.think > 0 && state.phase === "ready" && !motionIsReduced();
    if (nextThinking !== thinking || (nextThinking && !host.world.getEntityObject(LLMX_THINKING_EMITTER_ID))) {
      thinking = nextThinking;
      host.world.reconcileTransientEntities("llmx-presentation", thinking ? [forgeThinkingEmitter(forge.anchors)] : []);
    }
    presentation.setIntro(intro);
    object.worldToLocal(localGaze.copy(host.camera.position));
    const drivers = {
      ...presence, blink: 1 - intro.wake, attention: presence.attention * intro.wake,
      gazeX: Math.atan2(localGaze.x, localGaze.z) / POSE_LIMITS.gazeRadians,
      gazeY: Math.atan2(localGaze.y - 0.1, Math.hypot(localGaze.x, localGaze.z)) / POSE_LIMITS.gazeRadians,
    };
    if (state.phase === "ready" && previousPhase === "entering") face.snapDrivers(drivers);
    else face.setDrivers(drivers);
    if (cameraOwned) {
      const pose = forgeCameraAt(forge.anchors, intro.approach);
      host.frameView(pose.position, pose.target, 0);
      if (state.phase === "ready") cameraOwned = false;
    }
    presentation.setActivity({ speaking: speech.playing, thinking: presence.think > 0, build: intro.assembly });
    if (motionIsReduced()) presentation.clearCreation();
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
  button("exit").addEventListener("click", () => { if (preserveBeforeLeaving()) onExit(); });
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
  function renderLibrary() {
    const entries = library.list();
    selectedId = entries.some(entry => entry.id === selectedId) ? selectedId : entries.some(entry => entry.id === activeId) ? activeId : entries[0]?.id ?? null;
    worlds.replaceChildren(...entries.map(entry => {
      const option = document.createElement('option'); option.value = entry.id;
      option.textContent = entry.name + (entry.id === activeId ? ' · ouvert' : ''); return option;
    }));
    if (selectedId) worlds.value = selectedId;
    for (const action of ['load', 'rename', 'duplicate', 'delete']) button(action).disabled = !selectedId;
    render();
  }
  function libraryAction(action: () => void) {
    try { action(); element('[data-library-notice]').textContent = notice; renderLibrary(); }
    catch (error) { element('[data-library-notice]').textContent = error instanceof Error ? error.message : 'Cette sauvegarde n’a pas pu être modifiée.'; }
  }
  function save(copy = false, name = nameInput.value.trim() || worldName) {
    const document = host.api.exportDocument();
    if (!document) throw new Error('Le décor ne peut pas être sauvegardé.');
    const record = activeId && !copy ? library.update(activeId, document) : library.save(name, document);
    if (activeId !== record.id) revision++;
    activeId = record.id; worldName = record.name; selectedId = record.id;
    saved = true; savedRevision = host.api.state()!.revision;
    notice = 'Votre monde est sauvegardé dans ce navigateur.';
  }
  function preserveBeforeLeaving() {
    if (disposed || host.api.state()?.revision === savedRevision) return true;
    try {
      let name = worldName;
      if (!activeId) {
        const names = new Set(library.list().map(entry => entry.name.toLocaleLowerCase()));
        let suffix = 2;
        while (names.has(name.toLocaleLowerCase())) name = worldName.slice(0, 72) + ' ' + suffix++;
      }
      save(false, name); return true;
    } catch {
      notice = 'Votre travail n’a pas pu être sauvegardé. Il reste ouvert; choisissez une copie dans Environnements.';
      render(); return false;
    }
  }
  button("environments").addEventListener("click", () => {
    nameInput.value = worldName;
    libraryAction(() => { library.load(); notice = ''; });
    dialog.showModal();
  });
  button("close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => button("environments").focus());
  worlds.addEventListener('change', () => { selectedId = worlds.value || null; if (selectedId) nameInput.value = library.read(selectedId).name; });
  button("save").addEventListener("click", () => {
    try { save(); } catch { notice = 'La sauvegarde a échoué. Votre monde reste ouvert; choisissez un nouveau nom dans Environnements.'; }
    render();
  });
  button('save-as').addEventListener('click', () => libraryAction(() => save(true)));
  button('rename').addEventListener('click', () => libraryAction(() => {
    const record = library.rename(selectedId!, nameInput.value);
    if (record.id === activeId) worldName = record.name;
    notice = 'Environnement renommé.';
  }));
  button('duplicate').addEventListener('click', () => libraryAction(() => {
    const record = library.duplicate(selectedId!, nameInput.value);
    selectedId = record.id; notice = 'Copie sauvegardée. Votre monde actuel reste ouvert.';
  }));
  button('delete').addEventListener('click', () => libraryAction(() => {
    const id = selectedId!;
    library.remove(id);
    if (activeId === id) { activeId = null; saved = false; revision++; }
    selectedId = null; notice = 'Sauvegarde supprimée. Le décor actuellement ouvert reste disponible.';
  }));
  button("load").addEventListener("click", () => {
    libraryAction(() => {
      const targetId = selectedId!;
      if (!preserveBeforeLeaving()) throw new Error(notice);
      const stored = library.read(targetId);
      // Activating the exact validated record may fail on quota/concurrent tab before runtime changes.
      library.activate(stored.id);
      conversation.worldChanged(); revision++;
      const result = host.api.load(stored.world);
      if (!result.ok) throw new Error(result.error);
      host.applyEnvironment();
      face = requireFace();
      activeId = stored.id; worldName = stored.name;
      saved = true; savedRevision = host.api.state()!.revision; lastAction = undefined;
      notice = "";
      closeMath(); renderMath();
      dialog.close();
      restart();
    });
  });
  button("original").addEventListener("click", () => {
    if (!preserveBeforeLeaving()) return;
    conversation.worldChanged(); revision++;
    const result = host.api.load(forge.document);
    if (result.ok) {
      host.applyEnvironment(); face = requireFace();
      activeId = null; worldName = 'Forge nocturne'; saved = false; lastAction = undefined;
      savedRevision = host.api.state()!.revision;
      nameInput.value = worldName; closeMath(); renderMath();
      notice = "Décor d’origine chargé. Sauvegarde-le pour le retrouver à la prochaine visite.";
      dialog.close(); restart();
    } else { notice = result.error ?? "Le décor n’a pas pu être chargé."; render(); }
  });
  button('profile').addEventListener('click', () => {
    if (!preserveBeforeLeaving()) return;
    conversation.worldChanged();
    const url = new URL(window.location.href);
    if (profile === 'family') url.searchParams.delete('profile'); else url.searchParams.set('profile', 'family');
    window.location.assign(url);
  });
  function mathLesson() {
    try { return recoverLlmXMath(host.api.exportDocument()); }
    catch { element('[data-math-notice]').textContent = 'Les cubes ont changé. Prépare un nouvel exercice pour compter avec exactitude.'; return null; }
  }
  function mathObservation() {
    const lesson = mathLesson();
    return lesson ? `${lesson.labels.equation}; étape ${lesson.config.step}/${lesson.stepCount}; ${lesson.labels.action}`.slice(0, 120)
      : 'Exercice modifié : les quantités doivent être préparées à nouveau.';
  }
  function mathContext() {
    const lesson = mathLesson();
    return lesson ? { mathLesson: { ...lesson.config, result: lesson.result } } : {};
  }
  function renderMath() {
    const lesson = mathLesson();
    element('[data-math-lesson]').hidden = !lesson;
    if (!lesson) return;
    element<HTMLSelectElement>('[data-math-operation]').value = lesson.config.operation;
    element<HTMLInputElement>('[data-math-left]').value = String(lesson.config.left);
    element<HTMLInputElement>('[data-math-right]').value = String(lesson.config.right);
    element<HTMLInputElement>('[data-math-right]').disabled = lesson.config.operation === 'count';
    element('[data-math-right-label]').firstChild!.textContent = lesson.config.operation === 'subtract' ? 'À retirer ' : 'À ajouter ';
    element('[data-math-initial]').textContent = lesson.labels.initial;
    element('[data-math-action]').textContent = lesson.labels.action;
    element('[data-math-result]').textContent = lesson.labels.result;
    button('math-next').textContent = lesson.labels.nextAction;
    button('math-next').disabled = lesson.complete;
    button('math-start').disabled = lesson.config.step === 0;
  }
  function openMath() {
    mathPanel.hidden = false; surface.classList.add('math-open'); cameraOwned = false;
    conversation.collapseHistory();
    const [x, y, z] = mathLesson()?.buildZone.center ?? llmxMathBuildZone(forge.anchors.buildZone).center;
    const compact = window.innerWidth < 600;
    host.frameView(compact ? [x, y + 8, z + 5] : [x, y + 4.6, z + 3],
      compact ? [x, y, z + 2.5] : [x - 0.5, y, z + 0.1], motionIsReduced() ? 0 : 0.7);
    renderMath();
  }
  function closeMath() { mathPanel.hidden = true; surface.classList.remove('math-open'); }
  button('math').addEventListener('click', () => { conversation.worldChanged(); openMath(); });
  button('math-close').addEventListener('click', () => { closeMath(); button('math').focus(); });
  button('face').addEventListener('click', () => {
    closeMath(); cameraOwned = false;
    host.frameView(forge.anchors.cameraRest.position, forge.anchors.cameraRest.target, motionIsReduced() ? 0 : 0.7);
  });
  const operation = element<HTMLSelectElement>('[data-math-operation]');
  const rightInput = element<HTMLInputElement>('[data-math-right]');
  operation.addEventListener('change', () => {
    rightInput.disabled = operation.value === 'count';
    element('[data-math-right-label]').firstChild!.textContent = operation.value === 'subtract' ? 'À retirer ' : 'À ajouter ';
  });
  function applyMath(config: LlmXMathConfig) {
    try {
      buildLlmXMath(config, forge.anchors.buildZone);
      conversation.worldChanged();
      const receipt = actions.apply({ schemaVersion: 1, ...identity(), intent: 'Explorer une opération avec des cubes', math: config }, crypto.randomUUID());
      element('[data-math-notice]').textContent = receipt.status === 'applied' ? '' : receipt.message ?? '';
      if (receipt.status === 'applied') element<HTMLDetailsElement>('[data-math-settings]').open = false;
      notice = receipt.status === 'applied' ? '' : receipt.message ?? '';
      renderMath(); render();
    } catch { element('[data-math-notice]').textContent = 'Choisis des nombres entiers de 0 à 20, avec un résultat entre 0 et 20.'; }
  }
  element<HTMLFormElement>('[data-math-form]').addEventListener('submit', event => {
    event.preventDefault();
    applyMath({ operation: operation.value as LlmXMathConfig['operation'], left: Number(element<HTMLInputElement>('[data-math-left]').value),
      right: operation.value === 'count' ? 0 : Number(rightInput.value), step: 0 });
  });
  button('math-next').addEventListener('click', () => { const lesson = mathLesson(); if (lesson && !lesson.complete) applyMath({ ...lesson.config, step: lesson.config.step + 1 }); });
  button('math-start').addEventListener('click', () => { const lesson = mathLesson(); if (lesson) applyMath({ ...lesson.config, step: 0 }); });
  for (const action of ['undo', 'redo'] as const) button(action).addEventListener('click', () => {
    conversation.worldChanged();
    const result = host.api[action]();
    notice = result.ok ? action === 'undo' ? 'Dernier geste annulé.' : 'Dernier geste rétabli.' : 'Aucun geste à reprendre.';
    if (result.ok) { saved = false; revision++; lastAction = undefined; host.applyEnvironment(); }
    renderMath(); render();
  });
  root.append(surface);
  const preservePage = () => { preserveBeforeLeaving(); };
  window.addEventListener('pagehide', preservePage);
  restart();
  const unsubscribe = host.subscribeFrame(frame);
  const state = () => ({
    application: "llmx", environment: "llmx-nocturnal-forge", profile, activeId, worldName, revision: identity().revision, entrance: entrance.state(),
    face: disposed ? null : face.describe(), conversation: conversation.state(), saved, notice,
    math: mathLesson()?.config ?? null, lastAction: lastAction ?? null,
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
      window.removeEventListener('pagehide', preservePage);
      conversation.dispose();
      host.world.clearTransientEntities("llmx-presentation");
      entrance.dispose();
      unsubscribe();
      host.renderer.domElement.removeEventListener("pointerdown", interruptCamera);
      presentation.dispose();
      surface.remove();
      // Runtime owns the face and releases it on the next load/dispose.
    },
  };
}
