import {
  createEv3ProgramStore, EV3_FIRST_PROGRAM_BLOCKS, EV3_PROGRAM_NAME_MAX_LENGTH,
  type Ev3FirstProgramBlockId, type Ev3SavedProgram,
} from "./ev3-first-program";

const sameBlocks = (a: readonly Ev3FirstProgramBlockId[], b: readonly Ev3FirstProgramBlockId[]): boolean =>
  a.length === b.length && a.every((block, index) => block === b[index]);
const nameKey = (name: string): string => name.normalize("NFC").trim().toLowerCase();
const describe = (blocks: readonly Ev3FirstProgramBlockId[]): string =>
  blocks.map((id) => EV3_FIRST_PROGRAM_BLOCKS[id].label).join(" → ") || "Add some blocks first.";

/** A browser-local library around the existing language; opening never starts the rover. */
export function mountEv3ProgramLibrary(
  root: HTMLElement,
  getBlocks: () => readonly Ev3FirstProgramBlockId[],
  onOpen: (blocks: Ev3FirstProgramBlockId[]) => void,
) {
  if (!document.getElementById("gx-ev3-program-library-style")) {
    const style = document.createElement("style");
    style.id = "gx-ev3-program-library-style";
    style.textContent = `
.gx-ev3-programs-button{pointer-events:auto;flex:0 0 88px;min-height:48px;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:4px;border:1px solid #acbaa4;border-radius:10px;
  background:#e8edde;color:#2c3f35;font:700 12px/1.2 var(--gx-font);cursor:pointer;touch-action:manipulation}
.gx-ev3-programs-button small{font-size:10px;color:#52644e}.gx-ev3-programs-button:disabled{opacity:.45;cursor:default}
.gx-ev3-library{box-sizing:border-box;width:min(560px,calc(100vw - 32px));max-height:calc(100dvh - 32px);
  padding:20px;border:1px solid #acbaa4;border-radius:18px;background:#fafbf5;color:#2c3f35;
  font:500 14px/1.4 var(--gx-font);overflow:auto;overscroll-behavior:contain}
.gx-ev3-library::backdrop{background:rgba(31,43,38,.55)}
.gx-ev3-library header{display:flex;align-items:center;justify-content:space-between;gap:12px}
.gx-ev3-library h2{margin:0;font-size:24px}.gx-ev3-library h3{margin:20px 0 10px;font-size:16px}
.gx-ev3-library p{margin:12px 0;color:#52644e;overflow-wrap:anywhere}
.gx-ev3-library label{display:block;font-weight:700;margin-bottom:6px}
.gx-ev3-library input{box-sizing:border-box;width:100%;min-height:48px;border:1px solid #acbaa4;border-radius:10px;
  padding:10px;background:#ffffff;color:#24363d;font:inherit}
.gx-ev3-library button{min-height:72px;padding:12px;border:1px solid #acbaa4;border-radius:12px;
  background:#e8edde;color:#2c3f35;font:700 14px/1.3 var(--gx-font);cursor:pointer;touch-action:manipulation}
.gx-ev3-library button:disabled{opacity:.45;cursor:default}.gx-ev3-library button[data-program-close]{min-height:48px}
.gx-ev3-library button[data-program-save]{width:100%;margin-top:10px;background:#39771f;color:#ffffff}
.gx-ev3-library button:focus-visible,.gx-ev3-library input:focus-visible,.gx-ev3-programs-button:focus-visible{outline:3px solid #1766b0;outline-offset:3px}
.gx-ev3-library ul{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.gx-ev3-library li{display:flex;gap:8px;align-items:stretch}
.gx-ev3-library li button:first-child{flex:1;min-width:0;text-align:left;overflow-wrap:anywhere}
.gx-ev3-library li button:last-child{flex:0 0 80px}
.gx-ev3-library li small{display:block;margin-top:4px;color:#52644e;font-weight:500}
.gx-ev3-library [data-program-message]{min-height:20px;color:#326a29}
.gx-ev3-library [data-program-message][data-error="true"]{color:#a94223}
.gx-ev3-library [data-program-confirm]{padding:12px;border:1px solid #a94223;border-radius:12px;margin:12px 0}
.gx-ev3-library [data-program-confirm] button{width:100%;margin-top:8px}
.gx-ev3-library [hidden]{display:none!important}
@media(max-width:400px){.gx-ev3-library{padding:14px}}
`;
    document.head.append(style);
  }
  const store = createEv3ProgramStore(() => window.localStorage);
  let active: Ev3SavedProgram | null = null;
  let pendingOpen: Ev3SavedProgram | null = null;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "gx-ev3-programs-button";
  button.dataset.ev3Programs = "";
  button.setAttribute("aria-haspopup", "dialog");
  button.append("Programs");
  const badge = document.createElement("small");
  button.append(badge);
  const dialog = document.createElement("dialog");
  dialog.className = "gx-ev3-library";
  dialog.setAttribute("aria-labelledby", "gx-ev3-library-title");
  const makeButton = (label: string, key: string, action: () => void): HTMLButtonElement => {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = label;
    element.setAttribute(`data-program-${key}`, "");
    element.addEventListener("click", action);
    return element;
  };
  const header = document.createElement("header");
  const title = document.createElement("h2");
  title.id = "gx-ev3-library-title";
  title.textContent = "Your programs";
  const close = makeButton("Close", "close", () => dialog.close());
  header.append(title, close);
  const intro = document.createElement("p");
  intro.textContent = "Saved only in this browser. Open a program to build or run it again.";
  const preview = document.createElement("p");
  preview.dataset.programPreview = "";
  const form = document.createElement("form");
  const label = document.createElement("label");
  label.htmlFor = "gx-ev3-program-name";
  label.textContent = "Program name";
  const name = document.createElement("input");
  name.id = label.htmlFor;
  name.maxLength = EV3_PROGRAM_NAME_MAX_LENGTH;
  name.autocomplete = "off";
  const message = document.createElement("p");
  message.dataset.programMessage = "";
  message.setAttribute("role", "status");
  const tell = (text: string, error = false): void => {
    message.textContent = text;
    message.dataset.error = String(error);
  };
  const dirty = (): boolean => active ? !sameBlocks(active.blocks, getBlocks()) : getBlocks().length > 0;
  const updating = (): boolean => active !== null && nameKey(name.value) === nameKey(active.name);
  const save = makeButton("Save program", "save", () => undefined);
  save.type = "submit";
  const refresh = (): void => {
    badge.textContent = active ? (dirty() ? "Unsaved edits" : "Saved") : "Not saved";
    button.title = active ? `${active.name} · ${badge.textContent}` : "Save or open a program";
    preview.textContent = describe(getBlocks());
    save.textContent = updating() ? "Update saved program" : active ? "Save a copy" : "Save program";
    save.disabled = !name.value.trim() || getBlocks().length === 0
      || (updating() && !dirty() && name.value.trim() === active?.name);
  };
  const confirmation = document.createElement("div");
  confirmation.dataset.programConfirm = "";
  confirmation.hidden = true;
  const confirmText = document.createElement("p");
  const cancelOpen = (): void => { pendingOpen = null; confirmation.hidden = true; };
  const open = (saved: Ev3SavedProgram): void => {
    // Re-read at the action boundary so a stale list cannot open unsupported or deleted data.
    const loaded = store.read();
    if (!loaded.ok) { tell(loaded.error, true); return; }
    const current = loaded.value.find((item) => nameKey(item.name) === nameKey(saved.name));
    if (!current) { tell("That program was removed. Reopen the library to refresh the list.", true); return; }
    active = current;
    cancelOpen();
    onOpen([...current.blocks]);
    refresh();
    dialog.close();
  };
  const confirmOpen = makeButton("Open anyway", "open-confirm", () => { if (pendingOpen) open(pendingOpen); });
  const keep = makeButton("Keep current blocks", "open-cancel", () => { cancelOpen(); name.focus(); });
  confirmation.append(confirmText, confirmOpen, keep);
  const listTitle = document.createElement("h3");
  listTitle.textContent = "Saved programs";
  const list = document.createElement("ul");
  list.dataset.programList = "";
  const renderList = (): void => {
    list.replaceChildren();
    const loaded = store.read();
    if (!loaded.ok) { tell(loaded.error, true); return; }
    if (loaded.value.length === 0) {
      const empty = document.createElement("li");
      empty.textContent = "No saved programs yet.";
      list.append(empty);
    }
    for (const saved of loaded.value) {
      const row = document.createElement("li");
      const openButton = makeButton(saved.name, "open", () => {
        if (dirty() && !sameBlocks(getBlocks(), saved.blocks)) {
          pendingOpen = saved;
          confirmText.textContent = `Open “${saved.name}”? Your current unsaved blocks will be replaced.`;
          confirmation.hidden = false;
          keep.focus();
        } else open(saved);
      });
      openButton.setAttribute("aria-label", `Open ${saved.name}`);
      const blocks = document.createElement("small");
      blocks.textContent = describe(saved.blocks);
      openButton.append(blocks);
      let confirmingDelete = false;
      const remove = makeButton("Delete", "delete", () => {
        if (!confirmingDelete) {
          confirmingDelete = true;
          remove.textContent = "Delete?";
          remove.setAttribute("aria-label", `Confirm delete ${saved.name}`);
          return;
        }
        const result = store.remove(saved);
        if (!result.ok) { tell(result.error, true); return; }
        if (active && nameKey(active.name) === nameKey(saved.name)) active = null;
        cancelOpen();
        refresh();
        renderList();
        tell(`Deleted “${saved.name}”. Current blocks are still here.`);
        name.focus();
      });
      remove.setAttribute("aria-label", `Delete ${saved.name}`);
      remove.addEventListener("blur", () => {
        confirmingDelete = false;
        remove.textContent = "Delete";
        remove.setAttribute("aria-label", `Delete ${saved.name}`);
      });
      row.append(openButton, remove);
      list.append(row);
    }
  };
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (save.disabled) return;
    const result = store.save(name.value, getBlocks(), updating() ? active ?? undefined : undefined);
    if (!result.ok) { tell(result.error, true); return; }
    active = result.value;
    name.value = active.name;
    cancelOpen();
    refresh();
    renderList();
    tell(`Saved “${active.name}” in this browser.`);
  });
  name.addEventListener("input", () => { cancelOpen(); refresh(); tell(""); });
  form.append(label, name, save);
  dialog.append(header, intro, preview, form, message, confirmation, listTitle, list);
  root.append(dialog);
  button.addEventListener("click", () => {
    name.value = active?.name ?? "";
    cancelOpen();
    tell("");
    refresh();
    renderList();
    dialog.showModal();
    name.focus();
  });
  dialog.addEventListener("close", () => { cancelOpen(); button.focus(); });
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    // Chromium's native modal can tab to browser chrome between the last and first targets.
    // Keep this short child-facing form in one predictable cycle, including hidden confirms.
    const targets = [...dialog.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)")]
      .filter((element) => element.getClientRects().length > 0);
    const first = targets[0];
    const last = targets.at(-1);
    if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus();
    }
  });
  refresh();
  return {
    button,
    refresh,
    state: () => ({ open: dialog.open, savedName: active?.name ?? null, unsavedChanges: dirty() }),
    dispose: () => { dialog.close(); dialog.remove(); button.remove(); },
  };
}
