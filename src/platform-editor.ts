import { MathUtils, Object3D, Raycaster, Vector2, Vector3, type PerspectiveCamera, type Scene, type WebGLRenderer } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls, type TransformControlsMode } from "three/examples/jsm/controls/TransformControls.js";
import type { AgentWorldRuntime } from "./agent-world-runtime";
import type {
  AgentWorldEntityPatch,
  AgentWorldEntityState,
  AgentWorldEntityType,
  AgentWorldMaterial,
  AgentWorldPhysicsMode,
  GraphysXAgentWorldApi,
} from "./agent-world-runtime";

export interface PlatformEditorDeps {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  orbit: OrbitControls;
  world: AgentWorldRuntime;
  api: GraphysXAgentWorldApi;
  container: HTMLElement;
  /** Called after the world is replaced/cleared so the host can re-read env (sky/fog). */
  onEnvironmentChanged?: () => void;
  /** Leave the editor and return to the showroom. Omit to hide the exit control. */
  onExit?: () => void;
}

const round = (n: number): number => Math.round(n * 1000) / 1000;

type LibraryTab = "prefabs" | "models" | "effects" | "textures";

const LIBRARY_TABS: ReadonlyArray<{ id: LibraryTab; label: string }> = [
  { id: "prefabs", label: "Prefabs" },
  { id: "models", label: "Models" },
  { id: "effects", label: "Effects" },
  { id: "textures", label: "Textures" },
];

/** One glyph per entity type so a scene tree row is scannable without reading the id. */
const TYPE_GLYPHS: Record<AgentWorldEntityType, string> = {
  group: "▤",
  agent: "☻",
  box: "▧",
  sphere: "●",
  icosahedron: "◈",
  cylinder: "▮",
  cone: "▲",
  torus: "◎",
  plane: "▬",
  spline: "∿",
  model: "⬡",
  emitter: "✷",
  "ambient-light": "○",
  "directional-light": "☀",
  "point-light": "✦",
};

/** Entity types the runtime refuses to give a rigid body (see `resolvePhysics`). */
const PHYSICS_FORBIDDEN_TYPES = new Set<AgentWorldEntityType>([
  "group",
  "spline",
  "emitter",
  "ambient-light",
  "directional-light",
  "point-light",
]);

/**
 * The human editing layer for {@link PlatformHost}: click-selection, a transform gizmo
 * that commits validated `update()`s, and a three-surface editor shell — a top toolbar,
 * a scene-tree rail, an inspector rail, and a tabbed library drawer. It drives the exact
 * same runtime/API an agent uses — every control is an ordinary API call — so human and
 * agent edits share one revision history.
 */
export class PlatformEditor {
  private readonly raycaster = new Raycaster();
  private readonly ndc = new Vector2();
  private readonly gizmo: TransformControls;
  private selectedId: string | null = null;
  private selectedObject: Object3D | null = null;
  private start: { position: Vector3; rotation: Vector3; scale: Vector3 } | null = null;
  private down: { x: number; y: number } | null = null;
  private addCounter = 0;
  private enabled = true;

  /** Remembered in memory for the session — the drawer reopens on the tab you left. */
  private libraryTab: LibraryTab = "prefabs";
  private libraryFilter = "";
  private treeFilter = "";
  /**
   * Friction/restitution are accepted by `update()` but are not reported back on
   * `AgentWorldEntityState.physics`, so the inspector remembers what the human set
   * rather than inventing a value it cannot read.
   */
  private readonly physicsExtras = new Map<string, { friction?: number; restitution?: number }>();

  /** Toolbar, scene-tree rail, inspector rail, library drawer — hidden/shown together. */
  private readonly roots: HTMLElement[];
  private readonly outliner: HTMLElement;
  private readonly readout: HTMLElement;
  private readonly treeCount: HTMLElement;
  private readonly inspector: HTMLElement;
  private readonly libraryChips: HTMLElement;
  private readonly libraryTabButtons = new Map<LibraryTab, HTMLButtonElement>();

  constructor(private readonly deps: PlatformEditorDeps) {
    this.gizmo = new TransformControls(deps.camera, deps.renderer.domElement);
    this.gizmo.setMode("translate");
    this.gizmo.setSpace("world");
    this.gizmo.setTranslationSnap(0.25);
    this.gizmo.setRotationSnap(MathUtils.degToRad(15));
    this.gizmo.setScaleSnap(0.1);
    this.gizmo.setSize(0.82);
    this.gizmo.setColors("#ff6f61", "#63e08e", "#5aa9ff", "#fff2a8");
    deps.scene.add(this.gizmo.getHelper());

    this.gizmo.addEventListener("dragging-changed", (event) => {
      deps.orbit.enabled = !event.value;
    });
    this.gizmo.addEventListener("mouseDown", () => {
      const object = this.selectedObject;
      if (!object) return;
      this.start = {
        position: object.position.clone(),
        rotation: new Vector3(object.rotation.x, object.rotation.y, object.rotation.z),
        scale: object.scale.clone(),
      };
    });
    this.gizmo.addEventListener("mouseUp", () => this.commitTransform());

    const dom = deps.renderer.domElement;
    dom.addEventListener("pointerdown", this.onPointerDown);
    dom.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("keydown", this.onKeyDown);

    const ui = this.buildUi();
    this.roots = [ui.toolbar, ui.panel, ui.rightRail, ui.drawer];
    this.outliner = ui.outliner;
    this.readout = ui.readout;
    this.treeCount = ui.treeCount;
    this.inspector = ui.inspector;
    this.libraryChips = ui.libraryChips;
    deps.container.append(ui.style, ...this.roots);
    this.renderLibrary();
    this.refresh();
  }

  /** The host skips simulation while the gizmo is being dragged. */
  isTransforming(): boolean {
    return this.gizmo.dragging;
  }

  /** Show or hide the editor chrome (the showroom starts with it hidden). Hiding also
   * disables picking/gizmo so showroom clicks (orbit, future click-to-focus) aren't hijacked. */
  setVisible(visible: boolean): void {
    this.enabled = visible;
    const display = visible ? "" : "none";
    for (const root of this.roots) root.style.display = display;
    if (!visible) {
      this.gizmo.detach();
      this.selectedObject = null;
      this.selectedId = null;
    }
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.down = { x: event.clientX, y: event.clientY };
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const down = this.down;
    this.down = null;
    if (!this.enabled || !down || this.gizmo.dragging) return;
    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    if (moved > 5) return; // a drag (orbit / gizmo), not a click
    this.pick(event.clientX, event.clientY);
  };

