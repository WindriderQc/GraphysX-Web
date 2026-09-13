import type {
  AgentWorldDefinition,
  AgentWorldEntityDefinition,
  AgentWorldVector3,
} from "./agent-world-runtime";

/**
 * The Nocturnal Forge — LLMx's first world, as an ordinary `graphysx.agent-world/v2` document.
 *
 * Everything here is scene vocabulary the editor and an agent already understand: boxes,
 * cylinders, tori, lights and particle emitters. There is no host-side scenery, so the Forge
 * exports, saves, reloads and can be edited by the person living in it — which is the whole
 * point of LLMx (plan §8: "GraphysX possède le monde"). The template is cloned into a personal
 * environment on first entry; this function is the reproducible template.
 *
 * ## Layout (metres, +Y up, the visitor arrives looking down -Z)
 *
 * - A 32 × 32 m plateau of 10 × 10 thick tiles with dark joints, on one static floor collider.
 *   The tiles carry no physics: a hundred static bodies would cost a hundred colliders for a
 *   floor the one plate under them already provides.
 * - A socket at the origin: a low cylinder with a copper rim and a cyan energy crown. The mask
 *   hangs above it — {@link ForgeAnchors.faceCenter} is where the face rig's origin goes; the
 *   group entity `llmx-face-anchor` marks the same point in the document.
 * - Four copper ribs run along tile joints from the socket outward. They are the "circuit"
 *   the entry choreography lights up (see `llmx-forge-presentation.ts`).
 * - Gothic arches and industrial stacks stand at 13–17 m in the fog: silhouettes, not props.
 *   They cast no shadows and use one material each.
 * - Build zone: a subtle cyan ring on the floor to the visitor's front-right, where created
 *   objects appear by default. It is a document entity so an agent can read where "here" is.
 *
 * ## Budgets (plan §9.2)
 *
 * One shadow-casting light (the cold key). Three emitters, well under the 600-particle rest
 * budget. Bloom at the plan's starting values (0.45 / 0.35 / 0.9): only emissives cross the
 * threshold, so the mask's edges stay crisp.
 *
 * Numbers in this file are art direction starting points to be measured in the host, not
 * validated results. The unit test pins the invariants that must survive retuning: unique ids,
 * one collider, one shadow light, the particle budget, and anchors that agree with each other.
 */

export const LLMX_FORGE_TEMPLATE_ID = "llmx-nocturnal-forge";

/** The scene id `?app=llmx` will load; a personal copy takes another id. */
export const LLMX_FORGE_LABEL = "Nocturnal Forge";

/** Document entity that marks the face rig's origin. The rig is parented here by the integrator. */
export const LLMX_FACE_ANCHOR_ID = "llmx-face-anchor";

/** Tag on every entity the template authored, so a personal copy can tell template from creation. */
export const LLMX_FORGE_TAG = "llmx-forge";

/** Tag on the four floor ribs, read by the presentation layer to lay its glow strips. */
export const LLMX_RIB_TAG = "llmx-rib";

export type ForgeCameraPose = Readonly<{ position: AgentWorldVector3; target: AgentWorldVector3 }>;

/**
 * Named points the application, the rig and the choreography all agree on.
 *
 * The mask frame, as measured by the face owner on the `high` level (2026-09-13): origin at the
 * mask's centre, facing +Z, scale 1 = metres, x ∈ [-0.713, 0.713], y ∈ [-1.117, 1.137],
 * z ∈ [-0.537, 0.613]; eyes at (±0.29, 0.10, 0.35), mouth at y = -0.52, chin at y ≈ -1.10.
 * The rig hangs at {@link ForgeAnchors.faceCenter} at scale 1.
 */
