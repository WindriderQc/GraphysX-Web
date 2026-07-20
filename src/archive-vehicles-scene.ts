import { Vector3 } from "three";
import {
  GRAPHYSX_AGENT_WORLD_SCHEMA,
  type AgentWorldEntityDefinition,
  type GraphysXAgentWorldApi,
} from "./agent-world-runtime";
import type { PlatformHost } from "./platform-host";
import { ARCHIVE_VEHICLE_MESHES, archiveVehicleMesh } from "./archive-vehicles-manifest";

/**
 * The Archive Garage — the recovered GraphysX vehicles, presented on the platform.
 *
 * ## Why this file exists, and what it deliberately is not
 *
 * The Impreza, the Low Cobra and the Piste Ovale have been decoded for a while, but they
 * were only ever reachable through `race-scene.ts` / `vehicle-pack-*.ts` — legacy modules
 * that build three.js objects by hand and mutate the scene graph directly. By §8.1's own
 * test ("expressible in the `graphysx.agent-world/v2` model, reachable by the editor *and*
 * the agent API"), that means the vehicles had **not** graduated.
 *
 * This scene is not a port of any of that. Every line below is ordinary v2 vocabulary — a
 * handful of `model`, `box`, `cylinder` and light entities in one `api.create` — so the
 * garage is an editable, selectable, exportable scene like any other. There is no three.js
 * scene-building here on purpose (§1: "never old archive code ported across"); the single
 * `Vector3` import exists only to hand a point to the *host's* camera helper.
 *
 * What genuinely graduated is the **asset**: `scripts/vendor-vehicle-meshes.mjs` rewrites the
 * decoded geometry in `src/legacy/cars-catalog.json` into the `graphysx-mesh-json` payload the
 * v2 `model` entity already loads, under `public/assets/vehicles/`. Provenance (archive path +
 * SHA-256 + the workshop decoder that produced the catalog) travels with it in
 * `src/archive-vehicles-manifest.ts` and inside each payload's `provenance` block.
 *
 * ## FAITHFUL
 * - The three models' vertex / index / UV arrays, verbatim from the decoded archive files.
 * - Archive scale: `fitSize` is each model's own longest native span, so the cars stand at
 *   exactly the size the 3DS records — the Impreza 4.78 units nose to tail, the Cobra 4.84.
 * - The Impreza's three chassis material slots and their face assignments, painted with the
 *   archive's own ChassisSTi / Windows / Undercarriage maps, and its wheels with Wheel.bmp.
 * - The four wheel hub offsets on both cars.
 *
 * ## INFERRED (this file's inventions, none of them recovered)
 * - Everything about the *room*: floor, walls, ceiling, plinths, their sizes, colours and
 *   materials. The archive has no garage. This is a display case built to show recovered
 *   objects well.
 * - All lighting. No light rig was recovered with these meshes (the workshop tracker records
 *   that the archived track "has no recovered light rig").
 * - Placement, spacing, the yaw each car is turned to, and the slow turntable rotation.
 * - The Piste Ovale's display size: shown at 1:29 of its native 150 x 19.4 x 200 as a table
 *   model. At native size it would be a 200-unit landscape, not a gallery piece.
 *
 * ## DELIBERATELY ABSENT
 * - **Driving.** `race-scene.ts` drives these with a cannon `RigidVehicle`, four wheel bodies,
 *   stepped steering and a 3.5%-traction adapter it discloses as an adapter. None of that is
 *   v2 vocabulary — the model has no vehicle/joint/articulation concept — so a drivable car
 *   here could only be a box with a texture pretending to be a car. A static gallery that is
 *   honest beats that. The wheels are baked into each model at their catalog offsets and do
 *   not steer or spin; a rig is future work, named rather than faked.
 * - **The Piste Ovale's surface.** Its TVM holds several material groups whose assignments the
 *   decoder does not preserve. `race-scene.ts` covered that by projecting a concrete texture
 *   per face; a gallery should not invent a surface the record does not have, so the model is
 *   flat grey and the gap is stated instead.
 * - **The Cobra's glass and tire textures.** Its 3DS material names carry no texture bindings
 *   into the catalog, so the whole body takes one livery (the same choice race-scene makes),
 *   and its tire maps live only in the workshop. Untextured rubber rather than a stand-in.
 *
 * ## Two runtime limits this scene works around rather than papers over
 *
 * 1. **`loadAgentWorldModel` mis-places any model whose `fitSize` is not its native span.**
 *    It recentres with `sourceRoot.position = -center` and *then* sets `scale = fitSize/span`.
 *    Because a three.js matrix composes as T·R·S, the translation is applied in **unscaled**
 *    units while the geometry is scaled — so the model ends up displaced from its entity
 *    origin by `center * (1 - scale)`. Measured here: the Piste Ovale (bounds centre 9.7 units
 *    above its own base) rendered 9.16 units below where it was placed. So this scene loads
 *    every model at `fitSize = native span` — the one value where the defect is identically
 *    zero — and gets display size from the entity's own `transform.scale` instead, which is
 *    applied above the whole thing and is therefore exact. This is a defect in a shared file
 *    (`src/agent-world-assets.ts`) that this session does not own; it is reported, not patched,
 *    and it affects every existing `model` entity that uses the default `fitSize` of 4.
 * 2. **A `point-light` always renders a visible 0.12-unit emissive marker sphere**
 *    (`agent-world-runtime.ts` sets `userData.agentLightMarker` but nothing ever hides it).
 *    Rather than fight it, the lights here are placed where a real fixture belongs — at
 *    ceiling height — so the markers read as recessed downlights instead of as stray dots.
 */

