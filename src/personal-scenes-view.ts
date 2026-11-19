import { browserSceneStorage, copyPersonalScene, personalScenes, readPersonalScene, type PersonalSceneEntry, type PersonalSceneResult } from "./personal-scenes";

const button = (text: string, action: () => void, className = ""): HTMLButtonElement => {
  const element = document.createElement("button"); element.type = "button"; element.textContent = text; element.className = className;
  element.addEventListener("click", action); return element;
};

function modal(container: HTMLElement, name: string, onClose?: () => void): { overlay: HTMLDivElement; dialog: HTMLDivElement; close: () => void } {
  const previous = document.activeElement;
  const overlay = document.createElement("div"); overlay.className = "gx-personal";
  const dialog = document.createElement("div"); dialog.className = "gx-personal-dialog"; dialog.tabIndex = -1;
  dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "true"); dialog.setAttribute("aria-label", name);
  const style = document.createElement("style"); style.textContent = PERSONAL_CSS;
  overlay.append(style, dialog); container.append(overlay);
  let closed = false;
  const close = (): void => {
    if (closed) return; closed = true; overlay.remove(); onClose?.();
    if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
  };
  overlay.addEventListener("keydown", event => {
    event.stopPropagation();
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault(); dialog.querySelector("form")?.requestSubmit(); return;
    }
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key !== "Tab") return;
    const targets = [...dialog.querySelectorAll<HTMLElement>("button,input,select,a[href],[tabindex='0']")]
      .filter(element => !element.matches(":disabled") && element.getClientRects().length > 0);
    const first = targets[0], last = targets.at(-1);
    if (!first || !last) { event.preventDefault(); dialog.focus(); return; }
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  });
  return { overlay, dialog, close };
}

export function mountSceneSaveDialog(container: HTMLElement, options: {
  name: string; copy?: boolean; onSave: (name: string) => PersonalSceneResult;
  onSaved: (entry: PersonalSceneEntry) => void; onClose?: () => void;
}): () => void {
  const { dialog, close } = modal(container, options.copy ? "Créer une copie" : "Enregistrer ma scène", options.onClose);
  dialog.classList.add("gx-personal-dialog--save");
  const heading = document.createElement("h2"); heading.textContent = options.copy ? "Créer une copie" : "Enregistrer ma scène";
  const note = document.createElement("p"); note.textContent = "Dans ce navigateur. Exporte aussi un fichier pour garder une copie ailleurs.";
  const form = document.createElement("form"); form.noValidate = true;
  const label = document.createElement("label"); label.textContent = "Nom de la scène";
  const input = document.createElement("input"); input.type = "text"; input.name = "sceneName"; input.required = true;
  input.value = options.name; input.autocomplete = "off"; input.setAttribute("aria-label", "Nom de la scène"); label.append(input);
  const status = document.createElement("p"); status.className = "gx-personal-notice"; status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
  const submit = document.createElement("button"); submit.type = "submit"; submit.className = "gx-personal-primary"; submit.textContent = options.copy ? "Créer la copie" : "Enregistrer";
  const actions = document.createElement("div"); actions.className = "gx-personal-actions"; actions.append(button("Annuler", close), submit);
  form.append(label, status, actions); dialog.append(heading, note, form);
  form.addEventListener("submit", event => {
    event.preventDefault();
    const result = options.onSave(input.value);
    if (!result.ok) { status.textContent = result.error; input.setAttribute("aria-invalid", "true"); input.focus(); return; }
    close(); options.onSaved(result.entry);
  });
  input.addEventListener("input", () => input.removeAttribute("aria-invalid"));
  queueMicrotask(() => { input.focus(); input.select(); });
  return close;
}

