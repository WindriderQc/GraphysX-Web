import type { AgentWorldEntityPatch, AgentWorldEntityState, AgentWorldState } from "./agent-world-runtime";

export type StudioAction = "undo" | "redo" | "play" | "step" | "frame" | "duplicate" | "remove" | "save" | "my-scenes" | "export" | "import" | "exit" | "complete";
export type SimpleStudioState = {
  world: AgentWorldState | null; selectedId: string | null; savedName: string | null; dirty: boolean;
  notice: string; mode: "translate" | "rotate" | "scale";
};
export type SimpleStudio = { update: (value: SimpleStudioState, inspector?: "auto" | "skip" | "force") => void; setVisible: (visible: boolean) => void; showViewport: () => void; showInspector: () => void; frameRegion: () => { left: number; top: number; right: number; bottom: number }; dispose: () => void };

/** Hidden archive layers stay in the document and remain available in Complete mode. */
export function visibleStudioEntities(entities: AgentWorldEntityState[]): AgentWorldEntityState[] {
  const byId = new Map(entities.map(entity => [entity.id, entity]));
  const groupsWithChildren = new Set(entities.map(entity => entity.parentId).filter(Boolean));
  return entities.filter(entity => {
    if (entity.runtimeOwnedTransient || !entity.visible || (entity.type === "group" && !groupsWithChildren.has(entity.id))) return false;
    const visited = new Set<string>();
    let parent = entity.parentId;
    while (parent) {
      if (visited.has(parent)) return false;
      visited.add(parent); const ancestor = byId.get(parent);
      if (ancestor && (!ancestor.visible || ancestor.runtimeOwnedTransient)) return false;
      parent = ancestor?.parentId ?? null;
    }
    return true;
  });
}