/** Plinth top surface. Cars stand on this. */
const PLINTH_TOP = 0.34;
/** Table top surface for the Piste Ovale scale model. */
const TABLE_TOP = 0.5;
const CEILING_Y = 6.4;
const ROOM_WIDTH = 26;
const ROOM_DEPTH = 21;
/** Piste Ovale display length, in world units. Native is 200. */
const TRACK_LENGTH = 7.0;

type Placement = {
  meshId: string;
  entityId: string;
  label: string;
  x: number;
  z: number;
  /** Degrees about Y. See the note on the mirrored Z axis at the placement site. */
  yaw: number;
  plinthRadius: number;
  /** Accent colour for the plinth rim light — the only per-car styling choice here. */
  accent: string;
};

const CARS: readonly Placement[] = [
  { meshId: "archive-impreza", entityId: "garage-impreza", label: "Subaru Impreza — impreza.3ds", x: -4.4, z: 1.4, yaw: 208, plinthRadius: 3, accent: "#63c8ff" },
  { meshId: "archive-cobra", entityId: "garage-cobra", label: "Low Cobra — Low_Cobra.3DS", x: 4.4, z: 1.4, yaw: -32, plinthRadius: 3, accent: "#ffa96b" },
];

/**
 * Where a model's lowest point sits relative to its entity origin, at native load scale.
 *
 * `loadAgentWorldModel` recentres a payload on its own bounding box, so the entity origin is
 * the model's *centre*, not its wheels. Standing a car on a plinth means lifting it by that
 * difference — read off the recorded bounds rather than eyeballed, so it stays correct if the
 * meshes are ever re-vendored. Multiply by the entity's own `transform.scale` for display size.
 */
function groundOffset(meshId: string): number {
  const record = archiveVehicleMesh(meshId);
  return (record.bounds.min[1] + record.bounds.max[1]) / 2 - record.bounds.min[1];
}

/**
 * Compose the Archive Garage into the runtime.
 *
 * One `api.create`, so the result is an ordinary editable v2 scene — select a car, drag it,
 * export it, load it back. Nothing about it is a special host mode.
 */
