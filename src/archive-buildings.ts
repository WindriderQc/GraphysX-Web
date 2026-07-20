// The `with { type: "json" }` attribute is load-bearing rather than decorative: unlike
// `agent-world-terrain.ts`'s bare JSON import, this module is imported by
// `scripts/smoke-buildings.mjs` in *Node*, which refuses a JSON module without it. Vite and
// tsc both accept the attribute, so one import serves the bundle and the harness.
import MAISON_RECORD from "./legacy/inspection-maison.json" with { type: "json" };
import type {
  AgentWorldDefinition,
  AgentWorldEntityDefinition,
  GraphysXAgentWorldApi,
} from "./agent-world-runtime";

/**
 * One recovered GraphysX **building** — the Maison — rebuilt as a platform-native v2 scene.
 *
 * ## What this is, and what it is deliberately not
 *
 * This module contains **no three.js and no runtime imports at all** — only a JSON import and
 * type imports, which erase to nothing. Everything below is plain scene data: one
 * `AgentWorldDefinition` assembled from ordinary v2 vocabulary (`group`, `box`, `point-light`,
 * `ambient-light`, `directional-light`, `toggle-visibility`) and handed to `api.create`. From
 * that point there is nothing archive-shaped left: the scene is selectable, editable in the
 * workbench, exportable, and survives export→load like a scene someone composed this
 * afternoon.
 *
 * The legacy module for this material — `src/arena-archive-environment.ts` and the
 * `maison-explorer` archive mode wired through `race-scene.ts` — were **consulted, never
 * ported**. They build `Group`, `MeshStandardMaterial` and `OBJLoader`/FBX output directly
 * against the scene graph and are reachable only from `?host=legacy`.
 *
 * ## Why the Maison, and why nothing else here
 *
 * `archive-playgrounds.ts` (lines 27–31, and its `ARCHIVE_PLAYGROUNDS_NOT_REVIVED` entry)
 * grouped `maison-explorer` with `arena-archive`, `object-library-catalog` and the rest as
 * *galleries* — "inspection grids of archived meshes, whose whole content is geometry this
 * vocabulary cannot author". That judgement is correct for every candidate in the list
 * **except this one**, and the reason is specific and checkable rather than a matter of taste:
 *
 * `src/legacy/inspection-maison.json` records 24 meshes totalling **216 vertices and 148
 * polygons** — an average of 9 vertices per object. Twenty of the twenty-four are exactly 8
 * vertices; the outliers are 12, 16, 24 and 4. This is not a mesh archive at all. It is a
 * Blender **massing model**: a house blocked out from axis-aligned cubes, each carrying a
 * location, a dimension triple and (for the doors) a single Z rotation. Every one of those
 * objects is expressible as a v2 `box` with no loss, because a box is what it already was.
 *
 * So the geometry is not "geometry this vocabulary cannot author" — it is the one archive
 * composition that v2 primitives reproduce *exactly*. The scene below is therefore not an
 * impression of the Maison. Its transforms are read out of the archive record at module load
 * and converted by a coordinate change and nothing else. See {@link MAISON_FIDELITY}.
 *
 * The Arena and the Cuisine were examined and rejected; see
 * {@link ARCHIVE_BUILDINGS_NOT_REVIVED} for the full record and the reasoning.
 */

/** Where a scene's numbers came from, and where the authoritative bytes actually live. */
export type BuildingProvenance = {
  /** Human name of the archived composition. */
  study: string;
  /** The archive-mode id this composition was reachable under, before it was a scene. */
  archiveModeId: string;
  /** Authoritative source files, by their archive-relative path. */
  sourcePaths: readonly string[];
  /** Where the bytes are. Recorded rather than implied. */
  sourceLocation: string;
  /** SHA-256 of the authoring `.blend`, carried from the inspection record. */
  sourceSha256: string;
  /** The in-repo decoded record this module reads its transforms out of. */
  transcribedFrom: readonly string[];
  /** The in-repo legacy implementation that previously presented this material. */
  supersedes: readonly string[];
  /** Native authored units and extent. */
  nativeUnits: string;
  /** The conversion applied to reach the shipped scene. */
  conversion: string;
};

export type BuildingFidelity = {
  /** Carried across exactly, and machine-checked where possible. */
  faithful: readonly string[];
  /** Authored connective tissue — real design decisions made here, not recovered. */
  inferred: readonly string[];
  /** Present in the record, knowingly not reproduced, with the reason. */
  deliberatelyAbsent: readonly string[];
};

export type BuildingDeviation = { code: string; detail: string };

export type ArchiveBuildingId = "archive-maison";

export type ArchiveBuilding = {
  id: ArchiveBuildingId;
  label: string;
  summary: string;
  provenance: BuildingProvenance;
  fidelity: BuildingFidelity;
  deviations: readonly BuildingDeviation[];
};

