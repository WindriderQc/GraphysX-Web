/**
 * The Math Lab page (math-lab.html), in two modes on one stage:
 *
 * - `kids`: young children count cubes and add to 20 with buttons, no typing. `<llmx-stage>` draws
 *   the `agentx.math-scene.v1` cube picture Famille shows; `math-lab-kids.ts` holds the bounds.
 * - `formulas`: a person types a block in AgentX's math-block language and the stage draws it in
 *   the Math Game style, with live sliders. The block is read by `math-block.ts` (AgentX's parser,
 *   ported with parity vectors). An invalid block is refused whole and the last valid picture
 *   stays, dimmed, until the text is valid again.
 *
 * Nothing is clamped in either mode, and nothing calls a model or the network. The page state is
 * mirrored on `main.ml[data-mode]`, `[data-state]` (`loading`, `drawn`, `refused`, `rejected`,
 * `no-webgl`) and `[data-schema]` for tests; the picture is kept in the address (`#compter=13`,
 * `#additionner=8+5` or `#bloc=…`) so it can be shared as a link.
 */
import "./math-lab.css";
import "./llmx-stage-element";
import type { LlmXStageElement } from "./llmx-stage-element";
import type { MathScene } from "./llmx-math-scene";
import {
  MATH_BLOCK_COLORS,
  MATH_BLOCK_LIMITS,
  mathBlockScene,
  mathBlockText,
  mathDerivativeLabel,
  mathSliderStep,
  parseMathBlock,
  type MathBlock,
  type MathBlockPoint,
} from "./math-block";
import { evaluateMath, formatMath, formatMathNumber, integrateMath } from "./math-expression";
import { MATH_LAB_EXAMPLES } from "./math-lab-examples";
import {
  KIDS_ABOUT,
  KIDS_ADD_PICKS,
  KIDS_COUNT_PICKS,
  KIDS_FIRST,
  KIDS_SCHEMA,
  KIDS_START,
  kidsAnswer,
  kidsDuration,
  kidsFromHash,
  kidsHash,
  kidsLimitNote,
  kidsSceneValue,
  kidsStep,
  type KidsKind,
  type KidsPart,
} from "./math-lab-kids";
import { mathLabRefusal, prettyMath } from "./math-lab-messages";

/** Milliseconds of quiet typing before the block is read again. */
const READ_DELAY_MS = 250;
const HASH_KEY = "bloc";

const byId = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const root = document.querySelector<HTMLElement>("main.ml")!;
const body = byId<HTMLTextAreaElement>("ml-body");
const status = byId<HTMLDivElement>("ml-status");
const statusSay = byId<HTMLParagraphElement>("ml-status-say");
const statusDetail = byId<HTMLParagraphElement>("ml-status-detail");
const about = byId<HTMLParagraphElement>("ml-about");
const stage = byId<LlmXStageElement & HTMLElement>("ml-stage");
const stageNote = byId<HTMLParagraphElement>("ml-stage-note");
const legend = byId<HTMLUListElement>("ml-legend");
const sliders = byId<HTMLDivElement>("ml-sliders");
const readouts = byId<HTMLUListElement>("ml-readouts");
const hint = byId<HTMLParagraphElement>("ml-hint");
const shelves = { simple: byId<HTMLDivElement>("ml-examples-simple"), advanced: byId<HTMLDivElement>("ml-examples-advanced") };
const copy = byId<HTMLButtonElement>("ml-copy");
const copied = byId<HTMLSpanElement>("ml-copied");
const kidsPanel = {
  shelf: byId<HTMLDivElement>("ml-examples-kids"),
  count: byId<HTMLDivElement>("ml-kids-count"),
  add: byId<HTMLDivElement>("ml-kids-add"),
  to: byId<HTMLOutputElement>("ml-kids-to"),
  a: byId<HTMLOutputElement>("ml-kids-a"),
  b: byId<HTMLOutputElement>("ml-kids-b"),
  answer: byId<HTMLOutputElement>("ml-kids-answer"),
  countPicks: byId<HTMLDivElement>("ml-kids-count-picks"),
  addPicks: byId<HTMLDivElement>("ml-kids-add-picks"),
  note: byId<HTMLParagraphElement>("ml-kids-note"),
  status: byId<HTMLDivElement>("ml-kids-status"),
  say: byId<HTMLParagraphElement>("ml-kids-say"),
  replay: byId<HTMLButtonElement>("ml-kids-replay"),
  next: byId<HTMLButtonElement>("ml-kids-next"),
};