export function composeArchiveVehicles(api: GraphysXAgentWorldApi): void {
  const room: AgentWorldEntityDefinition[] = [
    {
      id: "garage-floor",
      type: "box",
      label: "Garage Floor",
      geometry: { width: ROOM_WIDTH, height: 0.5, depth: ROOM_DEPTH },
      transform: { position: [0, -0.25, 0] },
      // Dark, faintly polished concrete: low roughness so the downlights leave legible pools,
      // but not a mirror — a mirror floor reads as a car advert, and this is a workshop.
      material: { color: "#12161b", roughness: 0.34, metalness: 0.55 },
      receiveShadow: true,
      castShadow: false,
      physics: { mode: "static" },
      tags: ["garage", "room"],
    },
    {
      id: "garage-ceiling",
      type: "box",
      label: "Garage Ceiling",
      geometry: { width: ROOM_WIDTH, height: 0.4, depth: ROOM_DEPTH },
      transform: { position: [0, CEILING_Y + 0.2, 0] },
      material: { color: "#0c1014", roughness: 0.95, metalness: 0 },
      // A ceiling that cast shadows would black out the room it encloses.
      castShadow: false,
      receiveShadow: true,
      tags: ["garage", "room"],
    },
    {
      id: "garage-wall-back",
      type: "box",
      label: "Back Wall",
      geometry: { width: ROOM_WIDTH, height: CEILING_Y, depth: 0.5 },
      transform: { position: [0, CEILING_Y / 2, -ROOM_DEPTH / 2] },
      material: { color: "#191f26", roughness: 0.92, metalness: 0.04 },
      receiveShadow: true,
      physics: { mode: "static" },
      tags: ["garage", "room"],
    },
    // Three walls and a ceiling; the fourth side is open, which is where the viewer stands.
    ...[-1, 1].map((side, index): AgentWorldEntityDefinition => ({
      id: `garage-wall-side-${index}`,
      type: "box",
      label: side < 0 ? "Left Wall" : "Right Wall",
      geometry: { width: 0.5, height: CEILING_Y, depth: ROOM_DEPTH },
      transform: { position: [(side * ROOM_WIDTH) / 2, CEILING_Y / 2, 0] },
      material: { color: "#161c22", roughness: 0.92, metalness: 0.04 },
      receiveShadow: true,
      physics: { mode: "static" },
      tags: ["garage", "room"],
    })),
    // Emissive strip lights let into the back wall. They are the only thing in the room that
    // is bright, which is what gives a dark interior a readable depth cue: the cars sit as
    // silhouettes against them rather than dissolving into the wall behind.
    ...[-11, -5.9, 5.9, 11].map((x, index): AgentWorldEntityDefinition => ({
      id: `garage-strip-${index}`,
      type: "box",
      label: `Wall Strip ${index + 1}`,
      geometry: { width: 0.5, height: 4.2, depth: 0.14 },
      transform: { position: [x, 3.1, -ROOM_DEPTH / 2 + 0.32] },
      material: { color: "#dbeeff", emissive: "#9fd4ff", emissiveIntensity: 1.7, roughness: 0.4, metalness: 0 },
      tags: ["garage", "room"],
    })),
  ];

  const plinths: AgentWorldEntityDefinition[] = CARS.flatMap((car, index): AgentWorldEntityDefinition[] => [
    {
      id: `garage-plinth-${index}`,
      type: "cylinder",
      label: `${car.label} plinth`,
      geometry: { radius: car.plinthRadius, height: PLINTH_TOP, radialSegments: 48 },
      transform: { position: [car.x, PLINTH_TOP / 2, car.z] },
      material: { color: "#252c34", roughness: 0.5, metalness: 0.4 },
      receiveShadow: true,
      physics: { mode: "static" },
      tags: ["garage", "plinth"],
    },
    // A thin emissive ring under the plinth lip — the accent that makes each stand read as a
    // display and gives the dark floor something to catch.
    {
      id: `garage-plinth-ring-${index}`,
      type: "cylinder",
      label: `${car.label} rim light`,
      geometry: { radius: car.plinthRadius + 0.1, height: 0.06, radialSegments: 48 },
      transform: { position: [car.x, 0.05, car.z] },
      material: { color: car.accent, emissive: car.accent, emissiveIntensity: 2, roughness: 0.3, metalness: 0.1 },
      tags: ["garage", "plinth"],
    },
  ]);

  const vehicles: AgentWorldEntityDefinition[] = CARS.map((car): AgentWorldEntityDefinition => {
    const record = archiveVehicleMesh(car.meshId);
    return {
      id: car.entityId,
      type: "model",
      label: car.label,
      asset: {
        // Both id and url. The url is what actually resolves today; the id is the stable name
        // this mesh will have once it is registered in the generated asset catalog (see the
        // handoff report), at which point registration is a no-op for this scene rather than
        // an edit to it. `resolveAgentWorldModelAsset` prefers the url either way.
        id: record.id,
        url: record.url,
        format: "graphysx-mesh-json",
        // Native archive scale, 1:1 — and the only fitSize at which the loader's recentring
        // defect (module header, note 1) is exactly zero.
        fitSize: record.nativeFitSize,
      },
      transform: {
        position: [car.x, PLINTH_TOP + groundOffset(car.meshId), car.z],
        // NOTE on the yaw: `loadAgentWorldModel` mirrors every payload's Z axis (it scales
        // (s, s, -s), the convention the recovered `.x` meshes needed). Both cars are
        // left/right symmetric, so for them that mirror is indistinguishable from a
        // 180-degree turn — it costs the nose direction and nothing else. These yaws are
        // chosen by eye against the rendered result rather than derived, and are INFERRED.
        rotationDegrees: [0, car.yaw, 0],
      },
      // A slow turntable — roughly a revolution a minute. Enough that the scene is alive and
      // every side comes around, slow enough not to fight a viewer trying to look at one.
      behaviors: [{ id: `${car.entityId}-turntable`, type: "spin", axis: "y", speedDegrees: 6 }],
      castShadow: true,
      receiveShadow: true,
      tags: ["garage", "vehicle", "archive"],
    };
  });

  // The Piste Ovale, as a table model. It belongs here because it is the third recovered piece
  // of this material — and because the workshop's ledger records that it was never actually
  // wired into CarScene, so a display model is the most honest thing it has ever been.
  const trackRecord = archiveVehicleMesh("archive-piste-ovale");
  const trackScale = TRACK_LENGTH / trackRecord.nativeFitSize;
  const track: AgentWorldEntityDefinition[] = [
    {
      id: "garage-track-table",
      type: "cylinder",
      label: "Piste Ovale table",
      geometry: { radius: 4.4, height: TABLE_TOP, radialSegments: 56 },
      transform: { position: [0, TABLE_TOP / 2, -6.6] },
      material: { color: "#20272e", roughness: 0.55, metalness: 0.35 },
      receiveShadow: true,
      physics: { mode: "static" },
      tags: ["garage", "plinth"],
    },
    {
      id: "garage-track-ring",
      type: "cylinder",
      label: "Piste Ovale rim light",
      geometry: { radius: 4.5, height: 0.06, radialSegments: 56 },
      transform: { position: [0, 0.05, -6.6] },
      material: { color: "#bcd8f2", emissive: "#8fc4ee", emissiveIntensity: 1.6, roughness: 0.3, metalness: 0.1 },
      tags: ["garage", "plinth"],
    },
    {
      id: "garage-piste-ovale",
      type: "model",
      label: "Piste Ovale — PisteOvale.tvm (1:29 table model)",
      // Loaded at native size and shrunk by the entity transform — see the module header.
      asset: { id: trackRecord.id, url: trackRecord.url, format: "graphysx-mesh-json", fitSize: trackRecord.nativeFitSize },
      transform: {
        position: [0, TABLE_TOP + groundOffset("archive-piste-ovale") * trackScale, -6.6],
        // Turned across the room so its 200-unit axis reads as width rather than pointing
        // away from the viewer.
        rotationDegrees: [0, 90, 0],
        scale: [trackScale, trackScale, trackScale],
      },
      castShadow: true,
      receiveShadow: true,
      tags: ["garage", "vehicle", "archive"],
    },
  ];

  const lights: AgentWorldEntityDefinition[] = [
    // Low ambient: enough that nothing goes to pure black, low enough that the downlight pools
    // are what shapes the room.
    { id: "garage-ambient", type: "ambient-light", label: "Garage Ambient", intensity: 0.22, material: { color: "#8ba6c8" } },
    // The key, raking from the front-left, so it lays the cars' shadows back across the floor
    // rather than hiding them underneath.
    {
      id: "garage-key",
      type: "directional-light",
      label: "Garage Key Light",
      intensity: 1.1,
      transform: { position: [-9, 12, 11] },
      material: { color: "#fff3e0" },
      castShadow: true,
    },
    // One warm downlight per plinth plus a cool counter-light, which is the oldest trick in
    // vehicle photography: warm on the form, cool on the edge. Both sit at ceiling height so
    // their always-visible markers read as recessed fixtures (module header, note 2).
    ...CARS.flatMap((car, index): AgentWorldEntityDefinition[] => [
      {
        id: `garage-downlight-${index}`,
        type: "point-light",
        label: `${car.label} key`,
        intensity: 60,
        distance: 13,
        transform: { position: [car.x, CEILING_Y - 0.35, car.z + 1] },
        material: { color: "#ffe6c6" },
        tags: ["garage", "light"],
      },
      {
        id: `garage-rim-${index}`,
        type: "point-light",
        label: `${car.label} rim`,
        intensity: 22,
        distance: 11,
        transform: { position: [car.x * 1.9, CEILING_Y - 0.35, car.z - 5.4] },
        material: { color: car.accent },
        tags: ["garage", "light"],
      },
    ]),
    {
      id: "garage-track-light",
      type: "point-light",
      label: "Piste Ovale light",
      // Offset well off-axis on purpose. Directly overhead, an untextured slab lights evenly
      // and reads as a flat lump; raked from the side, the oval's own banking shades itself
      // and the shape becomes legible without inventing a surface for it.
      intensity: 26,
      distance: 13,
      transform: { position: [-4.2, CEILING_Y - 0.35, -2.6] },
      material: { color: "#cfe4ff" },
      tags: ["garage", "light"],
    },
  ];

  api.create({
    schema: GRAPHYSX_AGENT_WORLD_SCHEMA,
    id: "archive-garage",
    label: "Archive Garage — recovered GraphysX vehicles",
    environment: {
      background: "#070a0e",
      // No skybox: this is an interior. Sky ownership is per-scene (§11), and the honest
      // value for a room is "none".
      sky: null,
      overlay: null,
      // The floor is a real entity with a collider, so the editor's helper grid is off.
      ground: { visible: false, size: ROOM_WIDTH, color: "#0f1419", grid: false, gridColor: "#1e2831" },
    },
    entities: [...lights, ...room, ...plinths, ...vehicles, ...track],
  });
}