function download(entry: PersonalSceneEntry): void {
  const text = entry.kind === "draft" && entry.definition ? JSON.stringify(entry.definition, null, 2) : entry.raw;
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const anchor = document.createElement("a"); anchor.href = url;
  anchor.download = `${entry.name.replace(/[^\p{L}\p{N}._-]+/gu, "-") || "scene"}.graphysx.json`;
  anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function mountPersonalScenes(container: HTMLElement, options: {
  onOpen: (entry: PersonalSceneEntry, isCurrent: () => boolean) => Promise<string | null>;
  onClose?: () => void;
  server?: { label: string; onOpen: () => void };
}): () => void {
  let disposed = false, busy = false, active: "scene" | "draft" = "scene";
  let closeCopy: (() => void) | null = null;
  const ui = modal(container, "Mes créations", () => { disposed = true; closeCopy?.(); window.removeEventListener("storage", onStorage); options.onClose?.(); });
  const head = document.createElement("header"); head.className = "gx-personal-head";
  const title = document.createElement("h2"); title.textContent = "Mes créations";
  head.append(title, button("Fermer", ui.close));
  const intro = document.createElement("p"); intro.textContent = "Tes scènes enregistrées et tes brouillons, au même endroit.";
  const location = document.createElement("p"); location.className = "gx-personal-location"; location.textContent = "● Dans ce navigateur · sur cet appareil";
  const tabs = document.createElement("div"); tabs.className = "gx-personal-tabs"; tabs.setAttribute("role", "group"); tabs.setAttribute("aria-label", "Types de sauvegardes");
  const sceneTab = button("Scènes enregistrées", () => { active = "scene"; render(); }); sceneTab.dataset.personalTab = "scene";
  const draftTab = button("Brouillons", () => { active = "draft"; render(); }); draftTab.dataset.personalTab = "draft"; tabs.append(sceneTab, draftTab);
  const search = document.createElement("input"); search.type = "search"; search.className = "gx-personal-search";
  search.placeholder = "Rechercher mes scènes…"; search.setAttribute("aria-label", "Rechercher mes scènes");
  const status = document.createElement("p"); status.className = "gx-personal-notice"; status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
  const refresh = button("Actualiser", () => render()); refresh.className = "gx-personal-refresh";
  const list = document.createElement("div"); list.className = "gx-personal-list";
  const foot = document.createElement("footer");
  const backup = document.createElement("p"); backup.textContent = "Ces données ne sont pas synchronisées. Exporter crée un fichier transportable ; effacer les données du navigateur retire ses sauvegardes locales.";
  foot.append(backup);
  if (options.server) foot.append(button("Voir les scènes du serveur · " + options.server.label, () => { ui.close(); options.server?.onOpen(); }));
  ui.dialog.append(head, intro, location, tabs, search, refresh, status, list, foot);
  const render = (): void => {
    if (disposed) return;
    const storage = browserSceneStorage(), catalog = personalScenes(storage);
    status.textContent = catalog.error ?? "";
    sceneTab.textContent = `Scènes enregistrées · ${catalog.entries.filter(entry => entry.kind === "scene").length}`;
    draftTab.textContent = `Brouillons · ${catalog.entries.filter(entry => entry.kind === "draft").length}`;
    sceneTab.setAttribute("aria-pressed", String(active === "scene")); draftTab.setAttribute("aria-pressed", String(active === "draft"));
    const query = search.value.trim().toLocaleLowerCase();
    const entries = catalog.entries.filter(entry => entry.kind === active && `${entry.name} ${entry.definition?.label ?? ""}`.toLocaleLowerCase().includes(query));
    list.replaceChildren();
    if (!entries.length) {
      const empty = document.createElement("div"); empty.className = "gx-personal-empty";
      empty.textContent = query ? "Aucune scène ne correspond à cette recherche." : active === "draft"
        ? "Aucun brouillon à reprendre. Les modifications du Studio sont gardées automatiquement quand le stockage est disponible."
        : "Ta prochaine création sera ici. Ouvre une scène dans le Studio, modifie-la, puis choisis Enregistrer.";
      if (query) empty.append(button("Effacer la recherche", () => { search.value = ""; render(); search.focus(); }));
      list.append(empty);
    }
    for (const entry of entries) {
      const card = document.createElement("article"); card.className = "gx-personal-card"; card.dataset.personalKey = entry.key;
      const name = document.createElement("h3"); name.textContent = entry.name;
      const details = document.createElement("p");
      details.textContent = entry.definition ? `${entry.definition.entities.length} objets${entry.definition.label ? " · " + entry.definition.label : ""}` : "Format illisible · les données restent disponibles à l’export.";
      const date = document.createElement("p"); date.className = "gx-personal-meta";
      date.textContent = entry.savedAt ? new Date(entry.savedAt).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" }) : "Sauvegarde locale";
      const actions = document.createElement("div"); actions.className = "gx-personal-actions";
      const open = button(entry.kind === "draft" ? "Reprendre le brouillon" : "Modifier dans le Studio", () => {
        if (busy || !storage) return;
        let fresh: PersonalSceneEntry | null;
        try { fresh = readPersonalScene(storage, entry.key); } catch { fresh = null; }
        if (!fresh || fresh.raw !== entry.raw) { render(); status.textContent = "Cette scène a changé dans une autre fenêtre. La liste a été actualisée ; choisis-la à nouveau."; return; }
        busy = true; open.disabled = true; status.textContent = "Ouverture dans le Studio…";
        void options.onOpen(fresh, () => !disposed).then(error => {
          if (disposed) return;
          if (error) { status.textContent = error; open.disabled = false; } else ui.close();
        }).catch(() => { if (!disposed) { status.textContent = "La scène n’a pas pu être ouverte. Ton travail actuel est conservé."; open.disabled = false; } }).finally(() => { busy = false; });
      }, "gx-personal-primary");
      open.disabled = !entry.definition; open.dataset.personalOpen = "";
      const copy = button("Créer une copie", () => {
        closeCopy = mountSceneSaveDialog(container, { name: entry.name + " · copie", copy: true,
          onSave: name => copyPersonalScene(browserSceneStorage(), entry, name),
          onSaved: () => { active = "scene"; render(); status.textContent = "Copie enregistrée. La scène d’origine est conservée."; search.focus(); },
          onClose: () => { if (!disposed) search.focus(); },
        });
      }); copy.disabled = !entry.definition;
      actions.append(open, copy, button("Exporter", () => download(entry)));
      card.append(name, details, date, actions); list.append(card);
    }
  };
  function onStorage(): void {
    if (disposed) return;
    render();
  }
  search.addEventListener("input", render); window.addEventListener("storage", onStorage);
  render(); queueMicrotask(() => search.focus());
  return ui.close;
}

const PERSONAL_CSS = `
.gx-personal{position:fixed;inset:0;z-index:90;display:grid;place-items:center;padding:12px;box-sizing:border-box;background:#020d18b8;backdrop-filter:blur(10px);font-family:var(--gx-font,system-ui);color:#dff2f5}
.gx-personal *{box-sizing:border-box}.gx-personal-dialog{display:flex;flex-direction:column;gap:12px;width:min(820px,100%);max-height:calc(100dvh - 24px);padding:22px;border:1px solid #4aa0ae70;border-radius:20px;background:linear-gradient(145deg,#102a37,#081922);box-shadow:0 30px 90px #0008;overflow-y:auto}
.gx-personal-dialog>*{flex-shrink:0}.gx-personal-dialog--save{width:min(480px,100%)}.gx-personal h2{font-size:23px;margin:0}.gx-personal h3{font-size:17px;margin:0;overflow-wrap:anywhere}.gx-personal p{margin:0;line-height:1.5;font-size:13px;color:#accbd4}
.gx-personal button,.gx-personal input{min-height:44px;max-width:100%;border:1px solid #547b8b80;border-radius:10px;padding:10px 13px;color:#e0f2f5;background:#112b38;font:600 13px var(--gx-font,system-ui)}
.gx-personal input{width:100%;font-size:16px;background:#071923}.gx-personal button{cursor:pointer;white-space:normal}.gx-personal button:hover{border-color:#a1e1d4}.gx-personal button:disabled{opacity:.5;cursor:default}
.gx-personal :focus-visible{outline:2px solid #b8fff0;outline-offset:2px}.gx-personal .gx-personal-primary,.gx-personal button[aria-pressed=true]{background:#ace6d5;color:#102d36;border-color:#b6f0df}
.gx-personal-head{display:flex;justify-content:space-between;align-items:center;gap:12px}.gx-personal-tabs,.gx-personal-actions{display:flex;gap:8px;flex-wrap:wrap}.gx-personal-tabs button{flex:1}.gx-personal-location{color:#b2ecda!important;font-weight:700}
.gx-personal-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;min-height:100px}.gx-personal-card{border:1px solid #49788a70;border-radius:14px;padding:16px;background:#17364465;display:flex;flex-direction:column;gap:9px;min-width:0}.gx-personal-card .gx-personal-actions{margin-top:auto}.gx-personal-card .gx-personal-primary{flex-basis:100%}
.gx-personal .gx-personal-meta{font-size:11px;color:#8dafba}.gx-personal-notice:empty{display:none}.gx-personal .gx-personal-notice{color:#ffe1af}.gx-personal-refresh{align-self:flex-end}.gx-personal-empty{grid-column:1/-1;padding:22px;border:1px dashed #53859690;border-radius:14px;line-height:1.6;color:#c5e0e8}.gx-personal-empty button{display:block;margin-top:12px}
.gx-personal footer{border-top:1px solid #47677770;padding-top:12px;display:grid;gap:10px}.gx-personal form,.gx-personal label{display:grid;gap:12px}.gx-personal label{font-weight:700;font-size:13px}.gx-personal form .gx-personal-actions{justify-content:flex-end}
body:has(.gx-personal) .gx-display-settings{display:none}
@media(max-width:580px){.gx-personal-dialog{padding:16px;gap:10px}.gx-personal-list{grid-template-columns:1fr}.gx-personal h2{font-size:21px}.gx-personal-card{padding:13px}.gx-personal-actions button{flex:1}.gx-personal footer p{font-size:11px}}
@media(max-height:540px){.gx-personal-dialog{gap:8px;padding:14px}.gx-personal-dialog>p:not(.gx-personal-location){display:none}}
`;
