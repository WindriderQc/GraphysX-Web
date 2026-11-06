import type { PlatformHost } from "./platform-host";
import { LOCAL_SCENE_PREFIX, readFirstCreationResume, readLocalSceneSlot, rememberFirstCreation, type LocalSceneSlot } from "./local-scenes";
import { FIRST_CREATION_TONES, composeFirstCreation, firstCreationCanTune, firstCreationTone, firstCreationToneCommands, type FirstCreationTone } from "./first-creation-scene";
import "./first-creation.css";

export type FirstCreationApplication = {
  state: () => unknown;
  advanceTime: (milliseconds: number) => unknown;
  dispose: () => void;
};

export function mountFirstCreation(root: HTMLElement, host: PlatformHost, onExit: () => void, resume: boolean): FirstCreationApplication {
  const { api } = host;
  const previousTitle = document.title;
  const previousLanguage = document.documentElement.lang;
  document.title = "Jardin des lucioles · GraphysX";
  document.documentElement.lang = "fr";

  let slot = resume ? readFirstCreationResume() : null;
  let notice = slot ? "Scène reprise. Tu peux continuer à la façonner." : "";
  if (slot) {
    const restored = api.load(slot.definition);
    if (!restored.ok) slot = null;
  }
  if (!slot) {
    const created = api.create(composeFirstCreation());
    if (!created.ok) throw new Error(created.error ?? "Le jardin ne s’est pas ouvert.");
    if (resume) notice = "La dernière scène est indisponible. Voici un nouveau jardin.";
  }

  let baseline = JSON.stringify(api.exportDocument());
  let dirty = false;
  let leaving = false;
  const canTune = firstCreationCanTune(api.exportDocument());
  const compact = window.matchMedia("(max-width: 740px)");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) api.pause(true);

  const surface = document.createElement("main");
  surface.className = "gx-creation";
  surface.setAttribute("aria-label", "Premier atelier GraphysX");
  surface.innerHTML = `
    <header class="gx-creation-head">
      <button type="button" class="gx-creation-back" data-creation-exit>← Centre GraphysX</button>
      <span class="gx-creation-edition"><span></span> Atelier / 01</span>
    </header>
    <div class="gx-creation-legend"><span>01</span><span>Jardin des lucioles</span><small>Fais glisser la scène pour l’observer.</small></div>
    <section class="gx-creation-card" aria-labelledby="gx-creation-title">
      <div class="gx-creation-kicker"><span>N</span> Nestor · première création</div>
      <h1 id="gx-creation-title">Jardin des lucioles</h1>
      <p class="gx-creation-intro">Choisis la lumière du jardin. Les anneaux, le cœur et les lucioles prennent sa couleur.</p>
      <div class="gx-creation-step"><span>01</span> Ambiance</div>
      <div class="gx-creation-tones" data-creation-tones role="group" aria-label="Ambiance du jardin"></div>
      <form class="gx-creation-form" autocomplete="off">
        <label for="gx-creation-name"><span>02</span> Donne un nom à ta scène</label>
        <div class="gx-creation-save">
          <input id="gx-creation-name" maxlength="64" required>
          <button type="submit" data-creation-save>Enregistrer</button>
        </div>
      </form>
      <p class="gx-creation-status" role="status" data-creation-status></p>
      <div class="gx-creation-foot">
        <button type="button" data-creation-frame>Recentrer</button>
        <button type="button" data-creation-motion></button>
        <a data-creation-editor hidden>Ouvrir dans l’éditeur ↗</a>
      </div>
    </section>`;
  root.append(surface);
  const find = <T extends HTMLElement>(selector: string): T => surface.querySelector<T>(selector)!;
  const nameInput = find<HTMLInputElement>("#gx-creation-name");
  const status = find("[data-creation-status]");
  const palette = find("[data-creation-tones]");
  const editor = find<HTMLAnchorElement>("[data-creation-editor]");
  const motionButton = find<HTMLButtonElement>("[data-creation-motion]");
  const saveButton = find<HTMLButtonElement>("[data-creation-save]");
  nameInput.value = slot?.name ?? "Mon jardin des lucioles";
  const frame = () => {
    if (compact.matches) host.frameView([9.5, 6.1, 13.1], [0, -0.26, 0], 0);
    else host.frameView([8.2, 6.1, 13.7], [-2.8, 1.44, 1.85], 0);
  };
  const refresh = (): void => {
    const tone = firstCreationTone(api.exportDocument());
    surface.style.setProperty("--creation-accent", tone?.color ?? FIRST_CREATION_TONES[0].color);
    palette.querySelectorAll<HTMLButtonElement>("button").forEach((button) =>
      button.setAttribute("aria-pressed", String(button.dataset.tone === tone?.id)));
    status.textContent = notice || (slot ? "Enregistrée dans ce navigateur." : "Ta scène sera enregistrée dans ce navigateur.");
    editor.hidden = !slot || dirty;
    if (slot) editor.href = import.meta.env.BASE_URL + "?host=editor&localScene=" + encodeURIComponent(slot.name);
    saveButton.textContent = slot?.name === nameInput.value.trim() ? "Mettre à jour" : "Enregistrer";
    motionButton.textContent = api.state()?.paused ? "Animer" : "Pause";
  };
  const setTone = (tone: FirstCreationTone): void => {
    const result = api.transaction(firstCreationToneCommands(tone));
    dirty = JSON.stringify(api.exportDocument()) !== baseline;
    notice = result.ok ? (dirty ? "Ambiance " + tone.name + " · à enregistrer." : "Ambiance " + tone.name + ".") :
      (result.error ?? "Cette ambiance est indisponible.");
    refresh();
  };

  for (const tone of FIRST_CREATION_TONES) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.tone = tone.id;
    button.disabled = !canTune;
    button.style.setProperty("--tone", tone.color);
    const dot = document.createElement("span");
    dot.setAttribute("aria-hidden", "true");
    button.append(dot, tone.name);
    button.addEventListener("click", () => setTone(tone));
    palette.append(button);
  }
  if (!canTune) notice = "Cette scène a évolué dans l’éditeur. Tu peux l’y ouvrir ou l’enregistrer sous un autre nom.";
  nameInput.addEventListener("input", refresh);
  find<HTMLFormElement>("form").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    if (!name) { notice = "Choisis un nom pour ta scène."; refresh(); return; }
    try {
      const existing = window.localStorage.getItem(LOCAL_SCENE_PREFIX + name);
      if (existing !== null && (slot?.name !== name || slot.raw !== existing)) {
        notice = "Ce nom est déjà utilisé ou la scène a changé dans un autre onglet. Choisis un nouveau nom pour garder une copie.";
      } else {
        const saved = api.save(name);
        if (!saved.ok) throw new Error("L’enregistrement est indisponible. Ta scène est encore ouverte.");
        const written: LocalSceneSlot | null = readLocalSceneSlot(name);
        if (!written) throw new Error("La copie enregistrée n’a pas pu être relue.");
        slot = written;
        baseline = JSON.stringify(api.exportDocument());
        dirty = false;
        nameInput.value = name;
        notice = rememberFirstCreation(name) ? "Scène enregistrée. Retrouve-la avec « Reprendre » au Centre." :
          "Scène enregistrée. Elle est disponible dans les scènes locales de l’éditeur.";
      }
    } catch (error) {
      notice = error instanceof Error ? error.message : "L’enregistrement est indisponible.";
    }
    refresh();
  });

  find("[data-creation-exit]").addEventListener("click", () => {
    if (dirty && !window.confirm("Ton ambiance a changé. Retourner au Centre sans enregistrer cette modification ?")) return;
    leaving = true;
    onExit();
  });
  const warnBeforeLeaving = (event: BeforeUnloadEvent): void => {
    if (!dirty || leaving) return;
    event.preventDefault();
    event.returnValue = true;
  };
  find("[data-creation-frame]").addEventListener("click", frame);
  motionButton.addEventListener("click", () => { api.pause(!api.state()?.paused); refresh(); });
  compact.addEventListener("change", frame);
  window.addEventListener("beforeunload", warnBeforeLeaving);
  frame();
  refresh();

  return {
    state: () => ({ application: "creation", tone: firstCreationTone(api.exportDocument())?.id ?? null, savedName: slot?.name ?? null, dirty }),
    advanceTime: (milliseconds) => api.step(milliseconds / 1000),
    dispose() {
      compact.removeEventListener("change", frame);
      window.removeEventListener("beforeunload", warnBeforeLeaving);
      surface.remove();
      document.title = previousTitle;
      document.documentElement.lang = previousLanguage;
    },
  };
}