/**
 * Ids of every entity this scene creates that carries a recovered mesh. Exported so a smoke
 * test (or the lead's wiring) can assert the models actually resolved rather than silently
 * failing to load — a `model` entity whose fetch 404s is an empty Group that looks fine in
 * the outliner and renders nothing.
 */
export const ARCHIVE_GARAGE_MODEL_IDS: readonly string[] = [
  ...CARS.map((car) => car.entityId),
  "garage-piste-ovale",
];

/** The provenance rows behind this scene, for a UI or a report that wants to show lineage. */
export const ARCHIVE_GARAGE_PROVENANCE = ARCHIVE_VEHICLE_MESHES;

/**
 * Aim the host camera at the garage.
 *
 * Framing is host-level, not scene-level: `graphysx.agent-world/v2` has no per-scene camera
 * (PRODUCT_SPEC §14.5 records that gap), and `PlatformHost` boots at a wide overview from
 * which a 4.8-unit car is a speck. `focusOn` deliberately preserves the viewer's current
 * viewing *direction*, so this nudges the camera onto a low gallery rake first and then lets
 * the host's own eased move do the work — no camera code of its own.
 *
 * Kept separate from `composeArchiveVehicles` so the composer stays pure API and can be called
 * by an agent that has no host handle.
 */
export function frameArchiveVehicles(host: PlatformHost): void {
  // Set the direction, then focus: `focusOn` reads (camera.position - orbitTarget) as the
  // approach vector and re-derives the distance from the subject radius itself.
  host.camera.position.set(0, 5.2, 14);
  host.focusOn(new Vector3(0, 1.75, -1.9), 3.15, 1.2);
}