export type ForgeAnchors = Readonly<{
  /** Origin of the face rig. The mask is authored around its own centre, facing +Z. */
  faceCenter: AgentWorldVector3;
  /** Height of the mask asset, so framing does not depend on the rig being loaded. */
  faceHeight: number;
  /** Where a camera or a created object should be looked at from: the eyes, not the nose. */
  gazeTarget: AgentWorldVector3;
  /** Top of the socket, where the energy crown sits. */
  socketTop: AgentWorldVector3;
  /** Where the camera rests for conversation: slightly off-axis, at eye level with the mask. */
  cameraRest: ForgeCameraPose;
  /** Where the entry move starts: far and high, the plateau and the arches in shot. */
  cameraEntry: ForgeCameraPose;
  /** Default landing area for created objects, and what "here" means when nothing is picked. */
  buildZone: Readonly<{ center: AgentWorldVector3; radius: number }>;
  /** Straight-line rib runs from the socket rim outward, for the presentation layer. */
  ribs: readonly Readonly<{ from: AgentWorldVector3; to: AgentWorldVector3 }>[];
}>;

export type ForgeWorld = Readonly<{ document: AgentWorldDefinition; anchors: ForgeAnchors }>;

// ---------------------------------------------------------------------------
// Palette. Charcoal and black metal, patinated copper, cold cyan, a little amber.
// ---------------------------------------------------------------------------

const PALETTE = Object.freeze({
  charcoal: "#1a1d23",
  joint: "#0a0c10",
  iron: "#0f1116",
  copper: "#8a5a34",
  copperGlow: "#5a2c10",
  cyan: "#66dcff",
  cyanGlow: "#1a6f88",
  amber: "#ff9a4a",
  amberGlow: "#7a3a10",
});

// ---------------------------------------------------------------------------
// Dimensions. Kept as named numbers because the anchors and the test read them too.
// ---------------------------------------------------------------------------

const PLATEAU = 32;
const TILES_PER_SIDE = 10;
const TILE_PITCH = PLATEAU / TILES_PER_SIDE;
const TILE_GAP = 0.22;
const TILE_THICKNESS = 0.18;
const SOCKET_RADIUS = 1.7;
const SOCKET_HEIGHT = 0.9;
/** Gap between the socket crown and the bottom of the mask: it hangs, it does not sit. */
const MASK_HOVER = 1.15;
/** The mask's authored extent (`ANCHORS.height` in tools/llmx-face-sculptor.mjs; 2.254 measured at `high`). */
const MASK_HEIGHT = 2.3;
/** Eye height above the mask's origin, from the sculptor's anchors. */
const EYE_HEIGHT = 0.1;
const FACE_CENTER_Y = SOCKET_HEIGHT + MASK_HOVER + MASK_HEIGHT / 2;
const RIB_LENGTH = 11;
const SILHOUETTE_RADIUS = 14.5;

export function createForgeWorld(options: { id?: string; label?: string } = {}): ForgeWorld {
  const anchors = forgeAnchors();
  const entities: AgentWorldEntityDefinition[] = [
    ...lights(),
    ...floor(),
    ...ribs(anchors),
    ...socket(),
    faceAnchor(anchors),
    buildZone(anchors),
    ...silhouettes(),
    ...emitters(),
  ].map((entity) => ({ ...entity, tags: [LLMX_FORGE_TAG, ...(entity.tags ?? [])] }));

  const document: AgentWorldDefinition = {
    // Written as the literal rather than imported: this module is type-only over the runtime so
    // the unit test can load it under Node without Three.js. The type still pins the value.
    schema: "graphysx.agent-world/v2",
    id: options.id ?? LLMX_FORGE_TEMPLATE_ID,
    label: options.label ?? LLMX_FORGE_LABEL,
    environment: {
      background: "#05070b",
      // Stars on all six faces; `nightsky` carries a horizon silhouette that fights the arches.
      sky: "clearnight",
      // A night HDR at low strength so the black metal still has something to reflect. Kept
      // well under the key light so the mask's volumes come from the key, not the ambient.
      lighting: { source: "hdri", hdri: "vignaioli-night", intensity: 0.32, yawDegrees: 24, backgroundIntensity: 0.55, backgroundBlur: 0.12 },
      // The fog is the horizon: the silhouettes at 14–17 m sit in the band and read as depth.
      envelope: { fogNear: 16, fogFar: 46, cameraFar: 110 },
      post: { bloom: { strength: 0.45, radius: 0.35, threshold: 0.9 } },
      ground: { visible: false, size: PLATEAU, color: PALETTE.joint, grid: false, gridColor: PALETTE.joint },
    },
    entities,
  };
  return { document, anchors };
}