/** Presentation only: all edits delegate to the existing editor and its World API. */
export function mountSimpleStudio(container: HTMLElement, actions: {
  action: (action: StudioAction) => void;
  select: (id: string | null) => void;
  patch: (id: string, patch: AgentWorldEntityPatch) => void;
  mode: (mode: "translate" | "rotate" | "scale") => void;
  add: (kind: "box" | "sphere" | "point-light") => void;
  canExit: boolean;
}): SimpleStudio {
  const root = document.createElement("section"); root.className = "gx-studio-simple"; root.hidden = true;
  root.setAttribute("aria-label", "Studio simple");
  const style = document.createElement("style"); style.textContent = STUDIO_CSS;
  const makeButton = (text: string, action: () => void, key?: string): HTMLButtonElement => {
    const button = document.createElement("button"); button.type = "button"; button.textContent = text;
    if (key) button.dataset.studioAction = key;
    button.addEventListener("click", action); return button;
  };
  const command = (text: string, key: StudioAction) => makeButton(text, () => actions.action(key), key);
  const header = document.createElement("header"); header.className = "gx-studio-header";
  const identity = document.createElement("div"); identity.className = "gx-studio-identity";
  const eyebrow = document.createElement("span"); eyebrow.textContent = "STUDIO · SIMPLE";
  const title = document.createElement("h1"); title.tabIndex = -1;
  const status = document.createElement("p"); status.className = "gx-studio-status"; status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
  identity.append(eyebrow, title, status);
  const primary = document.createElement("div"); primary.className = "gx-studio-primary-actions";
  if (actions.canExit) primary.append(command("← Accueil", "exit"));
  const save = command("Enregistrer", "save"); save.className = "gx-studio-save";
  primary.append(command("Mes créations", "my-scenes"), save, command("Mode complet ↗", "complete"));
  header.append(identity, primary);
  const tools = document.createElement("nav"); tools.className = "gx-studio-tools"; tools.setAttribute("aria-label", "Actions du Studio");
  const undo = command("↶ Annuler", "undo"), redo = command("↷ Rétablir", "redo"), play = command("Simuler", "play"), step = command("Un pas", "step");
  const add = document.createElement("select"); add.setAttribute("aria-label", "Ajouter un objet");
  for (const [key, label] of [["", "+ Ajouter"], ["box", "Cube"], ["sphere", "Boule"], ["point-light", "Lumière"]]) add.append(new Option(label, key));
  add.addEventListener("change", () => { if (add.value) actions.add(add.value as "box" | "sphere" | "point-light"); add.value = ""; });
  const file = document.createElement("details"); file.className = "gx-studio-file";
  const fileTitle = document.createElement("summary"); fileTitle.textContent = "Fichier";
  file.append(fileTitle, command("Importer un fichier", "import"), command("Exporter un fichier", "export"));
  file.addEventListener("click", event => { if ((event.target as Element).closest("button")) file.open = false; });
  tools.append(add, play, undo, redo, step, file);
  const tree = document.createElement("aside"); tree.className = "gx-studio-panel gx-studio-objects"; tree.setAttribute("aria-label", "Objets de la scène");
  const treeHeading = document.createElement("h2"); treeHeading.textContent = "Objets";
  const search = document.createElement("input"); search.type = "search"; search.placeholder = "Trouver un objet…"; search.setAttribute("aria-label", "Trouver un objet");
  const rows = document.createElement("div"); rows.className = "gx-studio-object-list"; tree.append(treeHeading, search, rows);
  const inspector = document.createElement("aside"); inspector.className = "gx-studio-panel gx-studio-inspector"; inspector.setAttribute("aria-label", "Modifier la sélection");
  const mobile = document.createElement("nav"); mobile.className = "gx-studio-mobile"; mobile.setAttribute("aria-label", "Panneaux du Studio simple");
  let pane: "viewport" | "objects" | "inspector" = "viewport";
  const paneButtons = new Map<string, HTMLButtonElement>();
  const showPane = (value: typeof pane): void => {
    pane = value; root.dataset.pane = value;
    for (const [key, button] of paneButtons) button.setAttribute("aria-pressed", String(key === value));
  };
  for (const [key, label] of [["viewport", "Vue 3D"], ["objects", "Objets"], ["inspector", "Modifier"]] as const) {
    const button = makeButton(label, () => showPane(key)); paneButtons.set(key, button); mobile.append(button);
  }
  const hint = document.createElement("p"); hint.className = "gx-studio-hint"; hint.textContent = "Clique un objet ou ouvre Objets pour commencer.";
  root.append(style, header, tools, tree, inspector, mobile, hint); container.append(root); showPane("viewport");
  let latest: SimpleStudioState | null = null, inspectedId: string | null = null, signature = "", chosenSlot: string | null = null;
  const rowById = new Map<string, HTMLButtonElement>();
  const field = (label: string, input: HTMLElement): HTMLLabelElement => {
    const result = document.createElement("label"); result.className = "gx-studio-field";
    const text = document.createElement("span"); text.textContent = label; result.append(text, input); return result;
  };
  const patch = (entity: AgentWorldEntityState, value: AgentWorldEntityPatch): void => actions.patch(entity.id, value);
  const drawInspector = (entity: AgentWorldEntityState | null): void => {
    inspector.replaceChildren();
    const heading = document.createElement("h2"); heading.textContent = entity ? "Modifier l’objet" : "Choisis un objet"; inspector.append(heading);
    if (!entity) { const note = document.createElement("p"); note.textContent = "Sélectionne-le dans la vue 3D ou dans la liste Objets."; inspector.append(note); return; }
    const name = document.createElement("input"); name.type = "text"; name.value = entity.label; name.setAttribute("aria-label", "Nom de l’objet");
    name.addEventListener("change", () => patch(entity, { label: name.value.trim() || entity.id })); inspector.append(field("Nom", name));
    const modes = document.createElement("div"); modes.className = "gx-studio-transform-modes";
    for (const [key, label] of [["translate", "Déplacer"], ["rotate", "Tourner"], ["scale", "Taille"]] as const) {
      const button = makeButton(label, () => actions.mode(key)); button.dataset.studioMode = key; button.setAttribute("aria-pressed", String(latest?.mode === key)); modes.append(button);
    }
    inspector.append(modes, command("Cadrer l’objet", "frame"));
    for (const [label, value, property, stepSize] of [["Position", entity.position, "position", .1], ["Rotation (°)", entity.rotationDegrees, "rotationDegrees", 5], ["Taille", entity.scale, "scale", .1]] as const) {
      const group = document.createElement("fieldset"); const legend = document.createElement("legend"); legend.textContent = label; group.append(legend);
      const inputs: HTMLInputElement[] = [];
      for (const [index, axis] of ["X", "Y", "Z"].entries()) {
        const input = document.createElement("input"); input.type = "number"; input.step = String(stepSize); input.value = String(Math.round(value[index] * 1000) / 1000);
        input.setAttribute("aria-label", `${label} ${axis}`); if (property === "scale") input.min = ".001";
        inputs.push(input); group.append(field(axis, input));
      }
      for (const input of inputs) input.addEventListener("change", () => {
        const values = inputs.map(item => item.valueAsNumber);
        if (values.some(value => !Number.isFinite(value))) { input.setCustomValidity("Entre un nombre valide."); input.reportValidity(); return; }
        input.setCustomValidity(""); patch(entity, { transform: { [property]: values as [number, number, number] } });
      });
      inspector.append(group);
    }
    const slots = entity.materialSlots ?? [];
    let color: string | null = null, onColor: ((value: string) => void) | null = null;
    if (entity.type === "model") {
      if (slots.length) {
        const choose = document.createElement("select"); choose.setAttribute("aria-label", "Pièce à colorer");
        for (const slot of slots) choose.append(new Option(`${slot.meshName} · ${slot.label}${slot.opacity === 0 ? " · transparente" : ""}`, slot.id));
        if (!slots.some(slot => slot.id === chosenSlot)) chosenSlot = (slots.find(slot => slot.opacity > 0) ?? slots[0]).id;
        choose.value = chosenSlot ?? "";
        choose.addEventListener("change", () => {
          chosenSlot = choose.value;
          const input = inspector.querySelector<HTMLInputElement>("[data-studio-color]");
          const selected = slots.find(slot => slot.id === chosenSlot);
          if (input && selected) input.value = selected.color;
        });
        const slot = slots.find(value => value.id === chosenSlot) ?? slots[0];
        color = slot.color; onColor = value => patch(entity, { modelMaterialOverrides: { [chosenSlot ?? slot.id]: { color: value } } });
        inspector.append(field("Pièce à colorer", choose));
      } else { const note = document.createElement("p"); note.textContent = entity.asset?.status === "error" ? "Le modèle n’a pas pu être chargé. Ses données restent conservées." : "Chargement des matières…"; inspector.append(note); }
    } else if (["box", "sphere", "icosahedron", "cylinder", "cone", "torus", "plane", "mesh", "terrain", "spline"].includes(entity.type)) {
      color = entity.material.color; onColor = value => patch(entity, { material: { color: value } });
    }
    if (color && onColor) {
      const input = document.createElement("input"); input.type = "color"; input.value = color; input.setAttribute("aria-label", "Couleur"); input.dataset.studioColor = "";
      const change = onColor; input.addEventListener("input", () => change(input.value)); inspector.append(field("Couleur", input));
    }
    const more = document.createElement("p"); more.className = "gx-studio-more-hint"; more.textContent = "Matières avancées, ADN, physique et comportements : Mode complet.";
    const objectActions = document.createElement("div"); objectActions.className = "gx-studio-object-actions";
    objectActions.append(command("Dupliquer", "duplicate"), command("Retirer l’objet", "remove")); inspector.append(more, objectActions);
  };
  const update = (value: SimpleStudioState, refresh: "auto" | "skip" | "force" = "auto"): void => {
    latest = value;
    const entities = visibleStudioEntities(value.world?.entities ?? []);
    title.textContent = value.savedName || value.world?.world.label || "Ma scène";
    status.textContent = value.savedName
      ? `${value.dirty ? "● Modifications à enregistrer" : "✓ Enregistrée"} · Dans ce navigateur`
      : "● Scène non enregistrée · Enregistrer lui donne un nom";
    if (value.notice && !/draft autosaved/.test(value.notice)) status.textContent += " · " + (value.notice === "draft storage unavailable" ? "Brouillon indisponible : exporte ton travail." : value.notice);
    play.textContent = value.world?.paused ? "Simuler" : "Mettre en pause"; play.setAttribute("aria-pressed", String(!value.world?.paused)); step.disabled = !value.world?.paused;
    const query = search.value.trim().toLocaleLowerCase(), visible = entities.filter(entity => `${entity.label} ${entity.id}`.toLocaleLowerCase().includes(query));
    const ids = new Set(visible.map(entity => entity.id));
    for (const [id, button] of rowById) if (!ids.has(id)) { button.remove(); rowById.delete(id); }
    for (const entity of visible) {
      let row = rowById.get(entity.id);
      if (!row) { row = makeButton(entity.label || entity.id, () => { actions.select(entity.id); showPane("inspector"); }); row.dataset.studioEntity = entity.id; rowById.set(entity.id, row); rows.append(row); }
      row.textContent = entity.label || entity.id; row.setAttribute("aria-pressed", String(entity.id === value.selectedId));
    }
    treeHeading.textContent = `Objets visibles · ${entities.length}`;
    const entity = entities.find(item => item.id === value.selectedId) ?? null;
    if (inspectedId !== value.selectedId) { inspectedId = value.selectedId; chosenSlot = null; refresh = "force"; }
    const nextSignature = JSON.stringify([entity?.id, entity?.label, entity?.position, entity?.rotationDegrees, entity?.scale, entity?.material.color, entity?.asset?.status, entity?.materialSlots?.map(slot => [slot.id, slot.label, slot.color]), value.mode]);
    if (refresh === "force" || (refresh === "auto" && nextSignature !== signature && !inspector.contains(document.activeElement))) { signature = nextSignature; drawInspector(entity); }
    for (const button of inspector.querySelectorAll<HTMLButtonElement>("[data-studio-mode]")) button.setAttribute("aria-pressed", String(button.dataset.studioMode === value.mode));
    hint.hidden = Boolean(value.selectedId);
  };
  search.addEventListener("input", () => { if (latest) update(latest); });
  const frameRegion = (): { left: number; top: number; right: number; bottom: number } => {
    const bounds = root.getBoundingClientRect();
    const compact = mobile.getClientRects().length > 0;
    return { left: compact ? bounds.left + 12 : tree.getBoundingClientRect().right + 12,
      right: compact ? bounds.right - 12 : inspector.getBoundingClientRect().left - 12,
      top: Math.max(header.getBoundingClientRect().bottom, tools.getBoundingClientRect().bottom) + 12,
      bottom: compact ? mobile.getBoundingClientRect().top - 12 : bounds.bottom - 16 };
  };
  return { update, setVisible: visible => { root.hidden = !visible; }, showViewport: () => showPane("viewport"), showInspector: () => showPane("inspector"), frameRegion, dispose: () => root.remove() };
}

