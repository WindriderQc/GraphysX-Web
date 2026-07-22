import { Box3, MathUtils, Object3D, Raycaster, Vector2, Vector3, type PerspectiveCamera, type Scene, type WebGLRenderer } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls, type TransformControlsMode } from "three/examples/jsm/controls/TransformControls.js";
import type { AgentWorldRuntime } from "./agent-world-runtime";
import type {
  AgentWorldEntityPatch,
  AgentWorldEntityState,
  AgentWorldEntityType,
  AgentWorldEnvelope,
  AgentWorldPost,
  AgentWorldMaterial,
  AgentWorldColliderKind,
  AgentWorldPhysicsMode,
  GraphysXAgentWorldApi,
} from "./agent-world-runtime";
import type { AgentLevelState, GraphysXAgentLevelApi } from "./agent-level-library";
import type { AgentMediaFileEntry, AgentMediaListing, AgentWorldMediaDescriptor } from "./agent-world-media";
import type { MapEditorTile } from "./race-scene";

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

type LibraryTab = "prefabs" | "models" | "effects" | "terrain" | "life" | "textures" | "media";

const LIBRARY_TABS: ReadonlyArray<{ id: LibraryTab; label: string }> = [
  { id: "prefabs", label: "Prefabs" },
  { id: "models", label: "Models" },
  { id: "effects", label: "Effects" },
  { id: "terrain", label: "Terrain" },
  { id: "life", label: "Life" },
  { id: "textures", label: "Textures" },
  { id: "media", label: "Media" },
];

/** Gizmo snap increments the toolbar offers; the middle set is the construction default. */
const SNAP_STEPS = [
  { id: "fine", label: "0.1", translate: 0.1, rotateDegrees: 5, scale: 0.05 },
  { id: "default", label: "0.25", translate: 0.25, rotateDegrees: 15, scale: 0.1 },
  { id: "coarse", label: "1.0", translate: 1, rotateDegrees: 45, scale: 0.25 },
] as const;

/** Keyboard map, rendered by the help overlay so the list can never drift from the code. */
const SHORTCUTS: ReadonlyArray<[string, string]> = [
  ["W / E / R", "Move / Rotate / Scale gizmo"],
  ["F", "Frame the selection"],
  ["Ctrl+D", "Duplicate the selection"],
  ["Ctrl+Z", "Undo the last edit"],
  ["Del / Backspace", "Delete the selection"],
  ["Esc", "Close a panel, else deselect"],
];

/** One glyph per entity type so a scene tree row is scannable without reading the id. */
const TYPE_GLYPHS: Record<AgentWorldEntityType, string> = {
  group: "▤",
  "formula-field": "∫",
  "dna-tree": "♣",
  crowd: "☗",
  sound: "♪",
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
  terrain: "⛰",
  water: "≈",
  flock: "⋙",
  "force-field": "❋",
  "ambient-light": "○",
  "directional-light": "☀",
  "point-light": "✦",
};

/** Paint one cell at a time, or drag a rectangle and hand it to `levels.fill`. */
type LevelTool = "paint" | "fill";

/**
 * Colour + ink per tile id, so a BallZ grid reads as a map rather than a wall of letters.
 * This is presentation only — the glyphs themselves come from the level API's own ASCII
 * legend (`exportAscii().legend`) so the palette can never drift from the data format.
 */
const LEVEL_TILE_COLORS: Record<MapEditorTile, { fill: string; ink: string }> = {
  floor: { fill: "#122c37", ink: "#4d7f92" },
  wall: { fill: "#6f93a4", ink: "#08202b" },
  start: { fill: "#46d47f", ink: "#06251a" },
  ring: { fill: "#f4c33c", ink: "#3a2a00" },
  half: { fill: "#43b7f0", ink: "#04222f" },
  finish: { fill: "#f06fa8", ink: "#360f22" },
  hazard: { fill: "#f08a3c", ink: "#33180a" },
  fire: { fill: "#ef5350", ink: "#3a0c0c" },
  ice: { fill: "#9be8f5", ink: "#0b2f38" },
};

/** `fill`/`resize` refuse these — the level model allows at most one of each. */
const LEVEL_SINGLETONS: ReadonlySet<MapEditorTile> = new Set<MapEditorTile>(["start", "half", "finish"]);

/** Live element references for the levels workbench, resolved once when the shell is built. */
interface LevelsWorkbenchUi {
  panel: HTMLElement;
  meta: HTMLElement;
  list: HTMLElement;
  canvas: HTMLElement;
  palette: HTMLElement;
  status: HTMLElement;
  ascii: HTMLTextAreaElement;
  importId: HTMLInputElement;
  newId: HTMLInputElement;
  newWidth: HTMLInputElement;
  newHeight: HTMLInputElement;
  resizeWidth: HTMLInputElement;
  resizeHeight: HTMLInputElement;
  toolButtons: Map<LevelTool, HTMLButtonElement>;
}

