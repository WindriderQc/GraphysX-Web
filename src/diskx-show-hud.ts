/**
 * The HTML of the Janitor show: player bar, narration, filters, selection panel, summary card
 * and hover tip. Markup and small renderers only; `diskx-show.ts` owns the state.
 *
 * Every text is set with textContent: report paths and names never reach innerHTML.
 */
import { formatBytes, formatCount } from "./diskx-data";
import { showStepLabel, type ShowStep } from "./diskx-show-script";
import type { LedgerCoverage, LedgerGroup } from "./diskx-show-ledger";

export const SHOW_WARNING = "Présentation seulement : rien n’est lancé, approuvé, déplacé ni supprimé ici. La règle de conservation n’est pas une autorisation. Octets logiques : l’espace physique libéré n’est pas mesuré.";

const MIN_SIZES: [number, string][] = [[0, "toutes tailles"], [1024 ** 2, "≥ 1 Mo"], [100 * 1024 ** 2, "≥ 100 Mo"], [1024 ** 3, "≥ 1 Go"], [10 * 1024 ** 3, "≥ 10 Go"]];

export function createShowHud(surface: HTMLElement, actionsHref: string | null) {
  const bar = document.createElement("section");
  bar.className = "gx-diskx-show";
  bar.setAttribute("aria-label", "Présentation du rapport Janitor");
  bar.innerHTML = `
    <ol class="gx-show-steps" data-show-steps aria-label="Liste d’animations"></ol>
    <div class="gx-show-controls">
      <button type="button" data-show="previous" aria-label="Étape précédente">⏮</button>
      <button type="button" data-show="toggle" aria-label="Lire">▶ Lire</button>
      <button type="button" data-show="next" aria-label="Étape suivante">⏭</button>
      <progress data-show-progress max="1" value="0" aria-label="Avancement de l’étape"></progress>
      <label class="gx-show-jump">Groupe <select data-show-jump aria-label="Aller au groupe"><option value="">—</option></select></label>
      <button type="button" data-show="filters" aria-expanded="false">Filtres</button>
      <button type="button" data-show="reset">Tout remettre</button>
    </div>
    <div class="gx-show-filters" data-show-filters hidden>
      <label>Racine <select data-show-root aria-label="Filtrer par racine"><option value="">toutes</option></select></label>
      <label>Taille <select data-show-min aria-label="Taille minimale des fichiers"></select></label>
      <label>Copies <select data-show-role aria-label="Copies comptées">
        <option value="all">gardées et en trop</option><option value="extra">en trop seulement</option><option value="keep">gardées seulement</option></select></label>
    </div>
    <p class="gx-show-caption" data-show-caption aria-live="polite"></p>
    <p class="gx-show-meta"><span data-show-coverage></span> <a data-show-actions hidden>Décider et agir dans Data Toolbox ↗</a></p>
    <p class="gx-show-warning"></p>`;
  const selection = document.createElement("aside");
  selection.className = "gx-show-selection";
  selection.hidden = true;
  selection.setAttribute("aria-label", "Bloc sélectionné");
  selection.innerHTML = `
    <h3 data-sel-name></h3><p class="gx-show-path" data-sel-path></p>
    <dl class="gx-show-tally" data-sel-tally></dl>
    <ul class="gx-show-groups" data-sel-groups></ul>
    <div class="gx-show-gestures">
      <button type="button" data-sel="dive">Plonger</button>
      <button type="button" data-sel="lift" aria-pressed="false">Soulever</button>
      <button type="button" data-sel="push" aria-pressed="false">Écarter</button>
      <button type="button" data-sel="pulse" aria-pressed="false">Pulser</button>
      <button type="button" data-sel="close">Fermer</button>
    </div>`;
  const summary = document.createElement("section");
  summary.className = "gx-show-summary";
  summary.hidden = true;
  summary.setAttribute("aria-label", "Résumé du rapport");
  summary.innerHTML = `<h2>Résumé du rapport</h2><div class="gx-show-figures" data-sum-figures></div>
    <h3>Plus gros groupes</h3><ol class="gx-show-groups" data-sum-groups></ol><p class="gx-show-warning"></p>`;
  const tip = document.createElement("div");
  tip.className = "gx-show-tip";
  tip.hidden = true;
  for (const node of [bar, summary]) node.querySelectorAll(".gx-show-warning").forEach((line) => { line.textContent = SHOW_WARNING; });
  surface.append(bar, selection, summary, tip);

  const q = <T extends HTMLElement>(root: HTMLElement, selector: string): T => root.querySelector<T>(selector)!;
  const minSelect = q<HTMLSelectElement>(bar, "[data-show-min]");
  for (const [value, label] of MIN_SIZES) minSelect.append(new Option(label, String(value)));
  const actions = q<HTMLAnchorElement>(bar, "[data-show-actions]");
  if (actionsHref) { actions.href = actionsHref; actions.target = "_blank"; actions.rel = "noopener"; actions.hidden = false; }

  const groupLine = (group: LedgerGroup, onShow: (sha: string) => void): HTMLLIElement => {
    const li = document.createElement("li");
    const text = document.createElement("span");
    const copies = group.paths.length + group.omitted;
    text.textContent = `${copies} copies · ${formatBytes(group.size)}${group.keep ? ` · −${formatBytes(group.size * (group.paths.length - 1))}` : " · sans survivant"}`;
    const show = document.createElement("button");
    show.type = "button"; show.textContent = "Montrer"; show.title = `SHA-256 ${group.sha256.slice(0, 12)}`;
    show.addEventListener("click", () => onShow(group.sha256));
    li.append(text, show);
    return li;
  };

  return {
    bar, selection, summary, tip,
    button: (name: string): HTMLButtonElement => q<HTMLButtonElement>(bar, `[data-show="${name}"]`),
    selButton: (name: string): HTMLButtonElement => q<HTMLButtonElement>(selection, `[data-sel="${name}"]`),
    jump: q<HTMLSelectElement>(bar, "[data-show-jump]"),
    rootSelect: q<HTMLSelectElement>(bar, "[data-show-root]"),
    minSelect,
    roleSelect: q<HTMLSelectElement>(bar, "[data-show-role]"),
    filters: q<HTMLElement>(bar, "[data-show-filters]"),
    progress: q<HTMLProgressElement>(bar, "[data-show-progress]"),
    setRoots(roots: readonly string[]): void {
      const select = q<HTMLSelectElement>(bar, "[data-show-root]");
      select.replaceChildren(new Option("toutes", ""), ...roots.map((root) => new Option(root.slice(root.lastIndexOf("/") + 1) || root, root)));
    },
    renderSteps(steps: readonly ShowStep[], index: number, playing: boolean, onPick: (index: number) => void): void {
      const list = q<HTMLOListElement>(bar, "[data-show-steps]");
      list.replaceChildren(...steps.map((step, at) => {
        const li = document.createElement("li");
        const chip = document.createElement("button");
        chip.type = "button"; chip.textContent = showStepLabel(step);
        if (at === index) chip.setAttribute("aria-current", "step");
        chip.addEventListener("click", () => onPick(at));
        li.append(chip);
        return li;
      }));
      const toggle = q<HTMLButtonElement>(bar, '[data-show="toggle"]');
      toggle.textContent = playing ? "⏸ Pause" : "▶ Lire";
      toggle.setAttribute("aria-label", playing ? "Pause" : "Lire");
    },
    caption(text: string): void { q(bar, "[data-show-caption]").textContent = text; },
    coverage(coverage: LedgerCoverage | null, loading: boolean, failed: string | null): void {
      const node = q(bar, "[data-show-coverage]");
      if (failed) { node.textContent = `Lecture des groupes interrompue : ${failed}. Les chiffres portent sur les groupes déjà lus.`; return; }
      if (!coverage) { node.textContent = loading ? "Lecture des groupes du rapport…" : ""; return; }
      const share = coverage.bytesTotal ? Math.min(100, (coverage.bytesCovered / coverage.bytesTotal) * 100) : 0;
      node.textContent = `${loading ? "Lecture… " : ""}${formatCount(coverage.groupsRead)} groupes lus sur ${formatCount(coverage.groupsTotal)}, du plus gros au plus petit : ${share.toFixed(1)} % des octets en double du rapport${coverage.complete ? " (tous)" : ""}.`;
    },
    jumpOptions(groups: readonly LedgerGroup[]): void {
      const current = this.jump.value;
      this.jump.replaceChildren(new Option("—", ""), ...groups.map((group, index) => new Option(
        `${index + 1}. ${group.paths.length + group.omitted} copies · ${formatBytes(group.size)}`, group.sha256)));
      this.jump.value = groups.some((group) => group.sha256 === current) ? current : "";
    },
    renderSelection(input: { name: string; path: string; rows: [string, string][]; groups: LedgerGroup[]; gestures: { lift: boolean; push: boolean; pulse: boolean }; canDive: boolean } | null, onShow: (sha: string) => void): void {
      selection.hidden = !input;
      if (!input) return;
      q(selection, "[data-sel-name]").textContent = input.name;
      q(selection, "[data-sel-path]").textContent = input.path;
      q(selection, "[data-sel-tally]").replaceChildren(...input.rows.flatMap(([term, value]) => {
        const dt = document.createElement("dt"), dd = document.createElement("dd");
        dt.textContent = term; dd.textContent = value;
        return [dt, dd];
      }));
      q(selection, "[data-sel-groups]").replaceChildren(...input.groups.map((group) => groupLine(group, onShow)));
      for (const name of ["lift", "push", "pulse"] as const) this.selButton(name).setAttribute("aria-pressed", String(input.gestures[name]));
      this.selButton("dive").disabled = !input.canDive;
    },
    renderSummary(input: { figures: [string, string][]; groups: LedgerGroup[] } | null, onShow: (sha: string) => void): void {
      summary.hidden = !input;
      if (!input) return;
      q(summary, "[data-sum-figures]").replaceChildren(...input.figures.map(([value, caption]) => {
        const box = document.createElement("div"), strong = document.createElement("strong"), span = document.createElement("span");
        strong.textContent = value; span.textContent = caption; box.append(strong, span);
        return box;
      }));
      q(summary, "[data-sum-groups]").replaceChildren(...input.groups.map((group) => groupLine(group, onShow)));
    },
    showTip(text: string | null, x = 0, y = 0): void {
      tip.hidden = !text;
      if (!text) return;
      tip.textContent = text;
      tip.style.transform = `translate(${Math.round(x + 14)}px, ${Math.round(y + 14)}px)`;
    },
    dispose(): void { bar.remove(); selection.remove(); summary.remove(); tip.remove(); },
  };
}
export type DiskxShowHud = ReturnType<typeof createShowHud>;