// ---------------------------------------------------------------------------------------
// The archive record, typed.
//
// `inspection-maison.json` is imported rather than re-typed. This is the strongest fidelity
// claim the module can make: there is no transcription step to drift, and the smoke reads the
// same file to derive its expectations independently of the scene builder.
// ---------------------------------------------------------------------------------------

type BlenderVector = readonly number[];

type BlenderObject = {
  readonly name: string;
  readonly type: string;
  readonly location: BlenderVector;
  readonly rotationEuler: BlenderVector;
  readonly scale: BlenderVector;
  readonly dimensions: BlenderVector;
  readonly hidden: boolean;
  readonly mesh?: { readonly vertices: number; readonly polygons: number; readonly name: string };
  readonly light?: {
    readonly color: BlenderVector;
    readonly distance: number;
    readonly energy: number;
    readonly kind: string;
  };
  readonly camera?: {
    readonly lens: number;
    readonly clipStart: number;
    readonly clipEnd: number;
    readonly worldForward: BlenderVector;
    readonly worldLocation: BlenderVector;
    readonly worldUp: BlenderVector;
  };
};

type MaisonInspection = {
  readonly schema: string;
  readonly scene: string;
  readonly objectCount: number;
  readonly meshTotals: { readonly polygons: number; readonly vertices: number };
  readonly source: { readonly path: string; readonly bytes: number; readonly sha256: string };
  readonly objects: readonly BlenderObject[];
};

/** The decoded `maison.blend` inspection, exactly as it sits in `src/legacy/`. */
export const MAISON_INSPECTION = MAISON_RECORD as unknown as MaisonInspection;

const MESHES = MAISON_INSPECTION.objects.filter((object) => object.type === "MESH");
const LAMPS = MAISON_INSPECTION.objects.filter((object) => object.type === "LAMP");
const CAMERA = MAISON_INSPECTION.objects.find((object) => object.type === "CAMERA");

// ---------------------------------------------------------------------------------------
// Coordinate conversion. Blender 2.79 is Z-up / Y-forward; the platform is Y-up / -Z-forward.
//
// This is the *same* conversion the archive's own FBX export declared — `maison-export.json`
// records `axisForward: "-Z", axisUp: "Y"` — so the mapping below is not a guess, it is the
// one the archivists themselves used when they exported `maison-best.fbx`.
// ---------------------------------------------------------------------------------------

/** Blender `(x, y, z)` → platform `(x, z, -y)`. */
function toPosition(source: BlenderVector): [number, number, number] {
  return [source[0], source[2], -source[1]];
}

/** Blender bounding-box `(dx, dy, dz)` → platform `(width, height, depth)`. */
function toSize(source: BlenderVector): [number, number, number] {
  return [source[0], source[2], source[1]];
}

const DEGREES = 180 / Math.PI;

/**
 * Blender XYZ Euler → platform Euler under the same axis change.
 *
 * Blender +Z maps to platform +Y, so a Z rotation becomes a Y rotation of equal sign; Blender
 * +Y maps to platform −Z, so a Y rotation becomes a Z rotation of opposite sign. Euler
 * composition order would matter if more than one component were non-zero — and in this record
 * it never is. Every one of the 24 meshes rotates about Blender Z alone (the eight doors) or
 * not at all, which the smoke asserts rather than assumes.
 */
function toRotationDegrees(source: BlenderVector): [number, number, number] {
  return [source[0] * DEGREES, source[2] * DEGREES, -source[1] * DEGREES];
}

// ---------------------------------------------------------------------------------------
// Staging. Every recovered object below carries its archive coordinate verbatim; the entire
// presentation transform is these three numbers on one root group, the way
// `archive-milkyway.ts` stages its system. Set the root group's scale to 1 and its position to
// zero in the editor to see the house at the size and place the archive authored it.
// ---------------------------------------------------------------------------------------

/** Platform-space bounds of the 24 recovered meshes, derived rather than typed. */
const SITE_BOUNDS = (() => {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const mesh of MESHES) {
    const position = toPosition(mesh.location);
    const size = toSize(mesh.dimensions);
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], position[axis] - size[axis] / 2);
      max[axis] = Math.max(max[axis], position[axis] + size[axis] / 2);
    }
  }
  return { min, max, size: min.map((low, axis) => max[axis] - low) as [number, number, number] };
})();

/**
 * The yaw that reproduces the archive camera's viewing angle under the host's fixed camera.
 *
 * v2 has no camera vocabulary — `AgentWorldEnvironment` carries `background`, `sky`,
 * `envelope`, `overlay`, `ground` and `physics`, and nothing else — so a recovered camera
 * cannot be *set*. It can still be *honoured*: the host frames every scene from
 * `[0, 24, 34]` looking at `[0, 3, 0]`, and rotating the site by the difference between that
 * azimuth and the archive camera's azimuth puts the visitor's default view on the same face of
 * the house the author was looking at when they saved the file. The elevation cannot be
 * matched the same way and is not claimed to be — see the `camera-elevation-not-matched`
 * deviation.
 */