/** Entity types the runtime refuses to give a rigid body (see `resolvePhysics`). */
const PHYSICS_FORBIDDEN_TYPES = new Set<AgentWorldEntityType>([
  "group",
  "spline",
  "emitter",
  "sound",
  "terrain",
  "water",
  "flock",
  "crowd",
  "force-field",
  "formula-field",
  "dna-tree",
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
  // ---- gizmo settings surfaced in the toolbar (previously hardcoded) ----
  private snapEnabled = true;
  private snapStep: (typeof SNAP_STEPS)[number] = SNAP_STEPS[1];
  private gizmoSpace: "world" | "local" = "world";
  // ---- media import dialog state ----
  private mediaDialogOpen = false;
  private mediaPath = "";
  private mediaListing: AgentMediaListing | null = null;
  private readonly mediaSelection = new Set<string>();
  private mediaBusy = false;
  private mediaDialog!: HTMLElement;
  private mediaCrumb!: HTMLElement;
  private mediaFolders!: HTMLElement;
  private mediaFiles!: HTMLElement;
  private mediaStatus!: HTMLElement;
  private mediaImportButton!: HTMLButtonElement;
  /** One shared preview player, so two sound previews never overlap. */
  private mediaAudio: HTMLAudioElement | null = null;
  private helpOverlay: HTMLElement | null = null;
  private toolbarStatus!: HTMLElement;
  /**
   * Friction/restitution are accepted by `update()` but are not reported back on
   * `AgentWorldEntityState.physics`, so the inspector remembers what the human set
   * rather than inventing a value it cannot read.
   */
  private readonly physicsExtras = new Map<string, { friction?: number; restitution?: number }>();

  // ---- levels workbench state (all of it view state; tiles live only in `api.levels`) ----
  private levelsOpen = false;
  private levelId = "";
  private readonly unsubscribeEvents: () => void;
  private refreshQueued = false;
  /** The Environment sky dropdown, held so `refresh()` can re-read the world into it. */
  private skySelect: HTMLSelectElement | null = null;
  /** Joined sky ids the dropdown was last built from, so it only rebuilds when they change. */
  private skyOptionSignature = "";
  private overlaySelect: HTMLSelectElement | null = null;
  /** Envelope controls, held for the same reason as `skySelect` — see that comment. */
  private envelopeToggle: HTMLInputElement | null = null;
  private envelopeInputs: HTMLInputElement[] = [];
  private postToggle: HTMLInputElement | null = null;
  private postInputs: HTMLInputElement[] = [];
  private levelTile: MapEditorTile = "wall";
  private levelTool: LevelTool = "paint";
  /** Cell elements indexed `y * width + x`, so a drag can repaint one cell without a rebuild. */
  private levelCells: HTMLElement[] = [];
  private levelPainting = false;
  private levelAnchor: { x: number; y: number } | null = null;
  private levelCursor: { x: number; y: number } | null = null;
  private levelMarked: HTMLElement[] = [];
  /** Glyphs are read back from the API's own ASCII legend rather than restated here. */
  private levelLegend: Readonly<Record<MapEditorTile, string>> | null = null;
  /** True once the ASCII textarea holds a hand-edited draft rather than a plain export. */
  private levelAsciiDirty = false;
  private levelUi!: LevelsWorkbenchUi;
  private levelsButton!: HTMLButtonElement;

  /** Toolbar, scene-tree rail, inspector rail, library drawer, levels workbench. */
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
    this.gizmo.setSpace(this.gizmoSpace);
    this.applySnap();
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

    // The outliner and inspector must reflect the world, not just this panel's own actions.
    // Before this, every editor control called refresh() itself, so the UI was correct after a
    // HUMAN edit and stale after everything else: an agent spawn, api.load, a stored scene, or
    // levels.play() left the scene tree showing whatever it last rendered. It was visibly wrong
    // -- the viewport showing a played level while the tree still listed the demo world at rev 0
    // -- because the runtime owns the scene graph and this panel does not.
    //
    // Coalesced onto one animation frame: a transaction or a spawn burst emits many events, and
    // rebuilding the DOM per event would rebuild it dozens of times for one logical change.
    this.unsubscribeEvents = deps.world.subscribeEvents((event) => {
      if (event.type === "trigger.enter" || event.type === "trigger.exit") return;
      // The DOM refresh below is rAF-coalesced, but the gizmo cannot wait a frame: a world
      // replacement destroys its attached object, and TransformControls warns (and a
      // rollback throws) on the very next render. Re-sync it synchronously.
      if (event.type === "world.loaded") this.syncGizmo();
      if (this.refreshQueued) return;
      this.refreshQueued = true;
      requestAnimationFrame(() => {
        this.refreshQueued = false;
        // "auto" so a rebuild never swallows an edit a focused field is still committing.
        this.refresh();
      });
    });
    // A paint/fill stroke has to end even if the pointer leaves the grid.
    window.addEventListener("pointerup", this.onLevelPointerUp);

    const ui = this.buildUi();
    this.mediaDialog = this.buildMediaDialog();
    this.roots = [ui.toolbar, ui.panel, ui.rightRail, ui.drawer, ui.workbench, this.mediaDialog];
    this.outliner = ui.outliner;
    this.readout = ui.readout;
    this.treeCount = ui.treeCount;
    this.inspector = ui.inspector;
    this.libraryChips = ui.libraryChips;
    deps.container.append(ui.style, ...this.roots);
    this.renderLibrary();
    this.setLevelTool(this.levelTool);
    this.refresh();
  }

  /** The host skips simulation while the gizmo is being dragged. */
  isTransforming(): boolean {
    return this.gizmo.dragging;
  }

  /** True while the editor chrome owns the pointer. */
  isVisible(): boolean {
    return this.enabled;
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
      // Leaving the editor closes the workbench, so re-entering lands on the scene.
      this.setLevelsOpen(false);
      this.setMediaDialogOpen(false);
      this.stopMediaPreview();
      this.helpOverlay?.remove();
      this.helpOverlay = null;
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
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === "d") {
      // Before the browser bookmarks the editor.
      event.preventDefault();
      this.duplicateSelected();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === "z") {
      event.preventDefault();
      this.deps.api.undo();
      this.select(null);
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    switch (key) {
      case "w": this.setMode("translate"); break;
      case "e": this.setMode("rotate"); break;
      case "r": this.setMode("scale"); break;
      case "f": this.focusSelection(); break;
      case "escape":
        // Most-modal first: the import dialog, then the workbench, then the selection.
        if (this.mediaDialogOpen) this.setMediaDialogOpen(false);
        else if (this.helpOverlay) { this.helpOverlay.remove(); this.helpOverlay = null; }
        else if (this.levelsOpen) this.setLevelsOpen(false);
        else this.select(null);
        break;
      case "delete":
      case "backspace":
        if (this.selectedId) this.removeSelected();
        break;
      default: return;
    }
  };

  /**
   * Frame the selection: put the orbit target on the entity and dolly the camera to a
   * distance where the whole object reads. The camera keeps its viewing direction — F is
   * "bring it to me", not "teleport me somewhere new".
   */
  private focusSelection(): void {
    const object = this.selectedObject;
    if (!object) return;
    const bounds = new Box3().setFromObject(object);
    if (bounds.isEmpty()) return;
    const center = bounds.getCenter(new Vector3());
    const radius = Math.max(bounds.getSize(new Vector3()).length() / 2, 0.5);
    const { camera, orbit } = this.deps;
    const direction = camera.position.clone().sub(orbit.target).normalize();
    orbit.target.copy(center);
    camera.position.copy(center.clone().add(direction.multiplyScalar(radius * 3)));
    orbit.update();
  }

  /**
   * Duplicate through the document, not the scene graph: read the entity's authored
   * definition out of `export()` and spawn it under a fresh id, one step to the side.
   * Children stay with the original — cloning a subtree is a different feature.
   */
  private duplicateSelected(): void {
    const id = this.selectedId;
    if (!id) return;
    const definition = this.deps.api.export();
    const source = definition?.entities.find((entity) => entity.id === id);
    if (!source) return;
    this.addCounter += 1;
    const cloneId = `${id}-copy-${this.addCounter}`;
    const position = source.transform?.position ?? [0, 0, 0];
    const result = this.deps.api.spawn({
      ...structuredClone(source),
      id: cloneId,
      transform: {
        ...source.transform,
        position: [round((position[0] ?? 0) + this.snapStep.translate * 4), position[1] ?? 0, position[2] ?? 0],
      },
    });
    if (result.ok) this.select(cloneId);
    else this.refresh("force");
  }

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
    // Re-sync the gizmo against the live graph before anything else. Every world
    // replacement (api.load, levels.play, an agent's create, a rejected-transaction
    // rollback) destroys the object the gizmo is attached to; refresh() rebuilt the DOM
    // but left that stale attachment, so TransformControls warned every frame ("must be
    // a part of the scene graph") and a rollback in that state threw uncaught. syncGizmo
    // detaches when the entity is gone and re-attaches when the same id was rebuilt as a
    // new object — so a selection now survives a reload instead of wedging it.
    this.syncGizmo();
    const state = this.deps.api.state();
    const entities = state?.entities ?? [];
    this.readout.textContent = this.selectedId
      ? `${this.selectedId} · ${this.gizmo.getMode()} · rev ${state?.revision ?? 0}`
      : `${entities.length} entities · rev ${state?.revision ?? 0} · click to select`;
    // The at-a-glance line: what the world is, not what is selected (the readout has that).
    this.toolbarStatus.textContent = state
      ? `${entities.length} entities · rev ${state.revision} · t ${state.elapsedSeconds.toFixed(0)}s${state.paused ? " · paused" : ""}`
      : "no world";

    // Read the world's sky back into the dropdown. Skipped while it has focus, so re-syncing
    // never yanks the list out from under someone mid-selection.
    if (this.skySelect && document.activeElement !== this.skySelect) {
      this.syncSkyOptions();
      this.skySelect.value = state?.environment?.sky ?? "";
    }
    if (this.overlaySelect && document.activeElement !== this.overlaySelect) {
      this.overlaySelect.value = state?.environment?.overlay ?? "";
    }
    const envelopeFocused = document.activeElement === this.envelopeToggle
      || this.envelopeInputs.includes(document.activeElement as HTMLInputElement);
    const postFocused = document.activeElement === this.postToggle
      || this.postInputs.includes(document.activeElement as HTMLInputElement);
    if (this.postToggle && !postFocused) {
      const post = state?.environment?.post ?? null;
      this.postToggle.checked = !!post;
      const postValues = post ? [post.bloom.strength, post.bloom.threshold, post.bloom.radius] : [null, null, null];
      this.postInputs.forEach((input, index) => {
        input.value = postValues[index] === null ? "" : String(postValues[index]);
        input.disabled = !post;
      });
    }
    if (this.envelopeToggle && !envelopeFocused) {
      const envelope = state?.environment?.envelope ?? null;
      this.envelopeToggle.checked = !!envelope;
      const values = envelope ? [envelope.fogNear, envelope.fogFar, envelope.cameraFar] : [null, null, null];
      this.envelopeInputs.forEach((input, index) => {
        input.value = values[index] === null ? "" : String(values[index]);
        input.disabled = !envelope;
      });
    }

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
        // A span, not a nested button (invalid HTML inside the row button). Toggling
        // visibility is an ordinary `update`, so agents see the change like any other.
        const eye = document.createElement("span");
        eye.className = "gx-ed-eye" + (entity.visible ? "" : " gx-ed-eye--off");
        eye.textContent = entity.visible ? "●" : "○";
        eye.title = entity.visible ? "Hide (visible: false)" : "Show (visible: true)";
        eye.addEventListener("click", (clickEvent) => {
          clickEvent.stopPropagation();
          this.deps.api.update(entity.id, { visible: !entity.visible });
        });
        row.append(glyph, name, type, eye);
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
    if (entity.type === "sound") sections.push(this.soundSection(entity));
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
    const requestedCollider = entity.physics?.collider.requested ?? "auto";
    const mode = this.selectInput(["static", "dynamic", "kinematic"], entity.physics?.mode ?? "static");
    const collider = entity.type === "model"
      ? this.selectInput(["auto", "convex-hull", "trimesh"], requestedCollider)
      : null;
    const mass = this.numberInput(entity.physics?.mass ?? 1, 0.1, 0);
    const restitution = this.numberInput(extras.restitution, 0.05, 0);
    const friction = this.numberInput(extras.friction, 0.05, 0);

    const commit = (): void => {
      if (collider?.value === "trimesh" && mode.value !== "static") mode.value = "static";
      const next: { friction?: number; restitution?: number } = {};
      if (restitution.value !== "") next.restitution = Number(restitution.value);
      if (friction.value !== "") next.friction = Number(friction.value);
      this.physicsExtras.set(entity.id, next);
      this.patchEntity(entity.id, {
        physics: {
          mode: mode.value as AgentWorldPhysicsMode,
          mass: mass.value === "" ? 1 : Number(mass.value),
          ...(collider ? { collider: collider.value as AgentWorldColliderKind } : {}),
          ...next,
        },
      });
    };
    for (const input of [mode, mass, restitution, friction, ...(collider ? [collider] : [])]) input.addEventListener("change", commit);

    const fields = [
      this.field("Mode", mode),
      this.field("Mass", mass),
      this.field("Restitution", restitution),
      this.field("Friction", friction),
    ];
    if (collider) {
      fields.splice(1, 0, this.field("Collider", collider));
      const stats = document.createElement("div");
      stats.className = "gx-ed-hint";
      stats.textContent = entity.physics
        ? `${entity.physics.collider.effective} · ${entity.physics.collider.vertexCount} vertices · ${entity.physics.collider.triangleCount} triangles`
        : "Exact colliders are built after the model asset is ready.";
      fields.push(stats);
    }
    return this.section("Physics", fields);
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

  private soundSection(entity: AgentWorldEntityState): HTMLElement {
    const resolved = entity.sound;
    const sources = this.deps.api.sounds();
    const source = document.createElement("select");
    for (const descriptor of sources) {
      const option = document.createElement("option");
      option.value = descriptor.id;
      option.textContent = descriptor.label;
      option.title = descriptor.description;
      source.append(option);
    }
    // A document can name a source the registry does not know yet (an import on another
    // machine); show it rather than silently snapping to the first option.
    if (resolved && !sources.some((descriptor) => descriptor.id === resolved.source)) {
      const option = document.createElement("option");
      option.value = resolved.source;
      option.textContent = resolved.source;
      source.append(option);
    }
    if (resolved) source.value = resolved.source;

    const volume = this.sliderInput(resolved?.volume ?? 0.8, 0, 1, 0.01, (value) => {
      this.patchEntity(entity.id, { sound: { volume: value } as never });
    });
    const loop = document.createElement("input");
    loop.type = "checkbox";
    loop.checked = resolved?.loop ?? true;
    const autoplay = document.createElement("input");
    autoplay.type = "checkbox";
    autoplay.title = "Play whenever the scene is open (starts after the first click — browser policy)";
    autoplay.checked = resolved?.autoplay ?? true;
    const positional = document.createElement("input");
    positional.type = "checkbox";
    positional.title = "Attenuate and pan with distance from the camera";
    positional.checked = resolved?.positional ?? true;
    const refDistance = this.numberInput(resolved?.refDistance ?? 8, 1, 1);
    refDistance.title = "Distance where positional volume starts to fall off (world units)";

    const commit = (): void => {
      this.patchEntity(entity.id, {
        sound: {
          source: source.value,
          loop: loop.checked,
          autoplay: autoplay.checked,
          positional: positional.checked,
          ...(refDistance.value === "" ? {} : { refDistance: Number(refDistance.value) }),
        } as never,
      });
    };
    for (const input of [source, loop, autoplay, positional, refDistance]) input.addEventListener("change", commit);

    return this.section("Sound", [
      this.field("Source", source),
      this.field("Volume", volume),
      this.field("Loop", loop),
      this.field("Autoplay", autoplay),
      this.field("Positional", positional),
      this.field("Falloff", refDistance),
    ]);
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
    workbench: HTMLElement;
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
    this.levelUi = this.buildLevelsWorkbench();
    return {
      style,
      toolbar,
      panel: tree.panel,
      rightRail: right.panel,
      drawer: drawer.panel,
      workbench: this.levelUi.panel,
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

    // Gizmo settings, surfaced instead of hardcoded: snapping was always-on at fixed
    // increments and the reference frame was world-only, with no way to see either.
    const snapToggle = this.toolButton("Snap", () => {
      this.snapEnabled = !this.snapEnabled;
      this.applySnap();
      snapToggle.classList.toggle("gx-ed-on", this.snapEnabled);
    }, "Toggle gizmo snapping");
    snapToggle.classList.toggle("gx-ed-on", this.snapEnabled);
    const snapSelect = document.createElement("select");
    for (const step of SNAP_STEPS) {
      const option = document.createElement("option");
      option.value = step.id;
      option.textContent = step.label;
      option.title = `move ${step.translate} · rotate ${step.rotateDegrees}° · scale ${step.scale}`;
      snapSelect.append(option);
    }
    snapSelect.value = this.snapStep.id;
    snapSelect.title = "Snap increment (rotation and scale steps follow it)";
    snapSelect.addEventListener("change", () => {
      this.snapStep = SNAP_STEPS.find((step) => step.id === snapSelect.value) ?? SNAP_STEPS[1];
      this.applySnap();
    });
    const spaceToggle = this.toolButton("World", () => {
      this.gizmoSpace = this.gizmoSpace === "world" ? "local" : "world";
      this.gizmo.setSpace(this.gizmoSpace);
      spaceToggle.textContent = this.gizmoSpace === "world" ? "World" : "Local";
    }, "Gizmo reference frame: world axes, or the entity's own");
    toolbar.append(this.group([snapToggle, snapSelect, spaceToggle]));

    toolbar.append(this.group([
      this.toolButton("+ Box", () => this.addPrimitive("box")),
      this.toolButton("+ Sphere", () => this.addPrimitive("sphere")),
      this.toolButton("+ Light", () => this.addPrimitive("point-light")),
      this.toolButton("Duplicate", () => this.duplicateSelected(), "Duplicate selection (Ctrl+D)"),
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

    this.levelsButton = this.toolButton("Levels", () => this.setLevelsOpen(!this.levelsOpen), "Open the BallZ level workbench");
    toolbar.append(this.group([this.levelsButton]));

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

    // The live readout and help sit at the far right, out of the action groups' way.
    const status = document.createElement("span");
    status.className = "gx-ed-status";
    this.toolbarStatus = status;
    const help = this.toolButton("?", () => this.toggleHelp(), "Keyboard shortcuts");
    help.classList.add("gx-ed-help");
    const tail = this.group([status, help]);
    tail.classList.add("gx-ed-group--tail");
    toolbar.append(tail);

    syncModeButtons();
    return toolbar;
  }

  private applySnap(): void {
    if (this.snapEnabled) {
      this.gizmo.setTranslationSnap(this.snapStep.translate);
      this.gizmo.setRotationSnap(MathUtils.degToRad(this.snapStep.rotateDegrees));
      this.gizmo.setScaleSnap(this.snapStep.scale);
    } else {
      this.gizmo.setTranslationSnap(null);
      this.gizmo.setRotationSnap(null);
      this.gizmo.setScaleSnap(null);
    }
  }

  /** The shortcut card, rendered from the same table the key handler implements. */
  private toggleHelp(): void {
    if (this.helpOverlay) {
      this.helpOverlay.remove();
      this.helpOverlay = null;
      return;
    }
    const card = document.createElement("div");
    card.className = "gx-ed-panel gx-ed-helpcard";
    const head = document.createElement("div");
    head.className = "gx-ed-head";
    const title = document.createElement("span");
    title.className = "gx-ed-title";
    title.textContent = "Shortcuts";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "gx-ed-collapse";
    close.textContent = "✕";
    close.addEventListener("click", () => this.toggleHelp());
    head.append(title, close);
    const rows = SHORTCUTS.map(([keys, what]) => {
      const row = document.createElement("div");
      row.className = "gx-ed-helprow";
      const key = document.createElement("kbd");
      key.textContent = keys;
      const description = document.createElement("span");
      description.textContent = what;
      row.append(key, description);
      return row;
    });
    const hint = document.createElement("div");
    hint.className = "gx-ed-hint";
    hint.textContent = "Click an object to select it. Every control is an API call — agents editing this scene land in the same history.";
    card.append(head, ...rows, hint);
    this.deps.container.append(card);
    this.helpOverlay = card;
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

  /**
   * Repopulate the sky list from the live registry.
   *
   * The vocabulary is no longer fixed at construction: importing a cube set through the
   * media library registers a new sky mid-session, and this panel is built exactly once,
   * so without this the set would be selectable by an agent and invisible to the human at
   * the same desk. Guarded by an id signature because `refresh()` runs constantly — a
   * select rebuilt every frame cannot be clicked.
   */
  private syncSkyOptions(): void {
    if (!this.skySelect) return;
    const skies = this.deps.api.skies();
    const signature = skies.map((sky) => sky.id).join("|");
    if (signature === this.skyOptionSignature) return;
    this.skyOptionSignature = signature;

    const previous = this.skySelect.value;
    this.skySelect.replaceChildren();
    const none = document.createElement("option");
    none.value = "";
    none.textContent = "No sky (flat colour)";
    this.skySelect.append(none);
    for (const sky of skies) {
      const option = document.createElement("option");
      option.value = sky.id;
      option.textContent = sky.label;
      option.title = sky.description;
      this.skySelect.append(option);
    }
    this.skySelect.value = previous;
  }

  /** Scene-scoped environment: the recovered skybox sets, selectable per scene. */
  private buildEnvironment(): HTMLElement {
    const select = document.createElement("select");
    select.addEventListener("change", () => this.setSky(select.value || null));
    // Held so `refresh()` can re-sync it. This panel is built exactly once, at construction,
    // which made the control write-only: it pushed a sky into the world and then never read one
    // back, so it went stale the moment anything *else* set the sky — a starter, a stored scene,
    // an agent's `api.create`, or `levels.play()`. The dropdown would read "No sky" over a
    // viewport plainly rendering one.
    this.skySelect = select;
    // Assigned first: the option list comes from the live registry, not a snapshot.
    this.syncSkyOptions();
    select.value = this.deps.world.getEnvironment().sky ?? "";

    // The 2D overlay, alongside the sky: both are scene-declared layers the host renders.
    const overlay = document.createElement("select");
    const overlayNone = document.createElement("option");
    overlayNone.value = "";
    overlayNone.textContent = "No overlay";
    overlay.append(overlayNone);
    for (const descriptor of this.deps.world.listOverlays()) {
      const option = document.createElement("option");
      option.value = descriptor.id;
      option.textContent = descriptor.label;
      option.title = descriptor.description;
      overlay.append(option);
    }
    overlay.value = this.deps.world.getEnvironment().overlay ?? "";
    overlay.addEventListener("change", () => this.setOverlay(overlay.value || null));
    this.overlaySelect = overlay;

    // The viewing envelope, third of the scene-declared layers the host renders. Unchecked
    // means "host default" (fog 34–130, camera far 260) — a real state, not zeros, so it is
    // a checkbox plus three distances rather than inputs pretending the defaults are scene
    // data. Without this row the envelope would repeat the prefabs inversion: reachable by
    // an agent, invisible to a human.
    const envelopeToggle = document.createElement("input");
    envelopeToggle.type = "checkbox";
    envelopeToggle.title = "Scene-specific fog distances and camera far plane";
    const makeDistance = (title: string) => {
      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.step = "1";
      input.title = title;
      input.placeholder = "—";
      input.disabled = true;
      input.style.width = "4.5em";
      return input;
    };
    const fogNear = makeDistance("Fog start (world units)");
    const fogFar = makeDistance("Fog end (world units)");
    const cameraFar = makeDistance("Camera far plane (world units)");
    const applyEnvelope = () => {
      if (!envelopeToggle.checked) {
        this.setEnvelope(null);
        return;
      }
      const next = { fogNear: Number(fogNear.value), fogFar: Number(fogFar.value), cameraFar: Number(cameraFar.value) };
      // A trio mid-edit can be incoherent (far <= near, empty field). Hold until it
      // validates rather than pushing a document the runtime would reject.
      if (![next.fogNear, next.fogFar, next.cameraFar].every((value) => Number.isFinite(value) && value >= 0)) return;
      if (fogNear.value === "" || fogFar.value === "" || cameraFar.value === "") return;
      if (next.fogFar <= next.fogNear || next.cameraFar <= next.fogNear) return;
      this.setEnvelope(next);
    };
    envelopeToggle.addEventListener("change", () => {
      for (const input of [fogNear, fogFar, cameraFar]) input.disabled = !envelopeToggle.checked;
      if (envelopeToggle.checked && fogNear.value === "") {
        // Seed custom with the host defaults, so it starts from what the visitor is seeing.
        fogNear.value = "34";
        fogFar.value = "130";
        cameraFar.value = "260";
      }
      applyEnvelope();
    });
    for (const input of [fogNear, fogFar, cameraFar]) input.addEventListener("change", applyEnvelope);
    this.envelopeToggle = envelopeToggle;
    this.envelopeInputs = [fogNear, fogFar, cameraFar];
    const currentEnvelope = this.deps.world.getEnvironment().envelope;
    if (currentEnvelope) {
      envelopeToggle.checked = true;
      const values = [currentEnvelope.fogNear, currentEnvelope.fogFar, currentEnvelope.cameraFar];
      this.envelopeInputs.forEach((input, index) => {
        input.value = String(values[index]);
        input.disabled = false;
      });
    }
    const envelopeWrap = document.createElement("div");
    envelopeWrap.style.display = "flex";
    envelopeWrap.style.alignItems = "center";
    envelopeWrap.style.gap = "4px";
    envelopeWrap.append(envelopeToggle, fogNear, fogFar, cameraFar);

    // Post/bloom, same contract as the envelope row: unchecked is the bare renderer (a
    // real state — no composer exists), checked is strength / threshold / radius.
    const postToggle = document.createElement("input");
    postToggle.type = "checkbox";
    postToggle.title = "Scene bloom pass (strength, threshold, radius)";
    const makeRatio = (title: string) => {
      const input = makeDistance(title);
      input.step = "0.05";
      input.max = "3";
      return input;
    };
    const bloomStrength = makeRatio("Bloom strength (0–3)");
    const bloomThreshold = makeRatio("Bloom threshold (0–1): luminance below this never blooms");
    const bloomRadius = makeRatio("Bloom radius (0–1)");
    const applyPost = () => {
      if (!postToggle.checked) {
        this.setPost(null);
        return;
      }
      const next = { strength: Number(bloomStrength.value), threshold: Number(bloomThreshold.value), radius: Number(bloomRadius.value) };
      if (bloomStrength.value === "" || bloomThreshold.value === "" || bloomRadius.value === "") return;
      if (!(next.strength >= 0 && next.strength <= 3 && next.threshold >= 0 && next.threshold <= 1 && next.radius >= 0 && next.radius <= 1)) return;
      this.setPost({ bloom: next });
    };
    postToggle.addEventListener("change", () => {
      for (const input of [bloomStrength, bloomThreshold, bloomRadius]) input.disabled = !postToggle.checked;
      if (postToggle.checked && bloomStrength.value === "") {
        // The Spiral's tuning — proven values, and only emissives glow at this threshold.
        bloomStrength.value = "0.65";
        bloomThreshold.value = "0.6";
        bloomRadius.value = "0.4";
      }
      applyPost();
    });
    for (const input of [bloomStrength, bloomThreshold, bloomRadius]) input.addEventListener("change", applyPost);
    this.postToggle = postToggle;
    this.postInputs = [bloomStrength, bloomThreshold, bloomRadius];
    const currentPost = this.deps.world.getEnvironment().post;
    if (currentPost) {
      postToggle.checked = true;
      const values = [currentPost.bloom.strength, currentPost.bloom.threshold, currentPost.bloom.radius];
      this.postInputs.forEach((input, index) => {
        input.value = String(values[index]);
        input.disabled = false;
      });
    }
    const postWrap = document.createElement("div");
    postWrap.style.display = "flex";
    postWrap.style.alignItems = "center";
    postWrap.style.gap = "4px";
    postWrap.append(postToggle, bloomStrength, bloomThreshold, bloomRadius);

    return this.section("Environment", [
      this.field("Sky", select),
      this.field("2D overlay", overlay),
      this.field("Envelope", envelopeWrap),
      this.field("Bloom", postWrap),
    ]);
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
      environment: { ...definition.environment, sky: skyId },
    });
    this.deps.onEnvironmentChanged?.();
    this.select(null);
  }

  private setOverlay(overlayId: string | null): void {
    const definition = this.deps.api.export();
    if (!definition) return;
    this.deps.api.load({
      ...definition,
      environment: { ...definition.environment, overlay: overlayId as never },
    });
    this.deps.onEnvironmentChanged?.();
    this.select(null);
  }

  private setEnvelope(envelope: AgentWorldEnvelope | null): void {
    const definition = this.deps.api.export();
    if (!definition) return;
    this.deps.api.load({
      ...definition,
      environment: { ...definition.environment, envelope: envelope as never },
    });
    this.deps.onEnvironmentChanged?.();
    this.select(null);
  }

  private setPost(post: AgentWorldPost | null): void {
    const definition = this.deps.api.export();
    if (!definition) return;
    this.deps.api.load({
      ...definition,
      environment: { ...definition.environment, post: post as never },
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

  // ------------------------------------------------------------------ levels

  /** Shorthand for the level sub-API — the workbench never touches tiles any other way. */
  private get levels(): GraphysXAgentLevelApi {
    return this.deps.api.levels;
  }

  /**
   * The BallZ level-authoring surface: a level list, a paintable grid, a tile palette keyed
   * to the API's own ASCII legend, fill/resize/undo tools, and an ASCII import/export panel.
   *
   * It is an overlay you can close — the 3D viewport is still the main event — and it owns
   * no tile data of its own. Every edit is an `api.levels.*` call whose result is read back
   * and re-rendered, so a human stroke and an agent transaction share one revision history.
   */
  private buildLevelsWorkbench(): LevelsWorkbenchUi {
    const panel = document.createElement("div");
    panel.className = "gx-ed-workbench";

    const head = document.createElement("div");
    head.className = "gx-ed-head";
    const title = document.createElement("span");
    title.className = "gx-ed-title";
    title.textContent = "Levels";
    const meta = document.createElement("span");
    meta.className = "gx-lv-meta";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "gx-ed-collapse";
    close.textContent = "✕ Close";
    close.title = "Close the level workbench and return to the scene";
    close.addEventListener("click", () => this.setLevelsOpen(false));
    // Play is the workbench's primary action, so it sits in the head rather than among the
    // ASCII utilities. Until this existed, `levels.play()` was reachable from the agent API and
    // the tool bridge but from no human control at all — the exact inverse of the parity gap
    // fixed in `PlatformHost` (an agent could author a sky the viewport ignored; a human could
    // author a level only an agent could run). Both directions have to work or neither claim does.
    const play = document.createElement("button");
    play.type = "button";
    // Deliberately NOT `gx-ed-collapse`: the levels smoke closes the panel via
    // `.gx-ed-workbench .gx-ed-collapse`, and sharing the class would silently make that click
    // land on Play instead — a passing test asserting the wrong thing.
    play.className = "gx-lv-play";
    play.textContent = "▶ Play";
    play.title = "Materialise this level into the scene as ordinary entities";
    play.addEventListener("click", () => this.playLevel());
    head.append(title, meta, play, close);

    // ---- left column: the level library ----
    const side = document.createElement("div");
    side.className = "gx-lv-side";
    const list = document.createElement("div");
    list.className = "gx-lv-list";

    const newId = this.textInput("level-id");
    const newWidth = this.numberInput(12, 1, 1);
    const newHeight = this.numberInput(12, 1, 1);
    newWidth.title = "Width";
    newHeight.title = "Height";
    const newRow = document.createElement("div");
    newRow.className = "gx-lv-form";
    newRow.append(newWidth, this.times(), newHeight, this.chip("+ New", () => this.createLevel()));

    const actions = document.createElement("div");
    actions.className = "gx-ed-grid";
    actions.append(
      this.chip("Duplicate", () => this.duplicateLevel(), "Copy the active level under a new id"),
      this.chip("Delete", () => this.deleteLevel(), "Remove the active level"),
    );
    side.append(this.subhead("Library"), list, this.subhead("New level"), newId, newRow, actions);

    // ---- centre column: tools, palette, grid ----
    const main = document.createElement("div");
    main.className = "gx-lv-main";

    const toolButtons = new Map<LevelTool, HTMLButtonElement>();
    const tools = document.createElement("div");
    tools.className = "gx-lv-tools";
    for (const [tool, label, hint] of [
      ["paint", "Paint", "Click or drag to paint single cells"],
      ["fill", "Rect fill", "Drag a rectangle, release to fill it"],
    ] as ReadonlyArray<[LevelTool, string, string]>) {
      const button = this.chip(label, () => this.setLevelTool(tool), hint);
      toolButtons.set(tool, button);
      tools.append(button);
    }
    const resizeWidth = this.numberInput(12, 1, 1);
    const resizeHeight = this.numberInput(12, 1, 1);
    resizeWidth.title = "New width";
    resizeHeight.title = "New height";
    tools.append(
      this.chip("Undo", () => this.undoLevel(), "Undo the last level edit"),
      this.spacer(),
      this.tinyLabel("Resize"),
      resizeWidth,
      this.times(),
      resizeHeight,
      this.chip("Apply", () => this.resizeLevel(), "Resize the level, keeping the top-left content"),
    );

    const palette = document.createElement("div");
    palette.className = "gx-lv-palette";

    const canvas = document.createElement("div");
    canvas.className = "gx-lv-canvas";
    canvas.addEventListener("pointerdown", this.onLevelPointerDown);
    canvas.addEventListener("pointerover", this.onLevelPointerOver);
    main.append(tools, palette, canvas);

    // ---- right column: ASCII ----
    const asciiColumn = document.createElement("div");
    asciiColumn.className = "gx-lv-ascii";
    const ascii = document.createElement("textarea");
    ascii.className = "gx-lv-text";
    ascii.spellcheck = false;
    ascii.setAttribute("aria-label", "Level ASCII");
    // Once a human has typed in here it is their draft, and no edit elsewhere may overwrite it.
    ascii.addEventListener("input", () => { this.levelAsciiDirty = true; });
    const importId = this.textInput("import as id…");
    const asciiActions = document.createElement("div");
    asciiActions.className = "gx-ed-grid";
    asciiActions.append(
      this.chip("Export", () => this.exportLevelAscii(), "Re-read the active level as ASCII"),
      this.chip("Import", () => this.importLevelAscii(), "Create a level from the ASCII above"),
    );
    asciiColumn.append(this.subhead("ASCII"), ascii, importId, asciiActions);

    const body = document.createElement("div");
    body.className = "gx-lv-body";
    body.append(side, main, asciiColumn);

    const status = document.createElement("div");
    status.className = "gx-lv-status";

    panel.append(head, body, status);
    return {
      panel, meta, list, canvas, palette, status, ascii, importId,
      newId, newWidth, newHeight, resizeWidth, resizeHeight, toolButtons,
    };
  }

  private setLevelsOpen(open: boolean): void {
    this.levelsOpen = open;
    this.levelUi.panel.classList.toggle("gx-ed-workbench--open", open);
    this.levelsButton.classList.toggle("gx-ed-on", open);
    if (!open) return;
    // Palette glyphs come from the API legend, which needs a level to read, so build it here.
    this.renderLevelPalette();
    this.renderLevels();
    if (!this.levelUi.ascii.value) this.exportLevelAscii();
  }

  private setLevelTool(tool: LevelTool): void {
    this.levelTool = tool;
    for (const [id, button] of this.levelUi.toolButtons) button.classList.toggle("gx-ed-chip--on", id === tool);
  }

  /** One swatch per tile id: its colour, its ASCII glyph, its name, and its semantics. */
  private renderLevelPalette(): void {
    const legend = this.levelGlyphs();
    this.levelUi.palette.replaceChildren(...this.levels.tiles.map((tile) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "gx-lv-swatch" + (tile === this.levelTile ? " gx-lv-swatch--on" : "");
      button.title = `${tile} (${legend[tile]}) — ${this.levels.tileSemantics[tile]}`;
      const glyph = document.createElement("span");
      glyph.className = "gx-lv-swatch-glyph";
      const colours = LEVEL_TILE_COLORS[tile];
      glyph.style.background = colours.fill;
      glyph.style.color = colours.ink;
      glyph.textContent = legend[tile];
      const name = document.createElement("span");
      name.textContent = tile;
      button.append(glyph, name);
      button.addEventListener("click", () => {
        this.levelTile = tile;
        this.renderLevelPalette();
      });
      return button;
    }));
  }

  /** The authoritative tile→symbol map, straight from `exportAscii`. */
  private levelGlyphs(): Readonly<Record<MapEditorTile, string>> {
    if (this.levelLegend) return this.levelLegend;
    const id = this.levelId || this.levels.active()?.id || this.levels.list()[0]?.id;
    const exported = id ? this.levels.exportAscii(id) : null;
    if (exported?.ok && exported.value) this.levelLegend = exported.value.legend;
    return this.levelLegend ?? (Object.fromEntries(this.levels.tiles.map((tile) => [tile, tile[0]!.toUpperCase()])) as Record<MapEditorTile, string>);
  }

  /** Re-read the library and repaint the list, header and grid. Never assumes; always reads. */
  private renderLevels(): void {
    const summaries = this.levels.list();
    if (!summaries.some((summary) => summary.id === this.levelId)) {
      this.levelId = this.levels.active()?.id ?? summaries[0]?.id ?? "";
    }
    this.levelUi.list.replaceChildren(...summaries.map((summary) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "gx-lv-row" + (summary.id === this.levelId ? " gx-lv-row--active" : "");
      row.title = `${summary.id} — ${summary.width}×${summary.height}, revision ${summary.revision}`;
      // Rows key on id, not label: ids are what the API takes and what an agent reports,
      // and a duplicate/import legitimately shares its source's label.
      const name = document.createElement("span");
      name.className = "gx-lv-row-id";
      name.textContent = summary.id;
      const dims = document.createElement("span");
      dims.className = "gx-lv-row-dim";
      dims.textContent = `${summary.width}×${summary.height}`;
      row.append(name, dims);
      row.addEventListener("click", () => this.selectLevel(summary.id));
      return row;
    }));

    const level = this.levelId ? this.levels.get(this.levelId) : null;
    this.updateLevelMeta(level);
    if (level) {
      this.levelUi.resizeWidth.value = String(level.width);
      this.levelUi.resizeHeight.value = String(level.height);
      this.levelUi.importId.placeholder = `${level.id}-import`;
    }
    this.renderLevelGrid(level);
  }

  private updateLevelMeta(level: AgentLevelState | null = this.levels.get(this.levelId)): void {
    this.levelUi.meta.textContent = level
      ? `${level.id} · ${level.label} · ${level.width}×${level.height} · rev ${level.revision}`
      : "No level selected";
  }

  /**
   * The grid itself. Cells are sized to fit the viewport so a 64×64 level is still legible,
   * and the canvas scrolls when it cannot shrink further. Row/column gutters carry indices
   * so a coordinate reported by an agent can be found by eye.
   */
  private renderLevelGrid(level: AgentLevelState | null): void {
    this.levelCells = [];
    this.levelMarked = [];
    if (!level) {
      const empty = document.createElement("div");
      empty.className = "gx-ed-empty";
      empty.textContent = "No level in the library.";
      this.levelUi.canvas.replaceChildren(empty);
      return;
    }

    const glyphs = this.levelGlyphs();
    const canvas = this.levelUi.canvas;
    // Budget: the index gutter, the canvas padding + border, and the 1px gap per track.
    const gutter = 20;
    const chrome = gutter + 14;
    const available = { width: canvas.clientWidth || 560, height: canvas.clientHeight || 360 };
    const cell = Math.max(9, Math.min(44,
      Math.floor((available.width - chrome - level.width) / level.width),
      Math.floor((available.height - chrome - level.height) / level.height),
    ));
    const grid = document.createElement("div");
    grid.className = "gx-lv-grid";
    grid.style.setProperty("--gx-cell", `${cell}px`);
    grid.style.setProperty("--gx-gutter", `${gutter}px`);
    grid.style.gridTemplateColumns = `var(--gx-gutter) repeat(${level.width}, var(--gx-cell))`;
    grid.style.gridTemplateRows = `var(--gx-gutter) repeat(${level.height}, var(--gx-cell))`;
    // Indices crowd out the cells below ~15px, so thin them to every fifth column/row.
    const labelled = (index: number): boolean => cell >= 15 || index % 5 === 0;

    const corner = document.createElement("div");
    corner.className = "gx-lv-axis gx-lv-axis--corner";
    corner.textContent = "y\\x";
    grid.append(corner);
    for (let x = 0; x < level.width; x += 1) {
      const head = document.createElement("div");
      head.className = "gx-lv-axis";
      head.textContent = labelled(x) ? String(x) : "";
      grid.append(head);
    }
    for (let y = 0; y < level.height; y += 1) {
      const rowHead = document.createElement("div");
      rowHead.className = "gx-lv-axis";
      rowHead.textContent = labelled(y) ? String(y) : "";
      grid.append(rowHead);
      for (let x = 0; x < level.width; x += 1) {
        const tile = level.tiles[y * level.width + x]!;
        const element = document.createElement("div");
        element.className = "gx-lv-cell";
        element.dataset.x = String(x);
        element.dataset.y = String(y);
        this.paintCellView(element, tile, glyphs);
        element.title = `${x},${y} — ${tile}`;
        this.levelCells[y * level.width + x] = element;
        grid.append(element);
      }
    }
    canvas.replaceChildren(grid);
  }

  private paintCellView(element: HTMLElement, tile: MapEditorTile, glyphs: Readonly<Record<MapEditorTile, string>>): void {
    const colours = LEVEL_TILE_COLORS[tile];
    element.style.background = colours.fill;
    element.style.color = colours.ink;
    element.textContent = glyphs[tile];
  }

  private readonly onLevelPointerDown = (event: PointerEvent): void => {
    const cell = this.levelCellAt(event);
    if (!cell) return;
    event.preventDefault();
    this.levelCursor = cell;
    if (this.levelTool === "paint") {
      this.levelPainting = true;
      this.paintLevelCell(cell.x, cell.y);
      return;
    }
    this.levelAnchor = cell;
    this.markLevelRect(cell, cell);
  };

  private readonly onLevelPointerOver = (event: PointerEvent): void => {
    if (!(event.buttons & 1)) return;
    const cell = this.levelCellAt(event);
    if (!cell) return;
    this.levelCursor = cell;
    if (this.levelPainting) this.paintLevelCell(cell.x, cell.y);
    else if (this.levelAnchor) this.markLevelRect(this.levelAnchor, cell);
  };

  private readonly onLevelPointerUp = (): void => {
    this.levelPainting = false;
    const anchor = this.levelAnchor;
    const cursor = this.levelCursor;
    this.levelAnchor = null;
    this.clearLevelMarks();
    if (anchor && cursor) this.fillLevelRect(anchor, cursor);
  };

  private levelCellAt(event: PointerEvent): { x: number; y: number } | null {
    const target = event.target as HTMLElement | null;
    const cell = target?.closest<HTMLElement>(".gx-lv-cell");
    if (!cell) return null;
    return { x: Number(cell.dataset.x), y: Number(cell.dataset.y) };
  }

  /**
   * One cell, one `levels.patch`. Painting a singleton gate moves it, which changes a second
   * cell, so that case re-reads the whole grid; an ordinary tile only repaints its own cell
   * so dragging across a 64-wide level does not rebuild four thousand nodes per step.
   */
  private paintLevelCell(x: number, y: number): void {
    const level = this.levels.get(this.levelId);
    if (!level || level.tiles[y * level.width + x] === this.levelTile) return;
    const result = this.levels.patch(this.levelId, [{ x, y, tile: this.levelTile }]);
    if (!result.ok) {
      this.levelMessage(result.error ?? "Could not paint that cell", true);
      return;
    }
    if (LEVEL_SINGLETONS.has(this.levelTile)) {
      this.renderLevels();
    } else {
      const element = this.levelCells[y * level.width + x];
      if (element) {
        this.paintCellView(element, this.levelTile, this.levelGlyphs());
        element.title = `${x},${y} — ${this.levelTile}`;
      }
      this.updateLevelMeta();
    }
    this.syncLevelAscii();
    this.levelMessage(`Painted ${this.levelTile} at ${x},${y} · rev ${result.revision}`);
  }

  private fillLevelRect(a: { x: number; y: number }, b: { x: number; y: number }): void {
    const rect = {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.abs(a.x - b.x) + 1,
      height: Math.abs(a.y - b.y) + 1,
    };
    const result = this.levels.fill(this.levelId, rect, this.levelTile);
    if (!result.ok) {
      this.levelMessage(result.error ?? "Fill failed", true);
      return;
    }
    this.renderLevels();
    this.syncLevelAscii();
    this.levelMessage(`Filled ${rect.width}×${rect.height} at ${rect.x},${rect.y} with ${this.levelTile} · rev ${result.revision}`);
  }

  private markLevelRect(a: { x: number; y: number }, b: { x: number; y: number }): void {
    this.clearLevelMarks();
    const level = this.levels.get(this.levelId);
    if (!level) return;
    for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y += 1) {
      for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x += 1) {
        const element = this.levelCells[y * level.width + x];
        if (!element) continue;
        element.classList.add("gx-lv-cell--marked");
        this.levelMarked.push(element);
      }
    }
  }

  private clearLevelMarks(): void {
    for (const element of this.levelMarked) element.classList.remove("gx-lv-cell--marked");
    this.levelMarked = [];
  }

  private selectLevel(id: string): void {
    // `open()` is a validated read on this host, so it is the honest way to confirm the id
    // exists before the workbench points itself at it.
    const result = this.levels.open(id);
    if (!result.ok) {
      this.levelMessage(result.error ?? `Unknown level: ${id}`, true);
      return;
    }
    this.levelId = id;
    this.renderLevels();
    this.exportLevelAscii();
  }

  private createLevel(): void {
    const id = this.levelUi.newId.value.trim() || this.uniqueLevelId("level");
    const result = this.levels.create({
      id,
      width: Number(this.levelUi.newWidth.value) || 0,
      height: Number(this.levelUi.newHeight.value) || 0,
    });
    if (!result.ok || !result.value) {
      this.levelMessage(result.error ?? "Could not create that level", true);
      return;
    }
    this.levelUi.newId.value = "";
    this.levelId = result.value.id;
    this.renderLevels();
    this.exportLevelAscii();
    this.levelMessage(`Created ${result.value.id} (${result.value.width}×${result.value.height})`);
  }

  /** Duplicate is export → import: the same round trip the ASCII panel offers, one click. */
  private duplicateLevel(): void {
    const source = this.levels.get(this.levelId);
    const exported = this.levels.exportAscii(this.levelId);
    if (!source || !exported.ok || !exported.value) {
      this.levelMessage(exported.error ?? "Nothing to duplicate", true);
      return;
    }
    const result = this.levels.importAscii({
      id: this.uniqueLevelId(`${source.id}-copy`),
      label: `${source.label} copy`,
      cellSize: source.cellSize,
      rows: exported.value.rows,
    });
    if (!result.ok || !result.value) {
      this.levelMessage(result.error ?? "Duplicate failed", true);
      return;
    }
    this.levelId = result.value.id;
    this.renderLevels();
    this.exportLevelAscii();
    this.levelMessage(`Duplicated as ${result.value.id}`);
  }

  private deleteLevel(): void {
    const result = this.levels.remove(this.levelId);
    if (!result.ok) {
      this.levelMessage(result.error ?? "Could not delete that level", true);
      return;
    }
    this.levelId = "";
    this.renderLevels();
    this.exportLevelAscii();
    this.levelMessage(`Removed ${result.value}`);
  }

  private resizeLevel(): void {
    const width = Number(this.levelUi.resizeWidth.value) || 0;
    const height = Number(this.levelUi.resizeHeight.value) || 0;
    const result = this.levels.resize(this.levelId, width, height, "floor");
    if (!result.ok) {
      this.levelMessage(result.error ?? "Resize failed", true);
      this.renderLevels();
      return;
    }
    this.renderLevels();
    this.syncLevelAscii();
    this.levelMessage(`Resized to ${width}×${height} · rev ${result.revision}`);
  }

  private undoLevel(): void {
    const result = this.levels.undo(this.levelId);
    if (!result.ok) {
      this.levelMessage(result.error ?? "Nothing to undo", true);
      return;
    }
    this.renderLevels();
    this.syncLevelAscii();
    this.levelMessage(`Undid the last edit · rev ${result.revision}`);
  }

  private exportLevelAscii(announce = true): void {
    const result = this.levels.exportAscii(this.levelId);
    if (!result.ok || !result.value) {
      this.levelUi.ascii.value = "";
      if (announce) this.levelMessage(result.error ?? "Nothing to export", true);
      return;
    }
    this.levelLegend = result.value.legend;
    this.levelUi.ascii.value = result.value.rows.join("\n");
    this.levelAsciiDirty = false;
    if (announce) this.levelMessage(`Exported ${result.value.id} — ${result.value.width}×${result.value.height}`);
  }

  /**
   * Keep the ASCII view honest after a grid edit. An untouched panel simply re-exports, so
   * it never shows a level that no longer exists; a hand-edited draft is left alone and the
   * Export button remains the way to discard it.
   */
  private syncLevelAscii(): void {
    if (this.levelAsciiDirty) return;
    this.exportLevelAscii(false);
  }

  /**
   * Import creates a *new* level (the library keys on id), so the round trip is
   * export → import → identical grid under a fresh id. Label and cellSize ride along from
   * the source level, which is why an export/import cycle loses nothing but the id.
   */
  private importLevelAscii(): void {
    const rows = this.levelUi.ascii.value.split(/\r?\n/).map((row) => row.trimEnd());
    while (rows.length && rows[rows.length - 1] === "") rows.pop();
    const source = this.levels.get(this.levelId);
    const id = this.levelUi.importId.value.trim() || this.uniqueLevelId(`${this.levelId || "level"}-import`);
    const result = this.levels.importAscii({
      id,
      label: source?.label,
      cellSize: source?.cellSize,
      rows,
    });
    if (!result.ok || !result.value) {
      this.levelMessage(result.error ?? "Import failed", true);
      return;
    }
    this.levelUi.importId.value = "";
    this.levelId = result.value.id;
    this.renderLevels();
    this.levelMessage(`Imported ${result.value.id} — ${result.value.width}×${result.value.height} · rev ${result.revision}`);
  }

  private uniqueLevelId(base: string): string {
    const taken = new Set(this.levels.list().map((summary) => summary.id));
    if (!taken.has(base)) return base;
    for (let index = 2; index < 999; index += 1) {
      const candidate = `${base}-${index}`;
      if (!taken.has(candidate)) return candidate;
    }
    return `${base}-${Date.now()}`;
  }

  /** Failures surface here, in the workbench, rather than only in the console. */
  /**
   * Materialise the active level into the scene. Deliberately the same `api.levels.play(id)` an
   * agent calls — this button adds no privileged path, it just makes the existing one reachable.
   *
   * The workbench closes on success because the result IS the scene: a played level is ordinary
   * entities in the scene tree, not a separate play mode, so leaving a full-width panel over the
   * viewport would hide the only evidence that it worked.
   */
  private playLevel(): void {
    const result = this.levels.play(this.levelId);
    if (!result.ok) {
      this.levelMessage(result.error ?? "Could not play that level", true);
      return;
    }
    // The world was replaced, so the environment changed with it — same notification
    // `loadStarter` sends, which is what re-reads background/sky/fog on the host.
    this.deps.onEnvironmentChanged?.();
    this.select(null);
    // `force`, not `auto`: play replaces the entire world, including its environment, and the
    // Environment panel reads the sky only when it is rebuilt. An `auto` refresh may decline to
    // rebuild and leave the dropdown reading "No sky" over a viewport that is plainly showing
    // one — the inspector disagreeing with the world is the same class of bug as an agent's sky
    // never reaching the viewport, just pointing the other way.
    this.refresh("force");
    this.setLevelsOpen(false);
    // The play layer (arrow keys + HUD) is NOT mounted here. PlatformHost mounts it whenever a
    // world containing a player ball loads, so an agent calling levels.play() gets exactly the
    // same playable result as this button — the parity rule, applied to gameplay too.
  }

  private levelMessage(message: string, isError = false): void {
    this.levelUi.status.textContent = message;
    this.levelUi.status.classList.toggle("gx-lv-status--error", isError);
  }

  private textInput(placeholder: string): HTMLInputElement {
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = placeholder;
    return input;
  }

  private subhead(text: string): HTMLElement {
    const element = document.createElement("span");
    element.className = "gx-ed-title";
    element.textContent = text;
    return element;
  }

  private tinyLabel(text: string): HTMLElement {
    const element = document.createElement("span");
    element.className = "gx-lv-tiny";
    element.textContent = text;
    return element;
  }

  private times(): HTMLElement {
    const element = document.createElement("span");
    element.className = "gx-lv-tiny";
    element.textContent = "×";
    return element;
  }

  private spacer(): HTMLElement {
    const element = document.createElement("span");
    element.className = "gx-lv-spacer";
    return element;
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

  private libraryChipsFor(tab: LibraryTab): HTMLElement[] {
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
      const emitters = this.deps.api.emitters().map((emitter) =>
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
      // Sounds share the tab: an effect you hear. Same call an agent makes —
      // api.spawn({ type: "sound", sound: { source } }).
      const sounds = this.deps.api.sounds().map((sound) =>
        this.chip(`♪ ${sound.label}`, () => {
          this.addCounter += 1;
          const id = `edit-sound-${this.addCounter}`;
          const result = this.deps.api.spawn({
            id,
            type: "sound",
            label: sound.label,
            transform: { position: [0, 2, 0] },
            sound: { source: sound.id },
            tags: ["effect", "sound"],
          });
          if (result.ok) this.select(id);
          else this.refresh();
        }, `${sound.description}\n\nSource: ${sound.source}\nSpawns a placed, looping sound source. Audio starts after the first click (browser policy).`),
      );
      return [...emitters, ...sounds];
    }
    if (tab === "terrain") {
      // Landform vocabulary: one chip per curated heightmap, plus water. Terrain spawns with
      // its static heightfield collider already attached, so a scene built here is one you
      // can stand on immediately rather than one that needs a floor added under it.
      const heightmaps = this.deps.api.heightmaps().map((heightmap) =>
        this.chip(heightmap.label, () => {
          this.addCounter += 1;
          const id = `edit-terrain-${this.addCounter}`;
          const result = this.deps.api.spawn({
            id,
            type: "terrain",
            label: `${heightmap.label} Terrain`,
            terrain: { heightmap: heightmap.id, size: 120, segments: 96, heightScale: 7 },
            material: { color: "#6c7d55", roughness: 0.95, metalness: 0.02 },
            castShadow: false,
            tags: ["terrain"],
          });
          if (result.ok) this.select(id);
          else this.refresh();
        }, heightmap.provenance
          ? `${heightmap.description}\n\nArchive: ${heightmap.provenance.sourcePath} (${heightmap.provenance.nativeSize.join("×")} @ ${heightmap.provenance.bitsPerPixel}bpp)\nsha256 ${heightmap.provenance.sourceSha256.slice(0, 16)}…\nResampled to ${heightmap.samples}² — ${heightmap.provenance.note}`
          : `${heightmap.description}\n\nGenerated, not archive data.`),
      );
      const water = this.chip("Water (reflective)", () => {
        this.addCounter += 1;
        const id = `edit-water-${this.addCounter}`;
        const result = this.deps.api.spawn({
          id,
          type: "water",
          label: "Water",
          transform: { position: [0, 0.2, 0] },
          water: { size: 60, reflection: true, reflectionResolution: 256 },
          tags: ["water"],
        });
        if (result.ok) this.select(id);
        else this.refresh();
      }, "A reflecting water surface.\n\nCosts one extra scene pass per frame while visible. Turn `water.reflection` off in the inspector to fall back to a single lit plane with the same ripple normals.");
      return [...heightmaps, water];
    }
    if (tab === "life") {
      // Simulation vocabulary rather than props: a flock is a population that steers itself,
      // so the chip places one entity and the scene gains N members that behave. Same call an
      // agent makes — api.spawn({ type: "flock", flock: { preset } }).
      const flocks = this.deps.api.flocks().map((flock) =>
        this.chip(flock.label, () => {
          this.addCounter += 1;
          const id = `edit-flock-${this.addCounter}`;
          const result = this.deps.api.spawn({
            id,
            type: "flock",
            label: flock.label,
            transform: { position: [0, flock.defaults.bounds === "box" ? 8 : 0, 0] },
            flock: { preset: flock.id },
            tags: ["life", "flock"],
          });
          if (result.ok) this.select(id);
          else this.refresh();
        }, `${flock.description}\n\n${flock.defaults.count} members, one instanced draw call.\nSource: ${flock.provenance.sourceRepo}/${flock.provenance.sourcePath}\n${flock.provenance.note}`),
      );
      // Crowds sit beside flocks because they are the same idea on the ground: a population
      // that steers itself, placed as one entity. Spawned at y=0 rather than in the air —
      // members walk a plot, they do not fly a volume.
      const crowds = this.deps.api.crowds().map((crowd) =>
        this.chip(crowd.label, () => {
          this.addCounter += 1;
          const id = `edit-crowd-${this.addCounter}`;
          const result = this.deps.api.spawn({
            id,
            type: "crowd",
            label: crowd.label,
            transform: { position: [0, 0, 0] },
            crowd: { preset: crowd.id },
            tags: ["life", "crowd"],
          });
          if (result.ok) this.select(id);
          else this.refresh();
        }, `${crowd.description}\n\n${crowd.defaults.count} members (${crowd.defaults.pursuers} pursuing), two instanced draw calls.\nSource: ${crowd.provenance.sourceRepo}/${crowd.provenance.sourcePath}\n${crowd.provenance.note}`),
      );
      // Force fields live in the same tab because they are the other half of the same lesson:
      // a flock is a population that steers itself, a field is the thing that steers the rest.
      // The chip places one field entity; the scene's existing bodies, flocks and emitters
      // start responding to it. Same call an agent makes —
      // api.spawn({ type: "force-field", forceField: { preset } }).
      const fields = this.deps.api.forceFields().map((field) =>
        this.chip(field.label, () => {
          this.addCounter += 1;
          const id = `edit-force-field-${this.addCounter}`;
          const result = this.deps.api.spawn({
            id,
            type: "force-field",
            label: field.label,
            transform: { position: [0, field.defaults.kind === "attractor" || field.defaults.kind === "vortex" ? 4 : 3, 0] },
            forceField: { preset: field.id },
            tags: ["life", "force-field"],
          });
          if (result.ok) this.select(id);
          else this.refresh();
        }, `${field.description}\n\nActs on other entities, not itself.\nSource: ${field.provenance.sourceRepo}/${field.provenance.sourcePath}\n${field.provenance.note}`),
      );
      // The recovered Math Game, as vocabulary rather than a legacy screen: one chip per
      // formula preset, spawning a `formula-field` entity whose A/B/C/M/X live in the document.
      const formulas = this.deps.api.formulas().map((formula) =>
        this.chip(formula.label, () => {
          this.addCounter += 1;
          const id = `edit-formula-${this.addCounter}`;
          const result = this.deps.api.spawn({
            id,
            type: "formula-field",
            label: formula.label,
            transform: { position: [0, 0, 0] },
            formula: { preset: formula.id },
            tags: ["life", "formula"],
          });
          if (result.ok) this.select(id);
          else this.refresh();
        }, `${formula.description}

Archive: ${formula.provenance.sourcePath}
${formula.provenance.note}`),
      );
      // The recovered Living Forest, one chip per genome preset. Advancing `dna.generation`
      // in the inspector IS the evolution mechanism — same call an agent makes,
      // api.update(id, { dna: { generation: n + 1 } }).
      const dnaPresets = this.deps.api.dna().map((preset) =>
        this.chip(preset.label, () => {
          this.addCounter += 1;
          const id = `edit-dna-${this.addCounter}`;
          const result = this.deps.api.spawn({
            id,
            type: "dna-tree",
            label: preset.label,
            transform: { position: [0, 0, 0] },
            dna: { preset: preset.id },
            tags: ["life", "dna"],
          });
          if (result.ok) this.select(id);
          else this.refresh();
        }, `${preset.description}

Archive: ${preset.provenance.sourcePath}
${preset.provenance.note}`),
      );
      return [...flocks, ...crowds, ...fields, ...formulas, ...dnaPresets];
    }
    if (tab === "media") return this.mediaLibraryCards();
    // Textures render as swatches, not text: a texture's name says almost nothing about
    // what it looks like, and the image IS the affordance.
    return this.deps.api.textures().map((texture) =>
      this.thumbCard({
        label: texture.label ?? texture.id,
        imageUrl: texture.url,
        title: `${texture.description}\n\nSource: ${texture.source}\nClick to apply to the current selection.`,
        onClick: () => {
          if (!this.selectedId) return;
          this.patchEntity(this.selectedId, {
            material: { texture: { id: texture.id as never, repeat: texture.defaultRepeat } },
          }, "force");
        },
      }),
    );
  }

  // ------------------------------------------------------------------- media

  /**
   * The Media tab: everything imported through the asset store, plus the way in. The
   * store is the same server that holds shared scenes, so "offline" here is the same
   * honest state the scene browser gates on — built-ins still work, imports need it.
   */
  private mediaLibraryCards(): HTMLElement[] {
    const media = this.deps.api.media;
    const status = media.status();
    const cards: HTMLElement[] = [];

    const bar = document.createElement("div");
    bar.className = "gx-md-bar";
    const note = document.createElement("span");
    note.className = "gx-ed-hint";
    note.textContent = status.online
      ? `${status.count} imported · datalake: ${status.datalake ?? "not configured"}`
      : "Asset store offline — run `npm run serve:scenes` to import media.";
    bar.append(
      this.chip("⤓ Import from Datalake…", () => this.setMediaDialogOpen(true), "Browse the datalake folders and import textures, models and sounds"),
      this.chip("↻ Refresh", () => {
        void media.refresh().then(() => this.renderLibrary());
      }, "Re-read the asset store manifest"),
      note,
    );
    cards.push(bar);

    for (const record of media.list()) {
      // Bakes produced during model conversion are plumbing the model references by URL,
      // not things a person places — showing six "airplane map" cards per import is noise.
      if (record.category === "model-texture") continue;
      cards.push(this.mediaCard(record));
    }
    if (!media.list().length && status.online) {
      const empty = document.createElement("div");
      empty.className = "gx-ed-hint";
      empty.textContent = "Nothing imported yet. Import from the datalake, or drop files onto the import dialog.";
      cards.push(empty);
    }
    return cards;
  }

  private mediaCard(record: AgentWorldMediaDescriptor): HTMLElement {
    const glyphs: Record<string, string> = { texture: "▦", model: "⬡", sound: "♪", file: "▤" };
    const applyTitle = {
      texture: "Click to apply to the current selection.",
      model: "Click to spawn as a model entity.",
      sound: "Click to place in the scene as a sound entity; ▶ previews.",
      file: "Stored file (referenced by other assets).",
    }[record.kind] ?? "";
    const card = this.thumbCard({
      label: record.label,
      imageUrl: record.kind === "texture" ? record.url : undefined,
      glyph: glyphs[record.kind] ?? "▤",
      title: `${record.label} — ${record.kind}\n${record.source}\n${formatBytes(record.bytes)}\n\n${applyTitle}`,
      onClick: () => {
        if (record.kind === "texture") {
          if (!this.selectedId) return;
          this.patchEntity(this.selectedId, {
            material: { texture: { id: record.id as never } },
          }, "force");
          return;
        }
        if (record.kind === "model" && record.format === "graphysx-mesh-json") {
          this.addCounter += 1;
          const id = `edit-model-${this.addCounter}`;
          const result = this.deps.api.spawn({
            id,
            type: "model",
            label: record.label,
            asset: { id: record.id } as never,
            transform: { position: [round(((this.addCounter % 4) - 1.5) * 3), 0, round((Math.floor(this.addCounter / 4) % 4 - 1.5) * 3)] },
            tags: ["imported"],
          });
          if (result.ok) this.select(id);
          return;
        }
        if (record.kind === "sound") {
          // Placing, not previewing: the card's primary action makes scene content, the
          // same convention as textures (apply) and models (spawn). ▶ below previews.
          this.addCounter += 1;
          const id = `edit-sound-${this.addCounter}`;
          const result = this.deps.api.spawn({
            id,
            type: "sound",
            label: record.label,
            transform: { position: [0, 2, 0] },
            sound: { source: record.id },
            tags: ["effect", "sound", "imported"],
          });
          if (result.ok) this.select(id);
        }
      },
    });
    if (record.kind === "sound") {
      const preview = document.createElement("span");
      preview.className = "gx-ed-x gx-md-terrain";
      preview.textContent = "▶";
      preview.title = `Preview ${record.label}`;
      preview.addEventListener("click", (clickEvent) => {
        clickEvent.stopPropagation();
        this.toggleMediaPreview(record.url);
      });
      card.append(preview);
    }
    // Removal stays on the card rather than in a mode: one ×, with the API doing the work.
    const remove = document.createElement("span");
    remove.className = "gx-ed-x gx-md-x";
    remove.textContent = "×";
    remove.title = `Remove ${record.id} from the library`;
    remove.addEventListener("click", (clickEvent) => {
      clickEvent.stopPropagation();
      void this.deps.api.media.remove(record.id).then(() => this.renderLibrary());
    });
    card.append(remove);
    if (record.kind === "texture") {
      // Any imported image doubles as a landform: decode to a heights grid and spawn a
      // terrain entity with the array INLINE — same `terrain.heights` an agent would send,
      // so the landform travels with the document instead of referencing the store.
      const terrain = document.createElement("span");
      terrain.className = "gx-ed-x gx-md-terrain";
      terrain.textContent = "⛰";
      terrain.title = `Spawn terrain using ${record.label} as a heightmap`;
      terrain.addEventListener("click", (clickEvent) => {
        clickEvent.stopPropagation();
        void this.spawnTerrainFromMedia(record);
      });
      card.append(terrain);
    }
    return card;
  }

  private async spawnTerrainFromMedia(record: AgentWorldMediaDescriptor): Promise<void> {
    const decoded = await this.deps.api.media.terrainHeights(record.id);
    if (!decoded.ok || !decoded.value) return;
    this.addCounter += 1;
    const id = `edit-terrain-${this.addCounter}`;
    const result = this.deps.api.spawn({
      id,
      type: "terrain",
      label: `${record.label} Terrain`,
      terrain: { heights: decoded.value.heights, size: 120, segments: 96, heightScale: 7 },
      material: { color: "#6c7d55", roughness: 0.95, metalness: 0.02 },
      castShadow: false,
      tags: ["terrain", "imported"],
    });
    if (result.ok) this.select(id);
    else this.refresh("force");
  }

  private toggleMediaPreview(url: string): void {
    if (this.mediaAudio && !this.mediaAudio.paused && this.mediaAudio.src === url) {
      this.stopMediaPreview();
      return;
    }
    this.stopMediaPreview();
    this.mediaAudio = new Audio(url);
    void this.mediaAudio.play().catch(() => undefined);
  }

  private stopMediaPreview(): void {
    this.mediaAudio?.pause();
    this.mediaAudio = null;
  }

  /** A library card with a visual: image thumb when there is one, a glyph otherwise. */
  private thumbCard(options: {
    label: string;
    imageUrl?: string;
    glyph?: string;
    title?: string;
    onClick: () => void;
  }): HTMLElement {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "gx-ed-thumb";
    if (options.title) card.title = options.title;
    if (options.imageUrl) {
      const image = document.createElement("img");
      image.src = options.imageUrl;
      image.loading = "lazy";
      image.alt = "";
      card.append(image);
    } else {
      const glyph = document.createElement("span");
      glyph.className = "gx-ed-thumb-glyph";
      glyph.textContent = options.glyph ?? "▤";
      card.append(glyph);
    }
    const label = document.createElement("span");
    label.className = "gx-ed-thumb-label";
    label.textContent = options.label;
    card.append(label);
    card.addEventListener("click", options.onClick);
    return card;
  }

  // ----------------------------------------------------- media import dialog

  /**
   * The datalake browser: folders on the left, a selectable file grid on the right,
   * import at the bottom. Selection is multi — the point of a 700-file Stockroom is
   * importing a dozen textures in one pass, not twelve dialog round trips. Dropping
   * local files anywhere on the dialog uploads them, covering media that is not in
   * the datalake at all.
   */
  private buildMediaDialog(): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "gx-ed-workbench gx-md-dialog";

    const head = document.createElement("div");
    head.className = "gx-ed-head";
    const title = document.createElement("span");
    title.className = "gx-ed-title";
    title.textContent = "Import media";
    const crumb = document.createElement("span");
    crumb.className = "gx-lv-meta";
    this.mediaCrumb = crumb;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "gx-ed-collapse";
    close.textContent = "✕ Close";
    close.addEventListener("click", () => this.setMediaDialogOpen(false));
    head.append(title, crumb, close);

    const folders = document.createElement("div");
    folders.className = "gx-md-folders";
    this.mediaFolders = folders;

    const files = document.createElement("div");
    files.className = "gx-md-files";
    this.mediaFiles = files;

    const body = document.createElement("div");
    body.className = "gx-lv-body";
    const side = document.createElement("div");
    side.className = "gx-lv-side";
    side.append(this.subhead("Folders"), folders);
    const main = document.createElement("div");
    main.className = "gx-lv-main";
    main.append(this.subhead("Files"), files);
    body.append(side, main);

    const importButton = document.createElement("button");
    importButton.type = "button";
    importButton.className = "gx-lv-play";
    importButton.textContent = "⤓ Import selected";
    importButton.addEventListener("click", () => void this.runMediaImport());
    this.mediaImportButton = importButton;

    const status = document.createElement("div");
    status.className = "gx-lv-status";
    this.mediaStatus = status;

    // Bulk selection: a 141-file Stockroom folder should be one click, not 141.
    const selectAll = document.createElement("button");
    selectAll.type = "button";
    selectAll.className = "gx-ed-chip";
    selectAll.textContent = "Select all";
    selectAll.title = "Toggle every importable file in this folder";
    selectAll.addEventListener("click", () => {
      const usable = (this.mediaListing?.files ?? []).filter((file) => file.usable);
      const allSelected = usable.length > 0 && usable.every((file) => this.mediaSelection.has(file.path));
      this.mediaSelection.clear();
      if (!allSelected) for (const file of usable) this.mediaSelection.add(file.path);
      this.renderMediaDialog();
    });

    const foot = document.createElement("div");
    foot.className = "gx-md-foot";
    const hint = document.createElement("span");
    hint.className = "gx-ed-hint";
    hint.textContent = "Click files to select. Textures and sounds copy as-is; OBJ/GLTF/GLB/FBX/STL/3DS and DDS convert in the browser. You can also drop files here to upload them.";
    foot.append(hint, selectAll, importButton);

    panel.append(head, body, foot, status);

    // Drag-drop upload: local files that never lived in the datalake.
    panel.addEventListener("dragover", (dragEvent) => {
      dragEvent.preventDefault();
    });
    panel.addEventListener("drop", (dropEvent) => {
      dropEvent.preventDefault();
      const files = [...(dropEvent.dataTransfer?.files ?? [])];
      if (files.length) void this.uploadDroppedFiles(files);
    });
    return panel;
  }

  private setMediaDialogOpen(open: boolean): void {
    this.mediaDialogOpen = open;
    this.mediaDialog.classList.toggle("gx-ed-workbench--open", open);
    if (!open) return;
    this.mediaSelection.clear();
    void this.loadMediaListing(this.mediaPath);
  }

  private async loadMediaListing(path: string): Promise<void> {
    this.mediaStatusLine("Reading the datalake…");
    const result = await this.deps.api.media.browse(path);
    if (!result.ok || !result.value) {
      this.mediaStatusLine(result.error ?? "The datalake did not answer.", true);
      this.mediaFolders.replaceChildren();
      this.mediaFiles.replaceChildren();
      return;
    }
    this.mediaPath = result.value.path;
    this.mediaListing = result.value;
    this.renderMediaDialog();
    this.mediaStatusLine(`${result.value.files.length} files · ${result.value.folders.length} folders`);
  }

  private renderMediaDialog(): void {
    const listing = this.mediaListing;
    if (!listing) return;
    this.mediaCrumb.textContent = `${listing.root}/${listing.path}`.replace(/\/+$/, "");

    const rows: HTMLElement[] = [];
    if (listing.path) {
      const parent = listing.path.includes("/") ? listing.path.slice(0, listing.path.lastIndexOf("/")) : "";
      rows.push(this.mediaFolderRow("⬆ up", parent));
    }
    for (const folder of listing.folders) rows.push(this.mediaFolderRow(`▸ ${folder.name}`, folder.path));
    this.mediaFolders.replaceChildren(...rows);

    this.mediaFiles.replaceChildren(...listing.files.map((file) => this.mediaFileCard(file)));
    this.syncMediaImportButton();
  }

  private mediaFolderRow(label: string, path: string): HTMLElement {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "gx-lv-row";
    const name = document.createElement("span");
    name.className = "gx-lv-row-id";
    name.textContent = label;
    row.append(name);
    row.addEventListener("click", () => void this.loadMediaListing(path));
    return row;
  }

  private mediaFileCard(file: AgentMediaFileEntry): HTMLElement {
    const isImage = file.kind === "texture";
    const storeUrl = this.deps.api.media.status().storeUrl;
    const card = this.thumbCard({
      label: file.name,
      imageUrl: isImage && storeUrl ? `${storeUrl}/datalake/file?path=${encodeURIComponent(file.path)}` : undefined,
      glyph: file.kind === "model" ? "⬡" : file.kind === "sound" ? "♪" : "▤",
      title: `${file.path}\n${formatBytes(file.bytes)} · ${file.kind}${file.convertible ? " (converts in-browser)" : ""}${file.usable ? "" : `\nNot directly usable — ${file.extension} needs offline conversion.`}`,
      onClick: () => {
        if (!file.usable) return;
        if (this.mediaSelection.has(file.path)) this.mediaSelection.delete(file.path);
        else this.mediaSelection.add(file.path);
        card.classList.toggle("gx-ed-thumb--on", this.mediaSelection.has(file.path));
        this.syncMediaImportButton();
      },
    });
    if (!file.usable) card.classList.add("gx-ed-thumb--disabled");
    if (this.mediaSelection.has(file.path)) card.classList.add("gx-ed-thumb--on");
    return card;
  }

  private syncMediaImportButton(): void {
    const count = this.mediaSelection.size;
    this.mediaImportButton.textContent = count ? `⤓ Import ${count} file${count === 1 ? "" : "s"}` : "⤓ Import selected";
    this.mediaImportButton.disabled = count === 0 || this.mediaBusy;
  }

  /** Sequential on purpose: model conversion is heavy, and progress should read truthfully. */
  private async runMediaImport(): Promise<void> {
    if (this.mediaBusy || !this.mediaSelection.size) return;
    this.mediaBusy = true;
    this.syncMediaImportButton();
    const paths = [...this.mediaSelection];
    const failures: string[] = [];
    for (let index = 0; index < paths.length; index += 1) {
      const path = paths[index]!;
      this.mediaStatusLine(`Importing ${index + 1}/${paths.length}: ${path}…`);
      const result = await this.deps.api.media.import(path);
      if (!result.ok) failures.push(`${path}: ${result.error ?? "failed"}`);
      else this.mediaSelection.delete(path);
    }
    this.mediaBusy = false;
    this.renderMediaDialog();
    this.renderLibrary();
    this.mediaStatusLine(
      failures.length
        ? `Imported ${paths.length - failures.length}/${paths.length} — ${failures.join(" · ")}`
        : `Imported ${paths.length} file${paths.length === 1 ? "" : "s"} — they are in the Media tab (textures also in Textures, models in Models).`,
      failures.length > 0,
    );
  }

  private async uploadDroppedFiles(files: File[]): Promise<void> {
    const media = this.deps.api.media;
    const failures: string[] = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]!;
      this.mediaStatusLine(`Uploading ${index + 1}/${files.length}: ${file.name}…`);
      const result = await media.register({
        fileName: file.name,
        kind: /\.(png|jpe?g|gif|bmp|webp|dds)$/i.test(file.name) ? "texture"
          : /\.(wav|mp3|ogg|mid|flac)$/i.test(file.name) ? "sound"
          : /\.json$/i.test(file.name) ? "model" : "file",
        source: `Upload/${file.name}`,
        data: file,
      });
      if (!result.ok) failures.push(`${file.name}: ${result.error ?? "failed"}`);
    }
    this.renderLibrary();
    this.mediaStatusLine(
      failures.length ? `Uploaded ${files.length - failures.length}/${files.length} — ${failures.join(" · ")}` : `Uploaded ${files.length} file${files.length === 1 ? "" : "s"}.`,
      failures.length > 0,
    );
  }

  private mediaStatusLine(message: string, isError = false): void {
    this.mediaStatus.textContent = message;
    this.mediaStatus.classList.toggle("gx-lv-status--error", isError);
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
    window.removeEventListener("pointerup", this.onLevelPointerUp);
    this.unsubscribeEvents();
    this.stopMediaPreview();
    this.helpOverlay?.remove();
    this.helpOverlay = null;
    this.gizmo.detach();
    this.gizmo.dispose();
    for (const root of this.roots) root.remove();
  }
}

