import { Color, MathUtils } from "three";
import packageInfo from "../package.json";
import {
  RaceScene,
  type ArchivePreviewMode,
  type BallPreset,
  type MapEditorDraft,
  type MapEditorTile,
  type MathFormulaParams,
  type RaceDebugSnapshot,
  type RaceSnapshot
} from "./race-scene";
import { RACE_DEFINITIONS, type RaceDefinition } from "./race-definitions";
import {
  formatMedal,
  formatRaceTime,
  getMedalThresholds,
  medalForTime,
  MEDAL_POINTS,
  ScoreboardStore,
  type RaceRecord
} from "./scoreboard";
import {
  ARCHIVE_MODES,
  ARCHIVE_SCENES,
  ASSET_RECOVERY_ITEMS,
  CUBX_RECOVERY_ITEMS,
  EDITOR_RECOVERY_ITEMS,
  GAME_RECOVERY_ITEMS,
  MAP_EDITOR_RECOVERY_ITEMS,
  MATH_CONTROLS,
  NATURE_RECOVERY_ITEMS,
  SCENE_RECOVERY_ITEMS,
  type ArchiveSceneStatus,
  type ArchiveModeId,
  type ArchiveRecoveryItem
} from "./archive-content";
import {
  SKYBOX_SELECTOR_ENTRIES,
  type SkyboxSelectorId
} from "./archive-selector-environments";
import {
  NATURE_LAB_STUDIES,
  type NatureLabLayer,
  type NatureLabLessonId,
  type NatureLabParameter,
  type NatureLabState,
  type NatureLabStudyId
} from "./nature-lab";
import {
  GRAPHYSX_WORLD_RECIPES,
  findWorldRecipe,
  isGraphysXWorldRecipe,
  type GraphysXWorldObserver,
  type GraphysXWorldRecipe
} from "./world-recipes";
import {
  GRAPHYSX_AGENT_CAPABILITIES,
  GRAPHYSX_AGENT_DEMO_WORLD,
  GRAPHYSX_AGENT_WORLD_SCHEMA,
  type AgentWorldBehavior,
  type AgentWorldChangeSet,
  type AgentWorldCommand,
  type AgentWorldDefinition,
  type AgentWorldEntityDefinition,
  type AgentWorldEntityPatch,
  type AgentWorldInteraction,
  type AgentWorldMaterial,
  type AgentWorldQuery,
  type AgentWorldState,
  type AgentWorldTexture,
  type GraphysXAgentWorldApi
} from "./agent-world-runtime";
import { GRAPHYSX_AGENT_WORLD_ASSETS } from "./agent-world-assets";
import {
  GRAPHYSX_AGENT_WORLD_TEXTURES,
  type AgentWorldTextureId
} from "./agent-world-textures";
import {
  convertLegacyGraphysXXml,
  type AgentWorldLegacyXmlOptions
} from "./agent-world-legacy-xml";
import {
  createGraphysXAgentToolBridge,
  type GraphysXAgentToolBridge
} from "./agent-world-bridge";
import {
  AgentLevelLibrary,
  GRAPHYSX_AGENT_LEVEL_CAPABILITIES,
  GRAPHYSX_AGENT_LEVEL_SCHEMA,
  GRAPHYSX_AGENT_LEVEL_TILES,
  GRAPHYSX_AGENT_LEVEL_TILE_SEMANTICS,
  type AgentLevelAsciiImport,
  type AgentLevelCellPatch,
  type AgentLevelCreateOptions,
  type AgentLevelDefinition,
  type AgentLevelOperation,
  type AgentLevelRect,
  type AgentLevelResult,
  type AgentLevelState,
  type AgentLevelTransactionOptions,
  type GraphysXAgentLevelApi
} from "./agent-level-library";
import {
  GRAPHYSX_AGENT_WORLD_PREFABS,
  type AgentWorldPrefabId,
  type AgentWorldPrefabOptions
} from "./agent-world-prefabs";
import {
  GRAPHYSX_AGENT_WORLD_STARTERS,
  type AgentWorldStarterId,
  type AgentWorldStarterOptions
} from "./agent-world-starters";
import type {
  ObjectLibraryFamily,
  ObjectLibraryStatusFilter
} from "./object-library-catalog-environment";
import type {
  DominusAssetFamily,
  DominusAssetStatusFilter
} from "./dominus-asset-gallery-environment";
import type {
  BallzTrackGalleryAssetId,
  BallzTrackGalleryCameraProfile,
  BallzTrackGalleryMaterialMode
} from "./ballz-track-gallery-environment";
import type {
  CubxActorClickIndex,
  CubxActorClipFamily,
  CubxActorPairIndex,
  CubxActorPlaybackDirection
} from "./cubx-actor-lineage-environment";
import type { CubXSatelliteId } from "./cubx-satellite-shell";
import {
  DEVICE_PROFILES,
  InputDeviceLab,
  type DeviceProfileId,
  type RobotCommand,
  type ServoId
} from "./input-device-lab";
import type {
  ArchiveBlenderCameraProfile,
  MaisonSubspaceId
} from "./archive-blender-environments";
import type { ThreejsPlaygroundParameter } from "./threejs-playground-environment";

const ARCHIVE_STATE_FLOW = ["scene-index", "scene-lab", "milky-way-lab", "nature-lab", "world-api-lab", "skybox-selector", "car-selector", "vehicle-pack-gallery", "common-room-lab", "threejs-playground", "ballz-blender-level1", "maison-explorer", "arena-archive", "xml-myworld-copy", "ballz-xml-worlds", "object-library-catalog", "dominus-asset-gallery", "dominus-port-evidence", "ballz-2011-level1", "ballz-slide1", "ballz-track-gallery", "suzanne2-archive", "game-lab", "physics-lab", "input-device-lab", "map-editor", "math-lab", "editor-lab", "cubx-lab", "cubx-actor-lineage", "notes-manager-lab", "xml-serializer-artifacts", "asset-catalog"] as const;
const APP_VERSION = packageInfo.version;
const APP_BUILD = "revival-2026.07.18-r13";
type ArchiveAppState = (typeof ARCHIVE_STATE_FLOW)[number];
type AppState = "home" | "race-select" | "world-select" | "gameplay" | "after-race" | ArchiveAppState;

type ChallengeMeta = {
  chapter: string;
  difficulty: "Intro" | "Easy" | "Medium" | "Hard" | "Expert";
  objective: string;
  focus: string;
};

const CHALLENGE_META: Record<string, ChallengeMeta> = {
  "green-grid-run": {
    chapter: "BallZ Foundations",
    difficulty: "Intro",
    objective: "Complete the three laps authored in levelList.xml; recovered checkpoints subtract time from the run.",
    focus: "Learn the exact Level 1 tile footprint, paired gates, and optional checkpoint bonus line."
  },
  "rotator-cube-works": {
    chapter: "Maze Reading",
    difficulty: "Easy",
    objective: "Complete three laps through the exact gold-tile maze; collect checkpoints for the archive time bonus.",
    focus: "Route planning through the original Level 2 ASCII geometry and paired gates."
  },
  "piston-gateworks": {
    chapter: "Platform Clusters",
    difficulty: "Medium",
    objective: "Complete three laps across the recovered platforms; clustered checkpoints are optional time bonuses.",
    focus: "Platform navigation and recovery on the authored Level 3 footprint."
  },
  "ballz18-level01": {
    chapter: "BallZ18 Circuit",
    difficulty: "Medium",
    objective: "Complete the canonical three-lap challenge through the Unity scene's exact halfway and lap gates.",
    focus: "Race the source-backed BallAI around the authored blue/red L1_floor circuit."
  },
  "skybox-spiral": {
    chapter: "Open Sky",
    difficulty: "Medium",
    objective: "Follow the spiral checkpoint line across the floating route and return home.",
    focus: "Camera orbit, momentum, and long sightlines."
  },
  "suzanne1-classic": {
    chapter: "Recovered Classic",
    difficulty: "Hard",
    objective: "Complete three laps through the recovered diagonal halfway line and finish posts; the 15 sphere checkpoints refund archive time.",
    focus: "Read the original 40×40 block field, 45 chain assemblies, three pistons, particle cells, and exact authored gates."
  },
  "world1-recovered": {
    chapter: "Lost World",
    difficulty: "Hard",
    objective: "Navigate the recovered World 1 assembly and find a safe line through its vertical spaces.",
    focus: "Exploration and fall recovery."
  },
  "map1-2011": {
    chapter: "2011 Descent",
    difficulty: "Expert",
    objective: "Complete the flagship vertical descent with the original shell and controller meshes.",
    focus: "Precision on a tall legacy map."
  },
  "slide-2008": {
    chapter: "The Great Slide",
    difficulty: "Hard",
    objective: "Descend the byte-identical SlideLarge / BallZ 2011 Level0 geometry, thread its recovered checkpoint route, and survive the runout.",
    focus: "Momentum control on the archive's giant 116-unit descent."
  },
  "flightx-pipe": {
    chapter: "FlightX Pipe Loop",
    difficulty: "Hard",
    objective: "Pilot the recovered archive airplane around the decoded pipe1 loop and clear its live recovery route.",
    focus: "Quaternion roll, pitch, thrust, airbrake, and orientation recovery."
  },
  "piste-ovale": {
    chapter: "Impreza Detour",
    difficulty: "Medium",
    objective: "Drive the recovered Subaru around the banked oval and complete the lap.",
    focus: "Vehicle steering replaces BallZ rolling."
  },
  "zombie-hunt": {
    chapter: "ZombieKiller",
    difficulty: "Hard",
    objective: "Squash every zombie before the arena is overrun.",
    focus: "Free-roam hunting instead of rings and gates."
  },
  "dominus-port": {
    chapter: "Modern Curated Visit",
    difficulty: "Easy",
    objective: "Tour every landmark ring in a clearly labeled modern composition built from the recovered Dominus asset family.",
    focus: "Explore the surviving town and port meshes without mistaking this new layout for an authored archive world."
  }
};

const BALLZ_RACE_IDS = new Set([
  "green-grid-run",
  "rotator-cube-works",
  "piston-gateworks",
  "ballz18-level01",
  "skybox-spiral",
  "suzanne1-classic",
  "zombie-hunt"
]);
const RECOVERED_WORLD_IDS = new Set([
  "world1-recovered",
  "map1-2011",
  "piste-ovale",
  "slide-2008",
  "flightx-pipe",
  "dominus-port",
]);
const BALLZ_RACES = RACE_DEFINITIONS.filter((race) => BALLZ_RACE_IDS.has(race.id));
const RECOVERED_WORLD_RACES = RACE_DEFINITIONS.filter((race) => RECOVERED_WORLD_IDS.has(race.id));
type WorldFamilyId = "ballz-concepts" | "flightx" | "vehicles" | "dominus";
const WORLD_FAMILY_IDS: Record<WorldFamilyId, Set<string>> = {
  "ballz-concepts": new Set(["world1-recovered", "map1-2011", "slide-2008"]),
  flightx: new Set(["flightx-pipe"]),
  vehicles: new Set(["piste-ovale"]),
  dominus: new Set(["dominus-port"])
};
const WORLD_FAMILY_RACES: Record<WorldFamilyId, RaceDefinition[]> = {
  "ballz-concepts": RECOVERED_WORLD_RACES.filter((race) => WORLD_FAMILY_IDS["ballz-concepts"].has(race.id)),
  flightx: RECOVERED_WORLD_RACES.filter((race) => WORLD_FAMILY_IDS.flightx.has(race.id)),
  vehicles: RECOVERED_WORLD_RACES.filter((race) => WORLD_FAMILY_IDS.vehicles.has(race.id)),
  dominus: RECOVERED_WORLD_RACES.filter((race) => WORLD_FAMILY_IDS.dominus.has(race.id))
};
const MATH_PRESETS: Record<string, MathFormulaParams> = {
  "ballz18-unity": { a: 0.01, b: 0, c: 100, m: 5, xOffset: 0, formula: "parabola" },
  "classic-bowl": { a: 1, b: 0, c: 0, m: 1, xOffset: 0, formula: "parabola" },
  "wide-arch": { a: -0.45, b: 0.5, c: 2.5, m: 1, xOffset: 0, formula: "parabola" },
  "offset-curve": { a: 0.7, b: -1.5, c: -0.5, m: 1, xOffset: 1.5, formula: "parabola" },
  "rising-ramp": { a: 0, b: -1, c: 0, m: 1.25, xOffset: 0, formula: "slope" },
  "falling-ramp": { a: 0, b: 2, c: 0, m: -0.8, xOffset: -1, formula: "slope" }
};

const MAP_EDITOR_TOOLS: Array<{ tile: MapEditorTile; label: string; hint: string }> = [
  { tile: "floor", label: "Floor", hint: "driveable tile" },
  { tile: "wall", label: "Wall", hint: "solid block" },
  { tile: "start", label: "Start", hint: "single spawn" },
  { tile: "ring", label: "Ring", hint: "checkpoint pickup" },
  { tile: "half", label: "Half", hint: "single halfway gate" },
  { tile: "finish", label: "Finish", hint: "single finish gate" },
  { tile: "hazard", label: "Hazard", hint: "solid obstacle" },
  { tile: "fire", label: "Fire", hint: "repels + launches" },
  { tile: "ice", label: "Ice", hint: "pulls + preserves momentum" }
];

export class PrototypeApp {
  private readonly root: HTMLDivElement;
  private readonly viewport: HTMLDivElement;
  private readonly shell: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private readonly title: HTMLHeadingElement;
  private readonly body: HTMLParagraphElement;
  private readonly stats: HTMLDivElement;
  private readonly versionBadge: HTMLDivElement;
  private readonly primaryAction: HTMLButtonElement;
  private readonly secondaryAction: HTMLButtonElement;
  private readonly gameControls: HTMLDivElement;
  private readonly pauseBanner: HTMLDivElement;
  private readonly raceScene: RaceScene;
  private readonly scoreboard = new ScoreboardStore();
  private readonly inputDeviceLab = new InputDeviceLab();
  private state: AppState = "home";
  private gameplayOrigin: "race-select" | "world-select" | "map-editor" = "race-select";
  private latestRecord?: RaceRecord;
  private mathParams: MathFormulaParams = { a: 1.5, b: -1, c: 0, m: 1.25, xOffset: 0, formula: "parabola" };
  private readonly levelLibrary: AgentLevelLibrary;
  private activeEditorLevelId: string;
  private editorWidth: number;
  private editorHeight: number;
  private editorCellSize: number;
  private editorTiles: MapEditorTile[];
  private selectedEditorTile: MapEditorTile = "wall";
  private pendingCubXRaceId: string | null = null;
  private agentWorldSelectedEntityId: string | null = null;
  private agentWorldEditorMessage = "Select an entity or create one below.";
  private agentWorldEditorHasError = false;
  private agentWorldBridge: GraphysXAgentToolBridge | null = null;

  constructor(root: HTMLDivElement) {
    this.levelLibrary = new AgentLevelLibrary(createEditorLevelDefinition(
      "starter-map",
      "Starter Map",
      loadSavedEditorTiles() ?? createInitialEditorTiles()
    ));
    const preferredLevelId = this.levelLibrary.active()?.id;
    if (!this.levelLibrary.get("funny-zigzagger")) {
      this.levelLibrary.create(createFunnyZigzaggerLevel());
      if (preferredLevelId) this.levelLibrary.activate(preferredLevelId);
    }
    const activeLevel = this.levelLibrary.active();
    if (!activeLevel) throw new Error("GraphysX level library requires an active level");
    this.activeEditorLevelId = activeLevel.id;
    this.editorWidth = activeLevel.width;
    this.editorHeight = activeLevel.height;
    this.editorCellSize = activeLevel.cellSize;
    this.editorTiles = [...activeLevel.tiles];
    this.root = root;
    this.root.innerHTML = "";
    this.shell = document.createElement("div");
    this.shell.className = "app-shell";

    this.viewport = document.createElement("div");
    this.viewport.className = "viewport";

    this.panel = document.createElement("div");
    this.panel.className = "panel";

    this.versionBadge = document.createElement("div");
    this.versionBadge.className = "version-badge";
    this.versionBadge.innerHTML = `<span>GraphysX Web Revival</span><strong>v${escapeHtml(APP_VERSION)}</strong><small>${escapeHtml(APP_BUILD)}</small>`;

    this.title = document.createElement("h1");
    this.title.className = "panel-title";

    this.body = document.createElement("p");
    this.body.className = "panel-copy";

    this.stats = document.createElement("div");
    this.stats.className = "stats-grid";

    const actions = document.createElement("div");
    actions.className = "panel-actions";

    this.primaryAction = document.createElement("button");
    this.primaryAction.className = "button button-primary";

    this.secondaryAction = document.createElement("button");
    this.secondaryAction.className = "button button-secondary";

    actions.append(this.primaryAction, this.secondaryAction);
    this.panel.append(this.versionBadge, this.title, this.body, actions, this.stats);
    this.shell.append(this.viewport, this.panel);
    this.root.append(this.shell);

    this.raceScene = new RaceScene(this.viewport, {
      onRaceFinished: (snapshot) => {
        this.latestRecord = this.scoreboard.registerFinish(this.raceScene.getRace(), snapshot.elapsedMs, snapshot.ringsCollected);
        this.setState("after-race", snapshot);
        this.scrollPanelToTop();
      },
      onRaceAssetsChanged: () => {
        if (this.pendingCubXRaceId && this.raceScene.getRaceLoadState().ready) {
          const raceId = this.pendingCubXRaceId;
          this.pendingCubXRaceId = null;
          this.launchRaceFromCubX(raceId);
          return;
        }
        if (this.state === "race-select" || this.state === "world-select") {
          this.setState(this.state);
        }
      },
      onCubXStateChanged: () => {
        if (this.state === "cubx-lab") {
          this.setState("cubx-lab");
        }
      },
      onCubXLaunchRace: (raceId) => this.launchRaceFromCubX(raceId),
      onCubXOpenArchiveMode: (mode) => {
        if (mode === "car-selector") this.openArchiveMode(mode);
      },
      onCommonRoomStateChanged: () => {
        if (this.state === "common-room-lab") {
          this.setState("common-room-lab");
        }
      },
      onArchiveSelectorStateChanged: () => {
        if (isArchiveState(this.state)) {
          this.setState(this.state);
        }
      },
      onNatureStateChanged: () => {
        if (this.state === "nature-lab") {
          this.setState("nature-lab");
        }
      },
      onAgentWorldStateChanged: () => {
        this.agentWorldBridge?.notify();
        if (this.state === "world-api-lab") {
          this.setState("world-api-lab");
        }
      }
    });

    this.gameControls = document.createElement("div");
    this.gameControls.className = "game-controls";
    this.gameControls.hidden = true;
    this.gameControls.setAttribute("aria-label", "Touch game controls");
    this.gameControls.innerHTML = `
      <div class="touch-direction" aria-label="Direction controls">
        <button type="button" data-virtual-key="ArrowUp" aria-label="Up or pitch up">▲</button>
        <button type="button" data-virtual-key="ArrowLeft" aria-label="Left or roll left">◀</button>
        <button type="button" data-virtual-key="ArrowDown" aria-label="Down or pitch down">▼</button>
        <button type="button" data-virtual-key="ArrowRight" aria-label="Right or roll right">▶</button>
      </div>
      <div class="touch-actions" aria-label="Action controls">
        <button type="button" data-virtual-key="KeyS" aria-label="Reverse thrust">REV</button>
        <button type="button" data-virtual-key="Space" aria-label="Jump or airbrake">JUMP<br><small>BRAKE</small></button>
        <button type="button" data-virtual-key="KeyW" aria-label="Forward thrust">GO</button>
        <button type="button" data-virtual-key="KeyC" aria-label="Reset camera">CAM</button>
        <button type="button" data-game-action="pause" aria-label="Pause race">PAUSE</button>
      </div>`;
    const releaseVirtualKey = (target: EventTarget | null): void => {
      const button = target instanceof HTMLElement ? target.closest<HTMLButtonElement>("[data-virtual-key]") : null;
      const code = button?.dataset.virtualKey;
      if (code) this.raceScene.setVirtualInput(code, false);
    };
    this.gameControls.addEventListener("pointerdown", (event) => {
      const button = event.target instanceof HTMLElement
        ? event.target.closest<HTMLButtonElement>("[data-virtual-key]")
        : null;
      const code = button?.dataset.virtualKey;
      if (!button || !code) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      this.raceScene.setVirtualInput(code, true);
    });
    this.gameControls.addEventListener("pointerup", (event) => releaseVirtualKey(event.target));
    this.gameControls.addEventListener("pointercancel", (event) => releaseVirtualKey(event.target));
    this.gameControls.addEventListener("lostpointercapture", (event) => releaseVirtualKey(event.target));
    this.gameControls.addEventListener("click", (event) => {
      const action = event.target instanceof HTMLElement
        ? event.target.closest<HTMLButtonElement>("[data-game-action]")?.dataset.gameAction
        : undefined;
      if (action === "pause") this.setGameplayPaused(!this.raceScene.isRacePaused());
    });
    this.gameControls.addEventListener("contextmenu", (event) => event.preventDefault());
    this.viewport.append(this.gameControls);

    this.pauseBanner = document.createElement("div");
    this.pauseBanner.className = "game-pause-banner";
    this.pauseBanner.hidden = true;
    this.pauseBanner.innerHTML = "<strong>Paused</strong><small>P or the touch button resumes · Esc exits</small>";
    this.viewport.append(this.pauseBanner);

    this.primaryAction.addEventListener("click", () => {
      if (this.state === "home") {
        this.showRaceSelect();
        return;
      }

      if (this.state === "race-select") {
        this.startCurrentRace();
        return;
      }

      if (this.state === "world-select") {
        this.startCurrentRace();
        return;
      }

      if (this.state === "gameplay") {
        this.startCurrentRace();
        return;
      }

      if (this.state === "after-race") {
        if (this.gameplayOrigin !== "map-editor") {
          this.selectNextRace();
        }
        this.showSelectionForGameplayOrigin();
        return;
      }

      if (isArchiveState(this.state)) {
        this.openArchiveMode(this.getNextArchiveMode());
      }
    });

    this.secondaryAction.addEventListener("click", () => {
      if (this.state === "home") {
        this.openArchiveMode("game-lab");
        return;
      }

      if (this.state === "race-select") {
        this.showHome();
        return;
      }

      if (this.state === "world-select") {
        this.showHome();
        return;
      }

      if (this.state === "gameplay") {
        if (this.gameplayOrigin === "map-editor") {
          this.openArchiveMode("map-editor");
        } else if (this.gameplayOrigin === "world-select") {
          this.showWorldSelect();
        } else {
          this.showRaceSelect();
        }
        return;
      }

      if (this.state === "after-race") {
        this.startCurrentRace();
        return;
      }

      if (isArchiveState(this.state)) {
        this.showHome();
      }
    });

    this.stats.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const playgroundInput = target.closest<HTMLInputElement>("[data-playground-param]");
      if (playgroundInput && this.state === "threejs-playground") {
        const parameter = playgroundInput.dataset.playgroundParam as ThreejsPlaygroundParameter | undefined;
        if (!parameter) return;
        this.raceScene.setThreejsPlaygroundParameter(parameter, Number(playgroundInput.value));
        const valueLabel = this.stats.querySelector<HTMLElement>(`[data-playground-value="${parameter}"]`);
        if (valueLabel) valueLabel.textContent = Number(playgroundInput.value).toFixed(0);
        return;
      }
      const deviceServo = target.closest<HTMLInputElement>("[data-device-servo]");
      if (deviceServo && this.state === "input-device-lab") {
        const servo = deviceServo.dataset.deviceServo as ServoId | undefined;
        if (servo) this.inputDeviceLab.setServo(servo, Number(deviceServo.value));
        const value = this.stats.querySelector<HTMLElement>(`[data-device-servo-value="${servo}"]`);
        if (value) value.textContent = `${Math.round(Number(deviceServo.value))}°`;
        this.renderDeviceProtocolLog();
        return;
      }
      const natureInput = target.closest<HTMLInputElement>("[data-nature-param]");
      if (natureInput && this.state === "nature-lab") {
        const parameter = natureInput.dataset.natureParam as NatureLabParameter | undefined;
        if (!parameter) {
          return;
        }
        this.raceScene.setNatureLabParameter(parameter, Number(natureInput.value));
        const valueLabel = this.stats.querySelector<HTMLElement>(`[data-nature-value="${parameter}"]`);
        if (valueLabel) {
          valueLabel.textContent = Number(natureInput.value).toFixed(parameter === "mutationRate" ? 2 : 1);
        }
        return;
      }
      const input = target.closest<HTMLInputElement>("[data-math-param]");
      if (!input || this.state !== "math-lab") {
        return;
      }
      const key = input.dataset.mathParam as "a" | "b" | "c" | "m" | "xOffset" | undefined;
      if (!key) {
        return;
      }
      this.mathParams = {
        ...this.mathParams,
        [key]: Number(input.value)
      };
      this.raceScene.setMathFormulaParams(this.mathParams);
      const valueLabel = this.stats.querySelector<HTMLElement>(`[data-math-value="${key}"]`);
      if (valueLabel) {
        valueLabel.textContent = Number(input.value).toFixed(2);
      }
      const equation = this.stats.querySelector<HTMLElement>("[data-math-equation]");
      if (equation) {
        equation.innerHTML = this.formatFormula();
      }
    });

    this.stats.addEventListener("change", (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !input.matches("[data-agent-world-file-input]") || this.state !== "world-api-lab") return;
      void this.importAgentWorldFile(input);
    });

    this.stats.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const modeButton = target.closest<HTMLButtonElement>("[data-mode-id]");
      if (modeButton && this.state !== "gameplay") {
        this.openArchiveMode((modeButton.dataset.modeId as ArchiveModeId | undefined) ?? "race");
        return;
      }

      const deviceProfile = target.closest<HTMLButtonElement>("[data-device-profile]");
      if (deviceProfile && this.state === "input-device-lab") {
        const profile = deviceProfile.dataset.deviceProfile as DeviceProfileId | undefined;
        if (profile) this.inputDeviceLab.setProfile(profile);
        this.setState("input-device-lab");
        return;
      }

      const deviceRobot = target.closest<HTMLButtonElement>("[data-device-robot]");
      if (deviceRobot && this.state === "input-device-lab") {
        this.inputDeviceLab.sendRobot(Number(deviceRobot.dataset.deviceRobot) as RobotCommand);
        this.setState("input-device-lab");
        return;
      }

      const deviceIo = target.closest<HTMLButtonElement>("[data-device-io]");
      if (deviceIo && this.state === "input-device-lab") {
        this.inputDeviceLab.toggleIo(Number(deviceIo.dataset.deviceIo));
        this.setState("input-device-lab");
        return;
      }

      const deviceSchedule = target.closest<HTMLButtonElement>("[data-device-schedule]");
      if (deviceSchedule && this.state === "input-device-lab") {
        this.inputDeviceLab.toggleSchedule(Number(deviceSchedule.dataset.deviceSchedule));
        this.setState("input-device-lab");
        return;
      }

      const deviceAction = target.closest<HTMLButtonElement>("[data-device-action]");
      if (deviceAction && this.state === "input-device-lab") {
        const action = deviceAction.dataset.deviceAction;
        const state = this.inputDeviceLab.getState();
        if (action === "arm") this.inputDeviceLab.setArmed(!state.armed);
        if (action === "identify") this.inputDeviceLab.identify();
        if (action === "pin") this.inputDeviceLab.setPin(!state.pinOn);
        if (action === "sonar") this.inputDeviceLab.readSonar();
        if (action === "sweep") this.inputDeviceLab.sweepSonar();
        if (action === "mearm") this.inputDeviceLab.setMeArmStarted(!state.meArm.started);
        this.setState("input-device-lab");
        return;
      }

      const worldsButton = target.closest<HTMLButtonElement>("[data-open-worlds]");
      if (worldsButton && this.state !== "gameplay") {
        this.showWorldSelect();
        return;
      }

      const worldFamilyButton = target.closest<HTMLButtonElement>("[data-world-family]");
      if (worldFamilyButton && this.state !== "gameplay") {
        const family = worldFamilyButton.dataset.worldFamily as WorldFamilyId | undefined;
        const collection = family ? WORLD_FAMILY_RACES[family] : undefined;
        if (collection?.length) {
          this.raceScene.setRace(this.getRecommendedRace(collection).id);
          this.showWorldSelect();
        }
        return;
      }

      const roomOrbitButton = target.closest<HTMLButtonElement>("[data-room-orbit]");
      if (roomOrbitButton && this.state === "common-room-lab") {
        const action = roomOrbitButton.dataset.roomOrbit;
        if (action === "reset") {
          this.raceScene.resetCommonRoomOrbit();
        } else {
          this.raceScene.orbitCommonRoomByRadians(action === "left" ? Math.PI / 12 : -Math.PI / 12);
        }
        this.setState("common-room-lab");
        return;
      }

      const playgroundActionButton = target.closest<HTMLButtonElement>("[data-playground-action]");
      if (playgroundActionButton && this.state === "threejs-playground") {
        const action = playgroundActionButton.dataset.playgroundAction;
        if (action === "reset") {
          this.raceScene.resetThreejsPlayground();
        } else {
          this.raceScene.orbitThreejsPlaygroundByRadians(action === "left" ? Math.PI / 12 : -Math.PI / 12);
        }
        this.setState("threejs-playground");
        return;
      }

      const blenderLevelActionButton = target.closest<HTMLButtonElement>("[data-blender-level-action]");
      if (blenderLevelActionButton && this.state === "ballz-blender-level1") {
        const action = blenderLevelActionButton.dataset.blenderLevelAction;
        if (action === "source" || action === "overview") {
          this.raceScene.setBallzBlenderLevel1Camera(action);
        } else if (action === "reset") {
          this.raceScene.resetBallzBlenderLevel1();
        } else {
          this.raceScene.orbitBallzBlenderLevel1(action === "left" ? Math.PI / 12 : -Math.PI / 12);
        }
        this.setState("ballz-blender-level1");
        return;
      }

      const maisonSubspaceButton = target.closest<HTMLButtonElement>("[data-maison-subspace]");
      if (maisonSubspaceButton && this.state === "maison-explorer") {
        const id = maisonSubspaceButton.dataset.maisonSubspace as MaisonSubspaceId | undefined;
        if (id) this.raceScene.selectMaisonSubspace(id);
        this.setState("maison-explorer");
        return;
      }

      const maisonCameraButton = target.closest<HTMLButtonElement>("[data-maison-camera]");
      if (maisonCameraButton && this.state === "maison-explorer") {
        const profile = maisonCameraButton.dataset.maisonCamera as ArchiveBlenderCameraProfile | undefined;
        if (profile) this.raceScene.setMaisonCamera(profile);
        this.setState("maison-explorer");
        return;
      }

      const maisonActionButton = target.closest<HTMLButtonElement>("[data-maison-action]");
      if (maisonActionButton && this.state === "maison-explorer") {
        const action = maisonActionButton.dataset.maisonAction;
        if (action === "reset") this.raceScene.resetMaisonExplorer();
        else this.raceScene.orbitMaisonExplorer(action === "left" ? Math.PI / 12 : -Math.PI / 12);
        this.setState("maison-explorer");
        return;
      }
      const arenaCameraButton = target.closest<HTMLButtonElement>("[data-arena-camera]");
      if (arenaCameraButton && this.state === "arena-archive") {
        const profile = arenaCameraButton.dataset.arenaCamera === "source" ? "source" : "overview";
        this.raceScene.setArenaArchiveCamera(profile);
        this.setState("arena-archive");
        return;
      }
      const arenaActionButton = target.closest<HTMLButtonElement>("[data-arena-action]");
      if (arenaActionButton && this.state === "arena-archive") {
        const action = arenaActionButton.dataset.arenaAction;
        if (action === "left") this.raceScene.orbitArenaArchive(-0.32);
        if (action === "right") this.raceScene.orbitArenaArchive(0.32);
        if (action === "reset") this.raceScene.resetArenaArchive();
        this.setState("arena-archive");
        return;
      }

      const commonSpaceButton = target.closest<HTMLButtonElement>("[data-common-space]");
      if (commonSpaceButton && this.state === "common-room-lab") {
        const space = commonSpaceButton.dataset.commonSpace as "room1" | "sky-component" | "room2-shadow" | undefined;
        if (space && this.raceScene.selectCommonEnvironment(space)) {
          this.setState("common-room-lab");
        }
        return;
      }

      const level1DisplayButton = target.closest<HTMLButtonElement>("[data-level1-display]");
      if (level1DisplayButton && this.state === "ballz-2011-level1") {
        const view = level1DisplayButton.dataset.level1Display;
        const current = this.raceScene.getBallz2011Level1State();
        if (view === "edges") this.raceScene.setBallz2011Level1Edges(!(current?.presentation.edgesVisible ?? true));
        if (view === "bounds") this.raceScene.setBallz2011Level1Bounds(!(current?.presentation.boundsVisible ?? false));
        this.setState("ballz-2011-level1");
        return;
      }

      const slide1DisplayButton = target.closest<HTMLButtonElement>("[data-slide1-display]");
      if (slide1DisplayButton && this.state === "ballz-slide1") {
        const view = slide1DisplayButton.dataset.slide1Display;
        const current = this.raceScene.getBallzSlide1State();
        if (view === "ball") this.raceScene.setBallzSlide1BallVisible(!(current?.ball.visible ?? true));
        if (view === "edges") this.raceScene.setBallzSlide1Edges(!(current?.diagnostics.edgesVisible ?? true));
        if (view === "bounds") this.raceScene.setBallzSlide1Bounds(!(current?.diagnostics.boundsVisible ?? false));
        this.setState("ballz-slide1");
        return;
      }

      const ballzTrackAssetButton = target.closest<HTMLButtonElement>("[data-ballz-track-asset]");
      if (ballzTrackAssetButton && this.state === "ballz-track-gallery") {
        const id = ballzTrackAssetButton.dataset.ballzTrackAsset as BallzTrackGalleryAssetId | undefined;
        if (id) this.raceScene.selectBallzTrackGalleryAsset(id);
        this.setState("ballz-track-gallery");
        return;
      }

      const ballzTrackActionButton = target.closest<HTMLButtonElement>("[data-ballz-track-action]");
      if (ballzTrackActionButton && this.state === "ballz-track-gallery") {
        const action = ballzTrackActionButton.dataset.ballzTrackAction;
        const current = this.raceScene.getBallzTrackGalleryState();
        if (action === "materials") this.raceScene.setBallzTrackGalleryMaterialMode(current?.material.mode === "source-evidence" ? "diagnostic-groups" : "source-evidence");
        if (action === "edges") this.raceScene.setBallzTrackGalleryEdges(!(current?.diagnostics.edgesVisible ?? true));
        if (action === "bounds") this.raceScene.setBallzTrackGalleryBounds(!(current?.diagnostics.boundsVisible ?? false));
        if (action === "overview" || action === "top") this.raceScene.setBallzTrackGalleryCamera(action as BallzTrackGalleryCameraProfile);
        this.setState("ballz-track-gallery");
        return;
      }

      const xmlOrbitButton = target.closest<HTMLButtonElement>("[data-xml-orbit]");
      if (xmlOrbitButton && this.state === "xml-myworld-copy") {
        const action = xmlOrbitButton.dataset.xmlOrbit;
        if (action === "reset") this.raceScene.resetXmlSceneOrbit();
        else this.raceScene.orbitXmlSceneByRadians(action === "left" ? Math.PI / 10 : -Math.PI / 10);
        this.setState("xml-myworld-copy");
        return;
      }

      const xmlObjectButton = target.closest<HTMLButtonElement>("[data-xml-object]");
      if (xmlObjectButton && this.state === "xml-myworld-copy") {
        const name = xmlObjectButton.dataset.xmlObject;
        const current = this.raceScene.getXmlSceneState()?.objects.find((object) => object.name === name);
        if (name && current?.rendered) this.raceScene.setXmlSceneObjectVisible(name, !current.visible);
        this.setState("xml-myworld-copy");
        return;
      }

      const xmlResetButton = target.closest<HTMLButtonElement>("[data-xml-reset]");
      if (xmlResetButton && this.state === "xml-myworld-copy") {
        this.raceScene.resetXmlSceneObjects();
        this.setState("xml-myworld-copy");
        return;
      }

      const ballzXmlSceneButton = target.closest<HTMLButtonElement>("[data-ballz-xml-scene]");
      if (ballzXmlSceneButton && this.state === "ballz-xml-worlds") {
        const id = ballzXmlSceneButton.dataset.ballzXmlScene as "myworld" | "testworld" | undefined;
        if (id) this.raceScene.selectBallzXmlWorld(id);
        this.setState("ballz-xml-worlds");
        return;
      }

      const ballzXmlActionButton = target.closest<HTMLButtonElement>("[data-ballz-xml-action]");
      if (ballzXmlActionButton && this.state === "ballz-xml-worlds") {
        const action = ballzXmlActionButton.dataset.ballzXmlAction;
        if (action === "focus") this.raceScene.focusNextBallzXmlWorldObject();
        if (action === "left") this.raceScene.orbitBallzXmlWorldsByRadians(Math.PI / 10);
        if (action === "right") this.raceScene.orbitBallzXmlWorldsByRadians(-Math.PI / 10);
        if (action === "reset") this.raceScene.resetBallzXmlWorlds();
        this.setState("ballz-xml-worlds");
        return;
      }

      const serializerArtifactButton = target.closest<HTMLButtonElement>("[data-serializer-artifact]");
      if (serializerArtifactButton && this.state === "xml-serializer-artifacts") {
        const id = serializerArtifactButton.dataset.serializerArtifact as "base-scene" | "test1" | undefined;
        if (id) this.raceScene.selectStockroomXmlArtifact(id);
        this.setState("xml-serializer-artifacts");
        return;
      }

      const serializerActionButton = target.closest<HTMLButtonElement>("[data-serializer-action]");
      if (serializerActionButton && this.state === "xml-serializer-artifacts") {
        const action = serializerActionButton.dataset.serializerAction;
        if (action === "left") this.raceScene.orbitStockroomXmlArtifactByRadians(Math.PI / 10);
        if (action === "right") this.raceScene.orbitStockroomXmlArtifactByRadians(-Math.PI / 10);
        if (action === "reset") this.raceScene.resetStockroomXmlArtifact();
        this.setState("xml-serializer-artifacts");
        return;
      }

      const vehiclePackButton = target.closest<HTMLButtonElement>("[data-vehicle-pack]");
      if (vehiclePackButton && this.state === "vehicle-pack-gallery") {
        const id = vehiclePackButton.dataset.vehiclePack as "gt4" | "low-cobra" | undefined;
        if (id) void this.raceScene.selectVehiclePackAsset(id);
        this.setState("vehicle-pack-gallery");
        return;
      }

      const vehiclePackActionButton = target.closest<HTMLButtonElement>("[data-vehicle-pack-action]");
      if (vehiclePackActionButton && this.state === "vehicle-pack-gallery") {
        const action = vehiclePackActionButton.dataset.vehiclePackAction;
        if (action === "left") this.raceScene.orbitVehiclePackByRadians(Math.PI / 10);
        if (action === "right") this.raceScene.orbitVehiclePackByRadians(-Math.PI / 10);
        if (action === "reset") this.raceScene.resetVehiclePackView();
        this.setState("vehicle-pack-gallery");
        return;
      }

      const objectLibraryFamilyButton = target.closest<HTMLButtonElement>("[data-object-library-family]");
      if (objectLibraryFamilyButton && this.state === "object-library-catalog") {
        const family = objectLibraryFamilyButton.dataset.objectLibraryFamily as ObjectLibraryFamily | undefined;
        if (family) this.raceScene.setObjectLibraryFamilyFilter(family);
        this.setState("object-library-catalog");
        return;
      }

      const objectLibraryStatusButton = target.closest<HTMLButtonElement>("[data-object-library-status]");
      if (objectLibraryStatusButton && this.state === "object-library-catalog") {
        const status = objectLibraryStatusButton.dataset.objectLibraryStatus as ObjectLibraryStatusFilter | undefined;
        if (status) this.raceScene.setObjectLibraryStatusFilter(status);
        this.setState("object-library-catalog");
        return;
      }

      const objectLibrarySelectButton = target.closest<HTMLButtonElement>("[data-object-library-select]");
      if (objectLibrarySelectButton && this.state === "object-library-catalog") {
        const action = objectLibrarySelectButton.dataset.objectLibrarySelect;
        if (action === "reset") this.raceScene.resetObjectLibraryCatalog();
        if (action === "previous") this.raceScene.selectNextObjectLibraryObject(-1);
        if (action === "next") this.raceScene.selectNextObjectLibraryObject(1);
        if (action === "left") this.raceScene.orbitObjectLibraryCatalogByRadians(Math.PI / 10);
        if (action === "right") this.raceScene.orbitObjectLibraryCatalogByRadians(-Math.PI / 10);
        this.setState("object-library-catalog");
        return;
      }

      const dominusFamilyButton = target.closest<HTMLButtonElement>("[data-dominus-family]");
      if (dominusFamilyButton && this.state === "dominus-asset-gallery") {
        const family = dominusFamilyButton.dataset.dominusFamily as DominusAssetFamily | undefined;
        if (family) void this.raceScene.setDominusAssetFamilyFilter(family);
        this.setState("dominus-asset-gallery");
        return;
      }

      const dominusStatusButton = target.closest<HTMLButtonElement>("[data-dominus-status]");
      if (dominusStatusButton && this.state === "dominus-asset-gallery") {
        const status = dominusStatusButton.dataset.dominusStatus as DominusAssetStatusFilter | undefined;
        if (status) void this.raceScene.setDominusAssetStatusFilter(status);
        this.setState("dominus-asset-gallery");
        return;
      }

      const dominusSelectButton = target.closest<HTMLButtonElement>("[data-dominus-select]");
      if (dominusSelectButton && this.state === "dominus-asset-gallery") {
        const action = dominusSelectButton.dataset.dominusSelect;
        if (action === "reset") void this.raceScene.resetDominusAssetGallery();
        if (action === "previous") void this.raceScene.selectNextDominusAsset(-1);
        if (action === "next") void this.raceScene.selectNextDominusAsset(1);
        if (action === "left") this.raceScene.orbitDominusAssetGalleryByRadians(Math.PI / 10);
        if (action === "right") this.raceScene.orbitDominusAssetGalleryByRadians(-Math.PI / 10);
        this.setState("dominus-asset-gallery");
        return;
      }

      const dominusPortPlacementButton = target.closest<HTMLButtonElement>("[data-dominus-port-id]");
      if (dominusPortPlacementButton && this.state === "dominus-port-evidence") {
        const id = dominusPortPlacementButton.dataset.dominusPortId;
        if (id) this.raceScene.selectDominusPortEvidence(id, true);
        this.setState("dominus-port-evidence");
        return;
      }

      const dominusPortActionButton = target.closest<HTMLButtonElement>("[data-dominus-port-action]");
      if (dominusPortActionButton && this.state === "dominus-port-evidence") {
        const action = dominusPortActionButton.dataset.dominusPortAction;
        if (action === "previous") this.raceScene.selectNextDominusPortEvidence(-1);
        if (action === "next") this.raceScene.selectNextDominusPortEvidence(1);
        if (action === "overview") this.raceScene.showDominusPortSourceGrid();
        if (action === "focus") {
          const id = this.raceScene.getDominusPortEvidenceState()?.selectedId;
          if (id) this.raceScene.selectDominusPortEvidence(id, true);
        }
        if (action === "left") this.raceScene.orbitDominusPortEvidenceByRadians(Math.PI / 10);
        if (action === "right") this.raceScene.orbitDominusPortEvidenceByRadians(-Math.PI / 10);
        if (action === "reset") this.raceScene.resetDominusPortEvidence();
        this.setState("dominus-port-evidence");
        return;
      }

      const suzanne2DisplayButton = target.closest<HTMLButtonElement>("[data-suzanne2-display]");
      if (suzanne2DisplayButton && this.state === "suzanne2-archive") {
        const layer = suzanne2DisplayButton.dataset.suzanne2Display;
        const current = this.raceScene.getSuzanne2State();
        if (layer === "player") this.raceScene.setSuzanne2PlayerVisible(!(current?.player.visible ?? true));
        if (layer === "xml") this.raceScene.setSuzanne2XmlVisible((current?.counts.xmlMeshesVisible ?? 0) === 0);
        if (layer === "cubx") this.raceScene.setSuzanne2CubxVisible((current?.counts.cubxAnchorsVisible ?? 0) === 0);
        if (layer === "rings") this.raceScene.resetSuzanne2Rings();
        this.setState("suzanne2-archive");
        return;
      }

      const suzanne2PistonButton = target.closest<HTMLButtonElement>("[data-suzanne2-piston]");
      if (suzanne2PistonButton && this.state === "suzanne2-archive") {
        const index = Number(suzanne2PistonButton.dataset.suzanne2Piston ?? 0);
        const active = this.raceScene.getSuzanne2State()?.activePistons.includes(index) ?? false;
        this.raceScene.setSuzanne2PistonActivation(index, active ? 0 : 1);
        this.setState("suzanne2-archive");
        return;
      }

      const notesAction = target.closest<HTMLButtonElement>("[data-notes-action]");
      if (notesAction && this.state === "notes-manager-lab") {
        if (notesAction.dataset.notesAction === "reset") this.raceScene.resetArchiveNotes();
        else this.raceScene.addArchiveNote();
        this.setState("notes-manager-lab");
        return;
      }

      const particlePresetButton = target.closest<HTMLButtonElement>("[data-particle-preset-id]");
      if (particlePresetButton && this.state === "game-lab") {
        const id = particlePresetButton.dataset.particlePresetId;
        if (id) this.raceScene.selectArchivedParticlePreset(id);
        this.setState("game-lab");
        return;
      }

      const particlePresetAction = target.closest<HTMLButtonElement>("[data-particle-preset-action]");
      if (particlePresetAction && this.state === "game-lab") {
        const action = particlePresetAction.dataset.particlePresetAction;
        const current = this.raceScene.getArchivedParticlePresetLibraryState();
        if (action === "restart") this.raceScene.restartArchivedParticlePreset();
        if (action === "pause") this.raceScene.setArchivedParticlePresetPaused(!(current?.paused ?? false));
        if (action === "auto") this.raceScene.setArchivedParticlePresetAutoReplay(!(current?.autoReplay ?? true));
        if (action === "previous") this.raceScene.selectNextArchivedParticlePreset(-1);
        if (action === "next") this.raceScene.selectNextArchivedParticlePreset(1);
        this.setState("game-lab");
        return;
      }

      const milkyProfile = target.closest<HTMLButtonElement>("[data-milky-profile]");
      if (milkyProfile && this.state === "milky-way-lab") {
        const profile = milkyProfile.dataset.milkyProfile as "graphysx2017" | "ballz2015" | undefined;
        if (profile) this.raceScene.setMilkyWayProfile(profile);
        this.setState("milky-way-lab");
        return;
      }

      const milkyReset = target.closest<HTMLButtonElement>("[data-milky-reset]");
      if (milkyReset && this.state === "milky-way-lab") {
        this.raceScene.resetMilkyWay();
        this.setState("milky-way-lab");
        return;
      }

      const skyboxButton = target.closest<HTMLButtonElement>("[data-skybox-id]");
      if (skyboxButton && this.state === "skybox-selector") {
        this.raceScene.selectSkyboxFromArchive((skyboxButton.dataset.skyboxId ?? "clearblue") as SkyboxSelectorId);
        this.setState("skybox-selector");
        return;
      }

      const skyboxReset = target.closest<HTMLButtonElement>("[data-skybox-reset]");
      if (skyboxReset && this.state === "skybox-selector") {
        this.raceScene.resetSkyboxSelector();
        this.setState("skybox-selector");
        return;
      }

      const carReset = target.closest<HTMLButtonElement>("[data-car-selector-reset]");
      if (carReset && this.state === "car-selector") {
        this.raceScene.resetCarSelector();
        this.setState("car-selector");
        return;
      }

      const agentTextureChoice = target.closest<HTMLButtonElement>("[data-agent-texture-choice]");
      if (agentTextureChoice && this.state === "world-api-lab") {
        const scope = agentTextureChoice.dataset.agentTextureScope as "create" | "edit" | undefined;
        const studio = agentTextureChoice.closest<HTMLElement>("[data-agent-authoring-studio]");
        if (!scope || !studio) return;
        const textureId = agentTextureChoice.dataset.agentTextureChoice ?? "";
        const textureField = agentAuthorField(studio, scope, "texture-id");
        if (textureField) textureField.value = textureId;
        const repeat = (agentTextureChoice.dataset.agentTextureRepeat ?? "1,1").split(",").map(Number);
        const repeatX = agentAuthorField(studio, scope, "texture-repeat-x");
        const repeatY = agentAuthorField(studio, scope, "texture-repeat-y");
        if (repeatX) repeatX.value = String(repeat[0] ?? 1);
        if (repeatY) repeatY.value = String(repeat[1] ?? 1);
        const color = agentAuthorField(studio, scope, "color");
        if (textureId && color instanceof HTMLInputElement) color.value = "#ffffff";
        const picker = agentTextureChoice.closest<HTMLElement>("[data-agent-texture-picker]");
        picker?.querySelectorAll("[data-agent-texture-choice]").forEach((button) => button.classList.toggle("is-selected", button === agentTextureChoice));
        return;
      }

      const agentAuthoringAction = target.closest<HTMLButtonElement>("[data-agent-authoring-action]");
      if (agentAuthoringAction && this.state === "world-api-lab") {
        this.handleAgentWorldAuthoring(agentAuthoringAction);
        return;
      }

      const agentTransformMode = target.closest<HTMLButtonElement>("[data-agent-transform-mode]");
      if (agentTransformMode && this.state === "world-api-lab") {
        const mode = agentTransformMode.dataset.agentTransformMode as "translate" | "rotate" | "scale" | undefined;
        if (mode) this.raceScene.setAgentWorldTransformMode(mode);
        this.setState("world-api-lab");
        return;
      }

      const agentTransformSpace = target.closest<HTMLButtonElement>("[data-agent-transform-space]");
      if (agentTransformSpace && this.state === "world-api-lab") {
        const current = this.raceScene.getAgentWorldTransformToolState().space;
        this.raceScene.setAgentWorldTransformSpace(current === "world" ? "local" : "world");
        this.setState("world-api-lab");
        return;
      }

      const agentWorldPrefab = target.closest<HTMLButtonElement>("[data-agent-world-prefab]");
      if (agentWorldPrefab && this.state === "world-api-lab") {
        const prefabId = agentWorldPrefab.dataset.agentWorldPrefab as AgentWorldPrefabId | undefined;
        if (prefabId && GRAPHYSX_AGENT_WORLD_PREFABS.some((prefab) => prefab.id === prefabId)) {
          const rootCount = this.raceScene.queryAgentWorld({ tag: "prefab-root" }).length;
          const angle = rootCount * Math.PI * 0.72;
          const radius = 5.5 + Math.floor(rootCount / 5) * 3.5;
          this.raceScene.spawnAgentWorldPrefab(prefabId, {
            position: [Number((Math.cos(angle) * radius).toFixed(2)), 0, Number((Math.sin(angle) * radius).toFixed(2))],
            rotationDegrees: [0, Number((-angle * 180 / Math.PI + 90).toFixed(1)), 0],
            tags: ["studio-placed"]
          });
        }
        return;
      }

      const agentWorldInteraction = target.closest<HTMLButtonElement>("[data-agent-world-interact]");
      if (agentWorldInteraction && this.state === "world-api-lab") {
        const entityId = agentWorldInteraction.dataset.agentWorldInteract;
        const interactionId = agentWorldInteraction.dataset.agentWorldInteraction;
        if (entityId) this.raceScene.interactAgentWorld(entityId, interactionId);
        return;
      }

      const agentWorldStarter = target.closest<HTMLButtonElement>("[data-agent-world-starter]");
      if (agentWorldStarter && this.state === "world-api-lab") {
        const starterId = agentWorldStarter.dataset.agentWorldStarter as AgentWorldStarterId | undefined;
        if (starterId && GRAPHYSX_AGENT_WORLD_STARTERS.some((starter) => starter.id === starterId)) {
          this.raceScene.loadAgentWorldStarter(starterId);
        }
        return;
      }

      const agentWorldAction = target.closest<HTMLButtonElement>("[data-agent-world-action]");
      if (agentWorldAction && this.state === "world-api-lab") {
        const action = agentWorldAction.dataset.agentWorldAction;
        if (action === "prefab-plaza") {
          this.buildAgentPrefabPlaza();
        } else if (action === "demo") {
          this.raceScene.loadAgentWorldDemo();
        } else if (action === "pause") {
          this.raceScene.pauseAgentWorld(!(this.raceScene.getAgentWorldState()?.paused ?? false));
        } else if (action === "step") {
          this.raceScene.stepAgentWorld(0.5);
        } else if (action === "undo") {
          this.raceScene.undoAgentWorld();
        } else if (action === "clear") {
          this.raceScene.clearAgentWorld();
        } else if (action === "save") {
          this.raceScene.saveAgentWorld("studio-snapshot");
        }
        return;
      }

      const natureStudy = target.closest<HTMLButtonElement>("[data-nature-study]");
      if (natureStudy && this.state === "nature-lab") {
        const study = natureStudy.dataset.natureStudy as NatureLabStudyId | undefined;
        if (study && this.raceScene.setNatureLabStudy(study)) {
          this.setState("nature-lab");
        }
        return;
      }

      const natureLesson = target.closest<HTMLButtonElement>("[data-nature-lesson]");
      if (natureLesson && this.state === "nature-lab") {
        const lesson = natureLesson.dataset.natureLesson as NatureLabLessonId | undefined;
        if (lesson && this.raceScene.setNatureLabLesson(lesson)) {
          this.setState("nature-lab");
        }
        return;
      }

      const recipeButton = target.closest<HTMLButtonElement>("[data-world-recipe]");
      if (recipeButton && this.state === "nature-lab") {
        const recipe = findWorldRecipe(recipeButton.dataset.worldRecipe ?? "");
        if (recipe && this.raceScene.loadNatureLabRecipe(recipe)) {
          this.setState("nature-lab");
        }
        return;
      }

      const natureLayer = target.closest<HTMLButtonElement>("[data-nature-layer]");
      if (natureLayer && this.state === "nature-lab") {
        const layer = natureLayer.dataset.natureLayer as NatureLabLayer | undefined;
        const currentState = this.raceScene.getNatureLabState();
        if (layer && currentState) {
          this.raceScene.setNatureLabLayer(layer, !currentState.layers[layer]);
          this.setState("nature-lab");
        }
        return;
      }

      const natureAction = target.closest<HTMLButtonElement>("[data-nature-action]");
      if (natureAction && this.state === "nature-lab") {
        const action = natureAction.dataset.natureAction;
        if (action === "trails") {
          this.raceScene.toggleNatureLabTrails();
        } else if (action === "pause") {
          this.raceScene.setNatureLabPaused(!(this.raceScene.getNatureLabState()?.paused ?? false));
        } else if (action === "step") {
          this.raceScene.stepNatureLab(0.5);
        } else if (action === "experiment") {
          this.raceScene.performNatureLabAction();
        } else if (action === "reset") {
          this.raceScene.resetNatureLab();
        }
        this.setState("nature-lab");
        return;
      }

      const mathPreset = target.closest<HTMLButtonElement>("[data-math-preset]");
      if (mathPreset && this.state === "math-lab") {
        const preset = MATH_PRESETS[mathPreset.dataset.mathPreset ?? ""];
        if (preset) {
          this.mathParams = { ...preset };
          this.raceScene.setMathFormulaParams(this.mathParams);
          this.setState("math-lab");
        }
        return;
      }

      const formulaButton = target.closest<HTMLButtonElement>("[data-math-formula]");
      if (formulaButton && this.state === "math-lab") {
        const formula = formulaButton.dataset.mathFormula as MathFormulaParams["formula"] | undefined;
        if (formula) {
          this.mathParams = { ...this.mathParams, formula };
          this.raceScene.setMathFormulaParams(this.mathParams);
          this.setState("math-lab");
        }
        return;
      }

      const mathAction = target.closest<HTMLButtonElement>("[data-math-action]");
      if (mathAction && this.state === "math-lab") {
        if (mathAction.dataset.mathAction === "reset-camera") {
          this.raceScene.resetMathLabView();
          this.setState("math-lab");
        }
        return;
      }

      const cubxCube = target.closest<HTMLButtonElement>("[data-cubx-cube]");
      if (cubxCube && this.state === "cubx-lab") {
        this.raceScene.selectCubXCube(Number(cubxCube.dataset.cubxCube));
        return;
      }

      const cubxSun = target.closest<HTMLButtonElement>("[data-cubx-sun]");
      if (cubxSun && this.state === "cubx-lab") {
        this.raceScene.launchCubXSun();
        return;
      }

      const cubxSatellite = target.closest<HTMLButtonElement>("[data-cubx-satellite]");
      if (cubxSatellite && this.state === "cubx-lab") {
        const id = cubxSatellite.dataset.cubxSatellite as CubXSatelliteId | undefined;
        if (id) this.raceScene.activateCubXSatellite(id);
        return;
      }

      const cubxAction = target.closest<HTMLButtonElement>("[data-cubx-action]");
      if (cubxAction && this.state === "cubx-lab") {
        this.raceScene.activateCubXAction(Number(cubxAction.dataset.cubxAction));
        return;
      }

      const ballPresetButton = target.closest<HTMLButtonElement>("[data-ball-preset]");
      if (ballPresetButton && this.state === "cubx-lab") {
        const preset = ballPresetButton.dataset.ballPreset as BallPreset | undefined;
        if (preset === "fire" || preset === "classic2015" || preset === "revival") {
          this.raceScene.setBallPreset(preset);
          this.raceScene.activateCubXAction(preset === "fire" ? 0 : preset === "classic2015" ? 1 : 2);
        }
        return;
      }

      const cubxBack = target.closest<HTMLButtonElement>("[data-cubx-back]");
      if (cubxBack && this.state === "cubx-lab") {
        this.raceScene.closeCubXMenu();
        return;
      }

      const lineageClipButton = target.closest<HTMLButtonElement>("[data-cubx-lineage-clip]");
      if (lineageClipButton && this.state === "cubx-actor-lineage") {
        const family = lineageClipButton.dataset.cubxLineageClip as CubxActorClipFamily | undefined;
        const pairIndex = Number(lineageClipButton.dataset.cubxLineagePair ?? this.raceScene.getCubxActorLineageState()?.clip.pairIndex ?? 1) as CubxActorPairIndex;
        if (family) this.raceScene.setCubxActorLineageClip(family, pairIndex);
        this.setState("cubx-actor-lineage");
        return;
      }

      const lineageClickButton = target.closest<HTMLButtonElement>("[data-cubx-lineage-click]");
      if (lineageClickButton && this.state === "cubx-actor-lineage") {
        this.raceScene.selectCubxActorLineageClick(Number(lineageClickButton.dataset.cubxLineageClick) as CubxActorClickIndex);
        this.setState("cubx-actor-lineage");
        return;
      }

      const lineageActionButton = target.closest<HTMLButtonElement>("[data-cubx-lineage-action]");
      if (lineageActionButton && this.state === "cubx-actor-lineage") {
        const action = lineageActionButton.dataset.cubxLineageAction;
        const current = this.raceScene.getCubxActorLineageState();
        if (action === "play") this.raceScene.setCubxActorLineagePlaying(!(current?.clip.playing ?? false));
        if (action === "reverse") this.raceScene.setCubxActorLineageDirection((current?.clip.direction ?? 1) === 1 ? -1 : 1 as CubxActorPlaybackDirection);
        if (action === "step-back") this.raceScene.stepCubxActorLineageFrames(-1);
        if (action === "step-forward") this.raceScene.stepCubxActorLineageFrames(1);
        if (action === "buttons") this.raceScene.setCubxActorLineageButtonsVisible(!(current?.geometry.buttonsVisible ?? true));
        if (action === "colors") this.raceScene.setCubxActorLineageDiagnosticColors(!(current?.geometry.diagnosticColors ?? true));
        this.setState("cubx-actor-lineage");
        return;
      }

      const editorLevelButton = target.closest<HTMLButtonElement>("[data-editor-level-id]");
      if (editorLevelButton && this.state === "map-editor") {
        const id = editorLevelButton.dataset.editorLevelId;
        if (id) this.openAgentLevel(id);
        return;
      }

      const newEditorLevelButton = target.closest<HTMLButtonElement>("[data-editor-new-level]");
      if (newEditorLevelButton && this.state === "map-editor") {
        let suffix = this.levelLibrary.list().length + 1;
        while (this.levelLibrary.get(`level-${suffix}`)) suffix += 1;
        this.createAgentLevel({ id: `level-${suffix}`, label: `Level ${suffix}`, width: 16, height: 16 });
        return;
      }

      const playButton = target.closest<HTMLButtonElement>("[data-editor-play]");
      if (playButton && this.state === "map-editor") {
        this.gameplayOrigin = "map-editor";
        const active = this.levelLibrary.get(this.activeEditorLevelId);
        this.raceScene.setCustomRace(draftToRaceDefinition(this.getMapEditorDraft(), active?.label, active?.id));
        this.raceScene.setPreviewMode("race-preview");
        if (this.raceScene.startRace()) {
          this.setState("gameplay");
          this.scrollPanelToTop();
        }
        return;
      }

      const resetButton = target.closest<HTMLButtonElement>("[data-editor-reset]");
      if (resetButton && this.state === "map-editor") {
        const active = this.levelLibrary.get(this.activeEditorLevelId);
        if (active) {
          const result = this.levelLibrary.replace(active.id, createEditorLevelDefinition(active.id, active.label, createInitialEditorTiles()));
          this.afterAgentLevelMutation(result, true);
        }
        return;
      }

      const editorTool = target.closest<HTMLButtonElement>("[data-editor-tool]");
      if (editorTool && this.state === "map-editor") {
        this.selectedEditorTile = (editorTool.dataset.editorTool as MapEditorTile | undefined) ?? this.selectedEditorTile;
        this.setState("map-editor");
        return;
      }

      const editorCell = target.closest<HTMLButtonElement>("[data-editor-cell]");
      if (editorCell && this.state === "map-editor") {
        const index = Number(editorCell.dataset.editorCell);
        if (Number.isInteger(index) && index >= 0 && index < this.editorTiles.length) {
          this.paintEditorTile(index);
          this.raceScene.setMapEditorDraft(this.getMapEditorDraft());
          this.setState("map-editor");
        }
        return;
      }

      const button = target.closest<HTMLButtonElement>("[data-race-id]");
      if (!button || (this.state !== "race-select" && this.state !== "world-select")) {
        return;
      }
      const selectionState = this.state;
      this.raceScene.setRace(button.dataset.raceId ?? RACE_DEFINITIONS[0].id);
      this.raceScene.setPreviewMode("race-preview");
      this.raceScene.setMenuMode(true);
      this.setState(selectionState);
      this.scrollPanelToTop();
    });

    this.raceScene.setAccent(new Color("#78f0d0"));
    this.raceScene.setMapEditorDraft(this.getMapEditorDraft());
    this.raceScene.setPreviewMode("menu");
    this.raceScene.setMenuMode(true);
    this.selectRecommendedRace();
    this.showHome();
    this.installDebugHooks();

    window.addEventListener("keydown", (event) => {
      const eventTarget = event.target;
      const enterBelongsToControl =
        event.code === "Enter" &&
        eventTarget instanceof HTMLElement &&
        Boolean(eventTarget.closest("button, input, select, textarea, a"));
      if (enterBelongsToControl) {
        return;
      }
      if (event.code === "Enter" && this.state === "home") {
        this.showRaceSelect();
      }
      if (event.code === "Enter" && this.state === "race-select") {
        this.startCurrentRace();
      }
      if (event.code === "Enter" && this.state === "world-select") {
        this.startCurrentRace();
      }
      if (event.code === "Enter" && this.state === "after-race") {
        if (this.gameplayOrigin !== "map-editor") {
          this.selectNextRace();
        }
        this.showSelectionForGameplayOrigin();
      }
      if (event.code === "Enter" && isArchiveState(this.state)) {
        this.openArchiveMode(this.getNextArchiveMode());
      }
      if (
        event.code === "KeyR" &&
        this.state === "gameplay" &&
        this.raceScene.getRace().id !== "flightx-pipe" &&
        !event.repeat
      ) {
        this.startCurrentRace();
      }
      if (event.code === "KeyP" && this.state === "gameplay" && !event.repeat) {
        this.setGameplayPaused(!this.raceScene.isRacePaused());
      }
      if (event.code === "Escape" && (this.state === "race-select" || this.state === "world-select")) {
        this.showHome();
      }
      if (event.code === "Escape" && this.state === "after-race") {
        this.showSelectionForGameplayOrigin();
      }
      if (event.code === "Escape" && this.state === "gameplay") {
        if (this.gameplayOrigin === "map-editor") {
          this.openArchiveMode("map-editor");
        } else if (this.gameplayOrigin === "world-select") {
          this.showWorldSelect();
        } else {
          this.showRaceSelect();
        }
      }
      if (event.code === "Escape" && isArchiveState(this.state)) {
        this.showHome();
      }
    });

    window.setInterval(() => {
      if (this.state === "gameplay") {
        this.renderGameplayHud(this.raceScene.getSnapshot());
      } else if (this.state === "nature-lab") {
        this.renderNatureLiveHud(this.raceScene.getNatureLabState());
      } else if (this.state === "world-api-lab") {
        this.renderAgentWorldLiveHud(this.raceScene.getAgentWorldState());
      } else if (this.state === "input-device-lab") {
        this.renderDeviceInputLiveHud();
      }
    }, 100);
  }

  private setGameplayPaused(paused: boolean): void {
    if (this.state !== "gameplay") return;
    if (!this.raceScene.setRacePaused(paused)) return;
    this.updatePauseUi();
    this.renderGameplayHud(this.raceScene.getSnapshot());
  }

  private updatePauseUi(): void {
    const paused = this.state === "gameplay" && this.raceScene.isRacePaused();
    this.pauseBanner.hidden = !paused;
    this.gameControls.classList.toggle("is-paused", paused);
    const pauseButton = this.gameControls.querySelector<HTMLButtonElement>("[data-game-action=\"pause\"]");
    if (pauseButton) pauseButton.textContent = paused ? "RESUME" : "PAUSE";
  }

  private renderNatureLiveHud(state: NatureLabState | null): void {
    if (!state) return;
    const summary = this.stats.querySelector<HTMLElement>("[data-nature-live-summary]");
    if (summary) {
      summary.textContent = `${state.paused ? "paused" : "running"} · ${state.population} visible · ${state.elapsedSeconds.toFixed(1)} s`;
    }
    const phase = this.stats.querySelector<HTMLElement>("[data-nature-live-phase]");
    if (phase) {
      phase.textContent = state.demonstration.phase;
    }
  }

  private renderAgentWorldLiveHud(state: AgentWorldState | null): void {
    if (!state) return;
    const summary = this.stats.querySelector<HTMLElement>("[data-agent-world-live]");
    if (summary) {
      summary.textContent = `${state.paused ? "paused" : "running"} · ${state.entityCount} entities · ${state.elapsedSeconds.toFixed(1)} s`;
    }
  }

  private showHome(): void {
    this.raceScene.setPreviewMode("menu");
    this.raceScene.setMenuMode(true);
    this.setState("home");
    this.scrollPanelToTop();
  }

  private showRaceSelect(): void {
    if (!BALLZ_RACE_IDS.has(this.raceScene.getRace().id)) {
      this.raceScene.setRace(this.getRecommendedRace(BALLZ_RACES).id);
    }
    this.raceScene.setPreviewMode("race-preview");
    this.raceScene.setMenuMode(true);
    this.raceScene.resetRace();
    this.setState("race-select");
    this.scrollPanelToTop();
  }

  private showWorldSelect(): void {
    if (!RECOVERED_WORLD_IDS.has(this.raceScene.getRace().id)) {
      this.raceScene.setRace(this.getRecommendedRace(RECOVERED_WORLD_RACES).id);
    }
    this.raceScene.setPreviewMode("race-preview");
    this.raceScene.setMenuMode(true);
    this.raceScene.resetRace();
    this.setState("world-select");
    this.scrollPanelToTop();
  }

  private showSelectionForGameplayOrigin(): void {
    if (this.gameplayOrigin === "map-editor") {
      this.openArchiveMode("map-editor");
    } else if (this.gameplayOrigin === "world-select") {
      this.showWorldSelect();
    } else {
      this.showRaceSelect();
    }
  }

  private startCurrentRace(): void {
    if (this.state === "race-select") {
      this.gameplayOrigin = "race-select";
    } else if (this.state === "world-select") {
      this.gameplayOrigin = "world-select";
    }
    const loadState = this.raceScene.getRaceLoadState();
    if (loadState.error) {
      this.raceScene.retryCurrentRaceAssets();
      this.setState(this.gameplayOrigin === "world-select" ? "world-select" : "race-select");
      return;
    }
    this.raceScene.setPreviewMode("race-preview");
    if (this.raceScene.startRace()) {
      this.setState("gameplay");
      this.scrollPanelToTop();
    } else {
      this.raceScene.setMenuMode(true);
      this.setState(this.gameplayOrigin === "world-select" ? "world-select" : "race-select");
    }
  }

  private launchRaceFromCubX(raceId: string): void {
    if (raceId !== "flightx-pipe" || !RECOVERED_WORLD_IDS.has(raceId)) return;
    this.pendingCubXRaceId = raceId;
    this.gameplayOrigin = "world-select";
    this.raceScene.setRace(raceId);
    this.raceScene.setPreviewMode("race-preview");
    if (this.raceScene.startRace()) {
      this.pendingCubXRaceId = null;
      this.setState("gameplay");
      this.scrollPanelToTop();
      return;
    }
    this.raceScene.setMenuMode(true);
    this.setState("world-select");
  }

  private openArchiveMode(mode: ArchiveModeId): void {
    if (mode === "race") {
      this.showRaceSelect();
      return;
    }

    this.raceScene.setPreviewMode(mode as ArchivePreviewMode);
    this.raceScene.setMenuMode(true);
    this.setState(mode);
    this.scrollPanelToTop();
  }

  private scrollPanelToTop(): void {
    requestAnimationFrame(() => this.panel.scrollTo({ top: 0, behavior: "auto" }));
  }

  private getNextArchiveMode(): ArchiveAppState {
    const currentIndex = ARCHIVE_STATE_FLOW.indexOf(isArchiveState(this.state) ? this.state : "scene-lab");
    return ARCHIVE_STATE_FLOW[(currentIndex + 1) % ARCHIVE_STATE_FLOW.length];
  }

  private setState(state: AppState, snapshot?: RaceSnapshot): void {
    this.state = state;
    this.gameControls.hidden = state !== "gameplay";
    if (state !== "gameplay") this.raceScene.setRacePaused(false);
    this.updatePauseUi();

    if (state === "home") {
      this.primaryAction.disabled = false;
      this.secondaryAction.hidden = false;
      const recommended = this.getRecommendedRace(BALLZ_RACES);
      const completed = this.getCompletedCount(BALLZ_RACES);
      const totalScore = this.getCareerScore(BALLZ_RACES);
      this.title.textContent = "GRAPHYSX";
      this.body.textContent =
        "Choose a project family. Classic BallZ arenas, later BallZ concepts, standalone 3D environments, vehicles, CubZ, engine labs, Math Game, and editors are tracked by their original intent—not merely by which archive folder held them.";
      this.primaryAction.textContent = "Play BallZ";
      this.secondaryAction.textContent = "Engine & FX Lab";
      this.stats.className = "stats-grid home-grid";
      this.stats.innerHTML = [
        this.homeDestinations(),
        this.progressCard("BallZ Tour", completed, BALLZ_RACES.length, totalScore),
        this.progressCard(
          "Archive Concepts & Worlds",
          this.getCompletedCount(RECOVERED_WORLD_RACES),
          RECOVERED_WORLD_RACES.length,
          this.getCareerScore(RECOVERED_WORLD_RACES)
        ),
        this.statCard(
          "BallZ Next",
          `${escapeHtml(recommended.name)}<small>${escapeHtml(challengeFor(recommended).focus)}</small>`
        ),
      this.statCard("BallZ Controls", "WASD / arrows<small>camera-relative roll · drag to orbit · wheel zoom · Space jump</small>")
      ].join("");
      return;
    }

    if (state === "race-select") {
      this.secondaryAction.hidden = false;
      const race = this.raceScene.getRace();
      const loadState = this.raceScene.getRaceLoadState();
      const completed = this.getCompletedCount(BALLZ_RACES);
      this.title.textContent = "BALLZ TOUR";
      this.body.textContent =
        "Core BallZ races and the ZombieKiller branch live here. Recovered 3D worlds and the Impreza experiment now have their own menu instead of masquerading as BallZ Tour chapters.";
      this.primaryAction.disabled = !loadState.ready && !loadState.error;
      this.primaryAction.textContent = loadState.error
        ? "Retry Level Load"
        : loadState.ready
          ? `Start ${race.name}`
          : `Loading ${race.name}…`;
      this.secondaryAction.textContent = "Back Home";
      this.stats.className = "stats-grid tour-grid";
      this.stats.innerHTML = [
        this.challengeSpotlight(race, BALLZ_RACES, "BallZ challenge"),
        this.progressCard("BallZ Tour", completed, BALLZ_RACES.length, this.getCareerScore(BALLZ_RACES)),
        this.recoveredRaceRuleCard(),
        this.raceChooser(race, BALLZ_RACES, "BallZ Races — No Locks"),
        this.statCard("In-Race Controls", "Keyboard, touch, or gamepad<small>WASD / arrows · drag to orbit · wheel zoom · C reset camera · Space jump · Shift boost · R restart · Esc exit</small>")
      ].join("");
      return;
    }

    if (state === "world-select") {
      this.secondaryAction.hidden = false;
      const race = this.raceScene.getRace();
      const activeFamily = worldFamilyForRace(race);
      const activeCollection = WORLD_FAMILY_RACES[activeFamily];
      const loadState = this.raceScene.getRaceLoadState();
      this.title.textContent = "ARCHIVE FAMILY BROWSER";
      this.body.textContent =
        "Choose one archive family at a time. BallZ concepts, FlightX, and vehicle experiments keep separate progress and selectors; standalone rooms and discovery environments live outside this challenge browser.";
      this.primaryAction.disabled = !loadState.ready && !loadState.error;
      this.primaryAction.textContent = loadState.error
        ? "Retry Archive Load"
        : loadState.ready
          ? worldPrimaryAction(race)
          : `Loading ${race.name}…`;
      this.secondaryAction.textContent = "Back Home";
      this.stats.className = "stats-grid tour-grid";
      this.stats.innerHTML = [
        this.challengeSpotlight(race, activeCollection, worldCategoryLabel(race)),
        this.progressCard(
          worldFamilyTitle(activeFamily),
          this.getCompletedCount(activeCollection),
          activeCollection.length,
          this.getCareerScore(activeCollection)
        ),
        this.raceChooser(race, WORLD_FAMILY_RACES["ballz-concepts"], "BallZ Concepts", "Concept"),
        this.raceChooser(race, WORLD_FAMILY_RACES.flightx, "FlightX — Atmel/CubX", "Flight"),
        this.raceChooser(race, WORLD_FAMILY_RACES.vehicles, "Vehicle Experiments", "Vehicle"),
        this.raceChooser(race, WORLD_FAMILY_RACES.dominus, "Dominus — Modern Curated Visit", "Beyond"),
        this.worldArchiveBacklog(),
        this.statCard(
          "Category Note",
          "BallZ concepts, FlightX, vehicles, and discovery worlds are separate archive lines<small>Great Slide is the recovered BallZ 2011 Level0. FlightX owns pipe1 and the airplane. Piste Ovale owns the Impreza. Rooms, terrain scenes, and Dominus remain standalone environments.</small>"
        )
      ].join("");
      return;
    }

    if (state === "scene-index") {
      this.primaryAction.disabled = false;
      this.secondaryAction.hidden = false;
      this.title.textContent = "ARCHIVE SCENE INDEX";
      this.body.textContent =
        "Every distinct application screen, runtime scene class, authored level, environment document, vehicle scene, gameplay experiment, and rendering demo found in the audited archive—de-duplicated and checked against the running revival.";
      this.primaryAction.textContent = "Next Lab";
      this.secondaryAction.textContent = "Back Home";
      this.stats.className = "stats-grid scene-index-grid";
      this.stats.innerHTML = [this.sceneStatusSummary(), this.modeChooser("scene-index"), this.sceneCensus()].join("");
      return;
    }

    if (state === "scene-lab") {
      this.renderArchiveState(
        "Scene Lab",
        "Environment work from the old folders: skyboxes, heightmaps, atmosphere, water, and spline studies. FlightX and the authentic Room 2 shadow demo now live in dedicated modes.",
        "Next Lab",
        SCENE_RECOVERY_ITEMS,
        "scene-lab",
        [
          this.statCard("Preview", "SkyX terrain<small>heightmap material, water plane, sun/moon orbit</small>"),
          this.statCard("Spline Study", "Scene Lab path proxy<small>Media/Spline.xml remains a study here; the decoded airplane and pipe1 are playable in FlightX</small>"),
          this.statCard(
            "Sky Source Quality",
            "256–1024 px cube faces<small>original sharp pixels, anisotropy, and a wider camera lens reduce magnification; the blur pass has been removed</small>"
          )
        ]
      );
      return;
    }

    if (state === "nature-lab") {
      const natureState = this.raceScene.getNatureLabState();
      this.renderArchiveState(
        "Nature Lab",
        "A small-world engine for people and agents: choose a living study, tune its rules, reset the same seed, and read the active simulation as structured state.",
        "Next Lab",
        NATURE_RECOVERY_ITEMS,
        "nature-lab",
        [
          this.natureWorkbench(natureState),
          this.statCard(
            "Agent Surface",
            "deterministic seed + named parameters<small>render_game_to_text reports the study, population, generation, settings, and visible systems</small>"
          )
        ]
      );
      return;
    }

    if (state === "world-api-lab") {
      const agentState = this.raceScene.getAgentWorldState();
      this.renderArchiveState(
        "Agent World Studio",
        "The shared world-building side of GraphysX: people and agents compose the same attractive 3D scenes from typed entities, recovered models, splines, physics, or reusable prefabs without writing renderer code.",
        "Next Lab",
        [
          {
            label: "World API v2 Runtime",
            source: "src/agent-world-runtime.ts",
            status: "ported",
            detail: "Groups, primitives, three light types, recovered complex models, splines, rigid-body physics, hierarchy, behaviors, interactions, queries, and five reusable prefab recipes are live."
          },
          {
            label: "Agent Contract",
            source: "window.__GRAPHYSX__ · graphysx.agent-world/v2",
            status: "ported",
            detail: "Create, spawn, update, remove, transact, commit, observe, simulate, export, and persist through the API or the visible World Editor; both surfaces return the same revisions, receipts, and errors."
          },
          {
            label: "Safe Collaboration",
            source: "atomic rollback + actor intent + optimistic revision guard",
            status: "ported",
            detail: "A stale or invalid agent edit leaves the prior world intact; accepted changes record actor, intent, world, revision, command count, and simulation time."
          }
        ],
        "world-api-lab",
        [this.agentWorldWorkbench(agentState)]
      );
      return;
    }

    if (state === "skybox-selector") {
      const selector = this.raceScene.getSkyboxSelectorState();
      const phase = selector?.phase ?? "icons";
      const active = selector?.activeId ?? selector?.pendingId;
      const skyButtons = SKYBOX_SELECTOR_ENTRIES.map(
        (entry, index) => `<button class="race-card${active === entry.id ? " is-selected" : ""}" data-skybox-id="${entry.id}" ${selector?.loadStatus === "ready" && phase === "icons" ? "" : "disabled"}>
          <span class="race-step">${String(index + 1).padStart(2, "0")}</span><span class="race-name">${escapeHtml(entry.label)}</span><small>${escapeHtml(entry.archiveName)} · click cube / zoom / panorama</small>
        </button>`
      ).join("");
      this.renderArchiveState(
        "Skybox Selector",
        "The actual CLSkyboxSelectScene flow: five textured cubes rotate on their archived ring. Pick one, the camera chases into it, then the selected sky becomes a panorama orbit.",
        "Next Lab",
        [
          {
            label: "Five-Cube Ring",
            source: "CubXSolution/3DScenes.cpp; CLSkybox.cpp",
            status: selector?.loadStatus === "ready" ? "ported" : "preview",
            detail: "ClearBlue, SkyX, ClearNight, LostValley, and Winter use the original cube faces, 50-unit icons, radius 125, and 50°/s rotation."
          },
          {
            label: "Selection Transition",
            source: "CLSkyboxSelectScene::StartZoomCamEffect / UpdateScene",
            status: "preview",
            detail: "Click stops the icon animation, runs the chase-camera beat, enables the chosen day sky, and begins the radius-500 panorama orbit; collision timing is approximated by a short deterministic zoom."
          }
        ],
        "skybox-selector",
        [
          `<section class="wide-card"><span class="stat-label">Archived Sky Cubes</span><div class="race-list">${skyButtons}<button class="race-card" data-skybox-reset><span>Return To Cubes</span><small>leave panorama and restore the archived selector camera</small></button></div></section>`,
          this.statCard(
            "Selector State",
            `${selector?.loadStatus ?? "loading"} · ${phase}<small>${active ? `active ${escapeHtml(active)}` : "no sky selected"} · camera FOV ${selector?.camera.fovDegrees ?? 45}°</small>`
          ),
          this.statCard("Archive Geometry", "5 × 50-unit cubes · radius 125<small>camera (150, 200, 500) · panorama radius 500</small>")
        ]
      );
      return;
    }

    if (state === "car-selector") {
      const selector = this.raceScene.getCarSelectorState();
      const carY = selector?.car.currentPosition[1] ?? 100;
      this.renderArchiveState(
        "Car Selector — Impreza Preview",
        "The recovered CLCarSelectScene is an authentic one-car preview, not a fabricated chooser. Its archived click callback was empty: this mode restores the terrain, water, camera, gravity drop, free camera, and Impreza without inventing a confirmation action.",
        "Next Lab",
        [
          {
            label: "Impreza Preview",
            source: "CubXSolution/3DScenes.cpp; Vehicule.cpp; cars catalog",
            status: selector?.loadStatus === "ready" ? "ported" : "preview",
            detail: "The one archived Impreza uses its chassis, windows, undercarriage, and four wheel meshes at the source-derived radius-30 spawn."
          },
          {
            label: "Terrain + Water",
            source: "Media/Heightmaps/height.jpg; ground.jpg; distortiontexture.dds",
            status: selector?.terrain.ready ? "ported" : "preview",
            detail: "The 100×100 heightmap landscape and water-at-y=2 composition are live; the surviving code does not preserve an exact terrain-height scale."
          },
          {
            label: "Empty Selection Callback",
            source: "CLCarSelectScene::MeshClickedAction",
            status: "preview",
            detail: "The source method is empty. Clicking the car may inspect it, but cannot honestly claim an archived selection/confirm flow."
          }
        ],
        "car-selector",
        [
          `<section class="wide-card"><span class="stat-label">Archive Camera Controls</span><div class="race-list"><button class="race-card" data-car-selector-reset><span>Reset Preview</span><small>camera (75, 100, 50) · car (30, 100, 0)</small></button></div></section>`,
          this.statCard("Environment", `${selector?.loadStatus ?? "loading"}<small>terrain ${selector?.terrain.ready ? "ready" : "loading"} · water y=2 · car y=${carY.toFixed(2)}</small>`),
          this.statCard("Free Camera", "W/S walk · A/D strafe · Q/E raise<small>drag to turn · click the Impreza to inspect · Esc exits</small>"),
          this.statCard("Honest Scope", "1 Impreza · no commit action<small>the revival preserves the archive's unfinished boundary</small>")
        ]
      );
      return;
    }

    if (state === "threejs-playground") {
      const playground = this.raceScene.getThreejsPlaygroundState();
      const sourceReady = playground?.ready ?? false;
      const gui = playground?.gui;
      const slider = (parameter: ThreejsPlaygroundParameter, label: string, value: number, min: number, max: number) =>
        `<label class="archive-gui-slider"><span>${escapeHtml(label)} <strong data-playground-value="${parameter}">${value.toFixed(0)}</strong></span><input type="range" min="${min}" max="${max}" step="1" value="${value}" data-playground-param="${parameter}"></label>`;
      const cameraGui = gui?.camera ?? { x: 0, y: 0, z: 0, min: -1000, max: 1000 };
      const cubeGui = gui?.cube ?? { speedX: 2000, speedY: 1000, min: 1, max: 3600 };
      const planeGui = gui?.plane ?? { width: 10, height: 10, x: 0, y: 0, z: 0, sizeMin: 1, sizeMax: 100, positionMin: -100, positionMax: 100 };
      const planetsGui = gui?.planets ?? [
        { label: "Earth" as const, speedX: 2000, speedY: 1000, min: 1, max: 3600 },
        { label: "Mars" as const, speedX: 2000, speedY: 1000, min: 1, max: 3600 },
        { label: "Moon" as const, speedX: 2000, speedY: 1000, min: 1, max: 3600 }
      ];
      const planetGuiHtml = planetsGui.map((planet) => {
        const id = planet.label.toLowerCase() as "earth" | "mars" | "moon";
        return `<fieldset class="archive-gui-folder"><legend>${planet.label}</legend>${slider(`${id}.speedX`, "speedX", planet.speedX, planet.min, planet.max)}${slider(`${id}.speedY`, "speedY", planet.speedY, planet.min, planet.max)}</fieldset>`;
      }).join("");
      this.renderArchiveState(
        "Three.js Playground — Recovered Browser World",
        "This is the complete authored SBQC browser composition, not a generic engine-feature collage: the Asteroids sky, airplane orbit, morph shaders, red procedural terrain, Earth spheres, animated spotlight, textured cube and blue line run together as one source-backed visit.",
        "Next Lab",
        [
          {
            label: "Exact Runtime Assets",
            source: "SBQC/public/Projects/3D Playground",
            status: sourceReady ? "ported" : "preview",
            detail: "Nine byte-identical files are hash-locked: Airplane.glb, the Earth/cube textures, and all six Asteroids sky faces. The hash-identical iGrow copy remains one alias, not another scene."
          },
          {
            label: "Authored Composition",
            source: "main.js; sceneManager.js; scene/*.js; index.html shaders",
            status: sourceReady ? "ported" : "preview",
            detail: "One orbiting airplane, three exact shader-deformed icospheres, three Earth-textured bodies, 10×10 raycastable terrain, rotating cube, three-point line, hemisphere light and animated spotlight run together."
          },
          {
            label: "Controls + FPS Restored",
            source: "dat.gui.min.js; sceneManager.js; planeZ.js; testCube.js; earth.js; index.html",
            status: sourceReady ? "ported" : "preview",
            detail: "All 16 source GUI controllers now drive the live camera, cube, terrain and three planets with their exact defaults/ranges. The original FPS value, progress scale and three color thresholds are live telemetry."
          }
        ],
        "threejs-playground",
        [
          `<section class="wide-card"><span class="stat-label">Inspection Camera</span><div class="race-list"><button class="race-card" data-playground-action="left"><span>Orbit Left</span><small>A or drag</small></button><button class="race-card" data-playground-action="right"><span>Orbit Right</span><small>D or drag</small></button><button class="race-card" data-playground-action="reset"><span>Reset Composition</span><small>source animation time + camera</small></button></div></section>`,
          `<section class="wide-card"><div class="archive-gui-heading"><span><span class="stat-label">World · Restored dat.GUI</span><strong>${gui?.controllerCount ?? 16} live controllers</strong></span><span class="archive-fps" data-fps-band="${playground?.fps.band ?? "red"}"><b>${escapeHtml(playground?.fps.label ?? "0")}</b><progress value="${playground?.fps.value ?? 0}" min="0" max="100"></progress></span></div><div class="archive-gui-grid"><fieldset class="archive-gui-folder"><legend>Camera</legend>${slider("camera.x", "x", cameraGui.x, cameraGui.min, cameraGui.max)}${slider("camera.y", "y", cameraGui.y, cameraGui.min, cameraGui.max)}${slider("camera.z", "z", cameraGui.z, cameraGui.min, cameraGui.max)}</fieldset><fieldset class="archive-gui-folder"><legend>Cube</legend>${slider("cube.speedX", "speedX", cubeGui.speedX, cubeGui.min, cubeGui.max)}${slider("cube.speedY", "speedY", cubeGui.speedY, cubeGui.min, cubeGui.max)}</fieldset><fieldset class="archive-gui-folder"><legend>Plane</legend>${slider("plane.width", "width", planeGui.width, planeGui.sizeMin, planeGui.sizeMax)}${slider("plane.height", "height", planeGui.height, planeGui.sizeMin, planeGui.sizeMax)}${slider("plane.x", "x", planeGui.x, planeGui.positionMin, planeGui.positionMax)}${slider("plane.y", "y", planeGui.y, planeGui.positionMin, planeGui.positionMax)}${slider("plane.z", "z", planeGui.z, planeGui.positionMin, planeGui.positionMax)}</fieldset>${planetGuiHtml}</div><small>Native controls replace the archived library chrome, while preserving its World/Camera/Cube/Plane/Planets hierarchy, values, bounds and behavior.</small></section>`,
          this.statCard("Source Load", `${escapeHtml(playground?.loadStatus ?? "loading")}<small>${playground?.source.assetCount ?? 9} exact files · ${(playground?.source.totalBytes ?? 3712102).toLocaleString()} bytes</small>`),
          this.statCard("Live Composition", `${playground?.morphSpheres.count ?? 3} morphs · ${playground?.earthSpheres.count ?? 3} planets<small>airplane ${playground?.airplane.loaded ? "ready" : "loading"} · sky ${playground?.sky.ready ? "ready" : "loading"} · cube + line</small>`),
          this.statCard("Procedural Terrain", `${playground?.terrain.vertexCount ?? 121} vertices · ${playground?.terrain.width ?? 10}×${playground?.terrain.height ?? 10}<small>raycast ${playground?.terrain.raycastEnabled ? "enabled" : "loading"} · ${playground?.terrain.raycastTestCount ?? 0} click tests</small>`),
          this.statCard("Animated Light", `${(playground?.animatedLight.intensity ?? 0).toFixed(1)} intensity<small>source 240-frame period · amplitude 75 · offset 73</small>`)
        ]
      );
      return;
    }

    if (state === "ballz-blender-level1") {
      const level = this.raceScene.getBallzBlenderLevel1State();
      this.renderArchiveState(
        "BallZ / Blender Level 1 — Complete Geometry Visit",
        "The best surviving 2017 Blender scene is restored at its actual scope: one authored level mesh, its saved camera, point light and material. It is deliberately not turned into another race because no BallZ host, spawn, physics, controls, checkpoints, rules or objective survives.",
        "Next Archive",
        [
          {
            label: "Best Revision Geometry",
            source: "blenderModel/Levels/Level1.blend",
            status: level?.ready ? "ported" : "preview",
            detail: "The exact 356-vertex / 354-polygon / one-material composition is distinct from BallZ18 L1_floor and is loaded from a deterministic Blender 2.79 FBX export."
          },
          {
            label: "Authored Camera + Light",
            source: "Level1.blend Camera; Lamp",
            status: level?.ready ? "ported" : "preview",
            detail: "Source Camera applies the saved 35 mm camera; the authored point light remains in the composition. Overview is a disclosed optional inspection camera."
          },
          {
            label: "Correct Completion Boundary",
            source: "host/project audit",
            status: "ported",
            detail: "This scene is RESTORED as the complete authored geometry visit that survives. No race behavior is inferred from its folder name or borrowed from BallZ18."
          }
        ],
        "ballz-blender-level1",
        [
          `<section class="wide-card"><span class="stat-label">Visit Camera</span><div class="race-list"><button class="race-card${level?.camera.profile === "source" ? " is-selected" : ""}" data-blender-level-action="source"><span>Source Camera</span><small>saved Blender 35 mm evidence view</small></button><button class="race-card${level?.camera.profile === "overview" ? " is-selected" : ""}" data-blender-level-action="overview"><span>Overview</span><small>default disclosed inspection orbit</small></button><button class="race-card" data-blender-level-action="left"><span>Orbit Left</span><small>A or drag switches to overview</small></button><button class="race-card" data-blender-level-action="right"><span>Orbit Right</span><small>D or drag switches to overview</small></button><button class="race-card" data-blender-level-action="reset"><span>Reset Visit</span><small>restore readable overview</small></button></div></section>`,
          this.statCard("Restoration", `${escapeHtml(level?.restorationStatus ?? "RESTORED")} · ${escapeHtml(level?.loadStatus ?? "loading")}<small>complete best-surviving authored scope</small>`),
          this.statCard("Source Mesh", `${level?.source.authored.vertices ?? 356} vertices · ${level?.source.authored.polygons ?? 354} polygons<small>${level?.source.authored.materials ?? 1} material · ${level?.source.authored.cameras ?? 1} camera · ${level?.source.authored.lights ?? 1} light</small>`),
          this.statCard("Source Size", `${(level?.source.authored.dimensions ?? [47.121994, 39.944572, 8.414539]).map((value) => value.toFixed(2)).join(" × ")}<small>exact Blender-unit dimensions</small>`),
          this.statCard("Runtime Export", `${level?.source.browserFbx.bytes.toLocaleString() ?? "234,476"} bytes<small>source SHA ${level?.source.blend.sha256.slice(0, 12) ?? "0AA62FF04FA0"}…</small>`)
        ]
      );
      return;
    }

    if (state === "maison-explorer") {
      const maison = this.raceScene.getMaisonExplorerState();
      const active = maison?.subspaces.find((subspace) => subspace.id === maison.activeSubspace);
      const subspaceButtons = (maison?.subspaces ?? [
        { id: "house", label: "House", ready: false, visible: true },
        { id: "kitchen", label: "Kitchen", ready: false, visible: false }
      ]).map((subspace) => `<button class="race-card${subspace.id === maison?.activeSubspace ? " is-selected" : ""}" data-maison-subspace="${subspace.id}"><span>${escapeHtml(subspace.label)}</span><small>${"source" in subspace ? `${subspace.source.authored.objects} objects · ${subspace.source.authored.meshes} meshes` : "loading source composition"}</small></button>`).join("");
      this.renderArchiveState(
        "Maison Explorer — House + Kitchen",
        "The two best surviving Blender compositions now form one explorer with source-separated subspaces. House and Kitchen keep every exported mesh, hierarchy empty, camera and light; they are not guessed into one combined floorplan.",
        "Next Archive",
        [
          {
            label: "House Composition",
            source: "blenderModel/Maison/maison.blend",
            status: maison?.ready ? "ported" : "preview",
            detail: "31 authored objects: 24 meshes, one saved camera and six lights across the multi-room shell and doors."
          },
          {
            label: "Kitchen Composition",
            source: "blenderModel/Maison/Cuisine.blend",
            status: maison?.ready ? "ported" : "preview",
            detail: "87 authored objects: 76 meshes, seven hierarchy empties, one saved camera, three lights and all cabinet/counter/drawer/handle/appliance components."
          },
          {
            label: "Missing Reference Kept Honest",
            source: "Cuisine.blend image datablock",
            status: "ported",
            detail: "One unpacked Desktop JPG is absent and contains no embedded pixels. The saved diffuse-color material remains; no unrelated photograph is substituted."
          }
        ],
        "maison-explorer",
        [
          `<section class="wide-card"><span class="stat-label">Explorer Subspace</span><div class="race-list">${subspaceButtons}</div></section>`,
          `<section class="wide-card"><span class="stat-label">Camera</span><div class="race-list"><button class="race-card${maison?.camera.profile === "source" ? " is-selected" : ""}" data-maison-camera="source"><span>Source Camera</span><small>saved evidence view for active subspace</small></button><button class="race-card${maison?.camera.profile === "overview" ? " is-selected" : ""}" data-maison-camera="overview"><span>Overview</span><small>default disclosed inspection orbit</small></button><button class="race-card" data-maison-action="left"><span>Orbit Left</span><small>A or drag</small></button><button class="race-card" data-maison-action="right"><span>Orbit Right</span><small>D or drag</small></button><button class="race-card" data-maison-action="reset"><span>Reset View</span><small>readable active overview</small></button></div></section>`,
          this.statCard("Restoration", `${escapeHtml(maison?.restorationStatus ?? "RESTORED")} · ${escapeHtml(maison?.loadStatus ?? "loading")}<small>complete best-surviving authored scope</small>`),
          this.statCard("Active Subspace", `${escapeHtml(active?.label ?? "House")}<small>${active ? `${active.source.authored.objects} objects · ${active.source.authored.vertices.toLocaleString()} source vertices · ${active.source.authored.polygons.toLocaleString()} polygons` : "loading exact composition"}</small>`),
          this.statCard("Source Lights", `${active?.source.authored.lights ?? 0}<small>plus saved 35 mm camera · neutral inspection fill disclosed</small>`)
        ]
      );
      return;
    }

    if (state === "arena-archive") {
      const arena = this.raceScene.getArenaArchiveState();
      this.renderArchiveState(
        "Unity Arena Archive — Complete Authored Scene",
        "This small 2017 Unity project is restored at its surviving scope: one authored octagonal arena mesh, its hand-painted atlas and Standard material, exact object transform, source camera and directional light. The archive contains no scripts, so no game rules are invented.",
        "Next Archive",
        [
          {
            label: "Exact Arena Geometry",
            source: "Unity Projects/Arena/Assets/Models/Arena.obj",
            status: arena?.loadStatus === "ready" ? "ported" : "preview",
            detail: "The byte-identical Blender 2.78 OBJ contains one 48-vertex / 44-face octagonal arena. Its Unity scene transform is preserved rather than centered or remodeled."
          },
          {
            label: "Hand-Painted Atlas + Material",
            source: "Textures/arena.png; Materials/arena.mat",
            status: arena?.runtime.material.atlasLoaded ? "ported" : "preview",
            detail: "The exact 1024×1024 atlas and Unity Standard values—white tint, metallic 0 and smoothness 0.5—are bound to the source UVs."
          },
          {
            label: "Complete Surviving Boundary",
            source: "Arena.unity project audit",
            status: "ported",
            detail: "The saved 60° camera and directional-light orientation are available. No MonoBehaviour, input, physics, objective or other authored scene exists in this project."
          }
        ],
        "arena-archive",
        [
          `<section class="wide-card"><span class="stat-label">Visit Camera</span><div class="race-list"><button class="race-card${arena?.camera.profile === "source" ? " is-selected" : ""}" data-arena-camera="source"><span>Source Camera</span><small>exact Unity position, rotation and 60° FOV</small></button><button class="race-card${arena?.camera.profile === "overview" ? " is-selected" : ""}" data-arena-camera="overview"><span>Overview</span><small>default disclosed inspection orbit</small></button><button class="race-card" data-arena-action="left"><span>Orbit Left</span><small>A or drag</small></button><button class="race-card" data-arena-action="right"><span>Orbit Right</span><small>D or drag</small></button><button class="race-card" data-arena-action="reset"><span>Reset View</span><small>restore readable overview</small></button></div></section>`,
          this.statCard("Restoration", `${escapeHtml(arena?.restorationStatus ?? "RESTORED")} · ${escapeHtml(arena?.loadStatus ?? "loading")}<small>complete surviving authored scope</small>`),
          this.statCard("Source Geometry", `${arena?.source.authored.vertices ?? 48} vertices · ${arena?.source.authored.faces ?? 44} faces<small>${(arena?.source.authored.dimensions ?? [40, 2, 40]).join(" × ")} source units</small>`),
          this.statCard("Runtime", `${arena?.runtime.meshes ?? 0} mesh · ${arena?.runtime.triangles ?? 0} triangles<small>atlas ${arena?.runtime.material.atlasLoaded ? "ready" : "loading"} · exact UVs</small>`),
          this.statCard("Exact Assets", `${((arena?.source.obj.bytes ?? 6417) + (arena?.source.atlas.bytes ?? 532134) + (arena?.source.material.bytes ?? 2048)).toLocaleString()} bytes<small>OBJ + atlas + Unity material are hash-locked</small>`)
        ]
      );
      return;
    }

    if (state === "common-room-lab") {
      const room2State = this.raceScene.getCommonRoomEnvironmentState();
      const archiveState = this.raceScene.getCommonArchiveEnvironmentState();
      const selection = this.raceScene.getCommonEnvironmentSelection();
      const isRoom2 = selection === "room2-shadow";
      const selectedReady = isRoom2 ? room2State?.ready : archiveState?.ready;
      const selectedLoadStatus = isRoom2 ? room2State?.loadStatus : archiveState?.loadStatus;
      const selectedLoadError = isRoom2 ? room2State?.loadError : archiveState?.loadError;
      const loadSummary = selectedReady
        ? "Ready — exact archived geometry and DDS dependencies loaded"
        : selectedLoadStatus === "error"
          ? `Texture load error: ${escapeHtml(selectedLoadError ?? "unknown error")}`
          : "Loading decoded geometry and archived DDS maps…";
      const angleRadians = isRoom2 ? room2State?.orbitAngleRadians ?? 0 : archiveState?.orbitAngleRadians ?? 0;
      const angle = `${MathUtils.radToDeg(angleRadians).toFixed(1)}°`;
      const selectedSource = isRoom2 ? "common/room2.tvm + #23 HLSL assembly" : archiveState?.source ?? "common/room.tvm";
      const selectedSummary = isRoom2
        ? "Authored Room 2 shadow-mapping assembly"
        : selection === "room1"
          ? `${archiveState?.geometry.vertices ?? 180} vertices · ${archiveState?.geometry.triangles ?? 250} triangles · inferred visit camera/light`
          : `${archiveState?.geometry.vertices ?? 726} vertices · ${archiveState?.geometry.triangles ?? 1200} triangles · recovered skydome component, not a separate scene`;
      this.renderArchiveState(
        "Standalone 3D Environments — Common Archive",
        "Room 1, the separate sky.tvm component, and Room 2's evidenced HLSL assembly are kept outside BallZ progression. Room 1 and sky.tvm have exact geometry/assets but no surviving authored host scene, so their visit cameras and lighting stay explicitly labeled reconstruction choices.",
        "Next Lab",
        [
          {
            label: "Common Room 1 Shell",
            source: "common/room.tvm; tv3dlogo_d.dds; tv3dlogo_n.dds",
            status: archiveState?.ready ? "ported" : "preview",
            detail: "Exact inward 25-unit room shell: 180 vertices, 250 triangles, indexed normals/UVs, source handedness, and embedded logo diffuse/normal material. No authored assembly survives."
          },
          {
            label: "sky.tvm Environment Component",
            source: "common/sky.tvm; mid_day/top_pole/bottom_pole.dds",
            status: archiveState?.ready ? "ported" : "preview",
            detail: "Exact inward skydome with 726 vertices, 1,200 triangles, four side groups and two pole caps. Audit found no code treating it as its own scene."
          },
          {
            label: "Room 2 Indexed Geometry",
            source: "common/room2.tvm",
            status: "ported",
            detail: "105 archived vertices and 56 triangles retain their indexed positions, normals, UVs, material assignment, position, and scale."
          },
          {
            label: "Logo Bump Material",
            source: "common/tv3dlogo_d.dds; common/tv3dlogo_n.dds",
            status: room2State?.ready ? "ported" : "preview",
            detail: "The original 512px diffuse and tangent-space normal DDS maps load directly with repeat wrapping and their archived mipmaps."
          },
          {
            label: "Point Shadow Assembly",
            source: "#23 HLSL_Shadow_Mapping/main.cpp; meshlight.shade; meshdeep.shade",
            status: "preview",
            detail: "Archived teapot, light marker, point-light position, 1024 cube shadow, black background, and orbit composition are live; exact parallax/specular shader math remains."
          }
        ],
        "common-room-lab",
        [
          `<section class="wide-card"><span class="stat-label">Choose Standalone Environment</span><div class="race-list">
            <button class="race-card${selection === "room1" ? " is-selected" : ""}" data-common-space="room1"><span>Common Room 1</span><small>exact shell · inferred visit presentation</small></button>
            <button class="race-card${selection === "sky-component" ? " is-selected" : ""}" data-common-space="sky-component"><span>sky.tvm Component</span><small>exact skydome diagnostic · not counted as a standalone scene</small></button>
            <button class="race-card${selection === "room2-shadow" ? " is-selected" : ""}" data-common-space="room2-shadow"><span>Room 2 Shadow Lab</span><small>authored #23 HLSL assembly evidence</small></button>
          </div></section>`,
          `<section class="wide-card"><span class="stat-label">Local Environment Controls</span><div class="race-list">
            <button class="race-card" data-room-orbit="left"><span>Orbit Left</span><small>A · hold for continuous orbit</small></button>
            <button class="race-card" data-room-orbit="right"><span>Orbit Right</span><small>D · hold for continuous orbit</small></button>
            <button class="race-card" data-room-orbit="reset"><span>Reset View</span><small>restore the archived starting angle</small></button>
          </div></section>`,
          this.statCard("Environment State", `${loadSummary}<small>orbit ${angle} · ${escapeHtml(selectedSource)}</small>`),
          this.statCard("Evidence Boundary", `${escapeHtml(selectedSummary)}<small>no BallZ shell, race route, timer, or scoreboard</small>`),
          this.statCard("Controls", "A/D or drag to orbit<small>Reset View restores this environment's starting camera</small>")
        ]
      );
      return;
    }

    if (state === "ballz-2011-level1") {
      const level = this.raceScene.getBallz2011Level1State();
      this.renderArchiveState(
        "BallZ Concepts — 2011 Level1.TVM",
        "This is the distinct 2011 Level1 mesh, not the later ASCII race called Level 1. Its decoded geometry is exact, but no source loads it and no spawn, rules, checkpoints, camera, or texture binding survives—so this remains an inspection visit, never an invented race.",
        "Next Lab",
        [
          {
            label: "Level1.TVM / Line01",
            source: "BallZ 2011/Release/Media/Level1.TVM",
            status: level?.ready ? "ported" : "preview",
            detail: "Exact 828 vertices, 1,648 triangles, normals, winding and topology; two adjacent closed 414-vertex solids."
          },
          {
            label: "Material Evidence",
            source: "Level1.TVM material slot and UV stream",
            status: "preview",
            detail: "One material index, identical UVs, and no embedded texture name. The neutral gold surface and diagnostic edges are visibly labeled presentation choices."
          },
          {
            label: "Gameplay Evidence",
            source: "repository-wide loader audit",
            status: "pipeline",
            detail: "No recovered code loads this mesh; authored camera, scale, spawn, rules and objective remain unknown."
          }
        ],
        "ballz-2011-level1",
        [
          `<section class="wide-card"><span class="stat-label">Inspection Overlays</span><div class="race-list">
            <button class="race-card${level?.presentation.edgesVisible ? " is-selected" : ""}" data-level1-display="edges"><span>Topology Edges</span><small>${level?.presentation.edgesVisible ? "visible" : "hidden"} · inferred diagnostic overlay</small></button>
            <button class="race-card${level?.presentation.boundsVisible ? " is-selected" : ""}" data-level1-display="bounds"><span>Decoded Bounds</span><small>${level?.presentation.boundsVisible ? "visible" : "hidden"} · exact normalized extents</small></button>
          </div></section>`,
          this.statCard("Exact Mesh", `${level?.vertexCount ?? 828} vertices · ${level?.triangleCount ?? 1648} triangles<small>${level?.componentCount ?? 2} closed manifold components · Line01</small>`),
          this.statCard("Archive Span", "210.16 × 498.73 × 1,135.44<small>uniform 0.1 display transform · reversible round-trip error ≤ 0.000005</small>"),
          this.statCard("Category", "BallZ concept / mesh study<small>not classic Level 1 · not a race · no BallZ shell or timer</small>")
        ]
      );
      return;
    }

    if (state === "ballz-slide1") {
      const slide = this.raceScene.getBallzSlide1State();
      this.renderArchiveState(
        "BallZ Concepts — Active Atmel Slide 1",
        "This is the source-loaded Atmel Slide1 revision—not the much smaller later StockRoom binary. Its assembly is exact and reachable, while gameplay stays disabled because the surviving input only applies backward impulse and the 100 rings are labeled temporary in source.",
        "Next Lab",
        [
          {
            label: "Active Slide1.TVM Revision",
            source: "AtmelCubx/Slide.cpp; Media/Models/Slide1.tvm",
            status: "ported",
            detail: "Exact 566 vertices, 552 triangles, source transform (0,-5000,0), managed material constants, and static physics role. The incompatible compact StockRoom revision remains separately tracked."
          },
          {
            label: "Ball + Chase Assembly",
            source: "AtmelCubx/Level.cpp; Ball.cpp; Ball.tvm",
            status: "ported",
            detail: "Exact Ball.tvm spawn (-50,-4750,-250), 0.5 scale, mass 5000, chase offset (0,350,300), gravity -9.800908285, and source contact values."
          },
          {
            label: "Playable Slide Rules",
            source: "PushBall; Level::CreateLevel",
            status: "pipeline",
            detail: "Only the backward impulse block remains active; front/left/right torque is commented out, and all 100 rings are described as temporary. No repaired rules or objective are invented here."
          }
        ],
        "ballz-slide1",
        [
          `<section class="wide-card"><span class="stat-label">Inspection Overlays</span><div class="race-list">
            <button class="race-card${slide?.ball.visible ? " is-selected" : ""}" data-slide1-display="ball"><span>Exact Ball Spawn</span><small>${slide?.ball.visible ? "visible" : "hidden"} · source transform and scale</small></button>
            <button class="race-card${slide?.diagnostics.edgesVisible ? " is-selected" : ""}" data-slide1-display="edges"><span>Topology Edges</span><small>${slide?.diagnostics.edgesVisible ? "visible" : "hidden"} · diagnostic overlay</small></button>
            <button class="race-card${slide?.diagnostics.boundsVisible ? " is-selected" : ""}" data-slide1-display="bounds"><span>Normalized Bounds</span><small>${slide?.diagnostics.boundsVisible ? "visible" : "hidden"} · reversible presentation only</small></button>
          </div></section>`,
          this.statCard("Exact Slide", `${slide?.slide.vertexCount ?? 566} vertices · ${slide?.slide.triangleCount ?? 552} triangles<small>251.586 × 2,049 × 3,713.869 source span</small>`),
          this.statCard("Exact Ball", `mass ${slide?.ball.mass ?? 5000}<small>spawn -50, -4750, -250 · scale 0.5</small>`),
          this.statCard("Category", "BallZ slide concept / non-race visit<small>source chase evidence retained · playable false</small>")
        ]
      );
      return;
    }

    if (state === "xml-myworld-copy") {
      const xml = this.raceScene.getXmlSceneState();
      const objectButtons = (xml?.objects ?? []).map((object) => `
        <button class="race-card${object.visible ? " is-selected" : ""}" ${object.rendered ? `data-xml-object="${escapeHtml(object.name)}"` : "disabled"}>
          <span>${escapeHtml(object.name)}</span>
          <small>${escapeHtml(object.action)} · ${object.rendered ? object.visible ? "visible" : "hidden" : "missing source — not substituted"}</small>
        </button>`).join("");
      this.renderArchiveState(
        "Archived XML Worlds — MyWorld Copy",
        "This seven-object editor scene is kept separate from BallZ races and the Dominus asset family. Six serialized objects are source-backed and visible; ArcheChinois.TVM is absent from the archive, so the visit reports the hole instead of inventing a replacement.",
        "Next Lab",
        [
          {
            label: "XML Scene Document",
            source: "BallZ2015.bckup/Media/MyWorld - Copie.xml",
            status: "ported",
            detail: "All seven names, actions, transforms, scales, mass values, Newton material IDs, and mesh-control flags are preserved across the legacy serializer."
          },
          {
            label: "Recovered Composition",
            source: "procedural definitions; AirplaneLP.TVM; Level2.TVM",
            status: xml?.ready ? "ported" : "preview",
            detail: "Four exact procedural physics shapes plus the exact 5,367-vertex airplane and 448-vertex Level2 mesh render with eight verified archive textures."
          },
          {
            label: "Evidence Boundary",
            source: "ArcheChinois.TVM and host runtime audit",
            status: "pipeline",
            detail: "The Chinese arch file is absent. Physics metadata survives, but gravity, timestep, ground and interaction configuration do not; camera/lights are inspection choices and motion is withheld."
          }
        ],
        "xml-myworld-copy",
        [
          `<section class="wide-card"><span class="stat-label">Source Objects</span><div class="race-list">${objectButtons}<button class="race-card" data-xml-reset><span>Show All Recovered</span><small>restore visibility without changing source transforms</small></button></div></section>`,
          `<section class="wide-card"><span class="stat-label">Inspection Camera</span><div class="race-list"><button class="race-card" data-xml-orbit="left"><span>Orbit Left</span><small>A or drag</small></button><button class="race-card" data-xml-orbit="right"><span>Orbit Right</span><small>D or drag</small></button><button class="race-card" data-xml-orbit="reset"><span>Reset View</span><small>return to inspection origin</small></button></div></section>`,
          this.statCard("Recovered", `${xml?.renderedObjectCount ?? 6} / ${xml?.objectCount ?? 7} objects<small>${escapeHtml(xml?.unresolvedObjectNames.join(", ") || "loading exact textures")}</small>`),
          this.statCard("Exact TVMs", "Airplane 5,367v / 9,202t<small>Level2 448v / 692t · ten material groups total</small>"),
          this.statCard("Physics", "metadata preserved · simulation off<small>host gravity/timestep/ground not found</small>")
        ]
      );
      return;
    }

    if (state === "ballz-xml-worlds") {
      const xml = this.raceScene.getBallzXmlWorldsState();
      const objectRows = (xml?.objects ?? []).map((object) => `
        <div class="race-card${object.rendered ? " is-selected" : ""}">
          <span>${escapeHtml(object.name || `(record ${object.index})`)}</span>
          <small>${escapeHtml(object.action)} · ${object.rendered ? "exact source visible" : `unresolved ${escapeHtml(object.resolution)}`}</small>
        </div>`).join("");
      this.renderArchiveState(
        "BallZ XML Evidence — MyWorld & TestWorld",
        "These are two distinct serialized scene documents, not finished BallZ races. Each document is parsed with its own embedded action table; exact loadable records render, while malformed DUPLICATE targets and the absent bush remain unresolved instead of receiving proxies.",
        "Next Lab",
        [
          {
            label: "MyWorld.xml Broken Editor Save",
            source: "BallZ2015.bckup/Media/MyWorld.xml",
            status: "preview",
            detail: "Four serialized records: exact Airplane.TVM and physics cylinder, plus two malformed DUPLICATE path targets. The coincident Suzanne files are not valid substitutes."
          },
          {
            label: "TestWorld.xml Loader Fixture",
            source: "BallZ2015.bckup/Media/TestWorld.xml",
            status: "preview",
            detail: "Eight records: four exact primitives and AirplaneLP.TVM render; bush1.X is absent and two empty duplicate targets stay unresolved."
          },
          {
            label: "Classification Boundary",
            source: "per-document Actions tables and host audit",
            status: "pipeline",
            detail: "Both are meaningful serialized compositions and now PARTIAL census entries, but neither is an assembled discoverable world or restored gameplay scene."
          }
        ],
        "ballz-xml-worlds",
        [
          `<section class="wide-card"><span class="stat-label">Choose XML Document</span><div class="race-list"><button class="race-card${xml?.sceneId === "myworld" ? " is-selected" : ""}" data-ballz-xml-scene="myworld"><span>MyWorld.xml</span><small>4 records · 2 exact · broken editor save</small></button><button class="race-card${xml?.sceneId === "testworld" ? " is-selected" : ""}" data-ballz-xml-scene="testworld"><span>TestWorld.xml</span><small>8 records · 5 exact · loader fixture</small></button></div></section>`,
          `<section class="wide-card"><span class="stat-label">Serialized Records</span><div class="race-list">${objectRows || '<div class="race-card"><span>Loading exact XML evidence…</span><small>source hashes and TVM geometry are being mounted</small></div>'}</div></section>`,
          `<section class="wide-card"><span class="stat-label">Inspection</span><div class="race-list"><button class="race-card" data-ballz-xml-action="focus"><span>Focus Next Exact Object</span><small>cycle only rendered records</small></button><button class="race-card" data-ballz-xml-action="left"><span>Orbit Left</span><small>A or drag</small></button><button class="race-card" data-ballz-xml-action="right"><span>Orbit Right</span><small>D or drag</small></button><button class="race-card" data-ballz-xml-action="reset"><span>Reset Document</span><small>overview and all exact records</small></button></div></section>`,
          this.statCard("Coverage", `${xml?.renderedObjectCount ?? (xml?.sceneId === "testworld" ? 5 : 2)} / ${xml?.objectCount ?? (xml?.sceneId === "testworld" ? 8 : 4)} exact records<small>${xml?.unresolvedObjectCount ?? 2} unresolved · no substitutions</small>`),
          this.statCard("Classification", `${escapeHtml(xml?.classification ?? "serialized evidence scene")}<small>distinct composition · assembled world false</small>`),
          this.statCard("Parser Rule", `${escapeHtml(xml?.parserRule ?? "Use the document's embedded Actions table.")}<small>later C++ enum positions are not borrowed</small>`)
        ]
      );
      return;
    }

    if (state === "xml-serializer-artifacts") {
      const artifact = this.raceScene.getStockroomXmlArtifactState();
      this.renderArchiveState(
        "Recovery Status — XML Serializer Artifacts",
        "BaseScene.xml and test1.xml are preserved here because they prove serializer versions and save behavior. The exact audit also proves they are not distinct composed worlds, so both have been removed from the scene census instead of inflating restoration totals.",
        "Next Lab",
        [
          {
            label: "BaseScene.xml v1.1 Artifact",
            source: "StockRoom/BaseScene.xml",
            status: "ported",
            detail: "Eighteen byte-identical PHYSICCUBE records overlap at exactly the same origin and scale. No camera, light, layout, terrain, rules, or authored variation is serialized."
          },
          {
            label: "test1.xml v1.2 Smoke Save",
            source: "StockRoom/test1.xml",
            status: "ported",
            detail: "One unit cube and two newline-only variants prove a minimal serializer smoke document, not a scene composition."
          },
          {
            label: "Census Correction",
            source: "exact signatures, transforms, and copy hashes",
            status: "ported",
            detail: "Both remain directly inspectable under Recovery Status, while distinctAssembledScene stays false and no cubes are spread apart to fabricate a level."
          }
        ],
        "xml-serializer-artifacts",
        [
          `<section class="wide-card"><span class="stat-label">Choose Serializer Artifact</span><div class="race-list"><button class="race-card${artifact?.selectedArtifactId === "base-scene" ? " is-selected" : ""}" data-serializer-artifact="base-scene"><span>BaseScene.xml</span><small>18 exact overlapping records · v1.1</small></button><button class="race-card${artifact?.selectedArtifactId === "test1" ? " is-selected" : ""}" data-serializer-artifact="test1"><span>test1.xml</span><small>one unit cube · v1.2 smoke save</small></button></div></section>`,
          `<section class="wide-card"><span class="stat-label">Inspection Camera</span><div class="race-list"><button class="race-card" data-serializer-action="left"><span>Orbit Left</span><small>A or drag</small></button><button class="race-card" data-serializer-action="right"><span>Orbit Right</span><small>D or drag</small></button><button class="race-card" data-serializer-action="reset"><span>Reset View</span><small>keep exact overlap intact</small></button></div></section>`,
          this.statCard("Serialized Records", `${artifact?.objectCount ?? 18} objects · ${artifact?.uniqueObjectSignatureCount ?? 1} unique signature<small>overlap group ${artifact?.exactOverlapGroupSizes.join(", ") || "18"}</small>`),
          this.statCard("Scene Census", "excluded as serializer artifacts<small>distinctAssembledScene = false</small>"),
          this.statCard("Physics", "metadata preserved · simulation off<small>no host gravity, ground, timestep, or behavior serialized</small>")
        ]
      );
      return;
    }

    if (state === "vehicle-pack-gallery") {
      const vehicle = this.raceScene.getVehiclePackState();
      this.renderArchiveState(
        "Vehicle Experiments — GT4 & Low Cobra Sources",
        "Both archived car packs are now inspectable with exact 3DS geometry, object splits, UVs, material-face lists, and referenced textures. They remain PIPELINE as vehicles: the archived selector contains only Impreza, its click callback is empty, and CLVehicule hard-codes the Impreza assembly.",
        "Next Lab",
        [
          {
            label: "GT4 Exact Source",
            source: "Media/Models/cars/gt4.3DS; GT4 WORK.jpg; GT4.tvm",
            status: vehicle?.selectedVehicleId === "gt4" && vehicle.ready ? "ported" : "preview",
            detail: "Fourteen 3DS objects, 10,740 point records, 8,345 faces, two materials, one texture reference; TVM evidence preserves the same face count."
          },
          {
            label: "Low Cobra Exact Source",
            source: "Media/Models/cars/Low_Cobra.3DS; seven TGA references; Low Cobra.tvm",
            status: vehicle?.selectedVehicleId === "low-cobra" && vehicle.ready ? "ported" : "preview",
            detail: "Ten objects, 6,961 point records, 3,266 faces, seven materials and seven exact texture references; duplicate 3DS sources are byte-identical."
          },
          {
            label: "No Driving Restoration Claim",
            source: "CLCarSelectScene; CLVehicule source audit",
            status: "pipeline",
            detail: "Selector binding NONE; physics binding NONE. The hidden Cobra oval adapter is not exposed as archive-authored vehicle behavior."
          }
        ],
        "vehicle-pack-gallery",
        [
          `<section class="wide-card"><span class="stat-label">Choose Exact Vehicle Source</span><div class="race-list"><button class="race-card${vehicle?.selectedVehicleId === "gt4" ? " is-selected" : ""}" data-vehicle-pack="gt4"><span>GT4</span><small>14 objects · 10,740v · 8,345t</small></button><button class="race-card${vehicle?.selectedVehicleId === "low-cobra" ? " is-selected" : ""}" data-vehicle-pack="low-cobra"><span>Low Cobra</span><small>10 objects · 6,961v · 3,266t</small></button></div></section>`,
          `<section class="wide-card"><span class="stat-label">Inspection Camera</span><div class="race-list"><button class="race-card" data-vehicle-pack-action="left"><span>Orbit Left</span><small>A or drag</small></button><button class="race-card" data-vehicle-pack-action="right"><span>Orbit Right</span><small>D or drag</small></button><button class="race-card" data-vehicle-pack-action="reset"><span>Reset View</span><small>source component layout</small></button></div></section>`,
          this.statCard("Exact 3DS", `${(vehicle?.vertexCount ?? 10740).toLocaleString()} vertices · ${(vehicle?.triangleCount ?? 8345).toLocaleString()} triangles<small>${vehicle?.objectCount ?? 14} objects · ${vehicle?.materialCount ?? 2} materials</small>`),
          this.statCard("Runtime Binding", "selector NONE · physics NONE<small>playable false · status PIPELINE</small>"),
          this.statCard("TVM Evidence", `${(vehicle?.tvmEvidence.vertices ?? 12916).toLocaleString()}v / ${(vehicle?.tvmEvidence.triangles ?? 8345).toLocaleString()}t<small>${escapeHtml(vehicle?.tvmEvidence.source ?? "Media/Models/cars/GT4.tvm")}</small>`)
        ]
      );
      return;
    }

    if (state === "object-library-catalog") {
      const catalog = this.raceScene.getObjectLibraryCatalogState();
      const selected = catalog?.objects.find((object) => object.selected);
      const familyButtons = (["all", "primitive", "pipe", "building", "technology", "aircraft", "nature", "camp", "port"] as const)
        .map((family) => `<button class="mode-card mode-card-compact${catalog?.familyFilter === family ? " is-selected" : ""}" data-object-library-family="${family}"><span>${family === "all" ? "All families" : family}</span><small>filter exact serialized rows</small></button>`)
        .join("");
      const statusButtons = (["all", "recovered", "missing", "unsupported"] as const)
        .map((status) => `<button class="mode-card mode-card-compact${catalog?.statusFilter === status ? " is-selected" : ""}" data-object-library-status="${status}"><span>${status}</span><small>source availability</small></button>`)
        .join("");
      this.renderArchiveState(
        "ObjectLibrary — Exact Catalog Grid",
        "This is the archived editor's regular 61-entry object catalog, not a village or composed world. Recovered assets render at their exact serialized transforms; missing and unsupported rows remain labeled holes with no proxy substitution.",
        "Next Lab",
        [
          {
            label: "Authored Catalog Document",
            source: "BallZ2015.bckup/Media/ObjectLibrary.xml",
            status: catalog?.ready ? "ported" : "preview",
            detail: "All 61 records preserve their names, actions, transforms, scales, mass, Newton material and mesh-control metadata."
          },
          {
            label: "Recovered Geometry & Materials",
            source: "40 text-X assets; Prisme.TVM; Airplane.TVM; five procedural definitions",
            status: catalog?.ready ? "ported" : "preview",
            detail: "Forty-seven rows render exact recovered geometry with 265 material groups and 71 hash-locked textures; source magenta color-key usage is retained as a disclosed shader adapter."
          },
          {
            label: "Evidence Boundary",
            source: "ObjectLibrary/Dominus forensic audit",
            status: "pipeline",
            detail: "Thirteen assets are absent and one X file is an unsupported binary payload. No authored Dominus world composition survives, so this grid is never presented as one."
          }
        ],
        "object-library-catalog",
        [
          `<section class="wide-card"><span class="stat-label">Catalog Family</span><div class="mode-list">${familyButtons}</div></section>`,
          `<section class="wide-card"><span class="stat-label">Recovery Filter</span><div class="mode-list">${statusButtons}</div></section>`,
          `<section class="wide-card"><span class="stat-label">Selected Record</span><strong>${escapeHtml(selected?.name ?? "Loading catalog…")}</strong><small>${selected ? `${escapeHtml(selected.family)} · ${escapeHtml(selected.action)} · ${escapeHtml(selected.catalogResolution)}` : "Exact catalog data is loading."}</small><div class="race-list"><button class="race-card" data-object-library-select="previous"><span>Previous</span><small>previous matching row</small></button><button class="race-card" data-object-library-select="next"><span>Next</span><small>next matching row</small></button><button class="race-card" data-object-library-select="left"><span>Orbit Left</span><small>A or drag</small></button><button class="race-card" data-object-library-select="right"><span>Orbit Right</span><small>D or drag</small></button><button class="race-card" data-object-library-select="reset"><span>Reset Catalog</span><small>all families, all statuses, source view</small></button></div></section>`,
          this.statCard("Recovery", `${catalog?.recoveredCount ?? 47} recovered / ${catalog?.objectCount ?? 61}<small>${catalog?.missingCount ?? 13} missing · ${catalog?.unsupportedCount ?? 1} unsupported</small>`),
          this.statCard("Visible Filter", `${catalog?.matchingCount ?? 61} records<small>${escapeHtml(catalog?.familyFilter ?? "all")} · ${escapeHtml(catalog?.statusFilter ?? "all")}</small>`),
          this.statCard("Classification", "editor/catalog grid<small>not a village · not BallZ progression</small>")
        ]
      );
      return;
    }

    if (state === "ballz-track-gallery") {
      const gallery = this.raceScene.getBallzTrackGalleryState();
      const assetOptions = ([
        ["slide1a-legacy-active", "Slide 1A"],
        ["level-slides", "Level.Slides"],
        ["level-steps", "Level.Steps"],
        ["slide-bump", "Slide Bump"],
        ["slide-bump-gridtex", "Bump GridTex"],
        ["ballz-track1", "BallZ Track 1"]
      ] as const).map(([id, label]) => `<button class="mode-card mode-card-compact${gallery?.selectedAssetId === id ? " is-selected" : ""}" data-ballz-track-asset="${id}"><span>${label}</span><small>exact source-backed visit</small></button>`).join("");
      this.renderArchiveState(
        "BallZ Concepts — Slide / Track Archive Gallery",
        "Six distinct BallZ-era slide and track sources are now visible as exact geometry/material studies. They remain non-gameplay archive visits wherever collision, controls, objectives or a complete host scene did not survive; no temporary ring line is promoted into a race.",
        "Next Lab",
        [
          {
            label: "Six Distinct Source Meshes",
            source: "Slide1a; Level.Slides/Steps; SlideBump revisions; BallZTrack1",
            status: gallery?.assetsReady ? "ported" : "preview",
            detail: "Every source preserves exact indexed geometry, hashes, UVs, material assignments, group records, topology and reversible display normalization."
          },
          {
            label: "Recovered Material Evidence",
            source: "MGRP/MGR4 records; grass/concrete/wood/EarthGri textures",
            status: "ported",
            detail: "Level.Steps binds its three exact textures and GridTex binds EarthGri; zero source normals/material records remain disclosed with inspection-only adapters."
          },
          {
            label: "Gameplay Boundary",
            source: "CLBallZ / CLSlideObject / CLBallZScene host audit",
            status: "pipeline",
            detail: "Slide1A and Track1 retain limited host evidence. Missing or commented controls, temporary rings and absent objectives are not reinterpreted as six playable races."
          }
        ],
        "ballz-track-gallery",
        [
          `<section class="wide-card"><span class="stat-label">Archive Source</span><div class="mode-list">${assetOptions}</div></section>`,
          `<section class="wide-card"><span class="stat-label">Inspection</span><strong>${escapeHtml(gallery?.asset.label ?? "Loading exact track…")}</strong><small>${gallery ? `${gallery.asset.vertexCount.toLocaleString()} vertices · ${gallery.asset.triangleCount.toLocaleString()} triangles · ${gallery.asset.exactGroupCount} source groups · ${escapeHtml(gallery.asset.displayNormalAdapter)}` : "Decoded gallery is loading."}</small><div class="race-list"><button class="race-card${gallery?.material.mode === "diagnostic-groups" ? " is-selected" : ""}" data-ballz-track-action="materials"><span>Material Evidence</span><small>${gallery?.material.mode ?? "source-evidence"}</small></button><button class="race-card${gallery?.diagnostics.edgesVisible ? " is-selected" : ""}" data-ballz-track-action="edges"><span>Edges</span><small>topology inspection</small></button><button class="race-card${gallery?.diagnostics.boundsVisible ? " is-selected" : ""}" data-ballz-track-action="bounds"><span>Bounds</span><small>reversible display envelope</small></button><button class="race-card" data-ballz-track-action="overview"><span>Overview</span><small>inferred inspection camera</small></button><button class="race-card" data-ballz-track-action="top"><span>Top View</span><small>inferred inspection camera</small></button></div></section>`,
          this.statCard("Host", `${escapeHtml(gallery?.hostEvidence.status ?? "loading evidence")}<small>${escapeHtml(gallery?.hostEvidence.gameplayBoundary ?? "No gameplay is invented.")}</small>`),
          this.statCard("Material", `${gallery?.material.resolvedTextures.length ?? 0} exact texture bindings<small>${gallery?.material.neutralFallback ? "neutral fallback disclosed" : "source evidence active"}</small>`),
          this.statCard("Status", "PARTIAL · non-playable visit<small>six census rows advanced from PIPELINE</small>")
        ]
      );
      return;
    }

    if (state === "dominus-asset-gallery") {
      const gallery = this.raceScene.getDominusAssetGalleryState();
      const familyButtons = (["all", "bush", "camp", "character", "grass", "port", "weapon", "tree"] as const)
        .map((family) => `<button class="mode-card mode-card-compact${gallery?.familyFilter === family ? " is-selected" : ""}" data-dominus-family="${family}"><span>${family === "all" ? "All families" : family}</span><small>${family === "all" ? "65 audited source assets" : `${gallery?.familyCounts[family] ?? 0} exact records`}</small></button>`)
        .join("");
      const statusButtons = (["all", "recovered", "unsupported"] as const)
        .map((status) => `<button class="mode-card mode-card-compact${gallery?.statusFilter === status ? " is-selected" : ""}" data-dominus-status="${status}"><span>${status}</span><small>source decode status</small></button>`)
        .join("");
      this.renderArchiveState(
        "Dominus — Source Asset Gallery",
        "All 65 surviving Dominus models are inspectable here as local source assets. The separate port-evidence visit now exposes the only surviving multi-asset placement, while keeping its editor-grid identity explicit.",
        "Next Lab",
        [
          {
            label: "Exact Source Geometry",
            source: "Media/Dominus/*.X; deterministic X/texture converter",
            status: gallery?.ready ? "ported" : "preview",
            detail: "Sixty-three text DirectX X models preserve 283 mesh parts, 40,836 vertices, 26,317 triangles, 308 material groups and all 83 referenced textures."
          },
          {
            label: "Explicit Binary Boundary",
            source: "port_crateshed.X; renzokscale.X",
            status: "pipeline",
            detail: "Two binary-X files remain labeled inspection records with no proxy geometry rather than being silently dropped or replaced."
          },
          {
            label: "No World Reconstruction Claim",
            source: "Dominus loader/composition audit; ObjectLibrary.xml port rows",
            status: "ported",
            detail: "The exact 28-row port catalog subset is now a separate evidence visit. No authored village layout is claimed; the playable scenic tour is labeled modern curated work."
          }
        ],
        "dominus-asset-gallery",
        [
          `<section class="wide-card"><span class="stat-label">Source Family</span><div class="mode-list">${familyButtons}</div></section>`,
          `<section class="wide-card"><span class="stat-label">Decode Filter</span><div class="mode-list">${statusButtons}</div></section>`,
          `<section class="wide-card"><span class="stat-label">Selected Asset</span><strong>${escapeHtml(gallery?.selectedName ?? "Loading source asset…")}</strong><small>${gallery ? `${escapeHtml(gallery.selectedFamily)} · ${escapeHtml(gallery.selectedStatus)} · ${gallery.sourceVertexCount.toLocaleString()}v / ${gallery.sourceTriangleCount.toLocaleString()}t / ${gallery.sourceMaterialGroupCount} groups` : "Exact gallery data is loading."}</small><div class="race-list"><button class="race-card" data-dominus-select="previous"><span>Previous</span><small>previous matching source</small></button><button class="race-card" data-dominus-select="next"><span>Next</span><small>next matching source</small></button><button class="race-card" data-dominus-select="left"><span>Orbit Left</span><small>A or drag</small></button><button class="race-card" data-dominus-select="right"><span>Orbit Right</span><small>D or drag</small></button><button class="race-card" data-dominus-select="reset"><span>Reset Gallery</span><small>all 65 source assets</small></button></div></section>`,
          this.statCard("Recovery", `${gallery?.recoveredCount ?? 63} recovered / ${gallery?.assetCount ?? 65}<small>${gallery?.unsupportedCount ?? 2} unsupported binary-X records</small>`),
          this.statCard("Visible Filter", `${gallery?.matchingCount ?? 65} assets<small>${escapeHtml(gallery?.familyFilter ?? "all")} · ${escapeHtml(gallery?.statusFilter ?? "all")}</small>`),
          this.statCard("Boundary", "source assets only<small>use Port Placement Evidence for the exact multi-object document</small>")
        ]
      );
      return;
    }

    if (state === "dominus-port-evidence") {
      const port = this.raceScene.getDominusPortEvidenceState();
      const selected = port?.placements.find((placement) => placement.id === port.selectedId);
      const placementButtons = (port?.placements ?? [])
        .map((placement) => `<button class="mode-card mode-card-compact${placement.selected ? " is-selected" : ""}" data-dominus-port-id="${escapeHtml(placement.id)}"><span>${escapeHtml(placement.sourceName)}</span><small>${escapeHtml(placement.status)} · ${placement.vertices.toLocaleString()}v</small></button>`)
        .join("");
      this.renderArchiveState(
        "Dominus — Exact Port Placement Evidence",
        "This is the only surviving multi-asset Dominus placement: the 28 port-prefixed ObjectLibrary rows at their exact serialized transforms. It is an editor thumbnail grid—not an authored village. The separately playable scenic tour is modern curated work, clearly labeled as such.",
        "Next Lab",
        [
          {
            label: "Exact 28-Row Source Grid",
            source: "BallZ2015.bckup/Media/ObjectLibrary.xml",
            status: port?.ready ? "ported" : "preview",
            detail: "All source order, positions, zero rotations, uniform 0.01 scales, enabled state and material groups are preserved."
          },
          {
            label: "Recovered Port Geometry",
            source: "27 text-X port meshes; one port_crateshed binary-X record",
            status: port?.ready ? "ported" : "preview",
            detail: "23,594 vertices, 13,860 triangles and 126 material groups render exactly; port_crateshed remains an explicit diagnostic boundary."
          },
          {
            label: "Authored-World Boundary",
            source: "Dominus family forensic audit",
            status: "pipeline",
            detail: "No authored terrain, water, camera, navigation, spawn, lighting or gameplay configuration survives. That absence is now closed as an evidence result rather than hidden as unfinished work."
          }
        ],
        "dominus-port-evidence",
        [
          `<section class="wide-card"><span class="stat-label">Source Placements</span><div class="mode-list">${placementButtons || "<small>Loading all 28 exact rows…</small>"}</div></section>`,
          `<section class="wide-card"><span class="stat-label">Selected Source Row</span><strong>${escapeHtml(selected?.sourceName ?? "Loading port evidence…")}</strong><small>${selected ? `${escapeHtml(selected.status)} · source (${selected.sourcePosition.join(", ")}) · ${selected.vertices.toLocaleString()}v / ${selected.triangles.toLocaleString()}t / ${selected.materialGroups} groups` : "Exact placement data is loading."}</small><div class="race-list"><button class="race-card" data-dominus-port-action="previous"><span>Previous</span><small>previous source row</small></button><button class="race-card" data-dominus-port-action="next"><span>Next</span><small>next source row</small></button><button class="race-card" data-dominus-port-action="focus"><span>Focus Selected</span><small>inspection adapter</small></button><button class="race-card" data-dominus-port-action="overview"><span>Source Grid</span><small>exact catalog placement</small></button><button class="race-card" data-dominus-port-action="left"><span>Orbit Left</span><small>A or drag</small></button><button class="race-card" data-dominus-port-action="right"><span>Orbit Right</span><small>D or drag</small></button><button class="race-card" data-dominus-port-action="reset"><span>Reset Evidence</span><small>source grid + first row</small></button><button class="race-card" data-world-family="dominus"><span>Play Curated Visit</span><small>modern composition · not authored recovery</small></button></div></section>`,
          this.statCard("Recovery", `${port?.decodedPlacementCount ?? 27} decoded / ${port?.portPlacementCount ?? 28}<small>${port?.unsupportedPlacementCount ?? 1} explicit binary-X boundary</small>`),
          this.statCard("Classification", "PARTIAL · evidence complete<small>editor catalog grid · no authored village claim</small>"),
          this.statCard("Source Lock", `${port?.sourceDocumentSha256.slice(0, 12) ?? "4BF51E84F920"}…<small>${port?.sourceDocumentLogicalCopies ?? 3} byte-identical archive copies</small>`)
        ]
      );
      return;
    }

    if (state === "suzanne2-archive") {
      const suzanne2 = this.raceScene.getSuzanne2State();
      const xmlVisible = (suzanne2?.counts.xmlMeshesVisible ?? 0) > 0;
      const cubxVisible = (suzanne2?.counts.cubxAnchorsVisible ?? 0) > 0;
      this.renderArchiveState(
        "BallZ Authored Arenas — Suzanne 2",
        "Suzanne 2 is a distinct 40×40 authored ASCII/XML level, not a variation of Suzanne 1. This visit follows the active March 2017 source and keeps its contradiction visible: fifteen rings are authored, but the shipped update advances after two pickups and defines no lap victory target.",
        "Next Lab",
        [
          {
            label: "Suzanne2.ASCII Composition",
            source: "StockRoom/Suzanne2.ASCII; Scene::BuildASCIIScene",
            status: suzanne2?.ready ? "ported" : "preview",
            detail: "Exact 40×40 layout with 315 collision cubes, 15 rings, three chains, three pistons, four gate posts, two effect cells, two CubX anchors, and source spawn/gate coordinates."
          },
          {
            label: "Suzanne2.xml Attachments",
            source: "Suzanne2.xml; Airplane.x; BonedGate.x; Zack.jpg",
            status: "ported",
            detail: "Exact Airplane, static BonedGate bind pose, billboard and SuperCage player geometry/material groups are preserved with source transforms and recovered textures."
          },
          {
            label: "Runtime Rule Conflict",
            source: "GamePlayScreen::update",
            status: "pipeline",
            detail: "Authored inventory is 15, the active victory threshold is 2, and no lap target exists. The visit exposes both facts and withholds corrected gameplay instead of silently designing a new rule."
          }
        ],
        "suzanne2-archive",
        [
          `<section class="wide-card"><span class="stat-label">Inspection Layers</span><div class="race-list">
            <button class="race-card${suzanne2?.player.visible ? " is-selected" : ""}" data-suzanne2-display="player"><span>SuperCage Player</span><small>${suzanne2?.player.visible ? "visible" : "hidden"} · exact 0.3 physics radius</small></button>
            <button class="race-card${xmlVisible ? " is-selected" : ""}" data-suzanne2-display="xml"><span>XML Attachments</span><small>${xmlVisible ? "visible" : "hidden"} · Airplane / BonedGate / billboard</small></button>
            <button class="race-card${cubxVisible ? " is-selected" : ""}" data-suzanne2-display="cubx"><span>CubX Anchors</span><small>${cubxVisible ? "evidence anchors visible" : "hidden by default"} · actor animation unresolved</small></button>
            <button class="race-card" data-suzanne2-display="rings"><span>Restore 15 Rings</span><small>reset source inventory visibility</small></button>
            <button class="race-card${suzanne2?.activePistons.includes(0) ? " is-selected" : ""}" data-suzanne2-piston="0"><span>Piston 1 Limit</span><small>toggle exact linear limit endpoints</small></button>
          </div></section>`,
          this.statCard("Exact Layout", "40 × 40 · 315 collision cubes<small>313 wall cells + 2 effect-wall cells</small>"),
          this.statCard("Actors", "15 rings · 3 chains · 3 pistons<small>4 posts · 4 emitters · 2 CubX anchors</small>"),
          this.statCard("Rule Evidence", `${suzanne2?.rules.authoredRingInventory ?? 15} authored / ${suzanne2?.rules.implementedVictoryThreshold ?? 2} implemented<small>lap victory target: none</small>`),
          this.statCard("Screenshot Fidelity", "no Suzanne 2 screenshot survives<small>active source semantics used; no Suzanne 1 image substitution</small>")
        ]
      );
      return;
    }

    if (state === "milky-way-lab") {
      const milky = this.raceScene.getMilkyWayState();
      const profile = milky?.profile ?? "graphysx2017";
      this.renderArchiveState(
        "Voie Lactée — Planetary Vignette",
        "The archive name suggested a galaxy, but the implemented subsystem is exactly five textured bodies: Earth, a cloud shell, Moon, Mars, and Venus. There is no generated star field. The later GraphysX placement and the older moving BallZ profile are kept separate.",
        "Next Lab",
        [
          {
            label: "GraphysX 2017 Profile",
            source: "GraphysX_1/Scene.cpp::CreateVoieLactee",
            status: milky?.loadStatus === "ready" ? "ported" : "preview",
            detail: "Exact textures, radii, positions, and 23° Earth tilt. The authored Moon is preserved even though it lies inside the Earth/cloud volume."
          },
          {
            label: "BallZ 2015 Motion Profile",
            source: "Archive/bckup/VoieLactee.cpp",
            status: "preview",
            detail: "Recovered Earth/cloud rotation and Moon orbit rates are live; exact older cloud-alpha and Earth bindings remain unavailable."
          }
        ],
        "milky-way-lab",
        [
          `<section class="wide-card"><span class="stat-label">Source Profile</span><div class="race-list">
            <button class="race-card${profile === "graphysx2017" ? " is-selected" : ""}" data-milky-profile="graphysx2017"><span>GraphysX 2017</span><small>exact later assets and static transforms</small></button>
            <button class="race-card${profile === "ballz2015" ? " is-selected" : ""}" data-milky-profile="ballz2015"><span>BallZ 2015</span><small>older positions and recovered motion profile</small></button>
            <button class="race-card" data-milky-reset><span>Reset Vignette</span><small>restore source positions and phase</small></button>
          </div></section>`,
          this.statCard("Implemented Bodies", `${milky?.planets.length ?? 5} / 5<small>Earth · clouds · Moon · Mars · Venus</small>`),
          this.statCard("Generated Stars", "0<small>corrected classification: planetary scene component, not star field</small>"),
          this.statCard("Asset Binding", `${milky?.exactAssetBinding ? "exact later archive set" : "partial older profile"}<small>visit camera and group centering remain labeled presentation</small>`)
        ]
      );
      return;
    }

    if (state === "notes-manager-lab") {
      const notes = this.raceScene.getNotesManagerState();
      this.renderArchiveState(
        "CubX Systems — 3D Notes Block",
        "The recoverable Notes Manager is a 50-slot marble 3D block with one add cube. It belongs to CubX, not BallZ. The referenced GUI layout is absent and the source has no note text, edit, delete, save, or load model, so this revival keeps that incomplete boundary visible.",
        "Next Lab",
        [
          {
            label: "Default Note Block",
            source: "NotesManager.cpp; BlocNote.cpp; Note.cpp",
            status: notes?.loadStatus === "ready" ? "ported" : "preview",
            detail: "Exact capacity 50, 50×50×10 note boxes, 5×10 placement logic, initial count zero, and marble10 material."
          },
          {
            label: "Add Note Cube",
            source: "NotesManager::MeshClickedAction; Area.cpp",
            status: "ported",
            detail: "Exact 30-unit cube at archive position (0, -250, 0); clicking it or Add Note enables the next mesh."
          },
          {
            label: "Missing GUI/Data Model",
            source: "NoteMgrGUI.cpp; absent GUI/NoteMgrGUI.layout",
            status: "pipeline",
            detail: "Only a Quit callback survives. Real note content and persistence cannot be honestly reconstructed from current evidence."
          }
        ],
        "notes-manager-lab",
        [
          `<section class="wide-card"><span class="stat-label">Recovered Interaction</span><div class="race-list">
            <button class="race-card" data-notes-action="add"${(notes?.activeNotes ?? 0) >= 50 ? " disabled" : ""}><span>Add Note Mesh</span><small>enable slot ${(notes?.nextNoteIndex ?? 49) + 1} of 50 · or click the 3D add cube</small></button>
            <button class="race-card" data-notes-action="reset"><span>Reset Block</span><small>return to the exact zero-note initial state</small></button>
          </div></section>`,
          this.statCard("Active Notes", `${notes?.activeNotes ?? 0} / ${notes?.capacity ?? 50}<small>next index ${notes?.nextNoteIndex ?? "full"}</small>`),
          this.statCard("Archive Coordinates", "add cube (0, −250, 0)<small>parent-only 0.04 inspection scale keeps the full block visible</small>"),
          this.statCard("Honest Scope", "3D subsystem, incomplete GUI<small>no invented text editor, deletion, file format, or persistence</small>")
        ]
      );
      return;
    }

    if (state === "game-lab") {
      const presetLibrary = this.raceScene.getArchivedParticlePresetLibraryState();
      const selected = presetLibrary?.selected;
      const presetButtons = (presetLibrary?.library.entries ?? []).map((entry) => `<button class="mode-card mode-card-compact${selected?.id === entry.id ? " is-selected" : ""}" data-particle-preset-id="${escapeHtml(entry.id)}"><span>${escapeHtml(entry.label)}</span><small>${escapeHtml(entry.category)} · ${entry.playable ? "readable" : "opaque evidence"}</small></button>`).join("");
      this.renderArchiveState(
        "Engine & FX Lab",
        "The complete audited particle preset library now runs beside clearly labeled modern diagnostic fountains. Readable TVPJ values, aliases, textures and the surviving attractor remain exact evidence; opaque binaries and the missing clumpy_blurry texture stay explicit instead of receiving invented configurations.",
        "Next Lab",
        GAME_RECOVERY_ITEMS,
        "game-lab",
        [
          `<section class="wide-card"><span class="stat-label">Archived Particle Presets</span><div class="mode-list">${presetButtons || "Loading the exact library census…"}</div></section>`,
          `<section class="wide-card"><span class="stat-label">Selected Preset</span><strong>${escapeHtml(selected?.label ?? "Loading exact DDS assets…")}</strong><small>${selected ? `${escapeHtml(selected.availability)} · ${selected.emitterConfigs.length} emitter configs · ${selected.attractorConfigs.length} attractors · ${presetLibrary?.counts.activeParticles ?? 0}/${presetLibrary?.counts.emitterCapacity ?? 0} active` : "16 readable presets and three opaque binaries"}</small><div class="race-list"><button class="race-card" data-particle-preset-action="previous"><span>Previous</span><small>previous audited preset</small></button><button class="race-card" data-particle-preset-action="next"><span>Next</span><small>next audited preset</small></button><button class="race-card" data-particle-preset-action="restart"><span>Restart</span><small>deterministic exact-config playback</small></button><button class="race-card${presetLibrary?.paused ? " is-selected" : ""}" data-particle-preset-action="pause"><span>${presetLibrary?.paused ? "Resume" : "Pause"}</span><small>inspection control · not archive behavior</small></button><button class="race-card${presetLibrary?.autoReplay ? " is-selected" : ""}" data-particle-preset-action="auto"><span>Auto Replay</span><small>${presetLibrary?.autoReplay ? "on" : "off"} · inspection convenience</small></button></div></section>`,
          this.statCard("Library Census", `${presetLibrary?.library.counts.readablePresets ?? 16} readable / ${presetLibrary?.library.counts.opaqueCompiledPresets ?? 3} opaque<small>${presetLibrary?.library.counts.emitters ?? 29} emitters · ${presetLibrary?.library.counts.attractors ?? 1} attractor · ${presetLibrary?.library.counts.missingTextureBindings ?? 1} missing binding</small>`),
          this.statCard("Evidence", `${escapeHtml(selected?.runtimeEvidence ?? "loading callsite evidence")}<small>${selected?.readable ? selected.textureBindings.map((texture) => `${escapeHtml(texture.name)}:${escapeHtml(texture.status)}`).join(" · ") || "no texture binding" : escapeHtml(selected?.reason ?? "opaque data retained without simulation")}</small>`),
          this.statCard("Diagnostic Rigs", "fire / energy / plasma<small>three modern persistent fountains remain visibly labeled as diagnostics</small>"),
          this.statCard("Combat Lane", "actors / aim / projectiles<small>impact ring, trigger zone, flame billboards, and shooting backlog</small>")
        ]
      );
      return;
    }

    if (state === "map-editor") {
      this.raceScene.setMapEditorDraft(this.getMapEditorDraft());
      this.renderArchiveState(
        "BallZ Map Editor",
        "A shared human/agent level library for BallZ-style arena maps. Paint the grid or edit named regions through gx.levels; the same revision drives the 3D preview and playable race.",
        "Next Lab",
        MAP_EDITOR_RECOVERY_ITEMS,
        "map-editor",
        [
          `<section class="wide-card"><span class="stat-label">Draft Actions</span><div class="race-list">
            <button class="race-card" data-editor-play><span>Play This Map</span><small>build it as a real race and drive it</small></button>
            <button class="race-card" data-editor-reset><span>Replace With Starter</span><small>this named level → default 11×11 layout</small></button>
          </div></section>`,
          this.mapEditorLibrary(),
          this.mapEditorPalette(),
          this.mapEditorGrid(),
          this.statCard("Draft Stats", this.formatMapEditorStats()),
          this.statCard("Export Draft", `<code>${escapeHtml(this.formatMapEditorExport())}</code>`)
        ]
      );
      return;
    }

    if (state === "physics-lab") {
      this.renderArchiveState(
        "Physics Lab",
        "Newton-style constraints running live in cannon-es: this is the seed of the joints/hinges/sliders backlog item.",
        "Next Lab",
        [
          {
            label: "Pendulum Chain",
            source: "Newton distance joints",
            status: "ported",
            detail: "Four-link chain swinging from a fixed anchor via distance constraints."
          },
          {
            label: "Seesaw Hinge",
            source: "Newton hinge joints",
            status: "ported",
            detail: "Plank on a hinge constraint, tipped by the wrecking ball."
          },
          {
            label: "Rigid Stack + Wrecking Ball",
            source: "Scene3D physics callbacks",
            status: "ported",
            detail: "Box stack gets knocked down; the ball respawns automatically when it falls off the plate."
          }
        ],
        "physics-lab",
        [this.statCard("Simulation", "cannon-es world stepping live in preview<small>same solver the races use</small>")]
      );
      return;
    }

    if (state === "input-device-lab") {
      this.renderArchiveState(
        "Input & Device Lab",
        "One best-version diagnostic lab consolidates the BallZ18 controller monitor, GraphysX robot and sonar console, AtmelCubx I/O schedules, and MeArm controls. It always opens in simulation: no COM port is scanned, hard-coded, or opened.",
        "Next Lab",
        [
          {
            label: "BallZ18 Input Monitor",
            source: "ManetteLink.cs; PointerUpdate.cs; InputManager.asset",
            status: "ported",
            detail: "Live axis 0 / inverted axis 1 with the source 0.19 deadzone, x100 readout, 145px ring, 25px pointer, and Fire1/2/3/Jump lamps."
          },
          {
            label: "Robot + Sonar Protocols",
            source: "ArduinoGUI; PhysXRobot.ino; BallZ18 ArduinoComm.cs",
            status: "ported",
            detail: "Exact 4-byte and 5-byte frames, identify variants, pin 8, 2/4/6/8 controls, single sonar, and both passes of the 182-point sweep run in a bounded simulation log."
          },
          {
            label: "AtmelCubx + MeArm",
            source: "AtmelCubx MainCubx.cpp; TV3DMoteur.cpp; MeArm client/firmware",
            status: "ported",
            detail: "Eight I/O channels, four HHMM schedules, D/E/S/C protocol evidence, 0–180° servo clamps, and repaired left/right/claw value assignment."
          },
          {
            label: "Physical Serial Transport",
            source: "Web Serial safety adapter",
            status: "pipeline",
            detail: "The port picker remains intentionally disabled until the cancellable parser/send queue and disconnect lifecycle receive hardware QA; simulation never requests permission."
          }
        ],
        "input-device-lab",
        this.inputDeviceDashboard()
      );
      requestAnimationFrame(() => this.renderDeviceInputLiveHud());
      return;
    }

    if (state === "math-lab") {
      this.renderArchiveState(
        "Math Game",
        "Shape the exact 10,000-molecule / 100-lane field with the recovered A/B/C/M/X formula controls. The archive implemented this as a visual formula workbench—not a scored puzzle—so modern convenience presets are labeled as inspection aids instead of invented legacy goals.",
        "Next Lab",
        [
          {
            label: "Formula Sliders",
            source: "Scene3D/MathGameScreen.cpp",
            status: "ported",
            detail: "A/B/C/M/X controls update the preview immediately."
          },
          {
            label: "Molecules",
            source: "Formulas::moleculesCreate / moleculesUpdate; ArduinoGUI MathScreen.cs",
            status: "ported",
            detail: "10,000 instances in 100 z-lanes follow the exact parabola/slope formulas and blue-to-red lane gradient; world scale is adapted for the browser."
          },
          {
            label: "No Archived Score Loop",
            source: "MathGameScreen.cpp; MathScreen.cs",
            status: "ported",
            detail: "Neither surviving implementation defines goals, scoring, success, or failure. Presets are disclosed modern inspection conveniences."
          }
        ],
        "math-lab",
        [this.mathWorkbench()]
      );
      return;
    }

    if (state === "editor-lab") {
      this.renderArchiveState(
        "Editor Lab",
        "A modern holding surface for the old map editor: object picking, load/save, add mesh, and primitive creation.",
        "Next Lab",
        EDITOR_RECOVERY_ITEMS,
        "editor-lab",
        [
          this.statCard("Selected", "SelectedMeshPreview<small>name, primitive, transform, material lane</small>"),
          this.statCard("Object Set", "cube / sphere / cylinder / cone / floor<small>plus piston and rotator proxies</small>")
        ]
      );
      return;
    }

    if (state === "cubx-lab") {
      this.renderArchiveState(
        "CubZ Animated Menu",
        "Click one of the eight cubes. Cube 0 opens immediately as in source; selections 1–7 follow their decoded CubeRot ranges, then CubeOpen runs frames 0–50 at 30 fps. Close reverses that clip before the repaired same-range return; the separate older CubXActor lineage is not substituted for CubZ.",
        "Next Lab",
        CUBX_RECOVERY_ITEMS,
        "cubx-lab",
        [
          this.cubXWorkbench(),
          this.statCard("Control Surface", "clock / light / fan<small>old domotic panel rebuilt as browser objects</small>")
        ]
      );
      return;
    }

    if (state === "cubx-actor-lineage") {
      const lineage = this.raceScene.getCubxActorLineageState();
      const pairIndex = lineage?.clip.pairIndex ?? 1;
      const clipButtons = (["closed", "get", "rot", "open-full", "open-solo"] as const)
        .map((family) => `<button class="mode-card mode-card-compact${lineage?.clip.family === family ? " is-selected" : ""}" data-cubx-lineage-clip="${family}" data-cubx-lineage-pair="${pairIndex}"><span>${family}</span><small>exact decoded family</small></button>`)
        .join("");
      const clickButtons = Array.from({ length: 8 }, (_, offset) => {
        const click = offset + 1;
        const selected = lineage?.clickInspection?.clickIndex === click;
        return `<button class="mode-card mode-card-compact${selected ? " is-selected" : ""}" data-cubx-lineage-click="${click}"><span>Click ${click}</span><small>${click === 8 ? "broken slot 7 · no actor" : `Get${click + 1}`}</small></button>`;
      }).join("");
      this.renderArchiveState(
        "CubXActor Lineage — Separate Evidence Inspector",
        "This older Closed/Get/Rot/Open actor family is inspected on its own because its BoxNN labels and host indices conflict with CubZ. Exact geometry, click meshes, source frames and terminal holds are visible; click 8 remains a broken uninitialized slot instead of receiving an invented actor.",
        "Next Lab",
        [
          {
            label: "Exact Actor Lineage",
            source: "Media/CubXActor/*.tva; CubXMesh.tvm",
            status: "ported",
            detail: "Closed, Get2–8, Rot1–7, CubXOpen and CubeOpensolo geometry/hierarchies are decoded with exact 30 fps ranges and authored terminal holds."
          },
          {
            label: "Exact Click Evidence",
            source: "CubXBtn1–8.tvm; CubXMenu.cpp",
            status: "ported",
            detail: "All eight click meshes and their exact host calls are inspectable. Clicks 1–7 map to initialized slots; click 8 selects an uninitialized slot outside the render loop."
          },
          {
            label: "No CubZ Conflation",
            source: "CubXActor lineage comparison; CubeRot/CubeOpen audit",
            status: "pipeline",
            detail: "The family proves shared geometry lineage but not a stable click-index-to-BoxNN mapping. Raw TV3D handedness and interpolation also remain unverified."
          }
        ],
        "cubx-actor-lineage",
        [
          `<section class="wide-card"><span class="stat-label">Clip Family</span><div class="mode-list">${clipButtons}</div></section>`,
          `<section class="wide-card"><span class="stat-label">Click Flow</span><div class="mode-list">${clickButtons}</div></section>`,
          `<section class="wide-card"><span class="stat-label">Playback</span><strong>${escapeHtml(lineage?.clip.filename ?? "Loading decoded actor…")}</strong><small>frame ${lineage?.clip.sourceFrame.toFixed(2) ?? "0.00"} / ${lineage?.clip.endFrame ?? 0} · ${lineage?.clip.terminalHoldActive ? "terminal hold" : "motion"} · direction ${lineage?.clip.direction ?? 1}</small><div class="race-list"><button class="race-card${lineage?.clip.playing ? " is-selected" : ""}" data-cubx-lineage-action="play"><span>${lineage?.clip.playing ? "Pause" : "Play"}</span><small>exact 30 fps range</small></button><button class="race-card" data-cubx-lineage-action="reverse"><span>Reverse</span><small>toggle source direction</small></button><button class="race-card" data-cubx-lineage-action="step-back"><span>−1 Frame</span><small>pause and step</small></button><button class="race-card" data-cubx-lineage-action="step-forward"><span>+1 Frame</span><small>pause and step</small></button><button class="race-card${lineage?.geometry.buttonsVisible ? " is-selected" : ""}" data-cubx-lineage-action="buttons"><span>Click Meshes</span><small>exact CubXBtn TVMs</small></button><button class="race-card${lineage?.geometry.diagnosticColors ? " is-selected" : ""}" data-cubx-lineage-action="colors"><span>Diagnostic Colors</span><small>inspection aid only</small></button></div></section>`,
          this.statCard("Active Geometry", `${lineage?.geometry.vertices ?? 0} vertices / ${lineage?.geometry.triangles ?? 0} triangles<small>${lineage?.geometry.meshChunks ?? 0} mesh chunks · ${lineage?.geometry.hierarchyNodes ?? 0} hierarchy nodes</small>`),
          this.statCard("Boundary", "isolated from CubZ<small>click 8 stays broken · no stable BoxNN semantics claimed</small>")
        ]
      );
      return;
    }

    if (state === "asset-catalog") {
      this.renderArchiveState(
        "Asset Catalog",
        "Recovered textures, shaders, XML scenes, and 3D model sources are now tracked in the prototype.",
        "Next Lab",
        ASSET_RECOVERY_ITEMS,
        "asset-catalog",
        [
          this.statCard("Texture Wall", "Damier / 90Right / GridXL / RotatorUV / Suzanne1UV<small>plus concrete, flames, flare</small>"),
          this.statCard("Model Lane", "BallShell / BallCtrl / Suzanne / Airplane<small>Ball meshes and the FlightX airplane are decoded live; Suzanne fidelity remains partial</small>")
        ]
      );
      return;
    }

    if (state === "gameplay") {
      this.renderGameplayHud(this.raceScene.getSnapshot());
      this.primaryAction.textContent = "Restart Race";
      this.primaryAction.disabled = false;
      this.secondaryAction.textContent =
        this.gameplayOrigin === "world-select" ? "Exit To Worlds" : this.gameplayOrigin === "map-editor" ? "Exit To Editor" : "Exit To Tour";
      this.secondaryAction.hidden = false;
      return;
    }

    this.primaryAction.disabled = false;
    this.secondaryAction.hidden = false;
    const race = this.raceScene.getRace();
    const record = this.latestRecord ?? this.scoreboard.getRecord(race);
    this.title.textContent = "Race Complete";
    this.body.textContent =
      this.gameplayOrigin === "world-select"
        ? "Recovery trial recorded. This world remains categorized as an archive visit, not retroactively claimed as an original BallZ race."
        : "Scoreboard updated for this race. Beating the archive champion makes the local player the current champion.";
    this.primaryAction.textContent =
      this.gameplayOrigin === "map-editor" ? "Back To Editor" : this.gameplayOrigin === "world-select" ? "Next Recovery" : "Next BallZ Race";
    this.secondaryAction.textContent = "Replay Race";
    this.stats.className = "stats-grid";
    const runMedal = snapshot ? medalForTime(race, snapshot.elapsedMs) : null;
    const thresholds = getMedalThresholds(race);
    const medalDetail = runMedal
      ? `+${MEDAL_POINTS[runMedal]} pts (legacy scale)`
      : `bronze under ${formatRaceTime(thresholds.bronzeMs)}`;
    this.stats.innerHTML = [
      this.statCard("Race", escapeHtml(snapshot?.raceName ?? race.name)),
      this.statCard("Time", formatRaceTime(snapshot?.elapsedMs ?? 0)),
      this.statCard("Medal", `${formatMedal(runMedal)}<small>${medalDetail}</small>`),
      snapshot && snapshot.zombiesTotal > 0
        ? this.statCard("Zombies", `${snapshot.zombiesTotal} defeated`)
        : this.statCard("Rings", `${snapshot?.ringsCollected ?? 0} / ${snapshot?.ringsTotal ?? 0}`),
      race.laps
        ? this.statCard("Laps", `${snapshot?.lapsCompleted ?? 0} / ${snapshot?.lapsTotal ?? race.laps.count}<small>checkpoint bonus applied to final time</small>`)
        : "",
      this.statCard("Champion", `${escapeHtml(record.holder)}<small>${formatRaceTime(record.bestMs)}</small>`),
      this.statCard("Target", `${formatRaceTime(race.targetMs)}<small>${snapshot && snapshot.elapsedMs <= race.targetMs ? "target cleared" : "target still alive"}</small>`),
      this.statCard("Archive Note", escapeHtml(race.champion.note))
    ].join("");
  }

  private renderGameplayHud(snapshot: RaceSnapshot): void {
    const race = this.raceScene.getRace();
    const isFlightX = race.id === "flightx-pipe";
    const isLapRace = Boolean(race.laps);
    const debugSnapshot = this.raceScene.getDebugSnapshot();
    const flightState = debugSnapshot.flight;
    const ballControllerActive = !race.vehicle && !race.flight;
    const paused = this.raceScene.isRacePaused();
    this.title.textContent = paused ? `PAUSED — ${snapshot.raceName}` : snapshot.raceName;
    this.body.textContent = paused
      ? "The simulation clock, physics, objectives, particles, and recovered machinery are frozen. Resume with P or the touch control; Esc still exits safely."
      :
      snapshot.zombiesTotal > 0
        ? "Squash every zombie. Movement follows the camera, so orbit the view whenever the route feels unclear."
        : isFlightX
          ? "Fly the recovered airplane around pipe1 and clear the live route. The archive controls are restored; exact original mission and lap fidelity remains partial."
        : race.vehicle
          ? "Drive the oval through every ring, cross the amber halfway line, then return through the finish."
        : race.aiBall
          ? "Race the recovered BallAI through the exact Level01 circuit. The source timed recurring laps; this best-version revival adds a clearly disclosed three-lap finish."
        : isLapRace
          ? `Complete ${race.laps?.count ?? snapshot.lapsTotal} laps through the paired gates. Checkpoints are optional time bonuses, matching the archived lap mode.`
        : race.forceZones?.length
          ? "Zigzag through the arena while fire throws you outward and ice pulls you inward without stealing your momentum."
        : "Collect every ring, cross the amber halfway gate, then return through the cyan finish. Movement follows the camera.";
    this.primaryAction.textContent = "Restart Race";
    this.primaryAction.disabled = false;
    this.secondaryAction.textContent =
      this.gameplayOrigin === "world-select" ? "Exit To Worlds" : this.gameplayOrigin === "map-editor" ? "Exit To Editor" : "Exit To Tour";
    this.secondaryAction.hidden = false;
    this.stats.className = "stats-grid compact-grid";
    this.stats.innerHTML = [
      this.statCard("Time", formatRaceTime(snapshot.elapsedMs)),
      snapshot.zombiesTotal > 0
        ? this.statCard(
            "Zombies",
            `${snapshot.zombiesRemaining} left<small>${formatObjectiveHint(snapshot.nextObjective, snapshot.objectiveDistance)}</small>`
          )
        : isFlightX
          ? this.statCard(
              snapshot.ringsTotal > 0 ? "Flight Gates" : "Flight Run",
              snapshot.ringsTotal > 0
                ? `${snapshot.ringsCollected} / ${snapshot.ringsTotal}<small>${formatObjectiveHint(snapshot.nextObjective, snapshot.objectiveDistance)}</small>`
                : "Free-flight route<small>exact original mission and lap fidelity remains partial</small>"
            )
          : this.statCard(
              "Rings",
              `${snapshot.ringsCollected} / ${snapshot.ringsTotal}<small>${formatObjectiveHint(snapshot.nextObjective, snapshot.objectiveDistance)}</small>`
            ),
      race.forceZones?.length
        ? this.statCard(
            "Live Force",
            debugSnapshot.forceZone
              ? `${debugSnapshot.forceZone.kind === "fire" ? "FIRE — REPEL" : "ICE — ATTRACT"}<small>${escapeHtml(debugSnapshot.forceZone.name)} · ${debugSnapshot.forceZonesTotal} editable zones</small>`
              : `BALANCED<small>${debugSnapshot.forceZonesTotal} editable fire/ice zones ahead</small>`
          )
        : "",
      snapshot.rival
        ? this.statCard(
            "AI Rivals",
            `${escapeHtml(snapshot.rival.label)}<small>Raceline ${snapshot.rival.waypoint} / ${snapshot.rival.waypointsTotal} · circuits ${snapshot.rival.circuitsCompleted}</small>`
          )
        : "",
      snapshot.zombiesTotal > 0
        ? this.statCard("Mode", "ZombieKiller<small>infection spreads on contact</small>")
        : isFlightX
          ? this.statCard(
              "Flight State",
              flightState
                ? `${flightState.speed.toFixed(1)} u/s<small>${escapeHtml(flightState.objective)} · thrust ${flightState.thrust} · roll ${flightState.roll} · pitch ${flightState.pitch}${flightState.airbrake ? " · airbrake" : ""}</small>`
                : "Preparing airplane<small>archive airplane + decoded pipe1</small>"
            )
        : isLapRace
          ? this.statCard(
              "Lap",
              `${Math.min(snapshot.lapsTotal, snapshot.lapsCompleted + 1)} / ${snapshot.lapsTotal}<small>${snapshot.hasReachedHalfway ? "return through finish" : "cross halfway pair"}</small>`
            )
          : this.statCard("Lap State", snapshot.hasReachedHalfway ? "Return To Finish" : "Reach Halfway"),
      isFlightX
        ? this.statCard("Flight Controls", "←/→ roll · ↑/↓ pitch<small>W/S thrust · Space airbrake · R reset orientation · Esc exit</small>")
        : race.vehicle
        ? this.statCard("Controls", "W/S throttle · A/D steer<small>drag + wheel camera · C reset view</small>")
        : this.statCard("Camera", "Drag + wheel<small>C resets behind the starting direction</small>"),
      ballControllerActive
          ? this.statCard(
              "BallZ Setup",
            `${debugSnapshot.ballPreset === "classic2015" ? "Classic 2015" : debugSnapshot.ballPreset === "fire" ? "Fire" : "Revival"}<small>B cycles Fire / Classic / Revival · ${debugSnapshot.ghost.hasBest && debugSnapshot.ghost.bestTimeMs !== null ? `best ghost ${formatRaceTime(debugSnapshot.ghost.bestTimeMs)}` : `recording first ghost (${debugSnapshot.ghost.recordingSamples} samples)`}</small>`
          )
        : "",
      this.statCard("Archive Champ", formatRaceTime(snapshot.archiveChampionMs)),
      this.statCard("Target", formatRaceTime(snapshot.targetMs))
    ].join("");
  }

  private installDebugHooks(): void {
    const debugApi = {
      snapshot: (): RaceDebugSnapshot => this.raceScene.getDebugSnapshot(),
      state: (): AppState => this.state,
      pauseRace: (paused: boolean): boolean => {
        this.setGameplayPaused(paused);
        return this.raceScene.isRacePaused() === paused;
      },
      inputState: () => this.raceScene.getInputState(),
      setVirtualInput: (payload: { code: string; down: boolean }): boolean =>
        this.raceScene.setVirtualInput(payload.code, payload.down),
      // Only expose entries that are actually reachable through a player-facing
      // selector. Experimental/orphan definitions must not masquerade as
      // playable recovery coverage in the regression matrix.
      raceIds: (): string[] => [...BALLZ_RACES, ...RECOVERED_WORLD_RACES].map((race) => race.id),
      worldFamilyRaceIds: (): Record<WorldFamilyId, string[]> => Object.fromEntries(
        Object.entries(WORLD_FAMILY_RACES).map(([family, races]) => [family, races.map((race) => race.id)])
      ) as Record<WorldFamilyId, string[]>,
      selectRace: (raceId: string): boolean => {
        if (!RACE_DEFINITIONS.some((race) => race.id === raceId)) {
          return false;
        }
        this.raceScene.setRace(raceId);
        if (RECOVERED_WORLD_IDS.has(raceId)) {
          this.showWorldSelect();
        } else {
          this.showRaceSelect();
        }
        return true;
      },
      startRace: (): boolean => {
        this.startCurrentRace();
        return this.state === "gameplay";
      },
      openSceneIndex: (): boolean => {
        this.openArchiveMode("scene-index");
        return this.state === "scene-index";
      },
      cubxState: () => this.raceScene.getCubXMenuState(),
      openCubXMenu: (): boolean => {
        this.openArchiveMode("cubx-lab");
        return this.state === "cubx-lab";
      },
      openCubX: (cubeIndex: number): boolean => this.raceScene.selectCubXCube(cubeIndex),
      activateCubX: (actionIndex: number): boolean => this.raceScene.activateCubXAction(actionIndex),
      activateCubXSatellite: (id: CubXSatelliteId): boolean => this.raceScene.activateCubXSatellite(id),
      selectBallPreset: (preset: BallPreset): BallPreset => this.raceScene.setBallPreset(preset),
      launchCubXSun: (): boolean => this.raceScene.launchCubXSun(),
      closeCubX: (): boolean => this.raceScene.closeCubXMenu(),
      openCubxActorLineage: (): boolean => {
        this.openArchiveMode("cubx-actor-lineage");
        return this.state === "cubx-actor-lineage";
      },
      cubxActorLineageState: () => this.raceScene.getCubxActorLineageState(),
      setCubxActorLineageClip: (payload: { family: CubxActorClipFamily; pairIndex?: CubxActorPairIndex }): boolean =>
        this.raceScene.setCubxActorLineageClip(payload.family, payload.pairIndex ?? 1),
      selectCubxActorLineageClick: (clickIndex: CubxActorClickIndex): boolean => this.raceScene.selectCubxActorLineageClick(clickIndex),
      stepCubxActorLineage: (frames: number): boolean => this.raceScene.stepCubxActorLineageFrames(frames),
      playCubxActorLineage: (playing: boolean): boolean => this.raceScene.setCubxActorLineagePlaying(playing),
      setCubxActorLineageDirection: (direction: CubxActorPlaybackDirection): boolean => this.raceScene.setCubxActorLineageDirection(direction),
      setCubxActorLineageButtons: (visible: boolean): boolean => this.raceScene.setCubxActorLineageButtonsVisible(visible),
      setCubxActorLineageColors: (enabled: boolean): boolean => this.raceScene.setCubxActorLineageDiagnosticColors(enabled),
      openCommonRoom: (): boolean => {
        this.openArchiveMode("common-room-lab");
        return this.state === "common-room-lab";
      },
      commonRoomState: () => this.raceScene.getCommonRoomEnvironmentState(),
      commonArchiveState: () => this.raceScene.getCommonArchiveEnvironmentState(),
      commonEnvironmentSelection: () => this.raceScene.getCommonEnvironmentSelection(),
      selectCommonEnvironment: (space: "room1" | "sky-component" | "room2-shadow"): boolean =>
        this.raceScene.selectCommonEnvironment(space),
      orbitCommonRoom: (deltaRadians: number): boolean => this.raceScene.orbitCommonRoomByRadians(deltaRadians),
      openThreejsPlayground: (): boolean => {
        this.openArchiveMode("threejs-playground");
        return this.state === "threejs-playground";
      },
      threejsPlaygroundState: () => this.raceScene.getThreejsPlaygroundState(),
      orbitThreejsPlayground: (deltaRadians: number): boolean => this.raceScene.orbitThreejsPlaygroundByRadians(deltaRadians),
      zoomThreejsPlayground: (factor: number): boolean => this.raceScene.zoomThreejsPlayground(factor),
      setThreejsPlaygroundParameter: (parameter: ThreejsPlaygroundParameter, value: number): boolean => this.raceScene.setThreejsPlaygroundParameter(parameter, value),
      resetThreejsPlayground: (): boolean => this.raceScene.resetThreejsPlayground(),
      openBallzBlenderLevel1: (): boolean => {
        this.openArchiveMode("ballz-blender-level1");
        return this.state === "ballz-blender-level1";
      },
      ballzBlenderLevel1State: () => this.raceScene.getBallzBlenderLevel1State(),
      setBallzBlenderLevel1Camera: (profile: ArchiveBlenderCameraProfile): boolean => this.raceScene.setBallzBlenderLevel1Camera(profile),
      orbitBallzBlenderLevel1: (deltaRadians: number): boolean => this.raceScene.orbitBallzBlenderLevel1(deltaRadians),
      resetBallzBlenderLevel1: (): boolean => this.raceScene.resetBallzBlenderLevel1(),
      openMaisonExplorer: (): boolean => {
        this.openArchiveMode("maison-explorer");
        return this.state === "maison-explorer";
      },
      maisonExplorerState: () => this.raceScene.getMaisonExplorerState(),
      selectMaisonSubspace: (id: MaisonSubspaceId): boolean => this.raceScene.selectMaisonSubspace(id),
      setMaisonCamera: (profile: ArchiveBlenderCameraProfile): boolean => this.raceScene.setMaisonCamera(profile),
      orbitMaisonExplorer: (deltaRadians: number): boolean => this.raceScene.orbitMaisonExplorer(deltaRadians),
      resetMaisonExplorer: (): boolean => this.raceScene.resetMaisonExplorer(),
      openArenaArchive: (): boolean => {
        this.openArchiveMode("arena-archive");
        return this.state === "arena-archive";
      },
      arenaArchiveState: () => this.raceScene.getArenaArchiveState(),
      setArenaArchiveCamera: (profile: "source" | "overview"): boolean => this.raceScene.setArenaArchiveCamera(profile),
      orbitArenaArchive: (deltaRadians: number): boolean => this.raceScene.orbitArenaArchive(deltaRadians),
      resetArenaArchive: (): boolean => this.raceScene.resetArenaArchive(),
      openBallz2011Level1: (): boolean => {
        this.openArchiveMode("ballz-2011-level1");
        return this.state === "ballz-2011-level1";
      },
      ballz2011Level1State: () => this.raceScene.getBallz2011Level1State(),
      setBallz2011Level1Edges: (visible: boolean): boolean => this.raceScene.setBallz2011Level1Edges(visible),
      setBallz2011Level1Bounds: (visible: boolean): boolean => this.raceScene.setBallz2011Level1Bounds(visible),
      openBallzSlide1: (): boolean => {
        this.openArchiveMode("ballz-slide1");
        return this.state === "ballz-slide1";
      },
      ballzSlide1State: () => this.raceScene.getBallzSlide1State(),
      setBallzSlide1Ball: (visible: boolean): boolean => this.raceScene.setBallzSlide1BallVisible(visible),
      setBallzSlide1Edges: (visible: boolean): boolean => this.raceScene.setBallzSlide1Edges(visible),
      setBallzSlide1Bounds: (visible: boolean): boolean => this.raceScene.setBallzSlide1Bounds(visible),
      openBallzTrackGallery: (): boolean => {
        this.openArchiveMode("ballz-track-gallery");
        return this.state === "ballz-track-gallery";
      },
      ballzTrackGalleryState: () => this.raceScene.getBallzTrackGalleryState(),
      selectBallzTrackGalleryAsset: (id: BallzTrackGalleryAssetId): boolean => this.raceScene.selectBallzTrackGalleryAsset(id),
      setBallzTrackGalleryMaterial: (mode: BallzTrackGalleryMaterialMode): boolean => this.raceScene.setBallzTrackGalleryMaterialMode(mode),
      setBallzTrackGalleryEdges: (visible: boolean): boolean => this.raceScene.setBallzTrackGalleryEdges(visible),
      setBallzTrackGalleryBounds: (visible: boolean): boolean => this.raceScene.setBallzTrackGalleryBounds(visible),
      setBallzTrackGalleryCamera: (profile: BallzTrackGalleryCameraProfile): boolean => this.raceScene.setBallzTrackGalleryCamera(profile),
      openXmlMyWorldCopy: (): boolean => {
        this.openArchiveMode("xml-myworld-copy");
        return this.state === "xml-myworld-copy";
      },
      xmlSceneState: () => this.raceScene.getXmlSceneState(),
      orbitXmlScene: (delta: number): boolean => this.raceScene.orbitXmlSceneByRadians(delta),
      resetXmlSceneOrbit: (): boolean => this.raceScene.resetXmlSceneOrbit(),
      setXmlSceneObject: (payload: { name: string; visible: boolean }): boolean => this.raceScene.setXmlSceneObjectVisible(payload.name, payload.visible),
      resetXmlSceneObjects: (): boolean => this.raceScene.resetXmlSceneObjects(),
      openBallzXmlWorlds: (): boolean => {
        this.openArchiveMode("ballz-xml-worlds");
        return this.state === "ballz-xml-worlds";
      },
      ballzXmlWorldsState: () => this.raceScene.getBallzXmlWorldsState(),
      selectBallzXmlWorld: (id: "myworld" | "testworld"): boolean => this.raceScene.selectBallzXmlWorld(id),
      focusNextBallzXmlWorldObject: (): number | null => this.raceScene.focusNextBallzXmlWorldObject(),
      orbitBallzXmlWorlds: (delta: number): boolean => this.raceScene.orbitBallzXmlWorldsByRadians(delta),
      resetBallzXmlWorlds: (): boolean => this.raceScene.resetBallzXmlWorlds(),
      openXmlSerializerArtifacts: (): boolean => {
        this.openArchiveMode("xml-serializer-artifacts");
        return this.state === "xml-serializer-artifacts";
      },
      xmlSerializerArtifactState: () => this.raceScene.getStockroomXmlArtifactState(),
      selectXmlSerializerArtifact: (id: "base-scene" | "test1"): boolean => this.raceScene.selectStockroomXmlArtifact(id),
      orbitXmlSerializerArtifact: (delta: number): boolean => this.raceScene.orbitStockroomXmlArtifactByRadians(delta),
      resetXmlSerializerArtifact: (): boolean => this.raceScene.resetStockroomXmlArtifact(),
      openVehiclePackGallery: (): boolean => {
        this.openArchiveMode("vehicle-pack-gallery");
        return this.state === "vehicle-pack-gallery";
      },
      vehiclePackState: () => this.raceScene.getVehiclePackState(),
      selectVehiclePackAsset: (id: "gt4" | "low-cobra"): Promise<boolean> => this.raceScene.selectVehiclePackAsset(id),
      orbitVehiclePack: (delta: number): boolean => this.raceScene.orbitVehiclePackByRadians(delta),
      resetVehiclePack: (): boolean => this.raceScene.resetVehiclePackView(),
      openObjectLibraryCatalog: (): boolean => {
        this.openArchiveMode("object-library-catalog");
        return this.state === "object-library-catalog";
      },
      objectLibraryCatalogState: () => this.raceScene.getObjectLibraryCatalogState(),
      setObjectLibraryFamily: (family: ObjectLibraryFamily): boolean => this.raceScene.setObjectLibraryFamilyFilter(family),
      setObjectLibraryStatus: (status: ObjectLibraryStatusFilter): boolean => this.raceScene.setObjectLibraryStatusFilter(status),
      selectObjectLibraryIndex: (index: number): boolean => this.raceScene.selectObjectLibraryIndex(index),
      selectNextObjectLibraryObject: (direction: number): boolean => this.raceScene.selectNextObjectLibraryObject(direction),
      orbitObjectLibraryCatalog: (delta: number): boolean => this.raceScene.orbitObjectLibraryCatalogByRadians(delta),
      zoomObjectLibraryCatalog: (factor: number): boolean => this.raceScene.zoomObjectLibraryCatalog(factor),
      resetObjectLibraryCatalog: (): boolean => this.raceScene.resetObjectLibraryCatalog(),
      openDominusAssetGallery: (): boolean => {
        this.openArchiveMode("dominus-asset-gallery");
        return this.state === "dominus-asset-gallery";
      },
      dominusAssetGalleryState: () => this.raceScene.getDominusAssetGalleryState(),
      setDominusAssetFamily: (family: DominusAssetFamily): Promise<boolean> => this.raceScene.setDominusAssetFamilyFilter(family),
      setDominusAssetStatus: (status: DominusAssetStatusFilter): Promise<boolean> => this.raceScene.setDominusAssetStatusFilter(status),
      selectDominusAssetIndex: (index: number): Promise<boolean> => this.raceScene.selectDominusAssetIndex(index),
      selectNextDominusAsset: (direction: number): Promise<boolean> => this.raceScene.selectNextDominusAsset(direction),
      orbitDominusAssetGallery: (delta: number): boolean => this.raceScene.orbitDominusAssetGalleryByRadians(delta),
      zoomDominusAssetGallery: (factor: number): boolean => this.raceScene.zoomDominusAssetGallery(factor),
      resetDominusAssetGallery: (): Promise<boolean> => this.raceScene.resetDominusAssetGallery(),
      openDominusPortEvidence: (): boolean => {
        this.openArchiveMode("dominus-port-evidence");
        return this.state === "dominus-port-evidence";
      },
      dominusPortEvidenceState: () => this.raceScene.getDominusPortEvidenceState(),
      selectDominusPortEvidence: (payload: { id: string; focus?: boolean }): boolean =>
        this.raceScene.selectDominusPortEvidence(payload.id, payload.focus ?? true),
      selectNextDominusPortEvidence: (direction: number): boolean => this.raceScene.selectNextDominusPortEvidence(direction),
      orbitDominusPortEvidence: (delta: number): boolean => this.raceScene.orbitDominusPortEvidenceByRadians(delta),
      zoomDominusPortEvidence: (factor: number): boolean => this.raceScene.zoomDominusPortEvidence(factor),
      showDominusPortSourceGrid: (): boolean => this.raceScene.showDominusPortSourceGrid(),
      resetDominusPortEvidence: (): boolean => this.raceScene.resetDominusPortEvidence(),
      openEngineFxLab: (): boolean => {
        this.openArchiveMode("game-lab");
        return this.state === "game-lab";
      },
      archivedParticlePresetLibraryState: () => this.raceScene.getArchivedParticlePresetLibraryState(),
      selectArchivedParticlePreset: (id: string): boolean => this.raceScene.selectArchivedParticlePreset(id),
      selectNextArchivedParticlePreset: (direction: number): boolean => this.raceScene.selectNextArchivedParticlePreset(direction),
      restartArchivedParticlePreset: (): boolean => this.raceScene.restartArchivedParticlePreset(),
      pauseArchivedParticlePreset: (paused: boolean): boolean => this.raceScene.setArchivedParticlePresetPaused(paused),
      autoReplayArchivedParticlePreset: (autoReplay: boolean): boolean => this.raceScene.setArchivedParticlePresetAutoReplay(autoReplay),
      openSuzanne2Archive: (): boolean => {
        this.openArchiveMode("suzanne2-archive");
        return this.state === "suzanne2-archive";
      },
      suzanne2State: () => this.raceScene.getSuzanne2State(),
      setSuzanne2Player: (visible: boolean): boolean => this.raceScene.setSuzanne2PlayerVisible(visible),
      setSuzanne2Xml: (visible: boolean): boolean => this.raceScene.setSuzanne2XmlVisible(visible),
      setSuzanne2Cubx: (visible: boolean): boolean => this.raceScene.setSuzanne2CubxVisible(visible),
      setSuzanne2Piston: (payload: { index: number; activation: number }): boolean => this.raceScene.setSuzanne2PistonActivation(payload.index, payload.activation),
      resetSuzanne2Rings: (): boolean => this.raceScene.resetSuzanne2Rings(),
      openNotesManager: (): boolean => {
        this.openArchiveMode("notes-manager-lab");
        return this.state === "notes-manager-lab";
      },
      notesManagerState: () => this.raceScene.getNotesManagerState(),
      addArchiveNote: (): number | null => this.raceScene.addArchiveNote(),
      resetArchiveNotes: (): boolean => this.raceScene.resetArchiveNotes(),
      openMilkyWay: (): boolean => {
        this.openArchiveMode("milky-way-lab");
        return this.state === "milky-way-lab";
      },
      milkyWayState: () => this.raceScene.getMilkyWayState(),
      setMilkyWayProfile: (profile: "graphysx2017" | "ballz2015"): boolean => this.raceScene.setMilkyWayProfile(profile),
      resetMilkyWay: (): boolean => this.raceScene.resetMilkyWay(),
      skyboxSelectorState: () => this.raceScene.getSkyboxSelectorState(),
      openSkyboxSelector: (): boolean => {
        this.openArchiveMode("skybox-selector");
        return this.state === "skybox-selector";
      },
      selectSkybox: (id: SkyboxSelectorId): boolean => this.raceScene.selectSkyboxFromArchive(id),
      resetSkyboxSelector: (): boolean => this.raceScene.resetSkyboxSelector(),
      carSelectorState: () => this.raceScene.getCarSelectorState(),
      openCarSelector: (): boolean => {
        this.openArchiveMode("car-selector");
        return this.state === "car-selector";
      },
      resetCarSelector: (): boolean => this.raceScene.resetCarSelector(),
      openNatureLab: (): boolean => {
        this.openArchiveMode("nature-lab");
        return this.state === "nature-lab";
      },
      natureState: () => this.raceScene.getNatureLabState(),
      natureRecipe: () => this.raceScene.getNatureLabRecipe(),
      worldRecipes: (): readonly GraphysXWorldRecipe[] => GRAPHYSX_WORLD_RECIPES,
      loadNatureRecipe: (recipeOrId: GraphysXWorldRecipe | string): boolean => {
        const recipe = typeof recipeOrId === "string" ? findWorldRecipe(recipeOrId) : recipeOrId;
        if (!recipe || !isGraphysXWorldRecipe(recipe)) {
          return false;
        }
        const loaded = this.raceScene.loadNatureLabRecipe(recipe);
        if (loaded) {
          this.setState("nature-lab");
        }
        return loaded;
      },
      selectNatureStudy: (study: NatureLabStudyId): boolean => {
        const selected = this.raceScene.setNatureLabStudy(study);
        if (selected) {
          this.setState("nature-lab");
        }
        return selected;
      },
      selectNatureLesson: (lesson: NatureLabLessonId): boolean =>
        this.updateNatureFromAgent(() => this.raceScene.setNatureLabLesson(lesson)),
      pauseNatureLab: (paused: boolean): boolean =>
        this.updateNatureFromAgent(() => this.raceScene.setNatureLabPaused(paused)),
      stepNatureLab: (seconds = 0.5): boolean =>
        this.updateNatureFromAgent(() => this.raceScene.stepNatureLab(seconds)),
      actInNatureLab: (): boolean =>
        this.updateNatureFromAgent(() => this.raceScene.performNatureLabAction()),
      setNatureParameter: (parameter: NatureLabParameter, value: number): boolean =>
        this.updateNatureFromAgent(() => this.raceScene.setNatureLabParameter(parameter, value)),
      setNatureLayer: (layer: NatureLabLayer, visible: boolean): boolean =>
        this.updateNatureFromAgent(() => this.raceScene.setNatureLabLayer(layer, visible)),
      setNatureObserver: (observer: GraphysXWorldObserver): boolean =>
        this.updateNatureFromAgent(() => this.raceScene.setNatureLabObserver(observer)),
      toggleNatureTrails: (): boolean | null => {
        const trails = this.raceScene.toggleNatureLabTrails();
        if (trails !== null && this.state === "nature-lab") {
          this.setState("nature-lab");
        }
        return trails;
      },
      resetNatureLab: (): boolean => this.updateNatureFromAgent(() => this.raceScene.resetNatureLab()),
      openAgentWorldStudio: (): boolean => {
        this.openArchiveMode("world-api-lab");
        return this.state === "world-api-lab";
      },
      agentWorldState: () => this.raceScene.getAgentWorldState(),
      selectAgentEntities: (ids: string[]) => this.raceScene.selectAgentWorldEntities(ids),
      createAgentWorld: (definition: AgentWorldDefinition) => {
        this.ensureAgentWorldStudio();
        return this.raceScene.createAgentWorld(definition);
      },
      importLegacyAgentWorldXml: (xml: string, options?: AgentWorldLegacyXmlOptions) => this.importLegacyAgentWorldXml(xml, options),
      loadAgentWorldDemo: () => {
        this.ensureAgentWorldStudio();
        return this.raceScene.createAgentWorld(GRAPHYSX_AGENT_DEMO_WORLD);
      },
      clearAgentWorld: (id?: string, label?: string) => {
        this.ensureAgentWorldStudio();
        return this.raceScene.clearAgentWorld(id, label);
      },
      spawnAgentEntity: (entity: AgentWorldEntityDefinition) => this.raceScene.spawnAgentWorldEntity(entity),
      updateAgentEntity: (id: string, patch: AgentWorldEntityPatch) => this.raceScene.updateAgentWorldEntity(id, patch),
      removeAgentEntity: (id: string) => this.raceScene.removeAgentWorldEntity(id),
      attachAgentBehavior: (id: string, behavior: AgentWorldBehavior) => this.raceScene.attachAgentWorldBehavior(id, behavior),
      detachAgentBehavior: (id: string, behaviorId: string) => this.raceScene.detachAgentWorldBehavior(id, behaviorId),
      interactAgentEntity: (id: string, interactionId?: string) => this.raceScene.interactAgentWorld(id, interactionId),
      listAgentWorldPrefabs: () => GRAPHYSX_AGENT_WORLD_PREFABS,
      spawnAgentWorldPrefab: (prefabId: AgentWorldPrefabId, options?: AgentWorldPrefabOptions) => this.raceScene.spawnAgentWorldPrefab(prefabId, options),
      listAgentWorldStarters: () => GRAPHYSX_AGENT_WORLD_STARTERS,
      loadAgentWorldStarter: (starterId: AgentWorldStarterId, options?: AgentWorldStarterOptions) => {
        this.ensureAgentWorldStudio();
        return this.raceScene.loadAgentWorldStarter(starterId, options);
      },
      transactAgentWorld: (commands: AgentWorldCommand[]) => this.raceScene.transactAgentWorld(commands),
      commitAgentWorld: (changeSet: AgentWorldChangeSet) => this.raceScene.commitAgentWorld(changeSet),
      agentWorldHistory: (sinceRevision?: number) => this.raceScene.getAgentWorldHistory(sinceRevision),
      undoAgentWorld: () => this.raceScene.undoAgentWorld(),
      queryAgentWorld: (query?: AgentWorldQuery) => this.raceScene.queryAgentWorld(query),
      observeAgentWorld: (query?: AgentWorldQuery) => this.raceScene.observeAgentWorld(query),
      pauseAgentWorld: (paused: boolean) => this.raceScene.pauseAgentWorld(paused),
      stepAgentWorld: (seconds = 1 / 60) => this.raceScene.stepAgentWorld(seconds),
      exportAgentWorld: () => this.raceScene.exportAgentWorld(),
      saveAgentWorld: (name: string) => this.raceScene.saveAgentWorld(name),
      loadAgentWorld: (nameOrDefinition: string | AgentWorldDefinition) => {
        this.ensureAgentWorldStudio();
        return this.raceScene.loadAgentWorld(nameOrDefinition);
      },
      openInputDeviceLab: (): boolean => {
        this.openArchiveMode("input-device-lab");
        return this.state === "input-device-lab";
      },
      inputDeviceLabState: () => this.inputDeviceLab.getState(),
      inputDeviceMonitorState: () => this.raceScene.getDeviceMonitorState(),
      setDeviceProfile: (profile: DeviceProfileId): boolean => {
        this.inputDeviceLab.setProfile(profile);
        return this.inputDeviceLab.getState().profile === profile;
      },
      setDeviceArmed: (armed: boolean): boolean => {
        this.inputDeviceLab.setArmed(armed);
        return this.inputDeviceLab.getState().armed === armed;
      },
      sendDeviceRobot: (command: RobotCommand): boolean => this.inputDeviceLab.sendRobot(command),
      identifyDevice: (): boolean => {
        this.inputDeviceLab.identify();
        return true;
      },
      setDevicePin: (on: boolean): boolean => {
        this.inputDeviceLab.setPin(on);
        return this.inputDeviceLab.getState().pinOn === on;
      },
      readDeviceSonar: (): number => {
        this.inputDeviceLab.readSonar();
        return this.inputDeviceLab.getState().sonarDistanceCm;
      },
      sweepDeviceSonar: (): number => {
        this.inputDeviceLab.sweepSonar();
        return this.inputDeviceLab.getState().radar.length;
      },
      toggleDeviceIo: (index: number): boolean => {
        this.inputDeviceLab.toggleIo(index);
        return this.inputDeviceLab.getState().io[index] ?? false;
      },
      toggleDeviceSchedule: (index: number): boolean => {
        this.inputDeviceLab.toggleSchedule(index);
        return this.inputDeviceLab.getState().schedules[index]?.enabled ?? false;
      },
      setDeviceServo: (payload: { id: ServoId; value: number }): number => {
        this.inputDeviceLab.setServo(payload.id, payload.value);
        return this.inputDeviceLab.getState().meArm[payload.id];
      },
      openMathGame: (): boolean => {
        this.openArchiveMode("math-lab");
        return this.state === "math-lab";
      },
      mathLabViewState: () => this.raceScene.getMathLabViewState(),
      resetMathLabView: (): boolean => this.raceScene.resetMathLabView(),
      exposeVehicleUnderside: (): boolean => this.raceScene.debugExposeVehicleUnderside(),
      completeObjective: (): RaceSnapshot => this.raceScene.debugCompleteCurrentRace(),
      setRaceCamera: (yaw: number, pitch: number, distance: number): RaceDebugSnapshot =>
        this.raceScene.debugSetRaceCamera(yaw, pitch, distance),
      setPlayerState: (position: [number, number, number], velocity?: [number, number, number]): RaceDebugSnapshot =>
        this.raceScene.debugSetPlayerState(position, velocity)
    };
    const levelApi = {
      schema: "graphysx.agent-level-api/v1" as const,
      levelSchema: GRAPHYSX_AGENT_LEVEL_SCHEMA,
      version: "1.0" as const,
      capabilities: GRAPHYSX_AGENT_LEVEL_CAPABILITIES,
      tiles: GRAPHYSX_AGENT_LEVEL_TILES,
      tileSemantics: GRAPHYSX_AGENT_LEVEL_TILE_SEMANTICS,
      active: () => this.levelLibrary.active(),
      list: () => this.levelLibrary.list(),
      get: (id: string) => this.levelLibrary.get(id),
      create: (options: AgentLevelCreateOptions) => this.createAgentLevel(options),
      remove: (id: string) => this.removeAgentLevel(id),
      open: (id: string) => this.openAgentLevel(id),
      region: (id: string, rect: AgentLevelRect) => this.levelLibrary.region(id, rect),
      patch: (id: string, changes: AgentLevelCellPatch[], options?: AgentLevelTransactionOptions) => this.patchAgentLevel(id, changes, options),
      fill: (id: string, rect: AgentLevelRect, tile: MapEditorTile, options?: AgentLevelTransactionOptions) => this.fillAgentLevel(id, rect, tile, options),
      resize: (id: string, width: number, height: number, defaultTile?: MapEditorTile, options?: AgentLevelTransactionOptions) => this.resizeAgentLevel(id, width, height, defaultTile, options),
      transaction: (id: string, operations: AgentLevelOperation[], options?: AgentLevelTransactionOptions) => this.transactAgentLevel(id, operations, options),
      undo: (id: string) => this.undoAgentLevel(id),
      importAscii: (source: AgentLevelAsciiImport) => this.importAgentLevelAscii(source),
      exportAscii: (id: string) => this.levelLibrary.exportAscii(id),
      play: (id: string) => this.playAgentLevel(id)
    } satisfies GraphysXAgentLevelApi;
    const agentApi = {
      schema: "graphysx.agent-api/v2" as const,
      worldSchema: GRAPHYSX_AGENT_WORLD_SCHEMA,
      levelSchema: GRAPHYSX_AGENT_LEVEL_SCHEMA,
      version: "2.0" as const,
      capabilities: GRAPHYSX_AGENT_CAPABILITIES,
      levels: levelApi,
      assets: () => GRAPHYSX_AGENT_WORLD_ASSETS,
      textures: () => GRAPHYSX_AGENT_WORLD_TEXTURES,
      importLegacyXml: debugApi.importLegacyAgentWorldXml,
      open: debugApi.openAgentWorldStudio,
      demo: debugApi.loadAgentWorldDemo,
      state: debugApi.agentWorldState,
      create: debugApi.createAgentWorld,
      clear: debugApi.clearAgentWorld,
      spawn: debugApi.spawnAgentEntity,
      update: debugApi.updateAgentEntity,
      remove: debugApi.removeAgentEntity,
      attachBehavior: debugApi.attachAgentBehavior,
      detachBehavior: debugApi.detachAgentBehavior,
      interact: debugApi.interactAgentEntity,
      prefabs: debugApi.listAgentWorldPrefabs,
      spawnPrefab: debugApi.spawnAgentWorldPrefab,
      starters: debugApi.listAgentWorldStarters,
      loadStarter: debugApi.loadAgentWorldStarter,
      transaction: debugApi.transactAgentWorld,
      commit: debugApi.commitAgentWorld,
      history: debugApi.agentWorldHistory,
      undo: debugApi.undoAgentWorld,
      select: debugApi.selectAgentEntities,
      query: debugApi.queryAgentWorld,
      observe: debugApi.observeAgentWorld,
      pause: debugApi.pauseAgentWorld,
      step: debugApi.stepAgentWorld,
      export: debugApi.exportAgentWorld,
      save: debugApi.saveAgentWorld,
      load: debugApi.loadAgentWorld
    } satisfies GraphysXAgentWorldApi;
    this.agentWorldBridge?.dispose();
    const agentWorldBridge = createGraphysXAgentToolBridge(agentApi);
    this.agentWorldBridge = agentWorldBridge;
    const gameWindow = window as unknown as {
      __GRAPHYSX_DEBUG__: typeof debugApi;
      __GRAPHYSX__: typeof agentApi;
      __GRAPHYSX_AGENT_BRIDGE__: GraphysXAgentToolBridge;
      __GRAPHYSX_WORLDS__: {
        list: typeof debugApi.worldRecipes;
        current: typeof debugApi.natureRecipe;
        load: typeof debugApi.loadNatureRecipe;
        select: typeof debugApi.selectNatureStudy;
        selectLesson: typeof debugApi.selectNatureLesson;
        setParameter: typeof debugApi.setNatureParameter;
        setLayer: typeof debugApi.setNatureLayer;
        setObserver: typeof debugApi.setNatureObserver;
        pause: typeof debugApi.pauseNatureLab;
        step: typeof debugApi.stepNatureLab;
        act: typeof debugApi.actInNatureLab;
        reset: typeof debugApi.resetNatureLab;
      };
      render_game_to_text: () => string;
      advanceTime: (milliseconds: number) => void;
    };
    gameWindow.__GRAPHYSX_DEBUG__ = debugApi;
    gameWindow.__GRAPHYSX__ = agentApi;
    gameWindow.__GRAPHYSX_AGENT_BRIDGE__ = agentWorldBridge;
    gameWindow.__GRAPHYSX_WORLDS__ = {
      list: debugApi.worldRecipes,
      current: debugApi.natureRecipe,
      load: debugApi.loadNatureRecipe,
      select: debugApi.selectNatureStudy,
      selectLesson: debugApi.selectNatureLesson,
      setParameter: debugApi.setNatureParameter,
      setLayer: debugApi.setNatureLayer,
      setObserver: debugApi.setNatureObserver,
      pause: debugApi.pauseNatureLab,
      step: debugApi.stepNatureLab,
      act: debugApi.actInNatureLab,
      reset: debugApi.resetNatureLab
    };
    gameWindow.advanceTime = (milliseconds: number): void => this.raceScene.advanceTime(milliseconds);
    gameWindow.render_game_to_text = () => {
      const snapshot = this.raceScene.getDebugSnapshot();
      const activeRace = this.raceScene.getRace();
      const commonRoomState = this.state === "common-room-lab" ? this.raceScene.getCommonRoomEnvironmentState() : null;
      const commonArchiveState = this.state === "common-room-lab" ? this.raceScene.getCommonArchiveEnvironmentState() : null;
      const commonSelection = this.state === "common-room-lab" ? this.raceScene.getCommonEnvironmentSelection() : null;
      const threejsPlaygroundState = this.state === "threejs-playground" ? this.raceScene.getThreejsPlaygroundState() : null;
      const ballzBlenderLevel1State = this.state === "ballz-blender-level1" ? this.raceScene.getBallzBlenderLevel1State() : null;
      const maisonExplorerState = this.state === "maison-explorer" ? this.raceScene.getMaisonExplorerState() : null;
      const arenaArchiveState = this.state === "arena-archive" ? this.raceScene.getArenaArchiveState() : null;
      const commonEnvironmentState = commonSelection
        ? { selection: commonSelection, room2: commonRoomState, archive: commonArchiveState }
        : null;
      const natureState = this.state === "nature-lab" ? this.raceScene.getNatureLabState() : null;
      const agentWorldState = this.state === "world-api-lab" ? this.raceScene.getAgentWorldState() : null;
      const archiveSelectorState =
        this.state === "skybox-selector"
          ? this.raceScene.getSkyboxSelectorState()
          : this.state === "car-selector"
            ? this.raceScene.getCarSelectorState()
            : null;
      const ballz2011Level1State = this.state === "ballz-2011-level1" ? this.raceScene.getBallz2011Level1State() : null;
      const ballzSlide1State = this.state === "ballz-slide1" ? this.raceScene.getBallzSlide1State() : null;
      const ballzTrackGalleryState = this.state === "ballz-track-gallery" ? this.raceScene.getBallzTrackGalleryState() : null;
      const xmlSceneState = this.state === "xml-myworld-copy" ? this.raceScene.getXmlSceneState() : null;
      const ballzXmlWorldsState = this.state === "ballz-xml-worlds" ? this.raceScene.getBallzXmlWorldsState() : null;
      const xmlSerializerArtifactState = this.state === "xml-serializer-artifacts" ? this.raceScene.getStockroomXmlArtifactState() : null;
      const vehiclePackState = this.state === "vehicle-pack-gallery" ? this.raceScene.getVehiclePackState() : null;
      const objectLibraryState = this.state === "object-library-catalog" ? this.raceScene.getObjectLibraryCatalogState() : null;
      const dominusAssetGalleryState = this.state === "dominus-asset-gallery" ? this.raceScene.getDominusAssetGalleryState() : null;
      const dominusPortEvidenceState = this.state === "dominus-port-evidence" ? this.raceScene.getDominusPortEvidenceState() : null;
      const archivedParticlePresetLibraryState = this.state === "game-lab" ? this.raceScene.getArchivedParticlePresetLibraryState() : null;
      const cubxActorLineageState = this.state === "cubx-actor-lineage" ? this.raceScene.getCubxActorLineageState() : null;
      const suzanne2State = this.state === "suzanne2-archive" ? this.raceScene.getSuzanne2State() : null;
      const notesManagerState = this.state === "notes-manager-lab" ? this.raceScene.getNotesManagerState() : null;
      const milkyWayState = this.state === "milky-way-lab" ? this.raceScene.getMilkyWayState() : null;
      const mathLabViewState = this.state === "math-lab" ? this.raceScene.getMathLabViewState() : null;
      const inputDeviceState = this.state === "input-device-lab" ? this.inputDeviceLab.getState() : null;
      const agentLevelState = this.state === "map-editor" ? this.levelLibrary.active() : null;
      const agentLevelSummary = agentLevelState ? this.levelLibrary.list().find((level) => level.id === agentLevelState.id) : null;
      const agentLevelAscii = agentLevelState ? this.levelLibrary.exportAscii(agentLevelState.id).value : null;
      const standaloneMode = Boolean(
        isArchiveState(this.state) || commonEnvironmentState || threejsPlaygroundState || ballzBlenderLevel1State || maisonExplorerState || arenaArchiveState || natureState || agentWorldState || archiveSelectorState || ballz2011Level1State || ballzSlide1State || ballzTrackGalleryState || xmlSceneState || ballzXmlWorldsState || xmlSerializerArtifactState || vehiclePackState || objectLibraryState || dominusAssetGalleryState || dominusPortEvidenceState || archivedParticlePresetLibraryState || cubxActorLineageState || suzanne2State || notesManagerState || milkyWayState
      );
      const worldContext =
        this.state === "world-select" ||
        ((this.state === "gameplay" || this.state === "after-race") && this.gameplayOrigin === "world-select");
      return JSON.stringify({
        version: APP_VERSION,
        build: APP_BUILD,
        mode: this.state,
        projectFamily: worldContext
            ? worldProjectFamily(activeRace)
            : this.state === "race-select" || this.state === "gameplay"
              ? "ballz"
              : this.state,
        recoveryCategory: worldContext ? worldCategoryLabel(activeRace) : undefined,
        race: standaloneMode ? undefined : snapshot.raceName,
        preview: this.raceScene.getPreviewMode(),
        particles: {
          active: this.raceScene.getActiveParticleCount(),
          persistentFxLab: this.state === "game-lab",
          archivedPresetLibrary: archivedParticlePresetLibraryState ?? undefined
        },
        sceneCensus:
          this.state === "scene-index"
            ? {
                total: ARCHIVE_SCENES.length,
                byStatus: Object.fromEntries(
                  (["RESTORED", "PARTIAL", "REGRESSED", "PIPELINE", "MISSING", "RESEARCH"] as ArchiveSceneStatus[]).map(
                    (status) => [status, ARCHIVE_SCENES.filter((scene) => scene.status === status).length]
                  )
                )
              }
            : undefined,
        math:
          this.state === "math-lab"
            ? {
                formula: this.mathParams.formula,
                a: this.mathParams.a,
                b: this.mathParams.b,
                c: this.mathParams.c,
                m: this.mathParams.m,
                xOffset: this.mathParams.xOffset,
                camera: mathLabViewState
              }
            : undefined,
        inputDevice: inputDeviceState
          ? { ...inputDeviceState, monitor: this.raceScene.getDeviceMonitorState() }
          : undefined,
        cubx: this.state === "cubx-lab" ? this.raceScene.getCubXMenuState() : undefined,
        cubxActorLineage: cubxActorLineageState ?? undefined,
        nature: natureState ?? undefined,
        agentWorld: agentWorldState ?? undefined,
        levelEditor: agentLevelState
          ? {
              schema: agentLevelState.schema,
              id: agentLevelState.id,
              label: agentLevelState.label,
              revision: agentLevelState.revision,
              width: agentLevelState.width,
              height: agentLevelState.height,
              cellSize: agentLevelState.cellSize,
              selectedTile: this.selectedEditorTile,
              counts: agentLevelSummary?.counts,
              rows: agentLevelAscii?.rows,
              librarySize: this.levelLibrary.list().length
            }
          : undefined,
        environment: commonEnvironmentState ?? undefined,
        threejsPlayground: threejsPlaygroundState ?? undefined,
        ballzBlenderLevel1: ballzBlenderLevel1State ?? undefined,
        maisonExplorer: maisonExplorerState ?? undefined,
        arenaArchive: arenaArchiveState ?? undefined,
        selector: archiveSelectorState ?? undefined,
        ballz2011Level1: ballz2011Level1State ?? undefined,
        ballzSlide1: ballzSlide1State ?? undefined,
        ballzTrackGallery: ballzTrackGalleryState ?? undefined,
        xmlScene: xmlSceneState ?? undefined,
        ballzXmlWorlds: ballzXmlWorldsState ?? undefined,
        xmlSerializerArtifact: xmlSerializerArtifactState ?? undefined,
        vehiclePack: vehiclePackState ?? undefined,
        objectLibraryCatalog: objectLibraryState ?? undefined,
        dominusAssetGallery: dominusAssetGalleryState ?? undefined,
        dominusPortEvidence: dominusPortEvidenceState ?? undefined,
        suzanne2Archive: suzanne2State ?? undefined,
        notesManager: notesManagerState ?? undefined,
        milkyWay: milkyWayState ?? undefined,
        coordinateSystem: "Three.js world coordinates: +x right/east, +y up, -z is the default forward direction.",
        player: standaloneMode
          ? undefined
          : {
              x: Number(snapshot.playerPosition.x.toFixed(2)),
              y: Number(snapshot.playerPosition.y.toFixed(2)),
              z: Number(snapshot.playerPosition.z.toFixed(2)),
              radius: snapshot.playerRadius
            },
        velocity: standaloneMode
          ? undefined
          : {
              x: Number(snapshot.playerVelocity.x.toFixed(2)),
              y: Number(snapshot.playerVelocity.y.toFixed(2)),
              z: Number(snapshot.playerVelocity.z.toFixed(2))
            },
        forceZone: standaloneMode ? undefined : snapshot.forceZone,
        forceZonesTotal: standaloneMode ? undefined : snapshot.forceZonesTotal,
        input: this.raceScene.getInputState(),
        inputAxis: standaloneMode ? undefined : snapshot.inputAxis,
        ballPreset: standaloneMode ? undefined : snapshot.ballPreset,
        ghost: standaloneMode ? undefined : snapshot.ghost,
        flight: standaloneMode ? undefined : snapshot.flight,
        suzanne: standaloneMode ? undefined : snapshot.suzanne,
        rings: standaloneMode ? undefined : `${snapshot.ringsCollected}/${snapshot.ringsTotal}`,
        laps: standaloneMode
          ? undefined
          : {
              completed: snapshot.lapsCompleted,
              total: snapshot.lapsTotal,
              current: Math.min(snapshot.lapsTotal, snapshot.lapsCompleted + (snapshot.raceFinished ? 0 : 1))
            },
        halfway: standaloneMode ? undefined : snapshot.hasReachedHalfway,
        raceActive: standaloneMode ? undefined : snapshot.raceActive,
        raceFinished: standaloneMode ? undefined : snapshot.raceFinished,
        racePaused: standaloneMode ? undefined : snapshot.racePaused,
        countdownRemaining: standaloneMode ? undefined : Number(snapshot.countdownRemaining.toFixed(2)),
        loadState: standaloneMode ? undefined : snapshot.loadState,
        remainingRings: standaloneMode
          ? undefined
          : snapshot.remainingRings.map((ring) => ({
              x: Number(ring.x.toFixed(2)),
              y: Number(ring.y.toFixed(2)),
              z: Number(ring.z.toFixed(2))
            })),
        activeZombies: standaloneMode
          ? undefined
          : snapshot.activeZombies.map((zombie) => ({
              x: Number(zombie.x.toFixed(2)),
              y: Number(zombie.y.toFixed(2)),
              z: Number(zombie.z.toFixed(2))
            })),
        rival: standaloneMode || !snapshot.rival
          ? undefined
          : {
              label: snapshot.rival.label,
              ball: {
                x: Number(snapshot.rival.position.x.toFixed(2)),
                y: Number(snapshot.rival.position.y.toFixed(2)),
                z: Number(snapshot.rival.position.z.toFixed(2))
              },
              waypoint: snapshot.rival.waypoint,
              waypointsTotal: snapshot.rival.waypointsTotal,
              circuitsCompleted: snapshot.rival.circuitsCompleted
            },
        nextObjective: standaloneMode ? undefined : snapshot.nextObjective,
        objectiveDistance:
          standaloneMode || snapshot.objectiveDistance === null ? undefined : Number(snapshot.objectiveDistance.toFixed(2)),
        camera: commonEnvironmentState
          ? commonSelection === "room2-shadow" && commonRoomState
            ? {
                orbitAngleRadians: Number(commonRoomState.orbitAngleRadians.toFixed(3)),
                orbitAngleDegrees: Number(commonRoomState.orbitAngleDegrees.toFixed(1)),
                radius: commonRoomState.orbitRadius,
                position: commonRoomState.cameraPosition,
                lookAt: commonRoomState.lookAt
              }
            : commonArchiveState
              ? {
                  orbitAngleRadians: Number(commonArchiveState.orbitAngleRadians.toFixed(3)),
                  orbitAngleDegrees: Number(MathUtils.radToDeg(commonArchiveState.orbitAngleRadians).toFixed(1)),
                  position: commonArchiveState.cameraPosition,
                  lookAt: commonArchiveState.lookAt
                }
              : undefined
          : threejsPlaygroundState
            ? threejsPlaygroundState.camera
          : ballzBlenderLevel1State
            ? ballzBlenderLevel1State.camera
          : maisonExplorerState
            ? maisonExplorerState.camera
          : arenaArchiveState
            ? arenaArchiveState.camera
          : xmlSceneState
            ? { position: xmlSceneState.cameraPosition, lookAt: xmlSceneState.lookAt, orbitAngleRadians: xmlSceneState.orbitAngleRadians }
          : ballzXmlWorldsState
            ? { position: ballzXmlWorldsState.cameraPosition, lookAt: ballzXmlWorldsState.lookAt, orbitAngleRadians: ballzXmlWorldsState.orbitAngleRadians }
          : xmlSerializerArtifactState
            ? { position: xmlSerializerArtifactState.camera.position, lookAt: xmlSerializerArtifactState.camera.lookAt, orbitAngleRadians: xmlSerializerArtifactState.camera.orbitAngleRadians }
          : vehiclePackState
            ? { position: vehiclePackState.cameraPosition, lookAt: vehiclePackState.lookAt, orbitAngleRadians: vehiclePackState.orbitAngleRadians }
          : mathLabViewState
            ? mathLabViewState
          : objectLibraryState
            ? { position: objectLibraryState.cameraPosition, lookAt: objectLibraryState.lookAt, orbitAngleRadians: objectLibraryState.orbitAngleRadians, zoom: objectLibraryState.zoom }
          : dominusPortEvidenceState
            ? { position: dominusPortEvidenceState.cameraPosition, lookAt: dominusPortEvidenceState.lookAt, orbitAngleRadians: dominusPortEvidenceState.orbitAngleRadians, zoom: dominusPortEvidenceState.zoom }
          : archiveSelectorState
            ? archiveSelectorState.camera
          : {
              yaw: Number(snapshot.cameraYaw.toFixed(3)),
              pitch: Number(snapshot.cameraPitch.toFixed(3)),
              distance: Number(snapshot.cameraDistance.toFixed(2)),
              collision: {
                active: snapshot.cameraCollision.active,
                hitBodyId: snapshot.cameraCollision.hitBodyId,
                desiredDistance: Number(snapshot.cameraCollision.desiredDistance.toFixed(2)),
                resolvedDistance: Number(snapshot.cameraCollision.resolvedDistance.toFixed(2))
              }
            },
        controls:
          this.state === "common-room-lab"
            ? "A/D orbit continuously; drag horizontally or use the visible Orbit Left/Right buttons; Reset View restores the archived angle; Back Home or Esc exits."
            : this.state === "threejs-playground"
              ? "Use all 16 visible source-bounded World controls for camera, cube, plane, Earth, Mars and Moon; move the pointer for the morph shaders; click terrain for its raycast; A/D/drag orbit; wheel zooms; Reset restores source defaults."
            : this.state === "ballz-blender-level1"
              ? "Use Source Camera for the saved Blender view or Overview for A/D, drag and wheel inspection. This complete geometry visit has no invented BallZ spawn, controls or race objective."
            : this.state === "maison-explorer"
              ? "Switch between House and Kitchen, use each saved Source Camera or Overview, then A/D, drag or wheel to inspect. Reset returns to the active subspace's readable overview."
            : this.state === "arena-archive"
              ? "Use the exact Unity Source Camera or the readable Overview; A/D, drag, or visible buttons orbit; wheel zooms; Reset restores the overview. No gameplay is invented for this scriptless scene."
            : this.state === "map-editor"
              ? "Paint the visible grid or use window.__GRAPHYSX__.levels to list, query regions, patch/fill/resize/undo, import/export ASCII, open, and play named levels."
            : this.state === "nature-lab"
              ? "Choose a world family and focused lesson, use its Experiment action or click the 3D view, pause/step/reset, tune named sliders, drag to orbit, wheel to zoom, or use __GRAPHYSX_WORLDS__."
            : this.state === "world-api-lab"
              ? "Use the visible World Editor or window.__GRAPHYSX__ to create, inspect, edit, transact, commit, and save the same world; friendly forms cover entities and the JSON workbench exposes the complete contract; drag and wheel inspect the scene."
            : this.state === "skybox-selector"
              ? "Click a sky cube or use the five visible sky buttons; wait for zoom into panorama; Return To Cubes resets; Esc exits."
            : this.state === "car-selector"
              ? "W/S walk; A/D strafe; Q/E raise; drag to turn; click the Impreza to inspect; Reset Preview restores the archive camera; Esc exits."
            : this.state === "ballz-2011-level1"
              ? "Drag to orbit; wheel zooms; toggle diagnostic edges/bounds; this is a non-race mesh visit with no invented BallZ objective."
            : this.state === "ballz-slide1"
              ? "Drag to orbit; wheel zooms; toggle the exact Ball spawn and diagnostic edges/bounds; gameplay remains disabled because the archived controls and rings are incomplete."
            : this.state === "ballz-track-gallery"
              ? "Select one of six distinct slide/track sources; drag and wheel inspect; toggle source/diagnostic materials, edges and bounds; Overview/Top changes the disclosed inspection camera."
            : this.state === "xml-myworld-copy"
              ? "A/D, drag, or visible buttons orbit the exact source composition; object buttons toggle recovered items; Reset restores visibility; missing ArcheChinois remains absent."
            : this.state === "ballz-xml-worlds"
              ? "Switch between MyWorld and TestWorld; focus exact records; A/D, drag, or visible buttons orbit; malformed duplicate targets remain unresolved and neither document is claimed as a finished world."
            : this.state === "xml-serializer-artifacts"
              ? "Switch between BaseScene and test1; A/D, drag, or visible buttons orbit; exact overlap remains intact because these are serializer artifacts, not composed worlds."
            : this.state === "vehicle-pack-gallery"
              ? "Switch between exact GT4 and Low Cobra source assets; A/D, drag, or visible buttons orbit; selector binding, physics binding, and playability remain explicitly NONE."
            : this.state === "object-library-catalog"
              ? "Choose family and source-status filters; Previous/Next selects matching records; A/D, drag, or Orbit buttons rotate; wheel zooms; Reset returns to the complete 61-entry catalog."
            : this.state === "dominus-asset-gallery"
              ? "Choose a proven source family and decode status; Previous/Next selects matching assets; A/D, drag, or Orbit buttons rotate; wheel zooms; Reset restores all 65 local models."
            : this.state === "dominus-port-evidence"
              ? "Select any of the 28 exact port rows; Focus isolates one source asset; Source Grid restores the exact catalog placement; A/D, drag or visible buttons orbit; wheel zooms; the curated playable visit is explicitly modern work."
            : this.state === "suzanne2-archive"
              ? "Drag to orbit; wheel zooms; toggle the source player/XML/CubX evidence layers and piston limit; this is an authored-level visit with the 15-ring/2-pickup rule conflict exposed."
            : this.state === "notes-manager-lab"
              ? "Click the 3D add cube or Add Note Mesh; Reset Block returns to zero; drag or wheel adjusts the inspection view."
            : this.state === "milky-way-lab"
              ? "Switch between the exact later placement and partial moving 2015 profile; drag to orbit, wheel zooms, Reset restores source transforms."
            : this.state === "game-lab"
              ? "Select any audited particle preset; Previous/Next, restart, pause, or auto-replay readable configs; opaque binaries remain evidence-only; drag/wheel inspect the separate diagnostic fountains and combat lane."
            : this.state === "input-device-lab"
              ? "Simulation opens by default. Monitor source-mapped controller input; explicitly ARM before movement/MeArm starts; STOP always disarms; choose a protocol, inspect bounded TX/RX frames, toggle eight I/O channels and four schedules, or run the 182-point sonar sweep."
            : this.state === "math-lab"
              ? "Choose parabola or slope, tune A/B/C/M/X, or use labeled modern inspection presets; drag the 3D view to orbit, wheel to zoom, and Reset 3D View restores the readable camera."
            : this.state === "gameplay"
            ? snapshot.flight
              ? `${snapshot.flight.controls} Touch uses the direction pad plus GO/REV; gamepad uses left stick plus triggers. Esc exits; use the visible Restart button to restart the flight.`
              : activeRace.vehicle
                ? "Keyboard W/S + A/D, touch direction pad, or gamepad left stick drives; drag orbit; wheel zoom; C reset camera; P/touch pauses; R restarts; Esc exits."
                : "Keyboard WASD/arrows, the touch direction pad, or gamepad left stick moves; drag orbit; wheel zoom; C reset camera; Space/A jump; Shift boost; B cycles Fire/Classic/Revival; P/touch pauses; R restarts; Esc exits."
            : this.state === "cubx-lab"
              ? "Click one of the eight 3D cubes; choose one of four unfolded panels; Close reverses the open and rotation sequence."
            : "Use the visible menu buttons; Enter opens/starts when focus is not already on a control.",
        shellWireRotation: standaloneMode ? undefined : snapshot.shellWireRotation,
        arrowHeading: standaloneMode ? undefined : Number(snapshot.arrowHeading.toFixed(3))
      });
    };
  }

  private renderArchiveState(
    title: string,
    body: string,
    primaryAction: string,
    items: ArchiveRecoveryItem[],
    activeMode: ArchiveModeId,
    leadingCards: string[]
  ): void {
    this.primaryAction.disabled = false;
    this.secondaryAction.hidden = false;
    this.title.textContent = title;
    this.body.textContent = body;
    this.primaryAction.textContent = primaryAction;
    this.secondaryAction.textContent = "Back Home";
    this.stats.className = "stats-grid menu-grid";
    this.stats.innerHTML = [
      ...leadingCards,
      this.modeChooser(activeMode),
      this.recoveryList(items)
    ].join("");
  }

  private modeChooser(activeMode: ArchiveModeId): string {
    const active = ARCHIVE_MODES.find((mode) => mode.id === activeMode);
    const archiveCards = ARCHIVE_MODES.map((mode) => {
      const selected = mode.id === activeMode ? " is-selected" : "";
      return `<button class="mode-card mode-card-compact${selected}" data-mode-id="${escapeHtml(mode.id)}">
        <span>${escapeHtml(mode.label)}</span>
        <small>${selected ? escapeHtml(mode.summary) : "Open mode"}</small>
      </button>`;
    }).join("");
    const worldsCard = `<button class="mode-card mode-card-compact" data-open-worlds>
      <span>Archive Family Browser</span>
      <small>separate BallZ concepts, FlightX, and vehicle experiment sections</small>
    </button>`;

    return `<section class="wide-card mode-nav"><details class="mode-jump"><summary><span><span class="stat-label">Switch Project Mode</span><strong>${escapeHtml(active?.label ?? "Archive navigation")}</strong></span><small>${ARCHIVE_MODES.length} source-separated modes · open only when needed</small></summary><div class="mode-list">${worldsCard}${archiveCards}</div></details></section>`;
  }

  private selectRecommendedRace(): void {
    this.raceScene.setRace(this.getRecommendedRace(BALLZ_RACES).id);
  }

  private selectNextRace(): void {
    const collection = this.gameplayOrigin === "world-select"
      ? WORLD_FAMILY_RACES[worldFamilyForRace(this.raceScene.getRace())]
      : BALLZ_RACES;
    const currentIndex = collection.findIndex((race) => race.id === this.raceScene.getRace().id);
    const next = collection[(Math.max(0, currentIndex) + 1) % collection.length];
    this.raceScene.setRace(next.id);
  }

  private getRecommendedRace(collection: RaceDefinition[]): RaceDefinition {
    return collection.find((race) => !this.scoreboard.hasCompleted(race)) ?? collection[0] ?? RACE_DEFINITIONS[0];
  }

  private getCompletedCount(collection: RaceDefinition[]): number {
    return collection.filter((race) => this.scoreboard.hasCompleted(race)).length;
  }

  private getCareerScore(collection: RaceDefinition[]): number {
    return collection.reduce((sum, race) => sum + this.scoreboard.getScore(race), 0);
  }

  private raceChooser(activeRace: RaceDefinition, collection: RaceDefinition[], label: string, itemLabel = "Challenge"): string {
    const cards = collection.map((race, index) => {
      const record = this.scoreboard.getRecord(race);
      const medal = this.scoreboard.getMedal(race);
      const completed = this.scoreboard.hasCompleted(race);
      const challenge = challengeFor(race);
      const selected = race.id === activeRace.id ? " is-selected" : "";
      const statusClass = completed ? " is-complete" : "";
      return `<button class="race-card${selected}${statusClass}" data-race-id="${escapeHtml(race.id)}">
        <span class="race-step">${escapeHtml(itemLabel)} ${index + 1}</span>
        <span class="race-name">${escapeHtml(race.name)}</span>
        <span class="race-meta">${escapeHtml(challenge.difficulty)} · ${escapeHtml(challenge.chapter)}</span>
        <strong>${completed ? formatRaceTime(record.bestMs) : "Ready to play"}</strong>
        <small>${completed ? `${escapeHtml(record.holder)}${medal ? ` · ${formatMedal(medal)}` : " · complete"}` : escapeHtml(challenge.focus)}</small>
      </button>`;
    }).join("");

    return `<section class="wide-card race-tour"><span class="stat-label">${escapeHtml(label)}</span><div class="race-list">${cards}</div></section>`;
  }

  private recoveredRaceRuleCard(): string {
    return `<section class="wide-card source-rule-card"><div><span class="stat-label">Recovered 2015 Race Rules</span><strong>Exact SetRaceScreen.layout evidence</strong><small>The current tour keeps every challenge reachable while these source modes are restored as rule layers, not duplicate levels.</small></div><div class="race-list"><article class="race-card"><span>Collect All Rings — chrono</span><small>collection time trial</small></article><article class="race-card"><span>10 Laps — chrono & rings</span><small>lap time plus checkpoint collection</small></article><article class="race-card"><span>Free for All — 5 min</span><small>timed open mode</small></article></div></section>`;
  }

  private homeDestinations(): string {
    return `<section class="wide-card home-destinations">
      <div class="destination-heading">
        <span class="stat-label">Choose A Project Family</span>
        <small>Play, inspect, build, or check the recovery ledger. Archive visits are never mixed into BallZ progression.</small>
      </div>
      <div class="destination-list">
        <section class="destination-group destination-group-play">
          <div class="destination-group-heading"><span>01</span><h3>Play</h3><small>Runnable challenges and vehicle experiments</small></div>
          <div class="destination-group-grid">
            <button class="destination-card destination-primary" data-mode-id="race">
              <span>BallZ Tour</span>
              <small>Classic ASCII races, Suzanne 1, ZombieKiller, medals, and records.</small>
            </button>
            <button class="destination-card destination-worlds" data-world-family="ballz-concepts">
              <span>BallZ Concepts & Slides</span>
              <small>World 1, Map 1, Great Slide/Level 0, and the concept recovery queue.</small>
            </button>
            <button class="destination-card" data-world-family="flightx">
              <span>FlightX</span>
              <small>Fly the decoded pipe loop with the archive airplane controls.</small>
            </button>
            <button class="destination-card" data-world-family="vehicles">
              <span>Vehicle Experiments</span>
              <small>Drive Piste Ovale and inspect recovered vehicle scenes.</small>
            </button>
            <button class="destination-card" data-world-family="dominus">
              <span>Dominus Curated Visit</span>
              <small>Explore a new tour built from recovered sources; exact port evidence stays separate.</small>
            </button>
          </div>
        </section>

        <section class="destination-group destination-group-archives">
          <div class="destination-group-heading"><span>02</span><h3>Archived Worlds</h3><small>Source-backed visits, separate from progression</small></div>
          <div class="destination-group-grid">
            <button class="destination-card" data-mode-id="ballz-2011-level1">
              <span>BallZ 2011 Level1 Mesh</span>
              <small>Exact distinct TVM geometry as a source-bounded non-race visit.</small>
            </button>
            <button class="destination-card" data-mode-id="ballz-slide1">
              <span>Active BallZ Slide 1</span>
              <small>Exact Atmel slide + Ball assembly as a non-race visit.</small>
            </button>
            <button class="destination-card" data-mode-id="ballz-track-gallery">
              <span>BallZ Slide / Track Gallery</span>
              <small>Six exact remaining sources—materials and host boundaries, without invented races.</small>
            </button>
            <button class="destination-card" data-mode-id="suzanne2-archive">
              <span>Suzanne 2</span>
              <small>Distinct 40×40 ASCII/XML arena and its shipped rule conflict.</small>
            </button>
            <button class="destination-card" data-mode-id="xml-myworld-copy">
              <span>MyWorld — Copy XML</span>
              <small>MyWorld Copy's exact six-of-seven composition.</small>
            </button>
            <button class="destination-card" data-mode-id="ballz-xml-worlds">
              <span>MyWorld / TestWorld XML</span>
              <small>Two distinct evidence documents—exact records and unresolved serializer defects.</small>
            </button>
            <button class="destination-card" data-mode-id="object-library-catalog">
              <span>ObjectLibrary Catalog</span>
              <small>Exact 61-entry editor grid—47 recovered, 14 explicit source gaps.</small>
            </button>
            <button class="destination-card" data-mode-id="dominus-asset-gallery">
              <span>Dominus Source Assets</span>
              <small>65 audited local models—63 recovered, two honest binary gaps.</small>
            </button>
            <button class="destination-card" data-mode-id="dominus-port-evidence">
              <span>Dominus Port Evidence</span>
              <small>Exact 28-row multi-asset source grid, clearly separated from the modern curated visit.</small>
            </button>
            <button class="destination-card" data-mode-id="common-room-lab">
              <span>Standalone 3D Environments</span>
              <small>Common Rooms 1–2 and the separate sky.tvm component.</small>
            </button>
            <button class="destination-card" data-mode-id="threejs-playground">
              <span>Three.js Playground</span>
              <small>Recovered Asteroids-sky composition with airplane, morph shaders, terrain, planets, and animated light.</small>
            </button>
            <button class="destination-card" data-mode-id="ballz-blender-level1">
              <span>BallZ / Blender Level 1</span>
              <small>Complete best-revision geometry, source camera and light—kept honest as a visit, not an invented race.</small>
            </button>
            <button class="destination-card" data-mode-id="maison-explorer">
              <span>Maison Explorer</span>
              <small>Explore the complete House and detailed 87-object Kitchen compositions.</small>
            </button>
            <button class="destination-card" data-mode-id="arena-archive">
              <span>Unity Arena Archive</span>
              <small>Complete octagonal arena, hand-painted atlas, source camera and light.</small>
            </button>
            <button class="destination-card" data-mode-id="skybox-selector">
              <span>Skybox Selector</span>
              <small>Five rotating cubes, source camera chase, and panorama orbit.</small>
            </button>
            <button class="destination-card" data-mode-id="car-selector">
              <span>Car Selector</span>
              <small>Authentic one-Impreza terrain/water preview.</small>
            </button>
            <button class="destination-card" data-mode-id="vehicle-pack-gallery">
              <span>GT4 / Low Cobra Sources</span>
              <small>Exact car assets with selector and physics bindings honestly marked NONE.</small>
            </button>
            <button class="destination-card" data-mode-id="milky-way-lab">
              <span>Voie Lactée Vignette</span>
              <small>Five archived planetary bodies, not a generated star field.</small>
            </button>
            <button class="destination-card" data-mode-id="cubx-lab">
              <span>CubZ Animated Menu</span>
              <small>Eight source-layout cubes unfold into four internal panels.</small>
            </button>
            <button class="destination-card" data-mode-id="cubx-actor-lineage">
              <span>CubX Actor Lineage</span>
              <small>Separate exact Closed/Get/Rot/Open evidence and broken click 8.</small>
            </button>
            <button class="destination-card" data-mode-id="notes-manager-lab">
              <span>CubX 3D Notes Block</span>
              <small>Recovered 50-slot note subsystem with missing GUI disclosed.</small>
            </button>
          </div>
        </section>

        <section class="destination-group destination-group-labs">
          <div class="destination-group-heading"><span>03</span><h3>Labs & Creation</h3><small>Engine studies, generative worlds, and tools</small></div>
          <div class="destination-group-grid">
            <button class="destination-card" data-mode-id="scene-lab">
              <span>Scene Lab</span>
              <small>Terrain, atmosphere, water, sky, spline, and day/night environment studies.</small>
            </button>
            <button class="destination-card destination-nature" data-mode-id="nature-lab">
              <span>Nature Lab</span>
              <small>Flocking, forces, flow fields, and a generative forest.</small>
            </button>
            <button class="destination-card destination-agent-world" data-mode-id="world-api-lab">
              <span>Agent World API</span>
              <small>Compose entities, lights, materials, behaviors, and scenes.</small>
            </button>
            <button class="destination-card" data-mode-id="game-lab">
              <span>Engine & FX Labs</span>
              <small>Particles, projectiles, physics, shaders, sky, water, and lighting.</small>
            </button>
            <button class="destination-card" data-mode-id="physics-lab">
              <span>Physics Lab</span>
              <small>Live hinges, distance constraints, rigid stacks, and wrecking-ball systems.</small>
            </button>
            <button class="destination-card" data-mode-id="input-device-lab">
              <span>Input & Device Lab</span>
              <small>Live controller monitor, simulated robot/sonar protocols, Atmel I/O schedules, and MeArm dry-runs.</small>
            </button>
            <button class="destination-card" data-mode-id="math-lab">
              <span>Math Game</span>
              <small>Archived formulas and A/B/C/M/X controls for 10,000 molecules; modern presets are inspection aids.</small>
            </button>
            <button class="destination-card" data-mode-id="map-editor">
              <span>Editors & Archive Tools</span>
              <small>BallZ tile editing and the scene/editor recovery path.</small>
            </button>
            <button class="destination-card" data-mode-id="editor-lab">
              <span>Scene Editor Lab</span>
              <small>Recovered add/load/save/clear vocabulary and object-inspection workflow.</small>
            </button>
          </div>
        </section>

        <section class="destination-group destination-group-status">
          <div class="destination-group-heading"><span>04</span><h3>Recovery Status</h3><small>One ledger for every discovered scene</small></div>
          <div class="destination-group-grid">
            <button class="destination-card destination-index" data-mode-id="scene-index">
              <span>Complete Scene Index</span>
              <small>All ${ARCHIVE_SCENES.length} distinct screens, scenes, levels, environments, vehicle scenes, and demos—with live restoration status.</small>
            </button>
            <button class="destination-card" data-mode-id="xml-serializer-artifacts">
              <span>XML Serializer Artifacts</span>
              <small>BaseScene/test1 remain inspectable without being miscounted as composed worlds.</small>
            </button>
            <button class="destination-card" data-mode-id="asset-catalog">
              <span>Asset & Provenance Catalog</span>
              <small>Recovered textures, shaders, models, documents, and current binding status.</small>
            </button>
          </div>
        </section>
      </div>
    </section>`;
  }

  private worldArchiveBacklog(): string {
    return `<section class="wide-card backlog-card world-backlog">
      <span class="stat-label">Playable Partial Recoveries</span>
      <ul class="backlog-playable">
        <li><strong>BallZ concepts</strong> — World 1, Map 1, and BallZ 2011 Level0 / Great Slide load and play; materials, rules, navigation, and finish fidelity remain partial.</li>
        <li><button class="mode-card mode-card-compact" data-mode-id="ballz-2011-level1"><span>Inspect BallZ 2011 Level1.TVM</span><small>exact distinct mesh · non-race visit · unknown source gameplay/material</small></button></li>
        <li><button class="mode-card mode-card-compact" data-mode-id="ballz-slide1"><span>Inspect Active Atmel Slide1.TVM</span><small>exact slide + Ball assembly · non-race visit · incomplete source controls</small></button></li>
        <li><button class="mode-card mode-card-compact" data-mode-id="ballz-track-gallery"><span>Browse Remaining Slide / Track Sources</span><small>Slide1A · Slides · Steps · both Bumps · Track1 · exact non-race visits</small></button></li>
        <li><strong>FlightX</strong> — pipe1 and the archive airplane are playable with recovered flight controls and a live route; exact mission/lap fidelity remains partial.</li>
        <li><strong>Piste Ovale</strong> — the Impreza vehicle experiment is playable on its decoded oval.</li>
      </ul>
      <span class="stat-label backlog-queue-label">Still Queued By Original Family</span>
      <ul>
        <li><strong>Remaining BallZ concepts</strong> — Slide1A, Level.Slides, Level.Steps, SlideBump revisions, and BallZTrack1 after the newly exposed Level1 and active Slide1 visits.</li>
        <li><strong>Remaining pipe / flight studies</strong> — additional pipe, spline, and track concepts beyond the playable FlightX pipe1 loop.</li>
      </ul>
      <span class="stat-label backlog-queue-label">Standalone 3D Environment Queue</span>
      <ul>
        <li><strong>Room 2 Shadow Lab</strong> — now a dedicated partial standalone visit; exact HLSL parallax/specular behavior remains.</li>
        <li><strong>Common Room 1 + sky.tvm</strong> — exact sources are now inspectable; any lost authored host assembly still needs evidence.</li>
        <li><button class="mode-card mode-card-compact" data-mode-id="xml-myworld-copy"><span>Visit MyWorld — Copy</span><small>6/7 exact serialized objects · missing arch disclosed · physics metadata retained</small></button></li>
        <li><button class="mode-card mode-card-compact" data-mode-id="object-library-catalog"><span>Browse ObjectLibrary Catalog</span><small>61 exact records · 47 recovered · never presented as a village</small></button></li>
        <li><button class="mode-card mode-card-compact" data-mode-id="dominus-port-evidence"><span>Inspect Dominus Port Evidence</span><small>28 exact port rows · 27 decoded meshes · editor-grid identity retained</small></button> The separately playable town tour is labeled modern curated work because no authored village layout survives.</li>
      </ul>
    </section>`;
  }

  private progressCard(label: string, completed: number, total: number, score: number): string {
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return `<section class="wide-card progress-card">
      <div class="progress-heading">
        <span><span class="stat-label">${escapeHtml(label)}</span><strong>${completed} / ${total} complete</strong></span>
        <span><span class="stat-label">Career Score</span><strong>${score} pts</strong></span>
      </div>
      <div class="progress-track" aria-label="${percent}% complete"><span style="width:${percent}%"></span></div>
    </section>`;
  }

  private challengeSpotlight(race: RaceDefinition, collection: RaceDefinition[], categoryLabel: string): string {
    const challenge = challengeFor(race);
    const loadState = this.raceScene.getRaceLoadState();
    const index = Math.max(0, collection.findIndex((candidate) => candidate.id === race.id));
    const record = this.scoreboard.getRecord(race);
    const medal = this.scoreboard.getMedal(race);
    const completed = this.scoreboard.hasCompleted(race);
    const assetStatus = loadState.error
      ? `<p class="asset-load-state is-error">Recovered level data failed to load. Use Retry Level Load.</p>`
      : !loadState.ready
        ? `<p class="asset-load-state">Preparing recovered level geometry…</p>`
        : "";
    const archiveReference = race.referenceImage
      ? `<figure class="archive-reference"><img src="${escapeHtml(race.referenceImage)}" alt="Archive reference for ${escapeHtml(race.name)}"><figcaption>Archive reference target — not a screenshot of the current build</figcaption></figure>`
      : "";
    return `<section class="wide-card challenge-spotlight">
      <div class="challenge-heading">
        <span class="challenge-number">${escapeHtml(categoryLabel)} ${index + 1} of ${collection.length}</span>
        <span class="difficulty-chip difficulty-${challenge.difficulty.toLowerCase()}">${escapeHtml(challenge.difficulty)}</span>
      </div>
      <h2>${escapeHtml(race.name)}</h2>
      <p>${escapeHtml(challenge.objective)}</p>
      ${archiveReference}
      ${assetStatus}
      <div class="challenge-facts">
        <span><small>Chapter</small><strong>${escapeHtml(challenge.chapter)}</strong></span>
        <span><small>Target</small><strong>${formatRaceTime(race.targetMs)}</strong></span>
        <span><small>Status</small><strong>${completed ? medal ? formatMedal(medal) : "Complete" : "Unplayed"}</strong></span>
        <span><small>Record</small><strong>${formatRaceTime(record.bestMs)}</strong></span>
      </div>
    </section>`;
  }

  private getMapEditorDraft(): MapEditorDraft {
    return {
      width: this.editorWidth,
      height: this.editorHeight,
      cellSize: this.editorCellSize,
      tiles: [...this.editorTiles]
    };
  }

  private syncEditorFromLevel(level: AgentLevelState): void {
    this.activeEditorLevelId = level.id;
    this.editorWidth = level.width;
    this.editorHeight = level.height;
    this.editorCellSize = level.cellSize;
    this.editorTiles = [...level.tiles];
    this.raceScene.setMapEditorDraft(this.getMapEditorDraft());
  }

  private afterAgentLevelMutation(result: AgentLevelResult<AgentLevelState>, refreshEditor = false): AgentLevelResult<AgentLevelState> {
    if (!result.ok) return result;
    const active = this.levelLibrary.active();
    if (active) this.syncEditorFromLevel(active);
    if (refreshEditor && this.state === "map-editor") this.setState("map-editor");
    return result;
  }

  private createAgentLevel(options: AgentLevelCreateOptions): AgentLevelResult<AgentLevelState> {
    return this.afterAgentLevelMutation(this.levelLibrary.create(options), true);
  }

  private removeAgentLevel(id: string): AgentLevelResult<string> {
    const result = this.levelLibrary.remove(id);
    if (result.ok) {
      const active = this.levelLibrary.active();
      if (active) this.syncEditorFromLevel(active);
      if (this.state === "map-editor") this.setState("map-editor");
    }
    return result;
  }

  private openAgentLevel(id: string): AgentLevelResult<AgentLevelState> {
    const result = this.levelLibrary.activate(id);
    if (!result.ok || !result.value) return result;
    this.syncEditorFromLevel(result.value);
    this.openArchiveMode("map-editor");
    return result;
  }

  private transactAgentLevel(id: string, operations: AgentLevelOperation[], options?: AgentLevelTransactionOptions): AgentLevelResult<AgentLevelState> {
    return this.afterAgentLevelMutation(this.levelLibrary.transaction(id, operations, options), id === this.activeEditorLevelId);
  }

  private patchAgentLevel(id: string, changes: AgentLevelCellPatch[], options?: AgentLevelTransactionOptions): AgentLevelResult<AgentLevelState> {
    return this.afterAgentLevelMutation(this.levelLibrary.patch(id, changes, options), id === this.activeEditorLevelId);
  }

  private fillAgentLevel(id: string, rect: AgentLevelRect, tile: MapEditorTile, options?: AgentLevelTransactionOptions): AgentLevelResult<AgentLevelState> {
    return this.afterAgentLevelMutation(this.levelLibrary.fill(id, rect, tile, options), id === this.activeEditorLevelId);
  }

  private resizeAgentLevel(id: string, width: number, height: number, defaultTile?: MapEditorTile, options?: AgentLevelTransactionOptions): AgentLevelResult<AgentLevelState> {
    return this.afterAgentLevelMutation(this.levelLibrary.resize(id, width, height, defaultTile, options), id === this.activeEditorLevelId);
  }

  private undoAgentLevel(id: string): AgentLevelResult<AgentLevelState> {
    return this.afterAgentLevelMutation(this.levelLibrary.undo(id), id === this.activeEditorLevelId);
  }

  private importAgentLevelAscii(source: AgentLevelAsciiImport): AgentLevelResult<AgentLevelState> {
    return this.afterAgentLevelMutation(this.levelLibrary.importAscii(source), true);
  }

  private playAgentLevel(id: string): AgentLevelResult<AgentLevelState> {
    const opened = this.levelLibrary.activate(id);
    if (!opened.ok || !opened.value) return opened;
    this.syncEditorFromLevel(opened.value);
    this.gameplayOrigin = "map-editor";
    this.raceScene.setCustomRace(draftToRaceDefinition(this.getMapEditorDraft(), opened.value.label, opened.value.id));
    this.raceScene.setPreviewMode("race-preview");
    if (!this.raceScene.startRace()) {
      return { ok: false, revision: opened.revision, error: `Could not start level: ${id}` };
    }
    this.setState("gameplay");
    this.scrollPanelToTop();
    return opened;
  }

  private paintEditorTile(index: number): void {
    const next = [...this.editorTiles];
    const selected = this.selectedEditorTile;
    if (selected === "start" || selected === "half" || selected === "finish") {
      for (let tileIndex = 0; tileIndex < next.length; tileIndex += 1) {
        if (next[tileIndex] === selected) {
          next[tileIndex] = "floor";
        }
      }
    }
    next[index] = next[index] === selected ? "floor" : selected;
    const changes = next.flatMap<AgentLevelCellPatch>((tile, tileIndex) => tile === this.editorTiles[tileIndex]
      ? []
      : [{ x: tileIndex % this.editorWidth, y: Math.floor(tileIndex / this.editorWidth), tile }]);
    this.afterAgentLevelMutation(this.levelLibrary.patch(this.activeEditorLevelId, changes), false);
  }

  private mapEditorLibrary(): string {
    const levels = this.levelLibrary.list().map((level) => {
      const selected = level.id === this.activeEditorLevelId ? " is-selected" : "";
      return `<button class="race-card${selected}" data-editor-level-id="${escapeHtml(level.id)}">
        <span>${escapeHtml(level.label)}</span>
        <small>${level.width}×${level.height} · rev ${level.revision} · ${level.counts.ring} rings · ${level.counts.fire + level.counts.ice} forces</small>
      </button>`;
    }).join("");
    return `<section class="wide-card map-editor-card" data-agent-level-library>
      <div class="agent-level-library-heading"><span><span class="stat-label">Named Level Library</span><strong>${this.levelLibrary.list().length} levels · ${escapeHtml(this.activeEditorLevelId)}</strong></span><button class="math-preset" data-editor-new-level><span>New 16×16 Level</span><small>blank named draft</small></button></div>
      <div class="race-list">${levels}</div>
      <small>Agent: <code>gx.levels.region(id, rect)</code> → <code>patch / fill / transaction</code> → <code>play(id)</code></small>
    </section>`;
  }

  private mapEditorPalette(): string {
    const tools = MAP_EDITOR_TOOLS.map((tool) => {
      const selected = tool.tile === this.selectedEditorTile ? " is-selected" : "";
      return `<button class="tile-tool tile-${escapeHtml(tool.tile)}${selected}" data-editor-tool="${escapeHtml(tool.tile)}">
        <span>${escapeHtml(tool.label)}</span>
        <small>${escapeHtml(tool.hint)}</small>
      </button>`;
    }).join("");

    return `<section class="wide-card map-editor-card">
      <span class="stat-label">Tile Palette</span>
      <div class="tile-tool-list">${tools}</div>
    </section>`;
  }

  private mapEditorGrid(): string {
    const cells = this.editorTiles.map((tile, index) => {
      const selected = tile === this.selectedEditorTile ? " matches-tool" : "";
      return `<button class="map-cell tile-${escapeHtml(tile)}${selected}" data-editor-cell="${index}" title="${escapeHtml(tile)}">
        <span>${escapeHtml(tileSymbol(tile))}</span>
      </button>`;
    }).join("");

    return `<section class="wide-card map-editor-card" data-agent-level-editor="${escapeHtml(this.activeEditorLevelId)}" data-agent-level-revision="${this.levelLibrary.get(this.activeEditorLevelId)?.revision ?? 0}">
      <span class="stat-label">Clickable Map Draft</span>
      <div class="map-grid" data-editor-grid-width="${this.editorWidth}" data-editor-grid-height="${this.editorHeight}" style="--map-columns:${this.editorWidth}">${cells}</div>
    </section>`;
  }

  private formatMapEditorStats(): string {
    const counts = this.editorTiles.reduce<Record<MapEditorTile, number>>(
      (accumulator, tile) => {
        accumulator[tile] += 1;
        return accumulator;
      },
      { floor: 0, wall: 0, start: 0, ring: 0, half: 0, finish: 0, hazard: 0, fire: 0, ice: 0 }
    );
    return [
      `${counts.wall} walls`,
      `${counts.ring} rings`,
      `${counts.hazard} hazards`,
      `${counts.fire} fire forces`,
      `${counts.ice} ice forces`,
      `${counts.start} start`,
      `${counts.half} half`,
      `${counts.finish} finish`
    ].join("<br>");
  }

  private formatMapEditorExport(): string {
    const exported = this.levelLibrary.exportAscii(this.activeEditorLevelId).value;
    return exported
      ? JSON.stringify({ id: exported.id, width: exported.width, height: exported.height, cellSize: exported.cellSize, rows: exported.rows })
      : "{}";
  }

  private inputDeviceDashboard(): string[] {
    const state = this.inputDeviceLab.getState();
    const monitor = this.raceScene.getDeviceMonitorState();
    const profiles = DEVICE_PROFILES.map((profile) => `<button class="mode-card mode-card-compact${state.profile === profile.id ? " is-selected" : ""}" data-device-profile="${profile.id}"><span>${escapeHtml(profile.label)}</span><small>${escapeHtml(profile.wire)}</small></button>`).join("");
    const ioButtons = state.io.map((opened, index) => `<button class="device-io${opened ? " is-open" : ""}" data-device-io="${index}"><img src="/assets/device-lab/${opened ? "OpenedIcon.bmp" : "ClosedIc.bmp"}" alt=""><span>IO ${index}</span><strong>${opened ? "OPEN" : "CLOSED"}</strong></button>`).join("");
    const schedules = state.schedules.map((schedule, index) => `<button class="race-card${schedule.enabled ? " is-selected" : ""}" data-device-schedule="${index}"><span>${escapeHtml(schedule.label)}</span><strong>${schedule.start} → ${schedule.stop}</strong><small>alarm ${index * 2} · ${schedule.enabled ? "enabled" : "disabled"}</small></button>`).join("");
    const servoSliders = (["middle", "left", "right", "claw"] as ServoId[]).map((servo) => `<label class="math-slider"><span>${escapeHtml(servo)} <strong data-device-servo-value="${servo}">${state.meArm[servo]}°</strong></span><input type="range" min="0" max="180" step="1" value="${state.meArm[servo]}" data-device-servo="${servo}"></label>`).join("");
    const radarPoints = state.radar.map((point) => {
      const length = Math.min(145, point.radius * 1.15);
      const radians = MathUtils.degToRad(point.angle);
      const x = 180 + Math.cos(radians) * length;
      const y = 165 - Math.sin(radians) * length;
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${point.pass === "forward" ? 1.8 : 1.25}" class="radar-${point.pass}"/>`;
    }).join("");

    return [
      `<section class="wide-card device-safety"><div><span class="status-chip status-ported">SIMULATION DEFAULT</span><strong>9600 baud · no automatic port access</strong><small>${state.hardwareAvailable ? "Web Serial detected, but physical transport is deliberately held behind hardware QA." : "Web Serial unavailable in this context; all controls remain deterministic dry-run simulations."}</small></div><button class="button ${state.armed ? "button-danger" : "button-secondary"}" data-device-action="arm">${state.armed ? "STOP & DISARM" : "ARM ACTUATORS"}</button></section>`,
      `<section class="wide-card device-input-card"><div><span class="stat-label">BallZ18 Input Monitor</span><strong data-device-connection>${monitor.connected ? escapeHtml(monitor.id ?? "Gamepad") : "No gamepad · keyboard/mouse fallbacks live"}</strong><div class="device-axis-readout"><span>X <b data-device-axis="x">${Math.round(monitor.horizontal * 100)}</b></span><span>Y <b data-device-axis="y">${Math.round(monitor.vertical * 100)}</b></span><small>deadzone 0.19 · pointer ratio 50</small></div></div><div class="device-stick"><img class="device-stick-ring" src="/assets/device-lab/Circle-Thick-Purple-300x300.png" alt="BallZ18 controller ring"><img class="device-stick-pointer" data-device-pointer src="/assets/device-lab/CenterTarget.png" alt="controller pointer"></div><div class="device-button-lamps"><span data-device-button="fire1">FIRE 1<small>button 0 · Ctrl / mouse 0</small></span><span data-device-button="fire2">FIRE 2<small>button 1 · Alt / mouse 1</small></span><span data-device-button="fire3">FIRE 3<small>button 2 · Shift / mouse 2</small></span><span data-device-button="jump">JUMP<small>button 3 · Space</small></span></div></section>`,
      `<section class="wide-card"><span class="stat-label">Connection / Protocol Profile</span><div class="mode-list">${profiles}</div><div class="device-protocol-actions"><button class="race-card" data-device-action="identify"><span>Identify</span><small>simulate the selected archive handshake</small></button><button class="race-card" disabled><span>Connect Serial</span><small>permission picker held for hardware QA · never auto-scan</small></button></div></section>`,
      `<section class="wide-card device-robot-card"><div><span class="stat-label">Robot Console</span><strong>Source pin ${state.pin}: ${state.pinOn ? "ON" : "OFF"}</strong><div class="device-dpad"><button data-device-robot="8">↑<small>8</small></button><button data-device-robot="4">←<small>4</small></button><button class="device-stop" data-device-robot="2">STOP<small>2</small></button><button data-device-robot="6">→<small>6</small></button></div><div class="race-list"><button class="race-card" data-device-action="pin"><span>Set Pin 8 ${state.pinOn ? "OFF" : "ON"}</span><small>command 127</small></button><button class="race-card" data-device-action="sonar"><span>Single Sonar</span><strong>${state.sonarDistanceCm} cm</strong><small>command 129</small></button><button class="race-card" data-device-action="sweep"><span>Radar Sweep</span><strong>${state.radar.length || 0} points</strong><small>command 130 · forward + reverse</small></button></div></div><svg class="device-radar" viewBox="0 0 360 180" role="img" aria-label="simulated archive sonar radar"><path d="M20 165 A160 160 0 0 1 340 165"/><line x1="180" y1="165" x2="20" y2="165"/><line x1="180" y1="165" x2="340" y2="165"/>${radarPoints}</svg></section>`,
      `<section class="wide-card"><span class="stat-label">AtmelCubx Eight-Channel I/O</span><div class="device-io-grid">${ioButtons}</div><div class="race-list">${schedules}</div><small>ON = D + raw channel byte · OFF = E + raw channel byte · schedule = C + alarm + HHMM + HHMM + state.</small></section>`,
      `<section class="wide-card"><div class="agent-level-library-heading"><span><span class="stat-label">MeArm Dry-Run</span><strong>${state.meArm.started ? "Started LED" : "Stopped"}</strong></span><button class="math-preset${state.meArm.started ? " is-selected" : ""}" data-device-action="mearm"><span>${state.meArm.started ? "Stop MeArm" : "Start MeArm"}</span><small>requires ARM · A/a</small></button></div><div class="math-slider-list">${servoSliders}</div><small>z middle · x left · c right · v claw. Values clamp to 0–180°; the revival repairs the archived left/right/claw assignment bug.</small></section>`,
      `<section class="wide-card device-log-card"><span class="stat-label">Bounded TX / RX Log</span><div class="device-log" data-device-log>${this.deviceProtocolLogRows()}</div></section>`
    ];
  }

  private deviceProtocolLogRows(): string {
    return this.inputDeviceLab.getState().log.map((entry) => `<div class="device-log-row direction-${entry.direction.toLowerCase()}"><time>${entry.at}</time><strong>${entry.direction}</strong><span>${escapeHtml(entry.text)}</span><code>${entry.hex}</code></div>`).join("");
  }

  private renderDeviceProtocolLog(): void {
    const log = this.stats.querySelector<HTMLElement>("[data-device-log]");
    if (log) log.innerHTML = this.deviceProtocolLogRows();
  }

  private renderDeviceInputLiveHud(): void {
    if (this.state !== "input-device-lab") return;
    const monitor = this.raceScene.getDeviceMonitorState();
    const pointer = this.stats.querySelector<HTMLElement>("[data-device-pointer]");
    if (pointer) pointer.style.transform = `translate(calc(-50% + ${monitor.horizontal * 50}px), calc(-50% - ${monitor.vertical * 50}px))`;
    const x = this.stats.querySelector<HTMLElement>("[data-device-axis=\"x\"]");
    const y = this.stats.querySelector<HTMLElement>("[data-device-axis=\"y\"]");
    if (x) x.textContent = String(Math.round(monitor.horizontal * 100));
    if (y) y.textContent = String(Math.round(monitor.vertical * 100));
    const connection = this.stats.querySelector<HTMLElement>("[data-device-connection]");
    if (connection) connection.textContent = monitor.connected ? monitor.id ?? "Gamepad connected" : "No gamepad · keyboard/mouse fallbacks live";
    for (const button of ["fire1", "fire2", "fire3", "jump"] as const) {
      this.stats.querySelector<HTMLElement>(`[data-device-button="${button}"]`)?.classList.toggle("is-active", monitor.buttons[button]);
    }
  }

  private recoveryList(items: ArchiveRecoveryItem[]): string {
    const cards = items.map((item) => {
      return `<article class="recovery-card">
        <span class="status-chip status-${escapeHtml(item.status)}">${escapeHtml(statusLabel(item.status))}</span>
        <strong>${escapeHtml(item.label)}</strong>
        <small>${escapeHtml(item.source)}</small>
        <p>${escapeHtml(item.detail)}</p>
      </article>`;
    }).join("");

    return `<section class="wide-card"><span class="stat-label">Recovery Map</span><div class="recovery-list">${cards}</div></section>`;
  }

  private sceneStatusSummary(): string {
    const statuses: ArchiveSceneStatus[] = ["RESTORED", "PARTIAL", "REGRESSED", "PIPELINE", "MISSING", "RESEARCH"];
    const counts = new Map(statuses.map((status) => [status, ARCHIVE_SCENES.filter((scene) => scene.status === status).length]));
    const cards = statuses
      .map(
        (status) => `<article class="scene-summary-card status-panel-${status.toLowerCase()}">
          <span class="scene-status status-${status.toLowerCase()}">${status}</span>
          <strong>${counts.get(status) ?? 0}</strong>
        </article>`
      )
      .join("");
    return `<section class="wide-card scene-summary">
      <div class="scene-summary-heading"><span><span class="stat-label">Audited Scene Census</span><strong>${ARCHIVE_SCENES.length} distinct scenes</strong></span><small>Duplicate backup copies and individual prop meshes are excluded.</small></div>
      <div class="scene-summary-list">${cards}</div>
    </section>`;
  }

  private sceneCensus(): string {
    const families = [...new Set(ARCHIVE_SCENES.map((scene) => scene.family))];
    const sections = families
      .map((family) => {
        const scenes = ARCHIVE_SCENES.filter((scene) => scene.family === family);
        const cards = scenes
          .map(
            (scene) => `<article class="scene-census-card status-panel-${scene.status.toLowerCase()}">
              <div class="scene-card-heading"><span class="scene-status status-${scene.status.toLowerCase()}">${escapeHtml(scene.status)}</span><em>${escapeHtml(scene.kind)}</em></div>
              <strong>${escapeHtml(scene.name)}</strong>
              <small>${escapeHtml(scene.source)}</small>
              <p>${escapeHtml(scene.revival)}</p>
            </article>`
          )
          .join("");
        return `<section class="wide-card scene-family"><div class="scene-family-heading"><span class="stat-label">${escapeHtml(family)}</span><strong>${scenes.length}</strong></div><div class="scene-census-list">${cards}</div></section>`;
      })
      .join("");
    return sections;
  }

  private cubXWorkbench(): string {
    const state = this.raceScene.getCubXMenuState();
    const cubeLabels = ["Atmel Control", "System Info", "Notes", "3D Scenes", "BallZ", "Vehicles", "Media", "Tools"];
    const phaseLabel: Record<typeof state.phase, string> = {
      idle: "Choose one of eight cubes",
      rotating: `Rotating ${state.selectedLabel ?? "cube"} forward…`,
      opening: "Unfolding CubeOpen panels…",
      open: `${state.selectedLabel ?? "Menu"} is open`,
      closing: "Closing internal panels…",
      returning: "Rotating CubZ home…"
    };
    const cubeButtons = cubeLabels
      .map(
        (label, index) => `<button class="race-card" data-cubx-cube="${index}" ${state.phase === "idle" ? "" : "disabled"}>
          <span class="race-step">Cube ${index + 1}</span><span class="race-name">${escapeHtml(label)}</span><small>RotateTo(${index})</small>
        </button>`
      )
      .join("");
    const actionButtons = state.actions
      .map(
        (action, index) => `<button class="race-card${state.selectedAction === action ? " is-selected" : ""}" data-cubx-action="${index}">
          <span class="race-step">Panel ${index + 1}</span><span class="race-name">${escapeHtml(action)}</span><small>inside CubZ menu level</small>
        </button>`
      )
      .join("");
    const ballPresetCards = ([
      ["fire", "Fire", "Recovered BallFire exterior · Revival physics"],
      ["classic2015", "Classic", "2015 gravity −25 · crisp angular brake"],
      ["revival", "Revival", "Modern web handling · fluid shell presentation"]
    ] as const)
      .map(([id, label, detail]) => `<button class="race-card${state.ballSelector.selected === id ? " is-selected" : ""}" data-ball-preset="${id}">
        <span class="race-step">Ball</span><span class="race-name">${label}</span><small>${detail}</small>
      </button>`)
      .join("");
    const satelliteDetails: Record<CubXSatelliteId, string> = {
      system: "Recovered explosion-scene branch is unavailable · inspect only",
      tools: "Recovered destination: one-car Impreza Car Scene",
      earth: "Recovered click handler is empty · inspect only",
      "earth-grid": "Same Earth anchor · transparent spinning grid adapter",
      arrow: "ALLMENU 666 · return to source menu level 0",
      sun: "Always visible · launch flightx-pipe"
    };
    const satelliteCards = state.satellites.items
      .filter((item) => item.id !== "earth-grid" && item.id !== "sun")
      .map((item) => `<button class="race-card${state.satellites.selected === item.id ? " is-selected" : ""}" data-cubx-satellite="${item.id}" ${item.visible ? "" : "disabled"}>
        <span class="race-step">${item.menuTag === "always" ? "Always" : `Level ${item.menuTag}`}</span><span class="race-name">${escapeHtml(item.label)}</span><small>${escapeHtml(satelliteDetails[item.id])} · source (${item.sourcePosition.join(", ")})</small>
      </button>`)
      .join("");
    const openControls =
      state.phase === "open"
        ? state.selectedCube === 4
          ? `<section class="ball-selector-screen"><span class="stat-label">Ball Selector · Fire / Classic / Revival</span><div class="race-list">${ballPresetCards}<button class="race-card" data-cubx-back><span class="race-step">Exit</span><span class="race-name">Close CubZ</span><small>selection persists for the next BallZ race</small></button></div><small>${state.ballSelector.recoveredMeshesReady ? "BallFire and BallShell are loaded from tvm-catalog.json." : "Loading recovered BallFire/BallShell geometry…"}</small></section>`
          : `<div class="race-list">${actionButtons}<button class="race-card" data-cubx-back><span class="race-step">Exit</span><span class="race-name">Close CubZ</span><small>reverse CubeOpen, then BackRotate</small></button></div>`
        : `<div class="race-list">${cubeButtons}</div>`;

    const sourceCenters = state.sourceLayout.centers
      .map((center, index) => `<span>#${index + 1} (${center.join(", ")})</span>`)
      .join("");
    const tvaSample = state.sourceAnimation.activeSample;
    const openPhaseActive = state.phase === "opening" || state.phase === "open" || state.phase === "closing";
    const tvaTelemetry = openPhaseActive
      ? `CubeOpen · frame ${tvaSample?.kind === "cube-open" ? tvaSample.cursor.sourceFrame.toFixed(2) : state.phase === "open" ? state.sourceAnimation.openClip.endFrame.toFixed(2) : "0.00"} · ${state.phase === "closing" ? "reverse" : "forward"}`
      : tvaSample
        ? `${tvaSample.kind === "cube-rotation" ? `Animation${tvaSample.animationId} · GlobalCube` : "CubeOpen"} · frame ${tvaSample.cursor.sourceFrame.toFixed(2)} · ${tvaSample.cursor.direction}`
        : "idle · decoded clips ready";

    return `<section class="wide-card cubx-workbench" data-cubx-state="${state.phase}">
      <span class="stat-label">Live CubZ State Machine</span>
      <strong>${escapeHtml(phaseLabel[state.phase])}</strong>
      <small>Click the 3D cube or recovered satellites directly, or use these mirrored controls. The red 3D sun launches FlightX. ${state.selectedAction ? `Selected panel: ${escapeHtml(state.selectedAction)}.` : ""}</small>
      <button class="race-card" data-cubx-sun><span class="race-step">Sun</span><span class="race-name">Launch FlightX — Pipe Loop</span><small>race id ${state.sunLaunch.raceId} · source CubXScene sun action</small></button>
      <section class="ball-selector-screen"><span class="stat-label">Recovered CubX Satellite Shell · menu level ${state.satellites.activeMenuLevel}</span><div class="race-list">${satelliteCards}</div><small>System, Tools, Earth, Earth Grid, Arrow, and Sun preserve their recovered source coordinates at one disclosed ${state.satellites.displayScale}× browser scale. MenuManager limits: ${state.satellites.menuRules.maxButtons} buttons · ${state.satellites.menuRules.maxLevels} levels · wildcards ${state.satellites.menuRules.allMenu}/${state.satellites.menuRules.allMenuExceptMain}.</small></section>
      ${openControls}
      <div class="fidelity-note">
        <strong>Recovered source constellation</strong>
        <small>Arrow geometry: ${state.satellites.visualAdapter.recoveredArrowGeometryReady ? "decoded Fleche.tvm" : "loading procedural fallback"}. ${escapeHtml(state.satellites.visualAdapter.pending)}.</small>
        <strong>Exact CubZ hit layout</strong>
        <small>fSize ${state.sourceLayout.modelScale} · ${state.sourceLayout.cubeSize}-unit source boxes · centered only for browser presentation</small>
        <div class="tag-row">${sourceCenters}</div>
        <strong>Decoded TVA playback</strong>
        <small>${escapeHtml(tvaTelemetry)} · CubeOpen Right08 / Top08 / Left08 · rotation ${state.sourceAnimation.rotationClips[0].durationSeconds.toFixed(3)} s · open phase ${state.sourceAnimation.openClip.durationSeconds.toFixed(3)} s</small>
        <small>Authentic constants: idle ${state.sourceAnimation.choreography.idleSpinDegreesPerSecond.join("/")}°/s · exact range timing ${state.sourceAnimation.choreography.rotationRangeDurationSeconds.toFixed(3)} s · camera ${state.sourceAnimation.choreography.cameraFly.stepPerFrame.join("/")} per frame to ${state.sourceAnimation.choreography.cameraFly.sourceTarget.join("/")}${state.sourceAnimation.choreography.cameraFly.complete ? " (focused)" : " (flying)"}.</small>
        <small>Open/close uses only decoded CubeOpen.tva frames 0–50; the older CubXActor CubXOpen file is isolated in its own inspector. Original CubZ actor/button geometry, verified TV3D handedness, and today's four panel labels remain an explicit visual adapter.</small>
      </div>
    </section>`;
  }

  private handleAgentWorldAuthoring(button: HTMLButtonElement): void {
    const action = button.dataset.agentAuthoringAction;
    const studio = button.closest<HTMLElement>("[data-agent-authoring-studio]");
    if (!action || !studio) return;
    try {
      if (action === "select") {
        this.agentWorldSelectedEntityId = button.dataset.entityId ?? null;
        this.agentWorldEditorMessage = this.agentWorldSelectedEntityId ? `Editing ${this.agentWorldSelectedEntityId}.` : "Select an entity.";
        this.agentWorldEditorHasError = false;
        this.raceScene.selectAgentWorldEntities(this.agentWorldSelectedEntityId ? [this.agentWorldSelectedEntityId] : []);
        return;
      }
      if (action === "import-file") {
        studio.querySelector<HTMLInputElement>("[data-agent-world-file-input]")?.click();
        return;
      }
      if (action === "download-world") {
        const definition = this.raceScene.exportAgentWorld();
        if (!definition) throw new Error("There is no world to export");
        const blob = new Blob([`${JSON.stringify(definition, null, 2)}\n`], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${definition.id.replace(/[^a-z0-9_-]+/gi, "-") || "graphysx-world"}.graphysx.json`;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
        this.agentWorldEditorHasError = false;
        this.agentWorldEditorMessage = `Downloaded ${anchor.download}.`;
        this.setState("world-api-lab");
        return;
      }
      if (action === "create") {
        const type = agentAuthorValue(studio, "create", "type") as AgentWorldEntityDefinition["type"];
        const id = agentAuthorValue(studio, "create", "id").trim();
        const label = agentAuthorValue(studio, "create", "label").trim();
        const parentId = agentAuthorValue(studio, "create", "parent").trim();
        const physicsMode = agentAuthorValue(studio, "create", "physics-mode");
        const entity: AgentWorldEntityDefinition = {
          ...(id ? { id } : {}),
          ...(label ? { label } : {}),
          ...(parentId ? { parentId } : {}),
          type,
          transform: {
            position: agentAuthorVector(studio, "create", "position", [0, type === "plane" ? 0 : 1, 0]),
            rotationDegrees: agentAuthorVector(studio, "create", "rotation", [0, 0, 0]),
            scale: agentAuthorVector(studio, "create", "scale", [1, 1, 1])
          },
          material: {
            color: agentAuthorValue(studio, "create", "color") || "#7de6c3",
            emissive: agentAuthorValue(studio, "create", "emissive") || "#071f23",
            emissiveIntensity: agentAuthorNumber(studio, "create", "emissive-intensity", 0.3),
            roughness: agentAuthorNumber(studio, "create", "roughness", 0.55),
            metalness: agentAuthorNumber(studio, "create", "metalness", 0.08),
            opacity: agentAuthorNumber(studio, "create", "opacity", 1),
            texture: agentAuthorTexture(studio, "create")
          },
          geometry: {
            width: agentAuthorNumber(studio, "create", "width", 1),
            height: agentAuthorNumber(studio, "create", "height", 1),
            depth: agentAuthorNumber(studio, "create", "depth", 1),
            radius: agentAuthorNumber(studio, "create", "radius", 0.5),
            tube: agentAuthorNumber(studio, "create", "tube", 0.12),
            radialSegments: Math.round(agentAuthorNumber(studio, "create", "segments", 24))
          },
          intensity: agentAuthorNumber(studio, "create", "intensity", 1),
          distance: agentAuthorNumber(studio, "create", "distance", 0),
          visible: true,
          tags: agentAuthorTags(studio, "create")
        };
        if (type === "model") {
          entity.asset = {
            id: agentAuthorValue(studio, "create", "asset") || GRAPHYSX_AGENT_WORLD_ASSETS[0].id,
            fitSize: agentAuthorNumber(studio, "create", "fit-size", 4)
          };
        }
        if (type === "spline") {
          const source = JSON.parse(agentAuthorValue(studio, "create", "path"));
          const points = Array.isArray(source) ? source : source?.points;
          if (!Array.isArray(points)) throw new Error("Spline points must be a JSON array");
          entity.path = { points, closed: agentAuthorChecked(studio, "create", "closed") };
        }
        if (type === "agent") {
          entity.agent = {
            role: agentAuthorValue(studio, "create", "agent-role").trim() || "world participant",
            status: agentAuthorValue(studio, "create", "agent-status").trim() || "ready",
            perceptionRadius: agentAuthorNumber(studio, "create", "agent-perception", 6),
            capabilities: agentAuthorValue(studio, "create", "agent-capabilities").split(",").map((capability) => capability.trim()).filter(Boolean)
          };
        }
        if (physicsMode !== "none") {
          entity.physics = {
            mode: physicsMode as "static" | "dynamic" | "kinematic",
            mass: agentAuthorNumber(studio, "create", "mass", 1),
            material: agentAuthorValue(studio, "create", "physics-material") as "default" | "wall" | "finish" | "ground" | "ball" | "human",
            linearVelocity: agentAuthorVector(studio, "create", "velocity", [0, 0, 0])
          };
        }
        const result = this.raceScene.spawnAgentWorldEntity(entity);
        if (result.ok && result.value) {
          this.agentWorldSelectedEntityId = result.value.id;
          this.raceScene.selectAgentWorldEntities([result.value.id]);
        }
        this.finishAgentWorldAuthoring(result, result.ok ? `Created ${result.value?.id}.` : undefined);
        return;
      }
      if (action === "update") {
        const id = button.dataset.entityId ?? this.agentWorldSelectedEntityId;
        if (!id) throw new Error("Select an entity to update");
        const currentDefinition = this.raceScene.exportAgentWorld()?.entities.find((entity) => entity.id === id);
        const physicsMode = agentAuthorValue(studio, "edit", "physics-mode");
        const interactions = JSON.parse(agentAuthorValue(studio, "edit", "interactions") || "[]");
        if (!Array.isArray(interactions)) throw new Error("Interactions must be a JSON array");
        const result = this.raceScene.updateAgentWorldEntity(id, {
          label: agentAuthorValue(studio, "edit", "label").trim() || id,
          parentId: agentAuthorValue(studio, "edit", "parent").trim() || null,
          transform: {
            position: agentAuthorVector(studio, "edit", "position", [0, 0, 0]),
            rotationDegrees: agentAuthorVector(studio, "edit", "rotation", [0, 0, 0]),
            scale: agentAuthorVector(studio, "edit", "scale", [1, 1, 1])
          },
          material: {
            color: agentAuthorValue(studio, "edit", "color") || "#7de6c3",
            emissive: agentAuthorValue(studio, "edit", "emissive") || "#071f23",
            emissiveIntensity: agentAuthorNumber(studio, "edit", "emissive-intensity", 0.3),
            roughness: agentAuthorNumber(studio, "edit", "roughness", 0.55),
            metalness: agentAuthorNumber(studio, "edit", "metalness", 0.08),
            opacity: agentAuthorNumber(studio, "edit", "opacity", 1),
            texture: agentAuthorTexture(studio, "edit")
          },
          visible: agentAuthorChecked(studio, "edit", "visible"),
          tags: agentAuthorTags(studio, "edit"),
          intensity: agentAuthorNumber(studio, "edit", "intensity", 1),
          distance: agentAuthorNumber(studio, "edit", "distance", 0),
          physics: physicsMode === "none" ? null : {
            mode: physicsMode as "static" | "dynamic" | "kinematic",
            mass: agentAuthorNumber(studio, "edit", "mass", 1),
            material: agentAuthorValue(studio, "edit", "physics-material") as "default" | "wall" | "finish" | "ground" | "ball" | "human",
            linearVelocity: agentAuthorVector(studio, "edit", "velocity", [0, 0, 0])
          },
          ...(currentDefinition?.type === "agent" ? { agent: {
            role: agentAuthorValue(studio, "edit", "agent-role").trim() || "world participant",
            status: agentAuthorValue(studio, "edit", "agent-status").trim() || "ready",
            perceptionRadius: agentAuthorNumber(studio, "edit", "agent-perception", 6),
            capabilities: agentAuthorValue(studio, "edit", "agent-capabilities").split(",").map((capability) => capability.trim()).filter(Boolean)
          } } : {}),
          interactions
        });
        this.finishAgentWorldAuthoring(result, result.ok ? `Updated ${id}.` : undefined);
        return;
      }
      if (action === "add-interaction") {
        const id = button.dataset.entityId ?? this.agentWorldSelectedEntityId;
        if (!id) throw new Error("Select an entity first");
        const definition = this.raceScene.exportAgentWorld()?.entities.find((entity) => entity.id === id);
        if (!definition) throw new Error(`Unknown entity: ${id}`);
        const type = agentAuthorValue(studio, "edit", "interaction-type") as AgentWorldInteraction["type"];
        const targetIds = agentAuthorValue(studio, "edit", "interaction-targets").split(",").map((target) => target.trim()).filter(Boolean);
        const label = agentAuthorValue(studio, "edit", "interaction-label").trim() || (type === "apply-impulse" ? "Apply impulse" : "Toggle visibility");
        const interaction: AgentWorldInteraction = type === "apply-impulse"
          ? { type, label, targetIds, impulse: agentAuthorVector(studio, "edit", "interaction-impulse", [0, 5, 0]) }
          : { type: "toggle-visibility", label, targetIds };
        const result = this.raceScene.updateAgentWorldEntity(id, { interactions: [...(definition.interactions ?? []), interaction] });
        this.finishAgentWorldAuthoring(result, result.ok ? `Added ${type} interaction to ${id}.` : undefined);
        return;
      }
      if (action === "remove-interaction") {
        const id = button.dataset.entityId ?? this.agentWorldSelectedEntityId;
        const interactionId = button.dataset.interactionId;
        if (!id || !interactionId) throw new Error("Interaction target is missing");
        const definition = this.raceScene.exportAgentWorld()?.entities.find((entity) => entity.id === id);
        if (!definition) throw new Error(`Unknown entity: ${id}`);
        const result = this.raceScene.updateAgentWorldEntity(id, { interactions: (definition.interactions ?? []).filter((interaction) => interaction.id !== interactionId) });
        this.finishAgentWorldAuthoring(result, result.ok ? `Removed ${interactionId} from ${id}.` : undefined);
        return;
      }
      if (action === "remove") {
        const id = button.dataset.entityId ?? this.agentWorldSelectedEntityId;
        if (!id) throw new Error("Select an entity to remove");
        const result = this.raceScene.removeAgentWorldEntity(id);
        if (result.ok) this.agentWorldSelectedEntityId = null;
        this.finishAgentWorldAuthoring(result, result.ok ? `Removed ${id} and its descendants.` : undefined);
        return;
      }
      if (action === "attach-behavior") {
        const id = button.dataset.entityId ?? this.agentWorldSelectedEntityId;
        if (!id) throw new Error("Select an entity first");
        const behavior = JSON.parse(agentAuthorValue(studio, "edit", "behavior")) as AgentWorldBehavior;
        const result = this.raceScene.attachAgentWorldBehavior(id, behavior);
        this.finishAgentWorldAuthoring(result, result.ok ? `Attached ${behavior.type} to ${id}.` : undefined);
        return;
      }
      if (action === "detach-behavior") {
        const id = button.dataset.entityId ?? this.agentWorldSelectedEntityId;
        const behaviorId = button.dataset.behaviorId;
        if (!id || !behaviorId) throw new Error("Behavior target is missing");
        const result = this.raceScene.detachAgentWorldBehavior(id, behaviorId);
        this.finishAgentWorldAuthoring(result, result.ok ? `Detached ${behaviorId} from ${id}.` : undefined);
        return;
      }
      if (action === "apply-world") {
        const definition = JSON.parse(agentAuthorValue(studio, "json", "world")) as AgentWorldDefinition;
        const result = this.raceScene.createAgentWorld(definition);
        if (result.ok) this.agentWorldSelectedEntityId = result.value?.entities[0]?.id ?? null;
        this.finishAgentWorldAuthoring(result, result.ok ? `Loaded world ${definition.id}.` : undefined);
        return;
      }
      if (action === "run-transaction") {
        const commands = JSON.parse(agentAuthorValue(studio, "json", "transaction")) as AgentWorldCommand[];
        if (!Array.isArray(commands)) throw new Error("Transaction JSON must be an array of commands");
        const result = this.raceScene.transactAgentWorld(commands);
        this.finishAgentWorldAuthoring(result, result.ok ? `Committed ${commands.length} UI command${commands.length === 1 ? "" : "s"}.` : undefined);
        return;
      }
      if (action === "run-commit") {
        const changeSet = JSON.parse(agentAuthorValue(studio, "json", "commit")) as AgentWorldChangeSet;
        const result = this.raceScene.commitAgentWorld(changeSet);
        this.finishAgentWorldAuthoring(result, result.ok ? `Committed ${result.value?.commit.id}.` : undefined);
        return;
      }
      if (action === "save-snapshot" || action === "load-snapshot") {
        const name = agentAuthorValue(studio, "json", "snapshot").trim();
        if (!name) throw new Error("Snapshot name is required");
        const result = action === "save-snapshot" ? this.raceScene.saveAgentWorld(name) : this.raceScene.loadAgentWorld(name);
        this.finishAgentWorldAuthoring(result, result.ok ? `${action === "save-snapshot" ? "Saved" : "Loaded"} ${name}.` : undefined);
      }
    } catch (error) {
      this.agentWorldEditorHasError = true;
      this.agentWorldEditorMessage = error instanceof Error ? error.message : String(error);
      this.setState("world-api-lab");
    }
  }

  private finishAgentWorldAuthoring(result: { ok: boolean; error?: string }, success?: string): void {
    this.agentWorldEditorHasError = !result.ok;
    this.agentWorldEditorMessage = result.ok ? success ?? "World updated." : result.error ?? "World update failed.";
    this.setState("world-api-lab");
  }

  private importLegacyAgentWorldXml(xml: string, options: AgentWorldLegacyXmlOptions = {}) {
    this.ensureAgentWorldStudio();
    try {
      const conversion = convertLegacyGraphysXXml(xml, options);
      const result = this.raceScene.createAgentWorld(conversion.definition);
      if (!result.ok || !result.value) return { ok: false as const, revision: result.revision, error: result.error ?? "Legacy XML import failed" };
      return {
        ok: true as const,
        revision: result.revision,
        value: {
          state: result.value,
          sourceEntityCount: conversion.sourceEntityCount,
          convertedEntityCount: conversion.convertedEntityCount,
          warnings: conversion.warnings
        }
      };
    } catch (error) {
      return {
        ok: false as const,
        revision: this.raceScene.getAgentWorldState()?.revision ?? 0,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async importAgentWorldFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error("World files must be 5 MB or smaller");
      const source = await file.text();
      const isLegacyXml = file.name.toLowerCase().endsWith(".xml") || source.trimStart().startsWith("<");
      const legacyResult = isLegacyXml ? this.importLegacyAgentWorldXml(source, {
        id: file.name.replace(/\.[^.]+$/, ""),
        label: `${file.name.replace(/\.[^.]+$/, "")} (Legacy Import)`
      }) : null;
      const result = legacyResult ?? this.raceScene.createAgentWorld(JSON.parse(source) as AgentWorldDefinition);
      if (result.ok) {
        const importedState = this.raceScene.getAgentWorldState();
        const selectedId = importedState?.entities[0]?.id ?? null;
        this.agentWorldSelectedEntityId = selectedId;
        this.raceScene.selectAgentWorldEntities(selectedId ? [selectedId] : []);
      }
      const warningCount = legacyResult?.value?.warnings.length ?? 0;
      this.finishAgentWorldAuthoring(result, result.ok ? `Imported ${file.name}${isLegacyXml ? ` · ${legacyResult?.value?.convertedEntityCount ?? 0} legacy entities${warningCount ? ` · ${warningCount} proxy warning${warningCount === 1 ? "" : "s"}` : ""}` : ""}.` : undefined);
    } catch (error) {
      this.agentWorldEditorHasError = true;
      this.agentWorldEditorMessage = error instanceof Error ? error.message : String(error);
      this.setState("world-api-lab");
    }
  }

  private agentWorldWorkbench(state: AgentWorldState | null): string {
    const worldDefinition = this.raceScene.exportAgentWorld();
    const stateEntities = state?.entities ?? [];
    const runtimeSelectedId = state?.selectedIds.find((id) => stateEntities.some((entity) => entity.id === id)) ?? null;
    if (runtimeSelectedId) this.agentWorldSelectedEntityId = runtimeSelectedId;
    if (this.agentWorldSelectedEntityId && !stateEntities.some((entity) => entity.id === this.agentWorldSelectedEntityId)) {
      this.agentWorldSelectedEntityId = null;
    }
    this.agentWorldSelectedEntityId ??= stateEntities[0]?.id ?? null;
    const selectedState = stateEntities.find((entity) => entity.id === this.agentWorldSelectedEntityId) ?? null;
    const selectedDefinition = worldDefinition?.entities.find((entity) => entity.id === this.agentWorldSelectedEntityId) ?? null;
    const entities = stateEntities.map((entity) => `
      <button class="agent-entity-card${entity.id === this.agentWorldSelectedEntityId ? " is-selected" : ""}" data-agent-authoring-action="select" data-entity-id="${escapeHtml(entity.id)}">
        <span><b>${escapeHtml(entity.label)}</b><code>${escapeHtml(entity.id)}</code></span>
        <strong>${escapeHtml(entity.type)}</strong>
        <small>xyz ${entity.position.map((value) => value.toFixed(1)).join(" · ")} · ${(entity.physics?.mode ?? entity.behaviors.map((behavior) => behavior.type).join(" + ")) || "visual"}${entity.interactions.length ? " · interactive" : ""}</small>
      </button>`).join("");
    const events = (state?.recentEvents ?? []).slice(-6).reverse().map((event) => `
      <li><code>r${event.revision}</code><span>${escapeHtml(event.type)}</span><small>${event.actorId ? `<b>${escapeHtml(event.actorId)}</b> · ` : ""}${escapeHtml(event.message)}</small></li>`).join("");
    const prefabs = GRAPHYSX_AGENT_WORLD_PREFABS.map((prefab) => `
      <button class="agent-prefab-card" data-agent-world-prefab="${prefab.id}">
        <span>${escapeHtml(prefab.label)}</span><small>${prefab.entityCount} entities · ${escapeHtml(prefab.summary)}</small>
      </button>`).join("");
    const starters = GRAPHYSX_AGENT_WORLD_STARTERS.map((starter) => `
      <button class="agent-starter-card${state?.world.id === `graphysx-${starter.id}` ? " is-selected" : ""}${starter.id === "signal-trail" ? " is-experience" : ""}" data-agent-world-starter="${starter.id}">
        <span><b>${escapeHtml(starter.label)}</b><strong>${starter.entityCount} entities</strong></span>
        <small>${starter.prefabCount} prefabs · ${escapeHtml(starter.summary)}</small>
      </button>`).join("");
    const signalNodes = (state?.entities ?? []).filter((entity) => entity.tags.includes("signal-node"));
    const poweredSignalIds = signalNodes.filter((entity) => entity.interactions[0]?.targetIds.every((targetId) =>
      state?.entities.find((candidate) => candidate.id === targetId)?.visible
    )).map((entity) => entity.id);
    const signalChallenge = signalNodes.length > 0 ? `
      <section class="agent-signal-challenge${poweredSignalIds.length === signalNodes.length ? " is-complete" : ""}" data-agent-signal-progress="${poweredSignalIds.length}">
        <div><span><span class="stat-label">First Agent-Playable World</span><strong>Signal Trail</strong></span><b>${poweredSignalIds.length} / ${signalNodes.length}</b></div>
        <p>${poweredSignalIds.length === signalNodes.length ? "Portal stabilized — trail complete!" : "Awaken all three signal beacons to stabilize the destination portal."}</p>
        <div class="agent-signal-steps">${signalNodes.map((entity, index) => `<span class="${poweredSignalIds.includes(entity.id) ? "is-powered" : ""}">${index + 1}<small>${escapeHtml(entity.label)}</small></span>`).join("")}</div>
        <small>Human: click the glowing beacon lenses. Agent: <code>query({ tag: "signal-node" })</code>, then <code>interact(id)</code>.</small>
        <button class="math-preset" data-agent-world-starter="signal-trail"><span>Restart Signal Trail</span><small>restore all three dormant signals</small></button>
      </section>` : "";
    const interactions = (state?.entities ?? []).flatMap((entity) => entity.interactions.map((interaction) => {
      const visibleTargets = interaction.targetIds.filter((targetId) => state?.entities.find((candidate) => candidate.id === targetId)?.visible).length;
      return `<button class="agent-interaction-card" data-agent-world-interact="${entity.id}" data-agent-world-interaction="${interaction.id}">
        <span><b>${escapeHtml(interaction.label)}</b><code>${escapeHtml(entity.id)}</code></span>
        <small>${visibleTargets}/${interaction.targetIds.length} targets visible · click here or the 3D object</small>
      </button>`;
    })).join("");
    const commits = (state?.recentCommits ?? []).slice().reverse().map((commit) => `
      <article class="agent-commit-card">
        <span><code>${escapeHtml(commit.id)}</code><b>r${commit.revision}</b></span>
        <strong>${escapeHtml(commit.actor.label)}</strong>
        <small>${escapeHtml(commit.worldId)} · ${escapeHtml(commit.intent)} · ${commit.commandCount} command${commit.commandCount === 1 ? "" : "s"}</small>
      </article>`).join("");
    const capabilities = GRAPHYSX_AGENT_CAPABILITIES.map((capability) => `<span>${escapeHtml(capability)}</span>`).join("");
    const bridgeManifest = this.agentWorldBridge?.manifest();
    const codeSample = escapeHtml(`const gx = window.__GRAPHYSX__;
gx.loadStarter("signal-trail");
const signals = gx.query({ tag: "signal-node" });
gx.interact(signals[0].id);

const revision = gx.state().revision;
gx.commit({
  actor: { id: "garden-agent", label: "Garden Agent" },
  intent: "Add a luminous gathering place",
  expectedRevision: revision,
  commands: [
    { op: "spawn-prefab", prefabId: "luminous-tree",
      options: { position: [-4, 0, 2] } },
    { op: "spawn-prefab", prefabId: "portal-arch",
      options: { position: [4, 0, 2] } }
  ]
});
    gx.history(revision);`);
    const savedWorlds = state?.savedWorlds.length ? state.savedWorlds.map(escapeHtml).join(" · ") : "none yet";
    const entityTypes: AgentWorldEntityDefinition["type"][] = ["group", "agent", "box", "sphere", "icosahedron", "cylinder", "cone", "torus", "plane", "spline", "model", "ambient-light", "directional-light", "point-light"];
    const typeOptions = entityTypes.map((type) => `<option value="${type}"${type === "box" ? " selected" : ""}>${type}</option>`).join("");
    const assetOptions = GRAPHYSX_AGENT_WORLD_ASSETS.map((asset) => `<option value="${escapeHtml(asset.id)}">${escapeHtml(asset.label)}</option>`).join("");
    const physicsModes = (selectedDefinition?.physics?.mode ?? "none");
    const physicsMaterials = ["default", "wall", "finish", "ground", "ball", "human"] as const;
    const selectedMaterial = selectedDefinition?.physics?.material ?? "default";
    const selectedPosition = selectedState?.position ?? [0, 0, 0];
    const selectedRotation = selectedState?.rotationDegrees ?? [0, 0, 0];
    const selectedScale = selectedState?.scale ?? [1, 1, 1];
    const selectedVelocity = selectedState?.physics?.linearVelocity ?? [0, 0, 0];
    const transformTool = this.raceScene.getAgentWorldTransformToolState();
    const transformButtons = ([
      ["translate", "Move", "W"],
      ["rotate", "Rotate", "E"],
      ["scale", "Scale", "R"]
    ] as const).map(([mode, label, key]) => `<button class="${transformTool.mode === mode ? "is-selected" : ""}" data-agent-transform-mode="${mode}"><span>${label}</span><small>${key}</small></button>`).join("");
    const behaviorButtons = selectedState?.behaviors.map((behavior) => `<button data-agent-authoring-action="detach-behavior" data-entity-id="${escapeHtml(selectedState.id)}" data-behavior-id="${escapeHtml(behavior.id)}"><span>${escapeHtml(behavior.type)}</span><small>remove ${escapeHtml(behavior.id)}</small></button>`).join("") ?? "";
    const interactionRows = (selectedDefinition?.interactions ?? []).map((interaction) => `<span class="agent-friendly-interaction-row"><span><b>${escapeHtml(interaction.label ?? interaction.id ?? interaction.type)}</b><small>${escapeHtml(interaction.type)} · ${interaction.targetIds.map(escapeHtml).join(", ")}${interaction.type === "apply-impulse" ? ` · impulse ${interaction.impulse.join("/")}` : ""}</small></span><button data-agent-authoring-action="remove-interaction" data-entity-id="${escapeHtml(selectedState?.id ?? "")}" data-interaction-id="${escapeHtml(interaction.id ?? "")}">Remove</button></span>`).join("");
    const selectedAgentEditor = selectedState?.agent ? `<fieldset class="agent-identity-editor"><legend>Agent Identity <small>visible semantic participant</small></legend><label><span>Role</span><input data-agent-edit-field="agent-role" value="${escapeHtml(selectedState.agent.role)}"></label><label><span>Status</span><input data-agent-edit-field="agent-status" value="${escapeHtml(selectedState.agent.status)}"></label><label><span>Perception radius</span><input type="number" min="0" step="0.5" data-agent-edit-field="agent-perception" value="${selectedState.agent.perceptionRadius}"></label><label class="agent-wide-field"><span>Capabilities <small>comma separated</small></span><input data-agent-edit-field="agent-capabilities" value="${escapeHtml(selectedState.agent.capabilities.join(", "))}"></label></fieldset>` : "";
    const selectedEditor = selectedState && selectedDefinition ? `
      <div class="agent-entity-inspector" data-selected-entity="${escapeHtml(selectedState.id)}">
        <div class="agent-editor-title"><span><span class="stat-label">Selected Entity</span><strong>${escapeHtml(selectedState.label)}</strong><code>${escapeHtml(selectedState.id)} · ${escapeHtml(selectedState.type)}</code></span><button class="agent-danger-button" data-agent-authoring-action="remove" data-entity-id="${escapeHtml(selectedState.id)}">Remove</button></div>
        <div class="agent-transform-toolbar"><span><b>3D Transform</b><small>drag the colored viewport handles · snapped for clean edits</small></span><div>${transformButtons}<button data-agent-transform-space><span>${transformTool.space}</span><small>space</small></button></div></div>
        <div class="agent-form-grid">
          <label><span>Label</span><input data-agent-edit-field="label" value="${escapeHtml(selectedState.label)}"></label>
          <label><span>Parent ID</span><input data-agent-edit-field="parent" value="${escapeHtml(selectedState.parentId ?? "")}" placeholder="world root"></label>
          <label class="agent-wide-field"><span>Tags <small>comma separated</small></span><input data-agent-edit-field="tags" value="${escapeHtml(selectedState.tags.join(", "))}"></label>
          <label class="agent-check-field"><input type="checkbox" data-agent-edit-field="visible"${selectedState.visible ? " checked" : ""}><span>Visible</span></label>
        </div>
        <div class="agent-transform-grid">
          ${agentVectorEditor("edit", "position", selectedPosition, "Position")}
          ${agentVectorEditor("edit", "rotation", selectedRotation, "Rotation °")}
          ${agentVectorEditor("edit", "scale", selectedScale, "Scale")}
        </div>
        ${agentTexturePicker("edit", selectedDefinition.material)}
        ${selectedAgentEditor}
        <div class="agent-form-grid">
          <label><span>Light intensity</span><input type="number" step="0.1" data-agent-edit-field="intensity" value="${selectedDefinition.intensity ?? 1}"></label>
          <label><span>Light distance</span><input type="number" step="0.5" data-agent-edit-field="distance" value="${selectedDefinition.distance ?? 0}"></label>
        </div>
        <fieldset class="agent-physics-editor">
          <legend>Physics <small>optional rigid body</small></legend>
          <label><span>Mode</span><select data-agent-edit-field="physics-mode">${agentOption("none", physicsModes)}${agentOption("static", physicsModes)}${agentOption("dynamic", physicsModes)}${agentOption("kinematic", physicsModes)}</select></label>
          <label><span>Mass</span><input type="number" min="0" step="0.1" data-agent-edit-field="mass" value="${selectedDefinition.physics?.mass ?? 1}"></label>
          <label><span>Material</span><select data-agent-edit-field="physics-material">${physicsMaterials.map((material) => agentOption(material, selectedMaterial)).join("")}</select></label>
          ${agentVectorEditor("edit", "velocity", selectedVelocity, "Velocity")}
        </fieldset>
        <div class="agent-friendly-interaction-editor">
          <span><b>Interactions</b><small>the same clickable actions humans and agents invoke</small></span>
          <div class="agent-friendly-interaction-list">${interactionRows || "<small>No interactions yet.</small>"}</div>
          <div class="agent-form-grid">
            <label><span>Action</span><select data-agent-edit-field="interaction-type"><option value="toggle-visibility">Toggle visibility</option><option value="apply-impulse">Apply physics impulse</option></select></label>
            <label><span>Label</span><input data-agent-edit-field="interaction-label" placeholder="Launch the ball"></label>
            <label><span>Target IDs <small>comma separated</small></span><input data-agent-edit-field="interaction-targets" placeholder="ball-1, marker-2"></label>
          </div>
          ${agentVectorEditor("edit", "interaction-impulse", [0, 5, 0], "Impulse vector")}
          <button data-agent-authoring-action="add-interaction" data-entity-id="${escapeHtml(selectedState.id)}">Add Interaction</button>
          <details><summary>Advanced interaction JSON</summary><label class="agent-json-field"><textarea data-agent-edit-field="interactions" spellcheck="false">${escapeHtml(JSON.stringify(selectedDefinition.interactions ?? [], null, 2))}</textarea></label></details>
        </div>
        <div class="agent-editor-buttons"><button class="agent-primary-button" data-agent-authoring-action="update" data-entity-id="${escapeHtml(selectedState.id)}">Apply Entity Changes</button></div>
        <div class="agent-behavior-editor">
          <span><b>Behaviors</b><small>Attach any documented behavior as JSON. Transform behaviors use visual-only or kinematic entities.</small></span>
          <div class="agent-behavior-list">${behaviorButtons || "<small>No behaviors attached.</small>"}</div>
          <textarea data-agent-edit-field="behavior" spellcheck="false">${escapeHtml(JSON.stringify({ type: "spin", axis: "y", speedDegrees: 30 }, null, 2))}</textarea>
          <button data-agent-authoring-action="attach-behavior" data-entity-id="${escapeHtml(selectedState.id)}">Attach Behavior</button>
        </div>
      </div>` : `<div class="agent-empty-inspector"><strong>No entity selected</strong><small>Create one or choose it from the outliner.</small></div>`;
    const transactionExample = JSON.stringify([{ op: "spawn", entity: { id: "ui-orb", type: "sphere", geometry: { radius: 0.55 }, transform: { position: [0, 4, 0] }, physics: { mode: "dynamic", mass: 1, material: "ball" } } }], null, 2);
    const commitExample = JSON.stringify({ actor: { id: "studio-user", label: "Studio User", kind: "human" }, intent: "Apply a reviewed Studio change", expectedRevision: state?.revision ?? 0, commands: [{ op: "select", ids: selectedState ? [selectedState.id] : [] }] }, null, 2);
    const authoringStudio = `<section class="agent-authoring-studio" data-agent-authoring-studio>
      <div class="agent-authoring-heading"><span><span class="stat-label">Human + Agent Parity</span><strong>World Editor</strong><small>Every control below calls the same validated runtime used by <code>window.__GRAPHYSX__</code>.</small></span><b class="${this.agentWorldEditorHasError ? "is-error" : ""}" data-agent-editor-message>${escapeHtml(this.agentWorldEditorMessage)}</b></div>
      <div class="agent-world-filebar"><span><b>Portable World File</b><small>validated v2 JSON · archived GraphysX XML migration</small></span><div><button data-agent-authoring-action="download-world">Download JSON</button><button data-agent-authoring-action="import-file">Import JSON / XML</button><input type="file" accept="application/json,text/xml,application/xml,.json,.xml" data-agent-world-file-input hidden></div></div>
      <div class="agent-authoring-layout">
        <aside class="agent-outliner"><span><b>Entity Outliner</b><small>${stateEntities.length} in this world</small></span><div class="agent-outliner-list">${entities || "<small>The world is empty.</small>"}</div></aside>
        ${selectedEditor}
      </div>
      <details class="agent-create-entity" open>
        <summary><span>Add Entity</span><small>primitive · light · model · spline · optional physics</small></summary>
        <div class="agent-form-grid">
          <label><span>Type</span><select data-agent-create-field="type">${typeOptions}</select></label>
          <label><span>ID</span><input data-agent-create-field="id" placeholder="auto-generated"></label>
          <label><span>Label</span><input data-agent-create-field="label" placeholder="optional friendly name"></label>
          <label><span>Parent ID</span><input data-agent-create-field="parent" placeholder="world root"></label>
          <label class="agent-wide-field"><span>Tags</span><input data-agent-create-field="tags" placeholder="prop, gameplay, authored-by-user"></label>
        </div>
        ${agentTexturePicker("create", { color: "#7de6c3" })}
        <div class="agent-transform-grid">
          ${agentVectorEditor("create", "position", [0, 1, 0], "Position")}
          ${agentVectorEditor("create", "rotation", [0, 0, 0], "Rotation °")}
          ${agentVectorEditor("create", "scale", [1, 1, 1], "Scale")}
        </div>
        <fieldset><legend>Shape / light</legend><label><span>Width</span><input type="number" min="0.01" step="0.1" data-agent-create-field="width" value="1"></label><label><span>Height</span><input type="number" min="0.01" step="0.1" data-agent-create-field="height" value="1"></label><label><span>Depth</span><input type="number" min="0.01" step="0.1" data-agent-create-field="depth" value="1"></label><label><span>Radius</span><input type="number" min="0.01" step="0.1" data-agent-create-field="radius" value="0.5"></label><label><span>Tube</span><input type="number" min="0.01" step="0.01" data-agent-create-field="tube" value="0.12"></label><label><span>Segments</span><input type="number" min="6" step="1" data-agent-create-field="segments" value="24"></label><label><span>Intensity</span><input type="number" min="0" step="0.1" data-agent-create-field="intensity" value="1"></label><label><span>Distance</span><input type="number" min="0" step="1" data-agent-create-field="distance" value="0"></label></fieldset>
        <fieldset><legend>Complex model / spline</legend><label><span>Recovered asset</span><select data-agent-create-field="asset">${assetOptions}</select></label><label><span>Fit size</span><input type="number" min="0.1" step="0.1" data-agent-create-field="fit-size" value="4"></label><label class="agent-json-field"><span>Spline points JSON</span><textarea data-agent-create-field="path" spellcheck="false">${escapeHtml(JSON.stringify([[-4, 1, 3], [0, 3, -4], [4, 1, 3]], null, 2))}</textarea></label><label class="agent-check-field"><input type="checkbox" data-agent-create-field="closed" checked><span>Closed spline</span></label></fieldset>
        <fieldset class="agent-identity-editor"><legend>Agent Identity <small>used by the agent entity type</small></legend><label><span>Role</span><input data-agent-create-field="agent-role" value="world participant"></label><label><span>Status</span><input data-agent-create-field="agent-status" value="ready"></label><label><span>Perception radius</span><input type="number" min="0" step="0.5" data-agent-create-field="agent-perception" value="6"></label><label class="agent-wide-field"><span>Capabilities</span><input data-agent-create-field="agent-capabilities" placeholder="observe, explain, interact"></label></fieldset>
        <fieldset class="agent-physics-editor"><legend>Physics <small>choose none for visual-only</small></legend><label><span>Mode</span><select data-agent-create-field="physics-mode">${agentOption("none", "none")}${agentOption("static", "none")}${agentOption("dynamic", "none")}${agentOption("kinematic", "none")}</select></label><label><span>Mass</span><input type="number" min="0" step="0.1" data-agent-create-field="mass" value="1"></label><label><span>Material</span><select data-agent-create-field="physics-material">${physicsMaterials.map((material) => agentOption(material, "default")).join("")}</select></label>${agentVectorEditor("create", "velocity", [0, 0, 0], "Velocity")}</fieldset>
        <div class="agent-editor-buttons"><button class="agent-primary-button" data-agent-authoring-action="create">Create Entity</button><small>Only fields relevant to the selected type are used. Validation errors are shown above.</small></div>
      </details>
      <details class="agent-json-workbench">
        <summary><span>Advanced JSON Workbench</span><small>complete world · atomic transaction · actor commit · snapshots</small></summary>
        <p>Friendly controls cover everyday editing. These panels expose the complete serializable contract without bypassing validation.</p>
        <label class="agent-json-field"><span>Complete world JSON</span><textarea data-agent-json-field="world" spellcheck="false">${escapeHtml(JSON.stringify(worldDefinition, null, 2))}</textarea></label>
        <div class="agent-editor-buttons"><button data-agent-authoring-action="apply-world">Apply Complete World</button></div>
        <div class="agent-json-columns"><label class="agent-json-field"><span>Atomic transaction</span><textarea data-agent-json-field="transaction" spellcheck="false">${escapeHtml(transactionExample)}</textarea><button data-agent-authoring-action="run-transaction">Run Transaction</button></label><label class="agent-json-field"><span>Revision-guarded human commit</span><textarea data-agent-json-field="commit" spellcheck="false">${escapeHtml(commitExample)}</textarea><button data-agent-authoring-action="run-commit">Run Commit</button></label></div>
        <div class="agent-snapshot-editor"><label><span>Snapshot name</span><input data-agent-json-field="snapshot" value="studio-snapshot"></label><button data-agent-authoring-action="save-snapshot">Save</button><button data-agent-authoring-action="load-snapshot">Load</button><small>Available: ${savedWorlds}</small></div>
      </details>
    </section>`;

    return `<section class="wide-card agent-world-workbench" data-agent-world-schema="${GRAPHYSX_AGENT_WORLD_SCHEMA}">
      <div class="agent-world-heading">
        <span><span class="stat-label">GraphysX World API v2</span><strong>${escapeHtml(state?.world.label ?? "World unavailable")}</strong><small>${GRAPHYSX_AGENT_WORLD_SCHEMA} · revision ${state?.revision ?? 0}</small></span>
        <span class="agent-world-live" data-agent-world-live>${state?.paused ? "paused" : "running"} · ${state?.entityCount ?? 0} entities · ${(state?.elapsedSeconds ?? 0).toFixed(1)} s</span>
      </div>
      <div class="agent-world-actions">
        <button class="math-preset agent-plaza-action" data-agent-world-action="prefab-plaza"><span>Compose Prefab Plaza</span><small>five prefabs · one actor-aware commit</small></button>
        <button class="math-preset" data-agent-world-action="demo"><span>Build API Demo</span><small>load the agent constellation recipe</small></button>
        <button class="math-preset${state?.paused ? " is-selected" : ""}" data-agent-world-action="pause"><span>${state?.paused ? "Resume" : "Pause"}</span><small>deterministic simulation clock</small></button>
        <button class="math-preset" data-agent-world-action="step"><span>Step 0.5 Seconds</span><small>advance behaviors exactly</small></button>
        <button class="math-preset" data-agent-world-action="undo"><span>Undo</span><small>restore the previous definition</small></button>
        <button class="math-preset" data-agent-world-action="save"><span>Save Snapshot</span><small>studio-snapshot · saved: ${savedWorlds}</small></button>
        <button class="math-preset" data-agent-world-action="clear"><span>Clear World</span><small>keep environment, remove entities</small></button>
      </div>
      ${authoringStudio}
      <div class="agent-world-section agent-starter-section">
        <span class="stat-label">Start With A Complete World</span>
        <div class="agent-starter-list">${starters}</div>
        <small>One click—or <code>loadStarter(id)</code>—creates a lit, composed world. Every part remains editable through the regular v2 API.</small>
      </div>
      ${signalChallenge}
      <div class="agent-world-section">
        <span class="stat-label">Live World Interactions</span>
        <div class="agent-interaction-list">${interactions || "<small>This world has no interactions yet.</small>"}</div>
        <small>Click the interactive 3D object, this accessible control, or call <code>interact(id)</code>. All three use the same atomic action.</small>
      </div>
      <div class="agent-world-section">
        <span class="stat-label">Reusable 3D Prefab Library</span>
        <div class="agent-prefab-list">${prefabs}</div>
        <small>Click to place a prefab around the active world, or use <code>spawnPrefab</code> / <code>spawn-prefab</code> from an agent.</small>
      </div>
      <div class="agent-world-section">
        <span class="stat-label">Agent Capabilities</span>
        <div class="agent-capabilities">${capabilities}</div>
      </div>
      <div class="agent-world-section agent-bridge-status">
        <span><span class="stat-label">External Agent Bridge</span><strong>${escapeHtml(bridgeManifest?.schema ?? "starting")}</strong><small>${bridgeManifest?.tools.length ?? 0} discoverable tools · direct calls + same-origin <code>window.postMessage</code> · state-change events</small></span>
        <code>window.__GRAPHYSX_AGENT_BRIDGE__.manifest()</code>
      </div>
      <div class="agent-world-columns">
        <div><span class="stat-label">Live Entity Graph</span><div class="agent-entity-list">${entities || "<small>No entities. Add one in the World Editor.</small>"}</div></div>
        <div><span class="stat-label">Recent API Events</span><ul class="agent-event-list">${events || "<li><small>No events yet.</small></li>"}</ul></div>
      </div>
      <div class="agent-world-section">
        <span class="stat-label">Collaboration History</span>
        <div class="agent-commit-list">${commits || "<small>No actor-aware commits yet. Compose the Prefab Plaza or call gx.commit(…).</small>"}</div>
      </div>
      <div class="agent-code-panel">
        <span><b>Shared human + agent collaboration surface</b><small>Revision guards reject stale edits. Every accepted change records actor, intent, revision, and command count.</small></span>
        <pre><code>${codeSample}</code></pre>
      </div>
    </section>`;
  }

  private natureWorkbench(state: NatureLabState | null): string {
    const activeStudy = NATURE_LAB_STUDIES.find((study) => study.id === state?.study) ?? NATURE_LAB_STUDIES[0];
    const studyButtons = NATURE_LAB_STUDIES.map(
      (study) => `<button class="nature-study${study.id === activeStudy.id ? " is-selected" : ""}" data-nature-study="${study.id}">
        <span class="race-step">${study.lessons.length} ${study.lessons.length === 1 ? "demonstration" : "demonstrations"}</span>
        <span class="race-name">${escapeHtml(study.label)}</span>
        <small>${escapeHtml(study.short)}</small>
      </button>`
    ).join("");
    const activeLesson = activeStudy.lessons.find((lesson) => lesson.id === state?.lesson.id) ?? activeStudy.lessons[0];
    const lessonButtons = activeStudy.lessons.map(
      (lesson, index) => `<button class="nature-lesson${lesson.id === activeLesson.id ? " is-selected" : ""}" data-nature-lesson="${lesson.id}">
        <span>${index + 1}</span><strong>${escapeHtml(lesson.label)}</strong><small>${escapeHtml(lesson.session)}</small>
      </button>`
    ).join("");
    const lessonParameters: Partial<Record<NatureLabLessonId, NatureLabParameter[]>> = {
      "flock-separation": ["separation", "speed"],
      "flock-alignment": ["alignment", "speed"],
      "flock-cohesion": ["cohesion", "speed"],
      "forces-random-walk": ["speed"],
      "forces-attraction": ["attraction", "speed"],
      "forces-flow-field": ["flowStrength", "speed"],
      "forest-branching": ["cycleSeconds"],
      "forest-leaf-fall": ["cycleSeconds"],
      "forest-evolution": ["mutationRate"]
    };
    const visibleParameterKeys = lessonParameters[activeLesson.id];
    const parameterControls = activeStudy.parameters.filter((parameter) => !visibleParameterKeys || visibleParameterKeys.includes(parameter.key)).map((parameter) => {
      const value = state?.settings[parameter.key] ?? parameter.min;
      const precision = parameter.key === "mutationRate" ? 2 : 1;
      return `<label class="nature-control">
        <span><b>${escapeHtml(parameter.label)}</b><strong data-nature-value="${parameter.key}">${value.toFixed(precision)}</strong></span>
        <input type="range" min="${parameter.min}" max="${parameter.max}" step="${parameter.step}" value="${value}" data-nature-param="${parameter.key}">
      </label>`;
    }).join("");
    const systems = (state?.visibleSystems ?? []).map((system) => `<span>${escapeHtml(system)}</span>`).join("");
    const effectiveRules = (state?.demonstration.effectiveRules ?? []).map((rule) => `<span>${escapeHtml(rule)}</span>`).join("");
    const trailAction = activeStudy.id === "flock-planet"
      ? `<button class="math-preset${state?.trails ? " is-selected" : ""}" data-nature-action="trails"><span>${state?.trails ? "Hide" : "Show"} Trails</span><small>Flock Planet path memory</small></button>`
      : "";
    const canonicalRecipe = GRAPHYSX_WORLD_RECIPES.find((recipe) => recipe.study === activeStudy.id);
    const layerActions = activeStudy.id === "orbital-observatory" && state
      ? (["clouds", "trajectory", "quakes", "observer"] as const)
          .map((layer) => `<button class="math-preset${state.layers[layer] ? " is-selected" : ""}" data-nature-layer="${layer}">
            <span>${state.layers[layer] ? "Hide" : "Show"} ${layer === "observer" ? "Pass Radius" : `${layer[0].toUpperCase()}${layer.slice(1)}`}</span><small>recipe layer · ${state.layers[layer] ? "visible" : "hidden"}</small>
          </button>`)
          .join("")
      : "";
    const observatory = state?.observatory;
    const observatoryTelemetry = observatory
      ? `<div class="observatory-telemetry">
          <span><b>ISS</b><strong>${observatory.satellite.latitude.toFixed(2)}°, ${observatory.satellite.longitude.toFixed(2)}°</strong><small>${observatory.satellite.altitudeKm} km · ${observatory.satellite.simulatedPeriodSeconds.toFixed(1)} s simulated orbit</small></span>
          <span><b>${escapeHtml(observatory.observer.label)}</b><strong>${Math.round(observatory.observer.distanceToSatelliteKm).toLocaleString()} km</strong><small>${observatory.pass.insideDetectionRadius ? "inside" : "outside"} ${Math.round(observatory.observer.detectionRadiusKm).toLocaleString()} km pass radius</small></span>
          <span><b>Pass Window</b><strong>${observatory.pass.entryInSeconds === null ? "No pass" : observatory.pass.insideDetectionRadius ? "Overhead now" : `T−${Math.round(observatory.pass.entryInSeconds)} s`}</strong><small>${observatory.pass.exitInSeconds === null ? "exit beyond prediction window" : `exit T−${Math.round(observatory.pass.exitInSeconds)} s`}</small></span>
          <span><b>Quake Field</b><strong>${observatory.earthquakes.count} events</strong><small>up to M${observatory.earthquakes.maximumMagnitude.toFixed(1)} · source telemetry subset</small></span>
        </div>`
      : "";

    return `<section class="wide-card nature-workbench" data-nature-study-active="${activeStudy.id}">
      <div class="nature-heading">
        <span><span class="stat-label">Nature of Code Gallery · 13 focused demonstrations</span><strong>${escapeHtml(activeStudy.label)}</strong><small>${escapeHtml(activeStudy.summary)}</small></span>
        <span class="nature-seed" data-nature-live-summary>${state?.paused ? "paused" : "running"} · ${state?.population ?? 0} visible · ${(state?.elapsedSeconds ?? 0).toFixed(1)} s</span>
      </div>
      <div class="nature-study-list">${studyButtons}</div>
      <div class="nature-section-label"><span>Choose one mechanism</span><small>The original HTML sessions are no longer folded into one scene.</small></div>
      <div class="nature-lesson-list">${lessonButtons}</div>
      <article class="nature-demonstration">
        <span class="nature-demo-number">${escapeHtml(activeLesson.session)}</span>
        <div><strong>${escapeHtml(activeLesson.label)}</strong><p>${escapeHtml(activeLesson.concept)}</p></div>
        <div class="nature-observe"><b>Observe</b><p>${escapeHtml(activeLesson.observe)}</p></div>
        <div class="nature-rule-list">${effectiveRules}</div>
        <small data-nature-live-phase>${escapeHtml(state?.demonstration.phase ?? "starting demonstration")}</small>
      </article>
      <div class="nature-controls">${parameterControls}</div>
      <div class="nature-actions nature-experiment-actions">
        <button class="math-preset nature-experiment" data-nature-action="experiment"><span>${escapeHtml(activeLesson.action)}</span><small>same action as clicking the 3D view</small></button>
        <button class="math-preset${state?.paused ? " is-selected" : ""}" data-nature-action="pause"><span>${state?.paused ? "Resume" : "Pause"}</span><small>freeze this mechanism</small></button>
        <button class="math-preset" data-nature-action="step"><span>Step 0.5 Seconds</span><small>inspect cause → motion → result</small></button>
        <button class="math-preset" data-nature-action="reset"><span>Reset Demonstration</span><small>replay the same seed and lesson</small></button>
        ${trailAction}
        ${layerActions}
      </div>
      ${observatoryTelemetry}
      <div class="nature-systems">${systems}</div>
      ${canonicalRecipe ? `<div class="nature-recipe"><span><b>World Recipe API</b><code>${escapeHtml(canonicalRecipe.schema)} · ${escapeHtml(canonicalRecipe.id)}</code></span><button class="math-preset" data-world-recipe="${escapeHtml(canonicalRecipe.id)}"><span>Load Canonical Recipe</span><small>seed, settings, layers, observer</small></button></div>` : ""}
      <p class="nature-source"><b>Focused source:</b> ${escapeHtml(activeLesson.source)}<br><span>World family: ${escapeHtml(activeStudy.source)}</span></p>
    </section>`;
  }

  private updateNatureFromAgent(action: () => boolean): boolean {
    const updated = action();
    if (updated && this.state === "nature-lab") {
      this.setState("nature-lab");
    }
    return updated;
  }

  private ensureAgentWorldStudio(): void {
    if (this.state !== "world-api-lab") {
      this.openArchiveMode("world-api-lab");
    }
  }

  private buildAgentPrefabPlaza(): void {
    const created = this.raceScene.createAgentWorld({
      schema: GRAPHYSX_AGENT_WORLD_SCHEMA,
      id: "graphysx-prefab-plaza",
      label: "Collaborative Prefab Plaza",
      environment: {
        background: "#050e1b",
        ground: { visible: true, size: 46, color: "#10282f", grid: true, gridColor: "#3ac4c2" }
      },
      entities: [
        { id: "plaza-ambient", type: "ambient-light", intensity: 0.8, material: { color: "#92cde2" }, tags: ["lighting"] },
        { id: "plaza-sun", type: "directional-light", intensity: 3.2, transform: { position: [-12, 17, 9] }, material: { color: "#fff0c9" }, tags: ["lighting"] }
      ]
    });
    if (!created.ok) return;
    this.raceScene.commitAgentWorld({
      actor: { id: "studio-composer", label: "Studio Composer", kind: "agent" },
      intent: "Compose a readable plaza from reusable GraphysX prefabs",
      expectedRevision: created.revision,
      commands: [
        { op: "spawn-prefab", prefabId: "luminous-tree", options: { idPrefix: "plaza-tree", position: [-8.5, 0, -4.5], scale: [1.1, 1.1, 1.1] } },
        { op: "spawn-prefab", prefabId: "signal-beacon", options: { idPrefix: "plaza-beacon", position: [-8.2, 0, 6] } },
        { op: "spawn-prefab", prefabId: "portal-arch", options: { idPrefix: "plaza-portal", position: [0, 0, -7], rotationDegrees: [0, 0, 0] } },
        { op: "spawn-prefab", prefabId: "orbital-sculpture", options: { idPrefix: "plaza-orbital", position: [0, 0, 3.2] } },
        { op: "spawn-prefab", prefabId: "habitat-pod", options: { idPrefix: "plaza-habitat", position: [8.2, 0, 1.5], rotationDegrees: [0, -28, 0] } }
      ]
    });
  }

  private mathWorkbench(): string {
    const controls = MATH_CONTROLS.map((control) => {
      const key = control.key;
      const value = this.mathParams[key];
      const inactive =
        (this.mathParams.formula === "slope" && (key === "a" || key === "c")) ||
        (this.mathParams.formula === "parabola" && key === "m");
      return `<label class="math-control${inactive ? " is-inactive" : ""}">
        <span><b>${escapeHtml(control.label)}</b> <strong data-math-value="${escapeHtml(key)}">${value.toFixed(2)}</strong></span>
        <input type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${value}" data-math-param="${escapeHtml(key)}">
      </label>`;
    }).join("");

    const formulaToggle = (["parabola", "slope"] as const)
      .map(
        (formula) =>
          `<button class="math-mode-button${this.mathParams.formula === formula ? " is-selected" : ""}" data-math-formula="${formula}">
            <span>${formula === "parabola" ? "Parabola" : "Slope"}</span>
            <small>${formula === "parabola" ? "y = ax² + bx + c" : "y = mx + b"}</small>
          </button>`
      )
      .join("");

    const presets = Object.entries({
      "ballz18-unity": "BallZ18 Unity",
      "classic-bowl": "Classic Bowl",
      "wide-arch": "Wide Arch",
      "offset-curve": "Offset Curve",
      "rising-ramp": "Rising Ramp",
      "falling-ramp": "Falling Ramp"
    })
      .map(
        ([id, label]) =>
          `<button class="math-preset" data-math-preset="${id}"><span>${label}</span><small>${id === "ballz18-unity" ? "archived a=.01 · b=0 · c=100 · m=5" : "modern inspection preset"}</small></button>`
      )
      .join("");

    return `<section class="wide-card math-workbench">
      <div class="math-workbench-heading">
        <span><span class="stat-label">Live Formula</span><strong class="math-equation" data-math-equation>${this.formatFormula()}</strong></span>
        <span class="math-heading-actions"><span class="math-live-chip">10,000 molecules · live</span><button class="math-view-reset" data-math-action="reset-camera"><b>Reset 3D View</b><small>drag orbit · wheel zoom</small></button></span>
      </div>
      <div class="math-mode-list">${formulaToggle}</div>
      <div class="math-preset-list">${presets}</div>
      <div class="math-parameter-note">
        <span><b>A</b> curve</span><span><b>B</b> tilt/intercept</span><span><b>C</b> height</span><span><b>M</b> slope</span><span><b>X</b> horizontal offset</span>
      </div>
      <div class="math-controls">${controls}</div>
    </section>`;
  }

  private formatFormula(): string {
    // legacy Formulas::moleculesUpdate stringFormule, with live values
    const { a, b, c, m, xOffset, formula } = this.mathParams;
    const xTerm = xOffset === 0 ? "x" : `(x + ${xOffset.toFixed(2)})`;
    if (formula === "slope") {
      return `y = ${m.toFixed(2)}${xTerm} + ${b.toFixed(2)}<small>y = mx + b</small>`;
    }
    return `y = ${a.toFixed(2)}${xTerm}² + ${b.toFixed(2)}${xTerm} + ${c.toFixed(2)}<small>y = ax² + bx + c — set A to 0 and the parabola becomes a slope :)</small>`;
  }

  private statCard(label: string, value: string): string {
    return `<article class="stat-card"><span class="stat-label">${escapeHtml(label)}</span><strong class="stat-value">${value}</strong></article>`;
  }
}

const EDITOR_TILES_STORAGE_KEY = "graphysx-editor-draft-v1";

function loadSavedEditorTiles(): MapEditorTile[] | null {
  try {
    const raw = window.localStorage.getItem(EDITOR_TILES_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const tiles = JSON.parse(raw) as MapEditorTile[];
    return Array.isArray(tiles) && tiles.length === 121 ? tiles : null;
  } catch {
    return null;
  }
}

function createEditorLevelDefinition(id: string, label: string, tiles: MapEditorTile[]): AgentLevelDefinition {
  return {
    schema: GRAPHYSX_AGENT_LEVEL_SCHEMA,
    id,
    label,
    width: 11,
    height: 11,
    cellSize: 2.6,
    tiles: [...tiles]
  };
}

/** Compile any canonical level draft into the existing playable BallZ race path. */
function draftToRaceDefinition(draft: MapEditorDraft, label = "Editor Draft", id = "editor-custom"): RaceDefinition {
  const { width, height, cellSize: TILE, tiles } = draft;
  const toWorldX = (column: number): number => (column - (width - 1) / 2) * TILE;
  const toWorldZ = (row: number): number => (row - (height - 1) / 2) * TILE;

  const walls: RaceDefinition["walls"] = [];
  const scenery: RaceDefinition["scenery"] = [];
  const rings: RaceDefinition["rings"] = [];
  const forceZones: NonNullable<RaceDefinition["forceZones"]> = [];
  let start: [number, number, number] = [0, 1.25, toWorldZ(height - 2)];
  let halfwayZ = toWorldZ(1);
  let finishZ = toWorldZ(height - 1);

  tiles.forEach((tile, index) => {
    const column = index % width;
    const row = Math.floor(index / width);
    const x = toWorldX(column);
    const z = toWorldZ(row);

    if (tile === "wall") {
      walls.push({ name: `editor-wall-${index}`, position: [x, 1.0, z], size: [TILE, 2.0, TILE], material: "dark-wall", physics: true });
    } else if (tile === "hazard") {
      scenery.push({ name: `editor-hazard-${index}`, position: [x, 0.3, z], size: [TILE * 0.9, 0.6, TILE * 0.9], material: "danger", physics: true });
    } else if (tile === "fire" || tile === "ice") {
      scenery.push({
        name: `editor-${tile}-pad-${index}`,
        position: [x, 0.21, z],
        size: [TILE * 0.88, 0.1, TILE * 0.88],
        material: tile,
        physics: false
      });
      forceZones.push({
        name: `${tile}-${column}-${row}`,
        kind: tile,
        position: [x, 0.2, z],
        size: [TILE * 0.96, 0.12, TILE * 0.96]
      });
    } else if (tile === "ring") {
      rings.push({ position: [x, 1.5, z] });
    } else if (tile === "start") {
      start = [x, 1.25, z];
    } else if (tile === "half") {
      halfwayZ = z;
    } else if (tile === "finish") {
      finishZ = z;
    }
  });

  const halfX = (width * TILE) / 2 + 0.4;
  const halfZ = (height * TILE) / 2 + 0.4;
  return {
    id: `editor-${id}`,
    name: label,
    subtitle: forceZones.length > 0
      ? "An agent-editable BallZ world where semantic fire and ice tiles become live forces."
      : "Your own BallZ map, built with the recovered editor.",
    archiveInspiration: ["Scene3D/EditorScreen.cpp", "BallZ Map Editor draft"],
    skybox: "clearblue",
    champion: { name: "Unclaimed", timeMs: 599000, note: "First finisher owns this draft" },
    targetMs: 90000,
    start,
    halfwayZ,
    finishZ,
    bounds: { minX: -halfX, maxX: halfX, minZ: -halfZ, maxZ: halfZ },
    palette: {
      skyTop: "#3f6f9f",
      skyBottom: "#101a26",
      fog: "#20303f",
      floor: "#31414f",
      accent: "#78f0d0",
      danger: "#ff3b23"
    },
    track: [
      { name: "editor-floor", position: [0, 0.05, 0], size: [width * TILE, 0.22, height * TILE], material: "damier", physics: true }
    ],
    walls,
    scenery,
    movingParts: [],
    rings,
    forceZones
  };
}

function isArchiveState(state: AppState): state is ArchiveAppState {
  return ARCHIVE_STATE_FLOW.includes(state as ArchiveAppState);
}

function challengeFor(race: RaceDefinition): ChallengeMeta {
  return CHALLENGE_META[race.id] ?? {
    chapter: "Custom Challenge",
    difficulty: "Medium",
    objective: race.subtitle,
    focus: "Explore the route and complete its objective."
  };
}

function worldPrimaryAction(race: RaceDefinition): string {
  if (race.id === "flightx-pipe") {
    return `Fly ${race.name}`;
  }
  if (race.vehicle) {
    return `Drive ${race.name}`;
  }
  if (race.id === "slide-2008") {
    return `Ride ${race.name}`;
  }
  if (race.id === "world1-recovered" || race.id === "map1-2011") {
    return `Roll ${race.name}`;
  }
  return `Explore ${race.name}`;
}

function worldCategoryLabel(race: RaceDefinition): string {
  if (race.id === "dominus-port") {
    return "Modern curated visit";
  }
  if (race.id === "flightx-pipe") {
    return "Atmel/CubX flight mode";
  }
  if (race.vehicle) {
    return "Vehicle experiment";
  }
  if (race.id === "world1-recovered" || race.id === "map1-2011" || race.id === "slide-2008") {
    return "BallZ concept recovery";
  }
  return "Standalone 3D environment";
}

function worldFamilyForRace(race: RaceDefinition): WorldFamilyId {
  if (race.id === "dominus-port") {
    return "dominus";
  }
  if (race.id === "flightx-pipe") {
    return "flightx";
  }
  if (race.vehicle) {
    return "vehicles";
  }
  return "ballz-concepts";
}

function worldFamilyTitle(family: WorldFamilyId): string {
  if (family === "dominus") {
    return "Dominus Curated Visit Progress";
  }
  if (family === "flightx") {
    return "FlightX Progress";
  }
  if (family === "vehicles") {
    return "Vehicle Progress";
  }
  return "BallZ Concept Progress";
}

function worldProjectFamily(race: RaceDefinition): string {
  if (race.id === "dominus-port") {
    return "modern-curated-dominus";
  }
  if (race.id === "flightx-pipe") {
    return "flightx";
  }
  if (race.vehicle) {
    return "vehicle-experiments";
  }
  if (race.id === "world1-recovered" || race.id === "map1-2011" || race.id === "slide-2008") {
    return "ballz-concepts";
  }
  return "standalone-3d-environments";
}

function formatObjectiveHint(label: string, distance: number | null): string {
  return distance === null ? escapeHtml(label) : `${escapeHtml(label)} · ${Math.max(0, Math.round(distance))}m`;
}

function statusLabel(status: ArchiveRecoveryItem["status"]): string {
  if (status === "ported") {
    return "Ported";
  }
  if (status === "preview") {
    return "Preview";
  }
  return "Pipeline";
}

function tileSymbol(tile: MapEditorTile): string {
  const symbols: Record<MapEditorTile, string> = {
    floor: ".",
    wall: "#",
    start: "S",
    ring: "o",
    half: "H",
    finish: "F",
    hazard: "!",
    fire: "^",
    ice: "~"
  };
  return symbols[tile];
}

function createInitialEditorTiles(): MapEditorTile[] {
  const width = 11;
  const height = 11;
  const tiles = Array.from<MapEditorTile>({ length: width * height }).fill("floor");
  for (let x = 0; x < width; x += 1) {
    tiles[x] = "wall";
    tiles[(height - 1) * width + x] = "wall";
  }
  for (let y = 0; y < height; y += 1) {
    tiles[y * width] = "wall";
    tiles[y * width + width - 1] = "wall";
  }
  const set = (x: number, y: number, tile: MapEditorTile) => {
    tiles[y * width + x] = tile;
  };
  set(5, 9, "start");
  set(5, 1, "half");
  set(5, 10, "finish");
  set(2, 7, "ring");
  set(4, 6, "ring");
  set(6, 4, "ring");
  set(8, 3, "ring");
  set(3, 3, "wall");
  set(4, 3, "wall");
  set(7, 6, "wall");
  set(7, 7, "wall");
  set(5, 5, "hazard");
  return tiles;
}

function createFunnyZigzaggerLevel(): AgentLevelCreateOptions {
  const width = 23;
  const height = 19;
  const tiles = Array.from<MapEditorTile>({ length: width * height }).fill("floor");
  const set = (x: number, y: number, tile: MapEditorTile): void => {
    tiles[y * width + x] = tile;
  };

  for (let x = 0; x < width; x += 1) {
    set(x, 0, "wall");
    set(x, height - 1, "wall");
  }
  for (let y = 0; y < height; y += 1) {
    set(0, y, "wall");
    set(width - 1, y, "wall");
  }

  [3, 6, 9, 12, 15].forEach((row, bandIndex) => {
    const gapStart = bandIndex % 2 === 0 ? 18 : 2;
    for (let x = 1; x < width - 1; x += 1) {
      if (x < gapStart || x > gapStart + 2) set(x, row, "wall");
    }
  });

  set(3, 17, "start");
  set(11, 8, "half");
  set(3, 1, "finish");

  [
    [7, 17], [13, 17], [19, 17],
    [17, 14], [11, 14], [4, 14],
    [5, 11], [11, 11], [18, 11],
    [17, 8], [5, 8],
    [5, 5], [11, 5], [18, 5],
    [18, 2], [12, 2], [6, 2]
  ].forEach(([x, y]) => set(x, y, "ring"));

  [
    [8, 17, "fire"], [14, 17, "ice"], [19, 15, "fire"],
    [15, 14, "ice"], [9, 14, "fire"], [3, 12, "ice"],
    [8, 11, "fire"], [14, 11, "ice"], [19, 9, "fire"],
    [15, 8, "ice"], [8, 8, "fire"], [3, 6, "ice"],
    [8, 5, "fire"], [14, 5, "ice"], [19, 3, "fire"],
    [15, 2, "ice"], [9, 2, "fire"]
  ].forEach(([x, y, tile]) => set(x as number, y as number, tile as MapEditorTile));

  return {
    id: "funny-zigzagger",
    label: "The Funny Zigzagger",
    width,
    height,
    cellSize: 2.2,
    tiles
  };
}

function agentAuthorField(root: HTMLElement, scope: "create" | "edit" | "json", name: string): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null {
  return root.querySelector(`[data-agent-${scope}-field="${name}"]`);
}

function agentAuthorValue(root: HTMLElement, scope: "create" | "edit" | "json", name: string): string {
  return agentAuthorField(root, scope, name)?.value ?? "";
}

function agentAuthorNumber(root: HTMLElement, scope: "create" | "edit", name: string, fallback: number): number {
  const value = Number(agentAuthorValue(root, scope, name));
  return Number.isFinite(value) ? value : fallback;
}

function agentAuthorChecked(root: HTMLElement, scope: "create" | "edit", name: string): boolean {
  const field = agentAuthorField(root, scope, name);
  return field instanceof HTMLInputElement && field.checked;
}

function agentAuthorVector(root: HTMLElement, scope: "create" | "edit", name: string, fallback: [number, number, number]): [number, number, number] {
  return [
    agentAuthorNumber(root, scope, `${name}-x`, fallback[0]),
    agentAuthorNumber(root, scope, `${name}-y`, fallback[1]),
    agentAuthorNumber(root, scope, `${name}-z`, fallback[2])
  ];
}

function agentAuthorTags(root: HTMLElement, scope: "create" | "edit"): string[] {
  return agentAuthorValue(root, scope, "tags").split(",").map((tag) => tag.trim()).filter(Boolean);
}

function agentAuthorTexture(root: HTMLElement, scope: "create" | "edit"): AgentWorldTexture | null {
  const id = agentAuthorValue(root, scope, "texture-id") as AgentWorldTextureId | "";
  if (!id) return null;
  return {
    id,
    repeat: [
      agentAuthorNumber(root, scope, "texture-repeat-x", 1),
      agentAuthorNumber(root, scope, "texture-repeat-y", 1)
    ],
    offset: [
      agentAuthorNumber(root, scope, "texture-offset-x", 0),
      agentAuthorNumber(root, scope, "texture-offset-y", 0)
    ],
    rotationDegrees: agentAuthorNumber(root, scope, "texture-rotation", 0)
  };
}

function agentVectorEditor(scope: "create" | "edit", name: string, value: readonly number[], label: string): string {
  return `<fieldset class="agent-vector-field"><legend>${escapeHtml(label)}</legend>${["x", "y", "z"].map((axis, index) => `<label><span>${axis.toUpperCase()}</span><input type="number" step="0.1" data-agent-${scope}-field="${name}-${axis}" value="${Number(value[index] ?? 0).toFixed(3)}"></label>`).join("")}</fieldset>`;
}

function agentTexturePicker(scope: "create" | "edit", material?: Partial<AgentWorldMaterial>): string {
  const settings = material?.texture;
  const selectedId = settings?.id ?? "";
  const descriptor = selectedId ? GRAPHYSX_AGENT_WORLD_TEXTURES.find((texture) => texture.id === selectedId) : null;
  const repeat = settings?.repeat ?? descriptor?.defaultRepeat ?? [1, 1];
  const offset = settings?.offset ?? [0, 0];
  const choices = GRAPHYSX_AGENT_WORLD_TEXTURES.map((texture) => `
    <button type="button" class="agent-texture-choice${selectedId === texture.id ? " is-selected" : ""}" data-agent-texture-choice="${texture.id}" data-agent-texture-scope="${scope}" data-agent-texture-repeat="${texture.defaultRepeat.join(",")}" title="${escapeHtml(texture.description)}">
      <img src="${escapeHtml(texture.url)}" alt="" loading="lazy"><span><b>${escapeHtml(texture.label)}</b><small>${escapeHtml(texture.category)}</small></span>
    </button>`).join("");
  return `<fieldset class="agent-material-editor" data-agent-texture-picker>
    <legend>Material + Texture <small>shared semantic library</small></legend>
    <input type="hidden" data-agent-${scope}-field="texture-id" value="${escapeHtml(selectedId)}">
    <div class="agent-material-grid">
      <label><span>Color / tint</span><input type="color" data-agent-${scope}-field="color" value="${escapeHtml(material?.color ?? "#7de6c3")}"></label>
      <label><span>Emissive</span><input type="color" data-agent-${scope}-field="emissive" value="${escapeHtml(material?.emissive ?? "#071f23")}"></label>
      <label><span>Glow</span><input type="number" min="0" max="100" step="0.1" data-agent-${scope}-field="emissive-intensity" value="${material?.emissiveIntensity ?? 0.3}"></label>
      <label><span>Roughness</span><input type="number" min="0" max="1" step="0.05" data-agent-${scope}-field="roughness" value="${material?.roughness ?? 0.55}"></label>
      <label><span>Metalness</span><input type="number" min="0" max="1" step="0.05" data-agent-${scope}-field="metalness" value="${material?.metalness ?? 0.08}"></label>
      <label><span>Opacity</span><input type="number" min="0" max="1" step="0.05" data-agent-${scope}-field="opacity" value="${material?.opacity ?? 1}"></label>
    </div>
    <div class="agent-texture-choices"><button type="button" class="agent-texture-choice agent-texture-none${selectedId ? "" : " is-selected"}" data-agent-texture-choice="" data-agent-texture-scope="${scope}" data-agent-texture-repeat="1,1"><span><b>No texture</b><small>solid material</small></span></button>${choices}</div>
    <div class="agent-texture-transform">
      <label><span>Repeat X</span><input type="number" min="0.01" max="128" step="0.25" data-agent-${scope}-field="texture-repeat-x" value="${repeat[0]}"></label>
      <label><span>Repeat Y</span><input type="number" min="0.01" max="128" step="0.25" data-agent-${scope}-field="texture-repeat-y" value="${repeat[1]}"></label>
      <label><span>Offset X</span><input type="number" step="0.1" data-agent-${scope}-field="texture-offset-x" value="${offset[0]}"></label>
      <label><span>Offset Y</span><input type="number" step="0.1" data-agent-${scope}-field="texture-offset-y" value="${offset[1]}"></label>
      <label><span>Rotation °</span><input type="number" step="5" data-agent-${scope}-field="texture-rotation" value="${settings?.rotationDegrees ?? 0}"></label>
    </div>
  </fieldset>`;
}

function agentOption(value: string, selected: string): string {
  return `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(value)}</option>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;"
    };
    return entities[character] ?? character;
  });
}