function forgeAnchors(): ForgeAnchors {
  const faceCenter: AgentWorldVector3 = [0, round(FACE_CENTER_Y), 0];
  const ribRuns = [
    { dx: 1, dz: 0 },
    { dx: -1, dz: 0 },
    { dx: 0, dz: 1 },
    { dx: 0, dz: -1 },
  ].map(({ dx, dz }) => ({
    from: [dx * (SOCKET_RADIUS + 0.2), TILE_THICKNESS, dz * (SOCKET_RADIUS + 0.2)] as AgentWorldVector3,
    to: [dx * (SOCKET_RADIUS + 0.2 + RIB_LENGTH), TILE_THICKNESS, dz * (SOCKET_RADIUS + 0.2 + RIB_LENGTH)] as AgentWorldVector3,
  }));
  const gazeTarget: AgentWorldVector3 = [0, round(FACE_CENTER_Y + EYE_HEIGHT), 0];
  return {
    faceCenter,
    faceHeight: MASK_HEIGHT,
    gazeTarget,
    socketTop: [0, SOCKET_HEIGHT, 0],
    // At the eyes' height, a little to the visitor's right and aimed at the eyes — aiming at
    // the group origin frames the nose. Close enough that the face fills roughly a third of the
    // frame height at 16:9: readable, not looming.
    cameraRest: { position: [1.4, round(FACE_CENTER_Y + EYE_HEIGHT - 0.05), 7.4], target: gazeTarget },
    cameraEntry: { position: [3.5, 8.5, 26], target: [0, 2.4, 0] },
    // Front-right of the socket from the visitor's side: in shot at rest, clear of the ribs.
    buildZone: { center: [4.6, TILE_THICKNESS, 3.4], radius: 2.6 },
    ribs: ribRuns,
  };
}

function lights(): AgentWorldEntityDefinition[] {
  return [
    // Low and blue-grey: the room is dark, and the ambient only keeps the shadow side of the
    // mask from going to pure black.
    { id: "forge-ambient", label: "Forge Ambient", type: "ambient-light", intensity: 0.28, material: { color: "#243040" }, tags: ["lighting"] },
    // The one shadow-casting light. Cold, oblique, from the visitor's upper left: it reveals
    // the brow, the nose blade and the cheekbones, which is what the sculpt was tuned for.
    { id: "forge-key", label: "Cold Key", type: "directional-light", intensity: 2.4, transform: { position: [-9, 13, 10] }, material: { color: "#b8d0ff" }, castShadow: true, tags: ["lighting"] },
    // Copper rim from behind and above the mask. No marker: the light, not the lightbulb.
    { id: "forge-rim", label: "Copper Rim", type: "point-light", intensity: 26, distance: 16, marker: false, transform: { position: [0, FACE_CENTER_Y + 1.4, -3.4] }, material: { color: PALETTE.amber, emissive: PALETTE.amber }, tags: ["lighting"] },
    // A faint cyan up-light from the crown, so the jaw is lit from below the way a forge lights
    // the smith. Short range: it must not reach the floor tiles.
    { id: "forge-crown-light", label: "Crown Up-light", type: "point-light", intensity: 5, distance: 7, marker: false, transform: { position: [0, SOCKET_HEIGHT + 0.35, 0.5] }, material: { color: PALETTE.cyan, emissive: PALETTE.cyan }, tags: ["lighting"] },
    // Two amber embers in the industrial stacks, purely for the horizon.
    { id: "forge-stack-ember-0", label: "Stack Ember", type: "point-light", intensity: 8, distance: 12, marker: false, transform: { position: [-12.5, 7.5, -11] }, material: { color: PALETTE.amber, emissive: PALETTE.amber }, tags: ["lighting"] },
    { id: "forge-stack-ember-1", label: "Stack Ember", type: "point-light", intensity: 8, distance: 12, marker: false, transform: { position: [13.5, 6.5, -9] }, material: { color: PALETTE.amber, emissive: PALETTE.amber }, tags: ["lighting"] },
  ];
}