  private pick(clientX: number, clientY: number): void {
    const { world, renderer, camera } = this.deps;
    const rect = renderer.domElement.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, camera);
    for (const hit of this.raycaster.intersectObject(world.group, true)) {
      const entityId = world.findEntityId(hit.object);
      if (entityId) {
        this.select(entityId);
        if (world.findInteractiveEntityId(hit.object)) this.deps.api.interact(entityId);
        return;
      }
    }
    this.select(null);
  }

  private select(id: string | null): void {
    this.selectedId = id;
    this.deps.api.select(id ? [id] : []);
    this.syncGizmo();
    this.refresh();
  }

  private syncGizmo(): void {
    const object = this.selectedId ? this.deps.world.getEntityObject(this.selectedId) : null;
    if (!this.selectedId || !object) {
      this.gizmo.detach();
      this.selectedObject = null;
      return;
    }
    if (this.selectedObject !== object) {
      this.selectedObject = object;
      this.gizmo.attach(object);
    }
  }

  private commitTransform(): void {
    const id = this.selectedId;
    const object = this.selectedObject;
    const start = this.start;
    this.start = null;
    if (!id || !object || !start) return;
    const rotation = new Vector3(object.rotation.x, object.rotation.y, object.rotation.z);
    const changed = !start.position.equals(object.position) || !start.rotation.equals(rotation) || !start.scale.equals(object.scale);
    if (!changed) return;
    this.deps.api.update(id, {
      transform: {
        position: [round(object.position.x), round(object.position.y), round(object.position.z)],
        rotationDegrees: [round(MathUtils.radToDeg(object.rotation.x)), round(MathUtils.radToDeg(object.rotation.y)), round(MathUtils.radToDeg(object.rotation.z))],
        scale: [round(object.scale.x), round(object.scale.y), round(object.scale.z)],
      },
    });
    this.refresh();
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.enabled) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
    switch (event.key.toLowerCase()) {
      case "w": this.setMode("translate"); break;
      case "e": this.setMode("rotate"); break;
      case "r": this.setMode("scale"); break;
      case "delete":
      case "backspace":
        if (this.selectedId) this.removeSelected();
        break;
      default: return;
    }
  };

  private setMode(mode: TransformControlsMode): void {
    this.gizmo.setMode(mode);
    this.refresh();
  }

  private addPrimitive(kind: "box" | "sphere" | "point-light"): void {
    this.addCounter += 1;
    const id = `edit-${kind}-${this.addCounter}`;
    const position: [number, number, number] = [round((this.addCounter % 5) - 2), 4, round((Math.floor(this.addCounter / 5) % 5) - 2)];
    let result;
    if (kind === "box") {
      result = this.deps.api.spawn({ id, type: "box", geometry: { width: 1.2, height: 1.2, depth: 1.2 }, transform: { position }, material: { color: "#8ad9ff", roughness: 0.6 }, physics: { mode: "dynamic", mass: 1, material: "default" } });
    } else if (kind === "sphere") {
      result = this.deps.api.spawn({ id, type: "sphere", geometry: { radius: 0.7 }, transform: { position }, material: { color: "#ffce7a", roughness: 0.4 }, physics: { mode: "dynamic", mass: 1, material: "ball", restitution: 0.6 } });
    } else {
      result = this.deps.api.spawn({ id, type: "point-light", intensity: 12, distance: 30, transform: { position: [position[0], 6, position[2]] }, material: { color: "#fff2cf" } });
    }
    if (result.ok) this.select(id);
    else this.refresh();
  }

  private removeSelected(): void {
    if (!this.selectedId) return;
    this.deps.api.remove(this.selectedId);
    this.select(null);
  }

  private loadStarter(id: string): void {
    if (!id) return;
    this.deps.api.loadStarter(id as Parameters<GraphysXAgentWorldApi["loadStarter"]>[0]);
    this.deps.onEnvironmentChanged?.();
    this.select(null);
  }

  /**
   * @param inspector how to treat the inspector panel:
   * `auto` rebuild unless a field is focused; `force` rebuild regardless (an API call was
   * rejected, so the panel must snap back to what the world actually holds); `skip` leave
   * it alone — the panel already shows what the user just typed, and tearing it down here
   * would destroy the button the user is mid-click on when a field commits on blur.
   */
  private refresh(inspector: "auto" | "skip" | "force" = "auto"): void {
    const state = this.deps.api.state();
    const entities = state?.entities ?? [];
    this.readout.textContent = this.selectedId
      ? `${this.selectedId} · ${this.gizmo.getMode()} · rev ${state?.revision ?? 0}`
      : `${entities.length} entities · rev ${state?.revision ?? 0} · click to select`;

    const selected = entities.find((entity) => entity.id === this.selectedId) ?? null;
    // Rebuilding while an inspector *field* has focus would swallow the edit that is still
    // in flight. Buttons are fine to blow away — they have already done their work.
    const focus = document.activeElement;
    const editing = focus instanceof HTMLElement
      && this.inspector.contains(focus)
      && (focus.tagName === "INPUT" || focus.tagName === "SELECT" || focus.tagName === "TEXTAREA");
    if (inspector === "force" || (inspector === "auto" && !editing)) this.renderInspector(selected);

    const needle = this.treeFilter.trim().toLowerCase();
    const visible = needle
      ? entities.filter((entity) => `${entity.id} ${entity.label} ${entity.type}`.toLowerCase().includes(needle))
      : entities;
    this.treeCount.textContent = needle ? `${visible.length}/${entities.length}` : String(entities.length);

    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "gx-ed-empty";
      empty.textContent = entities.length ? "No entity matches that filter." : "The scene is empty.";
      this.outliner.replaceChildren(empty);
      return;
    }
    this.outliner.replaceChildren(
      ...visible.map((entity) => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "gx-ed-row" + (entity.id === this.selectedId ? " gx-ed-row--active" : "");
        row.title = `${entity.id} — ${entity.type}`;
        const glyph = document.createElement("span");
        glyph.className = "gx-ed-glyph";
        glyph.textContent = TYPE_GLYPHS[entity.type] ?? "◇";
        const name = document.createElement("span");
        name.className = "gx-ed-row-id";
        name.textContent = entity.id;
        const type = document.createElement("span");
        type.className = "gx-ed-row-type";
        type.textContent = entity.type;
        row.append(glyph, name, type);
        row.addEventListener("click", () => this.select(entity.id));
        return row;
      }),
    );
    // A selection made by clicking the scene (or by spawning) has to be findable in a
    // 60-row tree, so bring the active row into view.
    this.outliner.querySelector(".gx-ed-row--active")?.scrollIntoView({ block: "nearest" });
  }

  // ---------------------------------------------------------------- inspector

  /**
   * Per-selection editing: transform, material, physics, behaviours, and (for emitters)
   * the particle preset. Every control is an ordinary `api.update` / `api.attachBehavior`
   * / `api.detachBehavior` call, so a human edit and an agent edit land in the same
   * revision history.
   */
  private renderInspector(entity: AgentWorldEntityState | null): void {
    if (!entity) {
      const empty = document.createElement("div");
      empty.className = "gx-ed-blank";
      const glyph = document.createElement("div");
      glyph.className = "gx-ed-blank-glyph";
      glyph.textContent = "◇";
      const text = document.createElement("div");
      text.textContent = "Nothing selected";
      const hint = document.createElement("div");
      hint.className = "gx-ed-hint";
      hint.textContent = "Click an object in the scene, pick a row from the scene tree, or add one from the library below.";
      empty.append(glyph, text, hint);
      this.inspector.replaceChildren(empty);
      return;
    }

    const header = document.createElement("div");
    header.className = "gx-ed-ident";
    const name = document.createElement("div");
    name.className = "gx-ed-ident-id";
    name.textContent = entity.id;
    name.title = entity.id;
    const badge = document.createElement("span");
    badge.className = "gx-ed-badge";
    badge.textContent = `${TYPE_GLYPHS[entity.type] ?? "◇"} ${entity.type}`;
    header.append(name, badge);

    const sections: HTMLElement[] = [header, this.transformSection(entity), this.materialSection(entity), this.physicsSection(entity), this.behaviourSection(entity)];
    if (entity.type === "emitter") sections.push(this.emitterSection(entity));
    this.inspector.replaceChildren(...sections);
  }

  /**
   * One `api.update` call site for the inspector, so a rejected patch always re-reads truth.
   * @param onSuccess whether an accepted patch should also rebuild the panel — inspector
   * fields say no (they already show the new value), outside controls say yes.
   */
  private patchEntity(id: string, patch: AgentWorldEntityPatch, onSuccess: "skip" | "force" = "skip"): void {
    const result = this.deps.api.update(id, patch);
    this.refresh(result.ok ? onSuccess : "force");
  }

  private transformSection(entity: AgentWorldEntityState): HTMLElement {
    const commit = (): void => {
      this.patchEntity(entity.id, {
        transform: {
          position: readVector(position),
          rotationDegrees: readVector(rotation),
          scale: readVector(scale),
        },
      });
      this.syncGizmo();
    };
    const position = this.vectorRow("Position", entity.position, 0.1, commit);
    const rotation = this.vectorRow("Rotation", entity.rotationDegrees, 5, commit);
    const scale = this.vectorRow("Scale", entity.scale, 0.1, commit);
    return this.section("Transform", [position.row, rotation.row, scale.row]);
  }

  private materialSection(entity: AgentWorldEntityState): HTMLElement {
    const patch = (values: Partial<AgentWorldMaterial>): void => this.patchEntity(entity.id, { material: values });
    const colour = this.colourInput(entity.material.color, (value) => patch({ color: value }));
    const emissive = this.colourInput(entity.material.emissive, (value) => patch({ emissive: value }));
    const roughness = this.sliderInput(entity.material.roughness, 0, 1, 0.01, (value) => patch({ roughness: value }));
    const metalness = this.sliderInput(entity.material.metalness, 0, 1, 0.01, (value) => patch({ metalness: value }));
    const opacity = this.sliderInput(entity.material.opacity, 0, 1, 0.01, (value) => patch({ opacity: value }));

    const texture = document.createElement("div");
    texture.className = "gx-ed-inline";
    const current = document.createElement("span");
    current.className = "gx-ed-value";
    current.textContent = entity.material.texture?.id ?? "none";
    texture.append(current, this.chip("Clear texture", () => patch({ texture: null })));

    return this.section("Material", [
      this.field("Colour", colour),
      this.field("Emissive", emissive),
      this.field("Roughness", roughness),
      this.field("Metalness", metalness),
      this.field("Opacity", opacity),
      this.field("Texture", texture),
    ]);
  }

  private physicsSection(entity: AgentWorldEntityState): HTMLElement {
    // The runtime rejects rigid bodies on these types (and on any child entity), so the
    // inspector must not offer a control whose only outcome is a thrown update.
    if (PHYSICS_FORBIDDEN_TYPES.has(entity.type) || entity.parentId) {
      const hint = document.createElement("div");
      hint.className = "gx-ed-hint";
      hint.textContent = entity.parentId
        ? "Child entities move with their parent — physics bodies live at the world root."
        : `${/^[aeiou]/.test(entity.type) ? "An" : "A"} ${entity.type} entity does not take a rigid body.`;
      return this.section("Physics", [hint]);
    }

    const extras = this.physicsExtras.get(entity.id) ?? {};
    const mode = this.selectInput(["static", "dynamic", "kinematic"], entity.physics?.mode ?? "static");
    const mass = this.numberInput(entity.physics?.mass ?? 1, 0.1, 0);
    const restitution = this.numberInput(extras.restitution, 0.05, 0);
    const friction = this.numberInput(extras.friction, 0.05, 0);

    const commit = (): void => {
      const next: { friction?: number; restitution?: number } = {};
      if (restitution.value !== "") next.restitution = Number(restitution.value);
      if (friction.value !== "") next.friction = Number(friction.value);
      this.physicsExtras.set(entity.id, next);
      this.patchEntity(entity.id, {
        physics: {
          mode: mode.value as AgentWorldPhysicsMode,
          mass: mass.value === "" ? 1 : Number(mass.value),
          ...next,
        },
      });
    };
    for (const input of [mode, mass, restitution, friction]) input.addEventListener("change", commit);

    return this.section("Physics", [
      this.field("Mode", mode),
      this.field("Mass", mass),
      this.field("Restitution", restitution),
      this.field("Friction", friction),
    ]);
  }

  private behaviourSection(entity: AgentWorldEntityState): HTMLElement {
    const rows: HTMLElement[] = [];
    for (const behavior of entity.behaviors) {
      const row = document.createElement("div");
      row.className = "gx-ed-attached";
      const label = document.createElement("span");
      label.textContent = behavior.type;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "gx-ed-x";
      remove.textContent = "×";
      remove.title = `Detach ${behavior.type}`;
      remove.addEventListener("click", () => {
        this.deps.api.detachBehavior(entity.id, behavior.id);
        this.refresh("force");
      });
      row.append(label, remove);
      rows.push(row);
    }
    if (!rows.length) {
      const none = document.createElement("div");
      none.className = "gx-ed-hint";
      none.textContent = "No behaviours attached.";
      rows.push(none);
    }

    const add = document.createElement("div");
    add.className = "gx-ed-grid";
    const attach = (behavior: Parameters<GraphysXAgentWorldApi["attachBehavior"]>[1]) => () => {
      this.deps.api.attachBehavior(entity.id, behavior);
      this.refresh("force");
    };
    add.append(
      this.chip("+ Spin", attach({ type: "spin", axis: "y", speedDegrees: 45 })),
      this.chip("+ Bob", attach({ type: "bob", axis: "y", amplitude: 0.6, frequencyHz: 0.4 })),
      this.chip("+ Pulse", attach({ type: "pulse", minimumScale: 0.85, maximumScale: 1.25, frequencyHz: 0.5 })),
    );
    rows.push(add);
    return this.section("Behaviours", rows);
  }

  private emitterSection(entity: AgentWorldEntityState): HTMLElement {
    const presets = this.deps.api.emitters();
    const resolved = entity.emitter;
    const preset = document.createElement("select");
    for (const descriptor of presets) {
      const option = document.createElement("option");
      option.value = descriptor.id;
      option.textContent = descriptor.label;
      option.title = descriptor.description;
      preset.append(option);
    }
    if (resolved) preset.value = resolved.preset;

    const rate = this.numberInput(resolved?.rate, 5, 0);
    const sizeScale = this.numberInput(resolved?.sizeScale, 0.1, 0);
    const commit = (): void => {
      this.patchEntity(entity.id, {
        emitter: {
          preset: preset.value,
          ...(rate.value === "" ? {} : { rate: Number(rate.value) }),
          ...(sizeScale.value === "" ? {} : { sizeScale: Number(sizeScale.value) }),
        } as never,
      });
    };
    for (const input of [preset, rate, sizeScale]) input.addEventListener("change", commit);

    const fields = [this.field("Preset", preset)];
    if (resolved) fields.push(this.field("Rate", rate), this.field("Size", sizeScale));
    return this.section("Emitter", fields);
  }

  // ------------------------------------------------------------------ widgets

  private section(label: string, children: HTMLElement[]): HTMLElement {
    const details = document.createElement("details");
    details.className = "gx-ed-section";
    details.open = true;
    const summary = document.createElement("summary");
    summary.className = "gx-ed-title";
    summary.textContent = label;
    const body = document.createElement("div");
    body.className = "gx-ed-body";
    body.append(...children);
    details.append(summary, body);
    return details;
  }

  private field(label: string, control: HTMLElement): HTMLElement {
    const row = document.createElement("div");
    row.className = "gx-ed-field";
    const name = document.createElement("span");
    name.className = "gx-ed-label";
    name.textContent = label;
    row.append(name, control);
    return row;
  }

  private vectorRow(
    label: string,
    values: readonly [number, number, number],
    step: number,
    commit: () => void,
  ): { row: HTMLElement; inputs: HTMLInputElement[] } {
    const inputs = values.map((value) => {
      const input = this.numberInput(round(value), step);
      input.addEventListener("change", commit);
      return input;
    });
    const group = document.createElement("div");
    group.className = "gx-ed-vec";
    const axes = ["x", "y", "z"];
    inputs.forEach((input, index) => {
      const cell = document.createElement("label");
      cell.className = "gx-ed-axis";
      const tag = document.createElement("span");
      tag.textContent = axes[index] ?? "";
      cell.append(tag, input);
      group.append(cell);
    });
    return { row: this.field(label, group), inputs };
  }

  private numberInput(value: number | undefined, step: number, min?: number): HTMLInputElement {
    const input = document.createElement("input");
    input.type = "number";
    input.step = String(step);
    if (min !== undefined) input.min = String(min);
    input.value = value === undefined ? "" : String(round(value));
    input.placeholder = "—";
    return input;
  }

  private colourInput(value: string, onChange: (value: string) => void): HTMLInputElement {
    const input = document.createElement("input");
    input.type = "color";
    input.value = /^#[0-9a-f]{6}$/i.test(value) ? value : "#8ad9ff";
    input.addEventListener("input", () => onChange(input.value));
    return input;
  }

  private sliderInput(value: number, min: number, max: number, step: number, onChange: (value: number) => void): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "gx-ed-slider";
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    const readout = document.createElement("span");
    readout.className = "gx-ed-value";
    readout.textContent = round(value).toFixed(2);
    input.addEventListener("input", () => { readout.textContent = Number(input.value).toFixed(2); });
    input.addEventListener("change", () => onChange(Number(input.value)));
    wrap.append(input, readout);
    return wrap;
  }

  private selectInput(options: readonly string[], value: string): HTMLSelectElement {
    const select = document.createElement("select");
    for (const option of options) {
      const element = document.createElement("option");
      element.value = option;
      element.textContent = option;
      select.append(element);
    }
    select.value = value;
    return select;
  }

  // ------------------------------------------------------------------- shell

  private buildUi(): {
    style: HTMLStyleElement;
    toolbar: HTMLElement;
    panel: HTMLElement;
    rightRail: HTMLElement;
    drawer: HTMLElement;
    outliner: HTMLElement;
    readout: HTMLElement;
    treeCount: HTMLElement;
    inspector: HTMLElement;
    libraryChips: HTMLElement;
  } {
    const style = document.createElement("style");
    style.textContent = EDITOR_CSS;
    const toolbar = this.buildToolbar();
    const tree = this.buildSceneTree();
    const right = this.buildInspectorRail();
    const drawer = this.buildLibraryDrawer();
    return {
      style,
      toolbar,
      panel: tree.panel,
      rightRail: right.panel,
      drawer: drawer.panel,
      outliner: tree.outliner,
      readout: right.readout,
      treeCount: tree.count,
      inspector: right.inspector,
      libraryChips: drawer.chips,
    };
  }

  private buildToolbar(): HTMLElement {
    const toolbar = document.createElement("div");
    toolbar.className = "gx-ed-toolbar";

    if (this.deps.onExit) {
      const exit = this.toolButton("← Showroom", () => this.deps.onExit?.());
      exit.classList.add("gx-ed-exit");
      toolbar.append(this.group([exit]));
    }

    const modeButtons: Record<TransformControlsMode, HTMLButtonElement> = {
      translate: this.toolButton("Move", () => this.setMode("translate"), "Translate gizmo (W)"),
      rotate: this.toolButton("Rotate", () => this.setMode("rotate"), "Rotate gizmo (E)"),
      scale: this.toolButton("Scale", () => this.setMode("scale"), "Scale gizmo (R)"),
    };
    const syncModeButtons = (): void => {
      (Object.keys(modeButtons) as TransformControlsMode[]).forEach((mode) => {
        modeButtons[mode].classList.toggle("gx-ed-on", this.gizmo.getMode() === mode);
      });
    };
    this.gizmo.addEventListener("change", syncModeButtons);
    toolbar.append(this.group([modeButtons.translate, modeButtons.rotate, modeButtons.scale]));

    toolbar.append(this.group([
      this.toolButton("+ Box", () => this.addPrimitive("box")),
      this.toolButton("+ Sphere", () => this.addPrimitive("sphere")),
      this.toolButton("+ Light", () => this.addPrimitive("point-light")),
      this.toolButton("Delete", () => this.removeSelected(), "Delete selection (Del)"),
    ]));

    let paused = false;
    const pauseButton = this.toolButton("Pause", () => {
      paused = !paused;
      this.deps.api.pause(paused);
      pauseButton.textContent = paused ? "Play" : "Pause";
      pauseButton.classList.toggle("gx-ed-on", paused);
    });
    toolbar.append(this.group([
      pauseButton,
      this.toolButton("Step", () => { this.deps.api.step(); this.refresh(); }),
      this.toolButton("Undo", () => { this.deps.api.undo(); this.select(null); }),
    ]));

    toolbar.append(this.group([
      this.toolButton("Save", () => this.saveScene()),
      this.toolButton("Load", () => this.loadScene()),
      this.toolButton("Export", () => this.exportScene()),
    ]));

    const starter = document.createElement("select");
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Load starter…";
    starter.append(placeholder);
    this.deps.api.starters().forEach((descriptor) => {
      const option = document.createElement("option");
      option.value = descriptor.id;
      option.textContent = descriptor.label ?? descriptor.id;
      starter.append(option);
    });
    starter.addEventListener("change", () => {
      this.loadStarter(starter.value);
      starter.value = "";
    });
    toolbar.append(this.group([starter]));

    syncModeButtons();
    return toolbar;
  }

  private buildSceneTree(): { panel: HTMLElement; outliner: HTMLElement; count: HTMLElement } {
    const panel = document.createElement("div");
    panel.className = "gx-ed-panel gx-ed-panel--left";

    const head = document.createElement("div");
    head.className = "gx-ed-head";
    const title = document.createElement("span");
    title.className = "gx-ed-title";
    title.textContent = "Scene";
    const count = document.createElement("span");
    count.className = "gx-ed-count";
    head.append(title, count);

    const filter = document.createElement("input");
    filter.type = "search";
    filter.className = "gx-ed-filter";
    filter.placeholder = "Filter entities…";
    filter.addEventListener("input", () => {
      this.treeFilter = filter.value;
      this.refresh();
    });

    const outliner = document.createElement("div");
    outliner.className = "gx-ed-list";
    panel.append(head, filter, outliner);
    return { panel, outliner, count };
  }

  private buildInspectorRail(): { panel: HTMLElement; inspector: HTMLElement; readout: HTMLElement } {
    const panel = document.createElement("div");
    panel.className = "gx-ed-panel gx-ed-panel--right";

    const head = document.createElement("div");
    head.className = "gx-ed-head";
    const title = document.createElement("span");
    title.className = "gx-ed-title";
    title.textContent = "Inspector";
    head.append(title);

    const readout = document.createElement("div");
    readout.className = "gx-ed-readout";

    const inspector = document.createElement("div");
    inspector.className = "gx-ed-inspector";

    panel.append(head, readout, inspector, this.buildEnvironment());
    return { panel, inspector, readout };
  }

  private buildLibraryDrawer(): { panel: HTMLElement; chips: HTMLElement } {
    const panel = document.createElement("div");
    panel.className = "gx-ed-panel gx-ed-panel--drawer";

    const head = document.createElement("div");
    head.className = "gx-ed-head gx-ed-head--drawer";
    const title = document.createElement("span");
    title.className = "gx-ed-title";
    title.textContent = "Library";

    const tabs = document.createElement("div");
    tabs.className = "gx-ed-tabs";
    for (const tab of LIBRARY_TABS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "gx-ed-tab";
      button.textContent = tab.label;
      button.addEventListener("click", () => {
        this.libraryTab = tab.id;
        this.renderLibrary();
      });
      this.libraryTabButtons.set(tab.id, button);
      tabs.append(button);
    }

    const filter = document.createElement("input");
    filter.type = "search";
    filter.className = "gx-ed-filter gx-ed-filter--inline";
    filter.placeholder = "Search library…";
    filter.addEventListener("input", () => {
      this.libraryFilter = filter.value;
      this.renderLibrary();
    });

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "gx-ed-collapse";
    toggle.textContent = "▾";
    toggle.title = "Collapse library";
    toggle.addEventListener("click", () => {
      const collapsed = panel.classList.toggle("gx-ed-panel--collapsed");
      toggle.textContent = collapsed ? "▴" : "▾";
      toggle.title = collapsed ? "Expand library" : "Collapse library";
    });

    head.append(title, tabs, filter, toggle);

    const chips = document.createElement("div");
    chips.className = "gx-ed-grid gx-ed-grid--drawer";
    panel.append(head, chips);
    return { panel, chips };
  }

  /** Scene-scoped environment: the recovered skybox sets, selectable per scene. */
  private buildEnvironment(): HTMLElement {
    const select = document.createElement("select");
    const none = document.createElement("option");
    none.value = "";
    none.textContent = "No sky (flat colour)";
    select.append(none);
    for (const sky of this.deps.api.skies()) {
      const option = document.createElement("option");
      option.value = sky.id;
      option.textContent = sky.label;
      option.title = sky.description;
      select.append(option);
    }
    select.value = this.deps.world.getEnvironment().sky ?? "";
    select.addEventListener("change", () => this.setSky(select.value || null));
    return this.section("Environment", [this.field("Sky", select)]);
  }

  /**
   * Environment is part of the scene definition rather than a mutable field, so changing
   * the sky is an export → patch → load round trip. Entities survive; selection does not.
   */
  private setSky(skyId: string | null): void {
    const definition = this.deps.api.export();
    if (!definition) return;
    this.deps.api.load({
      ...definition,
      environment: { ...definition.environment, sky: skyId as never },
    });
    this.deps.onEnvironmentChanged?.();
    this.select(null);
  }

  private saveScene(): void {
    const name = window.prompt("Save scene as", "editor-scene");
    if (!name) return;
    this.deps.api.save(name);
  }

  private loadScene(): void {
    const name = window.prompt("Load saved scene", "editor-scene");
    if (!name) return;
    const result = this.deps.api.load(name);
    if (result.ok) {
      this.deps.onEnvironmentChanged?.();
      this.select(null);
    }
  }

  private exportScene(): void {
    const definition = this.deps.api.export();
    if (!definition) return;
    const blob = new Blob([JSON.stringify(definition, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${definition.id ?? "scene"}.graphysx.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // ----------------------------------------------------------------- library

  /**
   * The curated vocabulary the API already exposes — prefabs, mesh assets, emitter presets
   * and textures — one tab at a time. Every chip is an ordinary API call, so a human
   * picking from the library produces the same revision an agent would.
   */
  private renderLibrary(): void {
    for (const [id, button] of this.libraryTabButtons) button.classList.toggle("gx-ed-tab--on", id === this.libraryTab);
    const needle = this.libraryFilter.trim().toLowerCase();
    const chips = this.libraryChipsFor(this.libraryTab).filter((chip) => !needle || chip.textContent!.toLowerCase().includes(needle));
    if (!chips.length) {
      const empty = document.createElement("div");
      empty.className = "gx-ed-hint";
      empty.textContent = "Nothing in this tab matches that search.";
      this.libraryChips.replaceChildren(empty);
      return;
    }
    this.libraryChips.replaceChildren(...chips);
  }

  private libraryChipsFor(tab: LibraryTab): HTMLButtonElement[] {
    if (tab === "prefabs") {
      return this.deps.api.prefabs().map((prefab) =>
        this.chip(prefab.label ?? prefab.id, () => {
          this.addCounter += 1;
          const result = this.deps.api.spawnPrefab(prefab.id as Parameters<GraphysXAgentWorldApi["spawnPrefab"]>[0], {
            idPrefix: `edit-${prefab.id}-${this.addCounter}`,
            position: [round(((this.addCounter % 4) - 1.5) * 4), 0, round((Math.floor(this.addCounter / 4) % 4 - 1.5) * 4)],
          });
          if (result.ok) this.refresh();
        }),
      );
    }
    if (tab === "models") {
      return this.deps.api.assets().map((asset) =>
        this.chip(asset.label ?? asset.id, () => {
          this.addCounter += 1;
          const id = `edit-model-${this.addCounter}`;
          const result = this.deps.api.spawn({
            id,
            type: "model",
            asset: { id: asset.id } as never,
            transform: { position: [round(((this.addCounter % 4) - 1.5) * 3), 0, round((Math.floor(this.addCounter / 4) % 4 - 1.5) * 3)] },
          });
          if (result.ok) this.select(id);
        }),
      );
    }
    if (tab === "effects") {
      // Particle emitters are a first-class v2 entity type, so a human picks a preset here the
      // same way an agent calls api.spawn({ type: "emitter", emitter: { preset } }).
      return this.deps.api.emitters().map((emitter) =>
        this.chip(emitter.label, () => {
          this.addCounter += 1;
          const id = `edit-emitter-${this.addCounter}`;
          const result = this.deps.api.spawn({
            id,
            type: "emitter",
            label: emitter.label,
            transform: { position: [0, 0, 0] },
            emitter: { preset: emitter.id },
            tags: ["effect", emitter.category],
          });
          if (result.ok) this.select(id);
          else this.refresh();
        }, `${emitter.description}\n\nArchive: ${emitter.provenance.presetRecord} (emitter ${emitter.provenance.emitterIndex}) — ${emitter.provenance.textureFile}`),
      );
    }
    return this.deps.api.textures().map((texture) =>
      this.chip(texture.label ?? texture.id, () => {
        if (!this.selectedId) return;
        this.patchEntity(this.selectedId, {
          material: { texture: { id: texture.id as never, repeat: texture.defaultRepeat } },
        }, "force");
      }, "Applies to the current selection."),
    );
  }

  private chip(label: string, onClick: () => void, title?: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "gx-ed-chip";
    button.textContent = label;
    if (title) button.title = title;
    button.addEventListener("click", onClick);
    return button;
  }

  private toolButton(label: string, onClick: () => void, title?: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    if (title) button.title = title;
    button.addEventListener("click", onClick);
    return button;
  }

  private group(children: HTMLElement[]): HTMLElement {
    const group = document.createElement("div");
    group.className = "gx-ed-group";
    group.append(...children);
    return group;
  }

  dispose(): void {
    const dom = this.deps.renderer.domElement;
    dom.removeEventListener("pointerdown", this.onPointerDown);
    dom.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("keydown", this.onKeyDown);
    this.gizmo.detach();
    this.gizmo.dispose();
    for (const root of this.roots) root.remove();
  }
}

const readVector = (row: { inputs: HTMLInputElement[] }): [number, number, number] => {
  const [x, y, z] = row.inputs.map((input) => round(Number(input.value) || 0));
  return [x ?? 0, y ?? 0, z ?? 0];
};

/**
 * One visual system for the whole editor: every colour, radius and gap comes from a custom
 * property, so the rails, drawer and toolbar cannot drift apart.
 */
const EDITOR_CSS = `
.gx-ed-toolbar,.gx-ed-panel{
  --gx-panel:rgba(8,20,28,.88);
  --gx-raise:rgba(16,38,49,.9);
  --gx-border:#1b3b49;
  --gx-border-soft:#153040;
  --gx-accent:#37b6d3;
  --gx-accent-deep:#1c6a80;
  --gx-text:#dbeff5;
  --gx-muted:#7fb0c0;
  --gx-field:#0b222c;
  --gx-radius:8px;
  --gx-radius-sm:6px;
  --gx-s1:4px; --gx-s2:6px; --gx-s3:8px; --gx-s4:12px; --gx-s5:16px;
  position:fixed;z-index:20;box-sizing:border-box;
  font:12px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;color:var(--gx-text);
  background:var(--gx-panel);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  border:1px solid var(--gx-border);border-radius:var(--gx-radius);
  box-shadow:0 10px 34px rgba(0,10,16,.42);
}
.gx-ed-toolbar *,.gx-ed-panel *{box-sizing:border-box}

/* ---- top bar ---- */
.gx-ed-toolbar{top:var(--gx-s4);left:var(--gx-s4);right:var(--gx-s4);display:flex;flex-wrap:wrap;align-items:center;gap:var(--gx-s3);padding:var(--gx-s2) var(--gx-s3);user-select:none}
.gx-ed-group{display:flex;align-items:center;gap:var(--gx-s1)}
.gx-ed-group+.gx-ed-group{padding-left:var(--gx-s3);border-left:1px solid var(--gx-border-soft)}
.gx-ed-toolbar button,.gx-ed-toolbar select{background:var(--gx-field);color:var(--gx-text);border:1px solid var(--gx-border);border-radius:var(--gx-radius-sm);padding:5px 10px;cursor:pointer;font:inherit;line-height:1.2}
.gx-ed-toolbar button:hover,.gx-ed-toolbar select:hover{background:var(--gx-raise);border-color:var(--gx-accent-deep)}
.gx-ed-toolbar button.gx-ed-on{background:var(--gx-accent-deep);border-color:var(--gx-accent);color:#fff}
.gx-ed-exit{background:var(--gx-raise);border-color:var(--gx-accent-deep)}

/* ---- rails ---- */
.gx-ed-panel{display:flex;flex-direction:column;gap:var(--gx-s3);padding:var(--gx-s3)}
.gx-ed-panel--left{top:60px;left:var(--gx-s4);bottom:var(--gx-s4);width:236px}
.gx-ed-panel--right{top:60px;right:var(--gx-s4);bottom:var(--gx-s4);width:296px;overflow-y:auto}
.gx-ed-panel--drawer{left:264px;right:324px;bottom:var(--gx-s4);max-height:224px;gap:var(--gx-s2)}
.gx-ed-panel--drawer.gx-ed-panel--collapsed{max-height:none}
.gx-ed-panel--collapsed .gx-ed-grid--drawer{display:none}

.gx-ed-head{display:flex;align-items:center;gap:var(--gx-s3);flex:none}
.gx-ed-head--drawer{flex-wrap:nowrap}
.gx-ed-title{font:600 10px/1.4 system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--gx-muted);flex:none}
.gx-ed-count{margin-left:auto;font:600 10px/1 system-ui,sans-serif;color:var(--gx-accent);background:rgba(55,182,211,.13);border:1px solid var(--gx-border);border-radius:99px;padding:3px 8px}
.gx-ed-readout{font-size:11px;color:var(--gx-muted);word-break:break-all;flex:none}

/* ---- inputs (one look, everywhere) ---- */
.gx-ed-panel input,.gx-ed-panel select{background:var(--gx-field);color:var(--gx-text);border:1px solid var(--gx-border);border-radius:var(--gx-radius-sm);padding:4px 6px;font:11px/1.3 system-ui,sans-serif;min-width:0}
.gx-ed-panel input:hover,.gx-ed-panel select:hover{border-color:var(--gx-accent-deep)}
.gx-ed-panel input:focus,.gx-ed-panel select:focus,.gx-ed-panel button:focus-visible{outline:none;border-color:var(--gx-accent);box-shadow:0 0 0 2px rgba(55,182,211,.24)}
.gx-ed-panel input[type=color]{padding:1px;width:44px;height:22px;cursor:pointer;flex:none}
/* Spinners steal a third of a narrow numeric field and clip the value. */
.gx-ed-panel input[type=number]{-moz-appearance:textfield;text-align:right}
.gx-ed-panel input[type=number]::-webkit-outer-spin-button,
.gx-ed-panel input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.gx-ed-panel input[type=range]{accent-color:var(--gx-accent);padding:0;border:none;background:none;width:100%;cursor:pointer}
.gx-ed-filter{width:100%;flex:none;padding:5px 8px}
.gx-ed-filter--inline{width:auto;flex:1 1 120px;min-width:90px}

/* ---- scene tree ---- */
.gx-ed-list{overflow-y:auto;display:flex;flex-direction:column;gap:2px;flex:1 1 auto;min-height:0;padding-right:2px}
.gx-ed-row{display:flex;align-items:center;gap:var(--gx-s2);text-align:left;width:100%;background:transparent;color:#c6e2ea;border:1px solid transparent;border-radius:var(--gx-radius-sm);padding:4px 6px;cursor:pointer;font:11px/1.3 system-ui,sans-serif}
.gx-ed-row:hover{background:var(--gx-raise);border-color:var(--gx-border)}
.gx-ed-row--active{background:var(--gx-accent-deep);border-color:var(--gx-accent);color:#fff;font-weight:600}
.gx-ed-glyph{flex:none;width:13px;text-align:center;color:var(--gx-accent);font-size:11px}
.gx-ed-row--active .gx-ed-glyph{color:#fff}
.gx-ed-row-id{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gx-ed-row-type{flex:none;font-size:9.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--gx-muted);opacity:.9}
.gx-ed-row--active .gx-ed-row-type{color:#cdeef7}

/* ---- inspector ---- */
.gx-ed-inspector{display:flex;flex-direction:column;gap:5px}
.gx-ed-ident{display:flex;align-items:center;gap:var(--gx-s2);justify-content:space-between;background:var(--gx-raise);border:1px solid var(--gx-border);border-radius:var(--gx-radius-sm);padding:5px var(--gx-s3)}
.gx-ed-ident-id{font:600 12px/1.3 system-ui,sans-serif;color:#eaf9ff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gx-ed-badge{flex:none;font:600 9.5px/1 system-ui,sans-serif;letter-spacing:.07em;text-transform:uppercase;color:var(--gx-accent);border:1px solid var(--gx-border);background:rgba(55,182,211,.13);border-radius:99px;padding:4px 7px}
.gx-ed-section{border:1px solid var(--gx-border-soft);border-radius:var(--gx-radius-sm);background:rgba(4,14,20,.4)}
.gx-ed-section>summary{list-style:none;cursor:pointer;padding:5px var(--gx-s3);display:flex;align-items:center;gap:var(--gx-s2)}
.gx-ed-section>summary::-webkit-details-marker{display:none}
.gx-ed-section>summary::after{content:"▾";margin-left:auto;font-size:9px;color:var(--gx-muted)}
.gx-ed-section:not([open])>summary::after{content:"▸"}
.gx-ed-section>summary:hover{color:var(--gx-accent)}
.gx-ed-body{display:flex;flex-direction:column;gap:5px;padding:0 var(--gx-s3) var(--gx-s3)}
.gx-ed-field{display:flex;align-items:center;gap:var(--gx-s2)}
.gx-ed-label{flex:0 0 58px;font-size:10.5px;color:var(--gx-muted)}
.gx-ed-field>:not(.gx-ed-label){flex:1 1 auto;min-width:0}
.gx-ed-vec{display:grid;grid-template-columns:repeat(3,1fr);gap:3px}
.gx-ed-axis{display:flex;align-items:center;gap:2px;min-width:0}
.gx-ed-axis>span{flex:none;font:600 9px/1 system-ui,sans-serif;text-transform:uppercase;color:var(--gx-muted)}
.gx-ed-axis>input{width:100%;padding:4px 4px}
.gx-ed-slider{display:flex;align-items:center;gap:var(--gx-s2)}
.gx-ed-value{flex:none;font:11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--gx-muted);min-width:34px;text-align:right}
.gx-ed-inline{display:flex;align-items:center;gap:var(--gx-s2);justify-content:flex-end}
.gx-ed-attached{display:flex;align-items:center;gap:var(--gx-s2);background:var(--gx-field);border:1px solid var(--gx-border);border-radius:var(--gx-radius-sm);padding:3px 4px 3px 8px;font-size:11px}
.gx-ed-attached>span{flex:1 1 auto}
.gx-ed-x{flex:none;background:transparent;border:1px solid transparent;border-radius:4px;color:var(--gx-muted);cursor:pointer;font:14px/1 system-ui,sans-serif;padding:1px 6px}
.gx-ed-x:hover{background:#5c2230;border-color:#8d3346;color:#ffd9e0}
.gx-ed-blank{display:flex;flex-direction:column;align-items:center;gap:var(--gx-s2);text-align:center;padding:var(--gx-s5) var(--gx-s3);color:var(--gx-muted);border:1px dashed var(--gx-border);border-radius:var(--gx-radius-sm)}
.gx-ed-blank-glyph{font-size:22px;color:var(--gx-accent);opacity:.55}
.gx-ed-hint{font-size:10.5px;line-height:1.5;color:#5f8b98}
.gx-ed-empty{font-size:11px;color:#5f8b98;font-style:italic;padding:var(--gx-s2)}

/* ---- library drawer ---- */
.gx-ed-tabs{display:flex;gap:2px;background:rgba(4,14,20,.5);border:1px solid var(--gx-border-soft);border-radius:var(--gx-radius-sm);padding:2px}
.gx-ed-tab{background:transparent;border:none;border-radius:5px;color:var(--gx-muted);cursor:pointer;font:600 10.5px/1 system-ui,sans-serif;letter-spacing:.03em;padding:5px 11px}
.gx-ed-tab:hover{color:var(--gx-text);background:var(--gx-raise)}
.gx-ed-tab--on{background:var(--gx-accent-deep);color:#fff}
.gx-ed-collapse{margin-left:auto;flex:none;background:var(--gx-field);border:1px solid var(--gx-border);border-radius:var(--gx-radius-sm);color:var(--gx-muted);cursor:pointer;font:10px/1 system-ui,sans-serif;padding:6px 9px}
.gx-ed-collapse:hover{color:var(--gx-text);border-color:var(--gx-accent-deep)}
.gx-ed-grid{display:flex;flex-wrap:wrap;gap:var(--gx-s1)}
.gx-ed-grid--drawer{overflow-y:auto;align-content:flex-start;flex:1 1 auto;min-height:0;padding-right:2px}
.gx-ed-chip{background:var(--gx-field);color:#c6e2ea;border:1px solid var(--gx-border);border-radius:var(--gx-radius-sm);padding:5px 9px;cursor:pointer;font:10.5px/1.2 system-ui,sans-serif}
.gx-ed-chip:hover{background:var(--gx-raise);border-color:var(--gx-accent);color:#fff}
.gx-ed-chip:focus-visible{outline:none;border-color:var(--gx-accent);box-shadow:0 0 0 2px rgba(55,182,211,.24)}

@media (max-width:1080px){
  .gx-ed-panel--left{width:200px}
  .gx-ed-panel--right{width:250px}
  .gx-ed-panel--drawer{left:224px;right:274px}
}
`;