const SITE_YAW_DEGREES = (() => {
  if (!CAMERA?.camera) return 0;
  const forward = toPosition(CAMERA.camera.worldForward);
  const archiveAzimuth = Math.atan2(forward[0], forward[2]) * DEGREES;
  // Host camera at [0, 24, 34] looking at [0, 3, 0] → view direction (0, −21, −34).
  const hostAzimuth = Math.atan2(0, -34) * DEGREES;
  return hostAzimuth - archiveAzimuth;
})();

/**
 * Uniform presentation scale. The house is ~13.2 × 5.5 × 18.0 archive units and the host's
 * default framing shows roughly 41 units across, so the model at native size reads small and
 * off in the corner of the ~710 px the editor leaves of a 1280 px window. One number, on the
 * root group, applied to nothing else.
 */
const SITE_SCALE = 1.5;

/** Root-group position: centre the house on the host's look-at and stand it on the ground. */
const SITE_POSITION: [number, number, number] = [
  -((SITE_BOUNDS.min[0] + SITE_BOUNDS.max[0]) / 2) * SITE_SCALE,
  -SITE_BOUNDS.min[1] * SITE_SCALE,
  -((SITE_BOUNDS.min[2] + SITE_BOUNDS.max[2]) / 2) * SITE_SCALE,
];

/**
 * The storey split, in Blender Z.
 *
 * The record separates cleanly into two stacks: the lower volumes sit at Blender z ≈ 0.08–2.09
 * spanning 0.01–2.01, and the upper storey sits at z ≈ 3.18–3.38 spanning 2.18–4.58. The eight
 * doors sit at z = 3.20, with their 2.03-unit height spanning 2.185–4.215 — flush on the upper
 * floor's base. The upper storey is the one with doors, so it is the living floor and the lower
 * stack is podium. 2.2 is the empty gap between the two.
 */
const STOREY_SPLIT_BLENDER_Z = 2.2;

/**
 * Multiplier from Blender 2.79 lamp `energy` to platform point-light `intensity`.
 *
 * Tuned for the dusk reading below rather than pulled from a conversion table — Blender's
 * `energy` is not the platform's unit and there is no principled mapping between them. What
 * *is* principled is that all six lamps share one factor, so their relative brightness is the
 * archive's own (all six are energy 1, so all six match) and their falloff is untouched.
 */
const LAMP_ENERGY_TO_INTENSITY = 48;

export const ARCHIVE_BUILDINGS_CONSTANTS = {
  maison: {
    /** Object totals straight out of the inspection record. */
    objectCount: MAISON_INSPECTION.objectCount,
    meshCount: MESHES.length,
    lampCount: LAMPS.length,
    recordVertices: MAISON_INSPECTION.meshTotals.vertices,
    recordPolygons: MAISON_INSPECTION.meshTotals.polygons,
    sourceSha256: MAISON_INSPECTION.source.sha256,
    /** Derived staging, so the smoke can re-derive rather than trust. */
    siteBounds: SITE_BOUNDS,
    siteYawDegrees: SITE_YAW_DEGREES,
    siteScale: SITE_SCALE,
    sitePosition: SITE_POSITION,
    storeySplitBlenderZ: STOREY_SPLIT_BLENDER_Z,
    lampEnergyToIntensity: LAMP_ENERGY_TO_INTENSITY,
    /** The archive camera, carried for the record even though v2 cannot set one. */
    archiveCamera: CAMERA?.camera
      ? {
          lens: CAMERA.camera.lens,
          worldLocation: toPosition(CAMERA.camera.worldLocation),
          worldForward: toPosition(CAMERA.camera.worldForward),
        }
      : null,
  },
} as const;

// ---------------------------------------------------------------------------------------
// Roles. Four kinds of object, decided from the record's own names and strata rather than by
// hand-listing ids, so adding an object to the record cannot silently fall out of the scene.
// ---------------------------------------------------------------------------------------

type MeshRole = "door" | "reference-plane" | "upper-volume" | "lower-volume";

function roleOf(mesh: BlenderObject): MeshRole {
  if (mesh.name.startsWith("OutsideDoor")) return "door";
  if (mesh.name === "Plane") return "reference-plane";
  return mesh.location[2] >= STOREY_SPLIT_BLENDER_Z ? "upper-volume" : "lower-volume";
}

/**
 * The study-model palette.
 *
 * Nothing here is recovered. `inspection-maison.json` carries exactly one material — named
 * `Material`, diffuse `[0.8, 0.8, 0.8]`, with a texture slot `Tex` whose `filepath` and
 * `image` are both `null` — and `images: []`. There is no colour in the archive to be
 * faithful to, so rather than paint 24 objects the same recovered grey and call it fidelity,
 * this reads the massing the way an architect's study model does: an opaque podium, a
 * translucent living floor so the recovered lamps inside it are visible, and the doors picked
 * out. The choice is declared in `inferred`, and the archive's own 0.8 grey is one edit away
 * in the editor.
 */