/** The block drawn now (the last valid one), its slider values, and the scene shape sent to the stage. */
let shown: MathBlock | null = null;
let values: Record<string, number> = {};
let shape = "";
let webgl = true;
let timer = 0;
/** The cube picture on the panel (kept while the formulas are open, so coming back finds it). */
let kids: MathScene = KIDS_FIRST;
let revealTimer = 0;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** Readable numbers: floating-point residue reads as 0, four decimals at most. */
const readable = (value: number | null): string => {
  if (value === null || !Number.isFinite(value)) return "non définie";
  return formatMathNumber(Math.abs(value) < 1e-9 ? 0 : Number(value.toFixed(4))).replace(".", ",");
};

function setState(state: string, schema?: string): void {
  root.dataset.state = state;
  if (schema) root.dataset.schema = schema;
  else if (state !== "refused") delete root.dataset.schema;
}

function setMode(mode: "kids" | "formulas"): void {
  if (root.dataset.mode === mode) return;
  root.dataset.mode = mode;
  // The other mode's picture is gone from the stage: the next draw sends its scene whole.
  shape = "";
  root.classList.remove("ml-stale");
  if (webgl) stageNote.hidden = true;
  window.clearTimeout(revealTimer);
}

/** The scene without its parameter values: when only values change, the stage keeps its picture and view. */
function sceneShape(scene: Record<string, unknown>): string {
  const parameters = (scene.parameters as { name: string; min: number; max: number }[]).map(row => ({ name: row.name, min: row.min, max: row.max }));
  return JSON.stringify({ ...scene, parameters });
}

/** A refusal in two lines: plain French first, then the reader's exact words (AgentX's message) as the detail. */
function refuse(say: string, detail: string): void {
  statusSay.textContent = say;
  statusDetail.textContent = detail;
  status.dataset.kind = "refused";
}

function clearRefusal(): void {
  statusSay.textContent = "";
  statusDetail.textContent = "";
  delete status.dataset.kind;
}

function read(text: string): void {
  const block = parseMathBlock(text);
  if (!block.ok) {
    refuse(`Pas encore de dessin : ${mathLabRefusal(block.error)}`, `Formule non tracée : ${block.error.message}`);
    root.classList.toggle("ml-stale", Boolean(shown));
    stageNote.hidden = !shown;
    stageNote.textContent = shown ? "Dernier dessin valide" : "";
    setState("refused", root.dataset.schema);
    return;
  }
  // A parameter kept with the same range keeps its slider position; any other starts at its declared value.
  const previous = shown ? shown.plot.parameters : [];
  const next: Record<string, number> = {};
  for (const row of block.plot.parameters) {
    const before = previous.find(other => other.name === row.name && other.min === row.min && other.max === row.max);
    const declaredChanged = before && before.value !== row.value;
    next[row.name] = before && !declaredChanged && Number.isFinite(values[row.name]) ? values[row.name] : row.value;
  }
  shown = block;
  values = next;
  clearRefusal();
  root.classList.remove("ml-stale");
  stageNote.hidden = true;
  remember(`#${HASH_KEY}=${encodeURIComponent(text)}`);
  draw();
}

function draw(): void {
  if (!shown) return;
  const scene = mathBlockScene(shown, values);
  const nextShape = sceneShape(scene);
  setState(webgl ? "loading" : "no-webgl", String(scene.schema));
  if (webgl && nextShape === shape) stage.parameters = values;
  else if (webgl) {
    shape = nextShape;
    stage.scene = scene;
  }
  renderLegend();
  renderSliders();
  renderReadouts();
}

