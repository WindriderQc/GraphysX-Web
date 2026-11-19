import { Vector3 } from "three";
import type { PlatformHost } from "./platform-host";
import { buildMaisonVisit, maisonLookCommands, maisonMaterialCommands, maisonViewCommands, MAISON_MODELS, MAISON_STOPS, type MaisonLight, type MaisonStop, type MaisonVisitView } from "./maison-visit";
import "./maison.css";

export type MaisonApplication = { state: () => unknown; advanceTime: (milliseconds: number) => unknown; dispose: () => void };
type Phase = "loading" | "visit" | "tour" | "paused" | "foreign" | "error";

/** A camera visit over the unchanged native compositions, authored through the shared API. */
export function mountMaison(root: HTMLElement, host: PlatformHost, onExit: () => void, onStudio: () => void): MaisonApplication {
  const { api } = host, reduced = matchMedia("(prefers-reduced-motion: reduce)"), compact = matchMedia("(max-width: 740px)");
  const old = { title: document.title, language: document.documentElement.lang, orbit: host.orbitEnabled, body: document.body.classList.contains("gx-maison-active") };
  document.title = "Maison & Cuisine · GraphysX"; document.documentElement.lang = "fr"; document.body.classList.add("gx-maison-active"); host.setOrbitEnabled(true);
  const surface = document.createElement("div"); surface.className = "gx-maison";
  surface.innerHTML = `<header class="gx-maison-header"><button type="button" data-maison-home>← Accueil</button><span>GraphysX <i>/</i> Archives <i>/</i> Maison & Cuisine</span><button type="button" data-maison-studio>Ouvrir dans le Studio ↗</button></header>
    <section class="gx-maison-card" aria-labelledby="gx-maison-title"><p class="gx-maison-eyebrow">DEUX COMPOSITIONS RETROUVÉES</p><h1 id="gx-maison-title">La maison.</h1>
      <p class="gx-maison-lead">Les volumes d’origine. Une visite à ton rythme.</p>
      <div class="gx-maison-choices" role="group" aria-label="Composition à visiter"><button type="button" data-maison-view="house">Maison · 24 pièces</button><button type="button" data-maison-view="kitchen">Cuisine · 76 pièces</button></div>
      <div class="gx-maison-choices gx-maison-light" role="group" aria-label="Ambiance lumineuse"><button type="button" data-maison-light="day">Lumière du jour</button><button type="button" data-maison-light="night">Lumière du soir</button></div>
      <div class="gx-maison-tour-actions"><button type="button" data-maison-tour>Balade guidée →</button><button type="button" data-maison-pause>Pause</button></div>
      <nav class="gx-maison-points" aria-label="Points de vue"><button type="button" data-maison-previous aria-label="Point de vue précédent">←</button><span data-maison-point></span><button type="button" data-maison-next aria-label="Point de vue suivant">→</button><button type="button" data-maison-recenter>Recentrer</button></nav>
      <p class="gx-maison-status" data-maison-status role="status" aria-live="polite"></p><button class="gx-maison-retry" type="button" data-maison-retry hidden>Réessayer le chargement</button>
      <details class="gx-maison-sources"><summary>Retrouvé, adapté, encore absent</summary><p>Les 24 pièces de Maison et les 76 pièces de Cuisine viennent de deux compositions Blender indépendantes. Géométries, placements, noms et couleurs diffuses restent ceux des exports.</p><p>Le sol de présentation, les lumières, la réponse lumineuse des matériaux et la balade sont des adaptations actuelles. La photo externe de Cuisine reste absente.</p><a data-maison-source target="_blank" rel="noopener noreferrer">Comparer avec la composition source ↗</a><p>Le Studio conserve le document complet, ses matières et tes objets ajoutés. Enregistre ou exporte pour garder tes modifications.</p></details>
      <p class="gx-maison-hint">Glisse pour tourner · pince ou molette pour zoomer</p>
    </section>`;
  root.append(surface);
  const button = (selector: string): HTMLButtonElement => surface.querySelector<HTMLButtonElement>(selector)!;
  const sources = surface.querySelector<HTMLDetailsElement>("details")!;
  const source = surface.querySelector<HTMLAnchorElement>("[data-maison-source]")!;
  const sourceUrl = new URL(import.meta.env.BASE_URL, location.href); sourceUrl.searchParams.set("app", "maison"); sourceUrl.searchParams.set("view", "source");
  const store = new URLSearchParams(location.search).get("store"); if (store) sourceUrl.searchParams.set("store", store); source.href = sourceUrl.href;
  let view: MaisonVisitView = new URLSearchParams(location.search).get("view") === "kitchen" ? "kitchen" : "house", look: MaisonLight = "day";
  let phase: Phase = "loading", ready = false, disposed = false, prepared = false, readyFrame: number | null = null, expectedWorld = "", index = 0;
  let remaining = 0, moving = false, dwell = 0, notice = "", lastUi = "";
  const owned = () => api.state()?.world.id === expectedWorld && api.query({ ids: [...MAISON_MODELS, "maison-house", "maison-kitchen"] }).length === 4;
  const stop = (message = "") => { host.cancelCameraMove(); moving = false; dwell = 0; remaining = 0; if (phase === "tour" || phase === "paused") phase = "visit"; notice = message; };
  const fitted = (stop: MaisonStop): MaisonStop => {
    if (!compact.matches) return stop;
    if (view === "kitchen") return { ...stop, target: [stop.target[0], Math.max(.25, stop.target[1] - .55), stop.target[2]] };
    const center = new Vector3(-2.8, 1.7, -.7), offset = new Vector3(...stop.position).sub(center).multiplyScalar(Math.max(1, .95 / host.camera.aspect));
    const position = center.clone().add(offset), target = center.clone();
    target.y -= 2 * offset.length() * Math.tan(host.camera.fov * Math.PI / 360) * .17;
    return { ...stop, position: position.toArray() as [number, number, number], target: target.toArray() as [number, number, number] };
  };
  const frame = (duration = 0) => { const point = fitted(MAISON_STOPS[view][index]); host.frameView(point.position, point.target, reduced.matches ? 0 : duration); };
  const point = (next: number, animated = true) => { if (!ready || !owned()) return; stop(); index = (next + MAISON_STOPS[view].length) % MAISON_STOPS[view].length; frame(animated ? .9 : 0); render(); };
  const render = () => {
    const status = phase === "loading" ? "Chargement des deux scènes…" : phase === "foreign" ? "La scène a changé. Ouvre le Studio pour la conserver."
      : phase === "error" ? notice || "Un modèle n’a pas pu se charger." : phase === "tour" ? "La balade avance. Glisse pour reprendre la caméra."
        : phase === "paused" ? "Balade en pause. Reprends quand tu veux." : notice || "Explore librement, ou laisse-toi guider.";
    const key = JSON.stringify([phase, ready, view, look, index, status, reduced.matches]); if (key === lastUi) return; lastUi = key;
    surface.dataset.phase = phase; surface.querySelector("h1")!.textContent = view === "house" ? "La maison." : "La cuisine.";
    surface.querySelector("[data-maison-status]")!.textContent = status;
    surface.querySelector("[data-maison-point]")!.textContent = `${index + 1} / ${MAISON_STOPS[view].length} · ${MAISON_STOPS[view][index].title}`;
    for (const control of surface.querySelectorAll<HTMLButtonElement>("[data-maison-view]")) { control.disabled = !ready; control.setAttribute("aria-pressed", String(control.dataset.maisonView === view)); }
    for (const control of surface.querySelectorAll<HTMLButtonElement>("[data-maison-light]")) { control.disabled = !ready; control.setAttribute("aria-pressed", String(control.dataset.maisonLight === look)); }
    for (const selector of ["[data-maison-tour]", "[data-maison-previous]", "[data-maison-next]", "[data-maison-recenter]"]) button(selector).disabled = !ready;
    button("[data-maison-tour]").textContent = phase === "tour" ? "Arrêter la balade" : reduced.matches ? "Voir le point suivant →" : "Balade guidée →";
    button("[data-maison-pause]").disabled = phase !== "tour" && phase !== "paused";
    button("[data-maison-pause]").textContent = phase === "paused" ? "Reprendre" : "Pause";
    button("[data-maison-retry]").hidden = phase !== "error";
    button("[data-maison-studio]").disabled = !api.exportDocument();
  };
  const create = (document = buildMaisonVisit(view, look)) => {
    stop(); phase = "loading"; ready = false; prepared = false; readyFrame = null; notice = "";
    const result = api.create(document); expectedWorld = document.id ?? api.state()?.world.id ?? "";
    if (!result.ok) { phase = "error"; notice = result.error ?? "Impossible de charger la visite."; }
    api.pause(true); host.applyEnvironment(); render();
  };
  const refresh = () => {
    if (disposed) return;
    if (!owned()) { stop(); phase = "foreign"; ready = false; render(); return; }
    const models = api.query({ ids: [...MAISON_MODELS] });
    const failure = models.find(model => model.asset?.status === "error");
    if (failure || host.renderer.getContext().isContextLost()) { stop(); phase = "error"; ready = false; notice = "Un modèle ou l’affichage n’a pas pu se charger. Le Studio permet de conserver cette scène."; render(); return; }
    if (phase === "loading" && models.every(model => model.asset?.status === "ready")) {
      if (!prepared) {
        const document = api.exportDocument(); if (!document) return;
        const result = api.transaction(maisonMaterialCommands(document, models));
        if (!result.ok) { phase = "error"; notice = result.error ?? "Impossible de préparer les matières."; render(); return; }
        prepared = true; readyFrame = null; frame(); render(); return;
      }
      readyFrame ??= host.frameCount;
      if (readyFrame !== null && host.frameCount >= readyFrame + 2 && host.diagnostics.snapshot().calls > 0) { ready = true; phase = "visit"; }
    } else if (phase === "loading") readyFrame = null;
    render();
  };
  const moveTour = () => {
    index = (index + 1) % MAISON_STOPS[view].length; moving = true; dwell = 0;
    host.framePath([fitted(MAISON_STOPS[view][index])], 4.2); render();
  };
  button("[data-maison-home]").addEventListener("click", onExit);
  button("[data-maison-studio]").addEventListener("click", () => { stop(); onStudio(); });
  for (const control of surface.querySelectorAll<HTMLButtonElement>("[data-maison-view]")) control.addEventListener("click", () => {
    if (!ready || !owned()) return; const next = control.dataset.maisonView as MaisonVisitView;
    const result = api.transaction(maisonViewCommands(next).filter(command => api.query({ ids: [command.id] }).length));
    if (!result.ok) { notice = result.error ?? "Impossible de changer de composition."; render(); return; }
    stop(); view = next; index = 0; frame();
    const url = new URL(location.href); if (view === "kitchen") url.searchParams.set("view", view); else url.searchParams.delete("view"); history.replaceState(null, "", url.pathname + url.search); render();
  });
  for (const control of surface.querySelectorAll<HTMLButtonElement>("[data-maison-light]")) control.addEventListener("click", () => {
    if (!ready || !owned()) return; const document = api.exportDocument(); if (!document) return;
    const next = control.dataset.maisonLight as MaisonLight, result = api.transaction(maisonLookCommands(document, next));
    if (result.ok) look = next; else notice = result.error ?? "Impossible de changer de lumière."; render();
  });
  button("[data-maison-tour]").addEventListener("click", () => {
    if (!ready || !owned()) return;
    if (phase === "tour" || phase === "paused") stop();
    else if (reduced.matches) point(index + 1, false);
    else { phase = "tour"; remaining = MAISON_STOPS[view].length; moveTour(); }
    render();
  });
  const pause = () => {
    if (phase === "tour") { host.cancelCameraMove(); phase = "paused"; }
    else if (phase === "paused") { phase = "tour"; moving = true; dwell = 0; host.framePath([fitted(MAISON_STOPS[view][index])], 3); }
    render();
  };
  button("[data-maison-pause]").addEventListener("click", pause);
  button("[data-maison-previous]").addEventListener("click", () => point(index - 1));
  button("[data-maison-next]").addEventListener("click", () => point(index + 1));
  button("[data-maison-recenter]").addEventListener("click", () => point(0, false));
  button("[data-maison-retry]").addEventListener("click", () => { if (!owned()) return; const document = api.exportDocument(); if (document) create(document); });
  const manual = () => { if (phase === "tour" || phase === "paused") { stop("La caméra est à toi."); render(); } };
  const key = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.altKey || event.metaKey || event.repeat || (event.target as HTMLElement | null)?.closest("input,textarea,select,[contenteditable=true]")) return;
    if (event.code === "Escape" && sources.open) { event.preventDefault(); sources.open = false; sources.querySelector("summary")?.focus(); return; }
    if ((event.code === "KeyP" || event.code === "Escape") && (phase === "tour" || phase === "paused")) { event.preventDefault(); event.stopPropagation(); pause(); }
  };
  const blur = () => { if (phase === "tour") pause(); };
  const visibility = () => { if (document.hidden) blur(); };
  const resize = () => { if (ready && owned()) { stop(); frame(); render(); } };
  const preference = () => { if (reduced.matches) { stop(); if (ready && owned()) frame(); } render(); };
  host.renderer.domElement.addEventListener("pointerdown", manual); host.renderer.domElement.addEventListener("wheel", manual, { passive: true });
  window.addEventListener("keydown", key); window.addEventListener("blur", blur); window.addEventListener("resize", resize); document.addEventListener("visibilitychange", visibility); reduced.addEventListener("change", preference);
  const unsubscribe = host.subscribeFrame(delta => {
    refresh(); if (phase !== "tour" || !ready) return;
    if (moving && !host.focusing) { moving = false; dwell = 0; remaining--; }
    if (!moving) { dwell += delta; if (dwell >= .8) { if (remaining > 0) moveTour(); else { stop("Balade terminée. Explore ou passe dans le Studio."); render(); } } }
  });
  create();
  const state = () => ({ id: "maison", phase, ready, view, look, point: index, pointTitle: MAISON_STOPS[view][index].title, remaining,
    camera: { position: host.camera.position.toArray(), target: host.orbitTarget.toArray(), moving: host.focusing },
    models: api.query({ ids: [...MAISON_MODELS] }).map(model => ({ id: model.id, status: model.asset?.status, slots: model.materialSlots?.length })),
    notice, provenance: { geometry: "24 + 76 original Blender parts", compositions: "independent source scenes", presentation: "modern lighting, stage and camera" } });
  return {
    state,
    advanceTime: milliseconds => { if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new RangeError("advanceTime requires non-negative milliseconds"); if (owned() && !api.state()?.paused) api.step(Math.min(60000, milliseconds) / 1000); refresh(); return state(); },
    dispose: () => {
      if (disposed) return; stop(); disposed = true; unsubscribe(); host.renderer.domElement.removeEventListener("pointerdown", manual); host.renderer.domElement.removeEventListener("wheel", manual);
      window.removeEventListener("keydown", key); window.removeEventListener("blur", blur); window.removeEventListener("resize", resize); document.removeEventListener("visibilitychange", visibility); reduced.removeEventListener("change", preference);
      host.setOrbitEnabled(old.orbit); document.title = old.title; document.documentElement.lang = old.language; document.body.classList.toggle("gx-maison-active", old.body); surface.remove();
    },
  };
}