function floor(): AgentWorldEntityDefinition[] {
  const plate: AgentWorldEntityDefinition = {
    id: "forge-plate",
    label: "Forge Plate",
    type: "box",
    transform: { position: [0, -0.3, 0] },
    geometry: { width: PLATEAU, height: 0.6, depth: PLATEAU },
    material: { color: PALETTE.joint, roughness: 0.9, metalness: 0.2 },
    // The single collider under the whole plateau.
    physics: { mode: "static", material: "ground" },
    castShadow: false,
    receiveShadow: true,
    tags: ["floor"],
  };
  const tiles: AgentWorldEntityDefinition[] = [];
  const half = (TILES_PER_SIDE - 1) / 2;
  for (let row = 0; row < TILES_PER_SIDE; row += 1) {
    for (let column = 0; column < TILES_PER_SIDE; column += 1) {
      const x = (column - half) * TILE_PITCH;
      const z = (row - half) * TILE_PITCH;
      // The four tiles around the origin are replaced by the socket's apron.
      if (Math.abs(x) < TILE_PITCH && Math.abs(z) < TILE_PITCH) continue;
      tiles.push({
        id: `forge-tile-${row}-${column}`,
        label: "Forge Tile",
        type: "box",
        transform: { position: [x, TILE_THICKNESS / 2, z] },
        geometry: { width: TILE_PITCH - TILE_GAP, height: TILE_THICKNESS, depth: TILE_PITCH - TILE_GAP },
        // Rough and only half metallic: at 0.62 metalness the tiles mirrored the night HDRI
        // and the whole floor came out flat blue-grey instead of charcoal.
        material: { color: "#15181d", roughness: 0.74, metalness: 0.38 },
        castShadow: false,
        receiveShadow: true,
        tags: ["floor", "tile"],
      });
    }
  }
  // A single dark apron where the four centre tiles were, so the socket has a base to sit on.
  const apron: AgentWorldEntityDefinition = {
    id: "forge-apron",
    label: "Socket Apron",
    type: "box",
    transform: { position: [0, TILE_THICKNESS / 2, 0] },
    geometry: { width: 2 * TILE_PITCH - TILE_GAP, height: TILE_THICKNESS, depth: 2 * TILE_PITCH - TILE_GAP },
    material: { color: PALETTE.iron, roughness: 0.5, metalness: 0.7 },
    castShadow: false,
    receiveShadow: true,
    tags: ["floor"],
  };
  return [plate, apron, ...tiles];
}

function ribs(anchors: ForgeAnchors): AgentWorldEntityDefinition[] {
  return anchors.ribs.map(({ from, to }, index) => {
    const alongX = from[0] !== to[0];
    const length = Math.abs(alongX ? to[0] - from[0] : to[2] - from[2]);
    const centre: AgentWorldVector3 = [(from[0] + to[0]) / 2, TILE_THICKNESS + 0.02, (from[2] + to[2]) / 2];
    return {
      id: `forge-rib-${index}`,
      label: "Copper Rib",
      type: "box",
      transform: { position: centre },
      geometry: { width: alongX ? length : 0.16, height: 0.05, depth: alongX ? 0.16 : length },
      // Emissive at rest is low: the presentation layer runs its own glow along the rib during
      // the entry; the document keeps the calm state.
      material: { color: PALETTE.copper, emissive: PALETTE.copperGlow, emissiveIntensity: 0.35, roughness: 0.35, metalness: 0.85 },
      castShadow: false,
      receiveShadow: false,
      tags: [LLMX_RIB_TAG],
    };
  });
}