const PALETTE = {
  lowerVolume: { color: "#70685c", roughness: 0.95, metalness: 0.02, opacity: 1, emissive: "#000000", emissiveIntensity: 0 },
  upperVolume: { color: "#9fc4d8", roughness: 0.26, metalness: 0.06, opacity: 0.24, emissive: "#000000", emissiveIntensity: 0 },
  // The doors carry a faint emissive of their own. Physically this is a cheat; compositionally
  // it is what keeps eight 0.06-unit-thick panels from vanishing at dusk, and they are the
  // objects that most clearly say "house" rather than "stack of boxes".
  door: { color: "#e08a3c", roughness: 0.6, metalness: 0.05, opacity: 1, emissive: "#6b3208", emissiveIntensity: 0.55 },
  referencePlane: { color: "#3f4a44", roughness: 0.99, metalness: 0, opacity: 0.7, emissive: "#000000", emissiveIntensity: 0 },
} as const;

/** Blender's `dimensions` for a zero-thickness plane is 0; a box needs a visible thickness. */
const REFERENCE_PLANE_THICKNESS = 0.04;

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const GROUP_OF: Record<MeshRole, string> = {
  "lower-volume": "maison-podium",
  "upper-volume": "maison-living-floor",
  door: "maison-doors",
  "reference-plane": "maison-podium",
};

function meshEntity(mesh: BlenderObject): AgentWorldEntityDefinition {
  const role = roleOf(mesh);
  const material = PALETTE[role === "reference-plane" ? "referencePlane" : role === "door" ? "door" : role === "upper-volume" ? "upperVolume" : "lowerVolume"];
  const size = toSize(mesh.dimensions);
  if (role === "reference-plane") size[1] = REFERENCE_PLANE_THICKNESS;
  return {
    id: `maison-${slug(mesh.name)}`,
    parentId: GROUP_OF[role],
    type: "box",
    label: mesh.name,
    transform: {
      position: toPosition(mesh.location),
      rotationDegrees: toRotationDegrees(mesh.rotationEuler),
    },
    geometry: { width: size[0], height: size[1], depth: size[2] },
    material: {
      color: material.color,
      roughness: material.roughness,
      metalness: material.metalness,
      opacity: material.opacity,
      emissive: material.emissive,
      emissiveIntensity: material.emissiveIntensity,
    },
    // The podium is what a shadow reads against; the translucent living floor casting onto it
    // would draw hard black boxes through the glass and destroy the study-model reading.
    castShadow: role === "lower-volume" || role === "door",
    receiveShadow: role !== "upper-volume",
    tags: ["archive-buildings", "maison", role, `blend-${slug(mesh.mesh?.name ?? mesh.name)}`],
  };
}

function lampEntity(lamp: BlenderObject, index: number): AgentWorldEntityDefinition {
  const light = lamp.light;
  const channel = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 255);
  const color = light
    ? `#${[channel(light.color[0]), channel(light.color[1]), channel(light.color[2])]
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("")}`
    : "#ffffff";
  return {
    id: `maison-lamp-${index}-${slug(lamp.name)}`,
    parentId: "maison-lighting",
    type: "point-light",
    label: `${lamp.name} (archive lamp)`,
    transform: { position: toPosition(lamp.location) },
    // Verbatim from the record: energy 1 for all six, distance 25 for five and ~30 for `Lamp`.
    intensity: (light?.energy ?? 1) * LAMP_ENERGY_TO_INTENSITY,
    distance: light?.distance ?? 25,
    material: { color },
    // The lightbulb gizmo would put six floating markers through a translucent house.
    marker: false,
    tags: ["archive-buildings", "maison", "lighting", "archive-lamp"],
  };
}

