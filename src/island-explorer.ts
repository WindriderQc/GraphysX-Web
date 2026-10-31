import { EXPLORER_CATEGORIES, filterExplorerItems, type ExplorerItem, type ExplorerModel } from "./island-explorer-data";
import { describeWorldAction } from "./island-world-feed";
import "./island-explorer.css";
import { islandWorkspace, type WorkspaceView } from "./island-workspace";
import type { ObservedChange } from "./island-workspace-data";

type ExplorerOptions = {
  initialOpen: boolean;
  dashboard: string | null;
  select: (item: ExplorerItem | null) => void;
  focus: (item: ExplorerItem) => void;
  follow: (item: ExplorerItem) => void;
  overview: () => void;
  seek: (tick: number) => void;
  runId?: string | null;
};
const esc = (value: unknown): string => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const categoryName = (id: string): string => EXPLORER_CATEGORIES.find(c => c[0] === id)?.[1] || "Éléments";

export function mountIslandExplorer(surface: HTMLElement, options: ExplorerOptions) {
  const panel = document.createElement("aside");
  panel.className = "gx-island-explorer";
  panel.id = "island-explorer";
  panel.setAttribute("aria-label", "Explorateur de l’île");
  panel.innerHTML = `<header class="ix-head"><div><span class="ix-eyebrow">EXPLORER</span><h2 data-ix-world>Connexion à l’île…</h2></div>
    <button type="button" data-ix-close aria-label="Fermer l’explorateur">Fermer</button></header>
    <nav class="ix-views" aria-label="Vues de l’île">${[["explore", "Explorer"], ["map", "Carte"], ["timeline", "Chronologie"], ["lineage", "Lignées"], ["compare", "Comparer"]].map(([id, label]) => `<button type="button" data-ix-view="${id}" aria-pressed="${id === "explore"}">${label}</button>`).join("")}</nav>
    <p class="ix-status" role="status" data-ix-status>En attente des données du monde</p>
    <label class="ix-search">Rechercher dans l’île<input type="search" placeholder="Eko, arbre, bloc, génération…" data-ix-search></label>
    <nav class="ix-breadcrumb" aria-label="Position dans l’explorateur" data-ix-breadcrumb></nav>
    <div class="ix-body" data-ix-content></div>
    <footer class="ix-footer">Lecture seule · les gestes d’Eko restent les siens.
      ${options.dashboard ? `<a href="${esc(options.dashboard)}" target="_blank" rel="noopener" data-ix-memory>Parties et mémoire ↗</a>` : ""}</footer>`;
  surface.append(panel);
  const get = <T extends HTMLElement>(selector: string): T => panel.querySelector<T>(selector)!;
  const toggle = surface.querySelector<HTMLButtonElement>('[data-action="explore"]')!;
  let open = options.initialOpen;
  let model: ExplorerModel | null = null;
  let selected: string | null = null;
  let category: string | null = null;
  let query = "";
  let rendered = "";
  let renderedNav = "";
  let view: WorkspaceView = "explore";
  let changes: ObservedChange[] = [];
  const workspace = islandWorkspace({ select: id => select(id), focus: options.focus, seek: options.seek });

  const setOpen = (value: boolean): void => {
    open = value;
    panel.hidden = !open;
    surface.dataset.exploring = String(open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-controls", panel.id);
    if (open && model) render();
  };
  const select = (id: string | null): void => {
    selected = id;
    const item = model?.items.find(row => row.id === id) || null;
    if (item) category = item.category;
    options.select(item);
    rendered = "";
    setOpen(true);
    render();
  };
  const listRow = (item: ExplorerItem): string => `<button type="button" class="ix-item" data-ix-select="${esc(item.id)}">
    <span><b>${esc(item.name)}</b><small>${esc(item.kind === "bird" ? "Individu de la volée" : categoryName(item.category))}${item.visible ? "" : " · invisible"}</small></span><span aria-hidden="true">↗</span></button>`;

  const render = (): void => {
    if (!model) return;
    panel.dataset.view = view;
    get("[data-ix-world]").textContent = model.label;
    get("[data-ix-status]").textContent = `${model.mode} · ${model.connected ? `${model.items.length} éléments` : "Flux interrompu ou figé · dernière observation"} · ${Math.floor(model.tick / model.tickHz)} s · observation ${model.ageMs !== undefined ? `il y a ${Math.max(0, Math.floor(model.ageMs / 1000))} s` : "non datée"} · instance ${model.instanceId || "non transmise (ancien flux)"}${options.runId ? ` · partie ${options.runId}` : ""}`;
    for (const tab of panel.querySelectorAll<HTMLElement>("[data-ix-view]")) tab.setAttribute("aria-pressed", String(tab.dataset.ixView === view));
    const item = model.items.find(row => row.id === selected);
    const results = filterExplorerItems(model, category, query);
    const relationships = item?.relations.map(r => `${r.label}:${r.id}`).join("|");
    const fields = item?.properties.map(p => `${p.group}:${p.label}`).join("|");
    const children = model.items.filter(row => row.parent === selected);
    const key = JSON.stringify([view, view === "timeline" ? [changes.length, model.messages?.length] : null, view === "timeline" ? model.actions.at(-1)?.id || model.actions.at(-1)?.tick : null, model.key, selected, category, query, fields, relationships,
      results.map(row => [row.id, row.name, row.visible, row.kind]), children.map(row => row.id), model.counts]);
    const navKey = JSON.stringify([model.key, selected, category, item?.name]);
    const navigationChanged = navKey !== renderedNav;
    if (navigationChanged) {
      renderedNav = navKey;
      get("[data-ix-breadcrumb]").innerHTML = `<button type="button" data-ix-home>Île</button>${category ? ` <span>›</span> <button type="button" data-ix-category="${esc(category)}">${esc(categoryName(category))}</button>` : ""}${item ? ` <span>›</span><span aria-current="page">${esc(item.name)}</span>` : ""}`;
    }
    if (key !== rendered) {
      rendered = key;
      const content = get("[data-ix-content]");
      const focused = content.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
      const focusData = focused ? Object.entries(focused.dataset).filter(([key]) => key !== "eventTarget") : [];
      const scrollTop = content.scrollTop;
      if (view !== "explore") {
        content.innerHTML = workspace.render(view, model, selected, changes);
        if (item) content.innerHTML += `<section class="ix-linked-detail"><h3>${esc(item.name)}</h3><p class="ix-hint">${esc(categoryName(item.category))}</p><div class="ix-controls"><button type="button" data-ix-focus>Centrer la caméra</button><button type="button" data-ix-view="explore">Ouvrir la fiche</button></div></section>`;
      } else if (selected && !item) {
        content.innerHTML = `<div class="ix-empty"><h3>Élément absent</h3><p>Il n’est plus présent à ce moment du monde. La reprise ou une nouvelle île peut avoir changé son contenu.</p><button type="button" data-ix-home>Revenir à l’île</button></div>`;
      } else if (item) {
        const groups = [...new Set(item.properties.map(p => p.group))].sort((a, b) => Number(a === "Physique") - Number(b === "Physique"));
        content.innerHTML = `<div class="ix-detail-head"><span class="ix-eyebrow">${esc(categoryName(item.category))}</span><h3>${esc(item.name)}</h3>
          <div class="ix-controls"><button type="button" data-ix-focus${item.position ? "" : " disabled"}>Centrer la caméra</button>${item.category === "agents" ? '<button type="button" data-ix-follow>Suivre cet agent</button>' : ""}</div></div>
          ${!model.metadata ? '<p class="ix-hint">Cet enregistrement ne transmet pas les données détaillées. Les formes et positions restent consultables.</p>' : ""}
          ${item.relations.length ? `<section><h4>Relations et lignée</h4><div class="ix-relations">${item.relations.map(r => `<button type="button" data-ix-select="${esc(r.id)}">${esc(r.label)} · ${esc(model!.items.find(row => row.id === r.id)?.name || r.id)} →</button>`).join("")}</div></section>` : ""}
          ${groups.map(group => `<section class="ix-properties"><h4>${esc(group)}</h4><dl>${item.properties.map((p, index) => p.group === group ? `<div><dt>${esc(p.label)}</dt><dd data-ix-value="${index}"></dd></div>` : "").join("")}</dl></section>`).join("")}
          ${children.length ? `<section><h4>Éléments de ${esc(item.name)} (${children.length})</h4><div class="ix-list">${children.map(listRow).join("")}</div></section>` : ""}
          <section><h4>${item.category === "agents" ? "Activité de cet agent" : "Activité du monde"}</h4><ol class="ix-log" data-ix-log></ol></section>
          <details class="ix-raw"><summary>Données source</summary><pre data-ix-raw></pre></details>`;
      } else if (!category && !query) {
        content.innerHTML = `<div class="ix-intro"><h3>Une île à explorer</h3><p>Choisis une catégorie ou clique sur un élément dans la scène pour ouvrir sa fiche.</p><button type="button" data-ix-overview>Vue d’ensemble en 3D</button></div>
          <div class="ix-categories">${EXPLORER_CATEGORIES.map(([id, name, hint]) => `<button type="button" data-ix-category="${id}" class="ix-category"><span>${esc(name)}</span><b>${model!.counts[id]}</b><small>${esc(hint)}</small></button>`).join("")}</div>
          <section><h4>Activité du monde</h4><ol class="ix-log" data-ix-log></ol></section>`;
      } else {
        content.innerHTML = `<div class="ix-list-head"><h3>${esc(category ? categoryName(category) : "Résultats")}</h3><span>${results.length} élément${results.length > 1 ? "s" : ""}</span></div>
          ${results.length ? `<div class="ix-list">${results.map(listRow).join("")}</div>` : '<p class="ix-empty">Aucun élément dans cette catégorie ou pour cette recherche.</p>'}`;
      }
      content.scrollTop = navigationChanged && view === "explore" ? 0 : scrollTop;
      if (focusData.length) {
        const candidates = [...content.querySelectorAll<HTMLElement>("button,input,select,[tabindex]")];
        candidates.find(n => focusData.every(([key, value]) => n.dataset[key] === value))?.focus({ preventScroll: true });
      }
    }
    if (view === "timeline") workspace.refreshTimeline(get("[data-ix-content]"), model);
    if (view === "map") workspace.refreshMap(get("[data-ix-content]"), model);
    if (item) {
      for (const [index, property] of item.properties.entries()) {
        const field = panel.querySelector<HTMLElement>(`[data-ix-value="${index}"]`);
        if (field && field.textContent !== property.value) field.textContent = property.value;
      }
      const raw = panel.querySelector<HTMLElement>("[data-ix-raw]");
      if (raw?.closest("details")?.open) raw.textContent = JSON.stringify(item.raw, null, 2);
    }
    const log = panel.querySelector<HTMLElement>("[data-ix-log]");
    if (log) {
      const actions = model.actions.filter(action => action.tick <= model!.tick && (item?.category !== "agents" || action.agent === item.name)).slice(-8).reverse();
      const html = actions.map(action => `<li><time>${Math.floor(action.tick / model!.tickHz)} s</time> <b>${esc(action.agent)}</b> · ${esc(describeWorldAction(action))}</li>`).join("") || '<li class="ix-hint">Aucune action reçue pour ce moment.</li>';
      if (log.innerHTML !== html) log.innerHTML = html;
    }
  };

  toggle.addEventListener("click", () => setOpen(!open));
  get("[data-ix-search]").addEventListener("input", event => {
    query = (event.target as HTMLInputElement).value;
    view = "explore"; selected = null; options.select(null);
    render();
  });
  panel.addEventListener("click", event => {
    const memoryLink = (event.target as HTMLElement).closest("[data-ix-memory]");
    if (memoryLink && options.dashboard && options.runId && window.parent !== window) {
      event.preventDefault(); window.parent.postMessage({ type: "graphysx:island:memory", runId: options.runId }, new URL(options.dashboard).origin); return;
    }
    const target = (event.target as HTMLElement).closest<HTMLElement>("button,[data-ix-select],[data-event-tick]");
    if (!target) return;
    if (target.dataset.ixView) { view = target.dataset.ixView as WorkspaceView; rendered = ""; render(); }
    else if (model && workspace.handle(target, model, selected)) { rendered = ""; render(); }
    else if (target.hasAttribute("data-ix-close")) { setOpen(false); toggle.focus(); }
    else if (target.hasAttribute("data-ix-home")) { view = "explore"; selected = null; category = null; options.select(null); render(); }
    else if (target.dataset.ixCategory) { view = "explore"; category = target.dataset.ixCategory; selected = null; options.select(null); render(); }
    else if (target.dataset.ixSelect) select(target.dataset.ixSelect);
    else if (target.hasAttribute("data-ix-overview")) options.overview();
    else {
      const item = model?.items.find(row => row.id === selected);
      if (item && target.hasAttribute("data-ix-focus")) options.focus(item);
      if (item && target.hasAttribute("data-ix-follow")) options.follow(item);
    }
  });
  panel.addEventListener("change", event => {
    if (model && workspace.handle(event.target as HTMLElement, model, selected)) { rendered = ""; render(); }
  });
  panel.addEventListener("keydown", event => {
    const target = event.target as HTMLElement;
    if ((event.key === "Enter" || event.key === " ") && target.tagName.toLowerCase() === "g" && target.dataset.ixSelect) { event.preventDefault(); select(target.dataset.ixSelect); }
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      const tab = target.closest<HTMLElement>(".ix-views button");
      if (tab) { const tabs = [...panel.querySelectorAll<HTMLElement>(".ix-views button")]; tabs[(tabs.indexOf(tab) + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length].focus(); event.preventDefault(); }
    }
  });
  const escape = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || !open || event.defaultPrevented) return;
    if (selected) select(null);
    else { setOpen(false); toggle.focus(); }
  };
  document.addEventListener("keydown", escape);
  setOpen(open);
  return {
    select,
    restoreVisibility(): void { setOpen(open); },
    update(next: ExplorerModel, observed: ObservedChange[] = []): void {
      changes = observed;
      if (model && model.key !== next.key) { selected = null; category = null; options.select(null); }
      model = next;
      const target = workspace.selectionAfterSeek(next);
      if (target) select(target);
      if (open) render();
    },
    state: () => ({ open, view, selected, category, query, items: model?.items.length || 0, counts: model?.counts || {} }),
    dispose(): void { document.removeEventListener("keydown", escape); panel.remove(); },
  };
}