function socket(): AgentWorldEntityDefinition[] {
  return [
    {
      id: "forge-socket",
      label: "Socket",
      type: "cylinder",
      transform: { position: [0, SOCKET_HEIGHT / 2, 0] },
      geometry: { radius: SOCKET_RADIUS, height: SOCKET_HEIGHT, radialSegments: 48 },
      material: { color: PALETTE.iron, roughness: 0.42, metalness: 0.8 },
      physics: { mode: "static" },
      castShadow: true,
      receiveShadow: true,
      tags: ["socket"],
    },
    {
      id: "forge-socket-rim",
      label: "Copper Rim",
      type: "torus",
      transform: { position: [0, SOCKET_HEIGHT + 0.02, 0], rotationDegrees: [90, 0, 0] },
      geometry: { radius: SOCKET_RADIUS - 0.08, tube: 0.09, radialSegments: 64 },
      material: { color: PALETTE.copper, emissive: PALETTE.copperGlow, emissiveIntensity: 0.4, roughness: 0.3, metalness: 0.9 },
      castShadow: false,
      receiveShadow: true,
      tags: ["socket"],
    },
    {
      // The energy crown: the one emissive that crosses the bloom threshold at rest. It spins
      // slowly so the scene is never perfectly still, even before the face arrives.
      id: "forge-crown",
      label: "Energy Crown",
      type: "torus",
      transform: { position: [0, SOCKET_HEIGHT + 0.12, 0], rotationDegrees: [90, 0, 0] },
      geometry: { radius: 0.95, tube: 0.045, radialSegments: 64 },
      // 1.7 pulled the eye to the ring before the face; 1.0 still crosses the bloom threshold
      // (0.9) for a soft halo and leaves the mask as the subject.
      material: { color: PALETTE.cyanGlow, emissive: PALETTE.cyan, emissiveIntensity: 1.0, roughness: 0.2, metalness: 0.4 },
      behaviors: [{ type: "spin", axis: "z", speedDegrees: 9 }],
      castShadow: false,
      receiveShadow: false,
      tags: ["socket", "energy"],
    },
  ];
}

function faceAnchor(anchors: ForgeAnchors): AgentWorldEntityDefinition {
  return {
    id: LLMX_FACE_ANCHOR_ID,
    label: "Face Anchor",
    type: "group",
    transform: { position: anchors.faceCenter },
    tags: ["llmx-face"],
  };
}

function buildZone(anchors: ForgeAnchors): AgentWorldEntityDefinition {
  const { center, radius } = anchors.buildZone;
  return {
    id: "forge-build-zone",
    label: "Build Zone",
    type: "torus",
    transform: { position: [center[0], center[1] + 0.03, center[2]], rotationDegrees: [90, 0, 0] },
    geometry: { radius, tube: 0.025, radialSegments: 64 },
    material: { color: PALETTE.cyan, emissive: PALETTE.cyanGlow, emissiveIntensity: 0.5, roughness: 0.4, metalness: 0.3, opacity: 0.85 },
    castShadow: false,
    receiveShadow: false,
    tags: ["build-zone"],
  };
}