function maison(): AgentWorldDefinition {
  return {
    schema: "graphysx.agent-world/v2",
    id: "archive-maison",
    label: "Maison — Archive Massing Model",
    environment: {
      background: "#0d141c",
      // Dusk, and this is the one presentation decision worth arguing for.
      //
      // The obvious reading of a house is midday — and it was tried first. It fails, twice
      // over. The scene washes out to pale grey on pale grey, and the six recovered lamps
      // become completely invisible, which defeats the entire purpose of a translucent
      // storey. At dusk the archive's OWN lighting is the subject: the house has no sun in
      // the record (all six of its lights are interior point lamps), so a scene lit chiefly
      // by those lamps is closer to what was authored than a noon sun that appears nowhere
      // in the file.
      //
      // `clearnight` rather than `nightsky`: the high-res set carries a horizon silhouette
      // and a near-black down face, and the host camera looks down from y = 24.
      sky: "clearnight",
      // Large enough to reach the skybox horizon from the host framing — a 90-unit plate ends
      // mid-frame and draws a hard edge across the composition.
      ground: { visible: true, size: 320, color: "#242d35", grid: false, gridColor: "#28323d" },
      // The host default fogs from 34 and clips at 260 — tuned to the ~36-unit showroom. This
      // house is ~24 units across once staged and its far corner sits ~50 units from the host
      // camera, which is well inside the default fog ramp: the back half of the building would
      // wash out. Pushed past the whole model.
      envelope: { fogNear: 120, fogFar: 320, cameraFar: 600 },
    },
    entities: [
      {
        // Cool sky fill. Deliberately not high: the recovered interior lamps are the point of
        // the translucent floor, and a strong ambient washes them out completely.
        id: "maison-ambient",
        type: "ambient-light",
        label: "Sky Fill",
        // Low on purpose. The recovered lamps are the subject and a strong ambient erases
        // them; this exists only so the unlit faces are dark blue rather than pure black.
        intensity: 0.3,
        material: { color: "#5d7ea6" },
        tags: ["archive-buildings", "maison", "lighting", "adapter"],
      },
      {
        // The last of the daylight. Not recovered — the archive has no directional source at
        // all; its `Lamp` at Blender (4.08, 1.01, 9.37) is a point light like the other five.
        // Kept dim and raking rather than bright and overhead: at this intensity it gives the
        // podium its edges and one soft shadow without competing with the interior lamps.
        id: "maison-sun",
        type: "directional-light",
        label: "Last Light",
        intensity: 1.7,
        transform: { position: [34, 17, 22] },
        material: { color: "#ffd2a1" },
        castShadow: true,
        tags: ["archive-buildings", "maison", "lighting", "adapter"],
      },
      {
        // The staging root. Everything below carries its archive coordinate verbatim, so the
        // presentation transform is these three properties in this one place.
        id: "maison-site",
        type: "group",
        label: "Maison Site",
        transform: {
          position: SITE_POSITION,
          rotationDegrees: [0, SITE_YAW_DEGREES, 0],
          scale: [SITE_SCALE, SITE_SCALE, SITE_SCALE],
        },
        tags: ["archive-buildings", "maison", "stage"],
      },
      {
        id: "maison-podium",
        parentId: "maison-site",
        type: "group",
        label: "Podium (lower stack)",
        tags: ["archive-buildings", "maison", "storey"],
      },
      {
        id: "maison-living-floor",
        parentId: "maison-site",
        type: "group",
        label: "Living Floor (upper storey)",
        // The one interaction, and it earns its place the way the Voie Lactée cloud shell
        // does: the whole reason the upper storey is translucent is that there is a plan
        // underneath it, and lifting the storey off is how a visitor sees that plan directly.
        interactions: [
          {
            id: "toggle-living-floor",
            label: "Lift the living floor",
            type: "toggle-visibility",
            // The doors go with it. All eight sit at Blender z = 3.20, spanning 2.185–4.215,
            // which is flush on the upper floor's base — they ARE the upper storey's doors, and
            // leaving them behind hangs eight orange panels in mid-air over an empty podium.
            targetIds: ["maison-living-floor", "maison-doors"],
          },
        ],
        tags: ["archive-buildings", "maison", "storey", "interactive"],
      },
      {
        id: "maison-doors",
        parentId: "maison-site",
        type: "group",
        label: "Doors",
        tags: ["archive-buildings", "maison", "openings"],
      },
      {
        id: "maison-lighting",
        parentId: "maison-site",
        type: "group",
        label: "Archive Lamps",
        tags: ["archive-buildings", "maison", "lighting"],
      },
      ...MESHES.map(meshEntity),
      ...LAMPS.map(lampEntity),
    ],
  };
}

// ---------------------------------------------------------------------------------------
// The record.
// ---------------------------------------------------------------------------------------