function renderLegend(): void {
  const plot = shown!.plot;
  legend.replaceChildren();
  const item = (color: string | null, name: string, expression: string, kind?: string): void => {
    const row = el("li", "ml-legend-row");
    if (kind) row.dataset.kind = kind;
    const swatch = el("span", "ml-swatch");
    if (color) swatch.style.background = color;
    else swatch.classList.add("ml-swatch-ghost");
    const formula = el("code", "ml-legend-formula", prettyMath(expression));
    formula.dataset.expression = expression;
    row.append(swatch, el("span", "ml-legend-name", `${name} = `), formula);
    legend.append(row);
  };
  if (plot.kind === "surfaces") {
    plot.surfaces.forEach((row, index) => item(MATH_BLOCK_COLORS[index], row.label, row.expression));
    return;
  }
  plot.functions.forEach((fn, index) => item(MATH_BLOCK_COLORS[index], fn.label, fn.expression));
  (plot.curves || []).forEach((row, index) => item(MATH_BLOCK_COLORS[plot.functions.length + index], row.label, `(${row.x}, ${row.y})`));
  // A derivative's formula, computed from its function as AgentX computes it.
  for (const name of plot.derivatives || []) item(null, mathDerivativeLabel(name), formatMath(shown!.slopes[name]), "derivative");
}

function renderSliders(): void {
  const parameters = shown!.plot.parameters;
  const names = parameters.map(row => `${row.name}:${row.min}:${row.max}`).join("|");
  if (sliders.dataset.names === names) {
    // Same sliders: only follow values set from the text.
    for (const row of parameters) {
      const input = sliders.querySelector<HTMLInputElement>(`input[data-name="${row.name}"]`)!;
      if (Number(input.value) !== values[row.name] && document.activeElement !== input) input.value = String(values[row.name]);
      sliders.querySelector<HTMLOutputElement>(`output[data-name="${row.name}"]`)!.textContent = formatMathNumber(values[row.name]);
    }
    return;
  }
  sliders.dataset.names = names;
  sliders.replaceChildren();
  for (const row of parameters) {
    const line = el("label", "ml-slider");
    const input = el("input");
    input.type = "range";
    input.min = String(row.min);
    input.max = String(row.max);
    input.step = String(mathSliderStep(row.max - row.min));
    input.value = String(values[row.name]);
    input.dataset.name = row.name;
    input.setAttribute("aria-label", `Paramètre ${row.name}`);
    const output = el("output", "ml-slider-value", formatMathNumber(values[row.name]));
    output.dataset.name = row.name;
    input.addEventListener("input", () => {
      // On the slider grid but readable: 1.25, not 1.2500000001.
      values[row.name] = Number(formatMathNumber(Number(input.value)));
      output.textContent = formatMathNumber(values[row.name]);
      if (webgl) stage.parameters = { [row.name]: values[row.name] };
      renderReadouts();
    });
    line.append(el("span", "ml-slider-name", row.name), input, output);
    sliders.append(line);
  }
}

/** Tangent slopes and areas with the current values, computed from the formulas as AgentX's card does. */
function renderReadouts(): void {
  readouts.replaceChildren();
  const plot = shown!.plot;
  hint.textContent = plot.parameters.length ? "" : "Ajoute un paramètre, par exemple a = 1 in [-3, 3], pour avoir un curseur.";
  if (plot.kind !== "functions") return;
  const scope = { ...values };
  const at = (point: MathBlockPoint): number => (typeof point === "string" ? scope[point] : point);
  const index = (name: string): number => plot.functions.findIndex(fn => fn.name === name);
  for (const row of plot.tangents || []) {
    const x = at(row.at), tree = shown!.trees[index(row.of)];
    const y = evaluateMath(tree, { ...scope, x }), slope = evaluateMath(shown!.slopes[row.of], { ...scope, x });
    const defined = Number.isFinite(y) && Number.isFinite(slope);
    readouts.append(el("li", "ml-readout", defined
      ? `Tangente à ${row.of} en x = ${readable(x)} : pente ${readable(slope)}`
      : `Tangente à ${row.of} en x = ${readable(x)} : non définie`));
  }
  for (const row of plot.areas || []) {
    const from = at(row.from), to = at(row.to);
    const value = integrateMath(shown!.trees[index(row.of)], scope, from, to);
    readouts.append(el("li", "ml-readout", `Aire sous ${row.of} de ${readable(from)} à ${readable(to)} : ${readable(value)}`));
  }
}

/** Keep the picture in the address so it can be shared; never throws. */
function remember(hash: string): void {
  try {
    history.replaceState(null, "", hash);
  } catch { /* a sandboxed frame may refuse; the page works without it */ }
}

