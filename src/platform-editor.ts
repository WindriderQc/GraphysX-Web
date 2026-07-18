import { MathUtils, Object3D, Raycaster, Vector2, Vector3, type PerspectiveCamera, type Scene, type WebGLRenderer } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls, type TransformControlsMode } from "three/examples/jsm/controls/TransformControls.js";
import type { AgentWorldRuntime } from "./agent-world-runtime";
import type { GraphysXAgentWorldApi } from "./agent-world-runtime";

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

/**
 * The human editing layer for {@link PlatformHost}: click-selection, a transform gizmo
 * that commits validated `update()`s, and a compact toolbar + outliner. It drives the
 * exact same runtime/API an agent uses — every button is an ordinary API call — so
 * human and agent edits share one revision history. Ported from the race-scene agent-world
 * interaction, but self-contained (no race-scene, no PrototypeApp).
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

  private readonly toolbar: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly outliner: HTMLElement;
  private readonly readout: HTMLElement;
  private readonly inspector: HTMLElement;

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
    this.toolbar = ui.toolbar;
    this.panel = ui.panel;
    this.outliner = ui.outliner;
    this.readout = ui.readout;
    this.inspector = ui.inspector;
    deps.container.append(ui.style, ui.toolbar, ui.panel);
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
    this.toolbar.style.display = display;
    this.panel.style.display = display;
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
    if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.isContentEditable)) return;
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

  private refresh(): void {
    const state = this.deps.api.state();
    const entities = state?.entities ?? [];
    this.readout.textContent = this.selectedId
      ? `${this.selectedId} · ${this.gizmo.getMode()} · ${this.gizmo.space}`
      : `${entities.length} entities · rev ${state?.revision ?? 0} · click to select`;
    this.renderInspector(entities.find((entity) => entity.id === this.selectedId) ?? null);
    this.outliner.replaceChildren(
      ...entities.map((entity) => {
        const row = document.createElement("button");
        row.className = "gx-ed-row" + (entity.id === this.selectedId ? " gx-ed-row--active" : "");
        row.textContent = `${entity.id}  ·  ${entity.type}`;
        row.addEventListener("click", () => this.select(entity.id));
        return row;
      }),
    );
  }

  /**
   * Per-selection editing: material colour, physics mode, and living behaviours. Every
   * control is an ordinary `api.update` / `api.attachBehavior` call, so a human edit and
   * an agent edit land in the same revision history.
   */
  private renderInspector(
    entity: { id: string; type: string; material?: { color?: string } | null; physics?: { mode?: string } | null } | null,
  ): void {
    if (!entity) {
      const empty = document.createElement("div");
      empty.className = "gx-ed-empty";
      empty.textContent = "Nothing selected — click an object, or add one from the library below.";
      this.inspector.replaceChildren(empty);
      return;
    }

    const colour = document.createElement("input");
    colour.type = "color";
    colour.value = /^#[0-9a-f]{6}$/i.test(entity.material?.color ?? "") ? entity.material!.color! : "#8ad9ff";
    colour.addEventListener("input", () => {
      this.deps.api.update(entity.id, { material: { color: colour.value } });
    });

    const physics = document.createElement("select");
    for (const mode of ["static", "dynamic", "kinematic"] as const) {
      const option = document.createElement("option");
      option.value = mode;
      option.textContent = mode;
      physics.append(option);
    }
    physics.value = entity.physics?.mode ?? "static";
    physics.addEventListener("change", () => {
      this.deps.api.update(entity.id, { physics: { mode: physics.value as "static" | "dynamic" | "kinematic", mass: 1 } });
      this.refresh();
    });

    const behaviours = document.createElement("div");
    behaviours.className = "gx-ed-grid";
    behaviours.append(
      this.chip("+ Spin", () => { this.deps.api.attachBehavior(entity.id, { type: "spin", axis: "y", speedDegrees: 45 }); this.refresh(); }),
      this.chip("+ Bob", () => { this.deps.api.attachBehavior(entity.id, { type: "bob", axis: "y", amplitude: 0.6, frequencyHz: 0.4 }); this.refresh(); }),
      this.chip("+ Pulse", () => { this.deps.api.attachBehavior(entity.id, { type: "pulse", minimumScale: 0.85, maximumScale: 1.25, frequencyHz: 0.5 }); this.refresh(); }),
      this.chip("No texture", () => { this.deps.api.update(entity.id, { material: { texture: null } }); this.refresh(); }),
    );

    this.inspector.replaceChildren(
      this.field("Colour", colour),
      this.field("Physics", physics),
      behaviours,
    );
  }

  private field(label: string, control: HTMLElement): HTMLElement {
    const row = document.createElement("div");
    row.className = "gx-ed-field";
    const name = document.createElement("span");
    name.textContent = label;
    row.append(name, control);
    return row;
  }

  private buildUi(): { style: HTMLStyleElement; toolbar: HTMLElement; panel: HTMLElement; outliner: HTMLElement; readout: HTMLElement; inspector: HTMLElement } {
    const style = document.createElement("style");
    style.textContent = `
      .gx-ed-toolbar,.gx-ed-panel{position:fixed;z-index:20;font:12px/1.4 system-ui,sans-serif;color:#dbeff5;user-select:none}
      .gx-ed-toolbar{top:12px;left:12px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;background:rgba(6,18,26,.82);backdrop-filter:blur(8px);border:1px solid #16323d;border-radius:12px;padding:8px 10px}
      .gx-ed-panel{top:12px;right:12px;width:250px;max-height:calc(100vh - 24px);display:flex;flex-direction:column;gap:8px;background:rgba(6,18,26,.82);backdrop-filter:blur(8px);border:1px solid #16323d;border-radius:12px;padding:10px}
      .gx-ed-toolbar button,.gx-ed-toolbar select{background:#0e2833;color:#dbeff5;border:1px solid #1d4351;border-radius:8px;padding:5px 9px;cursor:pointer;font:inherit}
      .gx-ed-toolbar button:hover,.gx-ed-row:hover{background:#164256}
      .gx-ed-toolbar button.gx-ed-on{background:#2b7d93;border-color:#39a9c4;color:#fff}
      .gx-ed-title{font-weight:600;letter-spacing:.03em;text-transform:uppercase;font-size:10px;color:#6fb9cc}
      .gx-ed-readout{font-size:11px;color:#9fd2df;word-break:break-all}
      .gx-ed-list{overflow:auto;display:flex;flex-direction:column;gap:3px;min-height:40px}
      .gx-ed-row{text-align:left;background:#0b2029;color:#cfe7ee;border:1px solid #143440;border-radius:7px;padding:5px 8px;cursor:pointer;font:11px/1.3 system-ui,sans-serif}
      .gx-ed-row--active{background:#2b7d93;border-color:#39a9c4;color:#fff}
      .gx-ed-sep{width:1px;height:20px;background:#1d4351;margin:0 2px}
      .gx-ed-panel{overflow-y:auto}
      .gx-ed-grid{display:flex;flex-wrap:wrap;gap:4px}
      .gx-ed-chip{background:#0b2029;color:#cfe7ee;border:1px solid #143440;border-radius:6px;padding:4px 7px;cursor:pointer;font:10.5px/1.2 system-ui,sans-serif}
      .gx-ed-chip:hover{background:#164256}
      .gx-ed-field{display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:11px;color:#9fd2df}
      .gx-ed-field select,.gx-ed-field input{background:#0e2833;color:#dbeff5;border:1px solid #1d4351;border-radius:6px;padding:3px 5px;font:inherit;max-width:132px}
      .gx-ed-field input[type=color]{padding:1px;width:40px;height:22px;cursor:pointer}
      .gx-ed-empty{font-size:11px;color:#5f8b98;font-style:italic}
      .gx-ed-exit{background:#14313d;border-color:#2b6478}
    `;

    const toolbar = document.createElement("div");
    toolbar.className = "gx-ed-toolbar";
    if (this.deps.onExit) {
      const exit = this.toolButton("← Showroom", () => this.deps.onExit?.());
      exit.classList.add("gx-ed-exit");
      toolbar.append(exit, this.sep());
    }
    const modeButtons: Record<TransformControlsMode, HTMLButtonElement> = {
      translate: this.toolButton("Move (W)", () => this.setMode("translate")),
      rotate: this.toolButton("Rotate (E)", () => this.setMode("rotate")),
      scale: this.toolButton("Scale (R)", () => this.setMode("scale")),
    };
    const syncModeButtons = () => {
      (Object.keys(modeButtons) as TransformControlsMode[]).forEach((mode) => {
        modeButtons[mode].classList.toggle("gx-ed-on", this.gizmo.getMode() === mode);
      });
    };
    this.gizmo.addEventListener("change", syncModeButtons);
    toolbar.append(modeButtons.translate, modeButtons.rotate, modeButtons.scale, this.sep());
    toolbar.append(
      this.toolButton("+ Box", () => this.addPrimitive("box")),
      this.toolButton("+ Sphere", () => this.addPrimitive("sphere")),
      this.toolButton("+ Light", () => this.addPrimitive("point-light")),
      this.toolButton("Delete", () => this.removeSelected()),
      this.sep(),
    );

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
    toolbar.append(starter, this.sep());

    let paused = false;
    const pauseButton = this.toolButton("Pause", () => {
      paused = !paused;
      this.deps.api.pause(paused);
      pauseButton.textContent = paused ? "Play" : "Pause";
      pauseButton.classList.toggle("gx-ed-on", paused);
    });
    toolbar.append(
      pauseButton,
      this.toolButton("Step", () => { this.deps.api.step(); this.refresh(); }),
      this.sep(),
      this.toolButton("Undo", () => { this.deps.api.undo(); this.select(null); }),
    );
    syncModeButtons();

    const panel = document.createElement("div");
    panel.className = "gx-ed-panel";
    const title = document.createElement("div");
    title.className = "gx-ed-title";
    title.textContent = "Scene Editor";
    const readout = document.createElement("div");
    readout.className = "gx-ed-readout";
    const listTitle = document.createElement("div");
    listTitle.className = "gx-ed-title";
    listTitle.textContent = "Outliner";
    const outliner = document.createElement("div");
    outliner.className = "gx-ed-list";

    // Inspector — rendered per selection in refresh().
    const inspectorTitle = document.createElement("div");
    inspectorTitle.className = "gx-ed-title";
    inspectorTitle.textContent = "Inspector";
    const inspector = document.createElement("div");
    inspector.className = "gx-ed-section";

    panel.append(title, readout, inspectorTitle, inspector, ...this.buildEnvironment(), ...this.buildLibrary(), listTitle, outliner);

    return { style, toolbar, panel, outliner, readout, inspector };
  }

  /** Scene-scoped environment: the recovered skybox sets, selectable per scene. */
  private buildEnvironment(): HTMLElement[] {
    const heading = document.createElement("div");
    heading.className = "gx-ed-title";
    heading.textContent = "Environment";

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

    return [heading, this.field("Sky", select)];
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

  /**
   * The curated vocabulary the API already exposes — prefabs, mesh assets, and textures.
   * Every chip is an ordinary API call, so a human picking from the library produces the
   * same revision an agent would.
   */
  private buildLibrary(): HTMLElement[] {
    const out: HTMLElement[] = [];

    const section = (label: string, chips: HTMLElement[]): void => {
      if (!chips.length) return;
      const heading = document.createElement("div");
      heading.className = "gx-ed-title";
      heading.textContent = label;
      const grid = document.createElement("div");
      grid.className = "gx-ed-grid";
      grid.append(...chips);
      out.push(heading, grid);
    };

    section(
      "Prefabs",
      this.deps.api.prefabs().map((prefab) =>
        this.chip(prefab.label ?? prefab.id, () => {
          this.addCounter += 1;
          const result = this.deps.api.spawnPrefab(prefab.id as Parameters<GraphysXAgentWorldApi["spawnPrefab"]>[0], {
            idPrefix: `edit-${prefab.id}-${this.addCounter}`,
            position: [round(((this.addCounter % 4) - 1.5) * 4), 0, round((Math.floor(this.addCounter / 4) % 4 - 1.5) * 4)],
          });
          if (result.ok) this.refresh();
        }),
      ),
    );

    section(
      "Models",
      this.deps.api.assets().map((asset) =>
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
      ),
    );

    // Particle emitters are a first-class v2 entity type, so a human picks a preset here the
    // same way an agent calls api.spawn({ type: "emitter", emitter: { preset } }).
    section(
      "Effects",
      this.deps.api.emitters().map((emitter) =>
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
      ),
    );

    section(
      "Textures",
      this.deps.api.textures().map((texture) =>
        this.chip(texture.label ?? texture.id, () => {
          if (!this.selectedId) return;
          this.deps.api.update(this.selectedId, {
            material: { texture: { id: texture.id as never, repeat: texture.defaultRepeat } },
          });
          this.refresh();
        }),
      ),
    );

    return out;
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

  private toolButton(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  private sep(): HTMLElement {
    const separator = document.createElement("div");
    separator.className = "gx-ed-sep";
    return separator;
  }

  dispose(): void {
    const dom = this.deps.renderer.domElement;
    dom.removeEventListener("pointerdown", this.onPointerDown);
    dom.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("keydown", this.onKeyDown);
    this.gizmo.detach();
    this.gizmo.dispose();
    this.toolbar.remove();
    this.panel.remove();
  }
}