export const ARCHIVE_BUILDINGS: readonly ArchiveBuilding[] = [
  {
    id: "archive-maison",
    label: "Maison — Archive Massing Model",
    summary:
      "The recovered two-storey house from maison.blend, rebuilt object for object as v2 boxes: " +
      "24 archive volumes at their exact transforms, the six authored lamps inside them, and the " +
      "living floor translucent so the plan underneath reads. Lift the upper storey to see it.",
    provenance: {
      study: "Maison (house massing model)",
      archiveModeId: "maison-explorer",
      sourcePaths: ["blenderModel/Maison/maison.blend"],
      sourceLocation:
        "E:\\Media\\Datalake\\blenderModel\\Maison\\maison.blend — 576,596 bytes, Blender 2.79. " +
        "Decoded in-repo at src/legacy/inspection-maison.json; an FBX conversion of the same file " +
        "sits at public/assets/maison-explorer/maison-best.fbx and is NOT used (see deviations).",
      sourceSha256: "8C9E95FDC5DE981BA451F0C05ACA9B94D347FE0DEE701D557F4CEDA595AC9237",
      transcribedFrom: ["src/legacy/inspection-maison.json", "src/legacy/maison-export.json"],
      supersedes: ["src/archive-content.ts (mode `maison-explorer`)", "src/race-scene.ts (?host=legacy route)"],
      nativeUnits:
        "Blender metres, Z-up. 24 meshes spanning x −9.48…3.71, y −8.28…8.28, z −0.87…4.58; " +
        "216 vertices and 148 polygons in total.",
      conversion:
        "Blender Z-up → platform Y-up as (x, y, z) → (x, z, −y) — the same axis change the " +
        "archive's own FBX export declared (maison-export.json: axisForward −Z, axisUp Y). " +
        "Dimensions become box width/height/depth; the doors' single Blender-Z rotation becomes " +
        "a platform-Y rotation of equal sign. No other transformation is applied to any object.",
    },
    fidelity: {
      faithful: [
        "All 24 recovered meshes are present, one v2 `box` each, none merged and none dropped.",
        "Every position is the record's `location` under the axis change and nothing else — the " +
          "entity definitions read it out of the imported JSON, so there is no transcription step.",
        "Every box's width/height/depth is the record's `dimensions` triple, reordered by the same " +
          "axis change. No object is resized.",
        "The eight OutsideDoor panels keep their exact Blender-Z rotations (0, π/2 and π).",
        "All six LAMP objects are present as `point-light`s at their recorded positions, carrying " +
          "their recorded colour (1,1,1 → #ffffff) and their recorded `distance` verbatim — 25 for " +
          "the five Points and 29.999983 for `Lamp`.",
        "The archive camera's azimuth is reproduced as the site yaw, so the host's fixed framing " +
          "opens on the face of the house the author was looking at when the file was saved.",
        "The two-storey stratification is the record's own: the split at Blender z 2.2 falls in the " +
          "empty gap between the lower stack (spanning 0.01–2.01) and the upper (2.18–4.58).",
      ],
      inferred: [
        "The entire palette. The record carries one material (diffuse 0.8 grey) with a null texture " +
          "and `images: []`, so there is no authored colour to be faithful to. The podium/glass/door " +
          "reading is an architectural study-model idiom chosen here.",
        "The translucency of the upper storey (opacity 0.24). Nothing in the record says glass; it is " +
          "how the recovered interior lamps and the plan below are made visible at all.",
        "The sun. The archive has no directional light — its `Lamp` is a point light like the other " +
          "five — and a building with only interior point lights has no exterior form.",
        "The ambient sky fill at 0.55, and the `clearblue` sky.",
        "Lamp intensity: Blender 2.79 `energy` is not the platform's intensity unit, so energy 1 is " +
          "mapped through a single declared factor of 9. Only the brightness is invented; the " +
          "positions, colours and falloff distances are the record's.",
        "The presentation transform — site yaw, uniform scale 1.35, and the centring offset — all " +
          "on one root group so it is one edit to remove.",
        "The four storey/role groups. The record is a flat list with every `parent` null; the grouping " +
          "is for editability and is derived from the record's own name prefixes and z strata.",
        "The 0.04-unit thickness given to `Plane`, whose recorded dimension on that axis is 0.",
        "The 'lift the living floor' interaction. Nothing in the archive was clickable.",
      ],
      deliberatelyAbsent: [
        "The room interiors. Poly counts prove these boxes are hollow shells — five of the upper " +
          "volumes have 5, 10 or 14 polygons where a closed box has 6, and Cube.006 has 24 vertices " +
          "against a box's 8, so faces are missing and openings are cut. The record does not say " +
          "*which* faces, so rebuilding walls would invent the plan rather than recover it. Each " +
          "object ships as its recorded bounding volume, which is what the record actually states.",
        "`maison-best.fbx` (87,836 bytes, in-repo and intact). The platform's model loader accepts " +
          "exactly one format — `graphysx-mesh-json` (agent-world-assets.ts:16) — so the FBX cannot " +
          "be loaded by a v2 `model` entity without a new decoder and a vendoring script. It would " +
          "also be the wrong move: it would put a black-box mesh where 24 editable boxes now are.",
        "The `Plane` object's texture. Its material's one texture slot (`Tex`) has `filepath: null` " +
          "and `image: null`, and the record's `images` array is empty. It ships as an untextured " +
          "plate rather than with an invented image.",
        "The Blender camera as a camera. v2 has no camera vocabulary at all, so only its azimuth " +
          "could be honoured; its position, 35 mm lens and clip range are recorded in " +
          "`ARCHIVE_BUILDINGS_CONSTANTS` and set nothing.",
        "Physics. Nothing in the record moves, has mass, or is a collider; the scene is static by " +
          "construction rather than by omission.",
      ],
    },
    deviations: [
      {
        code: "bounding-volumes-not-shells",
        detail:
          "The record's poly counts (5, 10 and 14 polygons on six of the volumes; 12, 16 and 24 " +
          "vertices on three) prove these cubes are open shells with cut openings, not solids. " +
          "Which faces are missing is not recorded, so each object ships as the closed bounding " +
          "box its `dimensions` triple describes. The house is therefore a massing model, and the " +
          "translucent upper storey plus the lift-the-floor interaction are how the interior is " +
          "made legible without inventing it.",
      },
      {
        code: "palette-is-authored",
        detail:
          "The archive has one material, diffuse [0.8, 0.8, 0.8], with a null texture and no images. " +
          "Every colour, roughness and opacity in the shipped scene is a presentation decision.",
      },
      {
        code: "lamp-energy-conversion",
        detail:
          "Blender 2.79 lamp `energy` (1 for all six) is not the platform's point-light intensity " +
          "unit. A single factor of 9 is applied, exported as " +
          "`ARCHIVE_BUILDINGS_CONSTANTS.maison.lampEnergyToIntensity`. Positions, colours and " +
          "`distance` falloff are carried verbatim; only brightness is chosen.",
      },
      {
        code: "camera-elevation-not-matched",
        detail:
          "The archive camera looks down at about 26.4° from Blender (7.48, −6.51, 8.81) on a 35 mm " +
          "lens. The host frames every scene from [0, 24, 34] at 55° FOV, looking down about 31.7°, " +
          "and v2 has no camera vocabulary to override it. The azimuth is reproduced by yawing the " +
          "site; the elevation and lens are not, and are recorded instead.",
      },
      {
        code: "no-sun-in-the-archive",
        detail:
          "All six recovered lights are point lamps. The directional `maison-sun` is added because " +
          "an exterior massing with only interior points reads as a flat silhouette. It is tagged " +
          "`adapter` so it is trivially findable and removable.",
      },
      {
        code: "fbx-not-loaded",
        detail:
          "`public/assets/maison-explorer/maison-best.fbx` is present and intact but unused: the " +
          "model loader supports only `graphysx-mesh-json`. No asset-catalog registration is " +
          "required by this scene — it loads zero external assets beyond the shared `clearblue` sky.",
      },
      {
        code: "staging-transform",
        detail:
          "Site yaw ≈ " +
          SITE_YAW_DEGREES.toFixed(1) +
          "°, uniform scale " +
          SITE_SCALE +
          ", and a centring offset, all on the `maison-site` group and on nothing else. Zero them " +
          "in the editor to stand the house at its authored coordinates.",
      },
    ],
  },
];