function fromAddress(): string | null {
  const match = new RegExp(`^#${HASH_KEY}=(.*)$`, "s").exec(location.hash);
  if (!match) return null;
  try {
    const text = decodeURIComponent(match[1]);
    return text.length <= MATH_BLOCK_LIMITS.body ? text : null;
  } catch {
    return null;
  }
}

function load(text: string): void {
  window.clearTimeout(timer);
  setMode("formulas");
  body.value = text;
  read(text);
}

/** Marks the chosen example and says, in a sentence, what to try with it. */
function selectExample(id: string | null): void {
  for (const chip of document.querySelectorAll<HTMLButtonElement>(".ml-chip")) chip.setAttribute("aria-pressed", String(chip.dataset.id === id));
  const example = MATH_LAB_EXAMPLES.find(row => row.id === id);
  if (example) about.textContent = example.hint;
  else if (id === "count" || id === "add") about.textContent = KIDS_ABOUT[id];
  else about.textContent = "Ton propre dessin. Choisis un exemple pour repartir d'un modèle.";
}

// ---- the cubes ----

/** Draw a cube picture (again, when replayed: the stage restarts its animation). */
function showKids(scene: MathScene): void {
  setMode("kids");
  kids = scene;
  kidsPanel.say.textContent = "";
  delete kidsPanel.status.dataset.kind;
  selectExample(scene.kind);
  renderKids();
  remember(kidsHash(scene));
  window.clearTimeout(revealTimer);
  if (!webgl) {
    revealAnswer();
    setState("no-webgl", KIDS_SCHEMA);
    return;
  }
  setState("loading", KIDS_SCHEMA);
  stage.scene = kidsSceneValue(scene);
  // The answer appears when the cubes have finished regrouping, so a child can guess first.
  if (scene.kind === "add") revealTimer = window.setTimeout(revealAnswer, kidsDuration(scene) * 1000);
}

function revealAnswer(): void {
  kidsPanel.answer.textContent = String(kidsAnswer(kids));
  kidsPanel.answer.dataset.revealed = "true";
}

/** A cube picture the address asked for but cannot be drawn: say why, draw nothing. */
function refuseKids(say: string): void {
  setMode("kids");
  kids = KIDS_FIRST;
  selectExample(kids.kind);
  renderKids();
  kidsPanel.say.textContent = `Pas de dessin : ${say}`;
  kidsPanel.status.dataset.kind = "refused";
  setState("refused", KIDS_SCHEMA);
}

function renderKids(): void {
  const scene = kids;
  kidsPanel.count.hidden = scene.kind !== "count";
  kidsPanel.add.hidden = scene.kind !== "add";
  if (scene.kind === "count") kidsPanel.to.textContent = String(scene.to);
  else {
    kidsPanel.a.textContent = String(scene.a);
    kidsPanel.b.textContent = String(scene.b);
    kidsPanel.answer.textContent = "?";
    kidsPanel.answer.dataset.revealed = "false";
  }
  // A press that would leave the bounds is not offered (never clamped to the nearest allowed value).
  for (const button of document.querySelectorAll<HTMLButtonElement>(".ml-kids .ml-step")) {
    button.disabled = !kidsStep(scene, button.dataset.part as KidsPart, Number(button.dataset.delta)).ok;
  }
  for (const pick of document.querySelectorAll<HTMLButtonElement>(".ml-pick")) {
    pick.setAttribute("aria-pressed", String(pick.dataset.hash === kidsHash(scene)));
  }
  kidsPanel.note.textContent = kidsLimitNote(scene);
}

function kidsChip(kind: KidsKind, label: string): void {
  const chip = el("button", "ml-chip ml-chip-kid", label);
  chip.type = "button";
  chip.dataset.id = kind;
  chip.title = KIDS_ABOUT[kind];
  chip.setAttribute("aria-pressed", "false");
  chip.addEventListener("click", () => showKids(kids.kind === kind ? kids : KIDS_START[kind]));
  kidsPanel.shelf.append(chip);
}
kidsChip("count", "Compter");
kidsChip("add", "Additionner");