/** "476.3 KB" out of 476279 — for media tooltips and the import dialog. */
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "?";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
.gx-ed-toolbar,.gx-ed-panel,.gx-ed-workbench{
  --gx-panel:rgba(8,20,28,.88);
  --gx-raise:rgba(16,38,49,.9);
  --gx-border:#1b3b49;
  --gx-border-soft:#153040;
  /* Accent comes from the product theme (platform-theme.ts): --gx-accent, --gx-accent-deep,
     --gx-accent-fill and the alpha washes cascade from :root. The editor used to pin its own
     cyan pair here, which is exactly the palette fork the one-theme layer exists to end. */
  --gx-text:#dbeff5;
  --gx-muted:#7fb0c0;
  --gx-field:#0b222c;
  --gx-radius:8px;
  --gx-radius-sm:6px;
  --gx-s1:4px; --gx-s2:6px; --gx-s3:8px; --gx-s4:12px; --gx-s5:16px;
  position:fixed;z-index:20;box-sizing:border-box;
  font:12px/1.45 var(--gx-font);color:var(--gx-text);
  background:var(--gx-panel);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  border:1px solid var(--gx-border);border-radius:var(--gx-radius);
  box-shadow:0 10px 34px rgba(0,10,16,.42);
}
.gx-ed-toolbar *,.gx-ed-panel *,.gx-ed-workbench *{box-sizing:border-box}