/**
 * What was examined and deliberately not revived, with the reasoning.
 *
 * Recording the rejections beside the revival is the point — a candidate that was never looked
 * at and a candidate that was looked at and refused are very different facts, and only one of
 * them is worth anything to the next person.
 */
export const ARCHIVE_BUILDINGS_NOT_REVIVED = [
  {
    record: "The Unity Arena — `public/assets/arena-archive/Arena.obj`, `src/arena-archive-environment.ts`",
    what:
      "A complete, scriptless 2017 Unity project: one 40 × 2 × 40 octagonal slab (48 vertices, 42 " +
      "face records — 40 quads and 2 octagons, not the 44 the environment's constant block claims), " +
      "one hand-painted 1024² atlas, one Standard material at metallic 0 / smoothness 0.5, one " +
      "object transform, one camera at (0, 1, −10) on a 60° lens, and one directional light.",
    verdict: "not revived",
    why:
      "There is nothing to rebuild it *as*. The Unity project contains no MonoBehaviour, no prefab, " +
      "no input map and no rigidbody — the repo's own census says so explicitly ('no gameplay is " +
      "invented because the project contains no scripts or rules'), the legacy environment's " +
      "`update()` is a two-line no-op that forwards orbit input, and the deleted QA harness " +
      "(`scripts/qa-arena-archive.mjs`, removed at 218d86c) asserted the *absence* of gameplay as a " +
      "pass condition. Unlike the Maison, its content is a genuine 48-vertex mesh with baked UVs " +
      "onto a 532 KB atlas: v2 primitives cannot author it, and the one v2 form it could take is a " +
      "`model` entity on a plinth — which would need the OBJ decoded into `graphysx-mesh-json` and " +
      "registered in the asset catalog, to ship a scene whose entire content is one textured disc " +
      "you orbit. `archive-playgrounds.ts` already reached this verdict; nothing found here " +
      "overturns it. The mesh would make a fine *floor* for a ball course — it is closed on all " +
      "eight sides, which is exactly the containment `archive-ballz-levels.ts` had to invent — but " +
      "no spawn, checkpoint, lap line or objective survives, so that course would be authored here " +
      "and merely decorated with a recovered slab.",
  },
  {
    record: "The Cuisine — `src/legacy/inspection-cuisine.json`, `public/assets/maison-explorer/cuisine-best.fbx`",
    what:
      "The kitchen from the same `blenderModel/Maison` folder: 87 objects (76 meshes, 3 lamps, 7 " +
      "empties, 1 camera) totalling 4,244 vertices and 3,676 polygons — cabinets, drawers, doors, " +
      "a sink and worktops, with parented children carrying local transforms.",
    verdict: "not revived",
    why:
      "It is the exact inverse of the Maison, and the contrast is the useful part. The Maison " +
      "averages 9 vertices per object and 20 of its 24 meshes are literally 8-vertex boxes, so v2 " +
      "primitives reproduce it without loss. The Cuisine averages 56 vertices per object: its " +
      "cabinet handles are 144-vertex / 128-polygon lathed forms, its drawers are 24/19, its " +
      "cabinets 32/26. Rebuilding those as boxes would not be a massing model of a kitchen, it " +
      "would be a pile of blocks where the modelling *is* the content. The FBX route is closed for " +
      "the same reason it is closed for the Maison — the loader accepts only `graphysx-mesh-json` — " +
      "and it is closed harder here: the record's single image, " +
      "`C:\\Users\\Yanik\\Desktop\\Maison\\31768676_…_n.jpg`, is marked `exists: false` and " +
      "`packed: false`, so the one texture the scene references is genuinely lost. It also carries " +
      "7 EMPTY objects (TopLavabo, TopCoin, TopPoele, Lavabo…) which are snap targets for an " +
      "authoring workflow v2 has no vocabulary for.",
  },
  {
    record: "The Maison's room interiors — the hollow shells inside `inspection-maison.json`",
    what:
      "Six of the upper volumes are open shells (5, 10 and 14 polygons where a closed box has 6) " +
      "and three carry extra vertex loops (12, 16 and 24 vertices) where door openings are cut.",
    verdict: "not revived, and this is the honest limit of the scene that did ship",
    why:
      "A Blender inspection record stores per-object totals, not topology. It says an object has 14 " +
      "polygons; it does not say which four faces of the box are missing or where the opening sits " +
      "in the wall. Rebuilding each room as four thin walls would require choosing the open face " +
      "and the wall thickness for every room — that is authoring a floor plan and attributing it to " +
      "the archive. The eight door positions constrain it a little, but nowhere near enough. The " +
      "shipped scene therefore stops at the bounding volumes the record actually states, and makes " +
      "the interior legible by translucency and a lift-the-storey interaction instead of by " +
      "invention. Recovering the true interior needs the `.blend` itself re-inspected with " +
      "per-face output — a decoder change, not a scene change.",
  },
] as const;