function pick(shelf: HTMLElement, scene: MathScene, label: string): void {
  const button = el("button", "ml-pick", label);
  button.type = "button";
  button.dataset.hash = kidsHash(scene);
  button.setAttribute("aria-pressed", "false");
  button.addEventListener("click", () => showKids(scene));
  shelf.append(button);
}
for (const to of KIDS_COUNT_PICKS) pick(kidsPanel.countPicks, { kind: "count", to }, String(to));
for (const [a, b] of KIDS_ADD_PICKS) pick(kidsPanel.addPicks, { kind: "add", a, b }, `${a} + ${b}`);

for (const button of document.querySelectorAll<HTMLButtonElement>(".ml-kids .ml-step")) {
  button.addEventListener("click", () => {
    const next = kidsStep(kids, button.dataset.part as KidsPart, Number(button.dataset.delta));
    if (next.ok) showKids(next.scene);
  });
}
kidsPanel.replay.addEventListener("click", () => showKids(kids));
kidsPanel.next.addEventListener("click", () => {
  selectExample(MATH_LAB_EXAMPLES[0].id);
  load(MATH_LAB_EXAMPLES[0].body);
  body.scrollIntoView({ block: "nearest", behavior: "smooth" });
});

// ---- the formulas ----

for (const example of MATH_LAB_EXAMPLES) {
  const chip = el("button", "ml-chip", example.label);
  chip.type = "button";
  chip.dataset.id = example.id;
  chip.title = example.hint;
  chip.setAttribute("aria-pressed", "false");
  chip.addEventListener("click", () => {
    selectExample(example.id);
    load(example.body);
  });
  shelves[example.level].append(chip);
}

body.maxLength = MATH_BLOCK_LIMITS.body;
body.addEventListener("input", () => {
  selectExample(MATH_LAB_EXAMPLES.find(example => example.body === body.value)?.id ?? null);
  window.clearTimeout(timer);
  timer = window.setTimeout(() => read(body.value), READ_DELAY_MS);
});

copy.addEventListener("click", async () => {
  // The canonical block with the sliders' current values: ready to paste to Nestor or back here.
  const text = shown ? mathBlockText(shown.plot, values) : body.value;
  try {
    await navigator.clipboard.writeText(text);
    copied.textContent = "Copié";
  } catch {
    body.focus();
    body.select();
    copied.textContent = "Sélectionné : Ctrl+C pour copier";
  }
  copied.hidden = false;
  window.setTimeout(() => { copied.hidden = true; }, 2000);
});

stage.addEventListener("llmx-scene-applied", () => setState("drawn", root.dataset.schema));
// Values typed in the text for the same picture move it like a slider does.
stage.addEventListener("llmx-parameters-applied", () => { if (root.dataset.state === "loading") setState("drawn", root.dataset.schema); });
stage.addEventListener("llmx-scene-rejected", event => {
  const detail = (event as CustomEvent<{ reason?: string; message?: string }>).detail;
  shape = "";
  const reason = detail?.message ?? detail?.reason ?? "raison inconnue";
  if (root.dataset.mode === "kids") {
    window.clearTimeout(revealTimer);
    kidsPanel.say.textContent = `GraphysX n'a pas pu dessiner ces cubes (${reason}).`;
    kidsPanel.status.dataset.kind = "refused";
  } else refuse("GraphysX n'a pas pu dessiner ce bloc.", `Scène refusée : ${reason}`);
  setState("rejected", root.dataset.schema);
});
stage.addEventListener("llmx-stage-error", () => {
  webgl = false;
  stageNote.hidden = false;
  stageNote.textContent = "Ce navigateur ne peut pas afficher la 3D (WebGL). Les nombres et les formules sont quand même vérifiés.";
  root.classList.add("ml-no-webgl");
  if (root.dataset.mode === "kids") revealAnswer();
  setState("no-webgl", root.dataset.schema);
});

// A first visit opens on the cubes; a shared link opens on its own picture.
const initialBlock = fromAddress();
const initialKids = kidsFromHash(location.hash);
if (initialBlock !== null) {
  selectExample(MATH_LAB_EXAMPLES.find(example => example.body === initialBlock)?.id ?? null);
  load(initialBlock);
} else if (initialKids && !initialKids.ok) refuseKids(initialKids.say);
else showKids(initialKids?.ok ? initialKids.scene : KIDS_FIRST);