/** Gothic arches and industrial stacks at the fog line. Silhouettes: one dark material, no shadows. */
function silhouettes(): AgentWorldEntityDefinition[] {
  const dark = { color: PALETTE.iron, roughness: 0.6, metalness: 0.6 };
  const entities: AgentWorldEntityDefinition[] = [];
  // Five arches on the far side and flanks; none behind the visitor, whose back is to the fog.
  const archAngles = [-150, -105, -75, -30, 30, 75, 105, 150];
  archAngles.forEach((degrees, index) => {
    const radians = (degrees * Math.PI) / 180;
    const cx = Math.sin(radians) * SILHOUETTE_RADIUS;
    const cz = -Math.cos(radians) * SILHOUETTE_RADIUS;
    // Arches face the socket: their span runs perpendicular to the radius.
    const yaw = -degrees;
    const span = 3.2;
    const pillarHeight = 7.5;
    const dx = Math.cos(radians) * (span / 2);
    const dz = Math.sin(radians) * (span / 2);
    entities.push(
      {
        id: `forge-arch-${index}-pillar-l`, label: "Arch Pillar", type: "box",
        transform: { position: [cx - dx, pillarHeight / 2, cz - dz], rotationDegrees: [0, yaw, 0] },
        geometry: { width: 0.9, height: pillarHeight, depth: 0.9 }, material: dark,
        castShadow: false, receiveShadow: false, tags: ["silhouette", "arch"],
      },
      {
        id: `forge-arch-${index}-pillar-r`, label: "Arch Pillar", type: "box",
        transform: { position: [cx + dx, pillarHeight / 2, cz + dz], rotationDegrees: [0, yaw, 0] },
        geometry: { width: 0.9, height: pillarHeight, depth: 0.9 }, material: dark,
        castShadow: false, receiveShadow: false, tags: ["silhouette", "arch"],
      },
      {
        // The round of the arch, standing upright and turned to face the socket.
        id: `forge-arch-${index}-round`, label: "Arch Round", type: "torus",
        transform: { position: [cx, pillarHeight, cz], rotationDegrees: [0, yaw, 0] },
        geometry: { radius: span / 2, tube: 0.42, radialSegments: 40 }, material: dark,
        castShadow: false, receiveShadow: false, tags: ["silhouette", "arch"],
      },
      {
        // A spire over the keystone: the pointed line that makes it gothic rather than roman.
        id: `forge-arch-${index}-spire`, label: "Arch Spire", type: "cone",
        transform: { position: [cx, pillarHeight + span / 2 + 1.6, cz] },
        geometry: { radius: 0.55, height: 3.4, radialSegments: 8 }, material: dark,
        castShadow: false, receiveShadow: false, tags: ["silhouette", "arch"],
      },
    );
  });
  // Industrial stacks beside the two ember lights, and one gantry beam across the back.
  entities.push(
    {
      id: "forge-stack-0", label: "Stack", type: "cylinder",
      transform: { position: [-12.5, 5.5, -11] }, geometry: { radius: 0.7, height: 11, radialSegments: 16 }, material: dark,
      castShadow: false, receiveShadow: false, tags: ["silhouette", "stack"],
    },
    {
      id: "forge-stack-1", label: "Stack", type: "cylinder",
      transform: { position: [13.5, 4.5, -9] }, geometry: { radius: 0.6, height: 9, radialSegments: 16 }, material: dark,
      castShadow: false, receiveShadow: false, tags: ["silhouette", "stack"],
    },
    {
      id: "forge-gantry", label: "Gantry Beam", type: "box",
      transform: { position: [0, 9.2, -16.5] }, geometry: { width: 20, height: 0.7, depth: 0.7 }, material: dark,
      castShadow: false, receiveShadow: false, tags: ["silhouette", "gantry"],
    },
  );
  return entities;
}

function emitters(): AgentWorldEntityDefinition[] {
  return [
    // Smoke belongs to the horizon, not the socket. Two socket-smoke attempts (in front, then
    // behind and smaller) both rose straight through the mask as pale blobs — the one thing the
    // ambience must never cover — so the "souffle distant" comes from the stacks in the fog.
    {
      id: "forge-stack-smoke-0", label: "Stack Smoke", type: "emitter",
      transform: { position: [-12.5, 11.2, -11] },
      emitter: { preset: "ember-smoke", rate: 5, maxParticles: 30, lifetimeSeconds: 7, speed: 0.5, sizeScale: 2.2, volumeScale: 2, direction: [0.3, 1, 0], spread: 0.7, seed: 11 },
      tags: ["ambience", "stack"],
    },
    {
      id: "forge-stack-smoke-1", label: "Stack Smoke", type: "emitter",
      transform: { position: [13.5, 9.2, -9] },
      emitter: { preset: "ember-smoke", rate: 4, maxParticles: 24, lifetimeSeconds: 7, speed: 0.45, sizeScale: 2, volumeScale: 2, direction: [-0.2, 1, 0], spread: 0.7, seed: 14 },
      tags: ["ambience", "stack"],
    },
    {
      // The crown's twinkle: sparse, cyan-tinted, slow.
      id: "forge-crown-sparks", label: "Crown Sparks", type: "emitter",
      transform: { position: [0, SOCKET_HEIGHT + 0.15, 0] },
      emitter: { preset: "energy-orb", rate: 14, maxParticles: 28, lifetimeSeconds: 1.4, speed: 0.6, sizeScale: 1.6, volumeScale: 1, color: PALETTE.cyan, seed: 12 },
      tags: ["ambience", "energy"],
    },
    {
      // A few slow motes drifting up the mask. Tinted copper so they sit with the rim light.
      id: "forge-motes", label: "Forge Motes", type: "emitter",
      transform: { position: [0, SOCKET_HEIGHT + 0.6, 0] },
      emitter: { preset: "plasma-trail", rate: 6, maxParticles: 36, lifetimeSeconds: 6, speed: 0.4, sizeScale: 0.9, volumeScale: 1, color: PALETTE.amber, direction: [0, 1, 0], spread: 0.6, seed: 13 },
      tags: ["ambience"],
    },
  ];
}