/**
 * Builds the recovered scene as an ordinary v2 document.
 *
 * Exported separately from {@link composeArchiveBuilding} so `scripts/smoke-buildings.mjs` can
 * import the module in Node, build the definition, and push it into the BUILT page through
 * `window.__GRAPHYSX__.create()` — the shipped definition is verified, not a re-typed copy.
 */
export function buildArchiveBuilding(id: ArchiveBuildingId = "archive-maison"): AgentWorldDefinition {
  if (id === "archive-maison") return maison();
  throw new Error(`Unknown archive building: ${String(id)}`);
}

/** Materialises a recovered building into the live world. One `api.create`, nothing else. */
export function composeArchiveBuilding(
  api: GraphysXAgentWorldApi,
  id: ArchiveBuildingId = "archive-maison",
): void {
  api.create(buildArchiveBuilding(id));
}

/** Descriptor list for a shelf row, without pulling in the full provenance blocks. */
export function listArchiveBuildings(): readonly { id: ArchiveBuildingId; label: string; summary: string }[] {
  return ARCHIVE_BUILDINGS.map(({ id, label, summary }) => ({ id, label, summary }));
}

/**
 * Browse-shelf rows, in the exact shape `ComposedSceneEntry` wants.
 *
 * Structurally typed rather than importing `ComposedSceneEntry` from `browse-shelf.ts`, so
 * this module keeps its "no runtime imports, no imports from surfaces" property and the shelf
 * keeps not having to know what a building is. The lead spreads the result into the `composed`
 * array it already accepts; `onOpen` is the caller's, because only the caller knows whether the
 * showroom needs taking down first.
 */
export function archiveBuildingBrowseRows(
  api: GraphysXAgentWorldApi,
  onOpen?: (id: ArchiveBuildingId) => void,
): { id: string; label: string; summary: string; meta: string; open: () => void }[] {
  return ARCHIVE_BUILDINGS.map((record) => {
    const definition = buildArchiveBuilding(record.id);
    return {
      id: record.id,
      label: record.label,
      summary: record.summary,
      meta: `${definition.entities.length} entities · recovered · ${record.deviations.length} recorded deviations`,
      open: () => {
        composeArchiveBuilding(api, record.id);
        onOpen?.(record.id);
      },
    };
  });
}