const STUDIO_CSS = `
.gx-studio-simple[hidden]{display:none!important}.gx-studio-simple{position:fixed;inset:0;z-index:25;pointer-events:none;font-family:var(--gx-font,system-ui);color:#dff2f5;--studio-top:152px}
.gx-studio-simple *{box-sizing:border-box}.gx-studio-simple button,.gx-studio-simple input,.gx-studio-simple select,.gx-studio-file summary{pointer-events:auto;min-height:44px;border:1px solid #527b8b80;border-radius:9px;background:#112d3b;color:#e3f3f6;padding:9px 11px;font:600 13px var(--gx-font,system-ui);max-width:100%}
.gx-studio-simple button,.gx-studio-simple select,.gx-studio-file summary{cursor:pointer}.gx-studio-simple input{font-size:16px;min-width:0}.gx-studio-simple button:disabled{opacity:.45;cursor:default}.gx-studio-simple :focus-visible{outline:2px solid #beffed;outline-offset:2px}
.gx-studio-header{pointer-events:auto;position:absolute;top:12px;left:12px;right:12px;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 16px;border:1px solid #4c8b9f70;border-radius:16px;background:#0b2433f2;box-shadow:0 8px 25px #0004}
.gx-studio-identity{min-width:0}.gx-studio-identity>span{font-size:9px;letter-spacing:.14em;color:#9bd7ca;font-weight:800}.gx-studio-simple h1{font-size:18px;margin:4px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:45vw}.gx-studio-status{margin:0;font-size:11px;color:#b6d4dd;line-height:1.4}.gx-studio-primary-actions{display:flex;flex-wrap:wrap;gap:7px;justify-content:flex-end}.gx-studio-simple .gx-studio-save,.gx-studio-simple button[aria-pressed=true]{background:#afe9d7;color:#112f38;border-color:#c7f9ea}
.gx-studio-tools{pointer-events:auto;position:absolute;top:108px;left:12px;right:12px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:6px;border-radius:12px;background:#0d2534ee}.gx-studio-file{position:relative}.gx-studio-file[open]{z-index:3}.gx-studio-file button{display:block;width:200px;text-align:left}.gx-studio-file[open]>button{position:relative;box-shadow:0 10px 20px #0007}.gx-studio-file[open]>summary{background:#204758}
.gx-studio-panel{pointer-events:auto;position:absolute;top:170px;bottom:16px;width:244px;border:1px solid #4b849670;border-radius:15px;padding:14px;background:#0b2433ed;overflow:auto}.gx-studio-objects{left:12px}.gx-studio-inspector{right:12px;width:290px;display:flex;flex-direction:column;gap:12px}.gx-studio-simple h2{margin:0;font-size:15px}.gx-studio-panel>p{margin:0;font-size:12px;line-height:1.6;color:#b2cdd7}.gx-studio-object-list{display:grid;gap:6px;margin-top:10px}.gx-studio-object-list button{text-align:left;overflow-wrap:anywhere}.gx-studio-objects>input{margin-top:12px;width:100%}
.gx-studio-field{display:grid;gap:5px;font-size:12px;min-width:0}.gx-studio-field input,.gx-studio-field select{width:100%}.gx-studio-transform-modes,.gx-studio-object-actions{display:flex;gap:5px}.gx-studio-transform-modes button,.gx-studio-object-actions button{flex:1;padding-left:5px;padding-right:5px;font-size:11px}.gx-studio-simple fieldset{border:1px solid #50738770;border-radius:10px;padding:8px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:0}.gx-studio-simple legend{font-size:12px;padding:0 4px;color:#bedbe2}.gx-studio-simple input[type=color]{padding:5px}.gx-studio-hint{position:absolute;bottom:22px;left:280px;right:320px;text-align:center;font-size:13px;color:#e4f6ff;text-shadow:0 1px 5px #000}
.gx-studio-mobile{display:none}.gx-studio-more-hint{font-size:11px!important}
html[data-gx-studio=simple] .gx-ed-toolbar,html[data-gx-studio=simple] .gx-ed-panel,html[data-gx-studio=simple] .gx-ed-mobile-nav,html[data-gx-studio=simple] .gx-ed-levels{display:none!important}
html[data-gx-studio=simple] .gx-display-settings{display:none}
html[data-gx-studio=simple] .gx-sb{display:none!important}
@media(max-width:1000px){.gx-studio-header{align-items:flex-start}.gx-studio-simple h1{max-width:35vw}.gx-studio-primary-actions{max-width:58%}.gx-studio-simple{--studio-top:180px}.gx-studio-tools{top:134px}.gx-studio-panel{top:195px}.gx-studio-objects{width:210px}.gx-studio-inspector{width:270px}}
@media(max-width:760px){.gx-studio-header{padding:10px;flex-direction:column;gap:8px}.gx-studio-simple h1{max-width:86vw;font-size:16px;margin:3px 0}.gx-studio-primary-actions{max-width:none;width:100%;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}.gx-studio-primary-actions button{font-size:10px;padding:5px}.gx-studio-status{font-size:10px}.gx-studio-tools{top:163px;gap:5px;flex-wrap:nowrap;overflow-x:auto}.gx-studio-tools>*{flex-shrink:0}.gx-studio-tools button,.gx-studio-tools select{font-size:11px;padding:7px}.gx-studio-panel{display:none;top:auto;left:12px;right:12px;bottom:74px;width:auto;max-height:46dvh;box-shadow:0 -15px 40px #0005}.gx-studio-simple[data-pane=objects] .gx-studio-objects{display:block}.gx-studio-simple[data-pane=inspector] .gx-studio-inspector{display:flex}.gx-studio-mobile{pointer-events:auto;position:absolute;bottom:12px;left:12px;right:12px;display:flex;gap:6px;padding:6px;border-radius:14px;border:1px solid #4e839470;background:#0b2433f5}.gx-studio-mobile button{flex:1}.gx-studio-hint{left:24px;right:24px;bottom:90px;font-size:12px}}
@media(max-height:540px) and (max-width:1000px){.gx-studio-header{top:6px;left:6px;right:6px;flex-direction:row;padding:6px;gap:8px}.gx-studio-identity>span,.gx-studio-status{display:none}.gx-studio-primary-actions{max-width:72%;display:flex;width:auto}.gx-studio-simple h1{max-width:23vw;font-size:14px}.gx-studio-tools{top:69px;left:6px;right:6px}.gx-studio-panel{top:126px;max-height:none;bottom:74px}.gx-studio-mobile{bottom:6px;padding:3px}.gx-studio-hint{display:none}}
`;