// ---------------------------------------------------------------------------
// Entry choreography (plan §6.1). Pure timeline; the host applies it per frame.
// ---------------------------------------------------------------------------

/** Indicative entry timeline. Visual only: it is never evidence that the engine or voice is ready. */
export const FORGE_INTRO = Object.freeze({
  /** Whole move, seconds. Reduced motion collapses it to a short arrival. */
  seconds: 7.5,
  reducedSeconds: 1.2,
  /** The floor circuit lights during the first two seconds. */
  circuit: { start: 0, end: 2 },
  /** Camera approach from `cameraEntry` to `cameraRest`. */
  approach: { start: 0.8, end: 6.2 },
  /** Bottom-up assembly of the mask. Ends before the camera settles so the eyes open on a still frame. */
  assembly: { start: 2, end: 6.4 },
  /** The eyes open and the gaze finds the camera. */
  wake: { start: 6.4, end: 7.5 },
});

export type ForgeIntroFrame = Readonly<{
  /** 0 → 1, the copper ribs lighting from the socket outward. */
  circuit: number;
  /** 0 → 1 along the approach; feed to an easing and lerp entry → rest. */
  approach: number;
  /** 0 → 1, the mask's `build` driver. */
  assembly: number;
  /** 0 → 1, lids opening and gaze arriving. */
  wake: number;
  /** True once every band has finished. */
  done: boolean;
}>;

/** Sample the intro at `t` seconds. `reducedMotion` compresses the whole timeline uniformly. */
export function forgeIntroAt(t: number, reducedMotion = false): ForgeIntroFrame {
  const scale = reducedMotion ? FORGE_INTRO.reducedSeconds / FORGE_INTRO.seconds : 1;
  const band = (range: { start: number; end: number }): number => {
    const start = range.start * scale;
    const end = range.end * scale;
    if (!Number.isFinite(t) || t <= start) return 0;
    if (t >= end) return 1;
    return (t - start) / (end - start);
  };
  const circuit = band(FORGE_INTRO.circuit);
  const approach = band(FORGE_INTRO.approach);
  const assembly = band(FORGE_INTRO.assembly);
  const wake = band(FORGE_INTRO.wake);
  return { circuit, approach, assembly, wake, done: t >= FORGE_INTRO.seconds * scale };
}

/** Cubic in-out, the same feel as the host's `focusMove`. */
export function easeInOut(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** Camera pose along the approach: entry → rest, eased. */
export function forgeCameraAt(anchors: ForgeAnchors, approach: number): { position: AgentWorldVector3; target: AgentWorldVector3 } {
  const k = easeInOut(approach);
  // The end points are returned exactly: a camera that "arrives" a float-epsilon off the rest
  // pose would never compare equal to it, and the ends are what callers key on.
  const lerp = (a: AgentWorldVector3, b: AgentWorldVector3): AgentWorldVector3 =>
    k <= 0 ? [...a] : k >= 1 ? [...b] : [
      a[0] + (b[0] - a[0]) * k,
      a[1] + (b[1] - a[1]) * k,
      a[2] + (b[2] - a[2]) * k,
    ];
  return {
    position: lerp(anchors.cameraEntry.position, anchors.cameraRest.position),
    target: lerp(anchors.cameraEntry.target, anchors.cameraRest.target),
  };
}

const round = (value: number): number => Number(value.toFixed(3));