/* ---- top bar ---- */
.gx-ed-toolbar{top:var(--gx-s4);left:var(--gx-s4);right:var(--gx-s4);display:flex;flex-wrap:wrap;align-items:center;gap:var(--gx-s3);padding:var(--gx-s2) var(--gx-s3);user-select:none}
.gx-ed-group{display:flex;align-items:center;gap:var(--gx-s1)}
.gx-ed-group+.gx-ed-group{padding-left:var(--gx-s3);border-left:1px solid var(--gx-border-soft)}
.gx-ed-toolbar button,.gx-ed-toolbar select{background:var(--gx-field);color:var(--gx-text);border:1px solid var(--gx-border);border-radius:var(--gx-radius-sm);padding:5px 10px;cursor:pointer;font:inherit;line-height:1.2}
.gx-ed-toolbar button:hover,.gx-ed-toolbar select:hover{background:var(--gx-raise);border-color:var(--gx-accent-deep)}
.gx-ed-toolbar button.gx-ed-on{background:var(--gx-accent-fill);border-color:var(--gx-accent);color:#fff}
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
.gx-ed-title{font:600 10px/1.4 var(--gx-font);letter-spacing:.14em;text-transform:uppercase;color:var(--gx-muted);flex:none}
.gx-ed-count{margin-left:auto;font:600 10px/1 var(--gx-font);color:var(--gx-accent);background:var(--gx-accent-soft);border:1px solid var(--gx-border);border-radius:99px;padding:3px 8px}
.gx-ed-readout{font-size:11px;color:var(--gx-muted);word-break:break-all;flex:none}

/* ---- inputs (one look, everywhere) ---- */
.gx-ed-panel input,.gx-ed-panel select,.gx-ed-workbench input,.gx-ed-workbench textarea{background:var(--gx-field);color:var(--gx-text);border:1px solid var(--gx-border);border-radius:var(--gx-radius-sm);padding:4px 6px;font:11px/1.3 var(--gx-font);min-width:0}
.gx-ed-panel input:hover,.gx-ed-panel select:hover,.gx-ed-workbench input:hover,.gx-ed-workbench textarea:hover{border-color:var(--gx-accent-deep)}
.gx-ed-panel input:focus,.gx-ed-panel select:focus,.gx-ed-panel button:focus-visible,
.gx-ed-workbench input:focus,.gx-ed-workbench textarea:focus,.gx-ed-workbench button:focus-visible{outline:none;border-color:var(--gx-accent);box-shadow:0 0 0 2px var(--gx-accent-ring)}
.gx-ed-panel input[type=color]{padding:1px;width:44px;height:22px;cursor:pointer;flex:none}
/* Spinners steal a third of a narrow numeric field and clip the value. */
.gx-ed-panel input[type=number],.gx-ed-workbench input[type=number]{-moz-appearance:textfield;text-align:right}
.gx-ed-panel input[type=number]::-webkit-outer-spin-button,
.gx-ed-panel input[type=number]::-webkit-inner-spin-button,
.gx-ed-workbench input[type=number]::-webkit-outer-spin-button,
.gx-ed-workbench input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.gx-ed-panel input[type=range]{accent-color:var(--gx-accent);padding:0;border:none;background:none;width:100%;cursor:pointer}
.gx-ed-filter{width:100%;flex:none;padding:5px 8px}
.gx-ed-filter--inline{width:auto;flex:1 1 120px;min-width:90px}

/* ---- scene tree ---- */
.gx-ed-list{overflow-y:auto;display:flex;flex-direction:column;gap:2px;flex:1 1 auto;min-height:0;padding-right:2px}
.gx-ed-row{display:flex;align-items:center;gap:var(--gx-s2);text-align:left;width:100%;background:transparent;color:#c6e2ea;border:1px solid transparent;border-radius:var(--gx-radius-sm);padding:4px 6px;cursor:pointer;font:11px/1.3 var(--gx-font)}
.gx-ed-row:hover{background:var(--gx-raise);border-color:var(--gx-border)}
.gx-ed-row--active{background:var(--gx-accent-fill);border-color:var(--gx-accent);color:#fff;font-weight:600}
.gx-ed-glyph{flex:none;width:13px;text-align:center;color:var(--gx-accent);font-size:11px}
.gx-ed-row--active .gx-ed-glyph{color:#fff}
.gx-ed-row-id{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gx-ed-row-type{flex:none;font-size:9.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--gx-muted);opacity:.9}
.gx-ed-row--active .gx-ed-row-type{color:#cdeef7}

/* ---- inspector ---- */
.gx-ed-inspector{display:flex;flex-direction:column;gap:5px}
.gx-ed-ident{display:flex;align-items:center;gap:var(--gx-s2);justify-content:space-between;background:var(--gx-raise);border:1px solid var(--gx-border);border-radius:var(--gx-radius-sm);padding:5px var(--gx-s3)}
.gx-ed-ident-id{font:600 12px/1.3 var(--gx-font);color:#eaf9ff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gx-ed-badge{flex:none;font:600 9.5px/1 var(--gx-font);letter-spacing:.07em;text-transform:uppercase;color:var(--gx-accent);border:1px solid var(--gx-border);background:var(--gx-accent-soft);border-radius:99px;padding:4px 7px}
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
.gx-ed-axis>span{flex:none;font:600 9px/1 var(--gx-font);text-transform:uppercase;color:var(--gx-muted)}
.gx-ed-axis>input{width:100%;padding:4px 4px}
.gx-ed-slider{display:flex;align-items:center;gap:var(--gx-s2)}
.gx-ed-value{flex:none;font:11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--gx-muted);min-width:34px;text-align:right}
.gx-ed-inline{display:flex;align-items:center;gap:var(--gx-s2);justify-content:flex-end}
.gx-ed-attached{display:flex;align-items:center;gap:var(--gx-s2);background:var(--gx-field);border:1px solid var(--gx-border);border-radius:var(--gx-radius-sm);padding:3px 4px 3px 8px;font-size:11px}
.gx-ed-attached>span{flex:1 1 auto}
.gx-ed-x{flex:none;background:transparent;border:1px solid transparent;border-radius:4px;color:var(--gx-muted);cursor:pointer;font:14px/1 var(--gx-font);padding:1px 6px}
.gx-ed-x:hover{background:#5c2230;border-color:#8d3346;color:#ffd9e0}
.gx-ed-blank{display:flex;flex-direction:column;align-items:center;gap:var(--gx-s2);text-align:center;padding:var(--gx-s5) var(--gx-s3);color:var(--gx-muted);border:1px dashed var(--gx-border);border-radius:var(--gx-radius-sm)}
.gx-ed-blank-glyph{font-size:22px;color:var(--gx-accent);opacity:.55}
.gx-ed-hint{font-size:10.5px;line-height:1.5;color:#5f8b98}
.gx-ed-empty{font-size:11px;color:#5f8b98;font-style:italic;padding:var(--gx-s2)}

/* ---- library drawer ---- */
.gx-ed-tabs{display:flex;gap:2px;background:rgba(4,14,20,.5);border:1px solid var(--gx-border-soft);border-radius:var(--gx-radius-sm);padding:2px}
.gx-ed-tab{background:transparent;border:none;border-radius:5px;color:var(--gx-muted);cursor:pointer;font:600 10.5px/1 var(--gx-font);letter-spacing:.03em;padding:5px 11px}
.gx-ed-tab:hover{color:var(--gx-text);background:var(--gx-raise)}
.gx-ed-tab--on{background:var(--gx-accent-fill);color:#fff}
.gx-ed-collapse{margin-left:auto;flex:none;background:var(--gx-field);border:1px solid var(--gx-border);border-radius:var(--gx-radius-sm);color:var(--gx-muted);cursor:pointer;font:10px/1 var(--gx-font);padding:6px 9px}
/* Play is the workbench's primary action, so it reads as one. It carries the auto margin and the
   close button then sits directly beside it, rather than the two splitting the free space. */
.gx-lv-play{margin-left:auto;flex:none;border-radius:var(--gx-radius-sm);cursor:pointer;font:10px/1 var(--gx-font);padding:6px 11px;color:#0c1f1a;background:linear-gradient(180deg,#5fe0b4,#2fae86);border:1px solid #6ff0c4;font-weight:700}
.gx-lv-play:hover{background:linear-gradient(180deg,#72e9c1,#38bd93)}
.gx-lv-play + .gx-ed-collapse{margin-left:6px}
.gx-ed-collapse:hover{color:var(--gx-text);border-color:var(--gx-accent-deep)}
.gx-ed-grid{display:flex;flex-wrap:wrap;gap:var(--gx-s1)}
.gx-ed-grid--drawer{overflow-y:auto;align-content:flex-start;flex:1 1 auto;min-height:0;padding-right:2px}
.gx-ed-chip{background:var(--gx-field);color:#c6e2ea;border:1px solid var(--gx-border);border-radius:var(--gx-radius-sm);padding:5px 9px;cursor:pointer;font:10.5px/1.2 var(--gx-font)}
.gx-ed-chip:hover{background:var(--gx-raise);border-color:var(--gx-accent);color:#fff}
.gx-ed-chip:focus-visible{outline:none;border-color:var(--gx-accent);box-shadow:0 0 0 2px var(--gx-accent-ring)}
.gx-ed-chip--on{background:var(--gx-accent-fill);border-color:var(--gx-accent);color:#fff}

/* ---- levels workbench ---- */
/* An overlay, not a fourth rail: it fills the working area under the toolbar and closes
   with one click, so the 3D viewport is never permanently squeezed. */
.gx-ed-workbench{display:none;flex-direction:column;gap:var(--gx-s3);padding:var(--gx-s3);top:60px;left:var(--gx-s4);right:var(--gx-s4);bottom:var(--gx-s4);z-index:24}
.gx-ed-workbench--open{display:flex}
.gx-lv-meta{font:11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--gx-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gx-lv-body{display:flex;gap:var(--gx-s3);flex:1 1 auto;min-height:0}
.gx-lv-side{flex:0 0 190px;display:flex;flex-direction:column;gap:var(--gx-s2);min-height:0}
.gx-lv-main{flex:1 1 auto;display:flex;flex-direction:column;gap:var(--gx-s2);min-width:0;min-height:0}
.gx-lv-ascii{flex:0 0 232px;display:flex;flex-direction:column;gap:var(--gx-s2);min-height:0}

.gx-lv-list{flex:1 1 auto;min-height:60px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;padding-right:2px}
.gx-lv-row{display:flex;align-items:center;gap:var(--gx-s2);text-align:left;width:100%;background:transparent;color:#c6e2ea;border:1px solid transparent;border-radius:var(--gx-radius-sm);padding:4px 6px;cursor:pointer;font:11px/1.3 var(--gx-font)}
.gx-lv-row:hover{background:var(--gx-raise);border-color:var(--gx-border)}
.gx-lv-row--active{background:var(--gx-accent-fill);border-color:var(--gx-accent);color:#fff;font-weight:600}
.gx-lv-row-id{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gx-lv-row-dim{flex:none;font:9.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--gx-muted)}
.gx-lv-row--active .gx-lv-row-dim{color:#cdeef7}
.gx-lv-form{display:flex;align-items:center;gap:var(--gx-s1)}
.gx-lv-form input{flex:1 1 auto;width:100%;min-width:0}
.gx-lv-form .gx-ed-chip{flex:none;white-space:nowrap}
.gx-lv-tiny{flex:none;font-size:10px;color:var(--gx-muted)}
.gx-lv-spacer{flex:1 1 auto}

.gx-lv-tools{display:flex;align-items:center;flex-wrap:wrap;gap:var(--gx-s1);flex:none}
.gx-lv-tools input[type=number]{width:52px}
.gx-lv-palette{display:flex;flex-wrap:wrap;gap:var(--gx-s1);flex:none}
.gx-lv-swatch{display:flex;align-items:center;gap:var(--gx-s2);background:var(--gx-field);color:#c6e2ea;border:1px solid var(--gx-border);border-radius:var(--gx-radius-sm);padding:3px 8px 3px 3px;cursor:pointer;font:10.5px/1.2 var(--gx-font)}
.gx-lv-swatch:hover{background:var(--gx-raise);border-color:var(--gx-accent)}
.gx-lv-swatch--on{background:var(--gx-accent-fill);border-color:var(--gx-accent);color:#fff}
.gx-lv-swatch-glyph{flex:none;width:18px;height:18px;display:flex;align-items:center;justify-content:center;border-radius:4px;font:700 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace}

/* A flex canvas with an auto-margin grid centres small levels without clipping the
   top-left of a big one the way justify-content:center would. */
.gx-lv-canvas{flex:1 1 auto;min-height:0;overflow:auto;display:flex;background:rgba(4,14,20,.45);border:1px solid var(--gx-border-soft);border-radius:var(--gx-radius-sm);padding:var(--gx-s2)}
.gx-lv-grid{display:grid;gap:1px;width:max-content;height:max-content;margin:auto;user-select:none;touch-action:none}
.gx-lv-axis{display:flex;align-items:center;justify-content:center;overflow:hidden;font:9px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--gx-muted)}
.gx-lv-axis--corner{font-size:8px;opacity:.75}
.gx-lv-cell{width:var(--gx-cell);height:var(--gx-cell);display:flex;align-items:center;justify-content:center;border-radius:2px;cursor:crosshair;font:700 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;overflow:hidden}
.gx-lv-cell:hover{box-shadow:inset 0 0 0 1px var(--gx-accent)}
.gx-lv-cell--marked{box-shadow:inset 0 0 0 2px var(--gx-accent)}

.gx-lv-text{flex:1 1 auto;min-height:0;resize:none;white-space:pre;overflow:auto;font:12px/1.25 ui-monospace,SFMono-Regular,Menlo,monospace !important;letter-spacing:.09em}
.gx-lv-status{flex:none;font:11px/1.4 var(--gx-font);color:var(--gx-muted);border-top:1px solid var(--gx-border-soft);padding-top:var(--gx-s2);min-height:16px;word-break:break-word}
.gx-lv-status--error{color:#ff9fb0}

/* ---- toolbar tail: live status + help ---- */
.gx-ed-group--tail{margin-left:auto;border-left:none !important;padding-left:0 !important}
.gx-ed-status{font:11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--gx-muted);white-space:nowrap}
.gx-ed-help{min-width:28px;font-weight:700}
.gx-ed-helpcard{top:60px;right:calc(296px + 2 * var(--gx-s4));width:280px;z-index:26}
.gx-ed-helprow{display:flex;align-items:center;gap:var(--gx-s3);font-size:11px}
.gx-ed-helprow kbd{flex:0 0 108px;background:var(--gx-field);border:1px solid var(--gx-border);border-radius:4px;padding:3px 6px;font:600 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--gx-accent);text-align:center}

/* ---- scene tree visibility toggle ---- */
.gx-ed-eye{flex:none;width:16px;text-align:center;color:var(--gx-accent);opacity:.65;cursor:pointer;border-radius:4px}
.gx-ed-eye:hover{opacity:1;background:var(--gx-accent-soft)}
.gx-ed-eye--off{color:var(--gx-muted);opacity:.5}

/* ---- library thumbnails (textures + media) ---- */
.gx-ed-thumb{position:relative;display:flex;flex-direction:column;align-items:center;gap:3px;width:86px;background:var(--gx-field);border:1px solid var(--gx-border);border-radius:var(--gx-radius-sm);padding:4px;cursor:pointer;color:#c6e2ea}
.gx-ed-thumb:hover{background:var(--gx-raise);border-color:var(--gx-accent);color:#fff}
.gx-ed-thumb--on{border-color:var(--gx-accent);box-shadow:0 0 0 2px var(--gx-accent-ring)}
.gx-ed-thumb--disabled{opacity:.4;cursor:not-allowed}
.gx-ed-thumb img{width:76px;height:52px;object-fit:cover;border-radius:4px;background:#04121a;pointer-events:none}
.gx-ed-thumb-glyph{width:76px;height:52px;display:flex;align-items:center;justify-content:center;font-size:24px;color:var(--gx-accent);background:rgba(4,18,26,.8);border-radius:4px}
.gx-ed-thumb-label{max-width:78px;font:10px/1.25 var(--gx-font);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gx-md-x{position:absolute;top:2px;right:2px;z-index:1}
.gx-md-terrain{position:absolute;top:2px;left:2px;z-index:1;font-size:11px}
.gx-md-terrain:hover{background:var(--gx-accent-fill);border-color:var(--gx-accent);color:#fff}
.gx-md-bar{display:flex;align-items:center;gap:var(--gx-s2);flex-wrap:wrap;width:100%;flex:none}

/* ---- media import dialog ---- */
.gx-md-dialog{z-index:26}
.gx-md-folders{flex:1 1 auto;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:2px;padding-right:2px}
.gx-md-files{flex:1 1 auto;min-height:0;overflow-y:auto;display:flex;flex-wrap:wrap;gap:var(--gx-s2);align-content:flex-start;padding:var(--gx-s2);background:rgba(4,14,20,.45);border:1px solid var(--gx-border-soft);border-radius:var(--gx-radius-sm)}
.gx-md-foot{display:flex;align-items:center;gap:var(--gx-s3);flex:none}
.gx-md-foot .gx-ed-hint{flex:1 1 auto}
.gx-md-foot .gx-lv-play:disabled{opacity:.45;cursor:not-allowed}

@media (max-width:1080px){
  .gx-ed-panel--left{width:200px}
  .gx-ed-panel--right{width:250px}
  .gx-ed-panel--drawer{left:224px;right:274px}
  .gx-ed-status{display:none}
}
`;
