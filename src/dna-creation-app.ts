import type { PlatformHost } from "./platform-host";
import { Vector3 } from "three";
import { LOCAL_SCENE_PREFIX, readDnaCreationResume, readLocalSceneSlot, rememberDnaCreation } from "./local-scenes";
import { DNA_MUTATIONS, DNA_PAD_TOP, DNA_SEED_RADIUS, DNA_SIDES, composeDnaCreation, dnaCreationCanTune, dnaCreationMeasurements, dnaCreationMutation, dnaMutationCommands, dnaSeedResetCommands, type DnaMutation, type DnaSide } from "./dna-creation-scene";
import "./dna-creation.css";

export type DnaCreationApplication = { state: () => unknown; advanceTime: (milliseconds: number) => unknown; dispose: () => void };
type Drop = { falling: boolean; bounced: boolean; complete: boolean; peak: number | null; impactSpeed: number | null; lastVelocity: number };
const emptyDrop = (): Drop => ({ falling: false, bounced: false, complete: false, peak: null, impactSpeed: null, lastVelocity: 0 });

export function mountDnaCreation(root: HTMLElement, host: PlatformHost, onExit: () => void, resume: boolean): DnaCreationApplication {
  const { api } = host;
  const previousTitle = document.title;
  const previousLanguage = document.documentElement.lang;
  document.title = "Une mutation, un monde · GraphysX";
  document.documentElement.lang = "fr";
  let slot = resume ? readDnaCreationResume() : null;
  let notice = slot ? "Variante reprise. Tes modifications du Studio sont conservées." : "";
  if (slot && !api.load(slot.definition).ok) slot = null;
  if (!slot) {
    const created = api.create(composeDnaCreation());
    if (!created.ok) throw new Error(created.error ?? "L’atelier ADN ne s’est pas ouvert.");
    if (resume) notice = "La dernière variante est indisponible. Voici une nouvelle expérience ; ta sauvegarde reste intacte.";
  }
  api.pause(true);
  let baseline = JSON.stringify(api.exportDocument());
  let dirty = false;
  let leaving = false;
  let canTune = dnaCreationCanTune(api.exportDocument());
  let measurements = dnaCreationMeasurements(api.exportDocument());
  let phase: "ready" | "running" | "complete" | "incomplete" = "ready";
  let startedAt = 0;
  let observedAt = -1;
  let revision = api.state()?.revision;
  let drops: Record<DnaSide, Drop> = { reference: emptyDrop(), variant: emptyDrop() };
  const compact = matchMedia("(max-width: 740px)");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const surface = document.createElement("main");
  surface.className = "gx-dna";
  surface.setAttribute("aria-label", "Atelier ADN et physique");
  surface.innerHTML = `
    <header class="gx-dna-header"><button type="button" data-dna-exit>← Accueil</button><span>GraphysX <b>/</b> Atelier vivant</span><button type="button" data-dna-frame>Recentrer</button></header>
    <div class="gx-dna-scene-labels" aria-hidden="true"><span data-dna-label="reference">01 <b>Référence</b></span><span data-dna-label="variant">02 <b>Ta variante</b></span></div>
    <div class="gx-dna-peaks" aria-hidden="true"><span data-dna-peak="reference" hidden></span><span data-dna-peak="variant" hidden></span></div>
    <section class="gx-dna-card" aria-labelledby="gx-dna-title">
      <nav class="gx-dna-steps" aria-label="Étapes de création"><button type="button" data-dna-step="mutate">1 · Muter</button><button type="button" data-dna-step="observe">2 · Observer</button><button type="button" data-dna-step="save">3 · Garder</button></nav>
      <div class="gx-dna-body">
      <div class="gx-dna-kicker">ADN × PHYSIQUE <span>01 / PREMIÈRE CRÉATION</span></div>
      <h1 id="gx-dna-title">Une mutation,<br>un monde.</h1>
      <p class="gx-dna-intro">Change un gène. Observe ce qui pousse.<br>Emporte ta variante dans le Studio.</p>
      <fieldset class="gx-dna-mutations"><legend><span>1</span> Choisis une mutation</legend><div data-dna-choices></div></fieldset>
      <div class="gx-dna-comparison" data-dna-comparison></div>
      <section class="gx-dna-experiment" aria-labelledby="gx-dna-observe"><h2 id="gx-dna-observe"><span>2</span> Mets la hauteur à l’épreuve</h2>
        <p>Deux graines identiques, lâchées à la hauteur des branches. Même gravité, même rebond, sans air.</p>
        <div class="gx-dna-drop-actions"><button type="button" data-dna-drop>Libérer les graines ↓</button><button type="button" data-dna-pause disabled>Pause</button><button type="button" data-dna-reset aria-label="Replacer les graines" title="Replacer les graines">↺</button></div>
        <div class="gx-dna-readout" data-dna-readout></div>
        <p class="gx-dna-result" role="status" data-dna-result>Choisis une mutation, puis libère les graines.</p>
      </section>
      <form class="gx-dna-save" autocomplete="off"><label for="gx-dna-name"><span>3</span> Garde ta variante</label><div><input id="gx-dna-name" maxlength="64" required aria-describedby="gx-dna-storage"><button type="submit" data-dna-save>Enregistrer</button></div><small id="gx-dna-storage">Dans ce navigateur · scène complète et modifiable</small></form>
      <p class="gx-dna-notice" role="status" data-dna-notice></p>
      <a class="gx-dna-studio" data-dna-studio hidden>Ouvrir ma variante dans le Studio ↗</a>
      <details class="gx-dna-about"><summary>Comment ça marche ?</summary><p>Ce sont des arbres procéduraux : un gène règle leur forme. Les graines rebondissent sur les plateformes devant les arbres. Les feuilles ne sont pas des obstacles. Les mesures viennent de la simulation ; aucune sélection biologique n’est simulée.</p><p>Fais glisser la vue pour explorer. Enregistrer conserve les positions de départ, pour rejouer l’expérience.</p></details>
      </div>
    </section>`;
  root.append(surface);
  const find = <T extends HTMLElement>(selector: string): T => surface.querySelector<T>(selector)!;
  const nameInput = find<HTMLInputElement>("#gx-dna-name");
  nameInput.value = slot?.name ?? "Ma première mutation";
  const studio = find<HTMLAnchorElement>("[data-dna-studio]");
  const dropButton = find<HTMLButtonElement>("[data-dna-drop]");
  const pauseButton = find<HTMLButtonElement>("[data-dna-pause]");
  const number = (value: number) => value.toLocaleString("fr-CA", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const frame = (arrival = false) => {
    const position: [number, number, number] = compact.matches ? [0, 10.8, 30] : [0, 7.7, 17.5];
    const target: [number, number, number] = compact.matches ? [0, -3.6, 0.2] : [-2.5, 2.2, 0.2];
    if (arrival && !reduced.matches) host.framePath([
      { position: [12, 8.8, 20], target: [0, 2, 0] },
      { position: [5, 7.8, 19], target: [-1, 2, 0] }, { position, target },
    ], 2.1);
    else host.frameView(position, target, 0);
  };
  const dropReadout = (): void => {
    find("[data-dna-readout]").replaceChildren(...DNA_SIDES.map((side) => {
      const line = document.createElement("div");
      const title = document.createElement("b");
      title.textContent = side === "reference" ? "Référence" : "Ta variante";
      const metric = document.createElement("span");
      const drop = drops[side];
      metric.textContent = drop.peak === null ? "Rebond : —" : `Rebond observé : ${number(drop.peak)} u${drop.complete ? "" : "…"}`;
      line.append(title, metric);
      return line;
    }));
    const result = find("[data-dna-result]");
    let message: string;
    if (!canTune) message = "Cette scène a évolué dans le Studio. Ouvre-la pour continuer à la modifier.";
    else if (phase === "running") message = api.state()?.paused ? "Expérience en pause. Reprends quand tu veux." : "Observe la chute et le premier rebond…";
    else if (phase === "complete") {
      const difference = drops.variant.peak! - drops.reference.peak!;
      message = Math.abs(difference) < 0.03 ? "Hauteurs proches, rebonds proches. Essaie une autre mutation !" :
        `La variante rebondit ${number(Math.abs(difference))} u ${difference > 0 ? "plus haut" : "moins haut"}. La hauteur de départ change l’énergie de la chute.`;
    } else if (phase === "incomplete") message = "Le premier rebond n’a pas été observé complètement. Replace les graines et réessaie.";
    else message = "Prêt à comparer. 1 u = une unité de la scène.";
    if (result.textContent !== message) result.textContent = message;
  };
  const refresh = (): void => {
    const document = api.exportDocument();
    const mutation = dnaCreationMutation(document);
    surface.querySelectorAll<HTMLInputElement>("[name=dna-mutation]").forEach((input) => {
      input.checked = input.value === mutation?.id;
      input.disabled = !canTune || phase === "running";
    });
    const comparison = find("[data-dna-comparison]");
    comparison.replaceChildren(...DNA_SIDES.map((side) => {
      const item = window.document.createElement("div");
      const label = window.document.createElement("b");
      label.textContent = side === "reference" ? "Référence" : mutation?.name ?? "Ta variante";
      const metric = window.document.createElement("span");
      const value = measurements[side];
      metric.textContent = value ? `${number(value.height)} u · ${value.branches} branches` : "Arbre absent de la scène";
      item.append(label, metric); return item;
    }));
    const noticeElement = find("[data-dna-notice]");
    if (noticeElement.textContent !== notice) noticeElement.textContent = notice;
    let savedCurrent = false;
    try { savedCurrent = !!slot && localStorage.getItem(LOCAL_SCENE_PREFIX + slot.name) === slot.raw; } catch { /* Storage may be blocked after a successful save. */ }
    studio.hidden = !slot || dirty || !savedCurrent || nameInput.value.trim() !== slot.name;
    if (slot) studio.href = import.meta.env.BASE_URL + "?host=editor&paused=1&localScene=" + encodeURIComponent(slot.name);
    find<HTMLButtonElement>("[data-dna-save]").textContent = slot?.name === nameInput.value.trim() ? "Mettre à jour" : "Enregistrer";
    dropButton.disabled = !canTune || phase === "running";
    dropButton.textContent = phase === "complete" || phase === "incomplete" ? "Rejouer la chute ↓" : "Libérer les graines ↓";
    pauseButton.disabled = phase !== "running";
    pauseButton.textContent = phase === "running" && api.state()?.paused ? "Reprendre" : "Pause";
    find<HTMLButtonElement>("[data-dna-reset]").disabled = !canTune;
    dropReadout();
  };
  const observeDocument = () => {
    const document = api.exportDocument();
    dirty = JSON.stringify(document) !== baseline;
    revision = api.state()?.revision;
    canTune = dnaCreationCanTune(document);
    measurements = dnaCreationMeasurements(document);
  };
  const resetObservation = () => {
    phase = "ready"; drops = { reference: emptyDrop(), variant: emptyDrop() }; observedAt = -1;
  };
  const resetSeeds = (): boolean => {
    api.pause(true);
    const reset = api.transaction(dnaSeedResetCommands(api.exportDocument()));
    if (!reset.ok) { notice = "Les graines n’ont pas pu être replacées. Ta scène est conservée."; refresh(); return false; }
    resetObservation(); observeDocument(); return true;
  };
  const choose = (mutation: DnaMutation): void => {
    if (!canTune || phase === "running") return;
    api.pause(true);
    const result = api.transaction([...dnaMutationCommands(mutation), ...dnaSeedResetCommands(api.exportDocument(), ["reference"])]);
    if (!result.ok) notice = "Cette mutation n’a pas pu être appliquée. Ta scène est conservée.";
    else { resetObservation(); notice = `${mutation.name} : ${mutation.description} Compare les deux arbres.`; }
    observeDocument(); refresh();
  };
  for (const mutation of DNA_MUTATIONS) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio"; input.name = "dna-mutation"; input.value = mutation.id;
    const name = document.createElement("b"); name.textContent = mutation.name;
    const hint = document.createElement("small"); hint.textContent = mutation.description;
    const text = document.createElement("span"); text.append(name, hint);
    label.append(input, text); find("[data-dna-choices]").append(label);
    input.addEventListener("change", () => choose(mutation));
  }
  surface.querySelectorAll<HTMLButtonElement>("[data-dna-step]").forEach((button) => button.addEventListener("click", () => {
    const target = button.dataset.dnaStep === "mutate" ? find("fieldset") : button.dataset.dnaStep === "observe" ? find(".gx-dna-experiment") : find("form");
    target.scrollIntoView({ block: "start", behavior: reduced.matches ? "instant" : "smooth" });
    if (button.dataset.dnaStep === "save") nameInput.focus({ preventScroll: true });
  }));
  dropButton.addEventListener("click", () => {
    if (!canTune || !resetSeeds()) return;
    phase = "running"; startedAt = api.state()!.elapsedSeconds; observedAt = startedAt;
    api.pause(false); refresh();
  });
  pauseButton.addEventListener("click", () => { if (phase === "running") api.pause(!api.state()?.paused); refresh(); });
  find("[data-dna-reset]").addEventListener("click", () => { if (canTune) resetSeeds(); refresh(); });
  nameInput.addEventListener("input", refresh);
  find<HTMLFormElement>("form").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    if (!name) { notice = "Choisis un nom pour ta variante."; refresh(); return; }
    try {
      const existing = localStorage.getItem(LOCAL_SCENE_PREFIX + name);
      if (existing !== null && (slot?.name !== name || slot.raw !== existing)) {
        notice = "Ce nom est déjà utilisé ou la scène a changé dans un autre onglet. Choisis un nouveau nom pour garder une copie.";
      } else {
        const saved = api.save(name);
        if (!saved.ok) throw new Error("L’enregistrement est indisponible. Ta variante est encore ouverte ; garde cet onglet.");
        const written = readLocalSceneSlot(name);
        const current = JSON.stringify(api.exportDocument());
        if (!written || written.raw !== current) throw new Error("La copie enregistrée n’a pas pu être vérifiée. Ta variante reste ouverte.");
        slot = written; baseline = current; dirty = false; nameInput.value = name;
        notice = rememberDnaCreation(name) ? "Variante enregistrée. Ouvre-la dans le Studio ou reprends-la depuis l’accueil." : "Variante enregistrée. Ouvre-la dans le Studio ; le raccourci de reprise est indisponible.";
      }
    } catch (error) { notice = error instanceof Error ? error.message : "L’enregistrement est indisponible. Ta variante reste ouverte."; }
    refresh();
    if (!studio.hidden) studio.scrollIntoView({ block: "nearest" });
  });
  const sample = (): void => {
    const state = api.state();
    if (!state) return;
    if (state.revision !== revision) {
      observeDocument();
      if (phase === "running") { api.pause(true); phase = "incomplete"; }
      else resetObservation();
      refresh();
    }
    if (phase !== "running" || state.paused || state.elapsedSeconds <= observedAt) return;
    observedAt = state.elapsedSeconds;
    for (const side of DNA_SIDES) {
      const seed = api.query({ ids: ["dna-seed-" + side] })[0];
      const drop = drops[side];
      const velocity = seed?.physics?.linearVelocity?.[1];
      if (!seed || velocity === undefined || drop.complete) continue;
      if (velocity < -0.1 && !drop.bounced) drop.falling = true;
      if (drop.falling && !drop.bounced && velocity > 0.1) {
        drop.bounced = true; drop.impactSpeed = Math.abs(drop.lastVelocity);
      }
      if (drop.bounced) {
        drop.peak = Math.max(drop.peak ?? 0, seed.position[1] - DNA_PAD_TOP - DNA_SEED_RADIUS);
        if (velocity < -0.01) drop.complete = true;
      }
      drop.lastVelocity = velocity;
    }
    if (DNA_SIDES.every((side) => drops[side].complete)) { phase = "complete"; api.pause(true); refresh(); }
    else if (state.elapsedSeconds - startedAt > 8) { phase = "incomplete"; api.pause(true); refresh(); }
    else dropReadout();
  };
  const unsubscribe = host.subscribeFrame(sample);
  const labelPoint = new Vector3();
  const placeLabels = () => {
    const bounds = root.getBoundingClientRect();
    for (const side of DNA_SIDES) {
      const label = find<HTMLElement>(`[data-dna-label=${side}]`);
      const tree = api.query({ ids: ["dna-" + side] })[0];
      if (!tree || !measurements[side]) { label.hidden = true; find<HTMLElement>(`[data-dna-peak=${side}]`).hidden = true; continue; }
      labelPoint.set(tree.position[0], tree.position[1] + measurements[side]!.height + 0.5, tree.position[2]).project(host.camera);
      const x = (labelPoint.x + 1) * bounds.width / 2;
      const y = (1 - labelPoint.y) * bounds.height / 2;
      label.hidden = labelPoint.z < -1 || labelPoint.z > 1 || x < 55 || x > bounds.width - 55 || y < 75 || y > bounds.height - 20;
      label.style.left = x + "px"; label.style.top = y + "px";
      const peak = find<HTMLElement>(`[data-dna-peak=${side}]`);
      peak.hidden = phase !== "complete";
      const seed = api.query({ ids: ["dna-seed-" + side] })[0];
      if (!peak.hidden && seed && drops[side].peak !== null) {
        labelPoint.set(seed.position[0], drops[side].peak! + DNA_PAD_TOP + DNA_SEED_RADIUS, seed.position[2]).project(host.camera);
        const px = (labelPoint.x + 1) * bounds.width / 2, py = (1 - labelPoint.y) * bounds.height / 2;
        const outside = side === "reference" ? px < 10 || px > bounds.width - 90 : px < 90 || px > bounds.width - 10;
        peak.hidden = labelPoint.z < -1 || labelPoint.z > 1 || outside || py < 70 || py > bounds.height - 20;
        peak.style.left = px + "px"; peak.style.top = py + "px"; peak.textContent = number(drops[side].peak!) + " u";
      }
    }
  };
  const unsubscribeLabels = host.subscribeAfterRender(placeLabels);
  const warnBeforeLeaving = (event: BeforeUnloadEvent): void => {
    if (dirty && !leaving) { event.preventDefault(); event.returnValue = true; }
  };
  find("[data-dna-exit]").addEventListener("click", () => {
    if (dirty && !confirm("Ta variante a changé. Retourner à l’accueil sans enregistrer ces modifications ?")) return;
    leaving = true; onExit();
  });
  const reframe = () => frame();
  const motionPreference = () => { if (reduced.matches) frame(); };
  find("[data-dna-frame]").addEventListener("click", reframe);
  compact.addEventListener("change", reframe);
  reduced.addEventListener("change", motionPreference);
  window.addEventListener("beforeunload", warnBeforeLeaving);
  window.addEventListener("storage", refresh);
  frame(!resume); refresh();
  return {
    state: () => ({ application: "dna", mutation: dnaCreationMutation(api.exportDocument())?.id ?? null, savedName: slot?.name ?? null, dirty, canTune,
      phase, paused: api.state()?.paused, measurements, drops, units: "Scene units; bounce is observed seed-center height minus radius and platform top. Authored launch poses are saved." }),
    advanceTime(milliseconds) {
      if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 60_000 || api.state()?.paused) return;
      let remaining = milliseconds / 1000;
      while (remaining > 1e-9 && !api.state()?.paused) {
        const seconds = Math.min(1 / 60, remaining); api.step(seconds); remaining -= seconds; sample();
      }
    },
    dispose() {
      unsubscribe(); unsubscribeLabels(); compact.removeEventListener("change", reframe); reduced.removeEventListener("change", motionPreference);
      window.removeEventListener("beforeunload", warnBeforeLeaving); window.removeEventListener("storage", refresh);
      surface.remove(); document.title = previousTitle; document.documentElement.lang = previousLanguage;
    },
  };
}
